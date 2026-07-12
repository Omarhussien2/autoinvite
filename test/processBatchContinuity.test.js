const test = require('node:test');
const assert = require('node:assert/strict');

function continuityHarness(initialRecipients, options = {}) {
    const recipients = new Map(initialRecipients.map(recipient => [
        `${recipient.tenantId}:${recipient.campaignId}:${recipient.phone}`,
        { ...recipient },
    ]));
    const sentPhones = [];
    const campaignUpdates = [];

    function recipientKey(tenantId, campaignId, phone) {
        return `${tenantId}:${campaignId}:${phone}`;
    }

    async function query(sql, params = []) {
        const statement = String(sql);
        if (statement.includes('SELECT tenant.messaging_enabled')) {
            const gateKey = `${params[1]}:${params[0]}`;
            return { rows: [{
                messaging_enabled: options.disabledGate !== gateKey,
                stop_requested_at: options.stoppedGate === gateKey ? new Date() : null,
            }] };
        }
        if (statement.includes('UPDATE campaign_recipients recipient') && statement.includes('RETURNING recipient.*')) {
            const recipient = recipients.get(recipientKey(params[0], params[1], params[2]));
            const retryFailed = statement.includes("('pending', 'failed')");
            if (!recipient || (recipient.status !== 'pending' && !(retryFailed && recipient.status === 'failed'))) {
                return { rows: [] };
            }
            recipient.status = 'sending';
            recipient.attempt_count = (recipient.attempt_count || 0) + 1;
            return { rows: [{ ...recipient, source_row: recipient.sourceRow }] };
        }
        if (statement.includes('SET status = $4')) {
            const recipient = recipients.get(recipientKey(params[0], params[1], params[2]));
            if (recipient && recipient.status === 'sending') recipient.status = params[3];
            return { rows: [] };
        }
        if (statement.includes('SELECT COUNT(*) FROM sent_logs')) return { rows: [{ count: 0 }] };
        if (statement.includes('SELECT messages_used, message_quota')) {
            return { rows: [{ messages_used: 0, message_quota: 1000 }] };
        }
        if (statement.includes('SELECT settings FROM tenants')) return { rows: [{ settings: { safe_mode: false } }] };
        if (statement.includes('UPDATE campaigns')) campaignUpdates.push({ statement, params });
        return { rows: [], rowCount: 1 };
    }

    const transactionClient = {
        async query(sql, params = []) {
            const statement = String(sql);
            if (statement.includes("SET status = 'sent'")) {
                const recipient = recipients.get(recipientKey(params[0], params[1], params[2]));
                if (recipient && recipient.status === 'sending') recipient.status = 'sent';
            }
            return { rows: [], rowCount: 1 };
        },
        release() {},
    };

    const database = { query, pool: { connect: async () => transactionClient } };
    const client = {
        checkNumberStatus: async () => ({ status: 200, numberExists: true }),
        startTyping: async () => {},
        stopTyping: async () => {},
        sendText: async chatId => {
            const phone = chatId.split('@')[0];
            if (options.sessionLossPhone && chatId.startsWith(options.sessionLossPhone)) {
                throw new Error('lost connection to WhatsApp session');
            }
            sentPhones.push(phone);
            if (options.uncertainFailurePhone && phone === options.uncertainFailurePhone) {
                throw new Error('delivery confirmation timed out');
            }
        },
    };
    const provider = {
        updateActivity() {},
        getClient: async () => client,
        emitToTenant() {},
        stopClient: async () => {},
    };

    return { database, provider, recipients, sentPhones, campaignUpdates };
}

function freshProcessBatch(harness) {
    const replacements = new Map([
        ['../src/database/pg-client', harness.database],
        ['../src/core/whatsapp', { getProviderForTenant: async () => harness.provider }],
        ['../src/utils/generator', { generateImage: async () => '' }],
        ['../src/utils/audioConverter', { convertToOggOpus: async () => '' }],
        ['../src/utils/logger', { logResult: async () => {}, createLogger: () => ({ warn() {}, error() {} }) }],
        ['../src/core/AntiBanEngine', {
            sleep: async () => {}, typingDuration: () => 0, recordSent() {}, applyDelay: async () => {},
        }],
        ['../src/utils/dataProcessor', {
            normalizePhone: phone => String(phone), processName: async name => name,
        }],
    ]);
    const originals = [];
    for (const [request, exports] of replacements) {
        const modulePath = require.resolve(request);
        originals.push([modulePath, require.cache[modulePath]]);
        require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
    }
    const processBatchPath = require.resolve('../src/core/processBatch');
    delete require.cache[processBatchPath];
    const { processBatch } = require('../src/core/processBatch');
    return {
        processBatch,
        restore() {
            delete require.cache[processBatchPath];
            for (const [modulePath, cachedModule] of originals) {
                if (cachedModule) require.cache[modulePath] = cachedModule;
                else delete require.cache[modulePath];
            }
        },
    };
}

async function runCampaign(processBatch, tenantId, campaignId, contacts, runOptions = {}) {
    return processBatch(
        contacts, 1, contacts.length, ['Hello'], campaignId, false, () => {},
        null, null, tenantId, null, { minDelaySeconds: 1, maxDelaySeconds: 1, ...runOptions }
    );
}

