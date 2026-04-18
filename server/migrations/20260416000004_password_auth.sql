-- Phase 2: Onboarding Refactor
-- Add password_hash to users so login uses email + password instead of SDK key.
-- Add workspace_name to settings for the company/org name collected at setup.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Existing rows (created before this migration) have no password.
-- They will be unable to log in until a password is set — acceptable since
-- this is a fresh install scenario for the onboarding refactor.

-- Workspace name set once during setup.
INSERT INTO settings (key, value) VALUES ('workspace_name', '')
    ON CONFLICT (key) DO NOTHING;
