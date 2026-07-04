use crate::state::AppState;
use axum::{
    extract::{FromRef, FromRequestParts, State},
    http::{Request, StatusCode, request::Parts},
    middleware::Next,
    response::Response,
};
use axum_extra::extract::cookie::{Key, PrivateCookieJar};
use constant_time_eq::constant_time_eq;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::convert::Infallible;
use tracing::warn;

/// Minimal view of the session cookie — only role is needed for middleware access checks.
#[derive(Deserialize)]
struct RoleClaims {
    role: String,
}

/// Full session claims — used by handlers that need the caller's email/role.
#[derive(Deserialize, Clone)]
pub(crate) struct SessionClaims {
    pub email: String,
    #[allow(dead_code)]
    pub name: String,
    pub role: String,
}

/// Identity resolved from a validated personal access token — inserted into
/// request extensions by `require_auth` so `require_editor`/`require_admin`
/// (and, via [`AuthContext`], handler-level project-membership checks) can see
/// it without a second database round-trip.
///
/// Unlike an SDK key (always admin-equivalent), a PAT acts *as its owning
/// user* — same role, same project memberships — capped by `scope`.
#[derive(Clone)]
pub(crate) struct PatIdentity {
    pub claims: SessionClaims,
    /// `"read_only"` or `"read_write"`.
    pub scope: String,
}

/// Extract the SDK key from a request — Bearer header takes priority over the
/// `?sdk_key=` query param fallback used by browser EventSource clients.
/// Returns `None` if neither is present.
fn extract_sdk_key<'a>(headers: &'a axum::http::HeaderMap, query: &'a str) -> Option<&'a str> {
    if let Some(bearer) = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    {
        return Some(bearer);
    }
    query.split('&').find_map(|p| p.strip_prefix("sdk_key="))
}

/// Extract a bearer token — unlike [`extract_sdk_key`], PATs are never
/// accepted via `?sdk_key=` query param (that fallback exists only for
/// SSE/EventSource, which PATs — automation credentials that can always set
/// headers — have no need of). Keeping PATs header-only avoids the exact
/// access-log/proxy-log exposure risk already known to affect SDK keys.
fn extract_bearer(headers: &axum::http::HeaderMap) -> Option<&str> {
    headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
}

pub(crate) fn hash_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Looks up a bearer token against `personal_access_tokens`. Returns `Ok(None)`
/// if the token doesn't match any live (non-expired) token — a normal "not a
/// PAT" outcome, not an error. Returns `Err` only on genuine DB failure.
async fn resolve_pat(db: &sqlx::PgPool, token: &str) -> Result<Option<PatIdentity>, ()> {
    let hash = hash_token(token);
    let row = sqlx::query(
        "SELECT pat.id, pat.scope, u.email, u.name, u.role \
         FROM personal_access_tokens pat JOIN users u ON u.id = pat.user_id \
         WHERE pat.token_hash = $1 AND (pat.expires_at IS NULL OR pat.expires_at > NOW())",
    )
    .bind(&hash)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        warn!(error = %e, "DB error resolving personal access token");
    })?;

    let Some(row) = row else {
        return Ok(None);
    };

    let id: i64 = row.get("id");
    // Best-effort — a failed timestamp update must never block the request.
    let _ = sqlx::query("UPDATE personal_access_tokens SET last_used_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(db)
        .await;

    Ok(Some(PatIdentity {
        claims: SessionClaims {
            email: row.get("email"),
            name: row.get("name"),
            role: row.get("role"),
        },
        scope: row.get("scope"),
    }))
}

/// Extract session claims from the private cookie jar.
/// Returns `None` if the request used SDK key or PAT auth (no session cookie present).
fn get_cookie_claims(jar: &PrivateCookieJar) -> Option<SessionClaims> {
    jar.get("lg_session")
        .and_then(|c| serde_json::from_str::<SessionClaims>(c.value()).ok())
}

