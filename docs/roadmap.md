# Checkgate Product Roadmap

This document outlines the vision and future development priorities for Checkgate. Items are ordered by **impact** — what unblocks the most users, most quickly.

---

## 🟢 Phase 1: Foundation & Stability (Completed)
- [x] **Rust-Core Engine**: Fast, local evaluation logic.
- [x] **Multi-SDK Support**: Node.js, Browser (WASM), React Native (JSI), and Flutter (FFI).
- [x] **Consolidated Distribution**: Official "All-in-One" Docker image with Dashboard and Server.
- [x] **Automated CI/CD**: Hardened cross-platform release pipelines.

---

## 🟢 Phase 2: Observability & Security (Completed)
*Goal: Give developers real-time feedback on how their flags are performing, and harden the platform for production.*

- [x] **Environment Management**: First-class production/staging/UAT/development environments with isolated flag configurations and one-click "promote to production".
- [x] **Onboarding Refactor**: Workspace name, admin email/password setup — decoupling user auth from SDK key auth.
- [x] **Impression Tracking**: Asynchronous reporting of evaluation events from SDKs to the server, with per-flag aggregate stats.
- [x] **Security Hardening**: Account-level login lockout, CSRF protection, security headers, Bearer-auth CSRF exemption.

---

## 🟢 Phase 3: Multi-Variant Flags, RBAC & Projects (Completed)
*Goal: Close the biggest feature gaps vs. Flagsmith and LaunchDarkly.*

- [x] **Multi-Variant Flags**: String, Integer, and JSON variants alongside Boolean flags. Per-rule return values, flag-level default and disabled values. Full backward compatibility — existing boolean flags unaffected. Available in all SDKs via `getValue()` / `getVariant()`.
- [x] **RBAC — Editor Role**: Three-tier access control (admin / editor / viewer). Editors can create and manage flags; only admins can manage users, environments, and SDK keys. Dashboard nav gated by role.
- [x] **Percentage Rollouts**: Sticky, hash-based (MurmurHash3) bucketing for gradual feature releases.
- [x] **Projects Layer**: Workspace → Projects → Environments → Flags hierarchy. Each project has isolated environments, SDK keys, flags, and impressions. Per-project user membership with independent roles. SDK keys are per-environment — the key implicitly identifies the project and environment. Setup wizard creates the first project; admins can add more. Existing installations auto-migrate to a "Default Project" with no data loss.

---

## 🔵 Phase 4: Advanced Targeting & Analytics (In Progress)
*Goal: Give teams the tools to debug and understand their flag usage.*

- [x] **Evaluation Stream**: A live, searchable log of evaluations in the dashboard for debugging "why isn't this flag working for that user?" Polls every 3 seconds; filterable by flag key, user ID, and evaluated value; full context JSON expandable inline. Backed by efficient `since_id` incremental queries.
- [x] **Audit Logs**: Comprehensive "Who changed What and When" history — required for enterprise trust and incident response.
- [x] **User Segmentation**: Reusable audience definitions (e.g., "Internal Employees", "Power Users") to eliminate repeated targeting rules across flags. Segments are expanded server-side into flag rules before broadcast, so SDKs stay simple.
- [x] **Webhooks, Scheduled Changes & SDK Health** (v0.1.17): Outbound webhooks with HMAC signing and delivery logs; time-based scheduled flag changes applied by a background worker; live SSE connection monitoring in the dashboard.
- [x] **SDK Impression Reporting**: All SDKs (Node, Web, React Native, Flutter) asynchronously batch and report evaluation events, feeding the impression stats and Evaluation Stream. Privacy-preserving by default — user attributes are not sent unless `sendEvaluationContext` is enabled.
- [x] **Weighted Multivariate Rollouts**: `variants` field distributes traffic across multiple values by weight (e.g. 60/30/10 A/B/C split), independent of the on/off rollout gate. Lives in the shared evaluation core, so every SDK supports it via the existing `getValue()`/`getVariant()` with no SDK-side changes. The foundation for A/B testing.
- [x] **SDK Resilience**: Exponential backoff with jitter on SSE reconnect (replacing fixed retry delays); flag-change listeners (`onChange`) with bootstrap/reconnect-resync suppression so only genuine live deltas fire; offline persistence via a pluggable storage adapter (hydrate-on-cold-start, persist-on-bootstrap/delta) so flags evaluate before or without a connection; and an HTTP poll fallback (`GET /flags/snapshot`) for environments where SSE can't be established at all (e.g. a proxy blocking long-lived connections) — SDKs switch to polling after repeated reconnect failures and switch back once SSE recovers.
- [x] **Prerequisite (Dependent) Flags**: A flag can require another flag to be enabled — or resolved to a specific value — before its own rules/rollout are considered, checked ahead of everything else. Evaluated recursively (a prerequisite can itself have prerequisites) with a depth guard that fails closed on cycles or misconfigured chains. Lives in the shared evaluation core, so every SDK supports it automatically — no SDK-side changes required.
- [ ] **Exposure Dashboards**: Visualize which users are being exposed to specific variants.
- [ ] **A/B Testing Beta**: Basic statistical comparison between variants based on custom event goals, built on the weighted-variant distribution and impression reporting above.

---

## 🟣 Phase 5: Enterprise Governance & Scale
*Goal: Enable large teams to move fast without breaking things.*

- [x] **Flag Lifecycle Hygiene**: Tags, an owner email, and archival (soft-delete, reversible, zero evaluation impact) — kept as dashboard-only metadata on a `FlagWithMetadata` wrapper so it never flows into the evaluation core or SSE payload.
- [x] **Cross-Environment Diff**: A "Compare environments" view showing flags that exist in only one environment or differ in evaluation-relevant fields (rollout, rules, variants, prerequisites — not tags/owner/archival), with a one-click sync action per flag.
- [x] **Scoped Personal Access Tokens**: User-owned, revocable API credentials for CI/CD, Terraform, and scripts — an alternative to the always-admin-equivalent SDK key. A token acts as its owning user (same role, same project memberships) and can be capped to `read_only`; a read-only token cannot mint a more-privileged replacement for itself. Tokens are SHA-256 hashed at rest, support optional expiry, and are strictly self-service (list/create/revoke your own only).
- [x] **Change Requests**: Per-environment `require_approval` toggle — when set, a flag PATCH is captured as a pending change request instead of applying immediately, and a *different* editor/admin must review it (self-approval is blocked). Approve applies the original patch atomically against whatever the flag's current state is; reject/withdraw never touch the flag. Scoped per environment so e.g. Production can require review while Development stays frictionless.
- [ ] **SSO / SAML / SCIM**: Enterprise identity provider integration for login and user provisioning. Parked for now — needs a real IdP to integrate/verify against (Okta, Azure AD, etc.), unlike the other Phase 5 items above which were self-contained and testable end-to-end against this repo alone.
- [ ] **VS Code Extension**: Inline flag status, targeting rules, and direct links to the dashboard from your editor.
- [ ] **Type-Safe Schema CLI**: Generate TypeScript/Dart/Rust types from your flag definitions.
- [ ] **Terraform/OpenTofu Provider**: Manage your entire feature flag infrastructure as code.
- [ ] **Edge Side Evaluation**: Official integration with Cloudflare Workers and Fly.io for global low-latency.
- [ ] **Kubernetes Operator**: Native orchestration for large-scale self-hosted deployments.

---

> [!TIP]
> **Want to contribute?** We welcome ideas and pull requests! Check the [Contributing Guide](https://github.com/thinkgrid-labs/checkgate/blob/main/CONTRIBUTING.md) to get started.
