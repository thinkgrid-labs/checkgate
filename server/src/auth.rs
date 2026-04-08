use crate::state::AppState;
use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use constant_time_eq::constant_time_eq;
use tracing::warn;

/// Validates the SDK key from either:
///   - `Authorization: Bearer <key>` header  (Node.js, Flutter, React Native — preferred)
///   - `?sdk_key=<key>` query parameter       (Browser EventSource — cannot set custom headers)
///
/// SECURITY: The `?sdk_key=` fallback exposes the key in URLs recorded by proxies and
/// access logs. In production, suppress `/stream?sdk_key=*` from log pipelines and
/// rotate the key regularly. Prefer the Authorization header wherever possible.
///
/// Key comparison uses constant-time equality to prevent timing-based brute-force.
///
/// If `SDK_KEY` is not set, auth is skipped (local dev only — always set in production).
pub async fn require_auth(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let Some(ref expected) = state.sdk_key else {
        return Ok(next.run(req).await);
    };

    let expected_bytes = expected.as_bytes();

    // Preferred: Authorization header (key not recorded in access logs)
    let header_key = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    if let Some(key) = header_key
        && constant_time_eq(key.as_bytes(), expected_bytes)
    {
        return Ok(next.run(req).await);
    }

    // Fallback: ?sdk_key= query param for browser EventSource (key appears in access logs)
    let query = req.uri().query().unwrap_or("");
    let query_key = query
        .split('&')
        .find_map(|pair| pair.strip_prefix("sdk_key="));

    if let Some(key) = query_key
        && constant_time_eq(key.as_bytes(), expected_bytes)
    {
        return Ok(next.run(req).await);
    }

    warn!(
        method = %req.method(),
        path = %req.uri().path(),
        "Rejected request: missing or invalid SDK key"
    );

    Err(StatusCode::UNAUTHORIZED)
}
