const express = require('express');
const db = require('../database/pg-client');
const { isAuthenticated } = require('../middleware/auth');
const { createLogger } = require('../utils/logger');
const log = createLogger('Contacts');

const router = express.Router();

router.post('/', isAuthenticated, async (req, res) => {
    try {
        const { name, phone } = req.body;
        const tenantId = req.session.tenantId;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'الاسم مطلوب' });
        }
        if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب' });
        }

        const result = await db.query(
            'INSERT INTO contacts (tenant_id, name, phone, status) VALUES ($1, $2, $3, $4) RETURNING id, name, phone',
            [tenantId, name.trim(), phone.trim(), 'pending']
        );

        res.json({ success: true, contact: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const contactId = req.params.id;

        const result = await db.query('DELETE FROM contacts WHERE id = $1 AND tenant_id = $2 RETURNING id', [contactId, tenantId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'جهة اتصال غير موجودة' });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
