-- Per-project user membership with per-project roles.
-- Workspace admins bypass this table and always have access to all projects.

CREATE TABLE project_members (
    project_id UUID   NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    role       TEXT   NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    PRIMARY KEY (project_id, user_id)
);
