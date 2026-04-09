use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::cookie::{Cookie, PrivateCookieJar, SameSite};
use constant_time_eq::constant_time_eq;
use serde::{Deserialize, Serialize};
use time::Duration;
use tracing::{info, warn};

use crate::state::AppState;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/// Stored encrypted inside the `lg_session` cookie.
#[derive(Serialize, Deserialize)]
struct SessionData {
    email: String,
    name: String,
    role: String,
}

/// Shape returned by `/api/auth/login` and `/api/auth/me`.
#[derive(Serialize)]
pub struct UserInfo {
    pub email: String,
    pub name: String,
    pub role: String,
}

/// Body expected by `POST /api/auth/login`.
#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub sdk_key: String,
    pub name: String,
    pub role: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn build_session_cookie(value: String, secure: bool) -> Cookie<'static> {
    Cookie::build(("lg_session", value))
        .http_only(true)
        .same_site(SameSite::Strict)
        .secure(secure)
        .path("/")
        .max_age(Duration::days(7))
        .build()
}

fn cookie_secure() -> bool {
    std::env::var("COOKIE_SECURE")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// Validate the SDK key, then issue an HttpOnly encrypted session cookie.
///
/// The SDK key is validated server-side and **never** stored in the browser.
pub async fn login(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Json(req): Json<LoginRequest>,
) -> Result<(PrivateCookieJar, Json<UserInfo>), StatusCode> {
    // Validate SDK key against server configuration (constant-time compare).
    if let Some(ref expected) = state.sdk_key {
        if !constant_time_eq(req.sdk_key.as_bytes(), expected.as_bytes()) {
            warn!(email = %req.email, "Login rejected: invalid SDK key");
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    let session = SessionData {
        email: req.email.clone(),
        name: req.name.clone(),
        role: req.role.clone(),
    };

    let cookie_value =
        serde_json::to_string(&session).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    info!(email = %req.email, role = %req.role, "Session created");

    Ok((
        jar.add(build_session_cookie(cookie_value, cookie_secure())),
        Json(UserInfo {
            email: req.email,
            name: req.name,
            role: req.role,
        }),
    ))
}

/// Clear the session cookie.
pub async fn logout(jar: PrivateCookieJar) -> (PrivateCookieJar, StatusCode) {
    let jar = jar.remove(Cookie::from("lg_session"));
    (jar, StatusCode::NO_CONTENT)
}

/// Return the current user from the session cookie (used on page load to
/// restore the session without re-entering credentials).
pub async fn me(jar: PrivateCookieJar) -> Result<Json<UserInfo>, StatusCode> {
    let cookie = jar.get("lg_session").ok_or(StatusCode::UNAUTHORIZED)?;

    let session: SessionData =
        serde_json::from_str(cookie.value()).map_err(|_| StatusCode::UNAUTHORIZED)?;

    Ok(Json(UserInfo {
        email: session.email,
        name: session.name,
        role: session.role,
    }))
}
