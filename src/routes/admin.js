const express = require('express');
const db = require('../database/pg-client');
const { isAuthenticated } = require('../middleware/auth');
const WhatsAppManager = require('../core/WhatsAppManager');

const router = express.Router();

function isAdmin(req, res, next) {
    if (req.session && req.session.tenantRole === 'admin') return next();
    if (req.headers.accept && req.headers.accept.includes('json')) {
        return res.status(403).json({ success: false, message: 'غير مسموح لك بالدخول' });
    }
    return res.status(403).send('<h1>403 — غير مسموح</h1><p>هذه الصفحة للمشرفين فقط.</p>');
}

// Admin Dashboard
router.get('/dashboard', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const tenantsRes = await db.query(`
            SELECT
                t.id,
                t.name,
                t.username,
                t.role,
                t.message_quota,
                t.messages_used,
                t.created_at,
                COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('active', 'running')) AS active_campaign_count,
                COUNT(DISTINCT c.id) AS total_campaign_count
            FROM tenants t
            LEFT JOIN campaigns c ON c.tenant_id = t.id
            GROUP BY t.id
            ORDER BY t.created_at DESC
        `);

        const tenants = tenantsRes.rows.map(t => {
            const state = WhatsAppManager.getTenantState(t.id);
            return {
                ...t,
                whatsapp_status: state.status || 'DISCONNECTED',
                whatsapp_phone: state.phone || null
            };
        });

        res.renderPage('admin/dashboard', {
            pageTitle: 'لوحة تحكم المشرف',
            activePage: 'admin',
            tenantName: req.session.tenantName || 'Admin',
            tenants
        });
    } catch (err) {
        console.error('Admin Dashboard Error:', err);
        res.status(500).send('خطأ داخلي في السيرفر');
    }
});

// Update Tenant Quota
router.patch('/tenants/:id/quota', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { message_quota } = req.body;

        const quota = parseInt(message_quota);
        if (isNaN(quota) || quota < 0) {
            return res.status(400).json({ success: false, message: 'قيمة الحصة غير صالحة' });
        }

        await db.query('UPDATE tenants SET message_quota = $1 WHERE id = $2', [quota, id]);
        res.json({ success: true, message: 'تم تحديث الحصة بنجاح' });
    } catch (err) {
        console.error('Update Quota Error:', err);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Reset Tenant Usage
router.patch('/tenants/:id/reset-usage', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE tenants SET messages_used = 0 WHERE id = $1', [id]);
        res.json({ success: true, message: 'تم إعادة تعيين الاستخدام' });
    } catch (err) {
        console.error('Reset Usage Error:', err);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

module.exports = router;
