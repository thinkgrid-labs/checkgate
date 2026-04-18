# Checkgate Product Roadmap

This document outlines the vision and future development priorities for Checkgate. Our goal is to provide the most robust, local-first feature management platform for developers.

---

## 🟢 Phase 1: Foundation & Stability (Completed)
- [x] **Rust-Core Engine**: Fast, local evaluation logic.
- [x] **Multi-SDK Support**: Node.js, Browser (WASM), React Native (JSI), and Flutter (FFI).
- [x] **Consolidated Distribution**: Official "All-in-One" Docker image with Dashboard and Server.
- [x] **Automated CI/CD**: Hardened cross-platform release pipelines.

---

## 🟢 Phase 2: Observability & Analytics (Completed)
*Goal: Provide developers with real-time feedback on how their flags are performing.*

- [x] **Environment Management**: First-class production/staging/UAT/development environments with isolated flag configurations, environment-scoped API keys, and a one-click "promote to production" flow from the dashboard.
- [x] **Onboarding Refactor**: Redesigned first-run setup flow that collects workspace/company name, admin email, and a proper password — decoupling user authentication (email + password) from SDK key authentication so key rotations no longer invalidate user sessions.
- [x] **Impression Tracking**: Asynchronous reporting of evaluation events from SDKs to the server.
- **Exposure Dashboards**: Visualize which users are being exposed to specific variants.
- **A/B Testing Beta**: Basic statistical comparison between two variants based on custom event goals.
- **Evaluation Stream**: A live, searchable log of evaluations in the dashboard for debugging.

---

## 🔵 Phase 3: Advanced Targeting & DX
*Goal: Make Checkgate the most powerful tool in a developer's arsenal.*

- **Percentage Rollouts**: Sticky, hash-based bucketing for gradual feature releases.
- **User Segmentation**: Reusable audience definitions (e.g., "Internal Employees", "Power Users").
- **Multi-Variant Flags**: Support for JSON, String, and Integer variants instead of just Booleans.
- **VS Code Extension**: Inline flag status, targeting rules, and direct links to the dashboard from your editor.
- **Type-Safe Schema**: CLI tool to generate TypeScript/Dart/Rust types from your flag definitions.

---

## 🟣 Phase 4: Enterprise Governance & Scale
*Goal: Enable large teams to move fast without breaking things.*

- **Change Requests**: Pull-request style workflow for flag rule changes with required approvals.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for environments and projects.
- **Audit Logs**: Comprehensive history of "Who changed What and When."
- **Edge Side Evaluation**: Official integration with Cloudflare Workers and Fly.io for global low-latency.
- **Terraform/OpenTofu Provider**: Manage your entire feature flag infrastructure as code.
- **Kubernetes Operator**: Native orchestration for large-scale self-hosted deployments.

---

> [!TIP]
> **Want to contribute?** We welcome ideas and pull requests! Check the [Contributing Guide](https://github.com/thinkgrid-labs/checkgate/blob/main/CONTRIBUTING.md) to get started.
