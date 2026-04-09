use axum::{Json, Router, extract::State, http::StatusCode, routing::post};
use axum_extra::extract::cookie::{Cookie, PrivateCookieJar, SameSite};
use constant_time_eq::constant_time_eq;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use time::Duration;
use tracing::{error, info, warn};

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

/// Shape returned by `/api/auth/login`, `/api/auth/me`, and `/api/setup/complete`.
#[derive(Serialize)]
pub struct UserInfo {
    pub email: String,
    pub name: String,
    pub role: String,
}

/// Body expected by `POST /api/auth/login`.
/// `name` and `role` are intentionally absent — they are looked up from the
/// server-side `users` table so the client cannot forge them.
#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub sdk_key: String,
}

/// Body for the first-run `POST /api/setup/complete`.
#[derive(Deserialize)]
pub struct SetupRequest {
    pub name: String,
    pub email: String,
    pub sdk_key: String,
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
    // Default true — operators must explicitly set COOKIE_SECURE=false for
    // local non-TLS development. Shipping with Secure=false in production
    // would expose sessions to interception.
    std::env::var("COOKIE_SECURE")
        .map(|v| !v.eq_ignore_ascii_case("false") && v != "0")
        .unwrap_or(true)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// Validate the SDK key, look up the user from the DB (name + role are NOT
/// accepted from the client), and issue an HttpOnly encrypted session cookie.
pub async fn login(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Json(req): Json<LoginRequest>,
) -> Result<(PrivateCookieJar, Json<UserInfo>), StatusCode> {
    let email = req.email.trim().to_lowercase();

    // Validate SDK key — empty sdk_key is always rejected.
    let valid = {
        let keys = state.sdk_keys.read().await;
        !keys.is_empty()
            && !req.sdk_key.is_empty()
            && keys
                .iter()
                .any(|e| constant_time_eq(req.sdk_key.as_bytes(), e.value.as_bytes()))
    };

    if !valid {
        warn!(email = %email, "Login rejected: invalid SDK key");
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Look up name and role from the DB — the client cannot supply these.
    let row = sqlx::query("SELECT name, role FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "DB error during login user lookup");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or_else(|| {
            warn!(email = %email, "Login rejected: no matching user account");
            StatusCode::UNAUTHORIZED
        })?;

    let name: String = row.get("name");
    let role: String = row.get("role");

    let session = SessionData {
        email: email.clone(),
        name: name.clone(),
        role: role.clone(),
    };
    let cookie_value =
        serde_json::to_string(&session).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    info!(email = %email, role = %role, "Session created");

    Ok((
        jar.add(build_session_cookie(cookie_value, cookie_secure())),
        Json(UserInfo { email, name, role }),
    ))
}

/// Clear the session cookie.
pub async fn logout(jar: PrivateCookieJar) -> (PrivateCookieJar, StatusCode) {
    let jar = jar.remove(Cookie::from("lg_session"));
    (jar, StatusCode::NO_CONTENT)
}

/// Return the current user from the session cookie.
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

/// First-run setup: creates the admin user in the DB and issues a session cookie.
///
/// Only available before setup is complete (`settings.setup_complete` not set).
/// Validates the SDK key, then atomically creates the admin user and marks
/// setup complete in a single transaction — no partial state possible.
pub async fn setup_complete(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Json(req): Json<SetupRequest>,
) -> Result<(PrivateCookieJar, Json<UserInfo>), StatusCode> {
    // Reject once setup is already done.
    let complete =
        sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'setup_complete'")
            .fetch_optional(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .map(|v| v == "true")
            .unwrap_or(false);

    if complete {
        return Err(StatusCode::NOT_FOUND);
    }

    let name = req.name.trim().to_string();
    let email = req.email.trim().to_lowercase();

    if name.is_empty() || email.is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    // Validate SDK key.
    let valid = {
        let keys = state.sdk_keys.read().await;
        !keys.is_empty()
            && !req.sdk_key.is_empty()
            && keys
                .iter()
                .any(|e| constant_time_eq(req.sdk_key.as_bytes(), e.value.as_bytes()))
    };

    if !valid {
        warn!("Setup rejected: invalid SDK key");
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Create admin user + mark setup complete atomically.
    let mut db_tx = state.db.begin().await.map_err(|e| {
        error!(error = %e, "Failed to begin setup transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    sqlx::query(
        "INSERT INTO users (name, email, role) VALUES ($1, $2, 'admin') \
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = 'admin'",
    )
    .bind(&name)
    .bind(&email)
    .execute(&mut *db_tx)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to create admin user during setup");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('setup_complete', 'true') \
         ON CONFLICT (key) DO UPDATE SET value = 'true'",
    )
    .execute(&mut *db_tx)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to mark setup complete");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    db_tx.commit().await.map_err(|e| {
        error!(error = %e, "Failed to commit setup transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!(email = %email, "Setup complete — admin user created");

    let session = SessionData {
        email: email.clone(),
        name: name.clone(),
        role: "admin".into(),
    };
    let cookie_value =
        serde_json::to_string(&session).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((
        jar.add(build_session_cookie(cookie_value, cookie_secure())),
        Json(UserInfo {
            email,
            name,
            role: "admin".into(),
        }),
    ))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/// Public setup route — no auth required.
pub fn setup_router() -> Router<AppState> {
    Router::new().route("/setup/complete", post(setup_complete))
}
