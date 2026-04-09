---
layout: home

hero:
  name: "Checkgate"
  text: "Self-Hosted Feature Flag Engine"
  tagline: Sub-microsecond local evaluation. No network round-trips. No vendor lock-in. Native SDKs for Node.js, React Native, Flutter, and browsers.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/ThinkGrid-Labs/checkgate

features:
  - icon: ⚡
    title: Sub-Microsecond Evaluation
    details: Flags are evaluated entirely in-process from an in-memory store. Zero network latency on every isEnabled() call — no HTTP round-trips, no polling.

  - icon: 🏠
    title: Fully Self-Hosted
    details: Deploy on your own infrastructure with Docker. Your flag data never leaves your servers. Single binary, PostgreSQL, and Redis are all you need.

  - icon: 🔄
    title: Real-Time Updates via SSE
    details: Flag changes propagate instantly to all connected SDK clients through Server-Sent Events. No polling interval — changes land in milliseconds.

  - icon: 🎯
    title: Advanced Targeting Rules
    details: Target users by any attribute — email domain, plan, region, custom properties. Combine targeting rules with percentage rollouts for fine-grained control.

  - icon: 🦀
    title: Rust-Powered Core
    details: The evaluation engine is written in Rust and compiled to native code (NAPI for Node.js, WASM for browsers, FFI for Flutter/React Native).

  - icon: 🔓
    title: Open Source & MIT Licensed
    details: No black boxes, no usage limits, no surprise pricing. Fork it, extend it, and own your feature flag infrastructure completely.
---
