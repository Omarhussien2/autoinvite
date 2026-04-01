const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { quotaGuard } = require('../middleware/quotaGuard');
const BackgroundQueue = require('../core/BackgroundQueue');
const { WhatsAppManager, loadContacts } = require('../core');
const db = require('../database/pg-client');

const router = express.Router();

router.use(isAuthenticated);
router.use(tenantScope);

// WhatsApp Initialization Trigger
router.post('/init', async (req, res) => {
    try {
        await WhatsAppManager.getClient(req.tenantId);
        res.json({ success: true, message: 'Initialization started' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Start Campaign Batch — quota guard applies here (HTTP only, never Socket.io)
router.post('/start', quotaGuard, async (req, res) => {
    const { startRow, endRow, campaignId } = req.body;
    const tenantId = req.tenantId;

    const curState = WhatsAppManager.getTenantState(tenantId);
    if (curState.status === 'WORKING') {
        return res.status(400).json({ success: false, message: 'الجهاز يعمل مسبقا' });
    }

    try {
        let contactsPath = null;
        let messages;
        let hasTemplate = false;
        let templatePath = null;
        let canvasConfig = null;

        if (campaignId) {
            const result = await db.query('SELECT message_templates, template_path, canvas_config, contacts_path FROM campaigns WHERE id = $1 AND tenant_id = $2', [campaignId, tenantId]);
            const campaign = result.rows[0];
            if (campaign) {
                if (campaign.message_templates) messages = campaign.message_templates;
                if (campaign.template_path) {
                    hasTemplate = true;
                    templatePath = campaign.template_path;
                    if (campaign.canvas_config) canvasConfig = campaign.canvas_config;
                }
                if (campaign.contacts_path) contactsPath = campaign.contacts_path;
            } else {
                return res.status(404).json({ success: false, message: 'Campaign not found' });
            }
        }

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            const config = require('../config/settings');
            messages = config.messages;
        }

        const contacts = await loadContacts(contactsPath);

        if (!contacts || contacts.length === 0) {
            return res.status(400).json({ success: false, message: 'ملف الأرقام فارغ أو غير صالح' });
        }

        const start = Math.max(1, parseInt(startRow) || 1);
        const end = Math.min(parseInt(endRow) || contacts.length, contacts.length);

        if (start > end) {
            return res.status(400).json({ success: false, message: 'صف البداية أكبر من صف النهاية' });
        }

        if (!global.stopBatchRequested) global.stopBatchRequested = {};
        global.stopBatchRequested[tenantId] = false;

        if (!WhatsAppManager.states.has(tenantId)) {
            WhatsAppManager.states.set(tenantId, { status: 'WORKING', lastQr: null, lastActive: Date.now(), phone: null });
        } else {
            WhatsAppManager.states.get(tenantId).status = 'WORKING';
        }
        WhatsAppManager.emitToTenant(tenantId, 'working_state', true);

        BackgroundQueue.addJob(tenantId, campaignId, contacts, start, end, messages, hasTemplate, templatePath, canvasConfig)
            .catch(console.error);

        res.json({ success: true, message: 'Started successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Stop Campaign Batch
router.post('/stop', (req, res) => {
    BackgroundQueue.stopJob(req.tenantId);
    res.json({ success: true, message: 'Stop Requested' });
});

// Quick Test Send — quota guard applies here too
router.post('/test', quotaGuard, async (req, res) => {
    try {
        const { phone } = req.body;
        const tenantId = req.tenantId;

        let targetPhone = phone.replace(/\D/g, '');
        // Strip leading 00 or + if present (already stripped by \D)
        if (targetPhone.startsWith('00')) targetPhone = targetPhone.substring(2);

        // Egyptian: 01x → 201x
        if (targetPhone.startsWith('01') && targetPhone.length === 11) {
            targetPhone = '20' + targetPhone.substring(1);
        }
        // Saudi: 05x → 9665x
        else if (targetPhone.startsWith('05') && targetPhone.length === 10) {
            targetPhone = '966' + targetPhone.substring(1);
        }

        const chatId = `${targetPhone}@c.us`;
        const client = await WhatsAppManager.getClient(tenantId);

        await client.sendMessage(chatId, 'تجربة أوتو إنفايت: هلا والله! النظام شغال 🚀');
        res.json({ success: true, message: 'Test message sent' });
    } catch (err) {
        console.error('Test Err:', err);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Client Status
router.get('/status', (req, res) => {
    const state = WhatsAppManager.getTenantState(req.tenantId);
    res.json({ success: true, state });
});

// Disconnect Session
router.post('/disconnect', async (req, res) => {
    try {
        await WhatsAppManager.stopClient(req.tenantId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

module.exports = router;
