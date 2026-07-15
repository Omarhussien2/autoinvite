const WhatsAppManager = require('../../WhatsAppManager');

class WPPConnectProvider {
    constructor(manager = WhatsAppManager) {
        this.name = 'wppconnect';
        this.manager = manager;
    }

    setIo(io) {
        this.manager.setIo(io);
    }

    emitToTenant(tenantId, event, data) {
        return this.manager.emitToTenant(tenantId, event, data);
    }

    async getClient(tenantId) {
        return this.manager.getClient(tenantId);
    }

    getTenantState(tenantId) {
        return this.manager.getTenantState(tenantId);
    }

    async refreshClientState(tenantId, options) {
        return this.manager.refreshClientState(tenantId, options);
    }

    setTenantState(tenantId, patch) {
        const current = this.manager.states.get(tenantId) || {};
        this.manager.states.set(tenantId, {
            ...current,
            ...patch,
            lastActive: patch.lastActive || current.lastActive || Date.now(),
        });
    }

    updateActivity(tenantId) {
        return this.manager.updateActivity(tenantId);
    }

    async stopClient(tenantId) {
        return this.manager.stopClient(tenantId);
    }

    async logoutClient(tenantId) {
        return this.manager.logoutClient(tenantId);
    }

    hasClient(tenantId) {
        return this.manager.clients.has(tenantId);
    }

    hasStoredSession(tenantId) {
        return this.manager.hasStoredSession(tenantId);
    }

    getActiveClientCount() {
        return this.manager.clients.size;
    }

    getActiveTenantIds() {
        return Array.from(new Set([
            ...this.manager.clients.keys(),
            ...((this.manager.initializing && this.manager.initializing.keys()) || []),
        ]));
    }

    getMaxClientCount() {
        return parseInt(this.manager.MAX_TOTAL_CLIENTS, 10);
    }

    startSleepMonitor(idleMs) {
        return this.manager.startSleepMonitor(idleMs);
    }

    stopSleepMonitor() {
        return this.manager.stopSleepMonitor();
    }
}

module.exports = WPPConnectProvider;
