const db = require('./pg-client');
const { ensureCampaignContinuitySchema } = require('./ensure_campaign_continuity_schema');
const { ensureCampaignPreflightSchema } = require('./ensure_campaign_preflight_schema');

async function initializeSaaS() {
    console.log('🚀 Initializing SaaS Schema (PostgreSQL)...');

    try {
        // 1. Tenants Table
        await db.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        settings JSONB DEFAULT '{}',
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        message_quota INTEGER NOT NULL DEFAULT 99,
        messages_used INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // 2. Campaigns Table
        await db.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        template_path TEXT,
        contacts_path TEXT,
        message_templates JSONB,
        canvas_config JSONB,
        voicenote_path TEXT,
        last_sent_row INTEGER DEFAULT 1,
        failed_count INTEGER NOT NULL DEFAULT 0,
        scheduled_at TIMESTAMPTZ DEFAULT NULL,
        timezone TEXT DEFAULT 'Asia/Riyadh',
        schedule_job_id UUID DEFAULT NULL,
        schedule_attempts INTEGER NOT NULL DEFAULT 0,
        schedule_last_error TEXT DEFAULT NULL,
        schedule_last_attempt_at TIMESTAMPTZ DEFAULT NULL,
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // 3. Contacts Table (FOR SaaS)
        await db.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
        name TEXT,
        phone TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // 4. Sent Logs Table (for Analytics/History)
        await db.query(`
      CREATE TABLE IF NOT EXISTS sent_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        name TEXT,
        status TEXT DEFAULT 'success',
        failed_at TIMESTAMP DEFAULT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // 5. Messages Table (Live Inbox — inbound + outbound chat history)
        await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        remote_phone TEXT NOT NULL,
        sender TEXT NOT NULL DEFAULT 'them',
        direction TEXT NOT NULL DEFAULT 'inbound',
        body TEXT,
        sender_name TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        whatsapp_timestamp TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Index for fast conversation loading
        await db.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_tenant_phone
      ON messages (tenant_id, remote_phone, created_at DESC)
    `);

        await ensureCampaignContinuitySchema(db);
        await ensureCampaignPreflightSchema(db);

        console.log('✅ SaaS PostgreSQL Schema is ready.');
    } catch (err) {
        console.error('❌ Schema Init Failed:', err);
    } finally {
        process.exit(0);
    }
}

initializeSaaS();
