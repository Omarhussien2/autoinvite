const express = require('express');
const db = require('../database/pg-client');
const { isAuthenticated } = require('../middleware/auth');
const { createLogger } = require('../utils/logger');
const log = createLogger('Tenant');

const router = express.Router();

router.put('/settings', isAuthenticated, async (req, res) => {
    try {
        const { name, settings } = req.body;

        if (!name || typeof name !== 'string' || name.length < 3) {
            return res.status(400).json({ success: false, message: 'Invalid name' });
        }
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ success: false, message: 'Settings must be an object' });
        }

        await db.query('UPDATE tenants SET name = $1, settings = $2 WHERE id = $3', [name, JSON.stringify(settings), req.session.tenantId]);
        req.session.tenantName = name;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.put('/password', isAuthenticated, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        const tenantId = req.session.tenantId;

        if (!current_password || !new_password) {
            return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
        }

        if (new_password.length < 8) {
            return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
        }

        const bcrypt = require('bcrypt');
        const result = await db.query('SELECT password_hash FROM tenants WHERE id = $1', [tenantId]);
        const tenant = result.rows[0];

        if (!tenant) {
            return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
        }

        const match = await bcrypt.compare(current_password, tenant.password_hash);
        if (!match) {
            return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE tenants SET password_hash = $1 WHERE id = $2', [hashedPassword, tenantId]);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/stats', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const contactsCount = await db.query('SELECT COUNT(*) FROM contacts WHERE tenant_id = $1', [tenantId]);
        const campaignResult = await db.query('SELECT * FROM campaigns WHERE tenant_id = $1', [tenantId]);
        const sentResult = await db.query('SELECT COUNT(*) FROM sent_logs WHERE tenant_id = $1 AND (status IS NULL OR status = $2)', [tenantId, 'success']);
        const tenantRes = await db.query('SELECT message_quota, messages_used FROM tenants WHERE id = $1', [tenantId]);

        const tenant = tenantRes.rows[0] || { message_quota: 99, messages_used: 0 };

        res.json({
            success: true,
            stats: {
                contacts: parseInt(contactsCount.rows[0].count || 0),
                campaigns: campaignResult.rows.length,
                messagesSent: parseInt(sentResult.rows[0].count || 0),
                activeCampaigns: campaignResult.rows.filter(c => c.status === 'active' || c.status === 'running').length,
                messageQuota: parseInt(tenant.message_quota || 99),
                messagesUsed: parseInt(tenant.messages_used || 0),
                quotaRemaining: Math.max(0, parseInt(tenant.message_quota || 99) - parseInt(tenant.messages_used || 0))
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
