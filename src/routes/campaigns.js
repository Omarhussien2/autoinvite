const express = require('express');
const db = require('../database/pg-client');
const { isAuthenticated } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { quotaGuard } = require('../middleware/quotaGuard');
const { upload } = require('../middleware/uploadStorage');
const { loadContacts } = require('../core');
const ScheduleManager = require('../core/ScheduleManager');
const { ensureSmartScheduleSchema } = require('../database/ensure_smart_schedule_schema');
const { normalizeMessageTemplates } = require('../utils/messageTemplates');
const { buildSmartBatches, normalizeSmartScheduleOptions } = require('../utils/smartScheduler');
const { createLogger } = require('../utils/logger');
const { importContacts, getTenantSchedulingPolicy, parseScheduleBody } = require('../services/campaign.service');
const log = createLogger('Campaigns');

const router = express.Router();
const campaignUpload = upload.fields([{ name: 'template' }, { name: 'contacts' }, { name: 'voicenote' }]);

function handleCampaignUpload(req, res, next) {
    campaignUpload(req, res, (err) => {
        if (!err) return next();

        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'حجم الملف كبير. الحد الأقصى الحالي 32MB لكل ملف.'
            : (err.message || 'فشل رفع الملف');

        log.error('Upload failed:', message);
        return res.status(400).json({ success: false, message });
    });
}

async function createSmartCampaignBatches(tenantId, campaignId, contactsCount, options) {
    await ensureSmartScheduleSchema();
    await db.query('DELETE FROM campaign_batches WHERE tenant_id = $1 AND campaign_id = $2', [tenantId, campaignId]);
    const batches = buildSmartBatches(contactsCount, options);

    for (const batch of batches) {
        const result = await db.query(
            `INSERT INTO campaign_batches (
                tenant_id, campaign_id, batch_number, start_row, end_row, scheduled_at,
                send_window_start, send_window_end, timezone, daily_limit,
                min_delay_seconds, max_delay_seconds, break_after_messages,
                break_min_minutes, break_max_minutes, safety_mode, status
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'scheduled')
             RETURNING id`,
            [
                tenantId,
                campaignId,
                batch.batchNumber,
                batch.startRow,
                batch.endRow,
                batch.scheduledAt.toISOString(),
                batch.sendWindowStart,
                batch.sendWindowEnd,
                batch.timezone,
                batch.dailyLimit,
                batch.minDelaySeconds,
                batch.maxDelaySeconds,
                batch.breakAfterMessages,
                batch.breakMinMinutes,
                batch.breakMaxMinutes,
                batch.safetyMode,
            ]
        );

        await ScheduleManager.scheduleBatch(result.rows[0].id, campaignId, tenantId, {
            scheduledAt: batch.scheduledAt,
            allowPast: true,
        });
    }

    return batches;
}

