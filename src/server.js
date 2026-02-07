const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');
const session = require('express-session');
const { client, loadContacts, processBatch } = require('./core');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const { isAuthenticated } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

// Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Setup
app.use(session({
    secret: 'autoinvite-v2-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Auth Routes
app.use('/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);

// State tracking
let currentState = 'INITIALIZING';
let lastQr = null;

// --- ROUTES ---

// 1. Landing Page (Public)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/landing.html'));
});

// 2. Public Assets (CSS, Scripts for Landing)
app.use('/landing.css', express.static(path.join(__dirname, '../public/landing.css')));
app.use('/login.html', express.static(path.join(__dirname, '../public/login.html')));
app.use('/style.css', express.static(path.join(__dirname, '../public/style.css')));

// 3. Protected Dashboard
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 4. Protected Static Assets
app.use(isAuthenticated);
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Client Events
client.on('qr', (qr) => {
    currentState = 'QUERY_QR';
    lastQr = qr;
    QRCode.toDataURL(qr, (err, url) => {
        if (!err) {
            io.emit('qr', url);
            io.emit('status', 'يا هلا! امسح الباركود عشان نربط الواتساب');
        }
    });
});

client.on('ready', () => {
    currentState = 'READY';
    lastQr = null;
    const phone = client.info ? client.info.wid.user : 'Unknown';
    io.emit('ready', { phone }); // Send phone number
    io.emit('status', `الواتساب جاهز ومتصل بالرقم (966${phone.substring(3)})`); // Show partial number for confirmation
    console.log('Client is ready!');
});

client.on('authenticated', () => {
    io.emit('status', 'تم التوثيق بنجاح! جاري التحميل...');
    // We don't have client.info yet usually, so wait for ready
});

try {
    client.initialize();
} catch (e) {
    console.log('Client initialization check: ', e.message);
}

io.on('connection', (socket) => {
    console.log('New client connected');

    if (currentState === 'QUERY_QR' && lastQr) {
        QRCode.toDataURL(lastQr, (err, url) => {
            if (!err) socket.emit('qr', url);
        });
        socket.emit('status', 'يا هلا! امسح الباركود عشان نربط الواتساب');
    } else if (currentState === 'READY') {
        const phone = client.info ? client.info.wid.user : '';
        socket.emit('ready', { phone });
        socket.emit('status', 'الواتساب جاهز ومتصل. اختر الحملة وابدأ!');
    } else if (currentState === 'WORKING') {
        socket.emit('ready');
        socket.emit('status', 'الجهاز شغال يرسل الحين... ⏳');
        socket.emit('working_state', true);
    }

    // Stop flag
    socket.on('stop_batch', () => {
        global.stopBatchRequested = true;
        io.emit('log', { msg: '⏹️ تم طلب الإيقاف...', type: 'WARN' });
    });

    socket.on('start_batch', async ({ startRow, endRow, campaignId }) => {
        if (currentState === 'WORKING') return;
        global.stopBatchRequested = false; // Reset stop flag

        try {
            socket.emit('log', { msg: 'Loading contacts...', type: 'INFO' });
            const contacts = await loadContacts();
            socket.emit('log', { msg: `Loaded ${contacts.length} contacts.`, type: 'INFO' });

            const start = parseInt(startRow) || 1;
            const end = parseInt(endRow) || contacts.length;

            if (start < 1 || end > contacts.length || start > end) {
                socket.emit('log', { msg: 'Invalid Row Range', type: 'ERROR' });
                return;
            }

            currentState = 'WORKING';
            io.emit('working_state', true);

            // Load messages: from campaign if selected, else from config
            let messages;
            if (campaignId) {
                const db = require('./database/db');
                const campaign = db.prepare('SELECT message_templates FROM campaigns WHERE id = ?').get(campaignId);
                if (campaign && campaign.message_templates) {
                    messages = JSON.parse(campaign.message_templates);
                    socket.emit('log', { msg: `تم تحميل رسائل الحملة #${campaignId}`, type: 'INFO' });
                }
            }

            if (!messages || !Array.isArray(messages) || messages.length === 0) {
                const config = require('./config/settings');
                messages = config.messages;
                socket.emit('log', { msg: 'استخدام الرسائل الافتراضية', type: 'INFO' });
            }

            await processBatch(contacts, start, end, messages, campaignId, (msg, type) => {
                io.emit('log', { msg, type });
            });

            // Update campaign progress if selected
            if (campaignId) {
                const db = require('./database/db');
                db.prepare('UPDATE campaigns SET last_sent_row = ? WHERE id = ?').run(end, campaignId);
                socket.emit('log', { msg: `تم حفظ التقدم: الصف ${end}`, type: 'INFO' });
            }

            currentState = 'READY';
            io.emit('working_state', false);
            io.emit('log', { msg: 'Batch processing finished.', type: 'DONE' });

        } catch (error) {
            currentState = 'READY';
            io.emit('working_state', false);
            socket.emit('log', { msg: `Error: ${error.message}`, type: 'ERROR' });
            console.error(error);
        }
    });

    // Handle Quick Test
    socket.on('send_test', async ({ phone }) => {
        try {
            // Basic formatting for test: Remove non-digits
            let targetPhone = phone.replace(/\D/g, '');
            // If starts with 01 (Egyptian Local), replace with 201
            if (targetPhone.startsWith('01')) {
                const egyptianLocal = targetPhone.substring(1); // 1152806034
                targetPhone = '20' + targetPhone.substring(1);
            }

            const chatId = `${targetPhone}@c.us`;
            socket.emit('log', { msg: `Sending test to ${targetPhone}...`, type: 'INFO' });

            await client.sendMessage(chatId, 'تجربة أوتو إنفايت: هلا والله! النظام شغال 🚀');

            socket.emit('log', { msg: `Test sent to ${targetPhone} ✅`, type: 'DONE' });
        } catch (err) {
            socket.emit('log', { msg: `Test Failed: ${err.message} ❌`, type: 'ERROR' });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
