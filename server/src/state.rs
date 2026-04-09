use crate::rate_limit::IpRateLimiter;
use axum::extract::FromRef;
use axum_extra::extract::cookie::Key;
use checkgate_core::store::FlagStore;
use redis::aio::MultiplexedConnection;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};

/// A single SDK key row loaded from the database.
#[derive(Clone, Debug)]
pub struct SdkKeyEntry {
    pub id: i64,
    pub name: String,
    pub value: String,
}

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis_client: redis::Client,
    /// Shared multiplexed Redis connection for pub/sub publishes.
    /// MultiplexedConnection is Clone and cheap to share across handlers.
    pub redis_conn: MultiplexedConnection,
    pub store: Arc<FlagStore>,
    /// Broadcast channel: the Redis subscriber pushes payloads here;
    /// each SSE handler subscribes instead of opening its own Redis connection.
    pub flag_tx: broadcast::Sender<String>,
    /// In-memory cache of valid SDK keys loaded from the `sdk_keys` table.
    /// Auth checks against this; CRUD operations update both DB and this cache.
    pub sdk_keys: Arc<RwLock<Vec<SdkKeyEntry>>>,
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
