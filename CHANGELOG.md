# Changelog

All notable changes to Checkgate are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.19] - 2026-07-05

### Changed

- **Dashboard layout overhaul** — the sidebar can now be collapsed to an icon-only rail (persisted
  across sessions via `localStorage`), reclaiming space on smaller screens. Every list/table page
  (Dashboard, Feature Flags, Environments, Compare, Change Requests, Projects, Users, Audit Log,
  Impressions, SDK Health, Scheduled, Webhooks) is now genuinely full width instead of capped at an
  arbitrary max-width with dead space on either side.
- **Flag Editor and Settings restructured into two columns** — behavior/configuration (flag type,
  rollout, targeting rules; SDK snippets, personal access tokens) in a wider main column, with
  identity/metadata (key, tags, ownership, prerequisites; auth info, API endpoint, account) in a
  narrower sidebar. Previously everything was stacked in a single column, requiring far more
  scrolling and leaving most of the screen empty on anything wider than a laptop.
- **Setup and Login pages** now fill the browser window edge to edge (previously framed/centered
  with growing dead space in the middle on wide monitors, then over-corrected to a narrow centered
  card — this settles on genuinely full-width panels with wider inner content blocks). The Setup
  welcome screen's headline now wraps to two lines instead of three, and gained an "Already set up?
  Sign in" link for anyone who lands there after setup is already complete.
- `ProjectSettings` now supports deep-linking to a specific tab via `?tab=keys` (etc.), so other
  pages can link straight to e.g. SDK Keys instead of dropping the user on the default tab.

### Fixed

- **Setup/login redirect loop** — `/api/auth/me` 401s for anyone without a valid session cookie,
  which the frontend was also using to determine "has setup been completed?" A fresh browser, a
  different device, or a session that expired after a server restart would incorrectly conclude
  setup had never been done and permanently redirect to `/setup` instead of `/login`, with no way
  back. Fixed by checking the public `/api/auth/workspace` endpoint (now also returns
  `is_setup_complete`) instead, and by fixing a related race where the redirect decision fired on a
  stale guess before that check even resolved.
- **Dead "SDK Keys" link on the Settings page** — pointed to `/settings` (itself) instead of the
  actual key-management page. Now links to `/projects/{id}?tab=keys` and lands directly on the SDK
  Keys tab.
- **React Native SDK packaging** — `sdks/react-native/android/.gradle/` (a local Gradle build cache,
  accidentally committed) was being swept into the published npm tarball via the `files` field
  covering the whole `android/` directory. Untracked and gitignored; harmless to existing consumers,
  just junk that shouldn't have shipped.

## [0.1.18] - 2026-07-04

### Added

- **Prerequisite (dependent) flags** — a flag can require another flag to be enabled, or resolved to a
  specific value, before its own rules/rollout are considered. Evaluated recursively (a prerequisite
  can itself have prerequisites) with a depth guard that fails closed on cycles or misconfigured
  chains. Lives in the shared evaluation core, so every SDK supports it automatically.
- **Weighted multivariate rollouts** — a `variants` field distributes traffic across multiple values
  by weight (e.g. a 60/30/10 A/B/C split), independent of the on/off rollout gate. The foundation for
  A/B testing.
- **`getValue`/`getVariant` in every SDK wrapper** — the underlying bindings already supported
  multi-variant flags, but the public Node, Web, React Native, and Flutter wrappers only exposed
  `isEnabled`. All four now expose the full evaluation surface.
- **SDK impression reporting** — all SDKs asynchronously batch and report evaluation events, feeding
  the dashboard's impression stats and evaluation stream. Off by default; user attributes are never
  sent unless `sendEvaluationContext` is enabled.
- **Numeric targeting operators** — `greater_than`, `greater_than_or_equal`, `less_than`,
  `less_than_or_equal`, alongside the existing string operators.
- **SDK resilience** — exponential backoff with jitter on SSE reconnect (replacing a fixed retry
  delay); flag-change listeners (`onChange`) with bootstrap/reconnect-resync suppression so only
  genuine live deltas fire; offline persistence via a pluggable storage adapter (hydrate on cold
  start, persist on bootstrap/delta); and an HTTP poll fallback (`GET /flags/snapshot`) for
  environments where SSE can't be established (e.g. a proxy blocking long-lived connections).
