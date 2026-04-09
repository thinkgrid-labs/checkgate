pub mod flags;
pub mod session;

use crate::state::AppState;
use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode},
    middleware::Next,
    response::Response,
    routing::get,
    routing::post,
};
use tracing::warn;

/// CSRF protection middleware for SPAs.
///
/// It rejects ANY mutating request (POST, PUT, PATCH, DELETE) that does not
/// carry the `X-Checkgate-Request` header. Since cross-site requests cannot
/// set custom headers without a CORS preflight, this effectively blocks CSRF.
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
            "Rejected mutating request: missing X-Checkgate-Request header (CSRF protection)"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(req).await)
}

/// Protected flag management routes — mounted under `/api` with auth middleware.
pub use flags::router;

/// Public auth routes — mounted under `/api/auth` WITHOUT auth middleware.
pub fn auth_router() -> Router<AppState> {
    Router::new()
        .route("/login", post(session::login))
        .route("/logout", post(session::logout))
        .route("/me", get(session::me))
}

