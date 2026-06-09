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

        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));

        assert.deepEqual(capturedArgs[11], runOptions);
        assert.equal(BackgroundQueue.jobs.has('tenant-1'), false);
        assert.equal(providerEvents.some(event => event.event === 'log'), true);
    } finally {
        db.query = originalQuery;
        WhatsAppProviders.getProviderForTenant = originalGetProviderForTenant;
        restore();
    }
});
