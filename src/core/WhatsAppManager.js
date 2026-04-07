const wppconnect = require('@wppconnect-team/wppconnect');
const path = require('path');
const fs = require('fs');
const db = require('../database/pg-client');

class WhatsAppManager {
    constructor() {
        this.clients = new Map(); // tenantId -> wppconnect client
        this.states = new Map(); // tenantId -> { status, lastQr, lastActive, phone }
        this.io = null;
        this.MAX_TOTAL_CLIENTS = process.env.MAX_TOTAL_CLIENTS || 5;
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
        const tokenDir = path.join(
            process.env.DATA_DIR || path.join(__dirname, '../../'),
            'storage', `tenant_${tenantId}`, 'wpp_tokens'
        );
        if (!fs.existsSync(tokenDir)) {
            fs.mkdirSync(tokenDir, { recursive: true });
        }

        this.states.set(tenantId, { status: 'INITIALIZING', lastQr: null, lastActive: Date.now(), phone: null });
        this.emitToTenant(tenantId, 'status', 'جاري تهيئة جلسة الواتساب...');

        try {
            let client;
            try {
                client = await wppconnect.create({
                    session: `tenant_${tenantId}`,
                    tokenStore: 'file',
                    folderNameToken: tokenDir,
                    headless: true,
                    useChrome: false,
                    autoClose: 0, // Never auto-close
                    puppeteerOptions: {
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-gpu',
                            '--disable-software-rasterizer',
                            '--disable-extensions',
                            '--no-zygote',
                            '--disable-background-networking',
                            '--disable-default-apps',
                            '--disable-sync',
                            '--disable-translate',
                            '--hide-scrollbars',
                            '--metrics-recording-only',
                            '--mute-audio',
                            '--safebrowsing-disable-auto-update',
                        ]
                    },
                    catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
                        const state = this.states.get(tenantId);
                        if (state) {
                            state.status = 'QUERY_QR';
                            state.lastQr = base64Qrimg; // Already base64 data URI from WPPConnect
                            this.updateActivity(tenantId);
                        }
                        // Emit the base64 QR directly — frontend expects a data URI
                        this.emitToTenant(tenantId, 'qr', base64Qrimg);
                        this.emitToTenant(tenantId, 'status', 'يا هلا! امسح الباركود عشان نربط الواتساب');
                    },
                    statusFind: (statusSession, session) => {
                        console.log(`[Tenant ${tenantId}] WPPConnect status: ${statusSession}`);
                        this._handleStatusChange(tenantId, statusSession);
                    },
                });
            } catch (initErr) {
                // ── BUG-10: Clean up partially-created browser on init failure ──
                if (client && typeof client.close === 'function') {
                    try { await client.close(); } catch (_) {}
                }
                throw initErr;
            }

            // Session is now connected
            this.clients.set(tenantId, client);

            const state = this.states.get(tenantId);
            if (state) {
                state.status = 'READY';
                state.lastQr = null;
                this.updateActivity(tenantId);
            }

            // Get connected phone number
            const hostDevice = await client.getHostDevice();
            const phone = hostDevice && hostDevice.wid ? hostDevice.wid.user : 'Unknown';
            if (state) state.phone = phone;

            this.emitToTenant(tenantId, 'ready', { phone });
            this.emitToTenant(tenantId, 'status', `الواتساب جاهز ومتصل بالرقم (${phone})`);
            console.log(`[Tenant ${tenantId}] WPPConnect client is ready!`);

            // Update tenant status in DB
            await db.query(
                'UPDATE tenants SET whatsapp_status = $1, whatsapp_phone = $2 WHERE id = $3',
                ['connected', phone, tenantId]
            ).catch(err => console.error(`[WhatsAppManager] Failed to update tenant status on connect:`, err.message));

