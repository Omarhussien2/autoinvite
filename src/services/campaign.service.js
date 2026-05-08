const db = require('../database/pg-client');
const { loadContacts } = require('../core');
const { normalizePhone } = require('../utils/dataProcessor');
const { getDefaultTimezone, parseScheduledAtFromBody } = require('../utils/scheduleTime');
const { createLogger } = require('../utils/logger');
const log = createLogger('campaign.service');

async function importContacts(tenantId, campaignId, contactsPath) {
    try {
        const contactList = await loadContacts(contactsPath);
        if (contactList && contactList.length > 0) {
            for (const c of contactList) {
                const rawName = c.Name || c['الإسم'] || c.name || '';
                const rawPhone = c.Phone || c['رقم الجوال'] || c.phone || '';
                const phone = normalizePhone(rawPhone);
                if (!phone) continue;

                await db.query(
                    'INSERT INTO contacts (tenant_id, campaign_id, name, phone, status) VALUES ($1, $2, $3, $4, $5)',
                    [tenantId, campaignId, rawName, phone, 'pending']
                ).catch(err => log.error('Failed to insert contact:', err.message));
            }
            log.info(`Imported ${contactList.length} contacts for campaign ${campaignId}`);
        }
    } catch (contactErr) {
        log.error('Failed to import contacts:', contactErr.message);
    }
}

async function getTenantSchedulingPolicy(tenantId) {
    let tenant = {};
    try {
        const result = await db.query('SELECT max_daily_limit FROM tenants WHERE id = $1', [tenantId]);
        tenant = result.rows[0] || {};
    } catch (err) {
        if (err.code !== '42703') throw err;
        log.warn('max_daily_limit column missing; falling back to 200 until schema is updated.');
    }

    return {
        maxDailyLimit: tenant.max_daily_limit || 200,
        timezone: getDefaultTimezone(),
    };
}

function parseScheduleBody(body, now = new Date()) {
    const parsed = parseScheduledAtFromBody(body);
    if (!parsed.isScheduled) return parsed;

    if (parsed.scheduledAt.getTime() <= now.getTime()) {
        const err = new Error('Scheduled time must be in the future');
        err.statusCode = 400;
        throw err;
    }

    return parsed;
}

module.exports = {
    importContacts,
    getTenantSchedulingPolicy,
    parseScheduleBody,
};
