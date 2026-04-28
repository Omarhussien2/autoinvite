const express = require('express');
const db = require('../database/pg-client');
const { isAuthenticated } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { quotaGuard } = require('../middleware/quotaGuard');
const { upload } = require('../middleware/uploadStorage');
const { loadContacts } = require('../core');
const ScheduleManager = require('../core/ScheduleManager');

const router = express.Router();

function parseScheduleBody(body) {
    const scheduledRaw = body.scheduled_at;
    const isScheduled = scheduledRaw && scheduledRaw.trim() !== '';
    if (!isScheduled) {
        return { isScheduled: false, scheduledAt: null, timezone: null };
    }

    const scheduledAt = new Date(scheduledRaw);
    if (Number.isNaN(scheduledAt.getTime())) {
        const err = new Error('Invalid scheduled time');
        err.statusCode = 400;
        throw err;
    }

    if (scheduledAt.getTime() <= Date.now()) {
        const err = new Error('Scheduled time must be in the future');
        err.statusCode = 400;
        throw err;
    }

    return {
        isScheduled: true,
        scheduledAt,
        timezone: body.timezone || 'Asia/Riyadh',
    };
}

async function importContacts(tenantId, campaignId, contactsPath) {
    try {
        const contactList = await loadContacts(contactsPath);
        if (contactList && contactList.length > 0) {
            const { normalizePhone } = require('../utils/dataProcessor');
            for (const c of contactList) {
                const rawName = c.Name || c['Ø§Ù„Ø¥Ø³Ù…'] || c.name || '';
                const rawPhone = c.Phone || c['Ø±Ù‚Ù… Ø§Ù„Ø¬ÙˆØ§Ù„'] || c.phone || '';
                const phone = normalizePhone(rawPhone);
                if (!phone) continue;

                await db.query(
                    'INSERT INTO contacts (tenant_id, campaign_id, name, phone, status) VALUES ($1, $2, $3, $4, $5)',
                    [tenantId, campaignId, rawName, phone, 'pending']
                ).catch(err => console.error('[Contacts] Failed to insert contact:', err.message));
            }
            console.log(`[Contacts] Imported ${contactList.length} contacts for campaign ${campaignId}`);
        }
    } catch (contactErr) {
        console.error('[Contacts] Failed to import contacts:', contactErr.message);
    }
}

// Create Campaign - quota guard applies (uploading contacts is a pre-launch step)
router.post('/', isAuthenticated, tenantScope, quotaGuard, upload.fields([{ name: 'template' }, { name: 'contacts' }, { name: 'voicenote' }]), async (req, res) => {
    try {
        const { name, message_templates, canvas_config } = req.body;
        const files = req.files || {};
        const templatePath = files.template ? files.template[0].path : null;
        const contactsPath = files.contacts ? files.contacts[0].path : null;
        const voicenotePath = files.voicenote ? files.voicenote[0].path : null;

        if (!name || !message_templates || !contactsPath) {
            return res.status(400).json({ success: false, message: 'Name, messages, and contact file are required' });
        }

        const { isScheduled, scheduledAt, timezone } = parseScheduleBody(req.body);
        const status = isScheduled ? 'scheduled' : 'active';

        const result = await db.query(`
            INSERT INTO campaigns (
                tenant_id, name, template_path, contacts_path, message_templates,
                canvas_config, voicenote_path, status, scheduled_at, timezone
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            req.tenantId,
            name,
            templatePath,
            contactsPath,
            message_templates,
            canvas_config || '{}',
            voicenotePath,
            status,
            isScheduled ? scheduledAt.toISOString() : null,
            timezone || 'Asia/Riyadh',
        ]);

        const campaignId = result.rows[0].id;
        await importContacts(req.tenantId, campaignId, contactsPath);

        if (isScheduled) {
            await ScheduleManager.scheduleCampaign(campaignId, req.tenantId, {
                scheduledAt,
                timezone,
            });
        }

        res.json({ success: true, campaignId });
    } catch (error) {
        console.error('[Campaigns] Create failed:', error.message);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Internal server error',
        });
    }
});

// List Campaigns
router.get('/', isAuthenticated, tenantScope, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC', [req.tenantId]);
        res.json({ success: true, campaigns: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error' });
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
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Update Campaign (Edit)
router.put('/:id', isAuthenticated, tenantScope, upload.fields([{ name: 'template' }, { name: 'contacts' }, { name: 'voicenote' }]), async (req, res) => {
    try {
        const { name, message_templates, canvas_config } = req.body;
        const files = req.files || {};
        const templatePath = files.template ? files.template[0].path : null;
        const contactsPath = files.contacts ? files.contacts[0].path : null;
        const voicenotePath = files.voicenote ? files.voicenote[0].path : null;

        const existingRes = await db.query(
            'SELECT schedule_job_id FROM campaigns WHERE id = $1 AND tenant_id = $2',
            [req.params.id, req.tenantId]
        );
        const existing = existingRes.rows[0];
        if (!existing) return res.status(404).json({ success: false, message: 'Campaign not found' });

        const { isScheduled, scheduledAt, timezone } = parseScheduleBody(req.body);
        const status = isScheduled ? 'scheduled' : 'active';

        await ScheduleManager.cancelCampaign(req.params.id, req.tenantId, existing.schedule_job_id);

        let query = `
            UPDATE campaigns
            SET name = $1,
                message_templates = $2,
                canvas_config = $3,
                status = $4,
                timezone = $5
        `;
        const params = [name, message_templates, canvas_config || '{}', status, timezone || 'Asia/Riyadh'];

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

        params.push(isScheduled ? scheduledAt.toISOString() : null);
        query += `, scheduled_at = $${params.length}`;
        query += ', schedule_job_id = NULL, schedule_attempts = 0, schedule_last_error = NULL, schedule_last_attempt_at = NULL';

        params.push(req.params.id, req.tenantId);
        query += ` WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`;

        await db.query(query, params);

        if (contactsPath) {
            await db.query('DELETE FROM contacts WHERE tenant_id = $1 AND campaign_id = $2', [req.tenantId, req.params.id]);
            await importContacts(req.tenantId, req.params.id, contactsPath);
        }

        if (isScheduled) {
            await ScheduleManager.scheduleCampaign(req.params.id, req.tenantId, {
                scheduledAt,
                timezone,
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Campaigns] Update failed:', error.message);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Internal server error',
        });
    }
});

// Delete Campaign
router.delete('/:id', isAuthenticated, tenantScope, async (req, res) => {
    try {
        const existingRes = await db.query(
            'SELECT schedule_job_id FROM campaigns WHERE id = $1 AND tenant_id = $2',
            [req.params.id, req.tenantId]
        );
        const existing = existingRes.rows[0];
        if (existing) {
            await ScheduleManager.cancelCampaign(req.params.id, req.tenantId, existing.schedule_job_id);
        }

        await db.query('DELETE FROM campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get Campaign Stats - returns real failed_count from DB
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
        } catch (e) {
            console.error('Error loading contacts for stats:', e.message);
        }

        const sentRes = await db.query(
            'SELECT COUNT(*) FROM sent_logs WHERE campaign_id = $1 AND tenant_id = $2 AND (status IS NULL OR status = $3)',
            [campaignId, tenantId, 'success']
        );
        const sentCount = parseInt(sentRes.rows[0].count, 10);
        const failedCount = parseInt(campaign.failed_count || 0, 10);

        res.json({
            success: true,
            stats: {
                total_contacts: totalContacts,
                sent_count: sentCount,
                failed_count: failedCount,
                pending_count: Math.max(0, totalContacts - sentCount - failedCount),
                status: campaign.status,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
