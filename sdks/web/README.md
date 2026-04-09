# @checkgate/web

**Checkgate Web SDK (WebAssembly)** — The official frictionless frontend client for Checkgate.
This SDK leverages a lightning-fast Rust WebAssembly (WASM) payload to evaluate feature flags completely locally within the user's browser, bypassing standard frontend HTTP polling loops.

## Installation

```bash
npm install @checkgate/web
# or
pnpm add @checkgate/web
# or
yarn add @checkgate/web
```

## Quick Start

Initialize the browser client with your Checkgate server URL and client-side access key:

```typescript
import { CheckgateWeb } from '@checkgate/web'

const checkgate = new CheckgateWeb({
  url: 'https://checkgate.your-company.com',
  clientKey: 'pk_frontend_xxxxxxxx',
})

async function init() {
  // Establish an SSE connection with the Checkgate Server
  await checkgate.connect()

  // Provide user-specific context dynamically
  const isEnabled = checkgate.isEnabled('beta-feature', { 
    userId: '12345',
    plan: 'enterprise'
  })

  if (isEnabled) {
    // Render the new beta ui...
  }
}

init()
```

## Why Checkgate WebAssembly?
* **Zero Loading Screens:** By evaluating rule sets synchronously via WASM, UI components never have to wait or display spinners.
* **Live SSE:** Toggling a flag on the dashboard natively updates the frontend without refreshing the browser tab.
* **Open Source Alternative:** Stop paying premium per-seat pricing for basic feature gates.

Learn more natively in the [official Checkgate documentation](https://thinkgrid-labs.github.io/checkgate).
