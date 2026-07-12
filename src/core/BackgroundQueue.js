const { processBatch } = require('./processBatch');
const WhatsAppProviders = require('./whatsapp');
const db = require('../database/pg-client');
const { WhatsAppSessionError } = require('./WhatsAppSessionError');
const { createLogger } = require('../utils/logger');
const { normalizePhone } = require('../utils/dataProcessor');
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

        try {
            if (campaignId) {
                await this._prepareRecipients(tenantId, campaignId, contacts);
                await db.query(
                    'UPDATE campaigns SET status = $1 WHERE id = $2 AND tenant_id = $3',
                    ['running', campaignId, tenantId]
                );
            }
        } catch (error) {
            this.jobs.delete(tenantId);
            throw error;
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
                    const {
                        successCount = 0,
                        failCount = 0,
                        stoppedReason = null,
                        lastRow = endRow,
                    } = result || {};
                    const isSmartBatch = !!(runOptions && runOptions.batchId);
                    const recipientState = await this._recipientState(tenantId, campaignId, startRow, endRow);
                    const finalLastRow = recipientState.available ? recipientState.lastRow : (lastRow || endRow);
                    let finalStatus = 'completed';
                    let pausedReason = null;

                    if (stoppedReason) {
                        finalStatus = 'paused';
                        pausedReason = stoppedReason;
                    } else if (recipientState.available && recipientState.needsReview > 0) {
                        finalStatus = 'paused';
                        pausedReason = 'needs_review';
                    } else if (recipientState.available && (recipientState.pending > 0 || recipientState.sending > 0)) {
                        finalStatus = 'paused';
                        pausedReason = 'recipients_remaining';
                    } else if (recipientState.available ? recipientState.failed > 0 : failCount > successCount) {
                        finalStatus = 'partial_failure';
                    }

                    if (isSmartBatch) {
                        await db.query(
                            `UPDATE campaign_batches
                             SET status = $1,
                                 sent_count = $2,
                                 failed_count = $3,
                                 last_sent_row = $4,
                                 schedule_job_id = NULL,
                                 schedule_last_error = $5,
                                 schedule_last_attempt_at = NOW()
                             WHERE id = $6 AND tenant_id = $7`,
                            [
                                stoppedReason ? 'paused' : 'completed',
                                successCount,
                                failCount,
                                finalLastRow,
                                pausedReason,
                                runOptions.batchId,
                                tenantId,
                            ]
                        );

                        if (!stoppedReason) {
                            const batchStateRes = await db.query(
                                `SELECT
                                     COUNT(*) FILTER (WHERE status IN ('scheduled', 'running'))::int AS pending_count,
                                     COUNT(*) FILTER (WHERE status = 'paused')::int AS paused_count,
                                     COALESCE(SUM(sent_count), 0)::int AS total_sent,
                                     COALESCE(SUM(failed_count), 0)::int AS total_failed
                                 FROM campaign_batches
                                 WHERE campaign_id = $1 AND tenant_id = $2`,
                                [campaignId, tenantId]
                            );
                            const batchState = batchStateRes.rows[0] || {};
                            const pendingCount = parseInt(batchState.pending_count || 0, 10) || 0;
                            const pausedCount = parseInt(batchState.paused_count || 0, 10) || 0;
                            const totalSent = parseInt(batchState.total_sent || successCount, 10) || 0;
                            const totalFailed = parseInt(batchState.total_failed || failCount, 10) || 0;

                            if (pausedCount > 0) {
                                finalStatus = 'paused';
                                pausedReason = 'smart_batch_paused';
                            } else if (pendingCount > 0) {
                                finalStatus = 'scheduled';
                                pausedReason = null;
                            } else if (totalFailed > totalSent) {
                                finalStatus = 'partial_failure';
                                pausedReason = null;
                            } else {
                                finalStatus = 'completed';
                                pausedReason = null;
                            }
                        }
                    }

                    await db.query(
                        'UPDATE campaigns SET last_sent_row = $1, status = $2, paused_reason = $3 WHERE id = $4 AND tenant_id = $5',
                        [finalLastRow, finalStatus, pausedReason, campaignId, tenantId]
                    );

                    if (finalStatus === 'paused') {
                        const reasonText = pausedReason === 'daily_limit_reached'
                            ? `تم الوصول للحد اليومي. توقفت الحملة مؤقتا عند الصف ${finalLastRow} ويمكن استكمالها في نافذة الإرسال التالية.`
                            : `تم إيقاف الحملة مؤقتا عند الصف ${finalLastRow}.`;
                        provider.emitToTenant(tenantId, 'log', {
                            message: reasonText,
                            type: 'WARN'
                        });
                    } else if (isSmartBatch && finalStatus === 'scheduled') {
                        provider.emitToTenant(tenantId, 'log', {
                            message: `اكتملت الدفعة الحالية (${successCount} نجح، ${failCount} فشل). الدفعات القادمة ما زالت مجدولة.`,
                            type: 'SUCCESS'
                        });
                    } else if (finalStatus === 'partial_failure') {
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
                            'UPDATE campaigns SET status = $1, paused_reason = $2 WHERE id = $3 AND tenant_id = $4',
                            ['paused', 'whatsapp_session_lost', campaignId, tenantId]
                        );
                        if (runOptions && runOptions.batchId) {
                            await db.query(`
                                UPDATE campaign_batches
                                SET status = 'paused', schedule_job_id = NULL,
                                    schedule_last_error = 'whatsapp_session_lost', schedule_last_attempt_at = NOW()
                                WHERE id = $1 AND tenant_id = $2
                            `, [runOptions.batchId, tenantId]);
                        }
                        const ScheduleManager = require('./ScheduleManager');
                        await ScheduleManager.pauseCampaignBatches(
                            campaignId,
                            tenantId,
                            'whatsapp_session_lost'
                        );
                    } else {
                        await db.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['error', campaignId]);
                    }
                }
            });

        return { success: true, message: 'Job started in background' };
    }

    async _prepareRecipients(tenantId, campaignId, contacts) {
        const recipients = contacts.map((contact, index) => ({
            phone: normalizePhone(contact.Phone || contact.phone || contact['رقم الجوال']),
            name: contact.Name || contact.name || contact['الاسم'] || contact['الإسم'] || 'ضيف',
            source_row: index + 1,
        })).filter(recipient => recipient.phone);
        await db.query(`
            INSERT INTO campaign_recipients (tenant_id, campaign_id, phone, name, source_row)
            SELECT $1, $2, recipient.phone, recipient.name, recipient.source_row
            FROM jsonb_to_recordset($3::jsonb) AS recipient(phone TEXT, name TEXT, source_row INTEGER)
            ON CONFLICT (tenant_id, campaign_id, phone) DO NOTHING
        `, [tenantId, campaignId, JSON.stringify(recipients)]);
        const recipientPhones = recipients.map(recipient => recipient.phone);
        await db.query(`
            UPDATE campaign_recipients
            SET status = 'skipped', last_error = 'removed_from_contacts', updated_at = NOW()
            WHERE tenant_id = $1 AND campaign_id = $2
              AND status IN ('pending', 'failed')
              AND NOT (phone = ANY($3::TEXT[]))
        `, [tenantId, campaignId, recipientPhones]);
        await db.query(`
            UPDATE campaign_recipients recipient
            SET status = 'sent', sent_at = COALESCE(recipient.sent_at, sent.sent_at), updated_at = NOW()
            FROM sent_logs sent
            WHERE recipient.tenant_id = $1 AND recipient.campaign_id = $2
              AND sent.tenant_id = recipient.tenant_id AND sent.campaign_id = recipient.campaign_id
              AND sent.phone = recipient.phone AND (sent.status IS NULL OR sent.status = 'success')
        `, [tenantId, campaignId]);
        await db.query(`
            UPDATE campaign_recipients SET status = 'needs_review', updated_at = NOW()
            WHERE tenant_id = $1 AND campaign_id = $2 AND status = 'sending'
              AND claimed_at < NOW() - INTERVAL '15 minutes'
        `, [tenantId, campaignId]);
    }

    async _recipientState(tenantId, campaignId, startRow, endRow) {
        const stateQuery = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE status = 'sending')::int AS sending,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                COUNT(*) FILTER (WHERE status = 'needs_review')::int AS needs_review,
                COALESCE(
                    MIN(source_row) FILTER (WHERE status IN ('pending', 'sending', 'needs_review')) - 1,
                    MAX(source_row),
                    $3
                )::int AS last_row
            FROM campaign_recipients
            WHERE tenant_id = $1 AND campaign_id = $2 AND source_row BETWEEN $3 AND $4
        `, [tenantId, campaignId, startRow, endRow]);
        const state = stateQuery.rows[0];
        if (!state) return { available: false };
        return {
            available: true,
            pending: parseInt(state.pending || 0, 10),
            sending: parseInt(state.sending || 0, 10),
            failed: parseInt(state.failed || 0, 10),
            needsReview: parseInt(state.needs_review || 0, 10),
            lastRow: parseInt(state.last_row || startRow, 10),
        };
    }

    async stopJob(tenantId) {
        if (this.jobs.has(tenantId)) {
            const job = this.jobs.get(tenantId);

            if (job && job.campaignId) {
                try {
                    await db.query(`
                        UPDATE campaigns
                        SET status = 'paused', paused_reason = 'stop_requested', stop_requested_at = NOW()
                        WHERE id = $1 AND tenant_id = $2
                    `, [job.campaignId, tenantId]);
                } catch (err) {
                    log.error(`Failed to pause campaign ${job.campaignId}:`, err);
                }
            }

            if (!global.stopBatchRequested) global.stopBatchRequested = {};
            global.stopBatchRequested[tenantId] = true;
            return true;
        }
        return false;
    }
}

module.exports = new BackgroundQueue();
