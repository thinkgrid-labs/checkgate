# Enterprise Setup Guide: Migrating from LaunchDarkly

This guide is designed for engineering teams looking to transition from a managed service like LaunchDarkly to a self-hosted Checkgate environment. It focuses on high-performance, data-sovereign feature flagging.

## Phase 1: Infrastructure Provisioning

Checkgate is designed to be "stateless" and "self-healing," meaning it can be scaled horizontally behind a load balancer as long as all instances share the same PostgreSQL and Redis backends.

### 1. The Database (PostgreSQL)
Checkgate uses PostgreSQL for long-term persistence of flags, user roles, and audit logs.
- **Requirement**: A standard PostgreSQL instance (RDS, Cloud SQL, or self-hosted).
- **Automation**: Checkgate handles its own schema management. When you provide a `DATABASE_URL`, the server automatically runs migrations on startup, creating and updating tables as needed. No manual SQL scripts are required.

### 2. The Real-Time Sync (Redis)
Checkgate uses Redis for inter-instance communication and real-time updates.
- **Requirement**: A standard Redis instance (ElastiCache, MemoryStore, or self-hosted).
- **The Sync Engine**: Checkgate uses the **Redis Pub/Sub** pattern. When a flag is updated on one server instance, it broadcasts a message via Redis. All other instances receive the update and refresh their local memory caches instantly.
- **Resilience**: If Redis is temporarily unavailable, Checkgate continues to serve flags from its in-memory store; real-time updates will resume as soon as the connection is restored.

---

## Phase 2: Production Deployment

For production environments, we recommend deploying the **Checkgate All-in-One Docker Image** (`checkgate:full`) to an orchestrator like AWS ECS (Fargate), AWS EC2, or Kubernetes.

### Example: AWS ECS / EC2 Start
```bash
docker run -d -p 3000:3000 \
  -e DATABASE_URL="postgres://user:pass@your-rds-endpoint:5432/checkgate" \
  -e REDIS_URL="redis://your-elasticache-endpoint:6379" \
  -e SESSION_SECRET="A_SECURE_RANDOM_STRING_HERE" \
  ghcr.io/thinkgrid-labs/checkgate:full
```

---

## Phase 3: The Dashboard Onboarding

Once your Control Plane is accessible (e.g., at `https://flags.internal.com`), follow the **Emerald Setup Wizard**:
1. **Admin Creation**: Set up the primary administrator account (stored in your RDS).
2. **SDK Key Generation**: Generate a master SDK Key (`sk_live_...`). This key identifies your applications to the Control Plane.
3. **Internal Verification**: Create your first flag and verify it appears in the dashboard.

---

## Phase 4: App Integration (SDKs)

Transitioning from LaunchDarkly involves replacing the LD client with a Checkgate SDK.

### example: Flutter / Dart Integration
```dart
// 1. Initialize the client
final checkgate = CheckgateClient(
  url: "https://flags.internal.com",
  sdkKey: "sk_live_..."
);

await checkgate.initialize();

// 2. Evaluate flags locally (zero latency)
bool showNewFeature = checkgate.isEnabled("new_feature_v2");
```

## Why Enterprise Teams Choose Checkgate
- **Data Sovereignty**: user identities and PII never leave your network.
- **Zero-Latency Evaluation**: Decisions happen in microseconds inside your application's memory using Rust-powered FFI.
- **Cost Transparency**: No per-user, per-seat, or per-flag pricing. Scale to millions of users at the cost of a small cloud instance.
