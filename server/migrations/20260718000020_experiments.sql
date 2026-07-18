-- Experiments: an A/B test definition. Ties a flag (the source of variant
-- assignment, read from `impressions`) to a goal event (read from `events`)
-- so the server can compute conversion rates per variant and compare them.
--
-- Experiments are dashboard-only analytics metadata — they never flow into the
-- evaluation core or SSE payload. Traffic splitting is already handled by the
-- flag's own `variants` weighted distribution; an experiment just measures it.

CREATE TABLE IF NOT EXISTS experiments (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id  UUID         NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    key             TEXT         NOT NULL,
    name            TEXT         NOT NULL,
    description     TEXT,
    -- The flag whose evaluated variant assigns users to buckets.
    flag_key        TEXT         NOT NULL,
    -- The goal event whose occurrence counts as a conversion.
    goal_event_key  TEXT         NOT NULL,
    -- Baseline variant to compare the others against. NULL = auto-pick the
    -- highest-exposure variant at results time.
    control_variant TEXT,
    status          TEXT         NOT NULL DEFAULT 'running'
                                 CHECK (status IN ('running', 'paused', 'completed')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (key, environment_id)
);

CREATE INDEX IF NOT EXISTS experiments_env
    ON experiments (environment_id, key);
