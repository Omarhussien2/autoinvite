const test = require('node:test');
const assert = require('node:assert/strict');

const WPPConnectProvider = require('../src/core/whatsapp/providers/WPPConnectProvider');

test('WPPConnect provider delegates tenant lifecycle calls to the manager', async () => {
    const calls = [];
    const fakeManager = {
        clients: new Map([['tenant-1', { id: 'client-1' }]]),
        MAX_TOTAL_CLIENTS: '7',
        states: new Map(),
        setIo: (io) => calls.push(['setIo', io]),
        emitToTenant: (tenantId, event, data) => calls.push(['emitToTenant', tenantId, event, data]),
        getClient: async (tenantId) => ({ tenantId }),
        getTenantState: (tenantId) => ({ tenantId, status: 'READY' }),
        updateActivity: (tenantId) => calls.push(['updateActivity', tenantId]),
        stopClient: async (tenantId) => calls.push(['stopClient', tenantId]),
        logoutClient: async (tenantId) => calls.push(['logoutClient', tenantId]),
        startSleepMonitor: (idleMs) => calls.push(['startSleepMonitor', idleMs]),
        stopSleepMonitor: () => calls.push(['stopSleepMonitor']),
    };

    const provider = new WPPConnectProvider(fakeManager);

    assert.equal(provider.name, 'wppconnect');
    assert.deepEqual(await provider.getClient('tenant-2'), { tenantId: 'tenant-2' });
    assert.deepEqual(provider.getTenantState('tenant-2'), { tenantId: 'tenant-2', status: 'READY' });
    assert.equal(provider.hasClient('tenant-1'), true);
    assert.equal(provider.getActiveClientCount(), 1);
    assert.equal(provider.getMaxClientCount(), 7);
    assert.deepEqual(provider.getActiveTenantIds(), ['tenant-1']);

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
