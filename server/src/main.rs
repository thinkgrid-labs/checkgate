mod api;
mod auth;
mod rate_limit;
mod state;
mod stream;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{Method, header},
    middleware,
    routing::get,
};
use axum_extra::extract::cookie::Key;
use checkgate_core::evaluator::Flag;
use checkgate_core::store::FlagStore;
use rand::RngCore;
use rate_limit::new_rate_limiter;
use sqlx::{Row, postgres::PgPoolOptions};
use state::SdkKeyEntry;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{RwLock, broadcast};
use tokio_stream::StreamExt;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::{DefaultMakeSpan, DefaultOnFailure, DefaultOnResponse, TraceLayer};
use tracing::{Level, error, info, warn};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_current_span(true)
                .with_span_list(false)
                .with_target(true),
        )
        .init();

    info!(
        version = env!("CARGO_PKG_VERSION"),
        "Starting Checkgate Control Plane"
    );

    // ── PostgreSQL ────────────────────────────────────────────────────────────

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://checkgate:password@localhost/checkgate".to_string());

    let max_conns = std::env::var("DB_MAX_CONNECTIONS")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(10);

    info!(max_connections = max_conns, "Connecting to PostgreSQL");

    let db = PgPoolOptions::new()
        .max_connections(max_conns)
        .connect(&db_url)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to connect to PostgreSQL");
            e
        })?;

    info!("PostgreSQL connection established");

    sqlx::migrate!().run(&db).await.map_err(|e| {
        error!(error = %e, "Failed to run database migrations");
        e
    })?;

    info!("Migrations complete — schema ready");

    // ── Redis ─────────────────────────────────────────────────────────────────

    let redis_url =
        std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());

    info!("Connecting to Redis");

    let redis_client = redis::Client::open(redis_url).map_err(|e| {
        error!(error = %e, "Invalid Redis URL");
        e
    })?;

    // Shared multiplexed connection used for pub/sub publishes from handlers.
    // MultiplexedConnection is Clone — each handler clones it cheaply.
    let redis_conn = redis_client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to connect to Redis");
            e
        })?;

    info!("Redis connection established");

    // ── SDK keys (DB-backed) ──────────────────────────────────────────────────

    let rows = sqlx::query("SELECT id, name, value FROM sdk_keys ORDER BY id ASC")
        .fetch_all(&db)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to load SDK keys");
            e
        })?;

    let mut sdk_keys_data: Vec<SdkKeyEntry> = rows
        .iter()
        .map(|r| SdkKeyEntry {
            id: r.get("id"),
            name: r.get("name"),
            value: r.get("value"),
        })
        .collect();

    if sdk_keys_data.is_empty() {
        let mut bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut bytes);
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        let key_value = format!("sk_live_{hex}");

        let row = sqlx::query(
            "INSERT INTO sdk_keys (name, value) VALUES ('Default', $1) RETURNING id, name, value",
        )
        .bind(&key_value)
        .fetch_one(&db)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to insert initial SDK key");
            e
        })?;

        info!("Generated initial SDK key — open the dashboard to complete setup");
        sdk_keys_data.push(SdkKeyEntry {
            id: row.get("id"),
            name: row.get("name"),
            value: row.get("value"),
        });
    } else {
        info!(count = sdk_keys_data.len(), "SDK keys loaded from database");
    }

    // Legacy: SDK_KEY env var accepted as an extra in-memory key.
    if let Ok(env_key) = std::env::var("SDK_KEY")
        && !env_key.is_empty()
        && !sdk_keys_data.iter().any(|e| e.value == env_key)
    {
        warn!(
            "SDK_KEY env var detected — accepting it as a valid key. Consider migrating to DB-managed keys via the Settings page."
        );
        sdk_keys_data.push(SdkKeyEntry {
            id: -1,
            name: "env:SDK_KEY".into(),
            value: env_key,
        });
    }

    let sdk_keys = Arc::new(RwLock::new(sdk_keys_data));

    // ── Session key ───────────────────────────────────────────────────────────

    const DEV_SESSION_KEY: &str = "INSECURE_DEFAULT_DEV_KEY_CHANGE_IN_PRODUCTION_SIDEKICK";

    let session_key = match std::env::var("SESSION_SECRET") {
        Ok(ref s) if s.len() >= 32 => {
            info!("SESSION_SECRET configured — session cookies are cryptographically secure");
            Key::derive_from(s.as_bytes())
        }
        Ok(ref s) if !s.is_empty() => {
            warn!(
                "SESSION_SECRET is shorter than 32 chars; consider a longer secret for production"
            );
            Key::derive_from(s.as_bytes())
        }
        _ => {
            warn!(
                "SESSION_SECRET not set — using insecure dev key; \
                 set SESSION_SECRET to a random ≥32-char string in production"
            );
            Key::derive_from(DEV_SESSION_KEY.as_bytes())
        }
    };

    // ── Broadcast channel ─────────────────────────────────────────────────────

    let (flag_tx, _) = broadcast::channel::<String>(256);

    // ── Bootstrap flag store from Postgres ────────────────────────────────────

    let store = Arc::new(FlagStore::new());

    let records = sqlx::query("SELECT data FROM flags")
        .fetch_all(&db)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to load flags from PostgreSQL on startup");
            e
        })?;

    let total_rows = records.len();
    let mut loaded = 0usize;
    let mut skipped = 0usize;

    for rec in records {
        match rec.try_get::<serde_json::Value, _>("data") {
            Err(e) => {
                error!(error = %e, "Failed to read 'data' column from flags row");
                skipped += 1;
            }
            Ok(data) => match serde_json::from_value::<Flag>(data) {
                Ok(flag) => {
                    store.upsert_flag(flag);
                    loaded += 1;
                }
                Err(e) => {
                    warn!(error = %e, "Skipping malformed flag row — schema may be out of sync");
                    skipped += 1;
                }
            },
        }
    }

    info!(
        total_rows,
        loaded, skipped, "Flag store initialised from PostgreSQL"
    );

    // ── Redis pub/sub subscriber ───────────────────────────────────────────────

    {
        let redis_sub = redis_client.clone();
        let tx = flag_tx.clone();
        let store_ref = Arc::clone(&store);

        tokio::spawn(async move {
            loop {
                let mut con = match redis_sub.get_async_pubsub().await {
                    Ok(c) => c,
                    Err(e) => {
                        error!(error = %e, "Redis subscriber: connection failed — retrying in 2s");
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                };

                if let Err(e) = con.subscribe("checkgate_updates").await {
                    error!(error = %e, "Redis subscriber: subscribe failed — retrying in 2s");
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }

                info!("Redis subscriber: listening on channel 'checkgate_updates'");

                let mut msg_stream = con.into_on_message();

                while let Some(msg) = msg_stream.next().await {
                    let payload = match msg.get_payload::<String>() {
                        Ok(p) => p,
                        Err(e) => {
                            warn!(error = %e, "Redis subscriber: failed to decode message payload");
                            continue;
                        }
                    };

                    match serde_json::from_str::<serde_json::Value>(&payload) {
                        Err(e) => {
                            warn!(error = %e, "Redis subscriber: received non-JSON payload");
                        }
                        Ok(event) => match event.get("type").and_then(|t| t.as_str()) {
                            Some("UPSERT") => {
                                match event
                                    .get("flag")
                                    .and_then(|f| serde_json::from_value::<Flag>(f.clone()).ok())
                                {
                                    Some(flag) => {
                                        info!(flag_key = %flag.key, "Redis: applying remote UPSERT");
                                        store_ref.upsert_flag(flag);
                                    }
                                    None => {
                                        warn!(
                                            "Redis subscriber: UPSERT event missing valid 'flag' field"
                                        );
                                    }
                                }
                            }
                            Some("DELETE") => match event.get("key").and_then(|k| k.as_str()) {
                                Some(key) => {
                                    info!(flag_key = key, "Redis: applying remote DELETE");
                                    store_ref.delete_flag(key);
                                }
                                None => {
                                    warn!("Redis subscriber: DELETE event missing 'key' field");
                                }
                            },
                            other => {
                                warn!(event_type = ?other, "Redis subscriber: unknown event type");
                            }
                        },
                    }

                    if tx.receiver_count() > 0
                        && let Err(e) = tx.send(payload)
                    {
                        warn!(error = %e, "Broadcast send failed — no active SSE receivers");
                    }
                }

                warn!("Redis subscriber: connection dropped — reconnecting");
            }
        });
    }

    // ── App state ─────────────────────────────────────────────────────────────

    let app_state = state::AppState {
        db,
        redis_client,
        redis_conn,
        store,
        flag_tx,
        sdk_keys,
        rate_limiter: new_rate_limiter(),
        session_key,
    };

    // ── Middleware stack ───────────────────────────────────────────────────────

    // CORS: restrict allowed request headers to what SDK clients actually need.
    // By NOT listing X-Checkgate-Request here, cross-origin requests cannot include
    // it (the browser will block the preflight), making the CSRF header check
    // effective against third-party origins.
    let cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        .allow_origin(tower_http::cors::Any);

    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO))
        .on_failure(DefaultOnFailure::new().level(Level::ERROR));

    let public_dir = std::env::var("PUBLIC_DIR").unwrap_or_else(|_| "public".to_string());
    let serve_dashboard =
        ServeDir::new(&public_dir).fallback(ServeFile::new(format!("{public_dir}/index.html")));

    // ── Routing ───────────────────────────────────────────────────────────────
    //
    // Public: /api/auth/* and /api/setup/* — no auth middleware.
    // Protected read: any valid auth (session or SDK key).
    // Protected write: additionally requires admin role.
    //
    // Layer execution order for a write request (outermost → innermost):
    //   cors → rate_limit → csrf → require_auth → require_admin → handler

    let auth_routes = api::auth_router();
    let setup_routes = api::setup_router();

    // Write routes wrapped with require_admin (runs after require_auth).
    let write_api = api::write_router().layer(middleware::from_fn_with_state(
        app_state.clone(),
        auth::require_admin,
    ));

    // All API routes: reads + writes, body limit applied to both.
    let api_routes = api::read_router()
        .merge(write_api)
        .layer(DefaultBodyLimit::max(65_536));

    let protected = Router::new()
        .nest("/api", api_routes)
        .route("/stream", get(stream::sse_handler))
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth::require_auth,
        ));

    let app = Router::new()
        .nest("/api/auth", auth_routes)
        .nest("/api", setup_routes)
        .merge(protected)
        .layer(trace_layer)
        .layer(middleware::from_fn(api::csrf_protection))
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            rate_limit::rate_limit,
        ))
        .layer(cors)
        .fallback_service(serve_dashboard)
        .with_state(app_state);

    // ── Listen ────────────────────────────────────────────────────────────────

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let bind_addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| {
            error!(error = %e, bind_addr, "Failed to bind TCP listener");
            e
        })?;

    info!(addr = %listener.local_addr()?, "Server listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    info!("Server shut down gracefully");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { info!("Received Ctrl+C — initiating graceful shutdown"); },
        _ = terminate => { info!("Received SIGTERM — initiating graceful shutdown"); },
    }
}
