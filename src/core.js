const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const csv = require('csv-parser');
const { normalizePhone, transliterateName } = require('./utils/dataProcessor');
const config = require('./config/settings');
const { generateImage } = require('./utils/generator');
const { logResult } = require('./utils/logger');
const db = require('./database/db'); // Import DB for deduplication

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || require('child_process').execSync('which chromium').toString().trim(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function loadContacts() {
    const csvFilePath = path.resolve(__dirname, '../data/data - Sheet1.csv');
    const contacts = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (data) => contacts.push(data))
            .on('end', () => resolve(contacts))
            .on('error', (err) => reject(err));
    });
}

/**
 * Process a batch of contacts
 * @param {Array} contacts - Full list of contacts
 * @param {Array} contacts - Full list of contacts
 * @param {number} startRow - 1-based start row index
 * @param {number} endRow - 1-based end row index
 * @param {Array} messages - Array of {text, weight} templates
 * @param {number} campaignId - Optional ID for deduplication
 * @param {Function} onLog - Callback for logs (message, type)
 */
async function processBatch(contacts, startRow, endRow, messages, campaignId = null, onLog = console.log) {
    const subset = contacts.slice(startRow - 1, endRow);
    onLog(`\nProcessing ${subset.length} contacts (Rows ${startRow} to ${endRow})...\n`, 'INFO');

    for (const [index, contact] of subset.entries()) {
        // Check for stop request
        if (global.stopBatchRequested) {
            onLog('⏹️ تم إيقاف الإرسال بنجاح.', 'WARN');
            break;
        }

        const rawName = contact['الإسم'] || contact['Name'] || 'Guest';
        const name = transliterateName(rawName); // Convert English names to Arabic
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
            const alreadySent = db.prepare('SELECT id FROM sent_logs WHERE campaign_id = ? AND phone = ?').get(campaignId, normalizedPhone);
            if (alreadySent) {
                onLog(`Skipping ${name}: Already sent in this campaign (Deduplicated) 🛡️`, 'WARN');
                continue;
            }
        }

        const chatId = `${normalizedPhone}@c.us`;

        try {
            // 2. Generate Image
            const imagePath = await generateImage(name, normalizedPhone);

            // 3. Send Message
            const media = MessageMedia.fromFilePath(imagePath);

            // Pick Weighted Random Message
            const message = pickWeightedMessage(messages, name);

            onLog(`[${index + 1}/${subset.length}] Processing: ${name} (${normalizedPhone})`, 'INFO');
            await client.sendMessage(chatId, media, { caption: message });

            // 4. Log Success
            if (campaignId) {
                db.prepare('INSERT INTO sent_logs (campaign_id, phone, name) VALUES (?, ?, ?)').run(campaignId, normalizedPhone, name);
            }
            await logResult(normalizedPhone, name, 'SUCCESS', 'Invitation Sent');
            onLog(`Success: Invitation sent to ${name}`, 'SUCCESS');

            // 5. Cleanup Image
            await fs.remove(imagePath);

            // 6. Anti-Ban Delay (Random)
            if (index < subset.length - 1) { // Don't sleep after the last one
                const delay = Math.floor(Math.random() * (config.whatsapp.maxDelay - config.whatsapp.minDelay + 1) + config.whatsapp.minDelay);
                onLog(`Waiting ${Math.floor(delay / 1000)} seconds...`, 'INFO');
                await sleep(delay);
            }

        } catch (error) {
            await logResult(normalizedPhone, name, 'FAIL', error.message);
            onLog(`Failed: ${name} - ${error.message}`, 'ERROR');
        }
    }

    onLog('\nBatch processing complete.', 'DONE');
}

module.exports = {
    client,
    loadContacts,
    processBatch
};
