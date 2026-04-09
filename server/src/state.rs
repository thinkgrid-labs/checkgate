use crate::rate_limit::IpRateLimiter;
use axum::extract::FromRef;
use axum_extra::extract::cookie::Key;
use checkgate_core::store::FlagStore;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis_client: redis::Client,
    pub store: Arc<FlagStore>,
    /// Broadcast channel: the single Redis subscriber task sends flag update payloads
    /// here; each SSE handler subscribes instead of opening its own Redis connection.
    pub flag_tx: broadcast::Sender<String>,
    /// SDK key for bearer-token auth. `None` disables auth (dev mode only).
    pub sdk_key: Option<String>,
    /// Per-IP rate limiter applied to all API routes.
    pub rate_limiter: IpRateLimiter,
    /// Encryption key for `PrivateCookieJar`. Derived from `SESSION_SECRET` env var.
    pub session_key: Key,
}

/// Allows `PrivateCookieJar` extractors to pull the key out of `AppState` automatically.
impl FromRef<AppState> for Key {
    fn from_ref(state: &AppState) -> Self {
        state.session_key.clone()
    }
}
