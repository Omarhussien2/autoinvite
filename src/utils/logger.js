const fs = require('fs-extra');
const path = require('path');
const config = require('../config/settings');

/**
 * Logs the result of an operation to the report file.
 * @param {string} phone - The phone number.
 * @param {string} name - The contact name.
 * @param {string} status - 'SUCCESS', 'FAIL', 'SKIP'.
 * @param {string} message - Additional details.
 */
async function logResult(phone, name, status, message = '') {
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const logLine = `[${timestamp}] [${status}] [${phone}] [${name}] - ${message}\n`;

    try {
        await fs.ensureFile(config.paths.logFile);
        await fs.appendFile(config.paths.logFile, logLine);

        // Also log to console for real-time feedback
        const color = status === 'SUCCESS' ? '\x1b[32m' : (status === 'FAIL' ? '\x1b[31m' : '\x1b[33m');
        console.log(`${color}${logLine.trim()}\x1b[0m`);
    } catch (error) {
        console.error('Failed to write log:', error);
    }
}

module.exports = { logResult };
