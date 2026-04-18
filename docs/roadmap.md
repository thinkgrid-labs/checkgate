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
- [ ] **Audit Logs**: Comprehensive "Who changed What and When" history — required for enterprise trust and incident response.
- [ ] **User Segmentation**: Reusable audience definitions (e.g., "Internal Employees", "Power Users") to eliminate repeated targeting rules across flags.
- [ ] **Exposure Dashboards**: Visualize which users are being exposed to specific variants.
- [ ] **A/B Testing Beta**: Basic statistical comparison between two variants based on custom event goals. Meaningful only after multi-variant is fully adopted.

---

## 🟣 Phase 5: Enterprise Governance & Scale
*Goal: Enable large teams to move fast without breaking things.*

- **Change Requests**: Pull-request style workflow for flag rule changes with required approvals.
- **VS Code Extension**: Inline flag status, targeting rules, and direct links to the dashboard from your editor.
- **Type-Safe Schema CLI**: Generate TypeScript/Dart/Rust types from your flag definitions.
- **Terraform/OpenTofu Provider**: Manage your entire feature flag infrastructure as code.
- **Edge Side Evaluation**: Official integration with Cloudflare Workers and Fly.io for global low-latency.
- **Kubernetes Operator**: Native orchestration for large-scale self-hosted deployments.

---

> [!TIP]
> **Want to contribute?** We welcome ideas and pull requests! Check the [Contributing Guide](https://github.com/thinkgrid-labs/checkgate/blob/main/CONTRIBUTING.md) to get started.
