<p align="center">
  <img src="../../assets/checkgate_logo.png" width="120" alt="Checkgate Logo">
</p>

# @checkgate/node

**Checkgate Node.js SDK (NAPI)** — The official high-performance, native Node.js client for Checkgate.
This SDK is built on top of the Rust native codebase, powered by NAPI-RS for absolute zero-overhead sub-microsecond feature flag evaluation directly in your server.

## Installation

```bash
npm install @checkgate/node
# or
pnpm add @checkgate/node
# or
yarn add @checkgate/node
```

## Quick Start

Initialize the Checkgate client with your unique server URL and SDK key:

```typescript
import { CheckgateClient } from '@checkgate/node'

const checkgate = new CheckgateClient({
  serverUrl: 'http://localhost:3000', // Your self-hosted Checkgate server URL
  sdkKey: 'sk_prod_xxxxxxxx',         // Your secure server-side SDK Key
})

async function run() {
  // Connect via SSE to instantly stream flag rules
  await checkgate.connect()

  // Evaluate features with sub-microsecond latency locally
  const showFeature = checkgate.isEnabled('new-dashboard', 'user_123', { 
    email: 'user@example.com' 
  })

  if (showFeature) {
    console.log("Welcome to the new dashboard!")
  }
}

run()
```

## Why Checkgate?
* **Sub-Microsecond Evaluation:** Flags are parsed instantly in-memory via Rust native bindings.
* **Instant Propagation:** Leverages SSE (Server Sent Events) to distribute flag toggles globally in < 50ms without polling.
* **Self-Hosted Privacy:** Keep your user data strictly within your own infrastructure bounds.

For more information and detailed architecture designs, check out the [official Checkgate documentation](https://thinkgrid-labs.github.io/checkgate).
