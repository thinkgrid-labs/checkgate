# Checkgate on Cloudflare Workers

Evaluate feature flags **at the edge** — in the same isolate that serves the
request, across Cloudflare's 300+ locations — with no round-trip to origin on
the hot path. Uses [`@checkgate/edge`](../../README.md) for snapshot caching and
the shared `@checkgate/web` WebAssembly engine for evaluation, so results are
identical to every other Checkgate SDK.

## How it works

```
                 cron (every 60s)            per request (warm isolate)
  Checkgate  ──────────────────▶  Worker  ─────────────────────────▶  in-memory
   /flags/snapshot   refresh()    isolate      isEnabled()/getValue()     WASM eval
```

- The snapshot + WASM engine live in a **module-global** that Cloudflare keeps
  alive across requests on a warm isolate, so most requests never touch the network.
- `ensureFresh()` re-fetches only after the TTL; with stale-while-revalidate it
  refreshes in the background via `ctx.waitUntil` and never blocks a response.
- A **Cron Trigger** refreshes proactively so even cold isolates find a warm snapshot.

## Prerequisites

- A Checkgate server reachable from the edge, and an **environment-scoped SDK key**
  (the same key type the other SDKs use — it identifies the project + environment).
- `@checkgate/web` **built** so its `dist/checkgate.js` + `dist/checkgate_bg.wasm`
  exist (`cd sdks/web && npm run build`). The published npm package ships these.

## Setup

```bash
npm install
# Store the SDK key as a secret (don't commit it):
npx wrangler secret put CHECKGATE_SDK_KEY
# Point at your server + tune caching in wrangler.toml ([vars]).
npm run dev      # local: http://localhost:8787/?uid=user_123
npm run deploy   # ship it
```

Try it:

```bash
curl "https://checkgate-edge-worker.<your-subdomain>.workers.dev/?uid=user_123"
# { "userKey": "user_123", "flags": { "newHomepage": true, "checkoutColor": "blue" }, "flagCount": 12 }
```

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `CHECKGATE_URL` | `wrangler.toml [vars]` | Checkgate server base URL |
| `CHECKGATE_SDK_KEY` | `wrangler secret` | Environment-scoped SDK key (Bearer) |
| `CHECKGATE_TTL_SECONDS` | `[vars]` | Freshness window before a re-fetch (default 30) |
| `CHECKGATE_SWR_SECONDS` | `[vars]` | Extra window to serve stale while refreshing (default 60) |

## Notes

- **User key**: pass a stable per-user identifier (cookie/header/token) so sticky,
  hash-based rollouts bucket each user consistently at the edge. This example reads
  `x-user-id` or `?uid=`.
- **Freshness vs. load**: a 30s TTL means an edge location reflects a flag change
  within ~30s worst case; the SWR window keeps latency flat during a refresh. Lower
  the TTL for faster propagation at the cost of more origin fetches.
- Other edge runtimes (Deno Deploy, Fastly Compute, Vercel Edge) work the same way
  — `@checkgate/edge` only needs `fetch`; swap the WASM adapter for that runtime's
  WASM loader.
