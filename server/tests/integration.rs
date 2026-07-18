//! End-to-end server integration tests.
//!
//! These spawn the **real** compiled server binary against a real Postgres and
//! Redis, then drive the HTTP API exactly as a client would — exercising
//! migrations, auth, RBAC, flag/segment CRUD, analytics (impressions, exposure),
//! A/B events + experiments, and the change-request approval gate.
//!
//! Requires two environment variables (the suite skips cleanly if they're unset,
//! so `cargo test --workspace` stays green where no database is available):
//!   CHECKGATE_TEST_DATABASE_URL  e.g. postgres://postgres@localhost:55432/checkgate_test
//!   CHECKGATE_TEST_REDIS_URL     e.g. redis://localhost:56379
//!
//! The target database's `public` schema is dropped and recreated at the start
//! of the run, so each run begins from a clean, freshly-migrated state.

use serde_json::{Value, json};
use std::process::{Child, Command, Stdio};
use std::time::Duration;

/// Kills the spawned server when the test ends (including on panic).
struct ServerGuard(Child);
impl Drop for ServerGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

async fn reset_schema(db_url: &str) {
    let pool = sqlx::PgPool::connect(db_url)
        .await
        .expect("connect to test database");
    // Two separate statements — the extended (prepared) protocol sqlx uses
    // rejects multiple commands in one query.
    sqlx::query("DROP SCHEMA public CASCADE")
        .execute(&pool)
        .await
        .expect("drop public schema");
    sqlx::query("CREATE SCHEMA public")
        .execute(&pool)
        .await
        .expect("create public schema");
    pool.close().await;
}

async fn wait_healthy(base: &str) {
    let client = reqwest::Client::new();
    for _ in 0..120 {
        if let Ok(resp) = client.get(format!("{base}/health")).send().await
            && resp.status().is_success()
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    panic!("server did not become healthy at {base}");
}

/// A tiny helper bundling the base URL + a cookie-storing client (session) and a
/// cookieless client (Bearer / anonymous).
struct Ctx {
    base: String,
    sess: reqwest::Client,
    anon: reqwest::Client,
}

impl Ctx {
    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base, path)
    }
}

#[tokio::test]
async fn full_api_flow() {
    let (Ok(db_url), Ok(redis_url)) = (
        std::env::var("CHECKGATE_TEST_DATABASE_URL"),
        std::env::var("CHECKGATE_TEST_REDIS_URL"),
    ) else {
        eprintln!(
            "SKIP: set CHECKGATE_TEST_DATABASE_URL and CHECKGATE_TEST_REDIS_URL to run server integration tests"
        );
        return;
    };

    reset_schema(&db_url).await;

    let port = free_port();
    let base = format!("http://127.0.0.1:{port}");
    let public_dir = std::env::temp_dir().join(format!("checkgate-test-public-{port}"));
    std::fs::create_dir_all(&public_dir).unwrap();

    let child = Command::new(env!("CARGO_BIN_EXE_server"))
        .env("DATABASE_URL", &db_url)
        .env("REDIS_URL", &redis_url)
        .env("PORT", port.to_string())
        .env(
            "SESSION_SECRET",
            "test-secret-0123456789-0123456789-0123456789-0123456789-0123456789",
        )
        .env("COOKIE_SECURE", "false")
        .env("PUBLIC_DIR", public_dir.to_str().unwrap())
        .env("RUST_LOG", "warn")
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("spawn server binary");
    let _guard = ServerGuard(child);

    wait_healthy(&base).await;

    let ctx = Ctx {
        base,
        sess: reqwest::Client::builder()
            .cookie_store(true)
            .build()
            .unwrap(),
        anon: reqwest::Client::new(),
    };

    // Run the ordered scenario. Each helper asserts as it goes.
    let (sdk_key, prod_env) = setup_and_keys(&ctx).await;
    auth_failures(&ctx, &prod_env).await;
    flag_crud(&ctx, &sdk_key, &prod_env).await;
    segment_crud(&ctx, &sdk_key, &prod_env).await;
    analytics_and_experiments(&ctx, &sdk_key, &prod_env).await;
    snapshot(&ctx, &sdk_key).await;
    rbac_and_change_requests(&ctx, &prod_env).await;

    eprintln!("integration: full_api_flow passed");
}

