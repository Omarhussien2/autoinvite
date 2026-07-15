const wppconnect = require('@wppconnect-team/wppconnect');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const db = require('../database/pg-client');
const { createLogger } = require('../utils/logger');
const log = createLogger('WhatsAppManager');

function cleanExecutablePath(value) {
    return value && String(value).trim().replace(/^["']|["']$/g, '');
}

function firstExistingPath(paths) {
    return paths.map(cleanExecutablePath).find((candidate) => candidate && fs.existsSync(candidate));
}

function commandPath(command, args = []) {
    try {
        return cleanExecutablePath(execFileSync(command, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).split(/\r?\n/)[0]);
    } catch (_) {
        return null;
    }
}

class WhatsAppManager {
    constructor() {
        this.clients = new Map(); // tenantId -> wppconnect client
        this.initializing = new Map(); // tenantId -> initialization promise
        this.states = new Map(); // tenantId -> { status, lastQr, lastActive, phone }
        this.io = null;
        this.MAX_TOTAL_CLIENTS = process.env.MAX_TOTAL_CLIENTS || 5;
        this._chromiumExecutablePath = undefined;
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
            const refreshedState = await this.refreshClientState(tenantId, { emit: true });
            if (['READY', 'WORKING', 'DEGRADED'].includes(refreshedState.status) && this.clients.has(tenantId)) {
                return this.clients.get(tenantId);
            }
        }

        if (this.initializing.has(tenantId)) {
            return this.initializing.get(tenantId);
        }

        if (this.clients.size >= this.MAX_TOTAL_CLIENTS) {
            throw new Error('النظام استنفد كامل طاقته حالياً. يرجى المحاولة لاحقاً (Server at capacity)');
        }

        const initPromise = this.initializeClient(tenantId)
            .finally(() => {
                this.initializing.delete(tenantId);
            });
        this.initializing.set(tenantId, initPromise);
        return initPromise;
    }

    getTenantState(tenantId) {
        return this.states.get(tenantId) || { status: 'DISCONNECTED', lastQr: null, phone: null };
    }

    async refreshClientState(tenantId, { emit = false } = {}) {
        const client = this.clients.get(tenantId);
        if (!client) return this.getTenantState(tenantId);

        try {
            const hostDevice = await client.getHostDevice();
            const phone = hostDevice && hostDevice.wid ? hostDevice.wid.user : 'Unknown';
            const state = {
                ...this.getTenantState(tenantId),
                status: 'READY',
                lastQr: null,
                lastActive: Date.now(),
                phone,
            };

            this.states.set(tenantId, state);

            if (emit) {
                this.emitToTenant(tenantId, 'ready', { phone });
                this.emitToTenant(tenantId, 'status', `الواتساب جاهز ومتصل بالرقم (${phone})`);
            }

            await db.query(
                'UPDATE tenants SET whatsapp_status = $1, whatsapp_phone = $2 WHERE id = $3',
                ['connected', phone, tenantId]
            ).catch(err => log.error('Failed to refresh tenant WhatsApp status:', err.message));

            return state;
        } catch (err) {
            const previousState = this.getTenantState(tenantId);
            const state = {
                ...previousState,
                status: ['READY', 'WORKING'].includes(previousState.status) ? 'DEGRADED' : previousState.status,
                lastQr: null,
                lastActive: Date.now(),
                probeError: err.message,
            };
            this.states.set(tenantId, state);

            if (emit) {
                this.emitToTenant(tenantId, 'status', 'تعذر التحقق من حالة واتساب. لن يعيد النظام الربط تلقائيًا.');
            }

            log.warn(`WhatsApp state probe failed for tenant ${tenantId}; keeping the existing session closed to new sends:`, err.message);
            return state;
        }
    }

    hasStoredSession(tenantId) {
        const sessionPath = path.join(
            process.env.DATA_DIR || path.join(__dirname, '../../'),
            'storage', `tenant_${tenantId}`, 'wpp_tokens', `tenant_${tenantId}`
        );

        try {
            return fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
        } catch (_) {
            return false;
        }
    }

    updateActivity(tenantId) {
        if (this.states.has(tenantId)) {
            const state = this.states.get(tenantId);
            state.lastActive = Date.now();
        }
    }

    _resolveChromiumExecutablePath() {
        if (this._chromiumExecutablePath !== undefined) return this._chromiumExecutablePath;

        const envPath = firstExistingPath([process.env.CHROMIUM_PATH, process.env.PUPPETEER_EXECUTABLE_PATH]);
        if (envPath) {
            this._chromiumExecutablePath = envPath;
            log.info(`Using Chromium executable from environment: ${envPath}`);
            return this._chromiumExecutablePath;
        }

        const platformCandidates = process.platform === 'win32'
            ? [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            ]
            : [
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/snap/bin/chromium',
            ];

        const knownPath = firstExistingPath(platformCandidates);
        if (knownPath) {
            this._chromiumExecutablePath = knownPath;
            log.info(`Using Chromium executable: ${knownPath}`);
            return this._chromiumExecutablePath;
        }

        const detectedPath = process.platform === 'win32'
            ? firstExistingPath([
                commandPath('where.exe', ['chrome']),
                commandPath('where.exe', ['msedge']),
                commandPath('where.exe', ['chromium']),
            ])
            : firstExistingPath([
                commandPath('which', ['google-chrome']),
                commandPath('which', ['google-chrome-stable']),
                commandPath('which', ['chromium']),
                commandPath('which', ['chromium-browser']),
            ]);

        this._chromiumExecutablePath = detectedPath || null;
        if (this._chromiumExecutablePath) {
            log.info(`Auto-detected Chromium executable: ${this._chromiumExecutablePath}`);
        } else {
            log.warn('No system Chrome/Chromium executable detected; WPPConnect will fall back to Puppeteer defaults.');
        }

        return this._chromiumExecutablePath;
    }

    _normalizeQrImage(qrImage) {
        if (!qrImage || typeof qrImage !== 'string') return qrImage;
        const trimmed = qrImage.trim();
        if (trimmed.startsWith('data:image/')) return trimmed;
        return `data:image/png;base64,${trimmed}`;
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
                const chromiumExecutablePath = this._resolveChromiumExecutablePath();
                client = await wppconnect.create({
                    session: `tenant_${tenantId}`,
                    tokenStore: 'file',
                    folderNameToken: tokenDir,
                    headless: true,
                    useChrome: !chromiumExecutablePath,
                    autoClose: 0, // Never auto-close
                    puppeteerOptions: {
                        ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
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
                        const qrImage = this._normalizeQrImage(base64Qrimg);
                        const state = this.states.get(tenantId);
                        if (state) {
                            state.status = 'QUERY_QR';
                            state.lastQr = qrImage;
                            this.updateActivity(tenantId);
                        }
                        // Emit the base64 QR directly — frontend expects a data URI
                        this.emitToTenant(tenantId, 'qr', qrImage);
                        this.emitToTenant(tenantId, 'status', 'يا هلا! امسح الباركود عشان نربط الواتساب');
                    },
                    statusFind: (statusSession, session) => {
                        log.info(`WPPConnect status: ${statusSession}`);
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
            log.info(`WPPConnect client is ready!`);

            // Update tenant status in DB
            await db.query(
                'UPDATE tenants SET whatsapp_status = $1, whatsapp_phone = $2 WHERE id = $3',
                ['connected', phone, tenantId]
            ).catch(err => log.error('Failed to update tenant status on connect:', err.message));

            // Listen for disconnect
            client.onStateChange((state) => {
                log.info(`State changed: ${state}`);
                if (state === 'CONFLICT' || state === 'UNPAIRED') {
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
                    ).catch(err => log.error('Failed to save inbound message:', err.message));

                    // Push to frontend via Socket.io
                    this.emitToTenant(tenantId, 'new_whatsapp_message', {
                        from: senderPhone,
                        name: senderName,
                        body,
                        timestamp,
                        direction: 'inbound',
                    });

                    log.info(`Inbox: ${senderName} (${senderPhone}): ${body.substring(0, 50)}`);
                } catch (err) {
                    log.error('onMessage error:', err.message);
                }
            });

            return client;
        } catch (err) {
            log.error(`WPPConnect Init Error:`, err.message);
            this.states.set(tenantId, { status: 'ERROR', error: err.message });
            this.emitToTenant(tenantId, 'status', `خطأ في الاتصال: ${err.message}`);

            // Update tenant status in DB
            await db.query(
                'UPDATE tenants SET whatsapp_status = $1 WHERE id = $2',
                ['error', tenantId]
            ).catch(err => log.error('Failed to update tenant error status:', err.message));

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
                ).catch(err => log.error('Failed to update tenant status (logged in):', err.message));
                break;

            case 'notLogged':
                if (state) {
                    state.status = state.lastQr ? 'QUERY_QR' : 'INITIALIZING';
                    state.phone = null;
                    this.updateActivity(tenantId);
                }
                await db.query(
                    'UPDATE tenants SET whatsapp_status = $1, whatsapp_phone = NULL WHERE id = $2',
                    ['disconnected', tenantId]
                ).catch(err => log.error('Failed to update tenant status (not logged):', err.message));
                break;

            case 'browserClose':
            case 'desconnectedMobile':
            case 'deleteToken':
                if (state) {
                    state.status = 'DISCONNECTED';
                    state.phone = null;
                    state.lastQr = null;
                }
                this.emitToTenant(tenantId, 'status', 'تم قطع الاتصال بالواتساب.');
                this.emitToTenant(tenantId, 'disconnected');
                this.clients.delete(tenantId);
                await db.query(
                    'UPDATE tenants SET whatsapp_status = $1, whatsapp_phone = NULL WHERE id = $2',
                    ['disconnected', tenantId]
                ).catch(err => log.error('Failed to update tenant status (disconnected):', err.message));
                break;

            case 'qrReadSuccess':
                this.emitToTenant(tenantId, 'status', 'تم مسح الباركود بنجاح! جاري الربط...');
                break;

            case 'autoClose':
                log.info('Session auto-closed.');
                this.stopClient(tenantId);
                break;

            case 'qrReadFail':
                this.emitToTenant(tenantId, 'status', 'فشل في قراءة الباركود، حاول مرة أخرى.');
                break;
        }
    }

    async logoutClient(tenantId) {
        const client = this.clients.get(tenantId);

        // Step 1: Officially unlink device from WhatsApp servers
        if (client) {
            try { await client.logout(); } catch (e) {
                log.error(`logout() failed for tenant ${tenantId}:`, e.message);
            }
            try { await client.close(); } catch (e) {
                log.error(`close() failed for tenant ${tenantId}:`, e.message);
            }
            this.clients.delete(tenantId);
        }

        // Step 2: Delete physical session tokens so it cannot auto-reconnect
        const tokenDir = path.join(
            process.env.DATA_DIR || path.join(__dirname, '../../'),
            'storage', `tenant_${tenantId}`, 'wpp_tokens'
        );
        try {
            if (fs.existsSync(tokenDir)) {
                fs.rmSync(tokenDir, { recursive: true, force: true });
                log.info(`Deleted token folder for tenant ${tenantId}`);
            }
        } catch (e) {
            log.error('Failed to delete token folder:', e.message);
        }

        // Step 3: Reset state
        this.states.set(tenantId, { status: 'DISCONNECTED', lastQr: null, lastActive: Date.now(), phone: null });
        this.emitToTenant(tenantId, 'disconnected');

        // Step 4: Update DB
        await db.query(
            'UPDATE tenants SET whatsapp_status = $1, whatsapp_phone = NULL WHERE id = $2',
            ['disconnected', tenantId]
        ).catch(err => log.error('Failed to update tenant status (logout):', err.message));

        log.info(`WhatsApp session removed for tenant ${tenantId}; explicit initialization is required for a new QR.`);
    }

    async stopClient(tenantId) {
        if (this.initializing.has(tenantId)) {
            try {
                await this.initializing.get(tenantId);
            } catch (_) {}
        }

        const client = this.clients.get(tenantId);
        if (client) {
            try {
                await client.close();
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (e) {
                log.error(`Error closing client for tenant ${tenantId}:`, e.message);
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

        this.emitToTenant(tenantId, 'disconnected');

        await db.query(
            'UPDATE tenants SET whatsapp_status = $1, whatsapp_phone = NULL WHERE id = $2',
            ['disconnected', tenantId]
        ).catch(err => log.error('Failed to update tenant status (stop):', err.message));
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
                    log.info(`Stopping inactive WhatsApp for Tenant ${tenantId} to save RAM.`);
                    this.stopClient(tenantId);
                }
            }
        }, 60000);
    }

    stopSleepMonitor() {
        if (this._sleepMonitorId) {
            clearInterval(this._sleepMonitorId);
            this._sleepMonitorId = null;
            log.info('Sleep monitor stopped.');
        }
    }
}

module.exports = new WhatsAppManager();
