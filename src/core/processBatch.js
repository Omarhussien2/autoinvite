const fs = require('fs-extra');
const path = require('path');
const { normalizePhone, processName } = require('../utils/dataProcessor');
const config = require('../config/settings');
const { generateImage } = require('../utils/generator');
const { logResult } = require('../utils/logger');
const db = require('../database/pg-client');
const WhatsAppManager = require('./WhatsAppManager');
const AntiBanEngine = require('./AntiBanEngine');
const { convertToOggOpus } = require('../utils/audioConverter');

function pickWeightedMessage(messages, name) {
    const totalWeight = messages.reduce((sum, m) => sum + (m.weight || 1), 0);
    let random = Math.random() * totalWeight;
    for (const msg of messages) {
        random -= (msg.weight || 1);
        if (random <= 0) {
            return msg.text.replace('[الاسم]', name);
        }
    }
    return messages[0].text.replace('[الاسم]', name);
}

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

async function processBatch(contacts, startRow, endRow, messages, campaignId = null, hasTemplate = false, onLog = console.log, templatePath = null, canvasConfig = null, tenantId, voicenotePath = null) {
    const subset = contacts.slice(startRow - 1, endRow);
    onLog(`\nProcessing ${subset.length} contacts (Rows ${startRow} to ${endRow})...\n`, 'INFO');

    WhatsAppManager.updateActivity(tenantId);
    const client = await WhatsAppManager.getClient(tenantId);
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
        console.warn('[processBatch] Could not load tenant settings, using defaults:', err.message);
    }

    // Pre-convert voice note to OGG/Opus once (not per-contact)
    let pttBase64 = null;
    let pttOggPath = null;
    if (voicenotePath) {
        const absVoicePath = path.resolve(voicenotePath);
        onLog('[VoiceNote] جاري تحويل الملف الصوتي لصيغة WhatsApp...', 'INFO');
        pttOggPath = await convertToOggOpus(absVoicePath);
        pttBase64 = `data:audio/ogg;codecs=opus;base64,${fs.readFileSync(pttOggPath).toString('base64')}`;
        onLog('[VoiceNote] تم التحويل بنجاح ✓', 'INFO');
    }

    // ── BUG-7: Track success/fail counts for partial failure detection ──
    let successCount = 0;
    let failCount = 0;

    for (const [index, contact] of subset.entries()) {
        WhatsAppManager.updateActivity(tenantId);

        if (global.stopBatchRequested && global.stopBatchRequested[tenantId]) {
            onLog('تم إيقاف الإرسال بنجاح.', 'WARN');
            break;
        }

        // ── BUG-9: Quota check before each send ──
        try {
            const quotaRes = await db.query('SELECT messages_used, message_quota FROM tenants WHERE id = $1', [tenantId]);
            const quotaRow = quotaRes.rows[0];
            if (quotaRow && quotaRow.messages_used >= quotaRow.message_quota) {
                onLog(`تم استنفاد الحصة (${quotaRow.messages_used}/${quotaRow.message_quota}). أوقف الإرسال.`, 'ERROR');
                WhatsAppManager.emitToTenant(tenantId, 'log', { message: `تم استنفاد الحصة — توقف الإرسال. تواصل مع الإدارة لزيادة الحصة.`, type: 'ERROR' });
                break;
            }
        } catch (quotaErr) {
            console.warn('[processBatch] Quota check failed, continuing:', quotaErr.message);
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
            const message = pickWeightedMessage(messages, name);
            onLog(`[${index + 1}/${subset.length}] Processing: ${name} (${normalizedPhone})`, 'INFO');

            const chatId = `${normalizedPhone}@c.us`;

            // ── Step 1: Validate number is on WhatsApp ──────────────────────
            try {
                const numberStatus = await client.checkNumberStatus(chatId);
                if (!numberStatus || numberStatus.status !== 200 || !numberStatus.numberExists) {
                    await logResult(normalizedPhone, name, 'SKIP', 'Failed - No WhatsApp');
                    const saudiMsg = `الرقم مو مسجل في الواتساب`;
                    onLog(`Skipping ${name}: ${saudiMsg}`, 'WARN');
                    WhatsAppManager.emitToTenant(tenantId, 'log', { message: saudiMsg, type: 'WARN' });
                    if (campaignId) {
                        await db.query('UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1', [campaignId]).catch(() => {});
                        await db.query(
                            'INSERT INTO sent_logs (campaign_id, tenant_id, phone, name, status, failed_at) VALUES ($1, $2, $3, $4, $5, NOW())',
                            [campaignId, tenantId, normalizedPhone, name, 'failed']
                        ).catch(() => {});
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
                // Send text caption separately if present
                if (message) await client.sendText(chatId, message);
            } else if (hasTemplate && templatePath) {
                const imagePath = await generateImage(name, normalizedPhone, templatePath, canvasConfig);
                const imgBase64 = `data:image/png;base64,${fs.readFileSync(imagePath).toString('base64')}`;
                // Retry up to 2 times for transient WhatsApp media errors
                let mediaRetries = 2;
                while (true) {
                    try {
                        await client.sendImage(chatId, imgBase64, 'invitation.png', message);
                        break;
                    } catch (mediaErr) {
                        const errStr = String(mediaErr && mediaErr.message ? mediaErr.message : mediaErr);
                        if (mediaRetries > 0 && (errStr.includes('InvalidMedia') || errStr.includes('RepairFailed') || errStr.includes('FailedType'))) {
                            mediaRetries--;
                            onLog(`[Retry] خطأ مؤقت في الوسائط، إعادة المحاولة بعد 3 ثوانٍ...`, 'WARN');
                            await AntiBanEngine.sleep(3000);
                        } else {
                            throw mediaErr;
                        }
                    }
                }
                await fs.remove(imagePath);
            } else {
                await client.sendText(chatId, message);
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
                    await txClient.query('ROLLBACK').catch(() => {});
                    console.error('[processBatch] Transaction failed, rolling back:', txErr.message);
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
            if (index < subset.length - 1) {
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
            let errMsg;
            if (error && error.message) {
                errMsg = error.message;
            } else if (error && error.text) {
                errMsg = error.text;
            } else if (typeof error === 'object') {
                errMsg = JSON.stringify(error);
            } else {
                errMsg = String(error);
            }
            await logResult(normalizedPhone, name, 'FAIL', errMsg);
            const saudiMsg = getSaudiErrorMessage(name, errMsg);
            onLog(`Failed: ${name} - ${saudiMsg}`, 'ERROR');
            console.error(`[processBatch] Error for ${name} (${normalizedPhone}):`, error);
            WhatsAppManager.emitToTenant(tenantId, 'log', { message: saudiMsg, type: 'ERROR' });
            WhatsAppManager.emitToTenant(tenantId, 'log', { message: `[تفاصيل] ${errMsg}`, type: 'WARN' });
            failCount++;

            if (campaignId) {
                await db.query('UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1', [campaignId]).catch(() => {});
                await db.query(
                    'INSERT INTO sent_logs (campaign_id, tenant_id, phone, name, status, failed_at) VALUES ($1, $2, $3, $4, $5, NOW())',
                    [campaignId, tenantId, normalizedPhone, name, 'failed']
                ).catch(() => {});
            }
        }
    }

    // Cleanup converted PTT file
    if (pttOggPath) await fs.remove(pttOggPath).catch(() => {});

    onLog(`\nBatch processing complete. Success: ${successCount}, Failed: ${failCount}`, 'DONE');
    return { successCount, failCount };
}

module.exports = { processBatch };
