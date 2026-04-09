use crate::state::{AppState, SdkKeyEntry};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
};
use axum_extra::extract::cookie::PrivateCookieJar;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Safe to return in list responses — does NOT include the key value.
#[derive(Serialize)]
pub struct SdkKeyInfo {
    pub id: i64,
    pub name: String,
    /// First 16 chars of the key + "…" — safe to display.
    pub prefix: String,
    /// ISO-8601 string.
    pub created_at: String,
}

/// Returned only once: when the key is first created or during initial setup.
#[derive(Serialize)]
pub struct NewKeyResponse {
    pub id: i64,
    pub name: String,
    /// Full key value — shown only once, never again.
    pub key: String,
    pub prefix: String,
    /// ISO-8601 string.
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateKeyRequest {
    pub name: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub(crate) fn generate_sdk_key() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!("sk_live_{hex}")
}

fn prefix_of(key: &str) -> String {
    format!("{}…", key.chars().take(16).collect::<String>())
}

// ---------------------------------------------------------------------------
// Public setup route — no auth required
// ---------------------------------------------------------------------------

/// Returns the auto-generated initial SDK key.
///
/// Only works before setup is complete (`settings.setup_complete` not set).
/// Once the first login happens, this endpoint returns 404.
pub async fn get_setup_key(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
) -> Result<Json<NewKeyResponse>, StatusCode> {
    // Already logged in — setup is done, don't expose the key.
    if jar.get("lg_session").is_some() {
        return Err(StatusCode::NOT_FOUND);
    }

    // Check if setup has been completed.
    let complete = sqlx::query("SELECT value FROM settings WHERE key = 'setup_complete'")
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(|row| row.get::<String, _>("value") == "true")
        .unwrap_or(false);

    if complete {
        return Err(StatusCode::NOT_FOUND);
    }

    // Return the first (auto-generated) key.
    let row =
        sqlx::query("SELECT id, name, value, created_at FROM sdk_keys ORDER BY id ASC LIMIT 1")
            .fetch_optional(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;

    let value: String = row.get("value");
    let prefix = prefix_of(&value);
    let created_at: time::OffsetDateTime = row.get("created_at");

    Ok(Json(NewKeyResponse {
        id: row.get("id"),
        name: row.get("name"),
        key: value,
        prefix,
        created_at: created_at.to_string(),
    }))
}

// ---------------------------------------------------------------------------
// Protected routes — require auth
// ---------------------------------------------------------------------------

pub async fn list_keys(State(state): State<AppState>) -> Result<Json<Vec<SdkKeyInfo>>, StatusCode> {
    let rows =
        sqlx::query("SELECT id, name, value, created_at FROM sdk_keys ORDER BY created_at ASC")
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                error!(error = %e, "Failed to list SDK keys");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let keys = rows
        .iter()
        .map(|row| {
            let value: String = row.get("value");
            let created_at: time::OffsetDateTime = row.get("created_at");
            SdkKeyInfo {
                id: row.get("id"),
                name: row.get("name"),
                prefix: prefix_of(&value),
                created_at: created_at.to_string(),
            }
        })
        .collect();

    Ok(Json(keys))
}

pub async fn create_key(
    State(state): State<AppState>,
    Json(req): Json<CreateKeyRequest>,
) -> Result<Json<NewKeyResponse>, StatusCode> {
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let value = generate_sdk_key();
    let prefix = prefix_of(&value);

    let row =
        sqlx::query("INSERT INTO sdk_keys (name, value) VALUES ($1, $2) RETURNING id, created_at")
            .bind(&name)
            .bind(&value)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                error!(error = %e, "Failed to create SDK key");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let id: i64 = row.get("id");
    let created_at: time::OffsetDateTime = row.get("created_at");

    // Update in-memory cache.
    state.sdk_keys.write().await.push(SdkKeyEntry {
        id,
        name: name.clone(),
        value: value.clone(),
    });

    info!(key_id = id, name = %name, "SDK key created");

    Ok(Json(NewKeyResponse {
        id,
        name,
        key: value,
        prefix,
        created_at: created_at.to_string(),
    }))
}

pub async fn revoke_key(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, StatusCode> {
    // Use a transaction with FOR UPDATE to lock all sdk_keys rows, preventing
    // concurrent revocations from racing past the "at least one key" guard and
    // leaving zero keys configured (which would make the server unauthenticated).
    let mut tx = state.db.begin().await.map_err(|e| {
        error!(error = %e, "Failed to begin revoke transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sdk_keys FOR UPDATE")
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to count SDK keys");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if count <= 1 {
        // Rolling back is implicit on drop, but be explicit.
        let _ = tx.rollback().await;
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let result = sqlx::query("DELETE FROM sdk_keys WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to revoke SDK key");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        let _ = tx.rollback().await;
        return Err(StatusCode::NOT_FOUND);
    }

    tx.commit().await.map_err(|e| {
        error!(error = %e, "Failed to commit revoke transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Update in-memory cache after successful DB commit.
    state.sdk_keys.write().await.retain(|e| e.id != id);

    info!(key_id = id, "SDK key revoked");
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

/// Public — mounted without auth middleware (setup wizard).
pub fn setup_router() -> Router<AppState> {
    Router::new().route("/setup/key", get(get_setup_key))
}

/// Read-only — any authenticated user.
pub fn read_router() -> Router<AppState> {
    Router::new().route("/keys", get(list_keys))
}

/// Write routes — require admin role.
pub fn write_router() -> Router<AppState> {
    Router::new()
        .route("/keys", post(create_key))
        .route("/keys/{id}", delete(revoke_key))
}
