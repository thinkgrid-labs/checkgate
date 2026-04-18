pub mod environments;
pub mod flags;
pub mod impressions;
pub mod keys;
pub mod session;
pub mod users;

use crate::state::AppState;
use axum::{
    Router,
    body::Body,
    http::{HeaderValue, Method, Request, StatusCode, header},
    middleware::Next,
    response::Response,
    routing::{get, post},
};
use tracing::warn;

/// Adds baseline security headers to every response.
///
/// - `X-Frame-Options: DENY` — prevents clickjacking via iframes.
/// - `X-Content-Type-Options: nosniff` — prevents MIME-sniffing attacks.
/// - `Referrer-Policy` — limits referrer leakage to same origin on cross-origin requests.
/// - `Permissions-Policy` — opts out of browser features the app doesn't use.
pub async fn security_headers(req: Request<Body>, next: Next) -> Response {
    let mut response = next.run(req).await;
    let headers = response.headers_mut();
    headers.insert(
        header::HeaderName::from_static("x-frame-options"),
        HeaderValue::from_static("DENY"),
    );
    headers.insert(
        header::HeaderName::from_static("x-content-type-options"),
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::HeaderName::from_static("referrer-policy"),
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        header::HeaderName::from_static("permissions-policy"),
        HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
    );
    response
}

/// CSRF defence-in-depth for the dashboard SPA.
///
/// Rejects mutating requests (POST, PUT, PATCH, DELETE) that lack the
/// `X-Checkgate-Request` header, UNLESS the request carries an explicit
/// `Authorization: Bearer` token — Bearer-authenticated calls can never be
/// CSRF'd because the attacker cannot obtain the SDK key from another origin.
pub async fn csrf_protection(req: Request<Body>, next: Next) -> Result<Response, StatusCode> {
    let method = req.method();
    let is_mutating = matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    );

    if is_mutating {
        let has_bearer = req
            .headers()
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("Bearer "));

        if !has_bearer && req.headers().get("X-Checkgate-Request").is_none() {
            warn!(
                method = %method,
                path = %req.uri().path(),
                "Rejected mutating request: missing X-Checkgate-Request header"
            );
            return Err(StatusCode::FORBIDDEN);
        }
    }

    Ok(next.run(req).await)
}

/// Read-only API routes — any authenticated user (admin or viewer).
pub fn read_router() -> Router<AppState> {
    flags::read_router()
        .merge(impressions::read_router())
        .merge(environments::read_router())
        .merge(keys::read_router())
        .merge(users::read_router())
}

/// SDK ingest routes — any authenticated client; not admin-gated.
/// Placed separately so they can carry a higher body-size limit.
pub fn ingest_router() -> Router<AppState> {
    impressions::ingest_router()
}

/// Write API routes — require admin role (layer added in main.rs).
pub fn write_router() -> Router<AppState> {
    flags::write_router()
        .merge(environments::write_router())
        .merge(keys::write_router())
        .merge(users::write_router())
}

/// Public auth routes — mounted under `/api/auth` WITHOUT auth middleware.
pub fn auth_router() -> Router<AppState> {
    Router::new()
        .route("/login", post(session::login))
        .route("/logout", post(session::logout))
        .route("/me", get(session::me))
        .route("/workspace", get(session::workspace_info))
}

/// Public setup routes — mounted under `/api` WITHOUT auth middleware.
pub fn setup_router() -> Router<AppState> {
    keys::setup_router().merge(session::setup_router())
}
