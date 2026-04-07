const db = require('../database/pg-client');

async function quotaGuard(req, res, next) {
    try {
        const tenantId = req.tenantId || req.session?.tenantId;
        if (!tenantId) return next();

        const result = await db.query(
            'SELECT message_quota, messages_used FROM tenants WHERE id = $1',
            [tenantId]
        );

        const tenant = result.rows[0];
        if (!tenant) return next();

        if (tenant.messages_used >= tenant.message_quota) {
            return res.status(403).json({
                success: false,
                message: 'خلص رصيدك من الرسائل! تواصل مع الإدارة لتجديد الباقة 📩'
            });
        }

        next();
    } catch (err) {
        console.error('[QuotaGuard] DB error — denying request:', err.message);
        return res.status(503).json({
            success: false,
            message: 'تعذر التحقق من الرصيد، حاول مرة أخرى'
        });
    }
}

module.exports = { quotaGuard };
