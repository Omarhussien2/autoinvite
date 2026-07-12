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

test('persistent stop cancels campaign and future batch jobs', async () => {
    const database = require('../src/database/pg-client');
    const originalQuery = database.query;
    const originalEnsureStarted = ScheduleManager._ensureStarted;
    const originalCancelJob = ScheduleManager._cancelJob;
    const cancelledJobs = [];
    const updates = [];

    try {
        ScheduleManager._ensureStarted = async () => {};
        ScheduleManager._cancelJob = async jobId => cancelledJobs.push(jobId);
        database.query = async (sql) => {
            const statement = String(sql);
            if (statement.includes('UNION ALL')) {
                return { rows: [{ schedule_job_id: 'campaign-job' }, { schedule_job_id: 'batch-job' }] };
            }
            updates.push(statement);
            return { rows: [] };
        };

        await ScheduleManager.requestStop('campaign-1', 'tenant-1');

        assert.deepEqual(cancelledJobs, ['campaign-job', 'batch-job']);
        assert.equal(updates.some(sql => sql.includes('stop_requested_at = NOW()')), true);
        assert.equal(updates.some(sql => sql.includes("status IN ('scheduled', 'running')")), true);
    } finally {
        database.query = originalQuery;
        ScheduleManager._ensureStarted = originalEnsureStarted;
        ScheduleManager._cancelJob = originalCancelJob;
    }
});

test('scheduled campaign without an approved plan is paused before WhatsApp is opened', async () => {
    const database = require('../src/database/pg-client');
    const originalQuery = database.query;
    const originalGetProviderForTenant = WhatsAppProviders.getProviderForTenant;
    const updates = [];
    try {
        database.query = async (sql, params = []) => {
            updates.push({ sql: String(sql), params });
            return { rows: [] };
        };
        WhatsAppProviders.getProviderForTenant = async () => {
            throw new Error('provider must not be opened');
        };

        await ScheduleManager._triggerCampaign({
            id: 'campaign-1', tenant_id: 'tenant-1', name: 'Unapproved',
            messaging_enabled: true, stop_requested_at: null,
            plan_hash: null, plan_approved_at: null,
        });

        const pauseUpdate = updates.find(update => update.sql.includes("SET status = 'paused'"));
        assert.equal(pauseUpdate.params[0], 'plan_not_approved');
    } finally {
        database.query = originalQuery;
        WhatsAppProviders.getProviderForTenant = originalGetProviderForTenant;
    }
});

test('scheduled campaign with a stale approval is paused before WhatsApp is opened', async () => {
    const database = require('../src/database/pg-client');
    const originalQuery = database.query;
    const originalGetProviderForTenant = WhatsAppProviders.getProviderForTenant;
    const originalApprovalCheck = ScheduleManager._hasValidPlanApproval;
    const updates = [];
    try {
        database.query = async (sql, params = []) => {
            updates.push({ sql: String(sql), params });
            return { rows: [] };
        };
        ScheduleManager._hasValidPlanApproval = async () => false;
        WhatsAppProviders.getProviderForTenant = async () => {
            throw new Error('provider must not be opened');
        };

        await ScheduleManager._triggerCampaign({
            id: 'campaign-1', tenant_id: 'tenant-1', name: 'Stale approval',
            messaging_enabled: true, stop_requested_at: null,
            plan_hash: 'old-hash', plan_approved_at: new Date(),
        });

        const pauseUpdate = updates.find(update => update.sql.includes("SET status = 'paused'"));
        assert.equal(pauseUpdate.params[0], 'plan_not_approved');
    } finally {
        database.query = originalQuery;
        WhatsAppProviders.getProviderForTenant = originalGetProviderForTenant;
        ScheduleManager._hasValidPlanApproval = originalApprovalCheck;
    }
});
