use crate::state::AppState;
use axum::{
    extract::{ConnectInfo, State},
    response::sse::{Event, KeepAlive, Sse},
};
use constant_time_eq::constant_time_eq;
use futures_util::stream::Stream;
use sqlx::Row;
use std::{convert::Infallible, net::SocketAddr, time::Duration};
use tokio::sync::broadcast;
use tracing::{info, warn};

/// Resolve the sdk_key from the request to its environment_id.
/// Returns `None` if the request used session-cookie auth (dashboard debugging).
fn resolve_sdk_key_env(
    req_query: &str,
    req_auth: Option<&str>,
    key_entries: &[crate::state::SdkKeyEntry],
) -> Option<String> {
    // Bearer header first.
    if let Some(bearer) = req_auth.and_then(|v| v.strip_prefix("Bearer ")) {
        return key_entries
            .iter()
            .find(|e| constant_time_eq(bearer.as_bytes(), e.value.as_bytes()))
            .map(|e| e.environment_id.clone());
    }
    // Query param fallback (browser EventSource).
    if let Some(key) = req_query
        .split('&')
        .find_map(|p| p.strip_prefix("sdk_key="))
    {
        return key_entries
            .iter()
            .find(|e| constant_time_eq(key.as_bytes(), e.value.as_bytes()))
            .map(|e| e.environment_id.clone());
    }
    None
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

    let environment_id = {
        let keys = state.sdk_keys.read().await;
        resolve_sdk_key_env(&query, auth_header.as_deref(), &keys)
    };

    info!(
        client_ip = %client_ip,
        environment_id = ?environment_id,
        "SSE client connected"
    );

    let mut rx = state.flag_tx.subscribe();
    let db = state.db.clone();

    let stream = async_stream::stream! {
        yield Ok(Event::default().event("connected").data("true"));

        // Bootstrap: load flags for this environment from DB.
        // If no environment_id (session auth), send all flags from the in-memory store.
        let flag_count = if let Some(ref env_id) = environment_id {
            match sqlx::query("SELECT data FROM flags WHERE environment_id = $1::uuid ORDER BY key ASC")
                .bind(env_id)
                .fetch_all(&db)
                .await
            {
                Ok(rows) => {
                    let count = rows.len();
                    for row in rows {
                        if let Ok(v) = row.try_get::<serde_json::Value, _>("data") {
                            let payload = serde_json::json!({"type": "UPSERT", "env_id": env_id, "flag": v}).to_string();
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
                            // Only forward events that belong to this environment.
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
