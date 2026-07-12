const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const db = require('../database/pg-client');
const { loadContacts, processContacts } = require('../utils/dataProcessor');
const { normalizeMessageTemplates, pickWeightedMessage } = require('../utils/messageTemplates');
const { buildCampaignPlan, normalizeSmartScheduleOptions } = require('../utils/smartScheduler');
const config = require('../config/settings');

const SCHEDULE_FIELDS = [
    'schedule_mode', 'scheduled_at', 'daily_limit', 'send_window_start', 'send_window_end', 'timezone',
    'min_delay_seconds', 'max_delay_seconds', 'break_after_messages',
    'break_min_minutes', 'break_max_minutes', 'safety_mode',
];

function stableJson(record) {
    if (Array.isArray(record)) return `[${record.map(stableJson).join(',')}]`;
    if (record && typeof record === 'object') {
        const entries = Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(record);
}

function campaignSchedule(campaign) {
    return Object.fromEntries(SCHEDULE_FIELDS.map(field => [field, campaign[field]]));
}

async function fileDigest(filePath) {
    if (!filePath) return null;
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, '../../', filePath);
    const contents = await fs.readFile(absolutePath);
    return crypto.createHash('sha256').update(contents).digest('hex');
}

class CampaignPreflightService {
    constructor(dependencies = {}) {
        this.database = dependencies.database || db;
        this.contactsLoader = dependencies.contactsLoader || loadContacts;
        this.imageValidator = dependencies.imageValidator || null;
        this.fileDigester = dependencies.fileDigester || fileDigest;
    }

    async campaignForTenant(tenantId, campaignId) {
        const campaignQuery = await this.database.query(
            'SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2',
            [campaignId, tenantId]
        );
        return campaignQuery.rows[0] || null;
    }

    async sentPhones(tenantId, campaignId, phones) {
        if (phones.length === 0) return new Set();
        const sentQuery = await this.database.query(`
            SELECT DISTINCT phone FROM sent_logs
            WHERE tenant_id = $1 AND campaign_id = $2 AND phone = ANY($3::TEXT[])
              AND (status IS NULL OR status = 'success')
        `, [tenantId, campaignId, phones]);
        return new Set(sentQuery.rows.map(row => row.phone));
    }

    async recipientAnalysis(tenantId, campaignId, contactsPath) {
        const sourceContacts = await this.contactsLoader(contactsPath);
        const processedContacts = processContacts(sourceContacts);
        const validRecipients = processedContacts.valid.map((contact, index) => ({
            ...contact,
            sourceRow: index + 1,
        }));
        const phones = validRecipients.map(contact => contact.phone);
        const sentPhones = await this.sentPhones(tenantId, campaignId, phones);
        return {
            sourceCount: sourceContacts.length,
            valid: validRecipients,
            invalid: processedContacts.invalid,
            duplicates: processedContacts.duplicates,
            sentPreviously: validRecipients.filter(contact => sentPhones.has(contact.phone)),
            remaining: validRecipients.filter(contact => !sentPhones.has(contact.phone)),
        };
    }

    async previews(campaign, recipients, messages) {
        const imageValidator = this.imageValidator || require('../utils/generator').validateImageGeneration;
        return Promise.all(recipients.slice(0, 3).map(async (recipient, index) => ({
            phone: recipient.phone,
            finalName: recipient.name,
            text: pickWeightedMessage(messages, recipient.name, index),
            image: await imageValidator(recipient.name, campaign.template_path, campaign.canvas_config),
        })));
    }

    async planHash(campaign, messages) {
        const hashInput = {
            contacts: await this.fileDigester(campaign.contacts_path),
            template: await this.fileDigester(campaign.template_path || config.image.templatePath),
            messages,
            schedule: campaignSchedule(campaign),
        };
        return crypto.createHash('sha256').update(stableJson(hashInput)).digest('hex');
    }

    async inspect(tenantId, campaignId, now = new Date()) {
        const campaign = await this.campaignForTenant(tenantId, campaignId);
        if (!campaign) return null;
        const messages = normalizeMessageTemplates(campaign.message_templates);
        const recipients = await this.recipientAnalysis(tenantId, campaignId, campaign.contacts_path);
        const options = normalizeSmartScheduleOptions(campaign);
        const scheduleInput = { ...options, schedule_mode: campaign.schedule_mode };
        return {
            counts: this.recipientCounts(recipients),
            valid: recipients.valid,
            invalid: recipients.invalid,
            duplicates: recipients.duplicates,
            sentPreviously: recipients.sentPreviously,
            remaining: recipients.remaining,
            previews: await this.previews(campaign, recipients.remaining, messages),
            plan: buildCampaignPlan(recipients.remaining.length, scheduleInput, now),
            planHash: await this.planHash(campaign, messages),
        };
    }

    recipientCounts(recipients) {
        return {
            source: recipients.sourceCount,
            valid: recipients.valid.length,
            invalid: recipients.invalid.length,
            duplicate: recipients.duplicates.length,
            sentPreviously: recipients.sentPreviously.length,
            remaining: recipients.remaining.length,
        };
    }

    async approve(tenantId, campaignId, expectedHash) {
        const preflight = await this.inspect(tenantId, campaignId);
        if (!preflight) return { status: 'not_found' };
        if (preflight.planHash !== expectedHash) return { status: 'changed', preflight };
        await this.database.query(`
            UPDATE campaigns SET plan_hash = $1, plan_approved_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND tenant_id = $3
        `, [expectedHash, campaignId, tenantId]);
        return { status: 'approved', planHash: expectedHash, preflight };
    }

    async verifyApproval(tenantId, campaignId) {
        const campaign = await this.campaignForTenant(tenantId, campaignId);
        if (!campaign || !campaign.plan_hash || !campaign.plan_approved_at) return false;
        const messages = normalizeMessageTemplates(campaign.message_templates);
        return campaign.plan_hash === await this.planHash(campaign, messages);
    }
}

module.exports = { CampaignPreflightService, stableJson };