- **Unified `connect()`/ready semantics** — a new server-emitted `ready` SSE event gives every SDK a
  consistent way to know when the initial flag set has loaded, instead of each platform inferring it
  differently.
- **Flag lifecycle hygiene** — tags, an owner email, and archival (soft-delete, reversible, zero
  evaluation impact). Kept as dashboard-only metadata on a `FlagWithMetadata` wrapper so it never
  flows into the evaluation core or the SSE/`/flags/snapshot` wire format.
- **Cross-environment diff** — a "Compare environments" dashboard page showing flags that exist in
  only one environment, or differ in evaluation-relevant fields (rollout, rules, variants,
  prerequisites), with a one-click sync action per flag.
- **Scoped personal access tokens** — user-owned, revocable API credentials for CI/CD, Terraform, and
  scripts, as an alternative to the always-admin-equivalent SDK key. A token acts as its owning user
  (same role, same project memberships) and can be capped to `read_only`. Tokens are SHA-256 hashed
  at rest, support optional expiry, and are strictly self-service (list/create/revoke your own only).
- **Change requests (approval workflow)** — a per-environment `require_approval` toggle. When set, a
  flag `PATCH` is captured as a pending change request instead of applying immediately, and a
  *different* editor/admin must review it. Approve applies the original patch against the flag's
  current state; reject (with an optional reason) or withdraw never touch the flag.

### Changed

- `evaluate`/`evaluate_variant` in the core evaluator now take a `&FlagStore` parameter to support
  recursive prerequisite lookups. Internal API change — all four SDK bindings were updated
  accordingly; public SDK surfaces are unaffected.

### Fixed

- `time::OffsetDateTime` fields in `impressions.rs`, `keys.rs`, and `users.rs` were serializing in a
  proprietary, non-RFC-3339 format that JavaScript's `Date` cannot parse, despite doc comments
  claiming "ISO-8601." Corrected to genuine RFC 3339 output across all affected endpoints.
- Node.js SDK: `eventsource` v4's named export and dropped `headers` option meant the Bearer token
  was silently omitted from SSE reconnect requests. Fixed via a custom `fetch` hook.
- Dashboard `Environments.tsx` called bare `/api/environments...` routes that don't exist on the
  server (the real routes are nested under `/api/projects/{project_id}/environments...`), causing
  "Server returned 405" on environment creation and silent failures on delete/set-default.
- Removed stale, git-tracked copies of `sdks/react-native/rust-core/` — a generated build artifact
  that had drifted out of sync with `core/`. Now gitignored; regenerated fresh before every release.
- **Node.js SDK packaging** — `index.js` (the hand-written wrapper) and `napi build --platform`'s
  auto-generated multi-platform dispatch loader both wrote to the same filename, so whichever ran
  last won; the checked-in wrapper always won in practice, and it `require()`d a single-file
  `index.node` that never exists in the real per-platform release output
  (`checkgate.darwin-x64.node`, `checkgate.linux-x64-gnu.node`, etc.). Every install of
  `@checkgate/node` would have thrown `Cannot find module './index.node'`. Pre-existing since at
  least v0.1.17 and never caught because nothing in CI actually `require()`d the assembled package.
  Fixed by generating the dispatch loader to a separate `native-binding.js`/`native-binding.d.ts`
  (via `napi build`'s `--js`/`--dts` flags) that `index.js` requires instead, and by adding a real
  `require()` smoke test to the release workflow so this class of bug fails loudly in CI instead of
  shipping silently.

### Security

- Personal access tokens are SHA-256 hashed at rest (SDK keys remain plaintext, by contrast, since
  they're a different, coarser-grained credential class), scoped to the owning user's actual role and
  project memberships rather than being blanket admin-equivalent, and a `read_only` token cannot mint
  a `read_write` replacement for itself.
- Change-request self-approval is rejected — a reviewer other than the requester must approve.

## [0.1.17] - 2026-06-14

- Audit logs, user segmentation, webhooks with HMAC signing, time-based scheduled flag changes, and
  live SSE connection monitoring (SDK Health).

## [0.1.0] - 0.1.16

See individual SDK changelogs (e.g. `sdks/flutter/dart/CHANGELOG.md`) and `docs/roadmap.md` for
earlier history: initial local-evaluation core, multi-variant flags, editor RBAC, projects/multi-
tenancy, impression tracking, and security hardening.
