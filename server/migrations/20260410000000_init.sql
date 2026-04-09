-- server/migrations/20260410000000_init.sql
-- Initial schema for Checkgate

CREATE TABLE IF NOT EXISTS flags (
    key VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL
);
