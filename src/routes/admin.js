const express = require('express');
const bcrypt = require('bcrypt');
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

// Create Tenant
router.post('/tenants', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { name, username, password, message_quota } = req.body;

        if (!name || !username || !password) {
            return res.status(400).json({ success: false, message: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
        }

        const existing = await db.query('SELECT id FROM tenants WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'اسم المستخدم مستخدم بالفعل' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        const quota = parseInt(message_quota) || 99;

        const result = await db.query(
            'INSERT INTO tenants (name, username, password_hash, role, message_quota, messages_used, settings) VALUES ($1, $2, $3, $4, $5, 0, $6) RETURNING id, name, username, role, message_quota',
            [name, username, password_hash, 'user', quota, JSON.stringify({ min_delay: 30, max_delay: 60, safe_mode: true })]
        );

        res.json({ success: true, tenant: result.rows[0] });
    } catch (err) {
        console.error('Create Tenant Error:', err);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Delete Tenant
router.delete('/tenants/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.session.tenantId === id) {
            return res.status(403).json({ success: false, message: 'لا يمكنك حذف حسابك الخاص' });
        }

        const check = await db.query('SELECT id FROM tenants WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        await WhatsAppManager.stopClient(id);

        await db.query('DELETE FROM sent_logs WHERE tenant_id = $1', [id]);
        await db.query('DELETE FROM contacts WHERE tenant_id = $1', [id]);
        await db.query('DELETE FROM campaigns WHERE tenant_id = $1', [id]);
        await db.query('DELETE FROM tenants WHERE id = $1', [id]);

        res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
    } catch (err) {
        console.error('Delete Tenant Error:', err);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Force Disconnect WhatsApp
router.post('/tenants/:id/disconnect', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!WhatsAppManager.clients.has(id)) {
            return res.json({ success: true, message: 'الواتساب غير متصل بالفعل' });
        }

        await WhatsAppManager.stopClient(id);
        res.json({ success: true, message: 'تم قطع اتصال الواتساب بنجاح' });
    } catch (err) {
        console.error('Disconnect WhatsApp Error:', err);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// System Health API
router.get('/health', isAuthenticated, isAdmin, (req, res) => {
    const mem = process.memoryUsage();
    const uptimeSec = process.uptime();

    const formatBytes = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const formatUptime = (sec) => {
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const parts = [];
        if (d > 0) parts.push(d + ' يوم');
        if (h > 0) parts.push(h + ' ساعة');
        parts.push(m + ' دقيقة');
        return parts.join('، ');
    };

    res.json({
        success: true,
        health: {
            activeInstances: WhatsAppManager.clients.size,
            maxCapacity: parseInt(WhatsAppManager.MAX_TOTAL_CLIENTS),
            uptime: formatUptime(uptimeSec),
            uptimeSeconds: Math.floor(uptimeSec),
            memoryRSS: formatBytes(mem.rss),
            memoryHeapUsed: formatBytes(mem.heapUsed),
            memoryHeapTotal: formatBytes(mem.heapTotal),
            memoryRSSBytes: mem.rss
        }
    });
});

module.exports = router;