/// Bundles the session cookie jar with any PAT identity resolved by
/// `require_auth` for this request. Handlers that previously took a bare
/// `PrivateCookieJar` and called `get_session_claims(&jar)` can swap the
/// parameter type to `AuthContext` and keep everything else unchanged —
/// `get_session_claims` now transparently covers both session-cookie and
/// personal-access-token identities.
#[derive(Clone)]
pub(crate) struct AuthContext {
    jar: PrivateCookieJar,
    pat: Option<PatIdentity>,
}

impl<S> FromRequestParts<S> for AuthContext
where
    S: Send + Sync,
    Key: FromRef<S>,
{
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let jar = PrivateCookieJar::from_request_parts(parts, state).await?;
        let pat = parts.extensions.get::<PatIdentity>().cloned();
        Ok(AuthContext { jar, pat })
    }
}

/// Resolves the caller's identity: session cookie takes priority (matches the
/// existing `require_auth` precedence), falling back to a PAT identity stashed
/// into request extensions by `require_auth`. Returns `None` for SDK-key auth
/// (no per-user identity — treated as admin-equivalent by callers, unchanged).
pub(crate) fn get_session_claims(ctx: &AuthContext) -> Option<SessionClaims> {
    get_cookie_claims(&ctx.jar).or_else(|| ctx.pat.clone().map(|p| p.claims))
}

/// Returns the scope of the personal access token that authenticated this
/// request, or `None` if the caller used a session cookie or SDK key instead
/// (both uncapped — a session already carries full user identity, and an SDK
/// key is a separate, admin-equivalent credential class).
///
/// Used to stop a `read_only` PAT from minting a `read_write` PAT for the
/// same user — without this cap, a leaked read-only token could self-escalate
/// by simply creating a more privileged replacement.
pub(crate) fn pat_scope(ctx: &AuthContext) -> Option<&str> {
    if get_cookie_claims(&ctx.jar).is_some() {
        return None;
    }
    ctx.pat.as_ref().map(|p| p.scope.as_str())
}

/// Validates a request using either:
///
/// 1. **Session cookie** (`lg_session`) — set by `POST /api/auth/login`.
///    Used by the dashboard SPA. The cookie is HttpOnly + encrypted.
///
/// 2. **Bearer token** (`Authorization: Bearer <key>`) — for SDK clients.
///
/// 3. **`?sdk_key=` query param** — fallback for browser `EventSource` which
///    cannot set custom headers. Exposes the key in access/proxy logs; only
///    use for SSE where headers cannot be set.
///
/// Returns 503 if no SDK keys are configured (should never happen in normal
/// operation — we always generate an initial key on first boot).
/// Returns 401 if credentials are absent or invalid.
pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let key_values: Vec<String> = {
        let keys = state.sdk_keys.read().await;
        if keys.is_empty() {
            // No keys at all — deny every request rather than allowing an
            // open-door state. This should never occur in production.
            warn!("No SDK keys configured — all API requests denied");
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        keys.iter().map(|e| e.value.clone()).collect()
    };

    // ── 1. HttpOnly session cookie (dashboard) ────────────────────────────────
    let jar = PrivateCookieJar::from_headers(req.headers(), state.session_key.clone());
    if jar.get("lg_session").is_some() {
        return Ok(next.run(req).await);
    }

    // ── 2 & 3. Bearer token or ?sdk_key= query param ────────────────────────
    let query = req.uri().query().unwrap_or("");
    if let Some(key) = extract_sdk_key(req.headers(), query)
        && key_values
            .iter()
            .any(|expected| constant_time_eq(key.as_bytes(), expected.as_bytes()))
    {
        return Ok(next.run(req).await);
    }

    // ── 4. Personal access token (Bearer only — never via query param) ───────
    if let Some(token) = extract_bearer(req.headers())
        && let Ok(Some(pat)) = resolve_pat(&state.db, token).await
    {
        req.extensions_mut().insert(pat);
        return Ok(next.run(req).await);
    }

    warn!(
        method = %req.method(),
        path = %req.uri().path(),
        "Rejected request: missing or invalid credentials"
    );

    Err(StatusCode::UNAUTHORIZED)
}

