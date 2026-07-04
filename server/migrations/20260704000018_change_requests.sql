-- Approval workflow: when an environment has `require_approval` set, a flag
-- PATCH no longer applies immediately — it's captured as a pending change
-- request that a different editor/admin must approve before it takes effect.
-- Mirrors a pull-request-style review gate for the highest-risk mutation
-- (rule/rollout changes), scoped per environment so e.g. Production can
-- require review while Development stays frictionless.
ALTER TABLE environments
    ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS change_requests (
    id             BIGSERIAL    PRIMARY KEY,
    environment_id UUID         NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    flag_key       TEXT         NOT NULL,
    -- The raw PATCH body as submitted — replayed verbatim against whatever
    -- the flag's state is at approval time (not a snapshot of the merged
    -- result), so an approval always applies cleanly on top of the current data.
    patch          JSONB        NOT NULL,
    requested_by   TEXT         NOT NULL,
    status         TEXT         NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewed_by    TEXT,
    reason         TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    reviewed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_change_requests_env_status
    ON change_requests(environment_id, status);
