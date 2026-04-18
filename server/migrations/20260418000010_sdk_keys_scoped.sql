-- Scope SDK keys to a specific environment (which implies a project).
-- Existing keys are assigned to the default environment of the default project.

ALTER TABLE sdk_keys
    ADD COLUMN environment_id UUID REFERENCES environments(id) ON DELETE CASCADE;

UPDATE sdk_keys
SET environment_id = (
    SELECT id FROM environments WHERE is_default = true LIMIT 1
)
WHERE environment_id IS NULL;

ALTER TABLE sdk_keys
    ALTER COLUMN environment_id SET NOT NULL;