// --- Setup + credentials ---------------------------------------------------

async fn setup_and_keys(ctx: &Ctx) -> (String, String) {
    // Before setup, the seeded Production SDK key + environment id are readable.
    let r = ctx
        .anon
        .get(ctx.url("/api/setup/key"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "GET /api/setup/key before setup");
    let key_body: Value = r.json().await.unwrap();
    let sdk_key = key_body["key"].as_str().unwrap().to_string();
    let prod_env = key_body["environment_id"].as_str().unwrap().to_string();
    assert!(sdk_key.starts_with("sk_"), "sdk key looks valid: {sdk_key}");

    // Complete first-run setup (creates the admin + session cookie).
    let r = ctx
        .sess
        .post(ctx.url("/api/setup/complete"))
        .header("X-Checkgate-Request", "true")
        .json(&json!({
            "workspace_name": "Acme",
            "project_name": "Web",
            "name": "Admin",
            "email": "admin@acme.test",
            "password": "supersecret1",
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "setup/complete");
    let me: Value = r.json().await.unwrap();
    assert_eq!(me["role"], "admin");
    assert_eq!(me["is_setup_complete"], true);

    // Session cookie now works.
    let r = ctx.sess.get(ctx.url("/api/auth/me")).send().await.unwrap();
    assert_eq!(r.status(), 200, "auth/me with session");
    assert_eq!(r.json::<Value>().await.unwrap()["email"], "admin@acme.test");

    // Setup is one-time.
    let r = ctx
        .sess
        .post(ctx.url("/api/setup/complete"))
        .header("X-Checkgate-Request", "true")
        .json(&json!({ "workspace_name": "x", "name": "x", "email": "x@x.t", "password": "supersecret1" }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404, "second setup rejected");

    (sdk_key, prod_env)
}

// --- Auth failures ---------------------------------------------------------

async fn auth_failures(ctx: &Ctx, env: &str) {
    // No credentials → 401.
    let r = ctx
        .anon
        .get(ctx.url(&format!("/api/environments/{env}/flags")))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401, "unauthenticated flag list");

    // Bad bearer → 401.
    let r = ctx
        .anon
        .get(ctx.url(&format!("/api/environments/{env}/flags")))
        .bearer_auth("sk_totally_invalid")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401, "invalid bearer flag list");
}

// --- Flag CRUD (via SDK key, which is admin-equivalent + CSRF-exempt) -------

async fn flag_crud(ctx: &Ctx, sdk_key: &str, env: &str) {
    let flags = format!("/api/environments/{env}/flags");

    let r = ctx
        .anon
        .post(ctx.url(&flags))
        .bearer_auth(sdk_key)
        .json(&json!({
            "key": "new-homepage",
            "is_enabled": true,
            "rollout_percentage": 50,
            "description": "rollout",
            "flag_type": "boolean",
            "rules": []
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "create flag");
    assert_eq!(r.json::<Value>().await.unwrap()["key"], "new-homepage");

    let r = ctx
        .anon
        .get(ctx.url(&format!("{flags}/new-homepage")))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "get flag");
    assert_eq!(r.json::<Value>().await.unwrap()["rollout_percentage"], 50);

    let list: Value = ctx
        .anon
        .get(ctx.url(&flags))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        list.as_array()
            .unwrap()
            .iter()
            .any(|f| f["key"] == "new-homepage"),
        "list contains created flag"
    );

    // PATCH applies immediately (Production has no approval requirement yet).
    let r = ctx
        .anon
        .patch(ctx.url(&format!("{flags}/new-homepage")))
        .bearer_auth(sdk_key)
        .json(&json!({ "is_enabled": false }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "patch flag applied");
    assert_eq!(r.json::<Value>().await.unwrap()["is_enabled"], false);

    let r = ctx
        .anon
        .delete(ctx.url(&format!("{flags}/new-homepage")))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap();
    assert!(r.status().is_success(), "delete flag");

    let r = ctx
        .anon
        .get(ctx.url(&format!("{flags}/new-homepage")))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404, "deleted flag is gone");
}

// --- Segment CRUD ----------------------------------------------------------

async fn segment_crud(ctx: &Ctx, sdk_key: &str, env: &str) {
    let segs = format!("/api/environments/{env}/segments");
    let r = ctx
        .anon
        .post(ctx.url(&segs))
        .bearer_auth(sdk_key)
        .json(&json!({
            "key": "internal",
            "name": "Internal",
            "rules": [{ "attribute": "email", "operator": "ends_with", "values": ["@acme.test"] }]
        }))
        .send()
        .await
        .unwrap();
    assert!(r.status().is_success(), "create segment: {}", r.status());

    let r = ctx
        .anon
        .get(ctx.url(&format!("{segs}/internal")))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "get segment");
    assert_eq!(r.json::<Value>().await.unwrap()["name"], "Internal");

    let r = ctx
        .anon
        .delete(ctx.url(&format!("{segs}/internal")))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap();
    assert!(r.status().is_success(), "delete segment");
}

// --- Impressions, exposure, events, experiments ----------------------------

async fn analytics_and_experiments(ctx: &Ctx, sdk_key: &str, env: &str) {
    let base = format!("/api/environments/{env}");

    // A string flag with two variants to experiment on.
    let r = ctx
        .anon
        .post(ctx.url(&format!("{base}/flags")))
        .bearer_auth(sdk_key)
        .json(&json!({
            "key": "exp-flag",
            "is_enabled": true,
            "rollout_percentage": null,
            "description": "experiment",
            "flag_type": "string",
            "default_value": "control",
            "variants": [
                { "weight": 50, "value": "control" },
                { "weight": 50, "value": "treatment" }
            ]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "create experiment flag");

    // Ingest impressions: u1/u2 on control, u3/u4 on treatment.
    let impressions = json!([
        { "flag_key": "exp-flag", "user_id": "u1", "value": "control" },
        { "flag_key": "exp-flag", "user_id": "u2", "value": "control" },
        { "flag_key": "exp-flag", "user_id": "u3", "value": "treatment" },
        { "flag_key": "exp-flag", "user_id": "u4", "value": "treatment" },
    ]);
    let r = ctx
        .anon
        .post(ctx.url(&format!("{base}/impressions")))
        .bearer_auth(sdk_key)
        .json(&impressions)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204, "ingest impressions");

    // Stats + exposure reflect the ingested data.
    let stats: Value = ctx
        .anon
        .get(ctx.url(&format!("{base}/impressions/stats")))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        stats
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["flag_key"] == "exp-flag" && s["total"] == 4),
        "impression stats: {stats}"
    );

    let exposure: Value = ctx
        .anon
        .get(ctx.url(&format!("{base}/impressions/exposure?flag_key=exp-flag")))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        exposure["total_impressions"], 4,
        "exposure totals: {exposure}"
    );
    assert_eq!(exposure["variants"].as_array().unwrap().len(), 2);

    // Goal events: u1 and u3 convert.
    let events = json!([
        { "event_key": "checkout", "user_id": "u1" },
        { "event_key": "checkout", "user_id": "u3" },
    ]);
    let r = ctx
        .anon
        .post(ctx.url(&format!("{base}/events")))
        .bearer_auth(sdk_key)
        .json(&events)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204, "ingest events");

    let keys: Value = ctx
        .anon
        .get(ctx.url(&format!("{base}/events/keys")))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        keys.as_array()
            .unwrap()
            .iter()
            .any(|k| k["event_key"] == "checkout"),
        "event keys: {keys}"
    );

    // Create the experiment and read its results.
    let r = ctx
        .anon
        .post(ctx.url(&format!("{base}/experiments")))
        .bearer_auth(sdk_key)
        .json(&json!({
            "key": "exp1",
            "name": "Checkout experiment",
            "flag_key": "exp-flag",
            "goal_event_key": "checkout"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "create experiment");

    let results: Value = ctx
        .anon
        .get(ctx.url(&format!("{base}/experiments/exp1/results")))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    // 4 users exposed, 2 converted (one per variant), split across 2 variants.
    assert_eq!(results["total_exposed"], 4, "experiment results: {results}");
    assert_eq!(
        results["total_converted"], 2,
        "experiment results: {results}"
    );
    assert_eq!(results["variants"].as_array().unwrap().len(), 2);
}

// --- Poll-fallback snapshot ------------------------------------------------

async fn snapshot(ctx: &Ctx, sdk_key: &str) {
    let r = ctx
        .anon
        .get(ctx.url("/flags/snapshot"))
        .bearer_auth(sdk_key)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "flags snapshot");
    assert!(
        r.json::<Value>().await.unwrap().is_array(),
        "snapshot is an array"
    );
}

