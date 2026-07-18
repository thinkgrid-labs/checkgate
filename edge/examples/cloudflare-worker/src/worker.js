// Checkgate on Cloudflare Workers — evaluate feature flags at the edge, in the
// same isolate that serves the request, with zero round-trips to origin on the
// hot path.
//
// How it stays fast:
//   • The flag snapshot + WASM engine live in a module-global `edge`, which
//     Cloudflare keeps alive across requests on a warm isolate — so most
//     requests evaluate purely in-memory.
//   • `ensureFresh()` only re-fetches the snapshot once the TTL lapses, and with
//     stale-while-revalidate it refreshes in the background (via ctx.waitUntil)
//     without ever blocking a response.
//   • A Cron Trigger (the `scheduled` handler) proactively refreshes so even the
//     first request to a cold isolate tends to find a warm snapshot.

import { CheckgateEdge } from '@checkgate/edge'
import { createWasmCore } from '@checkgate/web/core'
// Wrangler compiles this .wasm import into a WebAssembly.Module, which
// createWasmCore() accepts directly.
import wasmModule from '@checkgate/web/dist/checkgate_bg.wasm'

// Persists across requests on a warm isolate; rebuilt on cold start.
let edge = null

async function getEdge(env) {
  if (edge) return edge
  edge = new CheckgateEdge({
    serverUrl: env.CHECKGATE_URL,
    sdkKey: env.CHECKGATE_SDK_KEY,
    core: await createWasmCore(wasmModule),
    ttlSeconds: Number(env.CHECKGATE_TTL_SECONDS ?? 30),
    staleWhileRevalidateSeconds: Number(env.CHECKGATE_SWR_SECONDS ?? 60),
  })
  return edge
}

export default {
  async fetch(request, env, ctx) {
    const cg = await getEdge(env)

    // Serve stale instantly and refresh in the background when appropriate.
    await cg.ensureFresh({ waitUntil: (p) => ctx.waitUntil(p) })

    // Identify the user however your app does — a cookie, header, or auth token.
    // The key just needs to be stable per user so sticky rollouts bucket them
    // consistently at the edge.
    const url = new URL(request.url)
    const userKey = request.headers.get('x-user-id') ?? url.searchParams.get('uid') ?? 'anonymous'

    const flags = {
      newHomepage: cg.isEnabled('new-homepage', userKey),
      checkoutColor: cg.getValue('checkout-color', userKey, {}, 'blue'),
    }

    return new Response(JSON.stringify({ userKey, flags, flagCount: cg.flagCount }, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  },

  // Cron Trigger — keep the snapshot warm ahead of traffic.
  async scheduled(_event, env, ctx) {
    const cg = await getEdge(env)
    ctx.waitUntil(cg.refresh())
  },
}
