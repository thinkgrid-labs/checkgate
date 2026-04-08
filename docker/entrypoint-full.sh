#!/usr/bin/env bash
# Sidekick full-image entrypoint
# Starts PostgreSQL → Redis → Sidekick server in sequence.
set -euo pipefail

PG_DATA="${PGDATA:-/var/lib/postgresql/data}"
PG_USER="${POSTGRES_USER:-sidekick}"
PG_PASSWORD="${POSTGRES_PASSWORD:-sidekick}"
PG_DB="${POSTGRES_DB:-sidekick}"

# Locate the versioned PostgreSQL bin dir (e.g. /usr/lib/postgresql/15/bin)
PG_BIN=$(find /usr/lib/postgresql -name "initdb" -type f 2>/dev/null | head -1 | xargs -r dirname)
if [ -z "$PG_BIN" ]; then
  echo "[error] Could not locate PostgreSQL binaries. Is postgresql installed?" >&2
  exit 1
fi
export PATH="$PG_BIN:$PATH"

if [ "${PG_PASSWORD}" = "sidekick" ]; then
  echo "[warn] POSTGRES_PASSWORD is set to the default value 'sidekick'. Set a strong password in production."
fi

if [ -z "${SDK_KEY:-}" ]; then
  echo "[warn] SDK_KEY is not set. API authentication is disabled. Set SDK_KEY in production."
fi

# ---------------------------------------------------------------------------
# 1. Initialise PostgreSQL data directory (first boot only)
# ---------------------------------------------------------------------------
if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "[init] Initialising PostgreSQL data directory..."
  PGPASS_FILE=$(mktemp)
  printf '%s' "$PG_PASSWORD" > "$PGPASS_FILE"
  chown postgres:postgres "$PGPASS_FILE"
  su -s /bin/sh postgres -c "initdb -D '$PG_DATA' --username='$PG_USER' --pwfile='$PGPASS_FILE' --auth-host=md5 --auth-local=trust"
  rm -f "$PGPASS_FILE"
  echo "[init] PostgreSQL initialised."
fi

# ---------------------------------------------------------------------------
# 2. Start PostgreSQL
# ---------------------------------------------------------------------------
echo "[init] Starting PostgreSQL..."
su -s /bin/sh postgres -c "pg_ctl -D '$PG_DATA' -l /var/log/postgresql.log start -w"

# Ensure database exists (connect to 'postgres' which always exists after initdb)
su -s /bin/sh postgres -c "psql -U '$PG_USER' -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname='$PG_DB'\" | grep -q 1 || psql -U '$PG_USER' -d postgres -c \"CREATE DATABASE \\\"$PG_DB\\\";\""
echo "[init] PostgreSQL ready."

# ---------------------------------------------------------------------------
# 3. Start Redis (with optional password)
# ---------------------------------------------------------------------------
echo "[init] Starting Redis..."
REDIS_ARGS="--daemonize yes --logfile /var/log/redis.log --appendonly yes"
if [ -n "${REDIS_PASSWORD:-}" ]; then
  REDIS_ARGS="${REDIS_ARGS} --requirepass ${REDIS_PASSWORD}"
  echo "[init] Redis password authentication enabled."
else
  echo "[warn] REDIS_PASSWORD is not set. Redis is running without authentication."
fi
# shellcheck disable=SC2086
redis-server ${REDIS_ARGS}
echo "[init] Redis ready."

# ---------------------------------------------------------------------------
# 4. Export connection strings for the server
# ---------------------------------------------------------------------------
export DATABASE_URL="postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1/${PG_DB}"
if [ -n "${REDIS_PASSWORD:-}" ]; then
  export REDIS_URL="redis://:${REDIS_PASSWORD}@127.0.0.1:6379"
else
  export REDIS_URL="redis://127.0.0.1:6379"
fi
export PUBLIC_DIR="${PUBLIC_DIR:-/app/public}"

# SDK_KEY and PORT are passed in via docker run -e / docker-compose env
echo "[init] Starting Sidekick server..."
exec sidekick-server
