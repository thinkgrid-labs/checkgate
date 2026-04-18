use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info, warn};

const MAX_BATCH: usize = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ImpressionPayload {
    pub flag_key: String,
    pub user_id: Option<String>,
    pub value: String,
    pub context: Option<serde_json::Value>,
    pub evaluated_at: Option<time::OffsetDateTime>,
}

#[derive(Debug, Serialize)]
pub struct Impression {
    pub id: i64,
    pub flag_key: String,
    pub user_id: Option<String>,
    pub value: String,
    pub context: Option<serde_json::Value>,
    pub evaluated_at: time::OffsetDateTime,
}

#[derive(Debug, Serialize)]
pub struct ImpressionStats {
    pub flag_key: String,
    pub total: i64,
    pub true_count: i64,
    pub false_count: i64,
    pub unique_users: i64,
    pub last_seen: Option<time::OffsetDateTime>,
}

#[derive(Debug, Serialize)]
pub struct ImpressionListResponse {
    pub items: Vec<Impression>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub flag_key: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    50
}

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

/// Impression read routes — any authenticated user.
pub fn read_router() -> Router<AppState> {
    Router::new()
        .route("/environments/{env_id}/impressions", get(list_impressions))
        .route(
            "/environments/{env_id}/impressions/stats",
            get(impression_stats),
        )
}

/// Impression ingest route — any authenticated client (including SDK Bearer keys).
pub fn ingest_router() -> Router<AppState> {
    Router::new().route(
        "/environments/{env_id}/impressions",
        post(ingest_impressions),
    )
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /api/environments/{env_id}/impressions
///
/// Accepts a JSON array of evaluation events from SDK clients.
/// Called asynchronously after flag evaluations — fire-and-forget from SDK side.
async fn ingest_impressions(
    State(state): State<AppState>,
    Path(env_id): Path<String>,
    Json(batch): Json<Vec<ImpressionPayload>>,
) -> Result<StatusCode, StatusCode> {
    if batch.is_empty() {
        return Ok(StatusCode::NO_CONTENT);
    }

    if batch.len() > MAX_BATCH {
        warn!(
            count = batch.len(),
            max = MAX_BATCH,
            "Impression batch too large — rejected"
        );
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }

    let env_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM environments WHERE id = $1::uuid)")
            .bind(&env_id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                error!(error = %e, "DB error checking environment");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    if !env_exists {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut tx = state.db.begin().await.map_err(|e| {
        error!(error = %e, "Failed to begin transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut accepted = 0usize;

    for imp in &batch {
        if imp.flag_key.is_empty() || imp.flag_key.len() > 100 {
            continue;
        }
        let evaluated_at = imp
            .evaluated_at
            .unwrap_or_else(time::OffsetDateTime::now_utc);

        sqlx::query(
            "INSERT INTO impressions \
             (environment_id, flag_key, user_id, value, context, evaluated_at) \
             VALUES ($1::uuid, $2, $3, $4, $5, $6)",
        )
        .bind(&env_id)
        .bind(&imp.flag_key)
        .bind(&imp.user_id)
        .bind(&imp.value)
        .bind(&imp.context)
        .bind(evaluated_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to insert impression");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        accepted += 1;
    }

    tx.commit().await.map_err(|e| {
        error!(error = %e, "Transaction commit failed");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!(env_id = %env_id, accepted, total = batch.len(), "Impressions ingested");
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/environments/{env_id}/impressions
///
/// Returns a paginated list of recent evaluations. Filter by `flag_key` query param.
async fn list_impressions(
    State(state): State<AppState>,
    Path(env_id): Path<String>,
    Query(q): Query<ListQuery>,
) -> Result<Json<ImpressionListResponse>, StatusCode> {
    let limit = q.limit.clamp(1, 200);
    let offset = q.offset.max(0);

    let (rows, total) = if let Some(ref fk) = q.flag_key {
        let rows = sqlx::query(
            "SELECT id, flag_key, user_id, value, context, evaluated_at \
             FROM impressions \
             WHERE environment_id = $1::uuid AND flag_key = $2 \
             ORDER BY evaluated_at DESC LIMIT $3 OFFSET $4",
        )
        .bind(&env_id)
        .bind(fk)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "DB error listing impressions");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        let total: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM impressions \
             WHERE environment_id = $1::uuid AND flag_key = $2",
        )
        .bind(&env_id)
        .bind(fk)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "DB error counting impressions");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        (rows, total)
    } else {
        let rows = sqlx::query(
            "SELECT id, flag_key, user_id, value, context, evaluated_at \
             FROM impressions \
             WHERE environment_id = $1::uuid \
             ORDER BY evaluated_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(&env_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "DB error listing impressions");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        let total: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM impressions WHERE environment_id = $1::uuid")
                .bind(&env_id)
                .fetch_one(&state.db)
                .await
                .map_err(|e| {
                    error!(error = %e, "DB error counting impressions");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

        (rows, total)
    };

    let items: Vec<Impression> = rows
        .iter()
        .map(|r| Impression {
            id: r.get("id"),
            flag_key: r.get("flag_key"),
            user_id: r.get("user_id"),
            value: r.get("value"),
            context: r.get("context"),
            evaluated_at: r.get("evaluated_at"),
        })
        .collect();

    Ok(Json(ImpressionListResponse { items, total }))
}

/// GET /api/environments/{env_id}/impressions/stats
///
/// Returns per-flag aggregate counts: total evals, true/false split, unique users.
async fn impression_stats(
    State(state): State<AppState>,
    Path(env_id): Path<String>,
) -> Result<Json<Vec<ImpressionStats>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT flag_key, \
                COUNT(*) AS total, \
                COUNT(*) FILTER (WHERE value = 'true')  AS true_count, \
                COUNT(*) FILTER (WHERE value = 'false') AS false_count, \
                COUNT(DISTINCT user_id)                 AS unique_users, \
                MAX(evaluated_at)                       AS last_seen \
         FROM impressions \
         WHERE environment_id = $1::uuid \
         GROUP BY flag_key \
         ORDER BY total DESC",
    )
    .bind(&env_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "DB error fetching impression stats");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let stats: Vec<ImpressionStats> = rows
        .iter()
        .map(|r| ImpressionStats {
            flag_key: r.get("flag_key"),
            total: r.get("total"),
            true_count: r.get("true_count"),
            false_count: r.get("false_count"),
            unique_users: r.get("unique_users"),
            last_seen: r.get("last_seen"),
        })
        .collect();

    Ok(Json(stats))
}
