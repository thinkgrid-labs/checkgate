use crate::state::AppState;
use checkgate_core::evaluator::Flag;
use serde_json::Value;
use sqlx::Row;
use std::time::Duration;
use tracing::{error, info, warn};

/// Background task that polls `scheduled_changes` every 60 seconds and applies
/// any patches whose `scheduled_at` is in the past.
///
/// Uses `FOR UPDATE SKIP LOCKED` so multiple server instances coordinate safely
/// without a distributed lock: only one instance will successfully acquire and
/// execute each row.
pub async fn run(state: AppState) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        interval.tick().await;
        execute_due(&state).await;
    }
}

async fn execute_due(state: &AppState) {
    // Fetch up to 50 due rows at once and lock them with SKIP LOCKED so
    // concurrent scheduler instances each get a disjoint batch.
    let due = match sqlx::query(
        "SELECT id::text, environment_id::text, flag_key, patch \
         FROM scheduled_changes \
         WHERE executed_at IS NULL AND scheduled_at <= NOW() \
         ORDER BY scheduled_at ASC \
         LIMIT 50 \
         FOR UPDATE SKIP LOCKED",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            error!(error = %e, "Scheduler: failed to query due changes");
            return;
        }
    };

    if due.is_empty() {
        return;
    }

    info!(count = due.len(), "Scheduler: applying due changes");

    for row in &due {
        let id: String = row.get("id");
        let env_id: String = row.get("environment_id");
        let flag_key: String = row.get("flag_key");
        let patch: Value = match row.try_get("patch") {
            Ok(v) => v,
            Err(e) => {
                error!(id = %id, error = %e, "Scheduler: failed to deserialize patch");
                mark_executed(&state.db, &id).await;
                continue;
            }
        };

        apply_change(state, &id, &env_id, &flag_key, patch).await;
    }
}

async fn apply_change(state: &AppState, id: &str, env_id: &str, flag_key: &str, patch: Value) {
    // Read-modify-write inside a transaction.
    let result: Result<Option<Value>, sqlx::Error> = async {
        let mut tx = state.db.begin().await?;

        let rec = sqlx::query(
            "SELECT data FROM flags WHERE key = $1 AND environment_id = $2::uuid FOR UPDATE",
        )
        .bind(flag_key)
        .bind(env_id)
        .fetch_optional(&mut *tx)
        .await?;

        let Some(rec) = rec else {
            // Flag was deleted; mark as executed so we don't retry.
            tx.rollback().await.ok();
            return Ok(None);
        };

        let mut flag_val: Value = rec.try_get("data")?;
        if let (Value::Object(map), Value::Object(p)) = (&mut flag_val, &patch) {
            for (k, v) in p {
                if k != "key" {
                    map.insert(k.clone(), v.clone());
                }
            }
        }

        // Validate the merged flag before writing.
        serde_json::from_value::<Flag>(flag_val.clone())
            .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

        sqlx::query("UPDATE flags SET data = $1 WHERE key = $2 AND environment_id = $3::uuid")
            .bind(&flag_val)
            .bind(flag_key)
            .bind(env_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(Some(flag_val))
    }
    .await;

    match result {
        Err(e) => {
            error!(id = %id, flag_key, error = %e, "Scheduler: failed to apply change");
        }
        Ok(None) => {
            info!(id = %id, flag_key, "Scheduler: flag deleted before change could run");
        }
        Ok(Some(flag_val)) => {
            let flag: Flag = match serde_json::from_value(flag_val.clone()) {
                Ok(f) => f,
                Err(e) => {
                    error!(id = %id, error = %e, "Scheduler: merged flag is invalid");
                    mark_executed(&state.db, id).await;
                    return;
                }
            };

            // Broadcast the update exactly as flag mutation handlers do.
            let segment_map = crate::api::segments::load_env_segments(env_id, &state.db)
                .await
                .unwrap_or_default();
            let expanded = crate::api::segments::expand_flag_with_segments(flag, &segment_map);
            state.store.upsert_flag(expanded.clone());

            let msg = serde_json::json!({
                "type": "UPSERT",
                "env_id": env_id,
                "flag": expanded,
            })
            .to_string();
            crate::api::flags::publish_update(state, &msg, "scheduler").await;

            // Fire webhooks.
            let wh_payload = crate::api::webhooks::flag_event_payload(
                "flag.scheduled_change_applied",
                env_id,
                flag_key,
                Some(&flag_val),
                None,
                Some(&serde_json::json!({"scheduled_change_id": id})),
            );
            crate::webhook_fire::fire_webhooks(state.clone(), env_id.to_string(), wh_payload);

            // Audit log.
            crate::api::audit::log_audit_event(
                &state.db,
                env_id,
                flag_key,
                None,
                "UPDATE",
                None,
                Some(&flag_val),
                Some(&serde_json::json!({"scheduled_change_id": id})),
            )
            .await;

            info!(id = %id, flag_key, env_id, "Scheduler: change applied");
        }
    }

    mark_executed(&state.db, id).await;
}

async fn mark_executed(db: &sqlx::PgPool, id: &str) {
    if let Err(e) =
        sqlx::query("UPDATE scheduled_changes SET executed_at = NOW() WHERE id = $1::uuid")
            .bind(id)
            .execute(db)
            .await
    {
        warn!(id = %id, error = %e, "Scheduler: failed to mark change as executed");
    }
}
