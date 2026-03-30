const express = require('express');
const path = require('path');
const db = require('../database/pg-client');
const { isAuthenticated } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { upload } = require('../middleware/uploadStorage');
const { WhatsAppManager, loadContacts, processBatch } = require('../core');
const fs = require('fs');

const router = express.Router();

// Create Campaign
router.post('/', isAuthenticated, tenantScope, upload.fields([{ name: 'template' }, { name: 'contacts' }]), async (req, res) => {
    try {
        const { name, message_templates, canvas_config } = req.body;
        const templatePath = req.files['template'] ? req.files['template'][0].path : null;
        const contactsPath = req.files['contacts'] ? req.files['contacts'][0].path : null;

        if (!name || !message_templates || !contactsPath) {
            return res.status(400).json({ success: false, message: 'Name, Messages, and Contact File are required' });
        }

        const result = await db.query(`
            INSERT INTO campaigns (tenant_id, name, template_path, contacts_path, message_templates, canvas_config, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [req.tenantId, name, templatePath, contactsPath, message_templates, canvas_config || '{}', 'active']);

        res.json({ success: true, campaignId: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// List Campaigns
router.get('/', isAuthenticated, tenantScope, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC', [req.tenantId]);
        res.json({ success: true, campaigns: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Get Single Campaign
router.get('/:id', isAuthenticated, tenantScope, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        const campaign = result.rows[0];
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Update Campaign (Edit)
router.put('/:id', isAuthenticated, tenantScope, upload.fields([{ name: 'template' }, { name: 'contacts' }]), async (req, res) => {
    try {
        const { name, message_templates, canvas_config } = req.body;
        const templatePath = req.files['template'] ? req.files['template'][0].path : null;
        const contactsPath = req.files['contacts'] ? req.files['contacts'][0].path : null;

        let query = 'UPDATE campaigns SET name = $1, message_templates = $2, canvas_config = $3';
        const params = [name, message_templates, canvas_config];

        if (templatePath) {
            params.push(templatePath);
            query += `, template_path = $${params.length}`;
        }
        if (contactsPath) {
            params.push(contactsPath);
            query += `, contacts_path = $${params.length}`;
        }

        params.push(req.params.id, req.tenantId);
        query += ` WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`;

        await db.query(query, params);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Delete Campaign
router.delete('/:id', isAuthenticated, tenantScope, async (req, res) => {
    try {
        await db.query('DELETE FROM campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

// Get Campaign Stats
router.get('/:id/stats', isAuthenticated, tenantScope, async (req, res) => {
    try {
        const campaignId = req.params.id;
        const tenantId = req.tenantId;

        const campRes = await db.query('SELECT status, contacts_path FROM campaigns WHERE id = $1 AND tenant_id = $2', [campaignId, tenantId]);
        if (campRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Campaign not found' });

        const campaign = campRes.rows[0];

        // Total contacts count
        let totalContacts = 0;
        try {
            const contacts = await loadContacts(campaign.contacts_path);
            totalContacts = contacts.length;
        } catch (e) { console.error('Error loading contacts for stats:', e.message); }

        // Sent count
        const sentRes = await db.query('SELECT COUNT(*) FROM sent_logs WHERE campaign_id = $1 AND tenant_id = $2', [campaignId, tenantId]);
        const sentCount = parseInt(sentRes.rows[0].count);

        // Failed count (from logs if we had a dedicated failed table, for now we can check logs for specific status if we log them)
        // Since we only insert into sent_logs on success in the current logic, we might need a fail_logs table or a status column in sent_logs.
        // Let's assume for now we only track successes in the DB.

        res.json({
            success: true,
            stats: {
                total_contacts: totalContacts,
                sent_count: sentCount,
                failed_count: 0, // Placeholder until fail logging is implemented
                pending_count: Math.max(0, totalContacts - sentCount),
                status: campaign.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

module.exports = router;
