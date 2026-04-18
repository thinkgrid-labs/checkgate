use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
};
use axum_extra::extract::cookie::PrivateCookieJar;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info, warn};

use super::session::hash_password;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct UserInfo {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateUserRequest {
    pub name: String,
    pub email: String,
    pub role: String,
    pub password: String,
}

/// Minimal session claims needed to identify the caller in handlers.
#[derive(Deserialize)]
struct CallerClaims {
    email: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn list_users(State(state): State<AppState>) -> Result<Json<Vec<UserInfo>>, StatusCode> {
    let rows =
        sqlx::query("SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC")
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                error!(error = %e, "Failed to list users");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let users = rows
        .iter()
        .map(|row| {
            let created_at: time::OffsetDateTime = row.get("created_at");
            UserInfo {
                id: row.get("id"),
                name: row.get("name"),
                email: row.get("email"),
                role: row.get("role"),
                created_at: created_at.to_string(),
            }
        })
        .collect();

    Ok(Json(users))
}

pub async fn create_user(
    State(state): State<AppState>,
    Json(req): Json<CreateUserRequest>,
) -> Result<Json<UserInfo>, StatusCode> {
    let name = req.name.trim().to_string();
    let email = req.email.trim().to_lowercase();
    let role = req.role.trim().to_string();

    if name.is_empty() || name.len() > 100 || email.is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    if role != "admin" && role != "viewer" {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    if req.password.len() < 8 {
        warn!(email = %email, "Rejected create_user: password too short");
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let password_hash = hash_password(&req.password)?;

    let row = sqlx::query(
        "INSERT INTO users (name, email, role, password_hash) VALUES ($1, $2, $3, $4) \
         RETURNING id, created_at",
    )
    .bind(&name)
    .bind(&email)
    .bind(&role)
    .bind(&password_hash)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to create user");
        if e.to_string().to_lowercase().contains("unique") {
            StatusCode::CONFLICT
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    let id: i64 = row.get("id");
    let created_at: time::OffsetDateTime = row.get("created_at");

    info!(user_id = id, email = %email, role = %role, "User created");

    Ok(Json(UserInfo {
        id,
        name,
        email,
        role,
        created_at: created_at.to_string(),
    }))
}

pub async fn delete_user(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path(id): Path<i64>,
) -> Result<StatusCode, StatusCode> {
    // Prevent self-deletion — the client check can be bypassed via direct API calls.
    if let Some(cookie) = jar.get("lg_session")
        && let Ok(claims) = serde_json::from_str::<CallerClaims>(cookie.value())
    {
        let self_id: Option<i64> =
            sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
                .bind(&claims.email)
                .fetch_optional(&state.db)
                .await
                .map_err(|e| {
                    error!(error = %e, "DB error resolving session user");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

        if self_id == Some(id) {
            warn!(user_id = id, "Rejected self-delete attempt");
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
    }

    // Use a transaction with FOR UPDATE so concurrent admin deletions cannot
    // both pass the "at least one admin remains" check simultaneously.
    let mut tx = state.db.begin().await.map_err(|e| {
        error!(error = %e, "Failed to begin transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let user_row = sqlx::query("SELECT role FROM users WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to fetch user for delete");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let role: String = user_row.get("role");

    if role == "admin" {
        // Lock all admin rows to prevent a concurrent delete from racing past this check.
        let admin_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM (SELECT id FROM users WHERE role = 'admin' FOR UPDATE) AS a",
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to count admins");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        if admin_count <= 1 {
            let _ = tx.rollback().await;
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
    }

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to delete user");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    tx.commit().await.map_err(|e| {
        error!(error = %e, "Transaction commit failed");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!(user_id = id, "User deleted");
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

/// Read-only — any authenticated user.
pub fn read_router() -> Router<AppState> {
    Router::new().route("/users", get(list_users))
}

/// Write routes — require admin role.
pub fn write_router() -> Router<AppState> {
    Router::new()
        .route("/users", post(create_user))
        .route("/users/{id}", delete(delete_user))
}
