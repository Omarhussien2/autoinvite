const PgBoss = require('pg-boss');
const db = require('../database/pg-client');
const { ensureSmartScheduleSchema } = require('../database/ensure_smart_schedule_schema');
const { createLogger } = require('../utils/logger');
const log = createLogger('ScheduleManager');

const QUEUE_NAME = 'campaign.schedule.start';
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

function asDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid scheduled_at value');
    }
    return date;
}

function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function parseJsonObject(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
}

class ScheduleManager {
    constructor() {
        this._io = null;
        this._boss = null;
        this._starting = null;
        this._workerId = null;
    }

    setIo(io) {
        this._io = io;
    }

    _emitToTenant(tenantId, event, data) {
        if (this._io) {
            this._io.to(`tenant_${tenantId}`).emit(event, data);
        }
    }

    _bossConfig() {
        const base = {
            schema: 'pgboss',
            migrate: true,
            pollingIntervalSeconds: 5,
            monitorStateIntervalSeconds: 60,
            retryLimit: 0,
        };

        if (process.env.DATABASE_URL) {
            return {
                ...base,
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
            };
        }

        return {
            ...base,
            user: process.env.PGUSER || process.env.DB_USER || 'postgres',
            host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
            database: process.env.PGDATABASE || process.env.DB_NAME || 'autoinvite_saas',
            password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'postgres',
            port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
        };
    }

    start() {
        if (this._boss) return Promise.resolve(this._boss);
        if (this._starting) return this._starting;

        this._starting = this._start().catch((err) => {
            this._starting = null;
            throw err;
        });
        return this._starting;
    }

    async _start() {
        const boss = new PgBoss(this._bossConfig());
        boss.on('error', (err) => {
            log.error('pg-boss error:', err.message || err);
        });

        await boss.start();
        await boss.createQueue(QUEUE_NAME);
        this._workerId = await boss.work(QUEUE_NAME, { batchSize: 1, pollingIntervalSeconds: 5 }, async ([job]) => {
            if (job) {
                await this._handleScheduledJob(job);
            }
        });

        this._boss = boss;
        log.info(`Started pg-boss queue "${QUEUE_NAME}"`);
        await ensureSmartScheduleSchema();
        await this.reconcileScheduledCampaigns();
        return boss;
    }

    async stop() {
        if (!this._boss) return;

        const boss = this._boss;
        this._boss = null;
        this._starting = null;

        try {
            if (this._workerId) {
                await boss.offWork({ id: this._workerId });
                this._workerId = null;
            }
            await boss.stop({ graceful: true, timeout: 10000, wait: true });
            log.info('Stopped.');
        } catch (err) {
            log.error('Stop error:', err.message);
        }
    }

    async _ensureStarted() {
        return this.start();
    }

    async scheduleCampaign(campaignId, tenantId, options = {}) {
        const scheduledAt = asDate(options.scheduledAt);
        if (scheduledAt.getTime() <= Date.now()) {
            throw new Error('Scheduled time must be in the future');
        }

        await this._enqueueCampaign({
            id: campaignId,
            tenant_id: tenantId,
            scheduled_at: scheduledAt,
            timezone: options.timezone || 'Asia/Riyadh',
            schedule_job_id: options.previousJobId || null,
        }, {
            allowPast: false,
            resetAttempts: true,
        });
    }

    async scheduleBatch(batchId, campaignId, tenantId, options = {}) {
        await ensureSmartScheduleSchema();

        const scheduledAt = asDate(options.scheduledAt);
        if (scheduledAt.getTime() <= Date.now() && !options.allowPast) {
            throw new Error('Scheduled time must be in the future');
        }

        await this._enqueueBatch({
            id: batchId,
            campaign_id: campaignId,
            tenant_id: tenantId,
            scheduled_at: scheduledAt,
            schedule_job_id: options.previousJobId || null,
        }, {
            allowPast: !!options.allowPast,
            resetAttempts: true,
        });
    }

    async cancelCampaign(campaignId, tenantId, previousJobId = null) {
        await this._ensureStarted();

        const jobId = previousJobId || await this._getCampaignJobId(campaignId, tenantId);
        await this._cancelJob(jobId);

        await db.query(
            `UPDATE campaigns
             SET schedule_job_id = NULL,
                 schedule_attempts = 0,
                 schedule_last_error = NULL,
                 schedule_last_attempt_at = NULL
             WHERE id = $1 AND tenant_id = $2`,
            [campaignId, tenantId]
        );
    }