/// Requires admin-level access.
///
/// SDK key auth (Bearer / query param) is always treated as admin-equivalent —
/// these are machine credentials intentionally managed by an operator.
/// Session-based auth must have `role = "admin"` stored in the encrypted cookie
/// (populated from the DB at login time — the client cannot forge this).
///
/// This middleware should be layered *inside* `require_auth` so that unauthenticated
/// requests are already rejected before the role check runs.
pub async fn require_admin(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let key_values: Vec<String> = {
        let keys = state.sdk_keys.read().await;
        keys.iter().map(|e| e.value.clone()).collect()
    };

    // SDK key (Bearer or query param) → admin-equivalent.
    let query = req.uri().query().unwrap_or("");
    if let Some(key) = extract_sdk_key(req.headers(), query)
        && key_values
            .iter()
            .any(|expected| constant_time_eq(key.as_bytes(), expected.as_bytes()))
    {
        return Ok(next.run(req).await);
    }

    // Session cookie: must carry role=admin (set from DB on login).
    let jar = PrivateCookieJar::from_headers(req.headers(), state.session_key.clone());
    if let Some(cookie) = jar.get("lg_session")
        && let Ok(claims) = serde_json::from_str::<RoleClaims>(cookie.value())
    {
        if claims.role == "admin" {
            return Ok(next.run(req).await);
        }
        warn!(
            method = %req.method(),
            path = %req.uri().path(),
            role = %claims.role,
            "Forbidden: admin role required"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    // Personal access token: must be read_write scope AND the owning user's
    // role must be admin. `require_auth` already validated and stashed this.
    if let Some(pat) = req.extensions().get::<PatIdentity>() {
        if pat.scope == "read_write" && pat.claims.role == "admin" {
            return Ok(next.run(req).await);
        }
        warn!(
            method = %req.method(),
            path = %req.uri().path(),
            role = %pat.claims.role,
            scope = %pat.scope,
            "Forbidden: admin-scoped read_write personal access token required"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    // Reached only if require_auth somehow didn't run first.
    Err(StatusCode::UNAUTHORIZED)
}

/// Requires editor-level access (admin or editor role).
///
/// SDK key auth is treated as admin-equivalent (machine credentials).
/// Session-based auth passes if `role` is `"admin"` or `"editor"`.
/// Viewers get 403. Use this middleware for flag write routes.
pub async fn require_editor(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let key_values: Vec<String> = {
        let keys = state.sdk_keys.read().await;
        keys.iter().map(|e| e.value.clone()).collect()
    };

    // SDK key (Bearer or query param) → admin-equivalent.
    let query = req.uri().query().unwrap_or("");
    if let Some(key) = extract_sdk_key(req.headers(), query)
        && key_values
            .iter()
            .any(|expected| constant_time_eq(key.as_bytes(), expected.as_bytes()))
    {
        return Ok(next.run(req).await);
    }

    // Session cookie: admin or editor.
    let jar = PrivateCookieJar::from_headers(req.headers(), state.session_key.clone());
    if let Some(cookie) = jar.get("lg_session")
        && let Ok(claims) = serde_json::from_str::<RoleClaims>(cookie.value())
    {
        if claims.role == "admin" || claims.role == "editor" {
            return Ok(next.run(req).await);
        }
        warn!(
            method = %req.method(),
            path = %req.uri().path(),
            role = %claims.role,
            "Forbidden: editor or admin role required"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    // Personal access token: must be read_write scope AND the owning user's
    // role must be admin or editor.
    if let Some(pat) = req.extensions().get::<PatIdentity>() {
        if pat.scope == "read_write" && (pat.claims.role == "admin" || pat.claims.role == "editor")
        {
            return Ok(next.run(req).await);
        }
        warn!(
            method = %req.method(),
            path = %req.uri().path(),
            role = %pat.claims.role,
            scope = %pat.scope,
            "Forbidden: editor-scoped read_write personal access token required"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    Err(StatusCode::UNAUTHORIZED)
}
