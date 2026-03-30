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
const QRCode = require('qrcode');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const db = require('./database/pg-client');
const { WhatsAppManager, loadContacts, processBatch } = require('./core');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
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

WhatsAppManager.setIo(io);
WhatsAppManager.startSleepMonitor(15 * 60 * 1000); // 15 mins idle sleep

const PORT = process.env.PORT || 5000; // C-06: Default to 5000 for Replit

// Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- i18next MIDDLEWARE ---
app.use(i18nMiddleware.handle(i18next));

// Session Setup — persistent via PostgreSQL (survives restarts & PM2 reloads)
const sessionMiddleware = session({
    store: new PgSession({
        pool: db.pool,               // Reuse existing pg Pool (no extra connection)
        tableName: 'user_sessions',
        createTableIfMissing: true   // auto-create session table on first run
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
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

// Tenant Settings API
app.put('/api/tenant/settings', isAuthenticated, async (req, res) => {
    try {
        const { name, settings } = req.body;

        // Basic Validation
        if (!name || typeof name !== 'string' || name.length < 3) {
            return res.status(400).json({ success: false, message: 'Invalid name' });
        }
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ success: false, message: 'Settings must be an object' });
        }

        await db.query('UPDATE tenants SET name = $1, settings = $2 WHERE id = $3', [name, JSON.stringify(settings), req.session.tenantId]);
        req.session.tenantName = name; // Update session
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Tenant General Stats API
app.get('/api/tenant/stats', isAuthenticated, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const contactsCount = await db.query('SELECT COUNT(*) FROM contacts WHERE tenant_id = $1', [tenantId]);
        const campaignResult = await db.query('SELECT * FROM campaigns WHERE tenant_id = $1', [tenantId]);
        const sentResult = await db.query('SELECT COUNT(*) FROM sent_logs WHERE tenant_id = $1', [tenantId]);

        res.json({
            success: true,
            stats: {
                contacts: parseInt(contactsCount.rows[0].count || 0),
                campaigns: campaignResult.rows.length,
                messagesSent: parseInt(sentResult.rows[0].count || 0),
                activeCampaigns: campaignResult.rows.filter(c => c.status === 'active' || c.status === 'running').length
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

// --- UI ROUTES (DYNAMIC EJS) ---

// 1. Landing Page (Public)
app.get('/', (req, res) => {
    // For now, still serving static landing but could be EJS
    res.sendFile(path.join(__dirname, '../public/landing.html'));
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

        // Fetch stats for the dashboard
        let contactsTotal = 0;
        try {
            const contactsCount = await db.query('SELECT COUNT(*) FROM contacts WHERE tenant_id = $1', [tenantId]);
            contactsTotal = contactsCount.rows[0].count;
        } catch (e) { /* contacts table may not exist yet */ }
        const campaignResult = await db.query('SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
        const campaigns = campaignResult.rows;

        // Fetch Delivered Count from sent_logs
        const sentResult = await db.query('SELECT COUNT(*) FROM sent_logs WHERE tenant_id = $1', [tenantId]);

        const stats = {
            contacts: contactsTotal,
            campaigns: campaigns.length,
            messagesSent: sentResult.rows[0].count,
            activeCampaigns: campaigns.filter(c => c.status === 'active' || c.status === 'running').length
        };

        res.renderPage('dashboard/index', {
            pageTitle: 'لوحة التحكم',
            activePage: 'dashboard',
            useSocket: true,
            tenantName: req.session.tenantName || 'العميل',
            stats,
            campaigns,
            chartLabels: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
            chartData: [0, 0, 0, 0, 0, 0, 0],
            trialActive: true
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

// 4. Campaigns List View
app.get('/campaigns', isAuthenticated, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC', [req.session.tenantId]);
        const sentResult = await db.query('SELECT COUNT(*) FROM sent_logs WHERE tenant_id = $1', [req.session.tenantId]);
        const delivered = parseInt(sentResult.rows[0].count || 0);
        const limit = 5000;
        const remaining = Math.max(0, limit - delivered);
        const progressPct = Math.min(100, Math.round((delivered / limit) * 100));

        res.renderPage('dashboard/campaigns', {
            pageTitle: 'الحملات',
            pageSubtitle: 'إضافة وإدارة حملات الواتساب',
            activePage: 'campaigns',
            campaigns: result.rows,
            tenantName: req.session.tenantName,
            quota: { limit, delivered, remaining, progressPct },
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

        res.renderPage('dashboard/reports', {
            pageTitle: 'التقارير',
            pageSubtitle: 'تاريخ الإرسال المفصل',
            activePage: 'reports',
            logs: result.rows,
            tenantName: req.session.tenantName
        });
    } catch (err) {
        res.status(500).send('Error loading reports');
    }
});

// 8. Registration Page (Public)
app.get('/register', (req, res) => {
    if (req.session.tenantId) return res.redirect('/dashboard');
    res.render('auth/register');
});

// 8. Create/Edit Campaign View
app.get('/campaigns/new', isAuthenticated, (req, res) => {
    res.renderPage('dashboard/campaign-form', { pageTitle: 'حملة جديدة', activePage: 'campaigns', breadcrumb: { href: '/campaigns' }, campaign: null, tenantName: req.session.tenantName });
});

app.get('/campaigns/:id/edit', isAuthenticated, async (req, res) => {
    const result = await db.query('SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, req.session.tenantId]);
    if (result.rows.length === 0) return res.status(404).send('Campaign not found');
    res.renderPage('dashboard/campaign-form', { pageTitle: 'تعديل الحملة', activePage: 'campaigns', breadcrumb: { href: '/campaigns' }, campaign: result.rows[0], tenantName: req.session.tenantName });
});

// 9. Campaign Run/Monitor View
app.get('/campaigns/:id/run', isAuthenticated, async (req, res) => {
    const result = await db.query('SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, req.session.tenantId]);
    if (result.rows.length === 0) return res.status(404).send('Campaign not found');
    res.renderPage('dashboard/run-campaign', { pageTitle: 'تنفيذ الحملة', pageSubtitle: 'متابعة الإرسال مباشرة', activePage: 'campaigns', breadcrumb: { href: '/campaigns' }, useSocket: true, campaign: result.rows[0], tenantName: req.session.tenantName });
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

    // WhatsApp logic remains the same (QR, Ready, Status)
    try { await WhatsAppManager.getClient(tenantId); } catch (e) { }

    const state = WhatsAppManager.getTenantState(tenantId);
    if (state.status === 'QUERY_QR' && state.lastQr) {
        QRCode.toDataURL(state.lastQr, (err, url) => { if (!err) socket.emit('qr', url); });
    } else if (state.status === 'READY') {
        socket.emit('ready', { phone: state.phone });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SaaS Platform running on http://localhost:${PORT}`);
});
