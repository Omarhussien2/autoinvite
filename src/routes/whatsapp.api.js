const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { quotaGuard } = require('../middleware/quotaGuard');
const BackgroundQueue = require('../core/BackgroundQueue');
const { WhatsAppProviders, loadContacts } = require('../core');
const db = require('../database/pg-client');
const ScheduleManager = require('../core/ScheduleManager');
const { createLogger } = require('../utils/logger');
const { CampaignPreflightService } = require('../services/CampaignPreflightService');
const log = createLogger('WhatsAppAPI');
const campaignPreflight = new CampaignPreflightService();

const router = express.Router();

router.use(isAuthenticated);
router.use(tenantScope);

// WhatsApp Initialization Trigger
router.post('/init', async (req, res) => {
    try {
        const provider = await WhatsAppProviders.getProviderForTenant(req.tenantId);
        let state = provider.getTenantState(req.tenantId);

        if (typeof provider.refreshClientState === 'function') {
            state = await provider.refreshClientState(req.tenantId, { emit: true });
        }

        if (state.status === 'READY') {
            return res.json({ success: true, message: 'WhatsApp already connected', state });
        }

        if (state.status === 'QUERY_QR' && state.lastQr) {
            provider.emitToTenant(req.tenantId, 'qr', state.lastQr);
            return res.json({ success: true, message: 'QR already available', state });
        }

        provider.getClient(req.tenantId).catch((err) => {
            log.error(`WhatsApp init failed for tenant ${req.tenantId}:`, err.message);
        });
        res.json({ success: true, message: 'Initialization started', state: provider.getTenantState(req.tenantId) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Start Campaign Batch — quota guard applies here (HTTP only, never Socket.io)
router.post('/start', quotaGuard, async (req, res) => {
    const { startRow, endRow, campaignId } = req.body;
    const tenantId = req.tenantId;

    try {
        const provider = await WhatsAppProviders.getProviderForTenant(tenantId);
        const curState = provider.getTenantState(tenantId);
        if (curState.status === 'WORKING') {
            return res.status(400).json({ success: false, message: 'الجهاز يعمل مسبقا' });
        }

        let contactsPath = null;
        let messages;
        let hasTemplate = false;
        let templatePath = null;
        let canvasConfig = null;
        let voicenotePath = null;

        if (campaignId) {
            const result = await db.query(`
                SELECT campaign.message_templates, campaign.template_path, campaign.canvas_config,
                       campaign.contacts_path, campaign.voicenote_path, tenant.messaging_enabled
                FROM campaigns campaign
                JOIN tenants tenant ON tenant.id = campaign.tenant_id
                WHERE campaign.id = $1 AND campaign.tenant_id = $2
            `, [campaignId, tenantId]);
            const campaign = result.rows[0];
            if (campaign) {
                if (!campaign.messaging_enabled) {
                    return res.status(423).json({ success: false, message: 'الإرسال متوقف من إعدادات الأمان' });
                }
                if (!await campaignPreflight.verifyApproval(tenantId, campaignId)) {
                    return res.status(409).json({ success: false, message: 'يجب تشغيل الفحص المسبق واعتماد الخطة قبل بدء الحملة' });
                }
                if (campaign.message_templates) messages = campaign.message_templates;
                if (campaign.template_path) {
                    const fs = require('fs-extra');
                    const pathMod = require('path');
                    const resolvedTpl = pathMod.isAbsolute(campaign.template_path)
                        ? campaign.template_path
                        : pathMod.resolve(__dirname, '../../', campaign.template_path);
                    if (fs.existsSync(resolvedTpl)) {
                        hasTemplate = true;
                        templatePath = campaign.template_path;
                        if (campaign.canvas_config) {
                            // PostgreSQL JSONB may return object or string
                            canvasConfig = typeof campaign.canvas_config === 'string'
                                ? JSON.parse(campaign.canvas_config)
                                : campaign.canvas_config;
                        }
                    } else {
                        log.warn(`Campaign ${campaignId} template file not found: ${resolvedTpl}, sending as text-only`);
                    }
                }
                if (campaign.contacts_path) contactsPath = campaign.contacts_path;
                if (campaign.voicenote_path) voicenotePath = campaign.voicenote_path;
            } else {
                return res.status(404).json({ success: false, message: 'Campaign not found' });
            }
        }

        const client = await provider.getClient(tenantId);
        const readyState = provider.getTenantState(tenantId);
        if (!client || !['READY', 'CONNECTED'].includes(String(readyState.status).toUpperCase())) {
            return res.status(409).json({ success: false, message: 'واتساب غير جاهز. افتح صفحة الاتصال وأكمل الربط أولا' });
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

        await db.query(
            'UPDATE campaigns SET stop_requested_at = NULL, paused_reason = NULL WHERE id = $1 AND tenant_id = $2',
            [campaignId, tenantId]
        );

        if (!global.stopBatchRequested) global.stopBatchRequested = {};
        global.stopBatchRequested[tenantId] = false;

        provider.setTenantState(tenantId, { status: 'WORKING', lastQr: null, lastActive: Date.now(), phone: null });
        provider.emitToTenant(tenantId, 'working_state', true);

        await BackgroundQueue.addJob(
            tenantId, campaignId, contacts, start, end, messages, hasTemplate,
            templatePath, canvasConfig, voicenotePath,
            { retryFailed: req.body.retryFailed === true }
        );

        res.json({ success: true, message: 'Started successfully' });

    } catch (error) {
        log.error('Start campaign error:', error);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Stop Campaign Batch
router.post('/stop', async (req, res) => {
    try {
        const activeJob = BackgroundQueue.jobs && BackgroundQueue.jobs.get(req.tenantId);
        const campaignId = req.body.campaignId || (activeJob && activeJob.campaignId);
        if (!campaignId) {
            return res.status(400).json({ success: false, message: 'campaignId is required' });
        }
        await BackgroundQueue.stopJob(req.tenantId);
        await ScheduleManager.requestStop(campaignId, req.tenantId);
        res.json({ success: true, message: 'Stop Requested' });
    } catch (error) {
        log.error('Stop campaign error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to stop campaign' });
    }
});

// Quick Test Send — quota guard applies here too
router.post('/test', quotaGuard, async (req, res) => {
    try {
        const { phone } = req.body;
        const tenantId = req.tenantId;

        const messagingGate = await db.query(
            'SELECT messaging_enabled FROM tenants WHERE id = $1',
            [tenantId]
        );
        if (!messagingGate.rows[0] || !messagingGate.rows[0].messaging_enabled) {
            return res.status(423).json({ success: false, message: 'الإرسال متوقف من إعدادات الأمان' });
        }
        if (typeof phone !== 'string' || !phone.trim()) {
            return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب' });
        }

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
        const provider = await WhatsAppProviders.getProviderForTenant(tenantId);
        const client = await provider.getClient(tenantId);

        await client.sendText(chatId, 'تجربة عزام: هلا والله! النظام شغال');
        res.json({ success: true, message: 'Test message sent' });
    } catch (err) {
        log.error('Test send error:', err);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Client Status
router.get('/status', async (req, res) => {
    try {
        const provider = await WhatsAppProviders.getProviderForTenant(req.tenantId);
        const state = typeof provider.refreshClientState === 'function'
            ? await provider.refreshClientState(req.tenantId, { emit: true })
            : provider.getTenantState(req.tenantId);

        res.json({
            success: true,
            state,
            hasStoredSession: typeof provider.hasStoredSession === 'function'
                ? provider.hasStoredSession(req.tenantId)
                : false,
        });
    } catch (err) {
        log.error('Status error:', err.message);
        res.status(500).json({ success: false, message: 'Ø®Ø·Ø£ Ø¯Ø§Ø®Ù„ÙŠ ÙÙŠ Ø§Ù„Ø³ÙŠØ±ÙØ±' });
    }
});

// Disconnect Session
router.post('/disconnect', async (req, res) => {
    try {
        const provider = await WhatsAppProviders.getProviderForTenant(req.tenantId);
        await provider.stopClient(req.tenantId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Deep Logout — unlink device + delete tokens + fresh QR
router.post('/logout', async (req, res) => {
    try {
        const provider = await WhatsAppProviders.getProviderForTenant(req.tenantId);
        await provider.logoutClient(req.tenantId);
        res.json({ success: true, message: 'تم قطع الاتصال وجاري توليد باركود جديد' });
    } catch (err) {
        log.error('Logout error:', err.message);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

module.exports = router;
