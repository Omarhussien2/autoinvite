const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../database/pg-client');
const { stripe, PLANS, isStripeConfigured } = require('../config/stripe');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message: { success: false, message: 'محاولات تسجيل دخول كثيرة. حاول بعد 15 دقيقة.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Login Endpoint
router.post('/login', authLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    try {
        const result = await db.query('SELECT * FROM tenants WHERE username = $1', [username]);
        const tenant = result.rows[0];

        if (!tenant) {
            return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        }

        const match = await bcrypt.compare(password, tenant.password_hash);

        if (match) {
            req.session.tenantId = tenant.id;
            req.session.tenantName = tenant.name;
            req.session.tenantRole = tenant.role || 'user';
            const redirect = (tenant.role === 'admin') ? '/admin/dashboard' : '/dashboard';

            // CRITICAL: Force-save session to PostgreSQL BEFORE sending the response.
            // Without this, the browser receives the redirect before the session is
            // persisted, so the next request to /dashboard finds NO session → 401 redirect loop.
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('❌ Session save failed:', saveErr);
                    return res.status(500).json({ success: false, message: 'فشل في حفظ الجلسة، حاول مرة أخرى' });
                }
                console.log(`✅ Session saved for tenant: ${tenant.username} (role: ${tenant.role || 'user'})`);
                return res.json({ success: true, redirect });
            });
        } else {
            return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        }
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// Register Endpoint — rate limited to prevent mass account creation
router.post('/register', authLimiter, async (req, res) => {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
        return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
    }

    if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    }

    if (username.length < 3 || username.length > 50 || !/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ success: false, message: 'اسم المستخدم يجب أن يكون 3-50 حرفاً (أحرف إنجليزية وأرقام فقط)' });
    }

    try {
        // Check if username exists
        const exists = await db.query('SELECT id FROM tenants WHERE username = $1', [username]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'اسم المستخدم مسجل مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const freeQuota = PLANS.free ? PLANS.free.quota : 50;

        let stripeCustomerId = null;
        if (isStripeConfigured()) {
            try {
                const customer = await stripe.customers.create({
                    email: username,
                    name: name,
                    metadata: { tenantId: 'pending' },
                });
                stripeCustomerId = customer.id;
            } catch (stripeErr) {
                console.error('[Auth] Stripe customer creation failed:', stripeErr.message);
            }
        }

        const result = await db.query(
            `INSERT INTO tenants (name, username, password_hash, settings, subscription_plan, subscription_status, message_quota, trial_ends_at, stripe_customer_id)
             VALUES ($1, $2, $3, $4, 'free', 'trialing', $5, $6, $7) RETURNING id, name`,
            [name, username, hashedPassword, JSON.stringify({ min_delay: 20, max_delay: 60, safe_mode: true }), freeQuota, trialEnd, stripeCustomerId]
        );

        const newTenant = result.rows[0];

        if (stripeCustomerId) {
            try {
                await stripe.customers.update(stripeCustomerId, {
                    metadata: { tenantId: newTenant.id },
                });
            } catch (_) {}
        }
        req.session.tenantId = newTenant.id;
        req.session.tenantName = newTenant.name;
        req.session.tenantRole = 'user';

        // CRITICAL: Force-save session to PostgreSQL BEFORE sending the response.
        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('❌ Session save failed (register):', saveErr);
                return res.status(500).json({ success: false, message: 'تم إنشاء الحساب لكن فشل تسجيل الدخول تلقائياً. حاول تسجيل الدخول يدوياً.' });
            }
            console.log(`✅ Session saved for new tenant: ${newTenant.name}`);
            res.json({ success: true, redirect: '/dashboard' });
        });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ success: false, message: 'فشل إنشاء الحساب' });
    }
});

// Logout Endpoint
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Could not log out' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, redirect: '/login' });
    });
});

// Check Session
router.get('/me', (req, res) => {
    if (req.session.tenantId) {
        res.json({ loggedIn: true, name: req.session.tenantName });
    } else {
        res.json({ loggedIn: false });
    }
});

// Diagnostic endpoint — ONLY available in development to prevent leakage in prod
if (process.env.NODE_ENV !== 'production') {
    router.get('/debug', (req, res) => {
        res.json({
            sessionExists: !!req.session,
            tenantId: req.session?.tenantId || null,
            tenantName: req.session?.tenantName || null,
            tenantRole: req.session?.tenantRole || null,
            sessionId: req.sessionID || null,
            cookieHeader: req.headers.cookie ? 'present' : 'MISSING',
            userAgent: req.headers['user-agent'],
            trustProxy: req.app.get('trust proxy'),
            secure: req.secure,
            protocol: req.protocol,
            xForwardedProto: req.headers['x-forwarded-proto'] || null,
            xForwardedFor: req.headers['x-forwarded-for'] || null,
            env: {
                NODE_ENV: process.env.NODE_ENV || 'not set',
                COOKIE_SECURE: process.env.COOKIE_SECURE || 'not set (defaults to true in prod)'
            }
        });
    });
}

module.exports = router;
