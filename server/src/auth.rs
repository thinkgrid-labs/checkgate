use crate::state::AppState;
use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use axum_extra::extract::cookie::PrivateCookieJar;
use constant_time_eq::constant_time_eq;
use serde::Deserialize;
use tracing::warn;

/// Minimal view of the session cookie — only role is needed for middleware access checks.
#[derive(Deserialize)]
struct RoleClaims {
    role: String,
}

/// Full session claims — used by handlers that need the caller's email/role.
#[derive(Deserialize, Clone)]
pub(crate) struct SessionClaims {
    pub email: String,
    #[allow(dead_code)]
    pub name: String,
    pub role: String,
}

/// Extract session claims from the private cookie jar.
/// Returns `None` if the request used SDK key auth (no session cookie present).
pub(crate) fn get_session_claims(jar: &PrivateCookieJar) -> Option<SessionClaims> {
    jar.get("lg_session")
        .and_then(|c| serde_json::from_str::<SessionClaims>(c.value()).ok())
}

/// Validates a request using either:
///
/// 1. **Session cookie** (`lg_session`) — set by `POST /api/auth/login`.
///    Used by the dashboard SPA. The cookie is HttpOnly + encrypted.
///
/// 2. **Bearer token** (`Authorization: Bearer <key>`) — for SDK clients.
///
/// 3. **`?sdk_key=` query param** — fallback for browser `EventSource` which
///    cannot set custom headers. Exposes the key in access/proxy logs; only
///    use for SSE where headers cannot be set.
///
/// Returns 503 if no SDK keys are configured (should never happen in normal
/// operation — we always generate an initial key on first boot).
/// Returns 401 if credentials are absent or invalid.
pub async fn require_auth(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let key_values: Vec<String> = {
        let keys = state.sdk_keys.read().await;
        if keys.is_empty() {
            // No keys at all — deny every request rather than allowing an
            // open-door state. This should never occur in production.
            warn!("No SDK keys configured — all API requests denied");
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        keys.iter().map(|e| e.value.clone()).collect()
    };

    // ── 1. HttpOnly session cookie (dashboard) ────────────────────────────────
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

    if let Some(key) = header_key
        && key_values
            .iter()
            .any(|expected| constant_time_eq(key.as_bytes(), expected.as_bytes()))
    {
        return Ok(next.run(req).await);
    }

    // ── 3. ?sdk_key= query param (browser EventSource fallback) ──────────────
    let query = req.uri().query().unwrap_or("");
    let query_key = query
        .split('&')
        .find_map(|pair| pair.strip_prefix("sdk_key="));

    if let Some(key) = query_key
        && key_values
            .iter()
            .any(|expected| constant_time_eq(key.as_bytes(), expected.as_bytes()))
    {
        return Ok(next.run(req).await);
    }

    warn!(
        method = %req.method(),
        path = %req.uri().path(),
        "Rejected request: missing or invalid credentials"
    );

    Err(StatusCode::UNAUTHORIZED)
}

/// Requires admin-level access.
///
/// SDK key auth (Bearer / query param) is always treated as admin-equivalent —
/// these are machine credentials intentionally managed by an operator.
/// Session-based auth must have `role = "admin"` stored in the encrypted cookie
/// (populated from the DB at login time — the client cannot forge this).
///
/// This middleware should be layered *inside* `require_auth` so that unauthenticated
/// requests are already rejected before the role check runs.
pub async fn require_admin(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let key_values: Vec<String> = {
        let keys = state.sdk_keys.read().await;
        keys.iter().map(|e| e.value.clone()).collect()
    };

    // SDK key via Bearer header → admin.
    let header_key = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    if let Some(key) = header_key
        && key_values
            .iter()
            .any(|expected| constant_time_eq(key.as_bytes(), expected.as_bytes()))
    {
        return Ok(next.run(req).await);
    }

    // SDK key via query param → admin.
    let query = req.uri().query().unwrap_or("");
    if let Some(key) = query.split('&').find_map(|p| p.strip_prefix("sdk_key="))
        && key_values
            .iter()
            .any(|expected| constant_time_eq(key.as_bytes(), expected.as_bytes()))
    {
        return Ok(next.run(req).await);
    }

    // Session cookie: must carry role=admin (set from DB on login).
    let jar = PrivateCookieJar::from_headers(req.headers(), state.session_key.clone());
    if let Some(cookie) = jar.get("lg_session")
        && let Ok(claims) = serde_json::from_str::<RoleClaims>(cookie.value())
    {
        if claims.role == "admin" {
            return Ok(next.run(req).await);
        }
        warn!(
            method = %req.method(),
            path = %req.uri().path(),
            role = %claims.role,
            "Forbidden: admin role required"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    // Reached only if require_auth somehow didn't run first.
    Err(StatusCode::UNAUTHORIZED)
}

/// Requires editor-level access (admin or editor role).
///
/// SDK key auth is treated as admin-equivalent (machine credentials).
/// Session-based auth passes if `role` is `"admin"` or `"editor"`.
/// Viewers get 403. Use this middleware for flag write routes.
pub async fn require_editor(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let key_values: Vec<String> = {
        let keys = state.sdk_keys.read().await;
        keys.iter().map(|e| e.value.clone()).collect()
    };

    // SDK key via Bearer header → admin-equivalent.
    let header_key = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    if let Some(key) = header_key
        && key_values
            .iter()
            .any(|expected| constant_time_eq(key.as_bytes(), expected.as_bytes()))
    {
        return Ok(next.run(req).await);
    }

    // SDK key via query param → admin-equivalent.
    let query = req.uri().query().unwrap_or("");
    if let Some(key) = query.split('&').find_map(|p| p.strip_prefix("sdk_key="))
        && key_values
            .iter()
            .any(|expected| constant_time_eq(key.as_bytes(), expected.as_bytes()))
    {
        return Ok(next.run(req).await);
    }

    // Session cookie: admin or editor.
    let jar = PrivateCookieJar::from_headers(req.headers(), state.session_key.clone());
    if let Some(cookie) = jar.get("lg_session")
        && let Ok(claims) = serde_json::from_str::<RoleClaims>(cookie.value())
    {
        if claims.role == "admin" || claims.role == "editor" {
            return Ok(next.run(req).await);
        }
        warn!(
            method = %req.method(),
            path = %req.uri().path(),
            role = %claims.role,
            "Forbidden: editor or admin role required"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    Err(StatusCode::UNAUTHORIZED)
}