    async reconcileScheduledCampaigns() {
        await this._ensureStarted();
        await ensureSmartScheduleSchema();

        const result = await db.query(
            `SELECT id, tenant_id, scheduled_at, timezone, schedule_job_id
             FROM campaigns
             WHERE status = 'scheduled'
               AND scheduled_at IS NOT NULL
               AND (schedule_job_id IS NULL OR scheduled_at <= NOW())`
        );

        for (const campaign of result.rows) {
            try {
                await this._enqueueCampaign(campaign, {
                    allowPast: true,
                    resetAttempts: false,
                });
                log.info(`Reconciled campaign ${campaign.id}`);
            } catch (err) {
                log.error(`Failed to reconcile campaign ${campaign.id}:`, err.message);
            }
        }

        const batchResult = await db.query(
            `SELECT id, campaign_id, tenant_id, scheduled_at, schedule_job_id
             FROM campaign_batches
             WHERE status = 'scheduled'
               AND scheduled_at IS NOT NULL
               AND (schedule_job_id IS NULL OR scheduled_at <= NOW())`
        );

        for (const batch of batchResult.rows) {
            try {
                await this._enqueueBatch(batch, {
                    allowPast: true,
                    resetAttempts: false,
                });
                log.info(`Reconciled campaign batch ${batch.id}`);
            } catch (err) {
                log.error(`Failed to reconcile batch ${batch.id}:`, err.message);
            }
        }
    }

    async _enqueueCampaign(campaign, options = {}) {
        const boss = await this._ensureStarted();
        const scheduledAt = asDate(campaign.scheduled_at);
        const startAfter = options.allowPast && scheduledAt.getTime() <= Date.now()
            ? new Date(Date.now() + 1000)
            : scheduledAt;

        if (!options.allowPast && startAfter.getTime() <= Date.now()) {
            throw new Error('Scheduled time must be in the future');
        }

        await this._cancelJob(campaign.schedule_job_id);

        const jobId = await boss.send(QUEUE_NAME, {
            campaignId: campaign.id,
            tenantId: campaign.tenant_id,
        }, {
            startAfter,
            retryLimit: 0,
            expireInMinutes: 15,
            deleteAfterDays: 14,
        });

        if (!jobId) {
            throw new Error('Failed to create scheduled campaign job');
        }

        const attemptsSql = options.resetAttempts ? ', schedule_attempts = 0' : '';
        await db.query(
            `UPDATE campaigns
             SET status = 'scheduled',
                 scheduled_at = $1,
                 timezone = COALESCE($2, timezone),
                 schedule_job_id = $3,
                 schedule_last_error = NULL,
                 schedule_last_attempt_at = NULL
                 ${attemptsSql}
             WHERE id = $4 AND tenant_id = $5`,
            [scheduledAt.toISOString(), campaign.timezone || 'Asia/Riyadh', jobId, campaign.id, campaign.tenant_id]
        );

        return jobId;
    }

    async _enqueueBatch(batch, options = {}) {
        await ensureSmartScheduleSchema();

        const boss = await this._ensureStarted();
        const scheduledAt = asDate(batch.scheduled_at);
        const startAfter = options.allowPast && scheduledAt.getTime() <= Date.now()
            ? new Date(Date.now() + 1000)
            : scheduledAt;

        if (!options.allowPast && startAfter.getTime() <= Date.now()) {
            throw new Error('Scheduled time must be in the future');
        }

        await this._cancelJob(batch.schedule_job_id);

        const jobId = await boss.send(QUEUE_NAME, {
            batchId: batch.id,
            campaignId: batch.campaign_id,
            tenantId: batch.tenant_id,
        }, {
            startAfter,
            retryLimit: 0,
            expireInMinutes: 15,
            deleteAfterDays: 14,
        });

        if (!jobId) {
            throw new Error('Failed to create scheduled batch job');
        }

        const attemptsSql = options.resetAttempts ? ', schedule_attempts = 0' : '';
        await db.query(
            `UPDATE campaign_batches
             SET status = 'scheduled',
                 scheduled_at = $1,
                 schedule_job_id = $2,
                 schedule_last_error = NULL,
                 schedule_last_attempt_at = NULL
                 ${attemptsSql}
             WHERE id = $3 AND tenant_id = $4`,
            [scheduledAt.toISOString(), jobId, batch.id, batch.tenant_id]
        );

        return jobId;
    }

