# Checkgate on Fly.io — global low-latency

Two ways to put Checkgate near your users on Fly:

1. **Run the server multi-region (this recipe).** Fly places the full Checkgate
   server (Rust + WASM local evaluation) as Machines in many regions. Every SDK's
   SSE bootstrap, `/flags/snapshot` poll, and impression/event ingest is served
   from a nearby region — no app changes, and evaluation is still local inside
   each SDK.
2. **Run a Fly app *as* an edge evaluator** using [`@checkgate/edge`](../../README.md)
   (same pattern as the Cloudflare example) if you want per-request edge evaluation
   inside your own Fly app rather than in the client SDK.

This directory covers option 1.

## Prerequisites

- The [`flyctl`](https://fly.io/docs/flyctl/install/) CLI, logged in.
- A Postgres database and a Redis instance. On Fly:
  - `fly postgres create` (or any managed Postgres)
  - `fly redis create` (Upstash Redis on Fly, or any Redis URL)

## Deploy

Run from the **repository root** so the Docker build context includes the server,
dashboard, and `Dockerfile`:

```bash
# 1. Create the app + attach this config (don't deploy yet).
fly launch --no-deploy --copy-config --config edge/examples/fly/fly.toml

# 2. Wire up secrets (never commit these).
fly secrets set \
  DATABASE_URL="postgres://…" \
  REDIS_URL="redis://…" \
  SESSION_SECRET="$(openssl rand -hex 32)"

# 3. Ship it.
fly deploy --config edge/examples/fly/fly.toml
```

## Go multi-region

Add regions and scale Machines out — Fly routes each user to the closest one:

```bash
fly scale count 3 --region iad,fra,syd
fly regions list
```

Notes:

- **Database locality matters.** Local flag evaluation inside each SDK is already
  latency-free; the server's job is bootstrap + streaming + ingest. Keep Postgres
  near your `primary_region`, or use Fly Postgres read replicas, so cross-region
  Machines aren't reaching back across the planet for every query.
- **Redis** backs the SSE fan-out and rate limiting — point every region at the
  same Redis (or a globally-replicated one) so flag changes propagate to all
  connected SDKs.
- `min_machines_running = 1` keeps one Machine warm; raise it if you can't tolerate
  the occasional cold start on an idle region.

## Configuration

| Variable | Set via | Purpose |
|---|---|---|
| `DATABASE_URL` | `fly secrets set` | Postgres connection string |
| `REDIS_URL` | `fly secrets set` | Redis connection string |
| `SESSION_SECRET` | `fly secrets set` | Dashboard session signing key |
| `PORT`, `PUBLIC_DIR`, `COOKIE_SECURE`, `DB_MAX_CONNECTIONS` | `[env]` in `fly.toml` | Server tuning |