// --- RBAC + change-request approval gate -----------------------------------

async fn rbac_and_change_requests(ctx: &Ctx, env: &str) {
    // Admin creates a viewer user.
    let r = ctx
        .sess
        .post(ctx.url("/api/users"))
        .header("X-Checkgate-Request", "true")
        .json(&json!({
            "name": "Val Viewer",
            "email": "viewer@acme.test",
            "role": "viewer",
            "password": "supersecret1"
        }))
        .send()
        .await
        .unwrap();
    assert!(
        r.status().is_success(),
        "admin creates viewer: {}",
        r.status()
    );

    // Viewer logs in (own cookie jar) and is forbidden from writing flags.
    let viewer = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    let r = viewer
        .post(ctx.url("/api/auth/login"))
        .header("X-Checkgate-Request", "true")
        .json(&json!({ "email": "viewer@acme.test", "password": "supersecret1" }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "viewer login");

    let r = viewer
        .post(ctx.url(&format!("/api/environments/{env}/flags")))
        .header("X-Checkgate-Request", "true")
        .json(&json!({ "key": "sneaky", "is_enabled": true, "flag_type": "boolean", "rules": [] }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403, "viewer cannot create flags");

    // Enable approval on Production, then an admin PATCH is queued (202), not applied.
    let projects: Value = ctx
        .sess
        .get(ctx.url("/api/projects"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let project_id = projects[0]["id"].as_str().unwrap().to_string();

    // Seed a flag to modify under approval.
    ctx.sess
        .post(ctx.url(&format!("/api/environments/{env}/flags")))
        .header("X-Checkgate-Request", "true")
        .json(&json!({ "key": "gated", "is_enabled": true, "flag_type": "boolean", "rules": [] }))
        .send()
        .await
        .unwrap();

    let r = ctx
        .sess
        .post(ctx.url(&format!(
            "/api/projects/{project_id}/environments/{env}/require-approval"
        )))
        .header("X-Checkgate-Request", "true")
        .json(&json!({ "require_approval": true }))
        .send()
        .await
        .unwrap();
    assert!(r.status().is_success(), "enable approval: {}", r.status());

    let r = ctx
        .sess
        .patch(ctx.url(&format!("/api/environments/{env}/flags/gated")))
        .header("X-Checkgate-Request", "true")
        .json(&json!({ "is_enabled": false }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 202, "patch under approval is queued");

    let crs: Value = ctx
        .sess
        .get(ctx.url(&format!("/api/environments/{env}/change-requests")))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        !crs.as_array().unwrap().is_empty(),
        "a pending change request exists: {crs}"
    );
}
