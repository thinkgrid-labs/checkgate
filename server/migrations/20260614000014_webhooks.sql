-- Outbound webhooks: notify external systems when flags change.

CREATE TABLE IF NOT EXISTS webhooks (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID         NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    name           TEXT         NOT NULL,
    url            TEXT         NOT NULL,
    secret         TEXT,
    enabled        BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhooks_env
    ON webhooks (environment_id);

-- Rolling delivery log — retain the last 200 deliveries per webhook.
-- Older rows are pruned by the delivery writer.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id             BIGSERIAL    PRIMARY KEY,
    webhook_id     UUID         NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event          TEXT         NOT NULL,
    payload        JSONB        NOT NULL,
    status_code    INT,
    response_body  TEXT,
    error          TEXT,
    delivered_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_time
    ON webhook_deliveries (webhook_id, delivered_at DESC);
