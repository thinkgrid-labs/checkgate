-- Segments: reusable named targeting rule sets.
-- Flags can reference a segment by key; the server expands the reference
-- to the segment's concrete rules before broadcasting to SDK clients.

CREATE TABLE IF NOT EXISTS segments (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID         NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    name           TEXT         NOT NULL,
    key            TEXT         NOT NULL,
    description    TEXT,
    rules          JSONB        NOT NULL DEFAULT '[]',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (key, environment_id)
);

CREATE INDEX IF NOT EXISTS segments_env
    ON segments (environment_id, key);
