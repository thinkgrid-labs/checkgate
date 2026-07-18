-- Chat integrations: deliver flag and change-request activity to Slack or
-- Microsoft Teams via an incoming-webhook URL.
--
-- Kept separate from the generic `webhooks` table on purpose. A raw webhook
-- posts our own JSON envelope to an arbitrary endpoint; an integration posts a
-- *provider-shaped* message (Slack Block Kit / Teams Adaptive Card) to that
-- provider's incoming-webhook URL. Different payload contract, different
-- per-provider constraints, and integrations additionally filter on event type.

CREATE TABLE IF NOT EXISTS integrations (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID         NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    -- 'slack' | 'teams'. Constrained here so an unknown provider can never be
    -- stored; the formatter matches exhaustively on it.
    kind           TEXT         NOT NULL CHECK (kind IN ('slack', 'teams')),
    name           TEXT         NOT NULL,
    webhook_url    TEXT         NOT NULL,
    -- Event types this integration wants. Empty array means "every event",
    -- which keeps the common case free of setup.
    events         TEXT[]       NOT NULL DEFAULT '{}',
    enabled        BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integrations_env
    ON integrations (environment_id);

-- Rolling delivery log, mirroring webhook_deliveries — retain the last 200 per
-- integration. Older rows are pruned by the delivery writer.
CREATE TABLE IF NOT EXISTS integration_deliveries (
    id             BIGSERIAL    PRIMARY KEY,
    integration_id UUID         NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    event          TEXT         NOT NULL,
    payload        JSONB        NOT NULL,
    status_code    INT,
    response_body  TEXT,
    error          TEXT,
    delivered_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_deliveries_integration_time
    ON integration_deliveries (integration_id, delivered_at DESC);
