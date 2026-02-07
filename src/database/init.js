const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../../');
const dbPath = path.join(dbDir, 'database.db');

console.log('Initializing Database at:', dbPath);

const db = new Database(dbPath);

// 1. Users Table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 2. Settings Table (Global Config)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// 3. Campaigns Table (UPDATED for V2)
// Added: message_templates (JSON array), status (active, paused, completed)
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    template_path TEXT, -- Path to the background image
    message_templates JSON, -- Array of strings for rotation ["Msg 1", "Msg 2"]
    canvas_config JSON, -- { x: 100, y: 200, fontSize: 40, color: '#000' }
    status TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 4. Contacts Table (Linked to Campaigns)
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER,
    name TEXT,
    phone TEXT,
    status TEXT DEFAULT 'pending', -- pending, sent, failed, skipped
    error_reason TEXT,
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
  )
`);

// 5. History Table (Global Anti-Ban Memory)
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    campaign_id INTEGER,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT
  )
`);

// 6. Daily Counters (For Safety Limits)
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_stats (
    date DATE PRIMARY KEY, 
    count INTEGER DEFAULT 0
  )
`);

// Create Default Admin User
const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('Default Admin User Created (admin / admin123)');
}

// Default Settings
const defaults = [
  { key: 'daily_limit', value: '500' },
  { key: 'min_delay', value: '20' },
  { key: 'max_delay', value: '60' }, // Increased for safety
  { key: 'safe_mode', value: 'true' }
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
defaults.forEach(setting => insertSetting.run(setting.key, setting.value));

console.log('Database Initialization Complete.');
db.close();
