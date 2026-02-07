const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../database/db');
const { isAuthenticated } = require('../middleware/auth');

const fs = require('fs');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Use absolute path
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Create Campaign
router.post('/', isAuthenticated, upload.fields([{ name: 'template' }, { name: 'contacts' }]), (req, res) => {
    try {
        const { name, message_templates, canvas_config } = req.body;

        // Access files securely
        const templatePath = req.files['template'] ? req.files['template'][0].path : null;
        const contactsPath = req.files['contacts'] ? req.files['contacts'][0].path : null;

        if (!name || !message_templates || !contactsPath) {
            return res.status(400).json({ success: false, message: 'Name, Messages, and Contact File are required' });
        }

        // Insert into DB
        const stmt = db.prepare(`
            INSERT INTO campaigns (name, template_path, contacts_path, message_templates, canvas_config, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        // message_templates comes as a stringified JSON if sent via FormData
        // canvas_config also comes as a stringified JSON

        const result = stmt.run(
            name,
            templatePath,
            contactsPath,
            message_templates,
            canvas_config || '{}',
            'active'
        );

        res.json({ success: true, campaignId: result.lastInsertRowid });

    } catch (error) {
        console.error('Create Campaign Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// List Campaigns
router.get('/', isAuthenticated, (req, res) => {
    try {
        const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
        res.json({ success: true, campaigns });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Single Campaign
router.get('/:id', isAuthenticated, (req, res) => {
    try {
        const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }
        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Campaign Progress (last_sent_row)
router.patch('/:id/progress', isAuthenticated, (req, res) => {
    try {
        const { lastRow } = req.body;
        db.prepare('UPDATE campaigns SET last_sent_row = ? WHERE id = ?').run(lastRow, req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Campaign (Edit)
router.put('/:id', isAuthenticated, upload.fields([{ name: 'template' }, { name: 'contacts' }]), (req, res) => {
    try {
        const { name, message_templates, canvas_config } = req.body;
        const templatePath = req.files['template'] ? req.files['template'][0].path : null;
        const contactsPath = req.files['contacts'] ? req.files['contacts'][0].path : null;

        let query = 'UPDATE campaigns SET name = ?, message_templates = ?, canvas_config = ?';
        const params = [name, message_templates, canvas_config];

        if (templatePath) {
            query += ', template_path = ?';
            params.push(templatePath);
        }
        if (contactsPath) {
            query += ', contacts_path = ?';
            params.push(contactsPath);
        }

        query += ' WHERE id = ?';
        params.push(req.params.id);

        db.prepare(query).run(...params);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete Campaign
router.delete('/:id', isAuthenticated, (req, res) => {
    try {
        // Option: also delete physical files (template, contacts) if needed
        db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
        db.prepare('DELETE FROM sent_logs WHERE campaign_id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
