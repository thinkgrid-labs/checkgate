use crate::state::AppState;
use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use axum_extra::extract::cookie::PrivateCookieJar;
use constant_time_eq::constant_time_eq;
use tracing::warn;

/// Validates a request using **either** of two mechanisms:
///
/// 1. **Session cookie** (`lg_session`) — set by `POST /api/auth/login`.
///    Used by the dashboard SPA. The cookie is HttpOnly + encrypted, so the SDK
///    key is never exposed to JavaScript.
///
/// 2. **Bearer token** (`Authorization: Bearer <key>`) — for SDK clients
///    (Node.js, Flutter, React Native, …) that cannot use cookies.
///
/// 3. **`?sdk_key=` query param** — fallback for browser `EventSource` which
///    cannot set custom headers. Exposes the key in access logs; prefer cookies
///    for dashboard usage.
///
/// If `SDK_KEY` is not set, auth is skipped (local dev only).
pub async fn require_auth(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let Some(ref expected) = state.sdk_key else {
        return Ok(next.run(req).await);
    };

    let expected_bytes = expected.as_bytes();

    // ── 1. HttpOnly session cookie (dashboard) ────────────────────────────────
    //
    // `PrivateCookieJar::from_headers` decrypts and authenticates the cookie using
    // the server-side session key. A valid decrypted cookie is proof of a prior
    // successful login with the correct SDK key.
    let jar = PrivateCookieJar::from_headers(req.headers(), state.session_key.clone());
    if jar.get("lg_session").is_some() {
        return Ok(next.run(req).await);
    }

    // ── 2. Authorization: Bearer <key> (SDK clients) ──────────────────────────
    let header_key = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    if let Some(key) = header_key {
        if constant_time_eq(key.as_bytes(), expected_bytes) {
            return Ok(next.run(req).await);
        }
    }

    // ── 3. ?sdk_key= query param (browser EventSource fallback) ──────────────
    let query = req.uri().query().unwrap_or("");
    let query_key = query
        .split('&')
        .find_map(|pair| pair.strip_prefix("sdk_key="));

    if let Some(key) = query_key {
        if constant_time_eq(key.as_bytes(), expected_bytes) {
            return Ok(next.run(req).await);
        }
    }

    warn!(
        method = %req.method(),
        path = %req.uri().path(),
        "Rejected request: missing or invalid credentials"
    );

    Err(StatusCode::UNAUTHORIZED)
}
