pub mod flags;
pub mod session;

use axum::{Router, routing::get, routing::post};
use crate::state::AppState;

/// Protected flag management routes — mounted under `/api` with auth middleware.
pub use flags::router;

/// Public auth routes — mounted under `/api/auth` WITHOUT auth middleware.
pub fn auth_router() -> Router<AppState> {
    Router::new()
        .route("/login", post(session::login))
        .route("/logout", post(session::logout))
        .route("/me", get(session::me))
}
