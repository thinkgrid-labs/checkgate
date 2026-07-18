# Next.js (App Router) — zero-flicker flags with @checkgate/ssr

The complete, copy-pasteable flow (server payload → embed → client hydration) is
in the [package README](../../README.md#the-flow-nextjs-app-router). This folder
holds the one shared helper it references:

- [`wasm-core.ts`](wasm-core.ts) — builds a Checkgate evaluation `core` from the
  shared `@checkgate/web` WASM engine, used both to build the bootstrap on the
  server and (optionally) to seed the live client SDK.

## Layout

```
app/
  layout.tsx          # build the payload for the request, inject bootstrapScriptTag() into <head>
lib/
  checkgate-server.ts # getBootstrap(userKey, keys) — CheckgateEdge + buildBootstrap
  wasm-core.ts        # this file
  use-flag.ts         # 'use client' hook: BootstrapValues on first paint, CheckgateWeb for live updates
```

## Environment

```bash
CHECKGATE_URL=https://flags.example.com          # server-side
CHECKGATE_SDK_KEY=sk_...                          # server-side (never exposed)
NEXT_PUBLIC_CHECKGATE_URL=https://flags.example.com   # client live SDK
NEXT_PUBLIC_CHECKGATE_SDK_KEY=sk_...                  # client live SDK
```

## Why two steps hydrate cleanly

- `BootstrapValues` gives the **first client render** the exact values the server
  used → the React tree matches, so there's no hydration mismatch and no flicker.
- `new CheckgateWeb({ bootstrap })` seeds the live SDK from the **same snapshot**,
  so it's immediately live-ready and then streams updates — the UI only ever
  changes when a flag *actually* changes, never on hydration.
