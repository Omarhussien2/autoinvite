const db = require('../../database/pg-client');
const { createLogger } = require('../../utils/logger');
const WPPConnectProvider = require('./providers/WPPConnectProvider');

const log = createLogger('WhatsAppProviderRegistry');

const DEFAULT_PROVIDER = 'wppconnect';

class WhatsAppProviderRegistry {
    constructor() {
        this.providers = new Map();
        this.defaultProviderName = this.normalizeProviderName(process.env.WHATSAPP_PROVIDER || DEFAULT_PROVIDER);
        this.register(new WPPConnectProvider());
    }

    normalizeProviderName(providerName) {
        return String(providerName || DEFAULT_PROVIDER).trim().toLowerCase();
    }

    register(provider) {
        if (!provider || !provider.name) {
            throw new Error('WhatsApp provider must expose a name');
        }
        this.providers.set(this.normalizeProviderName(provider.name), provider);
        return provider;
    }

    getProvider(providerName = this.defaultProviderName) {
        const normalizedName = this.normalizeProviderName(providerName);
        const provider = this.providers.get(normalizedName);
        if (!provider) {
            const knownProviders = Array.from(this.providers.keys()).join(', ');
            throw new Error(`WhatsApp provider "${normalizedName}" is not registered. Available providers: ${knownProviders}`);
        }
        return provider;
    }

    async getProviderNameForTenant(tenantId) {
        if (!tenantId) return this.defaultProviderName;

        try {
            const result = await db.query('SELECT settings FROM tenants WHERE id = $1', [tenantId]);
            const settings = result.rows[0]?.settings;
            const tenantProvider = settings && settings.whatsapp_provider;
            return this.normalizeProviderName(tenantProvider || this.defaultProviderName);
        } catch (err) {
            log.warn(`Could not load WhatsApp provider for tenant ${tenantId}; using ${this.defaultProviderName}:`, err.message);
            return this.defaultProviderName;
        }
    }

    async getProviderForTenant(tenantId) {
        const providerName = await this.getProviderNameForTenant(tenantId);
        return this.getProvider(providerName);
    }

    getDefaultProvider() {
        return this.getProvider(this.defaultProviderName);
    }

    setIo(io) {
        for (const provider of this.providers.values()) {
            if (typeof provider.setIo === 'function') provider.setIo(io);
        }
    }

    startSleepMonitor(idleMs) {
        for (const provider of this.providers.values()) {
            if (typeof provider.startSleepMonitor === 'function') provider.startSleepMonitor(idleMs);
        }
    }

    stopSleepMonitor() {
        for (const provider of this.providers.values()) {
            if (typeof provider.stopSleepMonitor === 'function') provider.stopSleepMonitor();
        }
    }

    async stopAllClients() {
        const stopTasks = [];
        for (const provider of this.providers.values()) {
            if (typeof provider.getActiveTenantIds !== 'function') continue;
            for (const tenantId of provider.getActiveTenantIds()) {
                stopTasks.push(provider.stopClient(tenantId));
            }
        }
        await Promise.allSettled(stopTasks);
    }

    getActiveClientCount() {
        let total = 0;
        for (const provider of this.providers.values()) {
            if (typeof provider.getActiveClientCount === 'function') {
                total += provider.getActiveClientCount();
            }
        }
        return total;
    }

    getMaxClientCount() {
        let total = 0;
        for (const provider of this.providers.values()) {
            if (typeof provider.getMaxClientCount === 'function') {
                total += provider.getMaxClientCount();
            }
        }
        return total;
    }

    listProviderNames() {
        return Array.from(this.providers.keys());
    }
}

module.exports = new WhatsAppProviderRegistry();
