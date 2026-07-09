const fs = require('fs-extra');
const path = require('path');
const { normalizePhone, processName } = require('../utils/dataProcessor');
const config = require('../config/settings');
const { generateImage } = require('../utils/generator');
const { logResult, createLogger } = require('../utils/logger');
const log = createLogger('processBatch');
const db = require('../database/pg-client');
const WhatsAppProviders = require('./whatsapp');
const AntiBanEngine = require('./AntiBanEngine');
const { convertToOggOpus } = require('../utils/audioConverter');
const { normalizeMessageTemplates, pickWeightedMessage } = require('../utils/messageTemplates');
const {
    WhatsAppSessionError,
    isWhatsAppSessionError,
    stringifyError,
    safeStringify,
} = require('./WhatsAppSessionError');

function getSaudiErrorMessage(name, error) {
    const msg = (error || '').toLowerCase();

    if (msg.includes('not registered') || msg.includes('not on whatsapp') || msg.includes('not a valid whatsapp number') || msg.includes('no whatsapp')) {
        return `الرقم مو مسجل في الواتساب`;
    }
    if (msg.includes('disconnected') || msg.includes('session closed') || msg.includes('page crashed') || msg.includes('lost connection')) {
        return `انقطع الاتصال، جرّب تعيد الربط`;
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('stuck')) {
        return `ما وصلت الرسالة لـ ${name}`;
    }
    return `صارت مشكلة غير متوقعة`;
}

async function sendTextSafely(client, chatId, message) {
    if (!message) return;
    await client.sendText(chatId, message).catch(e => {
        if (!safeStringify(e).includes('msgChunks')) throw e;
    });
}

async function sendPersonalizedImageOrText({
    client,
    chatId,
    name,
    normalizedPhone,
    templatePath,
    canvasConfig,
    message,
    onLog,
    WhatsAppProvider,
    tenantId,
}) {
    let imageSent = false;
    let imagePath = null;

    try {
        onLog(`[InviteImage] جاري تجهيز صورة الدعوة المخصصة لـ ${name}...`, 'INFO');
        imagePath = await generateImage(name, normalizedPhone, templatePath, canvasConfig);
        const imgBase64 = `data:image/png;base64,${fs.readFileSync(imagePath).toString('base64')}`;
        let mediaRetries = 3;

        while (!imageSent) {
            try {
                await client.sendImageFromBase64(chatId, imgBase64, 'invitation.png', message);
                imageSent = true;
            } catch (mediaErr) {
                const errStr = safeStringify(mediaErr);
                if (errStr.includes('msgChunks')) {
                    imageSent = true;
                } else if (mediaRetries > 0 && (errStr.includes('InvalidMedia') || errStr.includes('RepairFailed') || errStr.includes('FailedType'))) {
                    mediaRetries--;
                    onLog(`[Retry] خطأ مؤقت في الوسائط (${3 - mediaRetries}/3)، إعادة المحاولة بعد 3 ثوان...`, 'WARN');
                    await AntiBanEngine.sleep(3000);
                } else {
                    throw mediaErr;
                }
            }
        }

        onLog(`[InviteImage] تم إرسال صورة الدعوة المخصصة لـ ${name}`, 'SUCCESS');
        return true;
    } catch (imgErr) {
        const errStr = safeStringify(imgErr);
        if (errStr.includes('msgChunks')) {
            return true;
        }

        if (!message) {
            onLog(`[Fallback] فشل إرسال صورة الدعوة المخصصة لـ ${name} ولا يوجد نص بديل`, 'ERROR');
            throw imgErr;
        }

        onLog(`[Fallback] فشل إرسال صورة الدعوة المخصصة لـ ${name}: سيتم إرسال النص فقط`, 'WARN');
        WhatsAppProvider.emitToTenant(tenantId, 'log', {
            message: `فشل إرسال الصورة المخصصة لـ ${name}. تم إرسال النص فقط. التفاصيل: ${errStr}`,
            type: 'WARN'
        });
        await sendTextSafely(client, chatId, message);
        return false;
    } finally {
        if (imagePath) {
            await fs.remove(imagePath).catch(err => log.error('Failed to cleanup temp image:', err.message));
        }
    }
}

