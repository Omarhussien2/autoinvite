require('dotenv').config();

// ── Startup Environment Validation ──────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'SESSION_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error(`❌ FATAL: Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Copy .env.example to .env and fill in the values.');
    process.exit(1);
}
if (process.env.SESSION_SECRET === 'autoinvite-change-me-in-production' && process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: SESSION_SECRET is still the default placeholder. Generate a strong secret with: openssl rand -hex 32');
    process.exit(1);
}
// ────────────────────────────────────────────────────────────────────────────

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
// QRCode no longer needed — WPPConnect provides base64 QR directly
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const db = require('./database/pg-client');
const { WhatsAppManager, loadContacts, processBatch } = require('./core');
const ScheduleManager = require('./core/ScheduleManager');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const adminRoutes = require('./routes/admin');
const { isAuthenticated } = require('./middleware/auth');
const { i18next, middleware: i18nMiddleware } = require('./config/i18n');
const ejsLayout = require('./middleware/ejsLayout');

const PgSession = connectPgSimple(session);

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- VIEW ENGINE SETUP (EJS) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- TRUST PROXY (CRITICAL for reverse-proxy/Nginx deployments) ---
// Without this, Express ignores X-Forwarded-Proto from Nginx.
// When cookie.secure=true in production, sessions silently fail
// because Express thinks the connection is HTTP (Nginx→Node is plain HTTP).
app.set('trust proxy', 1);

WhatsAppManager.setIo(io);
WhatsAppManager.startSleepMonitor(15 * 60 * 1000);
ScheduleManager.start(60000);

const PORT = process.env.PORT || 5000;

// Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- i18next MIDDLEWARE ---
app.use(i18nMiddleware.handle(i18next));

// Session Setup — persistent via PostgreSQL
const isProduction = process.env.NODE_ENV === 'production';
// SAFE DEFAULT: Only set secure=true when explicitly confirmed via env.
// This prevents silent session failures on HTTP-only proxy setups.
const cookieSecure = process.env.COOKIE_SECURE === 'true';

const PgStore = new PgSession({
    pool: db.pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
});

// Log PgSession errors so we can catch silent DB failures
PgStore.on('error', (err) => {
    console.error('❌ [PgSession Store Error]:', err.message || err);
});

