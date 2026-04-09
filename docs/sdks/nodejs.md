---
title: "Node.js SDK (NAPI) — Sub-Microsecond Feature Flags for Node.js"
description: "Install and use the Checkgate Node.js SDK powered by NAPI-RS. Evaluate feature flags synchronously at native speed in Express, Next.js, and any Node.js server."
---

# Node.js SDK (NAPI)

The Node.js SDK uses [NAPI-RS](https://napi.rs/) to compile the Rust evaluation core into a native Node.js addon (`.node` file). Flag evaluation runs at native speed without crossing the JS/Rust FFI boundary unnecessarily.

## Installation

```bash
npm install @checkgate/node
# or
yarn add @checkgate/node
# or
pnpm add @checkgate/node
```

Pre-built binaries are included for:
- Linux x64 (glibc)
- Linux x64 (musl / Alpine)
- Linux arm64 (glibc)
- Linux arm64 (musl)
- macOS x64
- macOS arm64 (Apple Silicon)
- Windows x64

## Quick Start

```typescript
import { CheckgateClient } from '@checkgate/node'

const client = new CheckgateClient({
  serverUrl: 'https://flags.yourcompany.com',
  sdkKey: process.env.CHECKGATE_SDK_KEY,
})

// Connect and download flags (call once at startup)
await client.connect()

// Evaluate flags — no await, no network, sub-microsecond
const enabled = client.isEnabled('new-checkout-flow', userId, {
  email: user.email,
  plan: user.plan,
})
```

## API Reference

### `new CheckgateClient(options)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `serverUrl` | `string` | Yes | Base URL of your Checkgate server |
| `sdkKey` | `string` | No | SDK key for authentication |
| `reconnectDelayMs` | `number` | No | SSE reconnect delay in ms (default: 3000) |

### `client.connect(): Promise<void>`

Connects to the server's SSE stream and downloads the current flag set. Resolves when the initial bootstrap is complete. Call this once at application startup.

Sets up automatic reconnection with exponential backoff on connection loss.

### `client.isEnabled(flagKey, userKey, attributes): boolean`

Evaluates a flag for a user. This is a synchronous, in-process call.

| Parameter | Type | Description |
|-----------|------|-------------|
| `flagKey` | `string` | The flag key to evaluate |
| `userKey` | `string` | Stable user identifier (used for rollout hashing) |
| `attributes` | `Record<string, string>` | User attributes for targeting rules |

Returns `false` if the flag does not exist.

### `client.disconnect(): void`

Closes the SSE connection and cleans up resources. Call on graceful shutdown.

## Usage with Express

```typescript
import express from 'express'
import { CheckgateClient } from '@checkgate/node'

const flags = new CheckgateClient({
  serverUrl: process.env.CHECKGATE_URL!,
  sdkKey: process.env.CHECKGATE_SDK_KEY,
})

await flags.connect()

const app = express()

app.get('/checkout', (req, res) => {
  const newCheckout = flags.isEnabled(
    'new-checkout-flow',
    req.user.id,
    { plan: req.user.plan, email: req.user.email }
  )

  res.json({ ui: newCheckout ? 'v2' : 'v1' })
})

process.on('SIGTERM', () => flags.disconnect())
```

## Usage with Next.js

```typescript
// lib/flags.ts
import { CheckgateClient } from '@checkgate/node'

declare global {
  var checkgate: CheckgateClient | undefined
}

export async function getFlags(): Promise<CheckgateClient> {
  if (!global.checkgate) {
    global.checkgate = new CheckgateClient({
      serverUrl: process.env.CHECKGATE_URL!,
      sdkKey: process.env.CHECKGATE_SDK_KEY,
    })
    await global.checkgate.connect()
  }
  return global.checkgate
}
```

```typescript
// app/page.tsx (Server Component)
import { getFlags } from '@/lib/flags'

export default async function Page() {
  const flags = await getFlags()
  const showBanner = flags.isEnabled('promo-banner', 'anonymous', {})

  return showBanner ? <PromoBanner /> : null
}
```

## Passing Rules as JSON

When creating flags via the REST API, rules are a JSON array. The SDK accepts the same structure:

```typescript
// Via REST API
await fetch('/api/flags', {
  method: 'POST',
  body: JSON.stringify({
    key: 'beta-feature',
    is_enabled: true,
    rollout_percentage: 10,
    rules: [
      { attribute: 'plan', operator: 'equals', values: ['enterprise'] }
    ]
  })
})
```
