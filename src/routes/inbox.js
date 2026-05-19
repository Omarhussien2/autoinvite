const express = require('express');
const db = require('../database/pg-client');
const { isAuthenticated } = require('../middleware/auth');
const { WhatsAppProviders } = require('../core');
const { createLogger } = require('../utils/logger');
const log = createLogger('Inbox');

const router = express.Router();

router.get('/:phone/messages', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const phone = req.params.phone;

        const result = await db.query(
            `SELECT * FROM messages WHERE tenant_id = $1 AND remote_phone = $2 ORDER BY created_at ASC LIMIT 200`,
            [tenantId, phone]
        );

        await db.query(
            `UPDATE messages SET is_read = TRUE WHERE tenant_id = $1 AND remote_phone = $2 AND direction = 'inbound' AND is_read = FALSE`,
            [tenantId, phone]
        ).catch(err => log.error('Failed to mark messages as read:', err.message));

        res.json({ success: true, messages: result.rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/:phone/reply', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const phone = req.params.phone;
        const { body } = req.body;

        if (!body || typeof body !== 'string' || body.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'الرسالة فارغة' });
        }

        const provider = await WhatsAppProviders.getProviderForTenant(tenantId);
        const client = await provider.getClient(tenantId);
        const chatId = `${phone}@c.us`;

        await client.sendText(chatId, body.trim());

        await db.query(
            `INSERT INTO messages (tenant_id, remote_phone, sender, direction, body, whatsapp_timestamp)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [tenantId, phone, 'me', 'outbound', body.trim()]
        );

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
