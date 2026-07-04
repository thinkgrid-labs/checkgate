-- Flag lifecycle hygiene: tags, ownership, and soft archival.
--
-- These are management/UI metadata, not evaluation inputs — deliberately kept
-- as discrete columns rather than inside the `data` JSONB blob so they never
-- flow into the evaluation core or over SSE to SDK clients (which only ever
-- read `data`). Archiving a flag hides it from the default dashboard list; it
-- does not affect evaluation — `is_enabled`/`rollout_percentage` remain the
-- only kill-switches, so an archived flag keeps behaving exactly as before
-- for any client still evaluating it.

ALTER TABLE flags
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS owner_email TEXT,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_flags_tags ON flags USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_flags_archived_at ON flags (environment_id, archived_at);

-- Allow the new archive/unarchive actions in the audit log. The existing CHECK
-- constraint on `action` was defined inline in the original CREATE TABLE, so
-- its name is whatever Postgres auto-generated — look it up rather than
-- guessing, so this migration is correct regardless of naming convention.
DO $$
DECLARE
    existing_constraint text;
BEGIN
    SELECT conname INTO existing_constraint
    FROM pg_constraint
    WHERE conrelid = 'flag_audit_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%action%';

    IF existing_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE flag_audit_log DROP CONSTRAINT %I', existing_constraint);
    END IF;
END $$;

ALTER TABLE flag_audit_log ADD CONSTRAINT flag_audit_log_action_check
    CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'PROMOTE', 'ARCHIVE', 'UNARCHIVE'));
