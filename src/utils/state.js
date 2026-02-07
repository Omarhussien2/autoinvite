const fs = require('fs-extra');
const path = require('path');

const STATE_FILE = path.resolve(__dirname, '../../logs/session_state.json');

/**
 * Loads the previous session state.
 * @returns {Promise<object|null>} State object or null if no session.
 */
async function loadSession() {
    if (await fs.pathExists(STATE_FILE)) {
        try {
            return await fs.readJson(STATE_FILE);
        } catch (e) {
            console.error('Failed to load session:', e.message);
            return null;
        }
    }
    return null;
}

/**
 * Saves the current progress.
 * @param {number} lastProcessedIndex - Index of the last processed row (0-based).
 * @param {string} lastPhone - Phone number of last contact.
 * @param {number} totalContacts - Total number of contacts in current batch.
 */
async function saveSession(lastProcessedIndex, lastPhone, totalContacts) {
    const state = {
        lastProcessedIndex,
        lastPhone,
        totalContacts,
        timestamp: new Date().toISOString()
    };
    await fs.writeJson(STATE_FILE, state, { spaces: 2 });
}

/**
 * Clears the session file (e.g., when batch is complete).
 */
async function clearSession() {
    await fs.remove(STATE_FILE);
}

module.exports = { loadSession, saveSession, clearSession };
