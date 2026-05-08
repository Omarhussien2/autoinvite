const db = require('./pg-client');

let ensurePromise = null;

async function ensureSmartScheduleSchema() {
    if (ensurePromise) return ensurePromise;

    ensurePromise = (async () => {
        try {
            await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
        } catch (err) {
            console.warn('[DB] Could not ensure pgcrypto extension:', err.message);
        }

        await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_daily_limit INTEGER NOT NULL DEFAULT 200`);

        await db.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'campaigns'
                      AND column_name = 'scheduled_at'
                      AND data_type = 'timestamp without time zone'
                ) THEN
                    ALTER TABLE campaigns
                    ALTER COLUMN scheduled_at TYPE TIMESTAMPTZ
                    USING scheduled_at AT TIME ZONE 'UTC';
                ELSE
                    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;
                END IF;
            END $$;
        `);

        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Riyadh'`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS voicenote_path TEXT`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_sent_row INTEGER DEFAULT 1`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS failed_count INTEGER NOT NULL DEFAULT 0`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS schedule_job_id UUID DEFAULT NULL`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS schedule_attempts INTEGER NOT NULL DEFAULT 0`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS schedule_last_error TEXT DEFAULT NULL`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS schedule_last_attempt_at TIMESTAMPTZ DEFAULT NULL`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS smart_schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS schedule_mode TEXT NOT NULL DEFAULT 'immediate'`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS daily_limit INTEGER NOT NULL DEFAULT 100`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS send_window_start TEXT NOT NULL DEFAULT '10:00'`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS send_window_end TEXT NOT NULL DEFAULT '20:00'`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_delay_seconds INTEGER NOT NULL DEFAULT 120`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_delay_seconds INTEGER NOT NULL DEFAULT 240`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS break_after_messages INTEGER NOT NULL DEFAULT 25`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS break_min_minutes INTEGER NOT NULL DEFAULT 10`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS break_max_minutes INTEGER NOT NULL DEFAULT 20`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS safety_mode TEXT NOT NULL DEFAULT 'balanced'`);
        await db.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS paused_reason TEXT`);

        await db.query(`
            CREATE TABLE IF NOT EXISTS campaign_batches (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
                batch_number INTEGER NOT NULL,
                start_row INTEGER NOT NULL,
                end_row INTEGER NOT NULL,
                scheduled_at TIMESTAMPTZ NOT NULL,
                send_window_start TEXT NOT NULL,
                send_window_end TEXT NOT NULL,
                timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
                daily_limit INTEGER NOT NULL,
                min_delay_seconds INTEGER NOT NULL,
                max_delay_seconds INTEGER NOT NULL,
                break_after_messages INTEGER NOT NULL,
                break_min_minutes INTEGER NOT NULL,
                break_max_minutes INTEGER NOT NULL,
                safety_mode TEXT NOT NULL DEFAULT 'balanced',
                status TEXT NOT NULL DEFAULT 'scheduled',
                sent_count INTEGER NOT NULL DEFAULT 0,
                failed_count INTEGER NOT NULL DEFAULT 0,
                last_sent_row INTEGER,
                schedule_job_id UUID DEFAULT NULL,
                schedule_attempts INTEGER NOT NULL DEFAULT 0,
                schedule_last_error TEXT DEFAULT NULL,
                schedule_last_attempt_at TIMESTAMPTZ DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (tenant_id, campaign_id, batch_number)
            )
        `);

        await db.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(status, scheduled_at) WHERE status = 'scheduled'`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_schedule_job ON campaigns(schedule_job_id) WHERE schedule_job_id IS NOT NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_campaign_batches_schedule ON campaign_batches(status, scheduled_at)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_campaign_batches_tenant ON campaign_batches(tenant_id, campaign_id, batch_number)`);
    })().catch((err) => {
        ensurePromise = null;
        throw err;
    });

    return ensurePromise;
}

module.exports = { ensureSmartScheduleSchema };