    async _handleScheduledJob(job) {
        const campaignId = job.data && job.data.campaignId;
        const tenantId = job.data && job.data.tenantId;
        const batchId = job.data && job.data.batchId;
        if (!campaignId || !tenantId) return;
        if (batchId) {
            await this._handleScheduledBatchJob(job);
            return;
        }

        const result = await db.query(
            `SELECT c.*, t.whatsapp_status, t.message_quota, t.messages_used
             FROM campaigns c
             JOIN tenants t ON c.tenant_id = t.id
             WHERE c.id = $1 AND c.tenant_id = $2`,
            [campaignId, tenantId]
        );

        const campaign = result.rows[0];
        if (!campaign) return;
        if (campaign.status !== 'scheduled') return;
        if (campaign.schedule_job_id && String(campaign.schedule_job_id) !== String(job.id)) return;
        if (campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now() + 1000) return;

        await db.query(
            `UPDATE campaigns
             SET schedule_last_attempt_at = NOW()
             WHERE id = $1`,
            [campaignId]
        );

        await this._triggerCampaign(campaign);
    }

    async _handleScheduledBatchJob(job) {
        const batchId = job.data && job.data.batchId;
        const campaignId = job.data && job.data.campaignId;
        const tenantId = job.data && job.data.tenantId;
        if (!batchId || !campaignId || !tenantId) return;

        const result = await db.query(
            `SELECT b.*, c.name, c.message_templates, c.template_path, c.canvas_config, c.contacts_path, c.voicenote_path,
                    t.whatsapp_status, t.message_quota, t.messages_used
             FROM campaign_batches b
             JOIN campaigns c ON c.id = b.campaign_id AND c.tenant_id = b.tenant_id
             JOIN tenants t ON t.id = b.tenant_id
             WHERE b.id = $1 AND b.campaign_id = $2 AND b.tenant_id = $3`,
            [batchId, campaignId, tenantId]
        );

        const batch = result.rows[0];
        if (!batch) return;
        if (batch.status !== 'scheduled') return;
        if (batch.schedule_job_id && String(batch.schedule_job_id) !== String(job.id)) return;
        if (batch.scheduled_at && new Date(batch.scheduled_at).getTime() > Date.now() + 1000) return;

        await db.query(
            `UPDATE campaign_batches
             SET schedule_last_attempt_at = NOW()
             WHERE id = $1`,
            [batchId]
        );

        await this._triggerBatch(batch);
    }

    async _triggerBatch(batch) {
        const tenantId = batch.tenant_id;
        const campaignId = batch.campaign_id;

        if (batch.whatsapp_status !== 'connected') {
            await this._retryOrPauseBatch(batch, new Error(`WhatsApp is not connected (${batch.whatsapp_status || 'unknown'})`));
            return;
        }

        if (batch.messages_used >= batch.message_quota) {
            await this._pauseBatch(batch, `Quota exhausted (${batch.messages_used}/${batch.message_quota})`);
            return;
        }

        const BackgroundQueue = require('./BackgroundQueue');
        if (BackgroundQueue.jobs && BackgroundQueue.jobs.has(tenantId)) {
            await this._retryOrPauseBatch(batch, new Error('Another campaign is already running for this tenant'));
            return;
        }

        const { loadContacts } = require('../utils/dataProcessor');
        let contacts;
        try {
            contacts = await loadContacts(batch.contacts_path);
        } catch (err) {
            await this._failBatch(batch, `Contacts file could not be loaded: ${err.message}`);
            return;
        }

        const messages = parseJsonArray(batch.message_templates);
        const hasTemplate = !!batch.template_path;
        if (messages.length === 0 && !hasTemplate) {
            await this._failBatch(batch, 'Campaign has no messages and no template');
            return;
        }

        this._emitToTenant(tenantId, 'log', {
            message: `Starting smart batch ${batch.batch_number} for "${batch.name}" (rows ${batch.start_row}-${batch.end_row}).`,
            type: 'INFO',
        });

        try {
            await db.query(
                `UPDATE campaign_batches
                 SET status = 'running',
                     schedule_job_id = NULL,
                     schedule_last_attempt_at = NOW()
                 WHERE id = $1 AND tenant_id = $2`,
                [batch.id, tenantId]
            );
            await db.query('UPDATE campaigns SET status = $1 WHERE id = $2 AND tenant_id = $3', ['running', campaignId, tenantId]);
            await BackgroundQueue.addJob(
                tenantId,
                campaignId,
                contacts,
                batch.last_sent_row || batch.start_row,
                batch.end_row,
                messages,
                hasTemplate,
                batch.template_path,
                parseJsonObject(batch.canvas_config),
                batch.voicenote_path || null,
                {
                    batchId: batch.id,
                    dailyLimit: batch.daily_limit,
                    timezone: batch.timezone,
                    minDelaySeconds: batch.min_delay_seconds,
                    maxDelaySeconds: batch.max_delay_seconds,
                    breakAfterMessages: batch.break_after_messages,
                    breakMinMinutes: batch.break_min_minutes,
                    breakMaxMinutes: batch.break_max_minutes,
                }
            );
        } catch (err) {
            await this._retryOrPauseBatch(batch, err);
        }
    }

