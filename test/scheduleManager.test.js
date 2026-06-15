const test = require('node:test');
const assert = require('node:assert/strict');

const ScheduleManager = require('../src/core/ScheduleManager');
const WhatsAppProviders = require('../src/core/whatsapp');

test('scheduled campaigns wake a stored WhatsApp session before sending', async () => {
    const originalGetProviderForTenant = WhatsAppProviders.getProviderForTenant;
    const calls = [];

    try {
        WhatsAppProviders.getProviderForTenant = async () => ({
            hasClient: (tenantId) => {
                calls.push(['hasClient', tenantId]);
                return false;
            },
            hasStoredSession: (tenantId) => {
                calls.push(['hasStoredSession', tenantId]);
                return true;
            },
            getClient: async (tenantId) => {
                calls.push(['getClient', tenantId]);
                return { id: `client:${tenantId}` };
            },
            getTenantState: (tenantId) => {
                calls.push(['getTenantState', tenantId]);
                return { status: 'READY' };
            },
        });

        await assert.doesNotReject(() => ScheduleManager._ensureWhatsAppReady('tenant-1', 'disconnected'));
        assert.deepEqual(calls, [
            ['hasClient', 'tenant-1'],
            ['hasStoredSession', 'tenant-1'],
            ['getClient', 'tenant-1'],
            ['getTenantState', 'tenant-1'],
        ]);
    } finally {
        WhatsAppProviders.getProviderForTenant = originalGetProviderForTenant;
    }
});

test('scheduled campaigns fail clearly when no WhatsApp session can be recovered', async () => {
    const originalGetProviderForTenant = WhatsAppProviders.getProviderForTenant;

    try {
        WhatsAppProviders.getProviderForTenant = async () => ({
            hasClient: () => false,
            hasStoredSession: () => false,
        });

        await assert.rejects(
            () => ScheduleManager._ensureWhatsAppReady('tenant-1', 'disconnected'),
            /scan the QR first/
        );
    } finally {
        WhatsAppProviders.getProviderForTenant = originalGetProviderForTenant;
    }
});
