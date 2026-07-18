# Checkgate Product Roadmap

This document outlines the vision and future development priorities for Checkgate. Items are ordered by **impact** — what unblocks the most users, most quickly.

---

## 🟣 Phase 5: Enterprise Governance & Scale (In Progress)
*Goal: Enable large teams to move fast without breaking things.*

- [ ] **SSO / SAML / SCIM**: Enterprise identity provider integration for login and user provisioning. Parked for now — needs a real IdP to integrate/verify against (Okta, Azure AD, etc.), unlike the other Phase 5 items above which were self-contained and testable end-to-end against this repo alone.
- [ ] **VS Code Extension**: Inline flag status, targeting rules, and direct links to the dashboard from your editor.
- [ ] **Type-Safe Schema CLI**: Generate TypeScript/Dart/Rust types from your flag definitions.
- [ ] **Terraform/OpenTofu Provider**: Manage your entire feature flag infrastructure as code.
- [ ] **Edge Side Evaluation**: Official integration with Cloudflare Workers and Fly.io for global low-latency.
- [ ] **Kubernetes Operator**: Native orchestration for large-scale self-hosted deployments.

---

> [!TIP]
> **Want to contribute?** We welcome ideas and pull requests! Check the [Contributing Guide](https://github.com/thinkgrid-labs/checkgate/blob/main/CONTRIBUTING.md) to get started.
