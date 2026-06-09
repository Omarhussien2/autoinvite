const { processBatch } = require('./processBatch');
const WhatsAppProviders = require('./whatsapp');
const db = require('../database/pg-client');
const { WhatsAppSessionError } = require('./WhatsAppSessionError');
const { createLogger } = require('../utils/logger');
const log = createLogger('BackgroundQueue');

class BackgroundQueue {
    constructor() {
        this.jobs = new Map(); // tenantId -> job
    }

    async addJob(tenantId, campaignId, contacts, startRow, endRow, messages, hasTemplate, templatePath, canvasConfig, voicenotePath = null, runOptions = {}) {
        if (this.jobs.has(tenantId)) {
            throw new Error('A job is already running for this tenant.');
        }

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

        if (campaignId) {
            await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['running', campaignId]);
        }

        const provider = await WhatsAppProviders.getProviderForTenant(tenantId);

        processBatch(contacts, startRow, endRow, messages, campaignId, hasTemplate, (message, type) => {
            provider.emitToTenant(tenantId, 'log', { message, type });
        }, templatePath, canvasConfig, tenantId, voicenotePath, runOptions)
            .then(async (result) => {
                provider.setTenantState(tenantId, { status: 'READY' });

                provider.emitToTenant(tenantId, 'working_state', false);
                provider.emitToTenant(tenantId, 'log', { message: 'Batch processing finished.', type: 'DONE' });
                this.jobs.delete(tenantId);

                if (global.stopBatchRequested) {
                    delete global.stopBatchRequested[tenantId];
                }

                if (campaignId) {
                    const { successCount = 0, failCount = 0 } = result || {};
                    let finalStatus = 'completed';
                    if (failCount > successCount) {
                        finalStatus = 'partial_failure';
                    }

                    await db.query('UPDATE campaigns SET last_sent_row = $1, status = $2 WHERE id = $3', [endRow, finalStatus, campaignId]);

                    if (finalStatus === 'partial_failure') {
                        provider.emitToTenant(tenantId, 'log', {
                            message: `الحملة اكتملت مع أخطاء (${successCount} نجح، ${failCount} فشل)`,
                            type: 'WARN'
                        });
                    } else {
                        provider.emitToTenant(tenantId, 'log', {
                            message: 'تم إكمال الحملة بنجاح',
                            type: 'SUCCESS'
                        });
                    }
                }
            })
            .catch(async (error) => {
                const isSessionError = error instanceof WhatsAppSessionError;
                provider.setTenantState(tenantId, { status: isSessionError ? 'DISCONNECTED' : 'READY' });

                provider.emitToTenant(tenantId, 'working_state', false);
                log.error(`Job failed for tenant ${tenantId}:`, error);

                if (isSessionError) {
                    provider.emitToTenant(tenantId, 'session_lost', {
                        currentRow: error.currentRow,
                        message: 'انقطع اتصال واتساب. أعد الربط ثم أكمل من الصف المحفوظ.'
                    });
                    provider.emitToTenant(tenantId, 'log', {
                        message: `انقطع اتصال واتساب. تم إيقاف الحملة عند الصف ${error.currentRow || startRow}. أعد الربط ثم أكمل من الصف المحفوظ.`,
                        type: 'WARN'
                    });
                } else {
                    const bgErrMsg = error && error.message ? error.message : (error && error.text ? error.text : (typeof error === 'object' ? JSON.stringify(error) : String(error)));
                    provider.emitToTenant(tenantId, 'log', { message: `خطأ: ${bgErrMsg}`, type: 'ERROR' });
                }

                this.jobs.delete(tenantId);

                if (global.stopBatchRequested) {
                    delete global.stopBatchRequested[tenantId];
                }

                if (campaignId) {
                    if (isSessionError) {
                        await db.query(
                            'UPDATE campaigns SET status = $1, last_sent_row = COALESCE($2, last_sent_row) WHERE id = $3',
                            ['paused', error.currentRow, campaignId]
                        );
                    } else {
                        await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['error', campaignId]);
                    }
                }
            });

        return { success: true, message: 'Job started in background' };
    }

    async stopJob(tenantId) {
        if (this.jobs.has(tenantId)) {
            const job = this.jobs.get(tenantId);

            if (job && job.campaignId) {
                try {
                    await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['paused', job.campaignId]);
                } catch (err) {
                    log.error(`Failed to pause campaign ${job.campaignId}:`, err);
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