const { HARD_DAILY_LIMIT } = require('../utils/smartScheduler');

async function processBatch(contacts, startRow, endRow, messages, campaignId = null, hasTemplate = false, onLog = console.log, templatePath = null, canvasConfig = null, tenantId, voicenotePath = null, runOptions = {}) {
    const subset = contacts.slice(startRow - 1, endRow);
    const normalizedMessages = normalizeMessageTemplates(messages);

    const dailyLimit = Math.max(1, Math.min(HARD_DAILY_LIMIT, parseInt(runOptions.dailyLimit || runOptions.daily_limit || HARD_DAILY_LIMIT, 10) || HARD_DAILY_LIMIT));
    const timezone = runOptions.timezone || 'Asia/Riyadh';
    const breakAfterMessages = Math.max(0, parseInt(runOptions.breakAfterMessages || runOptions.break_after_messages || 0, 10) || 0);
    const breakMinMinutes = Math.max(0, parseInt(runOptions.breakMinMinutes || runOptions.break_min_minutes || 0, 10) || 0);
    const breakMaxMinutes = Math.max(breakMinMinutes, parseInt(runOptions.breakMaxMinutes || runOptions.break_max_minutes || breakMinMinutes, 10) || breakMinMinutes);

    onLog(`\nProcessing ${subset.length} contacts (Rows ${startRow} to ${endRow})...\n`, 'INFO');

    const WhatsAppProvider = await WhatsAppProviders.getProviderForTenant(tenantId);
    WhatsAppProvider.updateActivity(tenantId);
    const client = await WhatsAppProvider.getClient(tenantId);
    if (!client) {
        onLog('خطأ: الواتساب غير متصل. أعد الربط أولاً.', 'ERROR');
        throw new Error('WhatsApp client not connected');
    }

    // ── Read tenant-specific settings from DB (overrides hardcoded config) ──
    let tenantMinDelay = config.whatsapp.minDelay;
    let tenantMaxDelay = config.whatsapp.maxDelay;
    let tenantSafeMode = true;
    try {
        const settingsRes = await db.query('SELECT settings FROM tenants WHERE id = $1', [tenantId]);
        const settings = settingsRes.rows[0]?.settings;
        if (settings) {
            if (settings.min_delay != null) tenantMinDelay = settings.min_delay * 1000;
            if (settings.max_delay != null) tenantMaxDelay = settings.max_delay * 1000;
            if (settings.safe_mode != null) tenantSafeMode = settings.safe_mode;
        }
    } catch (err) {
        log.warn('Could not load tenant settings, using defaults:', err.message);
    }

    if (runOptions.minDelaySeconds || runOptions.min_delay_seconds) {
        tenantMinDelay = (parseInt(runOptions.minDelaySeconds || runOptions.min_delay_seconds, 10) || (tenantMinDelay / 1000)) * 1000;
    }
    if (runOptions.maxDelaySeconds || runOptions.max_delay_seconds) {
        tenantMaxDelay = Math.max(
            tenantMinDelay,
            (parseInt(runOptions.maxDelaySeconds || runOptions.max_delay_seconds, 10) || (tenantMaxDelay / 1000)) * 1000
        );
    }

    // Pre-convert voice note to OGG/Opus once (not per-contact)
    let pttBase64 = null;
    let pttOggPath = null;
    if (voicenotePath) {
        const absVoicePath = path.resolve(voicenotePath);
        onLog('[VoiceNote] جاري تحويل الملف الصوتي لصيغة WhatsApp...', 'INFO');
        pttOggPath = await convertToOggOpus(absVoicePath);
        pttBase64 = `data:audio/ogg;codecs=opus;base64,${fs.readFileSync(pttOggPath).toString('base64')}`;
        onLog('[VoiceNote] تم التحويل بنجاح', 'INFO');
    }

    // ── BUG-7: Track success/fail counts for partial failure detection ──
    let successCount = 0;
    let failCount = 0;
    let stoppedReason = null;
    let stoppedRow = null;

    for (const [index, contact] of subset.entries()) {
        WhatsAppProvider.updateActivity(tenantId);

        if (global.stopBatchRequested && global.stopBatchRequested[tenantId]) {
            onLog('تم إيقاف الإرسال بنجاح.', 'WARN');
            stoppedReason = 'stop_requested';
            stoppedRow = startRow + index;
            break;
        }

        try {
            const dailyRes = await db.query(
                `SELECT COUNT(*) FROM sent_logs 
                 WHERE tenant_id = $1 
                   AND (status IS NULL OR status = 'success')
                   AND sent_at >= (date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2)
                   AND sent_at < ((date_trunc('day', NOW() AT TIME ZONE $2) + interval '1 day') AT TIME ZONE $2)`,
                [tenantId, timezone]
            );
            const sentToday = parseInt(dailyRes.rows[0].count, 10) || 0;
            if (sentToday >= dailyLimit) {
                onLog(`Daily send limit reached (${sentToday}/${dailyLimit}). Batch paused until next window.`, 'WARN');
                stoppedReason = 'daily_limit_reached';
                const currentRow = startRow + index;
                stoppedRow = currentRow;
                if (campaignId) {
                    await db.query(
                        'UPDATE campaigns SET status = $1, last_sent_row = $2, paused_reason = $3 WHERE id = $4 AND tenant_id = $5',
                        ['paused', currentRow, 'daily_limit_reached', campaignId, tenantId]
                    ).catch(err => log.error('Failed to pause campaign after daily limit:', err.message));
                }
                break;
            }
        } catch (dailyErr) {
            log.warn('Daily limit check failed, continuing:', dailyErr.message);
        }

        // ── BUG-9: Quota check before each send ──
        try {
            const quotaRes = await db.query('SELECT messages_used, message_quota FROM tenants WHERE id = $1', [tenantId]);
            const quotaRow = quotaRes.rows[0];
            if (quotaRow && quotaRow.messages_used >= quotaRow.message_quota) {
                onLog(`تم استنفاد الحصة (${quotaRow.messages_used}/${quotaRow.message_quota}). أوقف الإرسال.`, 'ERROR');
                WhatsAppProvider.emitToTenant(tenantId, 'log', { message: `تم استنفاد الحصة — توقف الإرسال. تواصل مع الإدارة لزيادة الحصة.`, type: 'ERROR' });
                break;
            }
        } catch (quotaErr) {
            log.warn('Quota check failed, continuing:', quotaErr.message);
        }

        const rawName = contact.Name || contact['الإسم'] || contact['name'] || 'ضيف';
        const name = await processName(rawName);
        const rawPhone = contact.Phone || contact['رقم الجوال'] || contact['phone'];
        const currentRow = startRow + index;

        const normalizedPhone = normalizePhone(rawPhone);

        if (!normalizedPhone) {
            await logResult(rawPhone, name, 'SKIP', 'Invalid Phone Format');
            onLog(`Skipping ${name}: Invalid Phone Format (${rawPhone})`, 'WARN');
            continue;
        }

        if (campaignId) {
            const alreadySentRes = await db.query(
                "SELECT id FROM sent_logs WHERE campaign_id = $1 AND phone = $2 AND (status IS NULL OR status = 'success')",
                [campaignId, normalizedPhone]
            );
            if (alreadySentRes.rows[0]) {
                onLog(`Skipping ${name}: Already sent in this campaign (Deduplicated)`, 'WARN');
                continue;
            }
        }

        try {
            const message = pickWeightedMessage(normalizedMessages, name, currentRow - 1);
            onLog(`[${index + 1}/${subset.length}] Processing: ${name} (${normalizedPhone})`, 'INFO');

            const chatId = `${normalizedPhone}@c.us`;

            // ── Step 1: Validate number is on WhatsApp ──────────────────────
            try {
                const numberStatus = await client.checkNumberStatus(chatId);
                if (!numberStatus || numberStatus.status !== 200 || !numberStatus.numberExists) {
                    await logResult(normalizedPhone, name, 'SKIP', 'Failed - No WhatsApp');
                    const saudiMsg = `الرقم مو مسجل في الواتساب`;
                    onLog(`Skipping ${name}: ${saudiMsg}`, 'WARN');
                    WhatsAppProvider.emitToTenant(tenantId, 'log', { message: saudiMsg, type: 'WARN' });
                    if (campaignId) {
                        await db.query('UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1', [campaignId]).catch(err => log.error('Failed to update failed_count (skip):', err.message));
                        await db.query(
                            'INSERT INTO sent_logs (campaign_id, tenant_id, phone, name, status, failed_at) VALUES ($1, $2, $3, $4, $5, NOW())',
                            [campaignId, tenantId, normalizedPhone, name, 'failed']
                        ).catch(err => log.error('Failed to log skipped contact:', err.message));
                    }
                    continue;
                }
            } catch (regErr) {
                onLog(`تعذر التحقق من الرقم ${normalizedPhone}, سنحاول الإرسال مباشرة...`, 'WARN');
            }

            // ── Step 2: Typing simulation ───────────────────────────────────
            // Use AntiBanEngine's human-like typing duration calculation
            // (WPM-based with ±20% variance, clamped 1.5s-12s)
            try {
                await client.startTyping(chatId);
                const typingDelay = AntiBanEngine.typingDuration(message);
                onLog(`[HumanBehavior] Typing for ${(typingDelay / 1000).toFixed(1)}s (${message.length} chars)...`, 'INFO');
                await AntiBanEngine.sleep(typingDelay);
                await client.stopTyping(chatId);
            } catch (_) {}

            // ── Step 3: Send the message ────────────────────────────────────
            if (voicenotePath && pttBase64) {
                // Send pre-converted OGG/Opus as base64 PTT
                await client.sendPttFromBase64(chatId, pttBase64, 'voice.ogg');
                if (hasTemplate && templatePath) {
                    await sendPersonalizedImageOrText({
                        client,
                        chatId,
                        name,
                        normalizedPhone,
                        templatePath,
                        canvasConfig,
                        message,
                        onLog,
                        WhatsAppProvider,
                        tenantId,
                    });
                } else {
                    await sendTextSafely(client, chatId, message);
                }
            } else if (hasTemplate && templatePath) {
                await sendPersonalizedImageOrText({
                    client,
                    chatId,
                    name,
                    normalizedPhone,
                    templatePath,
                    canvasConfig,
                    message,
                    onLog,
                    WhatsAppProvider,
                    tenantId,
                });
            } else {
                await sendTextSafely(client, chatId, message);
            }

            // ── Step 6: Record sent & apply inter-message anti-ban delay ───
            AntiBanEngine.recordSent(tenantId);

            if (campaignId) {
                // ── BUG-11: Transactional sent_logs + campaign update ──
                const txClient = await db.pool.connect();
                try {
                    await txClient.query('BEGIN');
                    await txClient.query(
                        'INSERT INTO sent_logs (campaign_id, tenant_id, phone, name, status) VALUES ($1, $2, $3, $4, $5)',
                        [campaignId, tenantId, normalizedPhone, name, 'success']
                    );
                    await txClient.query('UPDATE campaigns SET last_sent_row = $1 WHERE id = $2', [currentRow, campaignId]);
                    await txClient.query('COMMIT');
                } catch (txErr) {
                    await txClient.query('ROLLBACK').catch(err => log.error('Rollback failed:', err.message));
                    log.error('Transaction failed, rolling back:', txErr.message);
                    throw txErr; // Re-throw so the outer catch handles it as a failure
                } finally {
                    txClient.release();
                }
            }

            if (tenantId) {
                await db.query('UPDATE tenants SET messages_used = messages_used + 1 WHERE id = $1', [tenantId]);
            }

            await logResult(normalizedPhone, name, 'SUCCESS', 'Invitation Sent');
            onLog(`Success: Invitation sent to ${name}`, 'SUCCESS');
            successCount++;

            // Apply inter-message delay using tenant-specific settings (skip after the very last message)
            if (breakAfterMessages && successCount > 0 && successCount % breakAfterMessages === 0 && index < subset.length - 1) {
                const breakMs = (breakMinMinutes + Math.random() * Math.max(0, breakMaxMinutes - breakMinMinutes)) * 60000;
                if (breakMs > 0) {
                    onLog(`[SafetyBreak] Resting for ${(breakMs / 60000).toFixed(1)} minute(s) after ${successCount} messages.`, 'WARN');
                    await AntiBanEngine.sleep(breakMs);
                }
            } else if (index < subset.length - 1) {
                await AntiBanEngine.applyDelay(
                    tenantMinDelay,
                    tenantMaxDelay,
                    onLog,
                    tenantId,
                    tenantSafeMode
                );
            }

        } catch (error) {
            try { await client.stopTyping(`${normalizedPhone}@c.us`); } catch (_) {}

            // WPPConnect throws plain objects like { erro: true, text: '...' }
            const errMsg = stringifyError(error);

            if (isWhatsAppSessionError(error)) {
                onLog(`WhatsApp session lost while processing row ${currentRow}. Campaign paused so remaining contacts are not marked failed.`, 'SESSION_ERROR');
                WhatsAppProvider.emitToTenant(tenantId, 'log', {
                    message: 'انقطع اتصال واتساب أثناء الإرسال. تم إيقاف الحملة مؤقتا حتى لا يتم احتساب باقي الأرقام كفشل.',
                    type: 'SESSION_ERROR'
                });

                if (campaignId) {
                    await db.query(
                        'UPDATE campaigns SET last_sent_row = $1, status = $2 WHERE id = $3',
                        [currentRow, 'paused', campaignId]
                    ).catch(err => log.error('Failed to pause campaign after session error:', err.message));
                }

                try {
                    await WhatsAppProvider.stopClient(tenantId);
                } catch (stopErr) {
                    log.error('Failed to stop stale WhatsApp client:', stopErr.message);
                }

                throw new WhatsAppSessionError(errMsg, { currentRow, originalError: error });
            }

            await logResult(normalizedPhone, name, 'FAIL', errMsg);
            const saudiMsg = getSaudiErrorMessage(name, errMsg);
            onLog(`Failed: ${name} - ${saudiMsg}`, 'ERROR');
            log.error(`Error for ${name} (${normalizedPhone}):`, error);
            WhatsAppProvider.emitToTenant(tenantId, 'log', { message: saudiMsg, type: 'ERROR' });
            WhatsAppProvider.emitToTenant(tenantId, 'log', { message: `[تفاصيل] ${errMsg}`, type: 'WARN' });
            failCount++;

            if (campaignId) {
                await db.query('UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1', [campaignId]).catch(err => log.error('Failed to update failed_count (error):', err.message));
                await db.query(
                    'INSERT INTO sent_logs (campaign_id, tenant_id, phone, name, status, failed_at) VALUES ($1, $2, $3, $4, $5, NOW())',
                    [campaignId, tenantId, normalizedPhone, name, 'failed']
                ).catch(err => log.error('Failed to log failed contact:', err.message));
            }
        }
    }

    // Cleanup converted PTT file
    if (pttOggPath) await fs.remove(pttOggPath).catch(err => log.error('Failed to cleanup PTT file:', err.message));

    onLog(`\nBatch processing complete. Success: ${successCount}, Failed: ${failCount}`, 'DONE');
    return { successCount, failCount, stoppedReason, lastRow: stoppedRow || endRow };
}

module.exports = { processBatch };
