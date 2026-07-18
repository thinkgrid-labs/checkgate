---
title: "Segments — Reusable Targeting Audiences"
description: "Define an audience like 'Internal Employees' or 'Beta Users' once as a Checkgate segment, then reference it from any flag instead of repeating targeting rules. Segments are expanded server-side so SDKs stay simple."
---

# Segments

A **segment** is a named, reusable set of [targeting rules](/guide/concepts#targeting-rules).
Instead of copy-pasting the same conditions into every flag ("email ends with @yourcompany.com"),
you define the audience once and reference it by key. Update the segment in one place and every
flag that uses it updates too.

## Defining a segment

Segments live per environment and have a `key`, a human-readable `name`, an optional
`description`, and a list of `rules` (the same rule shape flags use):

```json
{
  "key": "internal-employees",
  "name": "Internal employees",
  "description": "Anyone on a company email",
  "rules": [
    { "attribute": "email", "operator": "ends_with", "values": ["@yourcompany.com"] }
  ]
}
```

Manage them in the dashboard's **Segments** page, or via the
[REST API](/api-reference#segments) (`GET/POST/PATCH/DELETE /api/environments/{env_id}/segments`).
Creating or editing requires the `editor` or `admin` role.

## Referencing a segment from a flag

In a flag's rule list, use `segment_key` instead of an inline `attribute`/`operator`/`values`:

```json
{
  "key": "ai-assistant",
  "is_enabled": true,
  "rollout_percentage": 5,
  "rules": [
    { "segment_key": "internal-employees" }
  ]
}
```

You can mix segment references and inline rules freely, and a flag can reference multiple
segments. Rules are still evaluated in order, first match wins.

## How it works

- **Server-side expansion.** Before a flag is broadcast to SDKs (over SSE or the
  `/flags/snapshot` poll), the server replaces each `segment_key` reference with the segment's
  concrete rules. SDKs never see segments — they evaluate a plain, fully-expanded rule list, so
  there is zero SDK-side complexity or version coupling.
- **Automatic re-broadcast.** Editing or deleting a segment re-expands and re-publishes every
  flag that references it, so the audience change lands everywhere immediately.
- **Variant propagation.** A rule that references a `segment_key` can also carry a `variant`.
  That variant is applied to any of the segment's rules that don't already specify their own — so
  you can reuse an audience but return a different value per flag.

## When to use a segment vs. an inline rule

| Use a **segment** when… | Use an **inline rule** when… |
|---|---|
| The same audience is targeted by many flags | The condition is specific to one flag |
| The audience definition may change over time | The rule is a one-off |
| You want a single source of truth for "who is internal / beta / VIP" | You're prototyping a quick rollout |

## See also

- [Core Concepts → Targeting Rules](/guide/concepts#targeting-rules) — operators and rule semantics.
- [API Reference → Segments](/api-reference#segments) — the CRUD endpoints.
