const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database/db');

const router = express.Router();

// Login Endpoint
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    try {
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const match = bcrypt.compareSync(password, user.password_hash);

        if (match) {
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;
            return res.json({ success: true, redirect: '/dashboard' });
        } else {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Logout Endpoint
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Could not log out' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, redirect: '/login.html' });
    });
});

// Check Session
router.get('/me', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username });
    } else {
        res.json({ loggedIn: false });
    }
});

module.exports = router;
