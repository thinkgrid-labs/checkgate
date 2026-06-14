use crate::state::{AppState, ConnectedClient};
use axum::{
    extract::{ConnectInfo, State},
    response::sse::{Event, KeepAlive, Sse},
};
use constant_time_eq::constant_time_eq;
use dashmap::DashMap;
use futures_util::stream::Stream;
use rand::RngExt as _;
use sqlx::Row;
use std::{convert::Infallible, net::SocketAddr, sync::Arc, time::Duration};
use tokio::sync::broadcast;
use tracing::{info, warn};

/// Resolved info about the authenticated SDK key.
struct SdkKeyInfo {
    environment_id: Option<String>,
    key_name: Option<String>,
}

fn resolve_sdk_key_info(
    req_query: &str,
    req_auth: Option<&str>,
    key_entries: &[crate::state::SdkKeyEntry],
) -> SdkKeyInfo {
    // Bearer header first.
    if let Some(bearer) = req_auth.and_then(|v| v.strip_prefix("Bearer "))
        && let Some(entry) = key_entries
            .iter()
            .find(|e| constant_time_eq(bearer.as_bytes(), e.value.as_bytes()))
    {
        return SdkKeyInfo {
            environment_id: entry.environment_id.clone(),
            key_name: Some(entry.name.clone()),
        };
    }
    // Query param fallback (browser EventSource).
    if let Some(key) = req_query
        .split('&')
        .find_map(|p| p.strip_prefix("sdk_key="))
        && let Some(entry) = key_entries
            .iter()
            .find(|e| constant_time_eq(key.as_bytes(), e.value.as_bytes()))
    {
        return SdkKeyInfo {
            environment_id: entry.environment_id.clone(),
            key_name: Some(entry.name.clone()),
        };
    }
    SdkKeyInfo {
        environment_id: None,
        key_name: None,
    }
}

/// Removes the client from the health dashboard tracking map when dropped.
struct ConnectionGuard {
    clients: Arc<DashMap<String, ConnectedClient>>,
    connection_id: String,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        self.clients.remove(&self.connection_id);
        info!(connection_id = %self.connection_id, "SSE client unregistered from health tracking");
    }
}

fn random_connection_id() -> String {
    let mut bytes = [0u8; 8];
    rand::rng().fill(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub async fn sse_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    req: axum::http::Request<axum::body::Body>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let client_ip = addr.ip();

    let query = req.uri().query().unwrap_or("").to_string();
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let sdk_info = {
        let keys = state.sdk_keys.read().await;
        resolve_sdk_key_info(&query, auth_header.as_deref(), &keys)
    };

    let environment_id = sdk_info.environment_id;
    let sdk_key_name = sdk_info.key_name;

    // Register this connection for the SDK health dashboard.
    let connection_id = random_connection_id();
    let connected_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    state.connected_clients.insert(
        connection_id.clone(),
        ConnectedClient {
            connection_id: connection_id.clone(),
            environment_id: environment_id.clone(),
            sdk_key_name: sdk_key_name.clone(),
            client_ip: client_ip.to_string(),
            connected_at,
        },
    );

    info!(
        client_ip = %client_ip,
        connection_id = %connection_id,
        environment_id = ?environment_id,
        sdk_key_name = ?sdk_key_name,
        "SSE client connected"
    );

    let mut rx = state.flag_tx.subscribe();
    let db = state.db.clone();
    let connected_clients = Arc::clone(&state.connected_clients);

    let stream = async_stream::stream! {
        // Guard ensures the client is removed when the stream drops (on disconnect or break).
        let _guard = ConnectionGuard { clients: connected_clients, connection_id: connection_id.clone() };

        yield Ok(Event::default().event("connected").data("true"));

        // Bootstrap: load flags for this environment from DB.
        // If no environment_id (session auth), send all flags from the in-memory store.
        let flag_count = if let Some(ref env_id) = environment_id {
            // Preload segments for this environment so we can expand inline.
            let segment_map = crate::api::segments::load_env_segments(env_id, &db)
                .await
                .unwrap_or_default();

            match sqlx::query(
                "SELECT data FROM flags WHERE environment_id = $1::uuid ORDER BY key ASC",
            )
            .bind(env_id)
            .fetch_all(&db)
            .await
            {
                Ok(rows) => {
                    let count = rows.len();
                    for row in rows {
                        if let Ok(v) = row.try_get::<serde_json::Value, _>("data") {
                            let expanded = if let Ok(flag) =
                                serde_json::from_value::<checkgate_core::evaluator::Flag>(v.clone())
                            {
                                let exp = crate::api::segments::expand_flag_with_segments(
                                    flag,
                                    &segment_map,
                                );
                                serde_json::to_value(&exp).unwrap_or(v)
                            } else {
                                v
                            };
                            let payload = serde_json::json!({
                                "type": "UPSERT",
                                "env_id": env_id,
                                "flag": expanded
                            })
                            .to_string();
                            yield Ok(Event::default().event("update").data(payload));
                        }
                    }
                    count
                }
                Err(e) => {
                    warn!(error = %e, "SSE bootstrap DB query failed");
                    0
                }
            }
        } else {
            // Session-auth fallback: send all flags from in-memory store.
            let flags = state.store.list_flags();
            let count = flags.len();
            for flag in flags {
                let payload = serde_json::json!({"type": "UPSERT", "flag": flag}).to_string();
                yield Ok(Event::default().event("update").data(payload));
            }
            count
        };

        info!(
            client_ip = %client_ip,
            flags_sent = flag_count,
            "SSE bootstrap complete"
        );

        // Stream live deltas, filtering by environment_id when present.
        loop {
            match rx.recv().await {
                Ok(payload) => {
                    let should_forward = match &environment_id {
                        None => true, // session auth — receive all
                        Some(env_id) => {
                            serde_json::from_str::<serde_json::Value>(&payload)
                                .ok()
                                .and_then(|v| v.get("env_id").and_then(|e| e.as_str()).map(|s| s == env_id))
                                .unwrap_or(false)
                        }
                    };
                    if should_forward {
                        yield Ok(Event::default().event("update").data(payload));
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    warn!(
                        client_ip = %client_ip,
                        missed_messages = n,
                        "SSE client lagged — closing connection to trigger reconnect"
                    );
                    break;
                }
                Err(broadcast::error::RecvError::Closed) => {
                    info!(client_ip = %client_ip, "SSE broadcast channel closed");
                    break;
                }
            }
        }

        info!(client_ip = %client_ip, "SSE client disconnected");
    };

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive-text"),
    )
}
