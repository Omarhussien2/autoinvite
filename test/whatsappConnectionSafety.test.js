const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
    return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function between(text, start, end) {
    const startIndex = text.indexOf(start);
    const endIndex = text.indexOf(end, startIndex + start.length);
    assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
    assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
    return text.slice(startIndex, endIndex);
}

test('opening a Socket.IO page does not initialize or probe WhatsApp', () => {
    const server = source('src/server.js');
    const socketHandler = between(server, "io.on('connection'", "log.info(`Session config:");

    assert.doesNotMatch(socketHandler, /provider\.getClient\(/);
    assert.doesNotMatch(socketHandler, /refreshClientState\(/);
});

test('inbound history synchronization does not send automatic read receipts', () => {
    const manager = source('src/core/WhatsAppManager.js');
    const messageHandler = between(manager, 'client.onMessage', 'return client;');

    assert.doesNotMatch(messageHandler, /sendSeen\(/);
});

test('logout never reconnects automatically or removes Chromium profile locks', () => {
    const manager = source('src/core/WhatsAppManager.js');
    const logout = between(manager, 'async logoutClient', 'async stopClient');

    assert.doesNotMatch(logout, /this\.getClient\(/);
    assert.doesNotMatch(manager, /unlinkSync\([^\n]*(SingletonLock|SingletonCookie)/);
});

test('explicit WhatsApp initialization is protected by the messaging gate', () => {
    const routes = source('src/routes/whatsapp.api.js');
    const initRoute = between(routes, "router.post('/init'", "router.post('/start'");

    assert.match(initRoute, /SELECT messaging_enabled FROM tenants/);
    assert.match(initRoute, /MESSAGING_DISABLED/);
});
