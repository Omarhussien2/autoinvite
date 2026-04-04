const fs = require('fs-extra');
const path = require('path');
const { normalizePhone, processName } = require('../utils/dataProcessor');
const config = require('../config/settings');
const { generateImage } = require('../utils/generator');
const { logResult } = require('../utils/logger');
const db = require('../database/pg-client');
const WhatsAppManager = require('./WhatsAppManager');
const AntiBanEngine = require('./AntiBanEngine');

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

    for (const [index, contact] of subset.entries()) {
        WhatsAppManager.updateActivity(tenantId);

        if (global.stopBatchRequested && global.stopBatchRequested[tenantId]) {
            onLog('تم إيقاف الإرسال بنجاح.', 'WARN');
            break;
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
            // Show typing indicator for a duration based on message length
            // (50ms per character, capped at 3 seconds), then send.
            try {
                await client.startTyping(chatId);
                const typingDelay = Math.min(message.length * 50, 3000);
                onLog(`[HumanBehavior] Typing for ${(typingDelay / 1000).toFixed(1)}s (${message.length} chars)...`, 'INFO');
                await AntiBanEngine.sleep(typingDelay);
                await client.stopTyping(chatId);
            } catch (_) {}

            // ── Step 3: Send the message ────────────────────────────────────
            if (voicenotePath) {
                // Send as WhatsApp Voice Note (PTT) — appears as recorded audio,
                // not as a file download. Maximises trust and open rate.
                await client.sendPtt(chatId, voicenotePath);
                // Follow with the text caption (personalised with [الاسم]) as a
                // separate text message so recipients know who sent it.
                if (message) await client.sendText(chatId, message);
            } else if (hasTemplate && templatePath) {
                const imagePath = await generateImage(name, normalizedPhone, templatePath, canvasConfig);
                const imgBase64 = `data:image/png;base64,${fs.readFileSync(imagePath).toString('base64')}`;
                await client.sendImage(chatId, imgBase64, 'invitation.png', message);
                await fs.remove(imagePath);
            } else {
                await client.sendText(chatId, message);
            }

            // ── Step 6: Record sent & apply inter-message anti-ban delay ───
            AntiBanEngine.recordSent(tenantId);

            if (campaignId) {
                await db.query(
                    'INSERT INTO sent_logs (campaign_id, tenant_id, phone, name, status) VALUES ($1, $2, $3, $4, $5)',
                    [campaignId, tenantId, normalizedPhone, name, 'success']
                );
                await db.query('UPDATE campaigns SET last_sent_row = $1 WHERE id = $2', [currentRow, campaignId]);
            }

            if (tenantId) {
                await db.query('UPDATE tenants SET messages_used = messages_used + 1 WHERE id = $1', [tenantId]);
            }

            await logResult(normalizedPhone, name, 'SUCCESS', 'Invitation Sent');
            onLog(`Success: Invitation sent to ${name}`, 'SUCCESS');

            // Apply inter-message delay (skip after the very last message)
            if (index < subset.length - 1) {
                await AntiBanEngine.applyDelay(
                    config.whatsapp.minDelay,
                    config.whatsapp.maxDelay,
                    onLog,
                    tenantId
                );
            }

        } catch (error) {
            try { await client.stopTyping(`${normalizedPhone}@c.us`); } catch (_) {}

            const errMsg = error && error.message ? error.message : String(error);
            await logResult(normalizedPhone, name, 'FAIL', errMsg);
            const saudiMsg = getSaudiErrorMessage(name, errMsg);
            onLog(`Failed: ${name} - ${saudiMsg}`, 'ERROR');
            console.error(`[processBatch] Error for ${name} (${normalizedPhone}):`, error);
            WhatsAppManager.emitToTenant(tenantId, 'log', { message: saudiMsg, type: 'ERROR' });
            WhatsAppManager.emitToTenant(tenantId, 'log', { message: `[تفاصيل] ${errMsg}`, type: 'WARN' });

            if (campaignId) {
                await db.query('UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1', [campaignId]).catch(() => {});
                await db.query(
                    'INSERT INTO sent_logs (campaign_id, tenant_id, phone, name, status, failed_at) VALUES ($1, $2, $3, $4, $5, NOW())',
                    [campaignId, tenantId, normalizedPhone, name, 'failed']
                ).catch(() => {});
            }
        }
    }

    onLog('\nBatch processing complete.', 'DONE');
}

module.exports = { processBatch };
