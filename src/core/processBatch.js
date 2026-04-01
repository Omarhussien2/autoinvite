const fs = require('fs-extra');
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

    if (msg.includes('not registered') || msg.includes('not on whatsapp') || msg.includes('not a valid whatsapp number')) {
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

async function processBatch(contacts, startRow, endRow, messages, campaignId = null, hasTemplate = false, onLog = console.log, templatePath = null, canvasConfig = null, tenantId) {
    const subset = contacts.slice(startRow - 1, endRow);
    onLog(`\nProcessing ${subset.length} contacts (Rows ${startRow} to ${endRow})...\n`, 'INFO');

    WhatsAppManager.updateActivity(tenantId);
    const client = await WhatsAppManager.getClient(tenantId);

    const { MessageMedia } = require('whatsapp-web.js');

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
            const alreadySent = alreadySentRes.rows[0];
            if (alreadySent) {
                onLog(`Skipping ${name}: Already sent in this campaign (Deduplicated)`, 'WARN');
                continue;
            }
        }

        try {
            const message = pickWeightedMessage(messages, name);
            onLog(`[${index + 1}/${subset.length}] Processing: ${name} (${normalizedPhone})`, 'INFO');

            const validChatId = `${normalizedPhone}@c.us`;

            const withTimeout = (promise, ms = 30000) => {
                let timeoutId;
                const timeoutPr = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('WhatsApp Web is stuck (Timeout)')), ms);
                });
                return Promise.race([promise, timeoutPr]).finally(() => clearTimeout(timeoutId));
            };

            try {
                const isRegistered = await withTimeout(client.isRegisteredUser(validChatId), 10000);
                if (!isRegistered) {
                    await logResult(normalizedPhone, name, 'SKIP', 'Number not on WhatsApp');
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

            if (hasTemplate && templatePath) {
                const imagePath = await generateImage(name, normalizedPhone, templatePath, canvasConfig);
                const media = MessageMedia.fromFilePath(imagePath);
                await withTimeout(client.sendMessage(validChatId, media, { caption: message }), 60000);
                await fs.remove(imagePath);
            } else {
                await withTimeout(client.sendMessage(validChatId, message), 30000);
            }

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

            if (index < subset.length - 1) {
                await AntiBanEngine.applyDelay(config.whatsapp.minDelay, config.whatsapp.maxDelay, onLog);
            }

        } catch (error) {
            await logResult(normalizedPhone, name, 'FAIL', error.message);

            const saudiMsg = getSaudiErrorMessage(name, error.message);
            onLog(`Failed: ${name} - ${saudiMsg}`, 'ERROR');
            WhatsAppManager.emitToTenant(tenantId, 'log', { message: saudiMsg, type: 'ERROR' });

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
