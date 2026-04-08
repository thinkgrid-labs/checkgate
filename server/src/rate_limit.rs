use axum::{
    extract::{ConnectInfo, State},
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use governor::{DefaultKeyedRateLimiter, Quota, RateLimiter};
use std::{net::IpAddr, num::NonZeroU32, sync::Arc};

pub type IpRateLimiter = Arc<DefaultKeyedRateLimiter<IpAddr>>;

/// 60 requests per minute per source IP on all API routes.
pub fn new_rate_limiter() -> IpRateLimiter {
    Arc::new(RateLimiter::keyed(Quota::per_minute(
        NonZeroU32::new(60).unwrap(),
    )))
}

pub async fn rate_limit(
    State(state): State<crate::state::AppState>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    match state.rate_limiter.check_key(&addr.ip()) {
        Ok(_) => Ok(next.run(req).await),
        Err(_) => {
            tracing::warn!(
                client_ip = %addr.ip(),
                path = %req.uri().path(),
                "Rate limit exceeded"
            );
            Err(StatusCode::TOO_MANY_REQUESTS)
        }
    }
}
