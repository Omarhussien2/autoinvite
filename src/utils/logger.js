const fs = require('fs-extra');
const config = require('../config/settings');

const COLORS = {
    DEBUG: '\x1b[36m',
    INFO: '\x1b[36m',
    WARN: '\x1b[33m',
    ERROR: '\x1b[31m',
    SUCCESS: '\x1b[32m',
    RESET: '\x1b[0m',
};

function formatTimestamp() {
    return new Date().toISOString().replace('T', ' ').split('.')[0];
}

function createLogger(module) {
    const tag = `[${module}]`;

    function write(level, ...args) {
        const timestamp = formatTimestamp();
        const color = COLORS[level] || COLORS.INFO;
        const prefix = `${color}${timestamp} ${tag}${COLORS.RESET}`;
        const message = args.map(a => (typeof a === 'string' ? a : (a instanceof Error ? a.message : JSON.stringify(a)))).join(' ');

        switch (level) {
            case 'ERROR':
                console.error(prefix, ...args);
                break;
            case 'WARN':
                console.warn(prefix, ...args);
                break;
            default:
                console.log(prefix, ...args);
        }

        appendToFile(level, message);
    }

    return {
        debug: (...args) => write('DEBUG', ...args),
        info: (...args) => write('INFO', ...args),
        warn: (...args) => write('WARN', ...args),
        error: (...args) => write('ERROR', ...args),
        success: (...args) => write('SUCCESS', ...args),
    };
}

async function appendToFile(level, message) {
    try {
        await fs.ensureFile(config.paths.logFile);
        const timestamp = formatTimestamp();
        await fs.appendFile(config.paths.logFile, `[${timestamp}] [${level}] ${message}\n`);
    } catch (_) {}
}

async function logResult(phone, name, status, message = '') {
    const timestamp = formatTimestamp();
    const logLine = `[${timestamp}] [${status}] [${phone}] [${name}] - ${message}\n`;

    try {
        await fs.ensureFile(config.paths.logFile);
        await fs.appendFile(config.paths.logFile, logLine);

        const color = status === 'SUCCESS' ? '\x1b[32m' : (status === 'FAIL' ? '\x1b[31m' : '\x1b[33m');
        console.log(`${color}${logLine.trim()}\x1b[0m`);
    } catch (error) {
        console.error('Failed to write log:', error);
    }
}

module.exports = { createLogger, logResult };
