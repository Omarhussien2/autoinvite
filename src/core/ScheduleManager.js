const db = require('../database/pg-client');

class ScheduleManager {
    constructor() {
        this._intervalId = null;
        this._running = false;
    }

    start(pollMs = 60000) {
        if (this._intervalId) return;
        console.log(`[ScheduleManager] Started — polling every ${pollMs / 1000}s`);
        this._intervalId = setInterval(() => this._poll(), pollMs);
        this._poll();
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
            const result = await db.query(
                `SELECT * FROM campaigns WHERE status = 'scheduled' AND scheduled_at <= NOW()`
            );

            for (const campaign of result.rows) {
                try {
                    console.log(`[ScheduleManager] Triggering scheduled campaign ${campaign.id} (${campaign.name})`);
                    await this._triggerCampaign(campaign);
                } catch (err) {
                    console.error(`[ScheduleManager] Failed to trigger campaign ${campaign.id}:`, err.message);
                    await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['failed', campaign.id]).catch(() => {});
                }
            }
        } catch (err) {
            console.error('[ScheduleManager] Poll error:', err.message);
        } finally {
            this._running = false;
        }
    }

    async _triggerCampaign(campaign) {
        const BackgroundQueue = require('./BackgroundQueue');
        const { loadContacts } = require('../utils/dataProcessor');

        const tenantId = campaign.tenant_id;
        const campaignId = campaign.id;

        const contacts = await loadContacts(campaign.contacts_path);
        if (!contacts || contacts.length === 0) {
            console.warn(`[ScheduleManager] Campaign ${campaignId} has no contacts — marking as failed.`);
            await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['failed', campaignId]);
            return;
        }

        let messages = [];
        try {
            messages = JSON.parse(campaign.message_templates || '[]');
        } catch (e) {
            messages = [];
        }

        const hasTemplate = !!campaign.template_path;
        const canvasConfig = campaign.canvas_config || '{}';

        await BackgroundQueue.addJob(
            tenantId,
            campaignId,
            contacts,
            0,
            contacts.length - 1,
            messages,
            hasTemplate,
            campaign.template_path,
            canvasConfig,
            campaign.voicenote_path || null
        );
    }
}

module.exports = new ScheduleManager();
