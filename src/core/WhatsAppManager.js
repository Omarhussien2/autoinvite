const { LocalAuth, Client } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');

class WhatsAppManager {
    constructor() {
        this.clients = new Map(); // tenantId -> client
        this.states = new Map(); // tenantId -> { status, lastQr, lastActive, phone }
        this.io = null;
        this.MAX_TOTAL_CLIENTS = process.env.MAX_TOTAL_CLIENTS || 5; // Default to 5 browsers for SaaS safety
    }

    setIo(io) {
        this.io = io;
    }

    emitToTenant(tenantId, event, data) {
        if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit(event, data);
        }
    }

    async getClient(tenantId) {
        if (this.clients.has(tenantId)) {
            const client = this.clients.get(tenantId);
            this.updateActivity(tenantId);
            return client;
        }

        // Check global capacity
        if (this.clients.size >= this.MAX_TOTAL_CLIENTS) {
            throw new Error('النظام استنفد كامل طاقته حالياً. يرجى المحاولة لاحقاً (Server at capacity)');
        }

        return this.initializeClient(tenantId);
    }

    getTenantState(tenantId) {
        return this.states.get(tenantId) || { status: 'DISCONNECTED', lastQr: null, phone: null };
    }

    updateActivity(tenantId) {
        if (this.states.has(tenantId)) {
            const state = this.states.get(tenantId);
            state.lastActive = Date.now();
        }
    }

    async initializeClient(tenantId) {
        const authDir = path.join(process.env.DATA_DIR || path.join(__dirname, '../../'), 'storage', `tenant_${tenantId}`, 'auth_session');
        if (!fs.existsSync(authDir)) {
            fs.mkdirSync(authDir, { recursive: true });
        }

        // Resolve Chromium path for Linux VPS / NixOS / Replit environments
        let executablePath;
        if (process.env.CHROMIUM_PATH) {
            executablePath = process.env.CHROMIUM_PATH;
        } else {
            try {
                const { execSync } = require('child_process');
                executablePath = execSync(
                    'which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null || echo ""'
                ).toString().trim() || undefined;
            } catch (_) {
                executablePath = undefined;
            }
        }

        const puppeteerConfig = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--no-zygote',                      // Saves ~50MB RAM per session on VPS
                '--single-process',                 // Further RAM reduction (trades for slight stability)
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--safebrowsing-disable-auto-update',
                '--disable-features=site-per-process'
            ]
        };
        if (executablePath) puppeteerConfig.executablePath = executablePath;

        const client = new Client({
            authStrategy: new LocalAuth({ clientId: `tenant_${tenantId}`, dataPath: authDir }),
            puppeteer: puppeteerConfig
        });

        this.clients.set(tenantId, client);
        this.states.set(tenantId, { status: 'INITIALIZING', lastQr: null, lastActive: Date.now(), phone: null });

        client.on('qr', (qr) => {
            const state = this.states.get(tenantId);
            if (state) {
                state.status = 'QUERY_QR';
                state.lastQr = qr;
                this.updateActivity(tenantId);
            }
            this.emitToTenant(tenantId, 'qr', qr);
            this.emitToTenant(tenantId, 'status', 'يا هلا! امسح الباركود عشان نربط الواتساب');
        });

        client.on('ready', () => {
            const state = this.states.get(tenantId);
            if (state) {
                state.status = 'READY';
                state.lastQr = null;
                const phone = client.info ? client.info.wid.user : 'Unknown';
                state.phone = phone;
                this.updateActivity(tenantId);
            }
            this.emitToTenant(tenantId, 'ready', { phone: state?.phone });
            this.emitToTenant(tenantId, 'status', `الواتساب جاهز ومتصل بالرقم (966${state?.phone?.substring(3) || ''})`);
            console.log(`[Tenant ${tenantId}] Client is ready!`);
        });

        client.on('authenticated', () => {
            this.emitToTenant(tenantId, 'status', 'تم التوثيق بنجاح! جاري التحميل...');
            this.updateActivity(tenantId);
        });

        client.on('disconnected', (reason) => {
            console.log(`[Tenant ${tenantId}] WhatsApp disconnected:`, reason);
            this.stopClient(tenantId);
        });

        // Initialize and catch errors
        client.initialize().catch(err => {
            console.error(`[Tenant ${tenantId}] WhatsApp Init Error:`, err.message);
            this.clients.delete(tenantId);
            this.states.set(tenantId, { status: 'ERROR', error: err.message });
        });

        return client;
    }

    async stopClient(tenantId) {
        const client = this.clients.get(tenantId);
        if (client) {
            try {
                await client.destroy();
            } catch (e) {
                console.error(`Error destroying client for tenant ${tenantId}:`, e.message);
            }
            this.clients.delete(tenantId);
        }
        if (this.states.has(tenantId)) {
            const state = this.states.get(tenantId);
            state.status = 'DISCONNECTED';
            state.phone = null;
            state.lastQr = null;
        }
        this.emitToTenant(tenantId, 'status', 'تم إيقاف الجلسة. يمكنك إعادة الاتصال.');
    }

    // Session Sleep system: cron task to sweep inactive sessions every mins
    startSleepMonitor(idleMs = 15 * 60 * 1000) {
        setInterval(() => {
            const now = Date.now();
            for (const [tenantId, state] of this.states.entries()) {
                if (state.lastActive && (now - state.lastActive > idleMs)) {
                    console.log(`[Session Sleep] Stopping inactive WhatsApp for Tenant ${tenantId} to save RAM.`);
                    this.stopClient(tenantId);
                }
            }
        }, 60000); // Check every minute
    }
}

module.exports = new WhatsAppManager();
