---
title: "Web SDK (WebAssembly) — Feature Flags for Browsers with WASM"
description: "Use the Checkgate Web SDK to evaluate feature flags in the browser with WebAssembly. Zero server round-trips — flags are evaluated locally at near-native speed with React and Vue support."
---

# Web SDK (WebAssembly)

The web SDK compiles the Rust evaluation core to **WebAssembly** using [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen). Flag evaluation runs at near-native speed entirely in the browser — no evaluation round-trips to your server.

## Installation

```bash
npm install @checkgate/web
# or
yarn add @checkgate/web
```

## Quick Start

```typescript
import { CheckgateWeb } from '@checkgate/web'

const client = new CheckgateWeb({
  serverUrl: 'https://flags.yourcompany.com',
  sdkKey: 'your-sdk-key',
})

// Connect once — downloads all flags via SSE
await client.connect()

// Evaluate locally in the browser (no network)
const enabled = client.isEnabled('dark-mode', currentUserId, {
  plan: userPlan,
  beta: 'true',
})
```

## API Reference

### `new CheckgateWeb(options)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `serverUrl` | `string` | Yes | Base URL of your Checkgate server |
| `sdkKey` | `string` | No | SDK key (sent as `Authorization: Bearer`) |
| `reconnectDelayMs` | `number` | No | Reconnect delay on SSE disconnect (default: 3000) |

### `client.connect(): Promise<void>`

Opens an SSE connection, receives all flags, and populates the local WASM store. Resolves when bootstrap is complete. The connection is maintained for real-time updates.

### `client.isEnabled(flagKey, userKey, attributes): boolean`

Synchronous, in-process evaluation using the WASM engine.

| Parameter | Type | Description |
|-----------|------|-------------|
| `flagKey` | `string` | Flag key to evaluate |
| `userKey` | `string` | Stable user identifier |
| `attributes` | `Record<string, string>` | User attributes for targeting |

Returns `false` for unknown flags.

### `client.disconnect(): void`

Closes the SSE connection.

## Usage with React

```tsx
// hooks/useFlag.ts
import { useEffect, useState } from 'react'
import { flags } from '../lib/flags' // shared client instance

export function useFlag(
  key: string,
  userId: string,
  attributes: Record<string, string> = {}
): boolean {
  const [enabled, setEnabled] = useState(() =>
    flags.isEnabled(key, userId, attributes)
  )

  useEffect(() => {
    // Re-evaluate when flags update
    const unsubscribe = flags.onChange(() => {
      setEnabled(flags.isEnabled(key, userId, attributes))
    })
    return unsubscribe
  }, [key, userId])

  return enabled
}

// Usage in a component
function CheckoutButton({ user }) {
  const newCheckout = useFlag('new-checkout-flow', user.id, {
    plan: user.plan,
  })

  return newCheckout ? <NewCheckout /> : <LegacyCheckout />
}
```

## Usage with Vue

```typescript
// composables/useFlag.ts
import { ref, onMounted, onUnmounted } from 'vue'
import { flags } from '../lib/flags'

export function useFlag(key: string, userId: string, attributes = {}) {
  const enabled = ref(flags.isEnabled(key, userId, attributes))

  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    unsubscribe = flags.onChange(() => {
      enabled.value = flags.isEnabled(key, userId, attributes)
    })
  })

  onUnmounted(() => unsubscribe?.())

  return enabled
}
```

## WASM Loading

The SDK uses dynamic import to load the WASM binary lazily. Bundlers (Vite, webpack) will handle the `.wasm` asset automatically.

For Vite, no extra configuration is needed. For webpack 5, add to your config:

```javascript
// webpack.config.js
module.exports = {
  experiments: {
    asyncWebAssembly: true,
  },
}
```

## Attributes Are Local

User attributes passed to `isEnabled()` are **never sent to the server**. The evaluation happens entirely inside the WASM module in the browser. Only the flag definitions (keys, rules, percentages) are downloaded from the server.
