mod api;
mod auth;
mod rate_limit;
mod state;
mod stream;

use axum::{Router, extract::DefaultBodyLimit, http::Method, middleware, routing::get};
use axum_extra::extract::cookie::Key;
use rate_limit::new_rate_limiter;
use launchgate_core::evaluator::Flag;
use launchgate_core::store::FlagStore;
use sqlx::{Row, postgres::PgPoolOptions};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::{DefaultMakeSpan, DefaultOnFailure, DefaultOnResponse, TraceLayer};
use tracing::{Level, error, info, warn};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // JSON structured logging — parseable by Docker log drivers, CloudWatch, Loki, Datadog, etc.
    // Control verbosity with RUST_LOG env var (default: info).
    // Example: RUST_LOG=launchgate=debug,tower_http=debug
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
        "Starting Launchgate Control Plane"
    );

    // ── PostgreSQL ────────────────────────────────────────────────────────────

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://launchgate:password@localhost/launchgate".to_string());

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

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS flags (
            key VARCHAR(255) PRIMARY KEY,
            data JSONB NOT NULL
        );
        "#,
    )
    .execute(&db)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to run schema migration");
        e
    })?;

    info!("Schema ready");

    // ── Redis ─────────────────────────────────────────────────────────────────

    let redis_url =
        std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());

    info!("Connecting to Redis");

    let redis_client = redis::Client::open(redis_url).map_err(|e| {
        error!(error = %e, "Invalid Redis URL");
        e
    })?;

    redis_client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to connect to Redis");
            e
        })?;

    info!("Redis connection established");

    // ── SDK key ───────────────────────────────────────────────────────────────

    let sdk_key = match std::env::var("SDK_KEY") {
        Ok(k) if !k.is_empty() => {
            info!("SDK_KEY configured — authentication enabled");
            Some(k)
        }
        _ => {
            warn!("SDK_KEY not set — authentication disabled; do not use in production");
            None
        }
    };

    // ── Session key ───────────────────────────────────────────────────────────
    //
    // Used to encrypt/authenticate `sk_session` HttpOnly cookies via
    // `axum_extra::extract::cookie::PrivateCookieJar`.
    //
    // Set `SESSION_SECRET` to a random string of ≥ 32 characters in production.
    // Without it, a hard-coded dev key is used — sessions survive restarts but
    // are predictable; **never** ship without setting this in production.

    const DEV_SESSION_KEY: &str = "INSECURE_DEFAULT_DEV_KEY_CHANGE_IN_PRODUCTION_SIDEKICK";

    let session_key = match std::env::var("SESSION_SECRET") {
        Ok(ref s) if s.len() >= 32 => {
            info!("SESSION_SECRET configured — session cookies are cryptographically secure");
            Key::derive_from(s.as_bytes())
        }
        Ok(ref s) if !s.is_empty() => {
            warn!("SESSION_SECRET is shorter than 32 chars; consider a longer secret for production");
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

    // A single Redis subscriber pushes payloads here; SSE handlers subscribe
    // instead of each opening their own Redis connection.
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

                if let Err(e) = con.subscribe("launchgate_updates").await {
                    error!(error = %e, "Redis subscriber: subscribe failed — retrying in 2s");
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }

                info!("Redis subscriber: listening on channel 'launchgate_updates'");

                let mut msg_stream = con.into_on_message();

                while let Some(msg) = msg_stream.next().await {
                    let payload = match msg.get_payload::<String>() {
                        Ok(p) => p,
                        Err(e) => {
                            warn!(error = %e, "Redis subscriber: failed to decode message payload");
                            continue;
                        }
                    };

                    // Apply the change to the local store so this instance stays
                    // in sync with writes made by peer instances.
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

                    // Forward raw payload to all connected SSE handlers.
                    if tx.receiver_count() > 0 && let Err(e) = tx.send(payload) {
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
        store,
        flag_tx,
        sdk_key,
        rate_limiter: new_rate_limiter(),
        session_key,
    };

    // ── Middleware stack ───────────────────────────────────────────────────────

    let cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any)
        .allow_origin(Any);

    // TraceLayer emits a structured JSON log line for every request:
    // method, URI, status code, and latency — readable by any Docker log driver.
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO))
        .on_failure(DefaultOnFailure::new().level(Level::ERROR));

    let public_dir = std::env::var("PUBLIC_DIR").unwrap_or_else(|_| "public".to_string());
    let serve_dashboard =
        ServeDir::new(&public_dir).fallback(ServeFile::new(format!("{public_dir}/index.html")));

    // ── Routing ───────────────────────────────────────────────────────────────
    //
    // Auth routes (/api/auth/*) are public — no auth middleware, no body limit.
    // All other API routes and the SSE stream are protected by require_auth.
    //
    // Layer order (innermost → outermost): trace → rate_limit → auth/public → cors
    // Requests are processed outermost first.

    // Public: login / logout / me — must not require auth to reach them.
    let auth_routes = api::auth_router();

    // Protected: flag management + SSE stream.
    let protected = Router::new()
        .nest("/api", api::router().layer(DefaultBodyLimit::max(65_536)))
        .route("/stream", get(stream::sse_handler))
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth::require_auth,
        ));

    let app = Router::new()
        .nest("/api/auth", auth_routes)
        .merge(protected)
        .layer(trace_layer)
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