test('restart sends pending recipients but never resends sent recipients', async () => {
    const harness = continuityHarness([
        { tenantId: 't1', campaignId: 'c1', phone: '111', sourceRow: 1, status: 'sent' },
        { tenantId: 't1', campaignId: 'c1', phone: '222', sourceRow: 2, status: 'pending' },
    ]);
    const runtime = freshProcessBatch(harness);
    try {
        await runCampaign(runtime.processBatch, 't1', 'c1', [
            { Name: 'Sent', Phone: '111' }, { Name: 'Pending', Phone: '222' },
        ]);
        assert.equal(harness.sentPhones.filter(phone => phone === '111').length, 0);
        assert.equal(harness.recipients.get('t1:c1:222').status, 'sent');
    } finally {
        runtime.restore();
    }
});

test('persistent stop prevents claiming or sending the next recipient', async () => {
    const harness = continuityHarness([
        { tenantId: 't1', campaignId: 'c1', phone: '111', sourceRow: 1, status: 'pending' },
    ], { stoppedGate: 't1:c1' });
    const runtime = freshProcessBatch(harness);
    try {
        const outcome = await runCampaign(runtime.processBatch, 't1', 'c1', [{ Name: 'A', Phone: '111' }]);
        assert.equal(outcome.stoppedReason, 'stop_requested');
        assert.equal(harness.recipients.get('t1:c1:111').status, 'pending');
        assert.equal(harness.sentPhones.length, 0);
    } finally {
        runtime.restore();
    }
});

test('messaging disabled staging gate prevents sends to the isolated number', async () => {
    const harness = continuityHarness([
        { tenantId: 'staging-tenant', campaignId: 'staging-campaign', phone: '199900000001', sourceRow: 1, status: 'pending' },
    ], { disabledGate: 'staging-tenant:staging-campaign' });
    const runtime = freshProcessBatch(harness);
    try {
        const outcome = await runCampaign(runtime.processBatch, 'staging-tenant', 'staging-campaign', [
            { Name: 'Staging Only', Phone: '199900000001' },
        ]);
        assert.equal(outcome.stoppedReason, 'messaging_disabled');
        assert.equal(harness.sentPhones.length, 0);
        assert.equal(harness.recipients.get('staging-tenant:staging-campaign:199900000001').status, 'pending');
    } finally {
        runtime.restore();
    }
});

test('session loss after send begins marks recipient needs_review and pauses without failing the rest', async () => {
    const harness = continuityHarness([
        { tenantId: 't1', campaignId: 'c1', phone: '111', sourceRow: 1, status: 'pending' },
        { tenantId: 't1', campaignId: 'c1', phone: '222', sourceRow: 2, status: 'pending' },
    ], { sessionLossPhone: '111' });
    const runtime = freshProcessBatch(harness);
    try {
        await assert.rejects(
            () => runCampaign(runtime.processBatch, 't1', 'c1', [
                { Name: 'A', Phone: '111' }, { Name: 'B', Phone: '222' },
            ]),
            error => error.name === 'WhatsAppSessionError'
        );
        assert.equal(harness.recipients.get('t1:c1:111').status, 'needs_review');
        assert.equal(harness.recipients.get('t1:c1:222').status, 'pending');
    } finally {
        runtime.restore();
    }
});

test('uncertain failure after a send attempt pauses instead of allowing an automatic retry', async () => {
    const harness = continuityHarness([
        { tenantId: 't1', campaignId: 'c1', phone: '111', sourceRow: 1, status: 'pending' },
        { tenantId: 't1', campaignId: 'c1', phone: '222', sourceRow: 2, status: 'pending' },
    ], { uncertainFailurePhone: '111' });
    const runtime = freshProcessBatch(harness);
    try {
        const outcome = await runCampaign(runtime.processBatch, 't1', 'c1', [
            { Name: 'A', Phone: '111' }, { Name: 'B', Phone: '222' },
        ]);
        assert.equal(outcome.stoppedReason, 'needs_review');
        assert.equal(harness.recipients.get('t1:c1:111').status, 'needs_review');
        assert.equal(harness.recipients.get('t1:c1:222').status, 'pending');
        assert.deepEqual(harness.sentPhones, ['111']);
    } finally {
        runtime.restore();
    }
});

test('atomic claim prevents duplicate sends from concurrent workers', async () => {
    const harness = continuityHarness([
        { tenantId: 't1', campaignId: 'c1', phone: '111', sourceRow: 1, status: 'pending' },
    ]);
    const runtime = freshProcessBatch(harness);
    try {
        await Promise.all([
            runCampaign(runtime.processBatch, 't1', 'c1', [{ Name: 'A', Phone: '111' }]),
            runCampaign(runtime.processBatch, 't1', 'c1', [{ Name: 'A', Phone: '111' }]),
        ]);
        assert.equal(harness.sentPhones.filter(phone => phone === '111').length, 1);
        assert.equal(harness.recipients.get('t1:c1:111').attempt_count, 1);
    } finally {
        runtime.restore();
    }
});

test('two tenant campaigns run concurrently without sharing recipient claims', async () => {
    const harness = continuityHarness([
        { tenantId: 't1', campaignId: 'c1', phone: '111', sourceRow: 1, status: 'pending' },
        { tenantId: 't2', campaignId: 'c2', phone: '222', sourceRow: 1, status: 'pending' },
    ]);
    const runtime = freshProcessBatch(harness);
    try {
        await Promise.all([
            runCampaign(runtime.processBatch, 't1', 'c1', [{ Name: 'A', Phone: '111' }]),
            runCampaign(runtime.processBatch, 't2', 'c2', [{ Name: 'B', Phone: '222' }]),
        ]);
        assert.equal(harness.recipients.get('t1:c1:111').status, 'sent');
        assert.equal(harness.recipients.get('t2:c2:222').status, 'sent');
    } finally {
        runtime.restore();
    }
});
