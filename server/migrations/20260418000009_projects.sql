-- Projects: each workspace has one or more projects.
-- Environments, SDK keys, and flags are scoped to a project via environments.
-- Existing installations get a "Default Project" and all environments are reassigned to it.

CREATE TABLE projects (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    slug       TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the default project for existing installations.
-- Fresh installs will have this row replaced by the setup wizard.
INSERT INTO projects (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Project', 'default');

ALTER TABLE environments
    ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

UPDATE environments
SET project_id = '00000000-0000-0000-0000-000000000001'
WHERE project_id IS NULL;

ALTER TABLE environments
    ALTER COLUMN project_id SET NOT NULL;
