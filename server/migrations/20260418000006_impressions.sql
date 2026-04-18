-- Impression tracking: records every flag evaluation reported by SDK clients.
-- Each row represents one evaluate() call with its context and result.

CREATE TABLE IF NOT EXISTS impressions (
    id             BIGSERIAL    PRIMARY KEY,
    environment_id UUID         NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    flag_key       TEXT         NOT NULL,
    user_id        TEXT,
    value          TEXT         NOT NULL,
    context        JSONB,
    evaluated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    received_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Per-flag time-series: "how many evals for this flag in env X over time?"
CREATE INDEX IF NOT EXISTS impressions_env_flag_time
    ON impressions (environment_id, flag_key, evaluated_at DESC);

-- Full env stream: recent evaluations across all flags.
CREATE INDEX IF NOT EXISTS impressions_env_time
    ON impressions (environment_id, evaluated_at DESC);

-- Cleanup: purge rows older than retention window.
CREATE INDEX IF NOT EXISTS impressions_cleanup
    ON impressions (received_at);
