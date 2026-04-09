-- SDK keys — replaces the SDK_KEY environment variable.
-- Multiple keys are supported; any valid key authenticates a request.
CREATE TABLE IF NOT EXISTS sdk_keys (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL DEFAULT 'Default',
    value       TEXT        NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generic key-value settings store (used for setup_complete flag, etc.)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
