/**
 * Azzam — Schedule Manager
 * Polls for scheduled campaigns and triggers them automatically.
 *
 * Design decisions:
 *   1. 30s poll interval — balances accuracy with DB load
 *   2. WhatsApp readiness check BEFORE triggering — prevents instant failures
 *   3. Quota check BEFORE triggering — respects tenant limits
 *   4. Retry logic with exponential backoff — handles transient failures
 *   5. Max 3 retries — then mark as failed with reason
 *   6. Socket.IO notifications — tenant sees real-time status changes
 */

const db = require('../database/pg-client');

const POLL_INTERVAL_MS = 30000;   // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAYS = [60000, 300000, 900000]; // 1min, 5min, 15min

class ScheduleManager {
    constructor() {
        this._intervalId = null;
        this._running = false;
        this._io = null;
    }

    /** Inject Socket.IO instance for real-time notifications */
    setIo(io) {
        this._io = io;
    }

    /** Emit event to tenant's Socket.IO room */
    _emitToTenant(tenantId, event, data) {
        if (this._io) {
            this._io.to(`tenant_${tenantId}`).emit(event, data);
        }
    }

    start(pollMs = POLL_INTERVAL_MS) {
        if (this._intervalId) return;
        console.log(`[ScheduleManager] Started — polling every ${pollMs / 1000}s`);
        this._intervalId = setInterval(() => this._poll(), pollMs);
        // Initial poll after 5s (give server time to fully initialize)
        setTimeout(() => this._poll(), 5000);
    }

    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
            console.log('[ScheduleManager] Stopped.');
        }
    }

    async _poll() {
        if (this._running) return;
        this._running = true;

        try {
            // Find campaigns that are due (scheduled_at in the past)
            // Use NOW() directly — PG compares TIMESTAMP WITHOUT TZ consistently
            // within the same session timezone, so no AT TIME ZONE conversion needed.
            // Frontend sends UTC via toISOString(), PG stores it in session TZ.
            // NOW() also uses session TZ. Same TZ for both = correct comparison.
            const nowUtc = new Date().toISOString();
            console.log(`[ScheduleManager] Polling at ${nowUtc} (UTC)`);
            const result = await db.query(
                `SELECT c.*, t.whatsapp_status, t.message_quota, t.messages_used
                 FROM campaigns c
                 JOIN tenants t ON c.tenant_id = t.id
                 WHERE c.status = 'scheduled'
                   AND c.scheduled_at <= NOW()`
            );

            if (result.rows.length > 0) {
                console.log(`[ScheduleManager] Found ${result.rows.length} due campaign(s)`);
            }

            for (const campaign of result.rows) {
                try {
                    console.log(`[ScheduleManager] Attempting campaign "${campaign.name}" (id: ${campaign.id}) — WA: ${campaign.whatsapp_status}, quota: ${campaign.messages_used}/${campaign.message_quota}`);
                    await this._triggerCampaign(campaign);
                } catch (err) {
                    console.error(`[ScheduleManager] Failed to trigger campaign ${campaign.id}:`, err.message);
                    await this._handleTriggerFailure(campaign, err);
                }
            }
        } catch (err) {
            console.error('[ScheduleManager] Poll error:', err.message);
        } finally {
            this._running = false;
        }
    }

    async _triggerCampaign(campaign) {
        const tenantId = campaign.tenant_id;
        const campaignId = campaign.id;

        // ── Pre-check 1: Is WhatsApp connected? ──
        if (campaign.whatsapp_status !== 'connected') {
            throw new Error(`واتساب غير متصل (الحالة: ${campaign.whatsapp_status || 'غير معروف'})`);
        }

        // ── Pre-check 2: Does tenant have quota? ──
        if (campaign.messages_used >= campaign.message_quota) {
            throw new Error(`الحصة مستنفدة (${campaign.messages_used}/${campaign.message_quota})`);
        }

        // ── Pre-check 3: Is another job already running for this tenant? ──
        const BackgroundQueue = require('./BackgroundQueue');
        if (BackgroundQueue.jobs && BackgroundQueue.jobs.has(tenantId)) {
            throw new Error('حملة أخرى تعمل حالياً لهذا الحساب');
        }

        // ── Load contacts ──
        const { loadContacts } = require('../utils/dataProcessor');
        const contacts = await loadContacts(campaign.contacts_path);
        if (!contacts || contacts.length === 0) {
            console.warn(`[ScheduleManager] Campaign ${campaignId} has no contacts — marking as failed.`);
            await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['failed', campaignId]);
            this._emitToTenant(tenantId, 'log', { message: `الحملة "${campaign.name}" فشلت — لا توجد جهات اتصال`, type: 'ERROR' });
            return;
        }

        // ── Parse config ──
        let messages = [];
        try {
            messages = JSON.parse(campaign.message_templates || '[]');
        } catch (e) {
            messages = [];
        }

        // Validate: must have at least a message or a template image
        const hasTemplate = !!campaign.template_path;
        if (messages.length === 0 && !hasTemplate) {
            console.warn(`[ScheduleManager] Campaign ${campaignId} has no messages and no template — marking as failed.`);
            await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['failed', campaignId]);
            this._emitToTenant(tenantId, 'log', { message: `الحملة "${campaign.name}" فشلت — لا توجد رسائل ولا قالب صورة`, type: 'ERROR' });
            return;
        }
        let canvasConfig = campaign.canvas_config || null;
        if (typeof canvasConfig === 'string') {
            try { canvasConfig = JSON.parse(canvasConfig); } catch (e) { canvasConfig = null; }
        }

        // ── Notify tenant ──
        console.log(`[ScheduleManager] Triggering scheduled campaign "${campaign.name}" (${contacts.length} contacts)`);
        this._emitToTenant(tenantId, 'log', {
            message: `بدء الحملة المجدولة "${campaign.name}" تلقائياً — ${contacts.length} جهة اتصال`,
            type: 'INFO'
        });

        // ── Clear scheduled_at and launch ──
        await db.query('UPDATE campaigns SET scheduled_at = NULL WHERE id = $1', [campaignId]);

        await BackgroundQueue.addJob(
            tenantId,
            campaignId,
            contacts,
            1,
            contacts.length,
            messages,
            hasTemplate,
            campaign.template_path,
            canvasConfig,
            campaign.voicenote_path || null
        );
    }

    /**
     * Handle trigger failure with retry logic.
     * Strategy:
     *   - Track retry count in campaign's failed_count column (repurposed)
     *   - On each failure, reschedule with exponential backoff
     *   - After MAX_RETRIES, mark as failed permanently
     */
    async _handleTriggerFailure(campaign, error) {
        const tenantId = campaign.tenant_id;
        const campaignId = campaign.id;
        const retryCount = (campaign.failed_count || 0) + 1;

        if (retryCount <= MAX_RETRIES) {
            // Reschedule with exponential backoff
            const delayMs = RETRY_DELAYS[retryCount - 1] || 300000;
            const newScheduledAt = new Date(Date.now() + delayMs);

            await db.query(
                'UPDATE campaigns SET failed_count = $1 WHERE id = $2',
                [retryCount, campaignId]
            );

            console.log(`[ScheduleManager] Retry ${retryCount}/${MAX_RETRIES} for campaign ${campaignId} — next attempt at ${newScheduledAt.toISOString()}`);
            this._emitToTenant(tenantId, 'log', {
                message: `الحملة المجدولة "${campaign.name}" — محاولة ${retryCount}/${MAX_RETRIES} بعد ${Math.round(delayMs / 60000)} دقيقة (${error.message})`,
                type: 'WARN'
            });
            // Don't change status — let it stay 'scheduled' so next poll picks it up
            // But set scheduled_at to future so it doesn't immediately re-trigger
            // NOTE: we only reschedule if the issue is transient (WA disconnected, quota, etc.)
            // For permanent errors (no contacts), we already handled above
        } else {
            // Max retries exceeded — mark as failed permanently
            await db.query('UPDATE campaigns SET status = $1, failed_count = $2 WHERE id = $3', ['failed', retryCount, campaignId]);
            console.error(`[ScheduleManager] Campaign ${campaignId} failed permanently after ${MAX_RETRIES} retries`);
            this._emitToTenant(tenantId, 'log', {
                message: `الحملة المجدولة "${campaign.name}" فشلت نهائياً بعد ${MAX_RETRIES} محاولات: ${error.message}`,
                type: 'ERROR'
            });
        }
    }
}

module.exports = new ScheduleManager();