            // Listen for disconnect
            client.onStateChange((state) => {
                console.log(`[Tenant ${tenantId}] State changed: ${state}`);
                if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'UNLAUNCHED') {
                    this.stopClient(tenantId);
                }
            });

            // ── Live Inbox: Listen for incoming messages ──
            client.onMessage(async (message) => {
                try {
                    // Skip status/broadcast/group messages
                    if (message.isGroupMsg || message.from === 'status@broadcast') return;

                    const from = message.from; // e.g. "966501234567@c.us"
                    const body = message.body || '';
                    const timestamp = message.t || Math.floor(Date.now() / 1000);
                    const senderPhone = from.replace('@c.us', '');

                    // Get sender name (contact or pushname)
                    let senderName = message.sender?.pushname || message.sender?.formattedName || senderPhone;

                    // Persist to messages table
                    await db.query(
                        `INSERT INTO messages (tenant_id, remote_phone, sender, direction, body, sender_name, is_read, whatsapp_timestamp)
                         VALUES ($1, $2, $3, $4, $5, $6, FALSE, to_timestamp($7))`,
                        [tenantId, senderPhone, 'them', 'inbound', body, senderName, timestamp]
                    ).catch(err => console.error(`[Tenant ${tenantId}] Failed to save inbound message:`, err.message));

                    // Push to frontend via Socket.io
                    this.emitToTenant(tenantId, 'new_whatsapp_message', {
                        from: senderPhone,
                        name: senderName,
                        body,
                        timestamp,
                        direction: 'inbound',
                    });

                    // Mark as read on WhatsApp
                    await client.sendSeen(from).catch(err => console.error(`[WhatsAppManager] Failed to mark as seen:`, err.message));

                    console.log(`[Tenant ${tenantId}] Inbox: ${senderName} (${senderPhone}): ${body.substring(0, 50)}`);
                } catch (err) {
                    console.error(`[Tenant ${tenantId}] onMessage error:`, err.message);
                }
            });

            return client;
        } catch (err) {
            console.error(`[Tenant ${tenantId}] WPPConnect Init Error:`, err.message);
            this.states.set(tenantId, { status: 'ERROR', error: err.message });
            this.emitToTenant(tenantId, 'status', `خطأ في الاتصال: ${err.message}`);

            // Update tenant status in DB
            await db.query(
                'UPDATE tenants SET whatsapp_status = $1 WHERE id = $2',
                ['error', tenantId]
            ).catch(err => console.error(`[WhatsAppManager] Failed to update tenant error status:`, err.message));

            throw err;
        }
    }

    /**
     * Handle WPPConnect statusFind callbacks and update DB accordingly.
     */
    async _handleStatusChange(tenantId, statusSession) {
        const state = this.states.get(tenantId);

        switch (statusSession) {
            case 'isLogged':
            case 'inChat':
                if (state) state.status = 'READY';
                this.emitToTenant(tenantId, 'status', 'تم التوثيق بنجاح! جاري التحميل...');
                await db.query(
                    'UPDATE tenants SET whatsapp_status = $1 WHERE id = $2',
                    ['connected', tenantId]
                ).catch(err => console.error(`[WhatsAppManager] Failed to update tenant status (logged in):`, err.message));
                break;

            case 'notLogged':
            case 'browserClose':
            case 'desconnectedMobile':
            case 'deleteToken':
                if (state) {
                    state.status = 'DISCONNECTED';
                    state.phone = null;
                    state.lastQr = null;
                }
                this.emitToTenant(tenantId, 'status', 'تم قطع الاتصال بالواتساب.');
                this.clients.delete(tenantId);
                await db.query(
                    'UPDATE tenants SET whatsapp_status = $1, whatsapp_phone = NULL WHERE id = $2',
                    ['disconnected', tenantId]
                ).catch(err => console.error(`[WhatsAppManager] Failed to update tenant status (disconnected):`, err.message));
                break;

            case 'qrReadSuccess':
                this.emitToTenant(tenantId, 'status', 'تم مسح الباركود بنجاح! جاري الربط...');
                break;

            case 'autoClose':
                console.log(`[Tenant ${tenantId}] Session auto-closed.`);
                this.stopClient(tenantId);
                break;

            case 'qrReadFail':
                this.emitToTenant(tenantId, 'status', 'فشل في قراءة الباركود، حاول مرة أخرى.');
                break;
        }
    }

    async stopClient(tenantId) {
        const client = this.clients.get(tenantId);
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.error(`Error closing client for tenant ${tenantId}:`, e.message);
                // Try to kill browser process if close fails
                try { await client.killServiceWorker(); } catch (_) {}
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

        await db.query(
            'UPDATE tenants SET whatsapp_status = $1, whatsapp_phone = NULL WHERE id = $2',
            ['disconnected', tenantId]
        ).catch(err => console.error(`[WhatsAppManager] Failed to update tenant status (stop):`, err.message));
    }

    /**
     * Send a voice note (PTT) to a recipient.
     * WPPConnect's sendPtt() delivers the audio as a WhatsApp voice message
     * (microphone icon) instead of a file attachment — maximising trust & open rates.
     *
     * @param {string|number} tenantId
     * @param {string} to  — chatId e.g. "966501234567@c.us"
     * @param {string} audioFilePath — absolute path to .mp3 / .ogg file on disk
     */
    async sendVoiceNote(tenantId, to, audioFilePath) {
        const client = await this.getClient(tenantId);
        await client.sendPtt(to, audioFilePath);
    }

    // Session Sleep system: sweep inactive sessions to save RAM
    startSleepMonitor(idleMs = 15 * 60 * 1000) {
        this._sleepMonitorId = setInterval(() => {
            const now = Date.now();
            for (const [tenantId, state] of this.states.entries()) {
                if (state.lastActive && (now - state.lastActive > idleMs)) {
                    console.log(`[Session Sleep] Stopping inactive WhatsApp for Tenant ${tenantId} to save RAM.`);
                    this.stopClient(tenantId);
                }
            }
        }, 60000);
    }

    stopSleepMonitor() {
        if (this._sleepMonitorId) {
            clearInterval(this._sleepMonitorId);
            this._sleepMonitorId = null;
            console.log('[WhatsAppManager] Sleep monitor stopped.');
        }
    }
}

module.exports = new WhatsAppManager();
