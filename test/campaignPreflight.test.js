const test = require('node:test');
const assert = require('node:assert/strict');

const { CampaignPreflightService } = require('../src/services/CampaignPreflightService');
const { buildCampaignPlan } = require('../src/utils/smartScheduler');
const { ensureCampaignPreflightSchema } = require('../src/database/ensure_campaign_preflight_schema');

function largeContactFile() {
    const unique = Array.from({ length: 670 }, (_, index) => ({
        Name: `Guest ${index + 1}`,
        Phone: `010${String(index).padStart(8, '0')}`,
    }));
    const duplicates = unique.slice(0, 5).map(contact => ({ ...contact }));
    const invalid = Array.from({ length: 9 }, (_, index) => ({ Name: `Invalid ${index}`, Phone: 'invalid' }));
    return [...unique, ...duplicates, ...invalid];
}

function campaignRecord(overrides = {}) {
    return {
        id: 'campaign-1',
        tenant_id: 'tenant-1',
        contacts_path: 'contacts.csv',
        template_path: 'template.png',
        message_templates: [{ text: 'Hello {{name}}', weight: 1 }],
        canvas_config: { x: 100, y: 100, fontSize: 40 },
        schedule_mode: 'fixed',
        daily_limit: 100,
        send_window_start: '09:00',
        send_window_end: '21:00',
        timezone: 'Africa/Cairo',
        min_delay_seconds: 30,
        max_delay_seconds: 30,
        break_after_messages: 100,
        break_min_minutes: 1,
        break_max_minutes: 1,
        safety_mode: 'balanced',
        scheduled_at: null,
        ...overrides,
    };
}

function preflightDatabase(campaign, sentPhones = []) {
    const queries = [];
    return {
        queries,
        async query(sql, params) {
            queries.push({ sql: String(sql), params });
            if (String(sql).includes('SELECT * FROM campaigns')) {
                return { rows: params[0] === campaign.id && params[1] === campaign.tenant_id ? [campaign] : [] };
            }
            if (String(sql).includes('SELECT DISTINCT phone')) {
                return { rows: sentPhones.map(phone => ({ phone })) };
            }
            return { rowCount: 1, rows: [] };
        },
    };
}

function preflightService(database, campaign) {
    return new CampaignPreflightService({
        database,
        contactsLoader: async () => largeContactFile(),
        imageValidator: async name => ({ possible: true, bytes: name.length + 100 }),
        fileDigester: async filePath => `digest:${filePath}`,
    });
}

test('preflight classifies a 684-row file and previews three unsent recipients', async () => {
    const campaign = campaignRecord();
    const sentPhones = Array.from({ length: 20 }, (_, index) => `2010${String(index).padStart(8, '0')}`);
    const database = preflightDatabase(campaign, sentPhones);
    const preflight = await preflightService(database, campaign).inspect(
        'tenant-1',
        'campaign-1',
        new Date('2026-07-12T06:00:00.000Z')
    );

    assert.deepEqual(preflight.counts, {
        source: 684,
        valid: 670,
        invalid: 9,
        duplicate: 5,
        sentPreviously: 20,
        remaining: 650,
    });
    assert.equal(preflight.previews.length, 3);
    assert.equal(preflight.valid.length, 670);
    assert.equal(preflight.remaining.length, 650);
    assert.equal(preflight.previews.every(preview => preview.image.possible), true);
    assert.match(preflight.previews[0].text, /^Hello Guest /);
    assert.equal(preflight.plan.reduce((sum, day) => sum + day.messageCount, 0), 650);
    assert.deepEqual(preflight.remaining.slice(0, 2).map(recipient => recipient.sourceRow), [21, 22]);
    const sentLookup = database.queries.find(query => query.sql.includes('SELECT DISTINCT phone'));
    assert.deepEqual(sentLookup.params.slice(0, 2), ['tenant-1', 'campaign-1']);
});

test('fixed batches preserve the selected count while the send window has capacity', () => {
    const plan = buildCampaignPlan(684, campaignRecord(), new Date('2026-07-12T06:00:00.000Z'));

    assert.deepEqual(plan.map(day => day.messageCount), [100, 100, 100, 100, 100, 100, 84]);
    assert.equal(plan.slice(0, -1).every(day => day.reductionReason === null), true);
    assert.equal(plan.at(-1).reductionReason, 'remaining_contacts');
    assert.equal(plan.every(day => day.timezone === 'Africa/Cairo' && day.scheduledLocal), true);
});

test('smart schedule explains window and safety reductions with exact daily counts', () => {
    const plan = buildCampaignPlan(220, {
        ...campaignRecord(),
        schedule_mode: 'smart',
        daily_limit: 150,
        send_window_start: '10:00',
        send_window_end: '11:00',
        min_delay_seconds: 120,
        max_delay_seconds: 120,
        break_after_messages: 100,
    }, new Date('2026-07-12T06:00:00.000Z'));

    assert.equal(plan.every(day => day.messageCount > 0), true);
    assert.equal(plan.every(day => day.reductionReason === 'send_window_capacity'), true);
    assert.equal(plan.reduce((sum, day) => sum + day.messageCount, 0), 220);
    assert.match(plan[0].scheduledLocal, /^\d{4}-\d{2}-\d{2},/);
});

test('approval rejects a changed hash and persists matching approval with tenant scope', async () => {
    const campaign = campaignRecord();
    const database = preflightDatabase(campaign);
    const service = preflightService(database, campaign);
    const inspected = await service.inspect('tenant-1', 'campaign-1');

    assert.equal((await service.approve('tenant-1', 'campaign-1', 'stale-hash')).status, 'changed');
    const approval = await service.approve('tenant-1', 'campaign-1', inspected.planHash);
    const approvalQuery = database.queries.find(query => query.sql.includes('UPDATE campaigns SET plan_hash'));

    assert.equal(approval.status, 'approved');
    assert.deepEqual(approvalQuery.params, [inspected.planHash, 'campaign-1', 'tenant-1']);
    assert.equal(database.queries.some(query => /scheduleBatch|scheduleCampaign|processBatch/.test(query.sql)), false);
    assert.equal(await service.inspect('tenant-2', 'campaign-1'), null);
});

test('plan hash changes when approved message content changes', async () => {
    const campaign = campaignRecord();
    const database = preflightDatabase(campaign);
    const service = preflightService(database, campaign);
    const originalHash = (await service.inspect('tenant-1', 'campaign-1')).planHash;

    campaign.message_templates = [{ text: 'Changed {{name}}', weight: 1 }];
    const changedHash = (await service.inspect('tenant-1', 'campaign-1')).planHash;

    assert.notEqual(changedHash, originalHash);
});

test('campaign start approval is valid only while the persisted plan hash still matches', async () => {
    const campaign = campaignRecord({ plan_approved_at: new Date() });
    const database = preflightDatabase(campaign);
    const service = preflightService(database, campaign);
    campaign.plan_hash = await service.planHash(campaign, campaign.message_templates);

    assert.equal(await service.verifyApproval('tenant-1', 'campaign-1'), true);
    campaign.message_templates = [{ text: 'Changed after approval {{name}}', weight: 1 }];
    assert.equal(await service.verifyApproval('tenant-1', 'campaign-1'), false);
});

test('preflight approval schema can be applied repeatedly', async () => {
    const statements = [];
    const database = { query: async sql => statements.push(String(sql)) };

    await ensureCampaignPreflightSchema(database);
    await ensureCampaignPreflightSchema(database);

    assert.equal(statements.length, 4);
    assert.equal(statements.every(sql => /ADD COLUMN IF NOT EXISTS/i.test(sql)), true);
});
