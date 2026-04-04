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

        // Messages table for Live Inbox
        await db.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                remote_phone TEXT NOT NULL,
                sender TEXT NOT NULL DEFAULT 'them',
                direction TEXT NOT NULL DEFAULT 'inbound',
                body TEXT,
                whatsapp_timestamp TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_tenant_phone
            ON messages (tenant_id, remote_phone, created_at DESC)
        `);

        // WhatsApp session tracking columns on tenants
        await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_status TEXT DEFAULT 'disconnected'`);
        await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT`);

        console.log('✅ Migration complete: tenants.role, tenants.message_quota, tenants.messages_used, sent_logs.failed_at, campaigns.failed_count, messages table, tenants.whatsapp_status/whatsapp_phone');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
    process.exit(0);
}

migrate();
