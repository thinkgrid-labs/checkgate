# Core Concepts

## Flags

A feature flag is the central object in Checkgate. Every flag has:

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | Unique identifier (e.g. `new-checkout-flow`) |
| `is_enabled` | `boolean` | Master on/off switch |
| `rollout_percentage` | `number \| null` | 0–100 percentage rollout, or null for 100% |
| `description` | `string \| null` | Human-readable description |
| `rules` | `TargetingRule[]` | Optional targeting rules |

### Flag Key Naming

Use lowercase kebab-case for flag keys: `new-checkout-flow`, `beta-dashboard`, `dark-mode-v2`. Keys are immutable after creation — to rename a flag, delete and recreate it.

## Targeting Rules

Targeting rules let you enable a flag for specific users regardless of the rollout percentage.

A rule has three parts:

| Field | Type | Description |
|-------|------|-------------|
| `attribute` | `string` | User attribute to match (e.g. `email`, `plan`) |
| `operator` | `Operator` | How to compare the attribute |
| `values` | `string[]` | List of values to match against |

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match (any value in the list) | `plan` equals `["enterprise"]` |
| `not_equals` | No match in the list | `plan` not_equals `["free"]` |
| `contains` | Substring match | `email` contains `["@acme.com"]` |
| `starts_with` | Prefix match | `region` starts_with `["eu-"]` |
| `ends_with` | Suffix match | `email` ends_with `["@contractor.com"]` |

### Rule Evaluation

- Rules are evaluated in order; **first match wins**
- If a rule matches, the flag returns `true` immediately (bypasses rollout %)
- If no rule matches, evaluation falls through to the rollout percentage

### Example: Internal Beta

Enable a flag for all employees regardless of the 5% global rollout:

```json
{
  "key": "ai-assistant",
  "is_enabled": true,
  "rollout_percentage": 5,
  "rules": [
    {
      "attribute": "email",
      "operator": "ends_with",
      "values": ["@yourcompany.com"]
    }
  ]
}
```

Result:
- `alice@yourcompany.com` → `true` (rule match)
- `bob@customer.com` → 5% chance of `true` (rollout hash)

## Rollout Percentage

The rollout percentage enables gradual feature releases. Checkgate uses **deterministic consistent hashing** (MurmurHash3) to assign users to buckets:

- The same user always gets the same result for the same flag
- Buckets are stable across restarts and server instances
- Increasing from 10% to 20% enables the flag for a new cohort without disrupting the existing 10%

### Special Values

- `null` (no rollout) — effectively 100%; all users get `true` if enabled
- `0` — no one gets `true` (useful to disable without deleting)
- `100` — everyone gets `true`

## User Context

When evaluating a flag, you provide a user context:

```typescript
client.isEnabled('flag-key', 'user-id', {
  email: 'alice@example.com',
  plan: 'pro',
  region: 'eu-west-1',
})
```

- `user-id` — the stable identifier used for rollout hashing (typically your database user ID or UUID)
- Attributes — arbitrary key-value pairs used for targeting rule matching

Attributes are **never sent to the server** — they are only used locally for rule evaluation.

## SSE Stream

The SSE stream (`GET /stream`) is the connection between the server and each SDK client. It uses the W3C Server-Sent Events standard.

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `"true"` | Connection established; SDK resets its store |
| `update` | JSON string | A flag was upserted or deleted |
| (keep-alive) | `keep-alive-text` | Heartbeat every 15 seconds |

### Update Payload

```json
// Upsert
{"type": "UPSERT", "flag": { ...flag object... }}

// Delete
{"type": "DELETE", "key": "flag-key"}
```

## Authentication

Set `SDK_KEY` on the server to require authentication. All requests to `/api/*` and `/stream` must include:

```
Authorization: Bearer <SDK_KEY>
```

Without `SDK_KEY`, the server runs in open mode (suitable for local development only).
