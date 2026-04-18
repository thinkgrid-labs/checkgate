-- Phase 2: Environment Management
-- Environments are isolated scopes for flag configurations.
-- Each flag row is now scoped to an environment.

CREATE TABLE IF NOT EXISTS environments (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT         NOT NULL,
    slug        TEXT         NOT NULL UNIQUE,
    color       TEXT         NOT NULL DEFAULT '#6366f1',
    is_default  BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Ensure only one default environment exists.
CREATE UNIQUE INDEX IF NOT EXISTS environments_single_default
    ON environments (is_default)
    WHERE is_default = true;

-- Seed the four standard environments.
INSERT INTO environments (name, slug, color, is_default) VALUES
    ('Production',   'production',  '#ef4444', false),
    ('Staging',      'staging',     '#f59e0b', false),
    ('UAT',          'uat',         '#8b5cf6', false),
    ('Development',  'development', '#10b981', true)
ON CONFLICT (slug) DO NOTHING;

-- Migrate existing flags into the default (Development) environment.
-- After this migration flags require an environment_id on all writes.
ALTER TABLE flags
    ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES environments(id) ON DELETE CASCADE;

-- Back-fill existing rows with the default environment.
UPDATE flags
SET environment_id = (SELECT id FROM environments WHERE is_default = true LIMIT 1)
WHERE environment_id IS NULL;

-- Now enforce NOT NULL.
ALTER TABLE flags
    ALTER COLUMN environment_id SET NOT NULL;

-- The primary key changes from just (key) to (key, environment_id).
ALTER TABLE flags DROP CONSTRAINT IF EXISTS flags_pkey;
ALTER TABLE flags ADD PRIMARY KEY (key, environment_id);
