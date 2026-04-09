# Getting Started

This guide walks you through running Launchgate locally and evaluating your first feature flag.

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for the Node.js SDK example)

## 1. Start the Server

Clone the repository and start the full stack with Docker Compose:

```bash
git clone https://github.com/ThinkGrid-Labs/launchgate.git
cd launchgate
docker compose -f docker-compose.full.yml up -d
```

This starts:
- **Launchgate server** on port `3000`
- **PostgreSQL** on port `5432`
- **Redis** on port `6379`

The dashboard is available at [http://localhost:3000](http://localhost:3000).

## 2. Create Your First Flag

Open the dashboard at [http://localhost:3000](http://localhost:3000) and create a flag:

- **Key**: `new-checkout-flow`
- **Enabled**: true
- **Rollout**: 50%

Or use the REST API directly:

```bash
curl -X POST http://localhost:3000/api/flags \
  -H "Content-Type: application/json" \
  -d '{
    "key": "new-checkout-flow",
    "is_enabled": true,
    "rollout_percentage": 50,
    "description": "New checkout UI rollout",
    "rules": []
  }'
```

## 3. Install the SDK

::: code-group

```bash [Node.js]
npm install @launchgate/node
```

```bash [Browser]
npm install @launchgate/browser
```

```bash [React Native]
npm install @launchgate/react-native
```

:::

## 4. Connect and Evaluate

```typescript
import { LaunchgateClient } from '@launchgate/node'

const client = new LaunchgateClient({
  serverUrl: 'http://localhost:3000',
  sdkKey: 'your-sdk-key', // set SDK_KEY env var on server to enable auth
})

await client.connect()

// Evaluate a flag for a user
const enabled = client.isEnabled('new-checkout-flow', 'user-123', {
  email: 'alice@example.com',
  plan: 'pro',
})

console.log('New checkout:', enabled)
```

The client connects once via SSE, downloads all flags, and evaluates locally on every `isEnabled()` call. No network round-trips.

## 5. Production Setup

For production, set an `SDK_KEY` environment variable on the server:

```bash
SDK_KEY=your-secret-key docker compose up -d
```

Pass the same key when initializing SDKs:

```typescript
const client = new LaunchgateClient({
  serverUrl: 'https://flags.yourcompany.com',
  sdkKey: 'your-secret-key',
})
```

See [Self-Hosting](/self-hosting) for full production deployment options including AWS and environment variable reference.
