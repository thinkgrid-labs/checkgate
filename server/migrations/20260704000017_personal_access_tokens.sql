-- Personal access tokens: scoped, user-owned API credentials for CI/CD,
-- Terraform, and other automation — an alternative to the always-admin-equivalent
-- SDK keys. A token acts as its owning user (inherits their role and project
-- memberships) but can be capped to read-only, and can optionally expire.
--
-- Tokens are stored as a SHA-256 hash (fast to verify, unlike the Argon2 hashes
-- used for login passwords) since the token itself carries 192 bits of entropy
-- and needs no slow-hash brute-force protection.
CREATE TABLE IF NOT EXISTS personal_access_tokens (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT         NOT NULL,
    token_hash   TEXT         NOT NULL UNIQUE,
    prefix       TEXT         NOT NULL,
    scope        TEXT         NOT NULL DEFAULT 'read_write'
                              CHECK (scope IN ('read_only', 'read_write')),
    expires_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_access_tokens_user ON personal_access_tokens(user_id);
