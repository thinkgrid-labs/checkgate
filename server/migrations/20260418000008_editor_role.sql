-- Migration 0008: Add 'editor' role
-- Widens the CHECK constraint on users.role to accept the new value.
-- Editors can create/edit/delete flags but cannot manage users, environments, or SDK keys.
DO $$ BEGIN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'editor', 'viewer'));
