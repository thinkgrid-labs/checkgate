---
title: "REST API Reference — Checkgate Feature Flag Management API"
description: "Complete REST API reference for Checkgate. Manage feature flags, environments, users, and SDK keys via CRUD endpoints. Connect to the SSE stream for real-time updates."
---

# REST API Reference

## Base URL

```
http://your-checkgate-server:3000
```

## Authentication

All protected endpoints require one of:

```http
Authorization: Bearer sk_live_your_sdk_key
```

or an active session cookie set by `POST /api/auth/login`.

Dashboard mutation requests also require:

```http
X-Checkgate-Request: true
```

This header is required for all state-changing requests from browser clients (CSRF protection). SDK clients using `Authorization: Bearer` are exempt.

---

## Auth

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

**Request Body**

```json
{
  "email": "admin@example.com",
  "password": "your-password"
}
```

**Response** `200 OK`

```json
{
  "email": "admin@example.com",
  "name": "Jane Smith",
  "role": "admin",
  "workspace_name": "Acme Corp"
}
```

Sets an `HttpOnly` `SameSite=Strict` session cookie valid for 7 days.

**Response** `401 Unauthorized`

```json
{
  "error": "Incorrect email or password.",
  "attempts_remaining": 4
}
```

**Response** `429 Too Many Requests` — account locked after 5 failures in 10 minutes.

```json
{
  "error": "Too many failed attempts. Account locked for 15 minutes.",
  "retry_after_seconds": 900
}
```

---

### Logout

```http
POST /api/auth/logout
```

Clears the session cookie.

**Response** `204 No Content`

---

### Get Current User

```http
GET /api/auth/me
```

**Response** `200 OK` — returns the authenticated user (same shape as login response).

**Response** `401 Unauthorized` — no valid session.

---

### Workspace Info

```http
GET /api/auth/workspace
```

Public endpoint — no auth required. Returns the workspace name for the login page.

**Response** `200 OK`

```json
{ "workspace_name": "Acme Corp" }
```

---

## Environments

### List Environments

```http
GET /api/environments
```

**Response** `200 OK`

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Production",
    "slug": "production",
    "color": "#ef4444",
    "is_default": false,
    "created_at": "2026-04-10T00:00:00Z"
  }
]
```

---

### Create Environment

```http
POST /api/environments
Content-Type: application/json
```

**Request Body**

```json
{
  "name": "Canary",
  "slug": "canary",
  "color": "#f59e0b"
}
```

- `name` — required, max 100 characters
- `slug` — required, max 64 characters, lowercase alphanumerics and hyphens only
- `color` — optional, must be a valid hex color (`#rgb` or `#rrggbb`); defaults to `#6366f1`

**Response** `200 OK` — returns the created environment.

**Response** `409 Conflict` — slug already exists.

---

### Delete Environment

```http
DELETE /api/environments/{id}
```

**Response** `204 No Content`

**Response** `422 Unprocessable Entity` — cannot delete the default or the last environment.

---

### Set Default Environment

```http
POST /api/environments/{id}/default
```

**Response** `200 OK` — returns the updated environment with `is_default: true`.

---

## Flags

All flag endpoints are scoped to an environment via `{env_id}` (UUID).

### List Flags

```http
GET /api/environments/{env_id}/flags
```

**Query Parameters**

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `200` | Max results to return |
| `offset` | `0` | Pagination offset |

**Response** `200 OK`

```json
[
  {
    "key": "new-checkout-flow",
    "is_enabled": true,
    "rollout_percentage": 50,
    "description": "New checkout UI rollout",
    "rules": []
  }
]
```

**Response** `404 Not Found` — environment does not exist.

---

### Get a Flag

```http
GET /api/environments/{env_id}/flags/{key}
```

**Response** `200 OK` — returns the flag object.

**Response** `404 Not Found` — flag or environment does not exist.

---

### Create or Replace a Flag

