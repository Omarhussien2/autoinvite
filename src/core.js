const fs = require('fs-extra');
const path = require('path');
const csv = require('csv-parser');
const { normalizePhone, processName } = require('./utils/dataProcessor');
const config = require('./config/settings');
const { generateImage } = require('./utils/generator');
const { logResult } = require('./utils/logger');
const db = require('./database/pg-client');
const WhatsAppManager = require('./core/WhatsAppManager');
const AntiBanEngine = require('./core/AntiBanEngine');

/**
 * Pick a message based on weight (probability)
 * @param {Array} messages - Array of { weight: number, text: string }
 * @param {string} name - Guest name to inject
 */
function pickWeightedMessage(messages, name) {
    // Calculate total weight
    const totalWeight = messages.reduce((sum, m) => sum + (m.weight || 1), 0);

    // Generate random number between 0 and totalWeight
    let random = Math.random() * totalWeight;

    // Find which message this random falls into
    for (const msg of messages) {
        random -= (msg.weight || 1);
        if (random <= 0) {
            return msg.text.replace('[الاسم]', name);
        }
    }

    // Fallback to first message
    return messages[0].text.replace('[الاسم]', name);
}

const xlsx = require('xlsx');

async function loadContacts(customFilePath = null) {
    // If a custom file path is provided from the campaign, use it. Otherwise fallback to the old default.
    const filePath = customFilePath || path.resolve(__dirname, '../data/data - Sheet1.csv');
    
    return new Promise((resolve, reject) => {
        try {
            if (filePath.toLowerCase().endsWith('.csv')) {
                const contacts = [];
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (data) => contacts.push(data))
                    .on('end', () => resolve(contacts))
                    .on('error', (err) => reject(err));
            } else if (filePath.toLowerCase().endsWith('.xlsx')) {
                const workbook = xlsx.readFile(filePath);
                const sheetName = workbook.SheetNames[0];
                const contacts = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
                resolve(contacts);
            } else {
                reject(new Error(`Unsupported file type: ${filePath}`));
            }
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Process a batch of contacts
 * @param {Array} contacts - Full list of contacts
 * @param {number} startRow - 1-based start row index
 * @param {number} endRow - 1-based end row index
 * @param {Array} messages - Array of {text, weight} templates
 * @param {number} campaignId - Optional ID for deduplication
 * @param {boolean} hasTemplate - Has Image Template
 * @param {Function} onLog - Callback for logs (message, type)
 * @param {string} templatePath - Optional Image Path
 * @param {Object} canvasConfig - Optional Image Layout config
 * @param {number} tenantId - The tenant's ID
 */
async function processBatch(contacts, startRow, endRow, messages, campaignId = null, hasTemplate = false, onLog = console.log, templatePath = null, canvasConfig = null, tenantId) {
    const subset = contacts.slice(startRow - 1, endRow);
    onLog(`\nProcessing ${subset.length} contacts (Rows ${startRow} to ${endRow})...\n`, 'INFO');

    WhatsAppManager.updateActivity(tenantId);
    const client = await WhatsAppManager.getClient(tenantId);

    // Provide MessageMedia from whatsapp-web.js directly just to create files if needed
    const { MessageMedia } = require('whatsapp-web.js');

    for (const [index, contact] of subset.entries()) {
        WhatsAppManager.updateActivity(tenantId); // Prevent SleepMonitor from killing active campaign

        // Use per-tenant Stop flag
        if (global.stopBatchRequested && global.stopBatchRequested[tenantId]) {
            onLog('⏹️ تم إيقاف الإرسال بنجاح.', 'WARN');
            break;
        }

        const rawName = contact['الإسم'] || contact['Name'] || 'Guest';
        const name = await processName(rawName); // Auto-Translate Name
        const rawPhone = contact['رقم الجوال'] || contact['Phone'];
        const currentRow = startRow + index;

        // 1. Normalize Phone (Smart Engine)
        const normalizedPhone = normalizePhone(rawPhone);

        if (!normalizedPhone) {
            await logResult(rawPhone, name, 'SKIP', 'Invalid Phone Format');
            onLog(`Skipping ${name}: Invalid Phone Format (${rawPhone})`, 'WARN');
            continue;
        }

        // 2. Cross-Campaign Deduplication
        if (campaignId) {
            const alreadySentRes = await db.query('SELECT id FROM sent_logs WHERE campaign_id = $1 AND phone = $2', [campaignId, normalizedPhone]);
            const alreadySent = alreadySentRes.rows[0];
            if (alreadySent) {
                onLog(`Skipping ${name}: Already sent in this campaign (Deduplicated) 🛡️`, 'WARN');
                continue;
            }
        }

        try {
            const message = pickWeightedMessage(messages, name);
            onLog(`[${index + 1}/${subset.length}] Processing: ${name} (${normalizedPhone})`, 'INFO');

            const validChatId = `${normalizedPhone}@c.us`;

            // Timeout wrapper to prevent hanging permanently
            const withTimeout = (promise, ms = 30000) => {
                let timeoutId;
                const timeoutPr = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('WhatsApp Web is stuck (Timeout)')), ms);
                });
                return Promise.race([promise, timeoutPr]).finally(() => clearTimeout(timeoutId));
            };

            // Check if number is registered on WhatsApp FIRST (prevents 25s timeout waste)
            try {
                const isRegistered = await withTimeout(client.isRegisteredUser(validChatId), 10000);
                if (!isRegistered) {
                    await logResult(normalizedPhone, name, 'SKIP', 'Number not on WhatsApp');
                    onLog(`Skipping ${name}: الرقم مو مسجل بالواتساب ⚠️`, 'WARN');
                    continue;
                }
            } catch (regErr) {
                onLog(`⚠️ تعذر التحقق من الرقم ${normalizedPhone}, سنحاول الإرسال مباشرة...`, 'WARN');
            }

            if (hasTemplate && templatePath) {
                // Campaign HAS image template: Generate image and send with caption
                const imagePath = await generateImage(name, normalizedPhone, templatePath, canvasConfig);
                const media = MessageMedia.fromFilePath(imagePath);
                await withTimeout(client.sendMessage(validChatId, media, { caption: message }), 60000); // 60s timeout for media
                await fs.remove(imagePath); // Cleanup
            } else {
                // Campaign has NO image: Send text-only message
                await withTimeout(client.sendMessage(validChatId, message), 30000); // 30s timeout for text
            }

            // Log Success and Update Progress
            if (campaignId) {
                await db.query(
                    'INSERT INTO sent_logs (campaign_id, tenant_id, phone, name) VALUES ($1, $2, $3, $4)',
                    [campaignId, tenantId, normalizedPhone, name]
                );
                // Update last_sent_row per contact processed
                await db.query('UPDATE campaigns SET last_sent_row = $1 WHERE id = $2', [currentRow, campaignId]);
            }
            await logResult(normalizedPhone, name, 'SUCCESS', 'Invitation Sent');
            onLog(`Success: Invitation sent to ${name}`, 'SUCCESS');

            // Anti-Ban Delay (Random)
            if (index < subset.length - 1) {
                await AntiBanEngine.applyDelay(config.whatsapp.minDelay, config.whatsapp.maxDelay, onLog);
            }

        } catch (error) {
            await logResult(normalizedPhone, name, 'FAIL', error.message);
            onLog(`Failed: ${name} - ${error.message}`, 'ERROR');
        }
    }

    onLog('\nBatch processing complete.', 'DONE');
}

module.exports = {
    WhatsAppManager,
    AntiBanEngine,
    loadContacts,
    processBatch
};