// Create Campaign - quota guard applies (uploading contacts is a pre-launch step)
router.post('/', isAuthenticated, tenantScope, quotaGuard, handleCampaignUpload, async (req, res) => {
    try {
        await ensureSmartScheduleSchema();

        const { name, message_templates, canvas_config } = req.body;
        const files = req.files || {};
        const templatePath = files.template ? files.template[0].path : null;
        const contactsPath = files.contacts ? files.contacts[0].path : null;
        const voicenotePath = files.voicenote ? files.voicenote[0].path : null;

        const normalizedMessages = normalizeMessageTemplates(message_templates);
        const smartOptions = normalizeSmartScheduleOptions(req.body, await getTenantSchedulingPolicy(req.tenantId));
        const isSmartSchedule = smartOptions.enabled;

        if (!name || normalizedMessages.length === 0 || !contactsPath) {
            return res.status(400).json({ success: false, message: 'Name, messages, and contact file are required' });
        }

        const contactList = await loadContacts(contactsPath);
        if (!contactList || contactList.length === 0) {
            return res.status(400).json({ success: false, message: 'Contacts file is empty or invalid' });
        }

        const scheduleBody = isSmartSchedule
            ? { isScheduled: true, scheduledAt: null, timezone: smartOptions.timezone }
            : parseScheduleBody(req.body);
        const status = scheduleBody.isScheduled ? 'scheduled' : 'active';

        const result = await db.query(`
            INSERT INTO campaigns (
                tenant_id, name, template_path, contacts_path, message_templates,
                canvas_config, voicenote_path, status, scheduled_at, timezone,
                smart_schedule_enabled, schedule_mode, daily_limit,
                send_window_start, send_window_end, min_delay_seconds, max_delay_seconds,
                break_after_messages, break_min_minutes, break_max_minutes, safety_mode
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING id
        `, [
            req.tenantId,
            name,
            templatePath,
            contactsPath,
            JSON.stringify(normalizedMessages),
            canvas_config || '{}',
            voicenotePath,
            status,
            scheduleBody.scheduledAt ? scheduleBody.scheduledAt.toISOString() : null,
            scheduleBody.timezone || smartOptions.timezone,
            isSmartSchedule,
            isSmartSchedule ? 'smart' : (scheduleBody.isScheduled ? 'later' : 'immediate'),
            smartOptions.dailyLimit,
            smartOptions.sendWindowStart,
            smartOptions.sendWindowEnd,
            smartOptions.minDelaySeconds,
            smartOptions.maxDelaySeconds,
            smartOptions.breakAfterMessages,
            smartOptions.breakMinMinutes,
            smartOptions.breakMaxMinutes,
            smartOptions.safetyMode,
        ]);

        const campaignId = result.rows[0].id;
        await importContacts(req.tenantId, campaignId, contactsPath);

        if (isSmartSchedule) {
            await createSmartCampaignBatches(req.tenantId, campaignId, contactList.length, smartOptions);
        } else if (scheduleBody.isScheduled) {
            await ScheduleManager.scheduleCampaign(campaignId, req.tenantId, {
                scheduledAt: scheduleBody.scheduledAt,
                timezone: scheduleBody.timezone,
            });
        }

        res.json({ success: true, campaignId });
    } catch (error) {
        log.error('Create failed:', error.message);
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
router.put('/:id', isAuthenticated, tenantScope, handleCampaignUpload, async (req, res) => {
    try {
        await ensureSmartScheduleSchema();

        const { name, message_templates, canvas_config } = req.body;
        const files = req.files || {};
        const templatePath = files.template ? files.template[0].path : null;
        const contactsPath = files.contacts ? files.contacts[0].path : null;
        const voicenotePath = files.voicenote ? files.voicenote[0].path : null;

        const normalizedMessages = normalizeMessageTemplates(message_templates);
        const smartOptions = normalizeSmartScheduleOptions(req.body, await getTenantSchedulingPolicy(req.tenantId));
        const isSmartSchedule = smartOptions.enabled;

        if (!name || normalizedMessages.length === 0) {
            return res.status(400).json({ success: false, message: 'Name and messages are required' });
        }

        const existingRes = await db.query(
            'SELECT schedule_job_id, contacts_path FROM campaigns WHERE id = $1 AND tenant_id = $2',
            [req.params.id, req.tenantId]
        );
        const existing = existingRes.rows[0];
        if (!existing) return res.status(404).json({ success: false, message: 'Campaign not found' });

        const scheduleBody = isSmartSchedule
            ? { isScheduled: true, scheduledAt: null, timezone: smartOptions.timezone }
            : parseScheduleBody(req.body);
        const status = scheduleBody.isScheduled ? 'scheduled' : 'active';

        await ScheduleManager.cancelCampaign(req.params.id, req.tenantId, existing.schedule_job_id);

        let query = `
            UPDATE campaigns
            SET name = $1,
                message_templates = $2,
                canvas_config = $3,
                status = $4,
                timezone = $5,
                smart_schedule_enabled = $6,
                schedule_mode = $7,
                daily_limit = $8,
                send_window_start = $9,
                send_window_end = $10,
                min_delay_seconds = $11,
                max_delay_seconds = $12,
                break_after_messages = $13,
                break_min_minutes = $14,
                break_max_minutes = $15,
                safety_mode = $16
        `;
        const params = [
            name,
            JSON.stringify(normalizedMessages),
            canvas_config || '{}',
            status,
            scheduleBody.timezone || smartOptions.timezone,
            isSmartSchedule,
            isSmartSchedule ? 'smart' : (scheduleBody.isScheduled ? 'later' : 'immediate'),
            smartOptions.dailyLimit,
            smartOptions.sendWindowStart,
            smartOptions.sendWindowEnd,
            smartOptions.minDelaySeconds,
            smartOptions.maxDelaySeconds,
            smartOptions.breakAfterMessages,
            smartOptions.breakMinMinutes,
            smartOptions.breakMaxMinutes,
            smartOptions.safetyMode,
        ];

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

        params.push(scheduleBody.scheduledAt ? scheduleBody.scheduledAt.toISOString() : null);
        query += `, scheduled_at = $${params.length}`;
        query += ', schedule_job_id = NULL, schedule_attempts = 0, schedule_last_error = NULL, schedule_last_attempt_at = NULL';

        params.push(req.params.id, req.tenantId);
        query += ` WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`;

        await db.query(query, params);

        if (contactsPath) {
            await db.query('DELETE FROM contacts WHERE tenant_id = $1 AND campaign_id = $2', [req.tenantId, req.params.id]);
            await importContacts(req.tenantId, req.params.id, contactsPath);
        }

        if (isSmartSchedule) {
            const effectiveContactsPath = contactsPath || existing.contacts_path;
            const contactList = await loadContacts(effectiveContactsPath);
            await createSmartCampaignBatches(req.tenantId, req.params.id, contactList.length, smartOptions);
        } else if (scheduleBody.isScheduled) {
            await ScheduleManager.scheduleCampaign(req.params.id, req.tenantId, {
                scheduledAt: scheduleBody.scheduledAt,
                timezone: scheduleBody.timezone,
            });
        }

        res.json({ success: true });
    } catch (error) {
        log.error('Update failed:', error.message);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Internal server error',
        });
    }
});

// Delete Campaign
router.delete('/:id', isAuthenticated, tenantScope, async (req, res) => {
    try {
        await ensureSmartScheduleSchema();

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
            const dataProcessor = require('../utils/dataProcessor');
            const contacts = await dataProcessor.processContacts(campaign.contacts_path, tenantId, campaignId);
            totalContacts = contacts.valid.length;
        } catch (e) {
            log.error('Error loading contacts for stats:', e.message);
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
