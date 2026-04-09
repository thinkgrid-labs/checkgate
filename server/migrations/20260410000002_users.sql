-- Server-side user store.
-- Replaces browser-localStorage user management so name/role cannot be
-- forged by the client at login time.
CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL    PRIMARY KEY,
    name        TEXT         NOT NULL,
    email       TEXT         NOT NULL UNIQUE,
    role        TEXT         NOT NULL DEFAULT 'viewer'
                             CHECK (role IN ('admin', 'viewer')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
