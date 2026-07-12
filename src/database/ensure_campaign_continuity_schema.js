const db = require('./pg-client');

async function ensureCampaignContinuitySchema(database = db) {
    await database.query(`
        ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS stop_requested_at TIMESTAMPTZ DEFAULT NULL
    `);
    await database.query(`
        ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS messaging_enabled BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await database.query(`
        CREATE TABLE IF NOT EXISTS campaign_recipients (
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            phone TEXT NOT NULL,
            name TEXT,
            source_row INTEGER,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped', 'needs_review')),
            attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
            last_error TEXT,
            claimed_at TIMESTAMPTZ,
            sent_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (tenant_id, campaign_id, phone)
        )
    `);
    await database.query(`
        CREATE INDEX IF NOT EXISTS idx_campaign_recipients_claim
        ON campaign_recipients (tenant_id, campaign_id, status, source_row)
    `);
}

module.exports = { ensureCampaignContinuitySchema };
