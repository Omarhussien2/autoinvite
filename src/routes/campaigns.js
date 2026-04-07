const express = require('express');
const path = require('path');
const db = require('../database/pg-client');
const { isAuthenticated } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { quotaGuard } = require('../middleware/quotaGuard');
const { upload } = require('../middleware/uploadStorage');
const { WhatsAppManager, loadContacts, processBatch } = require('../core');
const fs = require('fs');

const router = express.Router();

// Create Campaign — quota guard applies (uploading contacts is a pre-launch step)
router.post('/', isAuthenticated, tenantScope, quotaGuard, upload.fields([{ name: 'template' }, { name: 'contacts' }, { name: 'voicenote' }]), async (req, res) => {
    try {
        const { name, message_templates, canvas_config, scheduled_at } = req.body;
        const templatePath = req.files['template'] ? req.files['template'][0].path : null;
        const contactsPath = req.files['contacts'] ? req.files['contacts'][0].path : null;
        const voicenotePath = req.files['voicenote'] ? req.files['voicenote'][0].path : null;

        if (!name || !message_templates || !contactsPath) {
            return res.status(400).json({ success: false, message: 'Name, Messages, and Contact File are required' });
        }

        const isScheduled = scheduled_at && scheduled_at.trim() !== '';
        const status = isScheduled ? 'scheduled' : 'active';

        const result = await db.query(`
            INSERT INTO campaigns (tenant_id, name, template_path, contacts_path, message_templates, canvas_config, voicenote_path, status, scheduled_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        `, [req.tenantId, name, templatePath, contactsPath, message_templates, canvas_config || '{}', voicenotePath, status, isScheduled ? scheduled_at : null]);

        const campaignId = result.rows[0].id;

        // Parse uploaded contacts file and insert each contact into the contacts table
        try {
            const contactList = await loadContacts(contactsPath);
            if (contactList && contactList.length > 0) {
                const { normalizePhone } = require('../utils/dataProcessor');
                for (const c of contactList) {
                    const rawName = c.Name || c['الإسم'] || c['name'] || '';
                    const rawPhone = c.Phone || c['رقم الجوال'] || c['phone'] || '';
                    const phone = normalizePhone(rawPhone);
                    if (!phone) continue;
                    await db.query(
                        'INSERT INTO contacts (tenant_id, campaign_id, name, phone, status) VALUES ($1, $2, $3, $4, $5)',
                        [req.tenantId, campaignId, rawName, phone, 'pending']
                    ).catch(err => console.error('[Contacts] Failed to insert contact:', err.message));
                }
            console.log(`[Contacts] Imported ${contactList.length} contacts for campaign ${campaignId}`);
            }
        } catch (contactErr) {
            console.error('[Contacts] Failed to import contacts:', contactErr.message);
        }

        res.json({ success: true, campaignId });
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
router.put('/:id', isAuthenticated, tenantScope, upload.fields([{ name: 'template' }, { name: 'contacts' }, { name: 'voicenote' }]), async (req, res) => {
    try {
        const { name, message_templates, canvas_config, scheduled_at } = req.body;
        const templatePath = req.files['template'] ? req.files['template'][0].path : null;
        const contactsPath = req.files['contacts'] ? req.files['contacts'][0].path : null;
        const voicenotePath = req.files['voicenote'] ? req.files['voicenote'][0].path : null;

        const isScheduled = scheduled_at && scheduled_at.trim() !== '';
        const status = isScheduled ? 'scheduled' : 'active';

        let query = 'UPDATE campaigns SET name = $1, message_templates = $2, canvas_config = $3, status = $4';
        const params = [name, message_templates, canvas_config, status];

        if (templatePath) {
            params.push(templatePath);
            query += `, template_path = $${params.length}`;
        }
        if (contactsPath) {
            params.push(contactsPath);
            query += `, contacts_path = $${params.length}`;
        }
        if (voicenotePath) {
            params.push(voicenotePath);
            query += `, voicenote_path = $${params.length}`;
        }

        params.push(isScheduled ? scheduled_at : null);
        query += `, scheduled_at = $${params.length}`;

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

// Get Campaign Stats — returns real failed_count from DB
router.get('/:id/stats', isAuthenticated, tenantScope, async (req, res) => {
    try {
        const campaignId = req.params.id;
        const tenantId = req.tenantId;

        const campRes = await db.query('SELECT status, contacts_path, failed_count FROM campaigns WHERE id = $1 AND tenant_id = $2', [campaignId, tenantId]);
        if (campRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Campaign not found' });

        const campaign = campRes.rows[0];

        let totalContacts = 0;
        try {
            const contacts = await loadContacts(campaign.contacts_path);
            totalContacts = contacts.length;
        } catch (e) { console.error('Error loading contacts for stats:', e.message); }

        const sentRes = await db.query(
            'SELECT COUNT(*) FROM sent_logs WHERE campaign_id = $1 AND tenant_id = $2 AND (status IS NULL OR status = $3)',
            [campaignId, tenantId, 'success']
        );
        const sentCount = parseInt(sentRes.rows[0].count);
        const failedCount = parseInt(campaign.failed_count || 0);

        res.json({
            success: true,
            stats: {
                total_contacts: totalContacts,
                sent_count: sentCount,
                failed_count: failedCount,
                pending_count: Math.max(0, totalContacts - sentCount - failedCount),
                status: campaign.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
});

module.exports = router;
