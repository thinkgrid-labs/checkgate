-- Custom event goals: conversion events reported by SDK clients via `track()`.
-- These are the measurement side of A/B testing — an experiment ties a flag's
-- variant assignment (from `impressions`) to a goal event recorded here.
-- Each row is one `track(event_key, user_id)` call with an optional numeric
-- value (e.g. revenue) and optional context.

CREATE TABLE IF NOT EXISTS events (
    id             BIGSERIAL        PRIMARY KEY,
    environment_id UUID             NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    event_key      TEXT             NOT NULL,
    user_id        TEXT,
    -- Optional numeric payload (revenue, count, duration…). NULL for plain
    -- conversion events that only need to be counted.
    value          DOUBLE PRECISION,
    context        JSONB,
    occurred_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    received_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Per-event time-series: "how many `checkout_complete` events in env X over time?"
CREATE INDEX IF NOT EXISTS events_env_key_time
    ON events (environment_id, event_key, occurred_at DESC);

-- Conversion lookup: "which users fired this goal?" — drives experiment results.
CREATE INDEX IF NOT EXISTS events_env_key_user
    ON events (environment_id, event_key, user_id);

-- Cleanup: purge rows older than retention window.
CREATE INDEX IF NOT EXISTS events_cleanup
    ON events (received_at);
