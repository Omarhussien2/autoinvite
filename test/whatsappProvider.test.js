const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/database/pg-client');
const WhatsAppProviders = require('../src/core/whatsapp');
const WPPConnectProvider = require('../src/core/whatsapp/providers/WPPConnectProvider');

test('WPPConnect provider delegates tenant lifecycle calls to the manager', async () => {
    const calls = [];
    const fakeManager = {
        clients: new Map([['tenant-1', { id: 'client-1' }]]),
        initializing: new Map([['tenant-2', Promise.resolve()]]),
        MAX_TOTAL_CLIENTS: '7',
        states: new Map(),
        setIo: (io) => calls.push(['setIo', io]),
        emitToTenant: (tenantId, event, data) => calls.push(['emitToTenant', tenantId, event, data]),
        getClient: async (tenantId) => ({ tenantId }),
        getTenantState: (tenantId) => ({ tenantId, status: 'READY' }),
        updateActivity: (tenantId) => calls.push(['updateActivity', tenantId]),
        stopClient: async (tenantId) => calls.push(['stopClient', tenantId]),
        logoutClient: async (tenantId) => calls.push(['logoutClient', tenantId]),
        hasStoredSession: (tenantId) => tenantId === 'tenant-1',
        startSleepMonitor: (idleMs) => calls.push(['startSleepMonitor', idleMs]),
        stopSleepMonitor: () => calls.push(['stopSleepMonitor']),
    };

    const provider = new WPPConnectProvider(fakeManager);

    assert.equal(provider.name, 'wppconnect');
    assert.deepEqual(await provider.getClient('tenant-2'), { tenantId: 'tenant-2' });
    assert.deepEqual(provider.getTenantState('tenant-2'), { tenantId: 'tenant-2', status: 'READY' });
    assert.equal(provider.hasClient('tenant-1'), true);
    assert.equal(provider.hasStoredSession('tenant-1'), true);
    assert.equal(provider.hasStoredSession('tenant-2'), false);
    assert.equal(provider.getActiveClientCount(), 1);
    assert.equal(provider.getMaxClientCount(), 7);
    assert.deepEqual(provider.getActiveTenantIds(), ['tenant-1', 'tenant-2']);

    provider.setTenantState('tenant-2', { status: 'WORKING' });
    assert.equal(fakeManager.states.get('tenant-2').status, 'WORKING');
    assert.equal(typeof fakeManager.states.get('tenant-2').lastActive, 'number');

    provider.updateActivity('tenant-2');
    await provider.stopClient('tenant-2');
    await provider.logoutClient('tenant-2');
    provider.startSleepMonitor(1000);
    provider.stopSleepMonitor();
    provider.emitToTenant('tenant-2', 'log', { message: 'ok' });

    assert.deepEqual(calls, [
        ['updateActivity', 'tenant-2'],
        ['stopClient', 'tenant-2'],
        ['logoutClient', 'tenant-2'],
        ['startSleepMonitor', 1000],
        ['stopSleepMonitor'],
        ['emitToTenant', 'tenant-2', 'log', { message: 'ok' }],
    ]);
});

test('provider registry resolves tenant provider settings and falls back when settings cannot load', async () => {
    const originalProviders = WhatsAppProviders.providers;
    const originalDefault = WhatsAppProviders.defaultProviderName;
    const originalQuery = db.query;

    const wppProvider = { name: 'wppconnect' };
    const wahaProvider = { name: 'waha' };

    try {
        WhatsAppProviders.providers = new Map();
        WhatsAppProviders.defaultProviderName = 'wppconnect';
        WhatsAppProviders.register(wppProvider);
        WhatsAppProviders.register(wahaProvider);

        db.query = async () => ({ rows: [{ settings: { whatsapp_provider: ' WAHA ' } }] });
        assert.equal(await WhatsAppProviders.getProviderNameForTenant('tenant-1'), 'waha');
        assert.equal(await WhatsAppProviders.getProviderForTenant('tenant-1'), wahaProvider);

        db.query = async () => ({ rows: [{ settings: {} }] });
        assert.equal(await WhatsAppProviders.getProviderForTenant('tenant-2'), wppProvider);

        db.query = async () => {
            throw new Error('database unavailable');
        };
        assert.equal(await WhatsAppProviders.getProviderForTenant('tenant-3'), wppProvider);
    } finally {
        db.query = originalQuery;
        WhatsAppProviders.providers = originalProviders;
        WhatsAppProviders.defaultProviderName = originalDefault;
    }
});

test('provider registry aggregates active clients and settles shutdown across providers', async () => {
    const originalProviders = WhatsAppProviders.providers;
    const originalDefault = WhatsAppProviders.defaultProviderName;
    const stoppedTenants = [];

    const firstProvider = {
        name: 'first',
        getActiveClientCount: () => 2,
        getMaxClientCount: () => 5,
        getActiveTenantIds: () => ['a', 'b'],
        stopClient: async (tenantId) => {
            stoppedTenants.push(`first:${tenantId}`);
            if (tenantId === 'b') throw new Error('close failed');
        },
    };
    const secondProvider = {
        name: 'second',
        getActiveClientCount: () => 1,
        getMaxClientCount: () => 3,
        getActiveTenantIds: () => ['c'],
        stopClient: async (tenantId) => {
            stoppedTenants.push(`second:${tenantId}`);
        },
    };

    try {
        WhatsAppProviders.providers = new Map();
        WhatsAppProviders.defaultProviderName = 'first';
        WhatsAppProviders.register(firstProvider);
        WhatsAppProviders.register(secondProvider);

        assert.equal(WhatsAppProviders.getActiveClientCount(), 3);
        assert.equal(WhatsAppProviders.getMaxClientCount(), 8);

        await assert.doesNotReject(() => WhatsAppProviders.stopAllClients());
        assert.deepEqual(stoppedTenants.sort(), ['first:a', 'first:b', 'second:c']);
    } finally {
        WhatsAppProviders.providers = originalProviders;
        WhatsAppProviders.defaultProviderName = originalDefault;
    }
});
