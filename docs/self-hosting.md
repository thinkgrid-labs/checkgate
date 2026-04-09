# Self-Hosting

Launchgate is designed to be self-hosted. All you need is Docker, PostgreSQL, and Redis.

## Docker Compose (Recommended)

The easiest way to run Launchgate is with the provided Docker Compose files.

### Slim (Server Only)

Use this if you already have PostgreSQL and Redis:

```yaml
# docker-compose.yml
services:
  launchgate:
    image: ghcr.io/thinkgrid-labs/launchgate:server
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://user:password@your-postgres:5432/launchgate
      REDIS_URL: redis://your-redis:6379
      SDK_KEY: your-secret-key
```

```bash
docker compose up -d
```

### Full Stack (Batteries Included)

Includes PostgreSQL, Redis, and Launchgate:

```bash
docker compose -f docker-compose.full.yml up -d
```

This brings up:
- `launchgate` — server on port 3000
- `postgres` — PostgreSQL on port 5432
- `redis` — Redis on port 6379

## Docker Images

Two images are published per release:

| Image | Description |
|-------|-------------|
| `ghcr.io/thinkgrid-labs/launchgate:server` | Server binary only (~20MB) |
| `ghcr.io/thinkgrid-labs/launchgate:full` | Server + dashboard static files |

Both images are multi-architecture: `linux/amd64` and `linux/arm64`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://launchgate:password@localhost/launchgate` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `SDK_KEY` | _(unset)_ | API authentication key. If unset, auth is disabled |
| `PUBLIC_DIR` | `public` | Directory to serve the dashboard static files from |
| `RUST_LOG` | `info` | Log level (`error`, `warn`, `info`, `debug`, `trace`) |

### Security

Always set `SDK_KEY` in production. Without it, anyone can read and modify your flags.

```bash
# Generate a secure key
openssl rand -hex 32
```

## AWS

### EC2 Deployment

1. Launch an EC2 instance (t3.micro is sufficient for most workloads)
2. Install Docker:
   ```bash
   sudo yum update -y && sudo yum install -y docker
   sudo systemctl start docker
   ```
3. Set up RDS PostgreSQL and ElastiCache Redis
4. Create a `.env` file:
   ```bash
   DATABASE_URL=postgres://user:pass@rds-endpoint:5432/launchgate
   REDIS_URL=redis://elasticache-endpoint:6379
   SDK_KEY=your-secret-key
   ```
5. Run:
   ```bash
   docker run -d --env-file .env -p 3000:3000 ghcr.io/thinkgrid-labs/launchgate:full
   ```

### ECS (Fargate)

A basic task definition:

```json
{
  "family": "launchgate",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "launchgate",
      "image": "ghcr.io/thinkgrid-labs/launchgate:full",
      "portMappings": [{"containerPort": 3000}],
      "environment": [
        {"name": "DATABASE_URL", "value": "postgres://..."},
        {"name": "REDIS_URL", "value": "redis://..."},
        {"name": "SDK_KEY", "value": "your-secret-key"}
      ]
    }
  ]
}
```

### Load Balancing

Launchgate is stateless — the in-memory flag store is rebuilt from PostgreSQL on startup and kept in sync via Redis pub/sub. Run as many instances as you need behind an ALB.

**Important**: The SSE stream (`/stream`) requires sticky sessions or a long-lived HTTP/2 connection. Configure your ALB target group with:
- **Protocol**: HTTP/1.1 (SSE is not compatible with HTTP/2 connection multiplexing on ALB)
- **Stickiness**: Enabled (duration-based, any duration)

Or use **Redis pub/sub fan-out** (built-in): all instances subscribe to Redis and will forward updates to their connected SDK clients regardless of which instance received the API write.

## Health Checks

The server does not expose a dedicated `/health` endpoint in the current release. Use a TCP health check on port 3000, or check the root path (`GET /`) which serves the dashboard.

## Upgrading

Launchgate uses PostgreSQL schema migrations inline at startup (`CREATE TABLE IF NOT EXISTS`). To upgrade:

```bash
docker pull ghcr.io/thinkgrid-labs/launchgate:latest
docker compose up -d --force-recreate
```

No downtime migrations are required for current schema changes.

## Backup

Back up your PostgreSQL database using standard tooling:

```bash
pg_dump -h localhost -U launchgate launchgate > launchgate-backup.sql
```

Redis is used only for pub/sub and does not need to be backed up.
