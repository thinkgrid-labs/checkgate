-- Login brute-force protection.
-- Tracks failed login attempts per (email, ip) so account-level lockout
-- works independently of the global IP rate limiter.

CREATE TABLE IF NOT EXISTS login_attempts (
    id          BIGSERIAL    PRIMARY KEY,
    email       TEXT         NOT NULL,
    ip          TEXT         NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: "how many failures for this email in the last N minutes?"
CREATE INDEX IF NOT EXISTS login_attempts_email_time
    ON login_attempts (email, attempted_at DESC);

-- Auto-purge rows older than 1 hour so the table stays small.
-- Runs as a periodic cleanup; old rows are irrelevant for lockout decisions.
CREATE INDEX IF NOT EXISTS login_attempts_cleanup
    ON login_attempts (attempted_at);
