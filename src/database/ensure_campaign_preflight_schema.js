const db = require('./pg-client');

async function ensureCampaignPreflightSchema(database = db) {
    await database.query(`
        ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS plan_hash TEXT DEFAULT NULL
    `);
    await database.query(`
        ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS plan_approved_at TIMESTAMPTZ DEFAULT NULL
    `);
}

module.exports = { ensureCampaignPreflightSchema };
