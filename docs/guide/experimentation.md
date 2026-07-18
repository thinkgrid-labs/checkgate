---
title: "Experimentation & Analytics — Exposure Dashboards and A/B Testing"
description: "Measure feature rollouts with Checkgate: impression analytics, exposure dashboards showing which users see which variant, and an A/B testing beta that ties flag variants to conversion goals and reports statistical significance."
---

# Experimentation & Analytics

Checkgate doesn't just decide flags — it helps you understand and measure them. Three layers
build on each other:

1. **Impressions** — every evaluation an SDK reports (the raw signal).
2. **Exposure dashboards** — which users are seeing which variant of a flag.
3. **A/B testing** — did a variant actually move a conversion goal, and is the result significant?

## Weighted Variants

Experiments start with **multivariate flags**. A string, integer, or JSON flag can distribute
traffic across multiple values by weight instead of returning a single default:

```json
{
  "key": "checkout-button-color",
  "is_enabled": true,
  "flag_type": "string",
  "variants": [
    { "weight": 50, "value": "blue" },
    { "weight": 50, "value": "green" }
  ]
}
```

Bucketing is deterministic and sticky per user (MurmurHash3, salted independently from the
rollout gate), so a user always sees the same variant. See
[Core Concepts → Weighted Variants](/guide/concepts#weighted-variants-a-b-testing) for the full
rules.

## Impression Tracking

SDKs asynchronously report each evaluation (flag key, resolved value, user, optional context)
in batches. This is fire-and-forget — evaluation never blocks on the network — and privacy
preserving: user attributes are only sent if you opt in with `sendEvaluationContext`. Impressions
power everything below. See [Core Concepts → Impression Tracking](/guide/concepts#impression-tracking).

## Exposure Dashboards

The **Exposure** page answers "which users are being exposed to which variant of this flag?"
For a selected flag it shows:

- **Variant distribution** — the share of evaluations and the count of unique users per resolved
  value.
- **Totals** — total evaluations, unique users, and the number of distinct variants observed.
- **A daily timeline** — a stacked view of evaluations per variant over the trailing window (14
  days by default), so you can see a rollout ramping or a variant split holding steady.

It's derived entirely from existing impression data — no extra instrumentation. Backed by
`GET /api/environments/{env_id}/impressions/exposure` (see the
[API reference](/api-reference#exposure)).

## A/B Testing

::: tip Beta
A/B testing is a beta feature. It provides a solid, honest statistical readout (a two-proportion
z-test), not a full experimentation suite.
:::

An **experiment** ties a flag (the source of variant assignment) to a **goal event** (the
conversion you care about) and reports whether a variant beats the control.

### 1. Track conversion goals

Record conversions from your app with the SDK's `track()` method. Use the **same user key** you
pass to `getVariant()` / `isEnabled()` so conversions attribute to the right variant:

```typescript
const variant = client.getVariant('checkout-button-color', userId)
// …later, when the user converts:
client.track('checkout_complete', userId, { value: 49.99 })
```

`track()` is available in every SDK (Node, Web, React Native, Flutter). Events are batched and
reported best-effort, just like impressions, and land via
`POST /api/environments/{env_id}/events`. Any client can also POST goal events directly to that
endpoint.

### 2. Create an experiment

In the dashboard's **Experiments** page (or via the API), pair a flag with a goal event:

| Field | Meaning |
|-------|---------|
| `flag_key` | The flag whose evaluated variant assigns users to buckets |
| `goal_event_key` | The conversion event to measure (e.g. `checkout_complete`) |
| `control_variant` | The baseline to compare against — or leave unset to auto-pick the highest-exposure variant |
| `status` | `running`, `paused`, or `completed` |

### 3. Read the results

For each variant the results view reports:

- **Exposed** — distinct users assigned to the variant.
- **Converted** — of those, how many fired the goal.
- **Conversion rate** — converted ÷ exposed.
- **Uplift** — relative change vs. the control.
- **Significance** — a two-proportion z-test vs. the control, with the p-value and a 95% verdict
  (`p < 0.05`). A "winner" is called out only when a variant is both better and significant.

Backed by `GET /api/environments/{env_id}/experiments/{key}/results` (see the
[API reference](/api-reference#experiments)).

### How attribution works

- A user **enters the experiment at their first exposure** to the flag and is bucketed into the
  variant they saw then — so a later rule or rollout change can't retroactively re-bucket them.
- A user counts as **converted only if they fired the goal at or after that first exposure**, so a
  conversion always follows the exposure that could have caused it.
- Client-supplied timestamps are **clamped to the server clock on ingest**, so a fast client
  clock can't make a conversion sort ahead of its exposure.

### Beta limitations

- The test is a two-proportion z-test on a single binary goal — no revenue/continuous-metric
  tests, sequential testing, or CUPED yet.
- Attribution is per-user across their most recent flag assignment; it does not model users who
  legitimately move between variants across devices.
- Anonymous evaluations (no user key) are excluded — experiments need a stable user identifier.
