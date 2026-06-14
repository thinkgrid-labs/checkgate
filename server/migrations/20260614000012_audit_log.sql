-- Audit log: records every mutating flag operation with before/after state.
-- actor_email is NULL for SDK-key authenticated requests.

CREATE TABLE IF NOT EXISTS flag_audit_log (
    id             BIGSERIAL    PRIMARY KEY,
    environment_id UUID         NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    flag_key       TEXT         NOT NULL,
    actor_email    TEXT,
    action         TEXT         NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'PROMOTE')),
    before_data    JSONB,
    after_data     JSONB,
    metadata       JSONB,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS flag_audit_log_env_time
    ON flag_audit_log (environment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS flag_audit_log_flag_key
    ON flag_audit_log (environment_id, flag_key, created_at DESC);
