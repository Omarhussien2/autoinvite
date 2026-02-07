const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.db');
const db = new Database(dbPath);

console.log('Migrating Database at:', dbPath);

try {
  // 1. Drop and recreate campaigns table
  console.log('Dropping old campaigns table...');
  db.exec(`DROP TABLE IF EXISTS campaigns`);

  console.log('Creating new campaigns table...');
  db.exec(`
      CREATE TABLE campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        template_path TEXT, 
        contacts_path TEXT,
        message_templates JSON, 
        canvas_config JSON, 
        last_sent_row INTEGER DEFAULT 1,
        status TEXT DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

  // 2. Create sent_logs table for deduplication
  console.log('Dropping old sent_logs table...');
  db.exec(`DROP TABLE IF EXISTS sent_logs`);

  console.log('Creating sent_logs table for deduplication...');
  db.exec(`
      CREATE TABLE sent_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER,
        phone TEXT NOT NULL,
        name TEXT,
        status TEXT DEFAULT 'SUCCESS',
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, phone)
      )
    `);

  console.log('Migration successful: campaigns + sent_logs tables ready.');
} catch (err) {
  console.error('Migration Failed:', err.message);
} finally {
  db.close();
}
