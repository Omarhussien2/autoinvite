const { processBatch } = require('./processBatch');
const db = require('../database/pg-client');

class BackgroundQueue {
    constructor() {
        this.jobs = new Map(); // tenantId -> job
    }

    async addJob(tenantId, campaignId, contacts, startRow, endRow, messages, hasTemplate, templatePath, canvasConfig, voicenotePath = null) {
        if (this.jobs.has(tenantId)) {
            throw new Error('A job is already running for this tenant.');
        }

        // Reset any stale stop flag from a previous job
        if (global.stopBatchRequested) {
            global.stopBatchRequested[tenantId] = false;
        }

        const job = {
            tenantId,
            campaignId,
            status: 'running',
            startRow,
            endRow
        };

        this.jobs.set(tenantId, job);

        // Update campaign status to running
        if (campaignId) {
            await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['running', campaignId]);
        }

        // Process in background (do not await here)
        processBatch(contacts, startRow, endRow, messages, campaignId, hasTemplate, (message, type) => {
            const WhatsAppManager = require('./WhatsAppManager');
            WhatsAppManager.emitToTenant(tenantId, 'log', { message, type });
        }, templatePath, canvasConfig, tenantId, voicenotePath)
            .then(async (result) => {
                const WhatsAppManager = require('./WhatsAppManager');
                const state = WhatsAppManager.states.get(tenantId);
                if (state) state.status = 'READY';

                WhatsAppManager.emitToTenant(tenantId, 'working_state', false);
                WhatsAppManager.emitToTenant(tenantId, 'log', { message: 'Batch processing finished.', type: 'DONE' });
                this.jobs.delete(tenantId);

                // Clean up global stop flag after normal completion
                if (global.stopBatchRequested) {
                    delete global.stopBatchRequested[tenantId];
                }

                if (campaignId) {
                    // ── BUG-7: Detect partial failures ──
                    const { successCount = 0, failCount = 0 } = result || {};
                    let finalStatus = 'completed';
                    if (failCount > successCount) {
                        finalStatus = 'partial_failure';
                    }
                    await db.query('UPDATE campaigns SET last_sent_row = $1, status = $2 WHERE id = $3', [endRow, finalStatus, campaignId]);
                    if (finalStatus === 'partial_failure') {
                        WhatsAppManager.emitToTenant(tenantId, 'log', { message: `الحملة اكتملت مع أخطاء (${successCount} نجح، ${failCount} فشل)`, type: 'WARN' });
                    } else {
                        WhatsAppManager.emitToTenant(tenantId, 'log', { message: `تم إكمال الحملة بنجاح ✅`, type: 'SUCCESS' });
                    }
                }

            })
            .catch(async (error) => {
                const WhatsAppManager = require('./WhatsAppManager');
                const state = WhatsAppManager.states.get(tenantId);
                if (state) state.status = 'READY';

                WhatsAppManager.emitToTenant(tenantId, 'working_state', false);
                console.error(`[BackgroundQueue] Job failed for tenant ${tenantId}:`, error);
                const bgErrMsg = error && error.message ? error.message : (error && error.text ? error.text : (typeof error === 'object' ? JSON.stringify(error) : String(error)));
                WhatsAppManager.emitToTenant(tenantId, 'log', { message: `خطأ: ${bgErrMsg}`, type: 'ERROR' });
                this.jobs.delete(tenantId);

                // Clean up global stop flag after error
                if (global.stopBatchRequested) {
                    delete global.stopBatchRequested[tenantId];
                }

                if (campaignId) {
                    await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['error', campaignId]);
                }
            });

        return { success: true, message: 'Job started in background' };
    }

    async stopJob(tenantId) {
        if (this.jobs.has(tenantId)) {
            const job = this.jobs.get(tenantId);

            // Update campaign status to 'paused' BEFORE deleting from jobs map
            if (job && job.campaignId) {
                try {
                    await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['paused', job.campaignId]);
                } catch (err) {
                    console.error(`[BackgroundQueue] Failed to pause campaign ${job.campaignId}:`, err);
                }
            }

            if (!global.stopBatchRequested) global.stopBatchRequested = {};
            global.stopBatchRequested[tenantId] = true;
            this.jobs.delete(tenantId);
            return true;
        }
        return false;
    }
}

module.exports = new BackgroundQueue();
