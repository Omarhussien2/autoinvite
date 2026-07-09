const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/database/pg-client');
const WhatsAppProviders = require('../src/core/whatsapp');

test.after(async () => {
    await db.pool.end().catch(() => {});
});

function freshBackgroundQueueWithProcessBatch(fakeProcessBatch) {
    const backgroundQueuePath = require.resolve('../src/core/BackgroundQueue');
    const processBatchPath = require.resolve('../src/core/processBatch');

    delete require.cache[backgroundQueuePath];
    const originalProcessBatchModule = require.cache[processBatchPath];

    require.cache[processBatchPath] = {
        id: processBatchPath,
        filename: processBatchPath,
        loaded: true,
        exports: { processBatch: fakeProcessBatch },
    };

    const BackgroundQueue = require('../src/core/BackgroundQueue');

    return {
        BackgroundQueue,
        restore() {
            delete require.cache[backgroundQueuePath];
            if (originalProcessBatchModule) {
                require.cache[processBatchPath] = originalProcessBatchModule;
            } else {
                delete require.cache[processBatchPath];
            }
        },
    };
}

async function flushQueueCallbacks() {
    for (let i = 0; i < 4; i++) {
        await new Promise(resolve => setImmediate(resolve));
    }
}

test('BackgroundQueue passes smart schedule run options through to processBatch', async () => {
    const originalQuery = db.query;
    const originalGetProviderForTenant = WhatsAppProviders.getProviderForTenant;
    const providerEvents = [];
    let capturedArgs;

    const runOptions = {
        batchId: 'batch-1',
        dailyLimit: 35,
        timezone: 'Africa/Cairo',
        minDelaySeconds: 20,
        maxDelaySeconds: 60,
        breakAfterMessages: 8,
        breakMinMinutes: 5,
        breakMaxMinutes: 12,
    };

    const { BackgroundQueue, restore } = freshBackgroundQueueWithProcessBatch((...args) => {
        capturedArgs = args;
        return Promise.resolve({ successCount: 1, failCount: 0 });
    });

    try {
        db.query = async () => ({ rows: [] });
        WhatsAppProviders.getProviderForTenant = async () => ({
            emitToTenant: (tenantId, event, data) => providerEvents.push({ tenantId, event, data }),
            setTenantState: (tenantId, patch) => providerEvents.push({ tenantId, event: 'setTenantState', data: patch }),
        });

        await BackgroundQueue.addJob(
            'tenant-1',
            'campaign-1',
            [{ Name: 'A', Phone: '0500000000' }],
            1,
            1,
            ['hello'],
            false,
            null,
            null,
            null,
            runOptions
        );

        await flushQueueCallbacks();

        assert.deepEqual(capturedArgs[11], runOptions);
        assert.equal(BackgroundQueue.jobs.has('tenant-1'), false);
        assert.equal(providerEvents.some(event => event.event === 'log'), true);
    } finally {
        db.query = originalQuery;
        WhatsAppProviders.getProviderForTenant = originalGetProviderForTenant;
        restore();
    }
});

test('BackgroundQueue keeps a campaign paused when the daily limit stops the batch', async () => {
    const originalQuery = db.query;
    const originalGetProviderForTenant = WhatsAppProviders.getProviderForTenant;
    const queries = [];
    const providerEvents = [];

    const { BackgroundQueue, restore } = freshBackgroundQueueWithProcessBatch(() => Promise.resolve({
        successCount: 200,
        failCount: 0,
        stoppedReason: 'daily_limit_reached',
        lastRow: 201,
    }));

    try {
        db.query = async (sql, params = []) => {
            queries.push({ sql: String(sql), params });
            return { rows: [] };
        };
        WhatsAppProviders.getProviderForTenant = async () => ({
            emitToTenant: (tenantId, event, data) => providerEvents.push({ tenantId, event, data }),
            setTenantState: (tenantId, patch) => providerEvents.push({ tenantId, event: 'setTenantState', data: patch }),
        });

        await BackgroundQueue.addJob(
            'tenant-1',
            'campaign-1',
            Array.from({ length: 684 }, (_, index) => ({ Name: `A${index}`, Phone: '0500000000' })),
            1,
            684,
            ['hello'],
            false,
            null,
            null,
            null
        );

        await flushQueueCallbacks();

        const campaignUpdates = queries.filter(query => query.sql.includes('UPDATE campaigns SET last_sent_row'));
        const finalUpdate = campaignUpdates[campaignUpdates.length - 1];
        assert.deepEqual(finalUpdate.params, [201, 'paused', 'daily_limit_reached', 'campaign-1', 'tenant-1']);
        assert.equal(providerEvents.some(event => event.data && event.data.type === 'WARN'), true);
    } finally {
        db.query = originalQuery;
        WhatsAppProviders.getProviderForTenant = originalGetProviderForTenant;
        restore();
    }
});

test('BackgroundQueue keeps a smart scheduled campaign scheduled while later batches remain', async () => {
    const originalQuery = db.query;
    const originalGetProviderForTenant = WhatsAppProviders.getProviderForTenant;
    const queries = [];

    const { BackgroundQueue, restore } = freshBackgroundQueueWithProcessBatch(() => Promise.resolve({
        successCount: 100,
        failCount: 0,
        lastRow: 100,
    }));

    try {
        db.query = async (sql, params = []) => {
            const sqlText = String(sql);
            queries.push({ sql: sqlText, params });
            if (sqlText.includes('pending_count')) {
                return {
                    rows: [{
                        pending_count: 1,
                        paused_count: 0,
                        total_sent: 100,
                        total_failed: 0,
                    }],
                };
            }
            return { rows: [] };
        };
        WhatsAppProviders.getProviderForTenant = async () => ({
            emitToTenant: () => {},
            setTenantState: () => {},
        });

        await BackgroundQueue.addJob(
            'tenant-1',
            'campaign-1',
            Array.from({ length: 100 }, (_, index) => ({ Name: `A${index}`, Phone: '0500000000' })),
            1,
            100,
            ['hello'],
            false,
            null,
            null,
            null,
            { batchId: 'batch-1' }
        );

        await flushQueueCallbacks();

        const batchUpdate = queries.find(query => query.sql.includes('UPDATE campaign_batches'));
        assert.equal(batchUpdate.params[0], 'completed');
        assert.equal(batchUpdate.params[5], 'batch-1');

        const campaignUpdates = queries.filter(query => query.sql.includes('UPDATE campaigns SET last_sent_row'));
        const finalUpdate = campaignUpdates[campaignUpdates.length - 1];
        assert.deepEqual(finalUpdate.params, [100, 'scheduled', null, 'campaign-1', 'tenant-1']);
    } finally {
        db.query = originalQuery;
        WhatsAppProviders.getProviderForTenant = originalGetProviderForTenant;
        restore();
    }
});
