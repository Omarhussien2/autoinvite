const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.db');
const db = new Database(dbPath, { verbose: console.log });

module.exports = db;