    async _triggerCampaign(campaign) {
        const tenantId = campaign.tenant_id;
        const campaignId = campaign.id;

        if (campaign.whatsapp_status !== 'connected') {
            await this._retryOrPause(campaign, new Error(`WhatsApp is not connected (${campaign.whatsapp_status || 'unknown'})`));
            return;
        }

        if (campaign.messages_used >= campaign.message_quota) {
            await this._pauseCampaign(campaign, `Quota exhausted (${campaign.messages_used}/${campaign.message_quota})`);
            return;
        }

        const BackgroundQueue = require('./BackgroundQueue');
        if (BackgroundQueue.jobs && BackgroundQueue.jobs.has(tenantId)) {
            await this._retryOrPause(campaign, new Error('Another campaign is already running for this tenant'));
            return;
        }

        const { loadContacts } = require('../utils/dataProcessor');
        let contacts;
        try {
            contacts = await loadContacts(campaign.contacts_path);
        } catch (err) {
            await this._failCampaign(campaign, `Contacts file could not be loaded: ${err.message}`);
            return;
        }

        if (!contacts || contacts.length === 0) {
            await this._failCampaign(campaign, 'Campaign has no contacts');
            return;
        }

        const messages = parseJsonArray(campaign.message_templates);
        const hasTemplate = !!campaign.template_path;
        if (messages.length === 0 && !hasTemplate) {
            await this._failCampaign(campaign, 'Campaign has no messages and no template');
            return;
        }

        this._emitToTenant(tenantId, 'log', {
            message: `Starting scheduled campaign "${campaign.name}" automatically (${contacts.length} contacts).`,
            type: 'INFO',
        });

        try {
            await BackgroundQueue.addJob(
                tenantId,
                campaignId,
                contacts,
                campaign.last_sent_row || 1,
                contacts.length,
                messages,
                hasTemplate,
                campaign.template_path,
                parseJsonObject(campaign.canvas_config),
                campaign.voicenote_path || null
            );
        } catch (err) {
            await this._retryOrPause(campaign, err);
            return;
        }

        await db.query(
            `UPDATE campaigns
             SET scheduled_at = NULL,
                 schedule_job_id = NULL,
                 schedule_attempts = 0,
                 schedule_last_error = NULL,
                 schedule_last_attempt_at = NOW()
             WHERE id = $1`,
            [campaignId]
        );
    }

