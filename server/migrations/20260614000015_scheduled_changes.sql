-- Scheduled flag changes: apply a JSON merge patch to a flag at a future time.
-- The background worker polls every 60 s and applies due changes with FOR UPDATE SKIP LOCKED
-- to prevent duplicate execution across multiple server instances.

CREATE TABLE IF NOT EXISTS scheduled_changes (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID         NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    flag_key       TEXT         NOT NULL,
    scheduled_at   TIMESTAMPTZ  NOT NULL,
    patch          JSONB        NOT NULL,
    executed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Partial index on unexecuted, due changes for fast polling.
CREATE INDEX IF NOT EXISTS scheduled_changes_due
    ON scheduled_changes (scheduled_at)
    WHERE executed_at IS NULL;

CREATE INDEX IF NOT EXISTS scheduled_changes_env_flag
    ON scheduled_changes (environment_id, flag_key, scheduled_at)
    WHERE executed_at IS NULL;
