pub mod flags;
pub mod keys;
pub mod session;
pub mod users;

use crate::state::AppState;
use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode},
    middleware::Next,
    response::Response,
    routing::{get, post},
};
use tracing::warn;

/// CSRF defence-in-depth for the dashboard SPA.
///
/// Rejects mutating requests (POST, PUT, PATCH, DELETE) that lack the
/// `X-Checkgate-Request` header.
///
/// **How this actually works**: the primary CSRF protection is `SameSite=Strict`
/// on the session cookie — browsers will not include it on cross-origin requests.
/// The custom-header check adds a second layer: because CORS only allows
/// `Authorization` and `Content-Type` for cross-origin requests (see main.rs),
/// external sites cannot include `X-Checkgate-Request` without a preflight that
/// the server would reject. The header is therefore unforgeable from a third-party
/// origin, blocking CSRF even for SDK-key-authenticated cross-origin clients.
pub async fn csrf_protection(req: Request<Body>, next: Next) -> Result<Response, StatusCode> {
    let method = req.method();
    let is_mutating = matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    );

    if is_mutating && req.headers().get("X-Checkgate-Request").is_none() {
        warn!(
            method = %method,
            path = %req.uri().path(),
            "Rejected mutating request: missing X-Checkgate-Request header"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(req).await)
}

/// Read-only API routes — any authenticated user (admin or viewer).
pub fn read_router() -> Router<AppState> {
    flags::read_router()
        .merge(keys::read_router())
        .merge(users::read_router())
}

/// Write API routes — require admin role (layer added in main.rs).
pub fn write_router() -> Router<AppState> {
    flags::write_router()
        .merge(keys::write_router())
        .merge(users::write_router())
}

/// Public auth routes — mounted under `/api/auth` WITHOUT auth middleware.
pub fn auth_router() -> Router<AppState> {
    Router::new()
        .route("/login", post(session::login))
        .route("/logout", post(session::logout))
        .route("/me", get(session::me))
}

/// Public setup routes — mounted under `/api` WITHOUT auth middleware.
pub fn setup_router() -> Router<AppState> {
    keys::setup_router().merge(session::setup_router())
}