```http
POST /api/environments/{env_id}/flags
Content-Type: application/json
```

Creates a flag. If the key already exists in this environment, replaces it entirely.

**Request Body**

```json
{
  "key": "new-checkout-flow",
  "is_enabled": true,
  "rollout_percentage": 50,
  "description": "New checkout UI rollout",
  "rules": []
}
```

**Response** `200 OK` — returns the created flag.

**Response** `422 Unprocessable Entity` — invalid flag key or `rollout_percentage` out of range.

---

### Partially Update a Flag

```http
PATCH /api/environments/{env_id}/flags/{key}
Content-Type: application/json
```

Applies a JSON merge patch. Only the provided fields are updated; omitted fields retain their current values.

```json
{ "rollout_percentage": 100 }
```

```json
{ "is_enabled": false }
```

**Response** `200 OK` — returns the updated flag.

**Response** `404 Not Found` — flag does not exist.

---

### Delete a Flag

```http
DELETE /api/environments/{env_id}/flags/{key}
```

Deletes the flag from this environment. Broadcasts a `DELETE` event to connected SDK clients.

**Response** `204 No Content`

---

### Promote a Flag

```http
POST /api/environments/{env_id}/flags/{key}/promote
Content-Type: application/json
```

Copies the flag's configuration from `{env_id}` to another environment atomically.

**Request Body**

```json
{ "target_env_id": "uuid-of-target-environment" }
```

**Response** `200 OK` — returns the flag as it now exists in the target environment.

---

## Flag Schema

### Flag Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Unique within environment. Alphanumerics, underscores, hyphens. Max 100 chars. |
| `is_enabled` | `boolean` | Yes | Master switch. `false` always evaluates to `false`. |
| `rollout_percentage` | `integer \| null` | No | 0–100. `null` is treated as 100%. |
| `description` | `string \| null` | No | Human-readable description. |
| `rules` | `TargetingRule[]` | No | Targeting rules. Defaults to `[]`. |

### TargetingRule Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `attribute` | `string` | Yes | User attribute name to match against. |
| `operator` | `Operator` | Yes | Comparison operator. |
| `values` | `string[]` | Yes | One or more values to match. At least one must match. |

### Operator Enum

| Value | Description |
|-------|-------------|
| `equals` | Attribute value equals any of the provided values |
| `not_equals` | Attribute value does not equal any of the provided values |
| `contains` | Attribute value contains any of the provided values as a substring |
| `starts_with` | Attribute value starts with any of the provided values |
| `ends_with` | Attribute value ends with any of the provided values |

---

## Impressions

### Ingest Impressions

```http
POST /api/environments/{env_id}/impressions
Authorization: Bearer sk_live_your_key
Content-Type: application/json
```

Reports a batch of flag evaluation events from an SDK client. Authenticated with an SDK key; does not require admin role. CSRF header not required for Bearer-authenticated requests.

**Request Body** — array of up to 500 impression objects

```json
[
  {
    "flag_key": "checkout_v2",
    "user_id": "user-123",
    "value": "true",
    "context": { "plan": "pro" },
    "evaluated_at": "2026-04-18T10:00:00Z"
  }
]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `flag_key` | `string` | Yes | The evaluated flag key |
| `user_id` | `string \| null` | No | User identifier; `null` for anonymous |
| `value` | `string` | Yes | Evaluation result (e.g. `"true"`, `"false"`) |
| `context` | `object \| null` | No | Evaluation context attributes |
| `evaluated_at` | ISO-8601 string | No | Defaults to server receive time |

**Response** `204 No Content`

**Response** `413 Payload Too Large` — batch exceeds 500 items.

---

### List Impressions

```http
GET /api/environments/{env_id}/impressions
```

**Query Parameters**

| Param | Default | Description |
|-------|---------|-------------|
| `flag_key` | — | Filter by flag key |
| `limit` | `50` | Max results (1–200) |
| `offset` | `0` | Pagination offset |

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "flag_key": "checkout_v2",
      "user_id": "user-123",
      "value": "true",
      "context": { "plan": "pro" },
      "evaluated_at": "2026-04-18T10:00:00Z"
    }
  ],
  "total": 142
}
```

