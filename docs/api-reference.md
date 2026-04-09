# REST API Reference

The Checkgate server exposes a REST API for managing feature flags. All endpoints require the `Authorization: Bearer <SDK_KEY>` header when `SDK_KEY` is configured on the server.

## Base URL

```
http://your-checkgate-server:3000
```

## Authentication

```http
Authorization: Bearer your-sdk-key
```

When `SDK_KEY` is not set on the server, authentication is disabled (development mode only).

---

## Flags

### List All Flags

```http
GET /api/flags
```

Returns all flags from the in-memory store (served without a database round-trip).

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

---

### Get a Flag

```http
GET /api/flags/:key
```

**Response** `200 OK`

```json
{
  "key": "new-checkout-flow",
  "is_enabled": true,
  "rollout_percentage": 50,
  "description": "New checkout UI rollout",
  "rules": [
    {
      "attribute": "plan",
      "operator": "equals",
      "values": ["enterprise"]
    }
  ]
}
```

**Response** `404 Not Found` — flag does not exist.

---

### Create or Replace a Flag

```http
POST /api/flags
Content-Type: application/json
```

Creates a flag. If the key already exists, replaces it entirely.

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

---

### Partially Update a Flag

```http
PATCH /api/flags/:key
Content-Type: application/json
```

Applies a JSON merge patch. Only the provided fields are updated; omitted fields retain their current values.

**Request Body** (update only the rollout percentage)

```json
{
  "rollout_percentage": 100
}
```

**Request Body** (disable the flag)

```json
{
  "is_enabled": false
}
```

**Response** `200 OK` — returns the updated flag.

**Response** `404 Not Found` — flag does not exist.

---

### Delete a Flag

```http
DELETE /api/flags/:key
```

Deletes the flag from PostgreSQL, the in-memory store, and broadcasts a `DELETE` event to all connected SDK clients.

**Response** `204 No Content`

---

## Flag Schema

### Flag Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Unique identifier. Use kebab-case. |
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

## SSE Stream

### Connect

```http
GET /stream
Authorization: Bearer your-sdk-key
Accept: text/event-stream
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
data: {"type":"UPSERT","flag":{"key":"my-flag","is_enabled":true,...}}
```

```
event: update
data: {"type":"DELETE","key":"my-flag"}
```

#### UPSERT Payload

```json
{
  "type": "UPSERT",
  "flag": {
    "key": "new-checkout-flow",
    "is_enabled": true,
    "rollout_percentage": 50,
    "description": null,
    "rules": []
  }
}
```

#### DELETE Payload

```json
{
  "type": "DELETE",
  "key": "new-checkout-flow"
}
```

### Keep-Alive

```
: keep-alive-text
```

Sent every 15 seconds to prevent proxy timeouts. Clients should ignore this.

### Reconnection

If the SSE connection drops, clients should reconnect with exponential backoff. On reconnect:

1. Server sends `connected` → SDK clears local store
2. Server replays all current flags → SDK rebuilds from scratch

This guarantees consistency even after missed updates during the disconnected period.
