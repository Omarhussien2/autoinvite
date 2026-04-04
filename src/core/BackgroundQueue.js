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
            .then(async () => {
                const WhatsAppManager = require('./WhatsAppManager');
                const state = WhatsAppManager.states.get(tenantId);
                if (state) state.status = 'READY';

                WhatsAppManager.emitToTenant(tenantId, 'working_state', false);
                WhatsAppManager.emitToTenant(tenantId, 'log', { message: 'Batch processing finished.', type: 'DONE' });
                this.jobs.delete(tenantId);

                if (campaignId) {
                    await db.query('UPDATE campaigns SET last_sent_row = $1, status = $2 WHERE id = $3', [endRow, 'completed', campaignId]);
                    WhatsAppManager.emitToTenant(tenantId, 'log', { message: `تم إكمال الحملة بنجاح ✅`, type: 'SUCCESS' });
                }

            })
            .catch(async (error) => {
                const WhatsAppManager = require('./WhatsAppManager');
                const state = WhatsAppManager.states.get(tenantId);
                if (state) state.status = 'READY';

                WhatsAppManager.emitToTenant(tenantId, 'working_state', false);
                WhatsAppManager.emitToTenant(tenantId, 'log', { msg: `Error: ${error.message}`, type: 'ERROR' });
                this.jobs.delete(tenantId);

                if (campaignId) {
                    await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['error', campaignId]);
                }
            });

        return { success: true, message: 'Job started in background' };
    }

    stopJob(tenantId) {
        if (this.jobs.has(tenantId)) {
            if (!global.stopBatchRequested) global.stopBatchRequested = {};
            global.stopBatchRequested[tenantId] = true;
            this.jobs.delete(tenantId);
            return true;
        }
        return false;
    }
}

module.exports = new BackgroundQueue();
