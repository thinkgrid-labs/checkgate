# Next.js (App Router) — zero-flicker flags with @checkgate/ssr

The complete, copy-pasteable flow (server payload → embed → client hydration) is
in the [package README](../../README.md#the-flow-nextjs-app-router).

## Packages

```bash
npm install @checkgate/ssr @checkgate/web
```

- **`@checkgate/web`** — the live client SDK, and (via `@checkgate/web/core`) the
  shared WASM evaluation engine used to resolve flags on the server. On Node the
  engine loads itself from disk, so `await createWasmCore()` needs no arguments.
- **`@checkgate/ssr`** — resolves flags server-side into a bootstrap payload,
  embeds it in the document, and reads it back for the first client paint.
- **`@checkgate/edge`** *(optional)* — adds TTL-cached snapshot fetching on the
  server. Without it, fetch `GET /flags/snapshot` yourself and pass the result
  straight to `buildBootstrap({ snapshot })`.

## Layout

```
app/
  layout.tsx          # build the payload for the request, inject bootstrapScriptTag() into <head>
lib/
  checkgate-server.ts # getBootstrap(userKey, keys) — createWasmCore + buildBootstrap
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
