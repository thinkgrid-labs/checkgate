use crate::auth::get_session_claims;
use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use axum_extra::extract::cookie::PrivateCookieJar;
use checkgate_core::evaluator::Flag;
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use tracing::{error, info, instrument, warn};

// ---------------------------------------------------------------------------
// Environment-scoped path params
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct EnvFlagPath {
    env_id: String,
    key: String,
}

// ---------------------------------------------------------------------------
// Project access helper
// ---------------------------------------------------------------------------

/// Verifies the caller can access the project that owns `env_id`.
/// Workspace admins and SDK key auth always pass.
/// Others must be a project member.
pub(super) async fn check_env_access(
    db: &sqlx::PgPool,
    jar: &PrivateCookieJar,
    env_id: &str,
) -> Result<(), StatusCode> {
    let Some(claims) = get_session_claims(jar) else {
        return Ok(()); // SDK key auth
    };
    if claims.role == "admin" {
        return Ok(());
    }

    let project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id::text FROM environments WHERE id = $1::uuid")
            .bind(env_id)
            .fetch_optional(db)
            .await
            .map_err(|e| {
                error!(error = %e, "DB error resolving environment project");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let project_id = project_id.ok_or(StatusCode::NOT_FOUND)?;

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM project_members pm JOIN users u ON u.id = pm.user_id \
         WHERE pm.project_id = $1::uuid AND u.email = $2)",
    )
    .bind(&project_id)
    .bind(&claims.email)
    .fetch_one(db)
    .await
    .map_err(|e| {
        error!(error = %e, "DB error checking project membership for flag access");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if exists {
        Ok(())
    } else {
        warn!(email = %claims.email, env_id = %env_id, "Forbidden: not a member of this environment's project");
        Err(StatusCode::FORBIDDEN)
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Flag keys must be non-empty, at most 100 characters, and contain only
/// ASCII alphanumerics, underscores, or hyphens. This prevents ambiguous
/// routing, log pollution, and surprises in SDK consumers that use the key
/// as a cache key or filename.
fn is_valid_flag_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 100
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

/// Read-only routes — available to any authenticated user (admin or viewer).
pub fn read_router() -> Router<AppState> {
    Router::new()
        .route("/environments/{env_id}/flags", get(list_flags))
        .route("/environments/{env_id}/flags/{key}", get(get_flag))
}

pub fn write_router() -> Router<AppState> {
    Router::new()
        .route("/environments/{env_id}/flags", post(create_flag))
        .route(
            "/environments/{env_id}/flags/{key}",
            axum::routing::delete(delete_flag).patch(patch_flag),
        )
        .route(
            "/environments/{env_id}/flags/{key}/promote",
            post(promote_flag),
        )
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct Pagination {
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    offset: usize,
}

fn default_limit() -> usize {
    200
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

#[instrument(skip(state, jar))]
async fn list_flags(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path(env_id): Path<String>,
    Query(page): Query<Pagination>,
) -> Result<Json<Vec<Flag>>, StatusCode> {
    check_env_access(&state.db, &jar, &env_id).await?;

    let rows = sqlx::query(
        "SELECT data FROM flags WHERE environment_id = $1::uuid \
         ORDER BY key ASC LIMIT $2 OFFSET $3",
    )
    .bind(&env_id)
    .bind(page.limit as i64)
    .bind(page.offset as i64)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to list flags");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let flags: Vec<Flag> = rows
        .iter()
        .filter_map(|r| {
            let v: serde_json::Value = r.try_get("data").ok()?;
            serde_json::from_value(v).ok()
        })
        .collect();

    info!(
        count = flags.len(),
        offset = page.offset,
        limit = page.limit,
        env_id = %env_id,
        "Listed flags"
    );
    Ok(Json(flags))
}

#[instrument(skip(state, jar, payload), fields(flag_key = %payload.key))]
async fn create_flag(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path(env_id): Path<String>,
    Json(payload): Json<Flag>,
) -> Result<Json<Flag>, StatusCode> {
    check_env_access(&state.db, &jar, &env_id).await?;
    if !is_valid_flag_key(&payload.key) {
        warn!(key = %payload.key, "Rejected create_flag: invalid key");
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
        "INSERT INTO flags (key, environment_id, data) VALUES ($1, $2::uuid, $3) \
         ON CONFLICT (key, environment_id) DO UPDATE SET data = EXCLUDED.data",
    )
    .bind(&payload.key)
    .bind(&env_id)
    .bind(&data)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "PostgreSQL write failed");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let actor_email = get_session_claims(&jar).map(|c| c.email);
    super::audit::log_audit_event(
        &state.db,
        &env_id,
        &payload.key,
        actor_email.as_deref(),
        "CREATE",
        None,
        Some(&data),
        None,
    )
    .await;

    let segment_map = super::segments::load_env_segments(&env_id, &state.db)
        .await
        .unwrap_or_default();
    let expanded = super::segments::expand_flag_with_segments(payload.clone(), &segment_map);
    state.store.upsert_flag(expanded.clone());
    let msg = json!({"type": "UPSERT", "env_id": env_id, "flag": expanded}).to_string();
    publish_update(&state, &msg, "create_flag").await;

    let wh_payload = super::webhooks::flag_event_payload(
        "flag.created",
        &env_id,
        &payload.key,
        Some(&data),
        actor_email.as_deref(),
        None,
    );
    crate::webhook_fire::fire_webhooks(state.clone(), env_id.clone(), wh_payload);

    info!(env_id = %env_id, "Flag created/replaced");
    Ok(Json(payload))
}

#[instrument(skip(state, jar), fields(flag_key = %path.key))]
async fn get_flag(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path(path): Path<EnvFlagPath>,
) -> Result<Json<Flag>, StatusCode> {
    check_env_access(&state.db, &jar, &path.env_id).await?;
    let row = sqlx::query("SELECT data FROM flags WHERE key = $1 AND environment_id = $2::uuid")
        .bind(&path.key)
        .bind(&path.env_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "DB error fetching flag");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let v: serde_json::Value = row
        .try_get("data")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let flag: Flag = serde_json::from_value(v).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    info!(env_id = %path.env_id, "Flag retrieved");
    Ok(Json(flag))
}

#[instrument(skip(state, jar), fields(flag_key = %path.key))]
async fn delete_flag(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path(path): Path<EnvFlagPath>,
) -> Result<StatusCode, StatusCode> {
    check_env_access(&state.db, &jar, &path.env_id).await?;

    // RETURNING captures before_data for the audit log atomically with the delete.
    let row = sqlx::query(
        "DELETE FROM flags WHERE key = $1 AND environment_id = $2::uuid RETURNING data",
    )
    .bind(&path.key)
    .bind(&path.env_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "PostgreSQL delete failed");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let before_data: Option<serde_json::Value> = row.try_get("data").ok();
    let actor_email = get_session_claims(&jar).map(|c| c.email);
    super::audit::log_audit_event(
        &state.db,
        &path.env_id,
        &path.key,
        actor_email.as_deref(),
        "DELETE",
        before_data.as_ref(),
        None,
        None,
    )
    .await;

    let msg = json!({"type": "DELETE", "env_id": path.env_id, "key": path.key}).to_string();
    publish_update(&state, &msg, "delete_flag").await;

    let wh_payload = super::webhooks::flag_event_payload(
        "flag.deleted",
        &path.env_id,
        &path.key,
        before_data.as_ref(),
        actor_email.as_deref(),
        None,
    );
    crate::webhook_fire::fire_webhooks(state.clone(), path.env_id.clone(), wh_payload);

    info!(env_id = %path.env_id, "Flag deleted");
    Ok(StatusCode::NO_CONTENT)
}

/// PATCH /api/environments/:env_id/flags/:key — partial update via JSON merge.
///
/// Only provided fields are changed; omitted fields retain their current values.
/// The `key` field is excluded from the patch to prevent key aliasing.
/// The read-modify-write is wrapped in a transaction with FOR UPDATE to prevent
/// concurrent-patch races.
#[instrument(skip(state, jar, patch), fields(flag_key = %path.key))]
async fn patch_flag(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path(path): Path<EnvFlagPath>,
    Json(mut patch): Json<serde_json::Value>,
) -> Result<Json<Flag>, StatusCode> {
    check_env_access(&state.db, &jar, &path.env_id).await?;
    // Prevent the key from being mutated through a PATCH body.
    if let serde_json::Value::Object(ref mut m) = patch {
        m.remove("key");
    }

    let mut db_tx = state.db.begin().await.map_err(|e| {
        error!(error = %e, "Failed to begin transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let rec = sqlx::query(
        "SELECT data FROM flags WHERE key = $1 AND environment_id = $2::uuid FOR UPDATE",
    )
    .bind(&path.key)
    .bind(&path.env_id)
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

    let before_val: serde_json::Value = rec.try_get("data").map_err(|e| {
        error!(error = %e, "Failed to deserialize stored flag data");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let mut flag_val = before_val.clone();

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

    sqlx::query("UPDATE flags SET data = $1 WHERE key = $2 AND environment_id = $3::uuid")
        .bind(&flag_val)
        .bind(&path.key)
        .bind(&path.env_id)
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

    let actor_email = get_session_claims(&jar).map(|c| c.email);
    super::audit::log_audit_event(
        &state.db,
        &path.env_id,
        &path.key,
        actor_email.as_deref(),
        "UPDATE",
        Some(&before_val),
        Some(&flag_val),
        None,
    )
    .await;

    let segment_map = super::segments::load_env_segments(&path.env_id, &state.db)
        .await
        .unwrap_or_default();
    let expanded = super::segments::expand_flag_with_segments(flag.clone(), &segment_map);
    state.store.upsert_flag(expanded.clone());
    let msg = json!({"type": "UPSERT", "env_id": path.env_id, "flag": expanded}).to_string();
    publish_update(&state, &msg, "patch_flag").await;

    let wh_payload = super::webhooks::flag_event_payload(
        "flag.updated",
        &path.env_id,
        &path.key,
        Some(&flag_val),
        actor_email.as_deref(),
        None,
    );
    crate::webhook_fire::fire_webhooks(state.clone(), path.env_id.clone(), wh_payload);

    info!(env_id = %path.env_id, "Flag patched");
    Ok(Json(flag))
}

/// POST /api/environments/:env_id/flags/:key/promote
///
/// Copies a flag's configuration from one environment to another (the target
/// environment is specified in the JSON body as `target_env_id`).
/// This is the "promote to production" flow.
#[instrument(skip(state, jar), fields(flag_key = %path.key))]
async fn promote_flag(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path(path): Path<EnvFlagPath>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Flag>, StatusCode> {
    check_env_access(&state.db, &jar, &path.env_id).await?;
    let target_env_id = body
        .get("target_env_id")
        .and_then(|v| v.as_str())
        .ok_or(StatusCode::UNPROCESSABLE_ENTITY)?
        .to_string();
    check_env_access(&state.db, &jar, &target_env_id).await?;

    let mut db_tx = state.db.begin().await.map_err(|e| {
        error!(error = %e, "Failed to begin transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Read source flag.
    let rec = sqlx::query("SELECT data FROM flags WHERE key = $1 AND environment_id = $2::uuid")
        .bind(&path.key)
        .bind(&path.env_id)
        .fetch_optional(&mut *db_tx)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to read source flag for promote");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let flag_val: serde_json::Value = rec
        .try_get("data")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let flag: Flag =
        serde_json::from_value(flag_val.clone()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Upsert into target environment.
    sqlx::query(
        "INSERT INTO flags (key, environment_id, data) VALUES ($1, $2::uuid, $3) \
         ON CONFLICT (key, environment_id) DO UPDATE SET data = EXCLUDED.data",
    )
    .bind(&path.key)
    .bind(&target_env_id)
    .bind(&flag_val)
    .execute(&mut *db_tx)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to write promoted flag");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    db_tx.commit().await.map_err(|e| {
        error!(error = %e, "Transaction commit failed");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let actor_email = get_session_claims(&jar).map(|c| c.email);
    let promote_meta = serde_json::json!({"from_env_id": path.env_id, "to_env_id": target_env_id});
    super::audit::log_audit_event(
        &state.db,
        &target_env_id,
        &path.key,
        actor_email.as_deref(),
        "PROMOTE",
        None,
        Some(&flag_val),
        Some(&promote_meta),
    )
    .await;

    let segment_map = super::segments::load_env_segments(&target_env_id, &state.db)
        .await
        .unwrap_or_default();
    let expanded = super::segments::expand_flag_with_segments(flag.clone(), &segment_map);
    state.store.upsert_flag(expanded.clone());
    let msg = json!({"type": "UPSERT", "env_id": target_env_id, "flag": expanded}).to_string();
    publish_update(&state, &msg, "promote_flag").await;

    let wh_payload = super::webhooks::flag_event_payload(
        "flag.promoted",
        &target_env_id,
        &path.key,
        Some(&flag_val),
        actor_email.as_deref(),
        Some(&promote_meta),
    );
    crate::webhook_fire::fire_webhooks(state.clone(), target_env_id.clone(), wh_payload);

    info!(
        from_env = %path.env_id,
        to_env = %target_env_id,
        "Flag promoted"
    );
    Ok(Json(flag))
}

// ---------------------------------------------------------------------------
// Redis helpers
// ---------------------------------------------------------------------------

/// Publish a flag change event using the shared multiplexed connection from
/// AppState. If Redis is unavailable the DB write already succeeded so the
/// request is not failed, but other instances may serve stale data until their
/// next SSE reconnect.
pub(crate) async fn publish_update(state: &AppState, msg: &str, op: &str) {
    let mut conn = state.redis_conn.clone();
    if let Err(e) = conn.publish::<_, _, ()>("checkgate_updates", msg).await {
        warn!(
            error = %e,
            operation = op,
            "Redis publish failed — other instances may be stale"
        );
    }
}
