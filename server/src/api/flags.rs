use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::get,
};
use redis::AsyncCommands;
use serde_json::json;
use sidekick_core::evaluator::Flag;
use sqlx::Row;
use std::sync::Arc;
use tracing::{error, info, instrument, warn};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/flags", get(list_flags).post(create_flag))
        .route(
            "/flags/{key}",
            get(get_flag).delete(delete_flag).patch(patch_flag),
        )
}

#[instrument(skip(state))]
async fn list_flags(State(state): State<AppState>) -> Json<Vec<Arc<Flag>>> {
    let flags = state.store.list_flags();
    info!(count = flags.len(), "Listed flags");
    Json(flags)
}

#[instrument(skip(state, payload), fields(flag_key = %payload.key))]
async fn create_flag(
    State(state): State<AppState>,
    Json(payload): Json<Flag>,
) -> Result<Json<Flag>, StatusCode> {
    if payload.key.trim().is_empty() {
        warn!("Rejected create_flag: key is empty");
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    if payload.rollout_percentage.is_some_and(|p| p > 100) {
        warn!(
            rollout_percentage = ?payload.rollout_percentage,
            "Rejected create_flag: rollout_percentage out of range"
        );
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let data = serde_json::to_value(&payload).map_err(|e| {
        error!(error = %e, "Failed to serialize flag for DB write");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    sqlx::query(
        "INSERT INTO flags (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data",
    )
    .bind(&payload.key)
    .bind(&data)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "PostgreSQL write failed");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    state.store.upsert_flag(payload.clone());

    let msg = json!({"type": "UPSERT", "flag": payload}).to_string();
    publish_update(&state, &msg, "create_flag").await;

    info!("Flag created/replaced");
    Ok(Json(payload))
}

#[instrument(skip(state), fields(flag_key = %key))]
async fn get_flag(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<Json<Arc<Flag>>, StatusCode> {
    match state.store.get_flag(&key) {
        Some(flag) => {
            info!("Flag retrieved");
            Ok(Json(flag))
        }
        None => {
            info!("Flag not found");
            Err(StatusCode::NOT_FOUND)
        }
    }
}

#[instrument(skip(state), fields(flag_key = %key))]
async fn delete_flag(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<StatusCode, StatusCode> {
    sqlx::query("DELETE FROM flags WHERE key = $1")
        .bind(&key)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "PostgreSQL delete failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    state.store.delete_flag(&key);

    let msg = json!({"type": "DELETE", "key": key}).to_string();
    publish_update(&state, &msg, "delete_flag").await;

    info!("Flag deleted");
    Ok(StatusCode::NO_CONTENT)
}

/// PATCH /api/flags/:key — partial update via JSON merge.
///
/// Only provided fields are changed; omitted fields retain their current values.
/// The `key` field is excluded from the patch to prevent key aliasing.
/// The read-modify-write is wrapped in a transaction with FOR UPDATE to prevent
/// concurrent-patch races.
#[instrument(skip(state, patch), fields(flag_key = %key))]
async fn patch_flag(
    State(state): State<AppState>,
    Path(key): Path<String>,
    Json(mut patch): Json<serde_json::Value>,
) -> Result<Json<Flag>, StatusCode> {
    // Prevent the key from being mutated through a PATCH body.
    if let serde_json::Value::Object(ref mut m) = patch {
        m.remove("key");
    }

    let mut db_tx = state.db.begin().await.map_err(|e| {
        error!(error = %e, "Failed to begin transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let rec = sqlx::query("SELECT data FROM flags WHERE key = $1 FOR UPDATE")
        .bind(&key)
        .fetch_optional(&mut *db_tx)
        .await
        .map_err(|e| {
            error!(error = %e, "PostgreSQL read failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or_else(|| {
            info!("Flag not found for PATCH");
            StatusCode::NOT_FOUND
        })?;

    let mut flag_val: serde_json::Value = rec.try_get("data").map_err(|e| {
        error!(error = %e, "Failed to deserialize stored flag data");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let (serde_json::Value::Object(map), serde_json::Value::Object(patch_map)) =
        (&mut flag_val, patch)
    {
        for (k, v) in patch_map {
            map.insert(k, v);
        }
    }

    let flag: Flag = serde_json::from_value(flag_val.clone()).map_err(|e| {
        error!(error = %e, "Merged flag is not a valid Flag — patch rejected");
        StatusCode::UNPROCESSABLE_ENTITY
    })?;

    if flag.rollout_percentage.is_some_and(|p| p > 100) {
        warn!(
            rollout_percentage = ?flag.rollout_percentage,
            "Rejected patch_flag: rollout_percentage out of range"
        );
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    sqlx::query("UPDATE flags SET data = $1 WHERE key = $2")
        .bind(&flag_val)
        .bind(&key)
        .execute(&mut *db_tx)
        .await
        .map_err(|e| {
            error!(error = %e, "PostgreSQL update failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    db_tx.commit().await.map_err(|e| {
        error!(error = %e, "Transaction commit failed");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    state.store.upsert_flag(flag.clone());

    let msg = json!({"type": "UPSERT", "flag": flag}).to_string();
    publish_update(&state, &msg, "patch_flag").await;

    info!("Flag patched");
    Ok(Json(flag))
}

/// Publish a flag change event to Redis pub/sub.
/// Logs a warning if Redis is unavailable — the DB write already succeeded so
/// the request is not failed, but other instances may serve stale data until
/// their next restart or SSE reconnect.
async fn publish_update(state: &AppState, msg: &str, op: &str) {
    match state.redis_client.get_multiplexed_async_connection().await {
        Err(e) => {
            warn!(
                error = %e,
                operation = op,
                "Redis unavailable — update not broadcast; other instances may be stale"
            );
        }
        Ok(mut conn) => {
            if let Err(e) = conn.publish::<_, _, ()>("sidekick_updates", msg).await {
                warn!(
                    error = %e,
                    operation = op,
                    "Redis publish failed — other instances may be stale"
                );
            }
        }
    }
}
