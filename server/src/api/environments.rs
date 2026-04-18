use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info, warn};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub color: String,
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateEnvironmentRequest {
    pub name: String,
    pub slug: String,
    pub color: Option<String>,
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

fn is_valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 64
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn is_valid_hex_color(color: &str) -> bool {
    let Some(hex) = color.strip_prefix('#') else {
        return false;
    };
    (hex.len() == 3 || hex.len() == 6) && hex.chars().all(|c| c.is_ascii_hexdigit())
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn list_environments(
    State(state): State<AppState>,
) -> Result<Json<Vec<Environment>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id::text, name, slug, color, is_default, created_at::text \
         FROM environments ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to list environments");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let envs = rows
        .iter()
        .map(|r| Environment {
            id: r.get("id"),
            name: r.get("name"),
            slug: r.get("slug"),
            color: r.get("color"),
            is_default: r.get("is_default"),
            created_at: r.get("created_at"),
        })
        .collect();

    Ok(Json(envs))
}

async fn create_environment(
    State(state): State<AppState>,
    Json(req): Json<CreateEnvironmentRequest>,
) -> Result<Json<Environment>, StatusCode> {
    let name = req.name.trim().to_string();
    let slug = req.slug.trim().to_lowercase();
    let color = req.color.unwrap_or_else(|| "#6366f1".to_string());

    if name.is_empty() || name.len() > 100 {
        warn!("Rejected create_environment: name empty or too long");
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    if !is_valid_slug(&slug) {
        warn!(slug = %slug, "Rejected create_environment: invalid slug");
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    if !is_valid_hex_color(&color) {
        warn!(color = %color, "Rejected create_environment: invalid hex color");
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let row = sqlx::query(
        "INSERT INTO environments (name, slug, color) VALUES ($1, $2, $3) \
         RETURNING id::text, name, slug, color, is_default, created_at::text",
    )
    .bind(&name)
    .bind(&slug)
    .bind(&color)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to create environment");
        if e.to_string().to_lowercase().contains("unique") {
            StatusCode::CONFLICT
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    let env = Environment {
        id: row.get("id"),
        name: row.get("name"),
        slug: row.get("slug"),
        color: row.get("color"),
        is_default: row.get("is_default"),
        created_at: row.get("created_at"),
    };

    info!(slug = %env.slug, "Environment created");
    Ok(Json(env))
}

async fn delete_environment(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Prevent deleting the default environment.
    let row = sqlx::query("SELECT is_default FROM environments WHERE id = $1::uuid")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to fetch environment for delete");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let is_default: bool = row.get("is_default");
    if is_default {
        warn!(id = %id, "Rejected delete: cannot delete the default environment");
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    // Prevent deleting the last environment.
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM environments")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to count environments");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if count <= 1 {
        warn!("Rejected delete: cannot delete the last environment");
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let result = sqlx::query("DELETE FROM environments WHERE id = $1::uuid")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to delete environment");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    info!(id = %id, "Environment deleted");
    Ok(StatusCode::NO_CONTENT)
}

async fn set_default_environment(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Environment>, StatusCode> {
    let mut db_tx = state.db.begin().await.map_err(|e| {
        error!(error = %e, "Failed to begin transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Unset all defaults.
    sqlx::query("UPDATE environments SET is_default = false WHERE is_default = true")
        .execute(&mut *db_tx)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to clear default environments");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Set new default.
    let row = sqlx::query(
        "UPDATE environments SET is_default = true WHERE id = $1::uuid \
         RETURNING id::text, name, slug, color, is_default, created_at::text",
    )
    .bind(&id)
    .fetch_optional(&mut *db_tx)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to set default environment");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    db_tx.commit().await.map_err(|e| {
        error!(error = %e, "Failed to commit set-default transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let env = Environment {
        id: row.get("id"),
        name: row.get("name"),
        slug: row.get("slug"),
        color: row.get("color"),
        is_default: row.get("is_default"),
        created_at: row.get("created_at"),
    };

    info!(slug = %env.slug, "Default environment updated");
    Ok(Json(env))
}

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

pub fn read_router() -> Router<AppState> {
    Router::new().route("/environments", get(list_environments))
}

pub fn write_router() -> Router<AppState> {
    Router::new()
        .route("/environments", post(create_environment))
        .route("/environments/{id}", delete(delete_environment))
        .route("/environments/{id}/default", post(set_default_environment))
}