    async _retryOrPause(campaign, error) {
        const attempt = (parseInt(campaign.schedule_attempts || 0, 10) || 0) + 1;
        const message = error && error.message ? error.message : String(error);

        if (attempt > MAX_RETRIES) {
            await this._pauseCampaign(campaign, `Scheduling paused after ${MAX_RETRIES} retries: ${message}`);
            return;
        }

        const delayMs = RETRY_DELAYS_MS[attempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        const nextRunAt = new Date(Date.now() + delayMs);
        const jobId = await this._enqueueCampaign({
            id: campaign.id,
            tenant_id: campaign.tenant_id,
            scheduled_at: nextRunAt,
            timezone: campaign.timezone || 'Asia/Riyadh',
            schedule_job_id: null,
        }, {
            allowPast: false,
            resetAttempts: false,
        });

        await db.query(
            `UPDATE campaigns
             SET schedule_attempts = $1,
                 schedule_last_error = $2,
                 schedule_last_attempt_at = NOW(),
                 schedule_job_id = $3,
                 scheduled_at = $4
             WHERE id = $5`,
            [attempt, message, jobId, nextRunAt.toISOString(), campaign.id]
        );

        this._emitToTenant(campaign.tenant_id, 'log', {
            message: `Scheduled campaign "${campaign.name}" will retry in ${Math.round(delayMs / 60000)} minute(s): ${message}`,
            type: 'WARN',
        });
    }

    async _retryOrPauseBatch(batch, error) {
        const attempt = (parseInt(batch.schedule_attempts || 0, 10) || 0) + 1;
        const message = error && error.message ? error.message : String(error);

        if (attempt > MAX_RETRIES) {
            await this._pauseBatch(batch, `Scheduling paused after ${MAX_RETRIES} retries: ${message}`);
            return;
        }

        const delayMs = RETRY_DELAYS_MS[attempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        const nextRunAt = new Date(Date.now() + delayMs);
        const jobId = await this._enqueueBatch({
            id: batch.id,
            campaign_id: batch.campaign_id,
            tenant_id: batch.tenant_id,
            scheduled_at: nextRunAt,
            schedule_job_id: null,
        }, {
            allowPast: false,
            resetAttempts: false,
        });

        await db.query(
            `UPDATE campaign_batches
             SET schedule_attempts = $1,
                 schedule_last_error = $2,
                 schedule_last_attempt_at = NOW(),
                 schedule_job_id = $3,
                 scheduled_at = $4
             WHERE id = $5`,
            [attempt, message, jobId, nextRunAt.toISOString(), batch.id]
        );

        this._emitToTenant(batch.tenant_id, 'log', {
            message: `Smart batch ${batch.batch_number} will retry in ${Math.round(delayMs / 60000)} minute(s): ${message}`,
            type: 'WARN',
        });
    }

    async _pauseBatch(batch, reason) {
        await db.query(
            `UPDATE campaign_batches
             SET status = 'paused',
                 schedule_job_id = NULL,
                 schedule_last_error = $1,
                 schedule_last_attempt_at = NOW()
             WHERE id = $2`,
            [reason, batch.id]
        );
        await db.query(
            `UPDATE campaigns
             SET status = 'paused',
                 paused_reason = $1
             WHERE id = $2 AND tenant_id = $3`,
            [reason, batch.campaign_id, batch.tenant_id]
        );

        this._emitToTenant(batch.tenant_id, 'log', {
            message: `Smart batch ${batch.batch_number} paused: ${reason}`,
            type: 'ERROR',
        });
    }

    async _failBatch(batch, reason) {
        await db.query(
            `UPDATE campaign_batches
             SET status = 'failed',
                 schedule_job_id = NULL,
                 schedule_last_error = $1,
                 schedule_last_attempt_at = NOW()
             WHERE id = $2`,
            [reason, batch.id]
        );

        this._emitToTenant(batch.tenant_id, 'log', {
            message: `Smart batch ${batch.batch_number} failed: ${reason}`,
            type: 'ERROR',
        });
    }

    async _pauseCampaign(campaign, reason) {
        await db.query(
            `UPDATE campaigns
             SET status = 'paused',
                 schedule_job_id = NULL,
                 schedule_last_error = $1,
                 schedule_last_attempt_at = NOW()
             WHERE id = $2`,
            [reason, campaign.id]
        );

        this._emitToTenant(campaign.tenant_id, 'log', {
            message: `Scheduled campaign "${campaign.name}" paused: ${reason}`,
            type: 'ERROR',
        });
    }

    async _failCampaign(campaign, reason) {
        await db.query(
            `UPDATE campaigns
             SET status = 'failed',
                 schedule_job_id = NULL,
                 schedule_last_error = $1,
                 schedule_last_attempt_at = NOW()
             WHERE id = $2`,
            [reason, campaign.id]
        );

        this._emitToTenant(campaign.tenant_id, 'log', {
            message: `Scheduled campaign "${campaign.name}" failed: ${reason}`,
            type: 'ERROR',
        });
    }

    async _getCampaignJobId(campaignId, tenantId) {
        const result = await db.query(
            'SELECT schedule_job_id FROM campaigns WHERE id = $1 AND tenant_id = $2',
            [campaignId, tenantId]
        );
        return result.rows[0] ? result.rows[0].schedule_job_id : null;
    }

    async _cancelJob(jobId) {
        if (!jobId || !this._boss) return;
        try {
            await this._boss.cancel(QUEUE_NAME, String(jobId));
        } catch (err) {
            log.warn(`Could not cancel job ${jobId}:`, err.message);
        }
    }

    async getStatus(tenantId) {
        await ensureSmartScheduleSchema();

        const scheduled = await db.query(
            `SELECT id, name, status, scheduled_at, timezone, schedule_job_id,
                    schedule_attempts, schedule_last_error, created_at
             FROM campaigns
             WHERE tenant_id = $1 AND status = 'scheduled'
             ORDER BY scheduled_at ASC`,
            [tenantId]
        );
        const queueSize = this._boss ? await this._boss.getQueueSize(QUEUE_NAME).catch(() => null) : null;
        const batches = await db.query(
            `SELECT id, campaign_id, batch_number, status, scheduled_at, start_row, end_row,
                    sent_count, failed_count, schedule_last_error
             FROM campaign_batches
             WHERE tenant_id = $1
             ORDER BY scheduled_at ASC
             LIMIT 100`,
            [tenantId]
        );

        return {
            started: !!this._boss,
            queue: QUEUE_NAME,
            queue_size: queueSize,
            scheduled_campaigns: scheduled.rows,
            smart_batches: batches.rows,
        };
    }
}

module.exports = new ScheduleManager();
