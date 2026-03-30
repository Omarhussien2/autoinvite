const db = require('./pg-client');

async function migrate() {
    console.log('🔄 Running SaaS migration (adding quota + role columns)...');

    try {
        await db.query(`
            ALTER TABLE tenants
            ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'
        `);

        await db.query(`
            ALTER TABLE tenants
            ADD COLUMN IF NOT EXISTS message_quota INTEGER NOT NULL DEFAULT 1000
        `);

        await db.query(`
            ALTER TABLE tenants
            ADD COLUMN IF NOT EXISTS messages_used INTEGER NOT NULL DEFAULT 0
        `);

        await db.query(`
            ALTER TABLE sent_logs
            ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP DEFAULT NULL
        `);

        await db.query(`
            ALTER TABLE campaigns
            ADD COLUMN IF NOT EXISTS failed_count INTEGER NOT NULL DEFAULT 0
        `);

        console.log('✅ Migration complete: tenants.role, tenants.message_quota, tenants.messages_used, sent_logs.failed_at, campaigns.failed_count');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
    process.exit(0);
}

migrate();
