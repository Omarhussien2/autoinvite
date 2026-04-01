const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../database/pg-client');

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
        return res.status(400).json({ success: false, message: 'Username and password required' });
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
            return req.session.save(err => {
                if (err) console.error('Session save error:', err);
                res.json({ success: true, redirect });
            });
        } else {
            return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        }
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// Register Endpoint (for new Tenants)
router.post('/register', async (req, res) => {
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
        const result = await db.query(
            'INSERT INTO tenants (name, username, password_hash, settings) VALUES ($1, $2, $3, $4) RETURNING id, name',
            [name, username, hashedPassword, JSON.stringify({ min_delay: 20, max_delay: 60, safe_mode: true })]
        );

        const newTenant = result.rows[0];
        req.session.tenantId = newTenant.id;
        req.session.tenantName = newTenant.name;
        req.session.tenantRole = 'user';

        req.session.save(err => {
            if (err) console.error('Session save error:', err);
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

module.exports = router;
