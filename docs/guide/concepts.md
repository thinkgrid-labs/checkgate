---
title: "Core Concepts — Projects, Environments, Flags, Targeting & Rollouts"
description: "Understand Checkgate's building blocks: the workspace/project/environment hierarchy, flag schema, targeting rule operators, deterministic rollout hashing, user context, impression tracking, and the SSE update channel."
---

# Core Concepts

## Hierarchy

Checkgate organizes everything into a four-level hierarchy:

```
Workspace (singleton — one per installation)
  └── Projects  (e.g. "Mobile App", "Web App", "API Service")
        ├── Members  (per-project user roles)
        └── Environments  (e.g. Production, Staging, Development)
              ├── SDK Keys  (per-environment, auth for SDK clients)
              ├── Flags     (per-environment configuration)
              └── Impressions
```

Each **project** is a fully isolated space: its own environments, flags, SDK keys, and team members. Changes in one project never affect another.

## Projects

A project represents a single application or service. You might have separate projects for your mobile app, your backend API, and an internal tooling suite — each with independent flag configurations and team membership.

### Creating Projects

The first project is created during the **setup wizard**. Additional projects can be added from the **Projects** page (admin only). Each new project is automatically seeded with three environments: Production, Staging, and Development.

### Project Membership

Users can be members of one or more projects with a per-project role. A **workspace admin** always has full access to all projects regardless of membership.

## Environments

Environments are isolated flag namespaces within a project. Every flag belongs to exactly one environment, so Production, Staging, and Development each have their own independent configuration.

Three environments are seeded automatically when a project is created:

| Environment | Color | Notes |
|-------------|-------|-------|
| Production | Red | |
| Staging | Amber | |
| Development | Green | Default — used when no environment is specified |

The active environment is shown in the dashboard sidebar and can be switched at any time. The **Promote** action copies a flag's configuration from one environment to another in a single atomic transaction.

## Flags

A feature flag is the central object in Checkgate. Every flag has:

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | Unique identifier within an environment (e.g. `new-checkout-flow`) |
| `is_enabled` | `boolean` | Master on/off switch |
| `rollout_percentage` | `number \| null` | 0–100 percentage rollout, or null for 100% |
| `description` | `string \| null` | Human-readable description |
| `rules` | `TargetingRule[]` | Optional targeting rules |

### Flag Key Naming

Use lowercase kebab-case or snake_case for flag keys: `new-checkout-flow`, `beta_dashboard`, `dark-mode-v2`. Keys must contain only ASCII alphanumerics, underscores, or hyphens, and are at most 100 characters. Keys are immutable after creation — to rename a flag, delete and recreate it.

Flag keys are unique **per environment**. The same key can exist in multiple environments with different configurations.

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
- A user missing the targeted attribute satisfies `not_equals` (they are "not X"), but fails all other operators

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

## Impression Tracking

SDKs can report flag evaluation events back to the server asynchronously. This powers the **Impressions** dashboard page.

An impression payload:

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

- Sent as a batch `POST` to `/api/environments/{env_id}/impressions`
- Authenticated with an SDK Bearer key
- Fire-and-forget — evaluation is never blocked waiting for the report
- Up to 500 impressions per batch

### Impressions Dashboard

The Impressions page has two tabs:

**Analytics** — aggregate statistics per flag: total evaluations, true/false split, unique user count, last seen timestamp.

**Stream** — a live evaluation log that auto-refreshes every 3 seconds. Useful for debugging "why isn't this flag working for that user?". Filters by flag key, user ID, and evaluated value. Click any row to expand the full evaluation context JSON.

## Users and Roles

Checkgate has three roles:

| Role | Access |
|------|--------|
| `admin` | Full access: create/edit/delete flags, manage environments, users, projects, and SDK keys |
| `editor` | Can create and edit flags; cannot manage users, projects, or SDK keys |
| `viewer` | Read-only access to flags and impressions |

### Workspace Admin vs Project Member

- A **workspace admin** has full access to all projects, environments, and users.
- Other users are granted access per-project via the **Members** tab in Project Settings. Each project membership has its own role (`admin`, `editor`, or `viewer`) that is independent of any other project.
- Removing a user from a project revokes their access to that project's flags and environments; it does not delete their account.

Users authenticate with **email and password** through the dashboard login page. The first admin account is created during the setup wizard. Additional users are managed from the **Users** page (workspace admin only).

User sessions are stored in an HttpOnly, AES-256-GCM encrypted cookie with a 7-day TTL.

## SDK Keys

SDK keys (`sk_live_...`) authenticate SDK clients and programmatic API access. Each key is tied to a specific **environment** — so the key implicitly identifies both the project and the environment that SDK clients will receive flags from.

- Keys are managed from the **Project Settings → SDK Keys** tab
- Multiple keys per project are supported (e.g. one per service or platform)
- One key is auto-generated for the Production environment on first boot
- Keys are shown in full only once — copy them immediately after creation
- Revoking a key invalidates it instantly; SDK clients using it will receive 401 errors
- The legacy `SDK_KEY` environment variable is also accepted for backwards compatibility

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
{"type": "UPSERT", "env_id": "<uuid>", "flag": { ...flag object... }}

// Delete
{"type": "DELETE", "env_id": "<uuid>", "key": "flag-key"}
```

The stream is **scoped to the environment identified by the SDK key**. When a client connects, the server looks up the key's `environment_id`, bootstraps only the flags for that environment, and filters all live updates to that environment. Clients only ever see flags for their own project and environment.

## Authentication

Checkgate uses two separate authentication mechanisms:

### Dashboard Users (Session Cookie)

Human users log in with **email and password** at `/login`. On success, the server issues an HttpOnly encrypted session cookie (`lg_session`). The cookie is:

- `HttpOnly` — not accessible to JavaScript
- `SameSite=Strict` — not sent on cross-origin requests (primary CSRF protection)
- AES-256-GCM encrypted — tamper-proof
- Valid for 7 days

### SDK Clients (Bearer Token)

SDK clients and CI/CD automation authenticate with an SDK key:

```http
Authorization: Bearer sk_live_your_key_here
```

For browser `EventSource` connections that cannot set custom headers, the key can also be passed as a query parameter:

```
GET /stream?sdk_key=sk_live_your_key_here
```

All API and stream endpoints require authentication. There is no "open mode."