---

### Impression Stats

```http
GET /api/environments/{env_id}/impressions/stats
```

Returns per-flag aggregate counts.

**Response** `200 OK`

```json
[
  {
    "flag_key": "checkout_v2",
    "total": 1420,
    "true_count": 750,
    "false_count": 670,
    "unique_users": 89,
    "last_seen": "2026-04-18T10:30:00Z"
  }
]
```

---

## SDK Keys

### List Keys

```http
GET /api/keys
```

Returns all SDK keys. The full key value is never returned after creation.

**Response** `200 OK`

```json
[
  {
    "id": 1,
    "name": "Default",
    "prefix": "sk_live_a1b2c3…",
    "created_at": "2026-04-10T00:00:00Z"
  }
]
```

---

### Create Key

```http
POST /api/keys
Content-Type: application/json
```

```json
{ "name": "Production Server" }
```

**Response** `200 OK` — returns the key including the full value (shown once only).

```json
{
  "id": 2,
  "name": "Production Server",
  "key": "sk_live_a1b2c3d4e5f6...",
  "prefix": "sk_live_a1b2c3…",
  "created_at": "2026-04-18T12:00:00Z"
}
```

---

### Revoke Key

```http
DELETE /api/keys/{id}
```

**Response** `204 No Content`

**Response** `422 Unprocessable Entity` — cannot revoke the last key.

---

## Users

### List Users

```http
GET /api/users
```

**Response** `200 OK`

```json
[
  {
    "id": 1,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "admin",
    "created_at": "2026-04-10T00:00:00Z"
  }
]
```

---

### Create User

```http
POST /api/users
Content-Type: application/json
```

```json
{
  "name": "Bob Jones",
  "email": "bob@example.com",
  "role": "viewer",
  "password": "their-initial-password"
}
```

- `role` must be `"admin"` or `"viewer"`
- `password` must be at least 8 characters

**Response** `200 OK` — returns the created user (password hash is never returned).

**Response** `409 Conflict` — email already exists.

---

### Delete User

```http
DELETE /api/users/{id}
```

**Response** `204 No Content`

**Response** `422 Unprocessable Entity` — cannot delete yourself or the last admin.

---

## SSE Stream

### Connect

```http
GET /stream
Authorization: Bearer sk_live_your_key
Accept: text/event-stream
```

Or for browser `EventSource`:

```
GET /stream?sdk_key=sk_live_your_key
```

Opens a persistent SSE connection. The server sends:

1. A `connected` event immediately
2. One `update` event per existing flag (bootstrap)
3. `update` events as flags change in real time
4. Keep-alive comments every 15 seconds

### Event: `connected`

```
event: connected
data: true
```

Sent once when the connection is established. SDK clients should clear their local store on receiving this event to prepare for a clean bootstrap.

### Event: `update`

```
event: update
data: {"type":"UPSERT","env_id":"<uuid>","flag":{"key":"my-flag","is_enabled":true,...}}
```

```
event: update
data: {"type":"DELETE","env_id":"<uuid>","key":"my-flag"}
```

### Keep-Alive

```
: keep-alive-text
```

Sent every 15 seconds to prevent proxy timeouts.

### Reconnection

If the SSE connection drops, clients should reconnect with exponential backoff. On reconnect:

1. Server sends `connected` → SDK clears local store
2. Server replays all current flags → SDK rebuilds from scratch

This guarantees consistency even after missed updates during the disconnected period.

---

## Health Check

```http
GET /health
```

Public endpoint — no authentication required.

**Response** `200 OK` — body: `OK`

Use this for load balancer and container health checks.