const sessionMiddleware = session({
    store: PgStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: cookieSecure,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// --- EJS LAYOUT MIDDLEWARE ---
app.use(ejsLayout);

// --- API ROUTES ---
app.use('/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/whatsapp', require('./routes/whatsapp.api.js'));

// --- ADMIN ROUTES ---
app.use('/admin', adminRoutes);

// --- BILLING ROUTES ---
app.use('/billing', require('./routes/billing'));

// Tenant Settings API
app.put('/api/tenant/settings', isAuthenticated, async (req, res) => {
    try {
        const { name, settings } = req.body;

        if (!name || typeof name !== 'string' || name.length < 3) {
            return res.status(400).json({ success: false, message: 'Invalid name' });
        }
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ success: false, message: 'Settings must be an object' });
        }

        await db.query('UPDATE tenants SET name = $1, settings = $2 WHERE id = $3', [name, JSON.stringify(settings), req.session.tenantId]);
        req.session.tenantName = name;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Tenant Password Change API
app.put('/api/tenant/password', isAuthenticated, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        const tenantId = req.session.tenantId;

        if (!current_password || !new_password) {
            return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
        }

        if (new_password.length < 8) {
            return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
        }

        const bcrypt = require('bcrypt');
        const result = await db.query('SELECT password_hash FROM tenants WHERE id = $1', [tenantId]);
        const tenant = result.rows[0];

        if (!tenant) {
            return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
        }

        const match = await bcrypt.compare(current_password, tenant.password_hash);
        if (!match) {
            return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE tenants SET password_hash = $1 WHERE id = $2', [hashedPassword, tenantId]);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Tenant General Stats API
// Contacts API — create + delete
┄─

app.post('/api/contacts', isAuthenticated, async (req, res) => {
    try {
        const { name, phone } = req.body;
        const tenantId = req.session.tenantId;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'الاسم مطلوب' });
        }

        if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب' });
        }

        const result = await db.query('SELECT id FROM contacts WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
        if (!contact) {
            return res.status(404).json({ success: false, message: 'جهة اتصال غير موج' });
        }

        await db.query(
            'INSERT INTO contacts (tenant_id, name, phone, status) VALUES ($1, $2, $3, $4, $5)',
            [tenantId, name, phone, 'manual']
        );

        res.json({ success: true, contact: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Contacts API — delete
┄─
app.delete('/api/contacts/:id', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const contactId = req.params.id;

        await db.query('DELETE FROM contacts WHERE id = $1 AND tenant_id = $2', [contactId, tenantId]);
        if (!contact) {
            return res.status(404).json({ success: false, message: 'جهة اتصال غير موج' });
        }
        await db.query('DELETE FROM contacts WHERE tenant_id = $1 AND campaign_id = $2', [tenantId, campaignId]);
        if (result.rows.length > 0) {
            return res.status(404).json({ success: false, message: 'لا يمكن حذف جهات اتصال مرتبطةطة بحملة أخرى (حملة نفس) });
        }
        await db.query('DELETE FROM contacts WHERE id = $1 AND tenant_id = $2', [contactId, tenantId]);

        res.json({ success: true, contact: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
}); isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const contactsCount = await db.query('SELECT COUNT(*) FROM contacts WHERE tenant_id = $1', [tenantId]);
        const campaignResult = await db.query('SELECT * FROM campaigns WHERE tenant_id = $1', [tenantId]);
        const sentResult = await db.query('SELECT COUNT(*) FROM sent_logs WHERE tenant_id = $1 AND (status IS NULL OR status = $2)', [tenantId, 'success']);
        const tenantRes = await db.query('SELECT message_quota, messages_used FROM tenants WHERE id = $1', [tenantId]);

        const tenant = tenantRes.rows[0] || { message_quota: 1000, messages_used: 0 };

        res.json({
            success: true,
            stats: {
                contacts: parseInt(contactsCount.rows[0].count || 0),
                campaigns: campaignResult.rows.length,
                messagesSent: parseInt(sentResult.rows[0].count || 0),
                activeCampaigns: campaignResult.rows.filter(c => c.status === 'active' || c.status === 'running').length,
                messageQuota: parseInt(tenant.message_quota || 1000),
                messagesUsed: parseInt(tenant.messages_used || 0),
                quotaRemaining: Math.max(0, parseInt(tenant.message_quota || 1000) - parseInt(tenant.messages_used || 0))
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Prevent Chrome/Puppeteer crashes from killing the entire server
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection (server stays alive):', reason?.message || reason);
});

// ── BUG-8: Graceful shutdown — clean up WhatsApp clients & intervals on SIGTERM ──
function gracefulShutdown(signal) {
    console.log(`\n ${signal} received — shutting down gracefully...`);
    WhatsAppManager.stopSleepMonitor();
    ScheduleManager.stop();

    // Stop all active WhatsApp clients
    for (const [tenantId] of WhatsAppManager.clients.entries()) {
        console.log(`[Shutdown] Stopping WhatsApp client for tenant ${tenantId}`);
        WhatsAppManager.stopClient(tenantId).catch(err => console.error('[Shutdown] Error stopping WA client:', err.message));
    }

    // Close database pool
    try { db.pool.end(); } catch (_) {}

    // Close HTTP server
    server.close(() => {
        console.log('✅ HTTP server closed.');
        process.exit(0);
    });

    // Force exit after 10s if cleanup stalls
    setTimeout(() => {
        console.error('⚠️ Forced shutdown after 10s timeout.');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- UI ROUTES (DYNAMIC EJS) ---

// 1. Landing Page (Public) — served from landing-autoinvite React build
const landingDistPath = path.join(__dirname, '../landing-autoinvite/dist');
const landingIndexPath = path.join(landingDistPath, 'index.html');

// Auto-build landing page if dist doesn't exist
if (!fs.existsSync(landingIndexPath)) {
    console.log('⚙️ Landing page dist not found, attempting build...');
    try {
        const { execSync } = require('child_process');
        execSync('cd landing-autoinvite && npm install && npm run build', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
        console.log('✅ Landing page built successfully.');
    } catch (buildErr) {
        console.warn('⚠️ Landing page build failed:', buildErr.message);
    }
}

// Serve landing page JS/CSS assets
app.use('/assets', express.static(path.join(landingDistPath, 'assets')));

// Landing page root
app.get('/', (req, res) => {
    if (fs.existsSync(landingIndexPath)) {
        res.sendFile(landingIndexPath);
    } else {
        console.warn('[Landing] index.html not found at:', landingIndexPath);
        res.redirect('/login');
    }
});

// 2. Login Page (Public EJS)
app.get('/login', (req, res) => {
    if (req.session.tenantId) return res.redirect('/dashboard');
    res.render('auth/login');
});

// 3. Protected Dashboard Overview
app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;

        let contactsTotal = 0;
        try {
            const contactsCount = await db.query('SELECT COUNT(*) FROM contacts WHERE tenant_id = $1', [tenantId]);
            contactsTotal = contactsCount.rows[0].count;
        } catch (e) { /* contacts table may not exist yet */ }

        const campaignResult = await db.query('SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
        const campaigns = campaignResult.rows;

        const sentResult = await db.query(
            'SELECT COUNT(*) FROM sent_logs WHERE tenant_id = $1 AND (status IS NULL OR status = $2)',
            [tenantId, 'success']
        );

        // Quota data
        const tenantRes = await db.query('SELECT message_quota, messages_used FROM tenants WHERE id = $1', [tenantId]);
        const tenant = tenantRes.rows[0] || { message_quota: 1000, messages_used: 0 };

        const stats = {
            contacts: contactsTotal,
            campaigns: campaigns.length,
            messagesSent: sentResult.rows[0].count,
            activeCampaigns: campaigns.filter(c => c.status === 'active' || c.status === 'running').length,
            messageQuota: parseInt(tenant.message_quota || 1000),
            messagesUsed: parseInt(tenant.messages_used || 0),
            quotaRemaining: Math.max(0, parseInt(tenant.message_quota || 1000) - parseInt(tenant.messages_used || 0))
        };

        // Real chart data: last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const chartRes = await db.query(`
            SELECT
                DATE(sent_at) AS day,
                COUNT(*) AS count
            FROM sent_logs
            WHERE tenant_id = $1
              AND (status IS NULL OR status = 'success')
              AND sent_at >= $2
            GROUP BY DATE(sent_at)
            ORDER BY day ASC
        `, [tenantId, sevenDaysAgo]);

        const dayLabels = [];
        const dayData = [];
        const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            dayLabels.push(dayNames[d.getDay()]);
            const match = chartRes.rows.find(r => r.day && r.day.toISOString().split('T')[0] === dateStr);
            dayData.push(match ? parseInt(match.count) : 0);
        }

        res.renderPage('dashboard/index', {
            pageTitle: 'لوحة التحكم',
            activePage: 'dashboard',
            useSocket: true,
            tenantName: req.session.tenantName || 'العميل',
            stats,
            campaigns,
            chartLabels: dayLabels,
            chartData: dayData
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// 4. Campaigns List View
app.get('/campaigns', isAuthenticated, async (req, res) => {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const [campaignRes, totalRes, monthlyRes, dailyRes, campaignStatsRes] = await Promise.all([
            db.query('SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC', [req.session.tenantId]),
            db.query('SELECT COUNT(*) FROM sent_logs WHERE tenant_id = $1 AND (status IS NULL OR status = $2)', [req.session.tenantId, 'success']),
            db.query('SELECT COUNT(*) FROM sent_logs WHERE tenant_id = $1 AND (status IS NULL OR status = $2) AND sent_at >= $3', [req.session.tenantId, 'success', monthStart]),
            db.query('SELECT COUNT(*) FROM sent_logs WHERE tenant_id = $1 AND (status IS NULL OR status = $2) AND sent_at >= $3', [req.session.tenantId, 'success', todayStart]),
            db.query(`SELECT campaign_id,
                         COUNT(*) FILTER (WHERE status IS NULL OR status = 'success') AS sent_count,
                         COUNT(*) AS total_count
                       FROM sent_logs WHERE tenant_id = $1 GROUP BY campaign_id`, [req.session.tenantId]),
        ]);

        // Build a map of campaignId -> { sent, total } for real progress calculation
        const sentCountMap = {};
        for (const row of campaignStatsRes.rows) {
            sentCountMap[row.campaign_id] = {
                sent: parseInt(row.sent_count || 0),
                total: parseInt(row.total_count || 0)
            };
        }

        const DAILY_SAFE = 200;
        const totalDelivered = parseInt(totalRes.rows[0].count || 0);
        const monthlyCount  = parseInt(monthlyRes.rows[0].count || 0);
        const dailyCount    = parseInt(dailyRes.rows[0].count || 0);
        const dailyPct      = Math.min(100, Math.round((dailyCount / DAILY_SAFE) * 100));
        const safetyLevel   = dailyPct < 50 ? 'safe' : dailyPct < 85 ? 'warning' : 'danger';

        res.renderPage('dashboard/campaigns', {
            pageTitle: 'الحملات',
            pageSubtitle: 'إضافة وإدارة حملات الواتساب',
            activePage: 'campaigns',
            campaigns: campaignRes.rows,
            sentCountMap,
            tenantName: req.session.tenantName,
            quota: { totalDelivered, monthlyCount, dailyCount, dailySafe: DAILY_SAFE, dailyPct, safetyLevel },
            topbarActions: `<a href="/campaigns/new" class="inline-flex items-center gap-1.5 bg-brand-dark text-white text-xs px-3.5 py-2 rounded-xl font-medium hover:opacity-90 transition shadow-sm">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                إنشاء حملة
            </a>`
        });
    } catch (err) {
        res.status(500).send('Error loading campaigns');
    }
});

// 5. Contacts Management View
app.get('/contacts', isAuthenticated, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT c.*, camp.name as campaign_name 
            FROM contacts c 
            LEFT JOIN campaigns camp ON c.campaign_id = camp.id 
            WHERE c.tenant_id = $1 
            ORDER BY c.created_at DESC
        `, [req.session.tenantId]);

        res.renderPage('dashboard/contacts', {
            pageTitle: 'جهات الاتصال',
            pageSubtitle: 'إدارة جميع جهات الاتصال المرفوعة',
            activePage: 'contacts',
            contacts: result.rows,
            tenantName: req.session.tenantName
        });
    } catch (err) {
        res.status(500).send('Error loading contacts');
    }
});

// 6. Settings View
app.get('/settings', isAuthenticated, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM tenants WHERE id = $1', [req.session.tenantId]);
        const tenant = result.rows[0];
        if (!tenant.settings) tenant.settings = {};

        res.renderPage('dashboard/settings', {
            pageTitle: 'الإعدادات',
            pageSubtitle: 'إدارة حسابك وإعدادات الإرسال',
            activePage: 'settings',
            tenant,
            tenantName: req.session.tenantName
        });
    } catch (err) {
        res.status(500).send('Error loading settings');
    }
});

// 7. Reports & History View
app.get('/reports', isAuthenticated, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT sl.*, c.name as campaign_name 
            FROM sent_logs sl
            LEFT JOIN campaigns c ON sl.campaign_id = c.id
            WHERE sl.tenant_id = $1
            ORDER BY sl.sent_at DESC
        `, [req.session.tenantId]);

        const logs = result.rows;
        const totalCount = logs.length;
        const successCount = logs.filter(l => !l.status || l.status === 'success').length;
        const failedCount = logs.filter(l => l.status === 'failed').length;
        const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : '0.0';

        const campaignCounts = {};
        logs.forEach(l => {
            const name = l.campaign_name || 'حملة محذوفة';
            campaignCounts[name] = (campaignCounts[name] || 0) + 1;
        });
        const mostActiveCampaign = Object.entries(campaignCounts).sort((a, b) => b[1] - a[1])[0];

        res.renderPage('dashboard/reports', {
            pageTitle: 'التقارير',
            pageSubtitle: 'تاريخ الإرسال المفصل',
            activePage: 'reports',
            logs,
            reportStats: { totalCount, successCount, failedCount, successRate, mostActiveCampaign },
            tenantName: req.session.tenantName
        });
    } catch (err) {
        res.status(500).send('Error loading reports');
    }
});

// 8. Live Inbox View
app.get('/inbox', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;

        // Get distinct conversations with latest message, sorted by most recent first
        const conversationsRes = await db.query(`
            SELECT c.* FROM (
                SELECT DISTINCT ON (remote_phone)
                    remote_phone, sender, body, direction, sender_name, whatsapp_timestamp, created_at
                FROM messages
                WHERE tenant_id = $1
                ORDER BY remote_phone, created_at DESC
            ) c
            ORDER BY c.created_at DESC
        `, [tenantId]);

        // Unread counts per conversation
        const unreadRes = await db.query(`
            SELECT remote_phone, COUNT(*) as unread
            FROM messages
            WHERE tenant_id = $1 AND direction = 'inbound' AND is_read = FALSE
            GROUP BY remote_phone
        `, [tenantId]);
        const unreadMap = {};
        unreadRes.rows.forEach(r => { unreadMap[r.remote_phone] = parseInt(r.unread); });

        res.renderPage('dashboard/inbox', {
            pageTitle: 'صندوق الردود',
            pageSubtitle: 'آخر الرسائل الواردة',
            activePage: 'inbox',
            useSocket: true,
            tenantName: req.session.tenantName || 'العميل',
            conversations: conversationsRes.rows,
            unreadMap,
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading inbox');
    }
});

// Inbox API: Get messages for a specific conversation + mark as read
app.get('/api/inbox/:phone/messages', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const phone = req.params.phone;

        const result = await db.query(
            `SELECT * FROM messages WHERE tenant_id = $1 AND remote_phone = $2 ORDER BY created_at ASC LIMIT 200`,
            [tenantId, phone]
        );

        // Mark all inbound messages from this phone as read
        await db.query(
            `UPDATE messages SET is_read = TRUE WHERE tenant_id = $1 AND remote_phone = $2 AND direction = 'inbound' AND is_read = FALSE`,
            [tenantId, phone]
        ).catch(err => console.error('[Inbox] Failed to mark messages as read:', err.message));

        res.json({ success: true, messages: result.rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Inbox API: Send a reply
app.post('/api/inbox/:phone/reply', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const phone = req.params.phone;
        const { body } = req.body;

        if (!body || typeof body !== 'string' || body.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'الرسالة فارغة' });
        }

        const client = await WhatsAppManager.getClient(tenantId);
        const chatId = `${phone}@c.us`;

        await client.sendText(chatId, body.trim());

        // Save outbound message
        await db.query(
            `INSERT INTO messages (tenant_id, remote_phone, sender, direction, body, whatsapp_timestamp)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [tenantId, phone, 'me', 'outbound', body.trim()]
        );

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 9. Registration Page (Public)
app.get('/register', (req, res) => {
    if (req.session.tenantId) return res.redirect('/dashboard');
    res.render('auth/register');
});

// 9. Create/Edit Campaign View
app.get('/campaigns/new', isAuthenticated, (req, res) => {
    res.renderPage('dashboard/campaign-form', { pageTitle: 'حملة جديدة', activePage: 'campaigns', breadcrumb: { href: '/campaigns' }, campaign: null, tenantName: req.session.tenantName });
});

app.get('/campaigns/:id/edit', isAuthenticated, async (req, res) => {
    const result = await db.query('SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, req.session.tenantId]);
    if (result.rows.length === 0) return res.status(404).send('Campaign not found');
    res.renderPage('dashboard/campaign-form', { pageTitle: 'تعديل الحملة', activePage: 'campaigns', breadcrumb: { href: '/campaigns' }, campaign: result.rows[0], tenantName: req.session.tenantName });
});

// 10. Campaign Run/Monitor View
app.get('/campaigns/:id/run', isAuthenticated, async (req, res) => {
    const result = await db.query('SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, req.session.tenantId]);
    if (result.rows.length === 0) return res.status(404).send('Campaign not found');
    const campaign = result.rows[0];
    let contactsCount = 0;
    try {
        const { loadContacts } = require('./core');
        const contacts = await loadContacts(campaign.contacts_path);
        contactsCount = contacts.length;
    } catch (e) { /* file may not exist yet */ }
    res.renderPage('dashboard/run-campaign', { pageTitle: 'تنفيذ الحملة', pageSubtitle: 'متابعة الإرسال مباشرة', activePage: 'campaigns', breadcrumb: { href: '/campaigns' }, useSocket: true, campaign, contactsCount, tenantName: req.session.tenantName });
});

// --- ASSETS & STATIC ---
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', isAuthenticated, (req, res, next) => {
    const tenantUploads = path.join(__dirname, `../storage/tenant_${req.session.tenantId}/uploads`);
    express.static(tenantUploads)(req, res, next);
});

// --- SOCKET.IO HANDLER ---
io.on('connection', async (socket) => {
    const req = socket.request;
    if (!req.session || !req.session.tenantId) {
        socket.disconnect();
        return;
    }

    const tenantId = req.session.tenantId;
    const tenantRoom = `tenant_${tenantId}`;
    socket.join(tenantRoom);

    console.log(`📡 Socket connected: Tenant ${tenantId}`);

    try { await WhatsAppManager.getClient(tenantId); } catch (e) { }

    const state = WhatsAppManager.getTenantState(tenantId);
    if (state.status === 'QUERY_QR' && state.lastQr) {
        // WPPConnect catchQR already provides base64 data URI — emit directly
        socket.emit('qr', state.lastQr);
    } else if (state.status === 'READY') {
        socket.emit('ready', { phone: state.phone });
    }
});

console.log(`🔧 Session config: trustProxy=1 | cookie.secure=${cookieSecure} | env=${process.env.NODE_ENV || 'development'}`);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SaaS Platform running on http://localhost:${PORT}`);
});
