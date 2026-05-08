class WhatsAppSessionError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'WhatsAppSessionError';
        this.code = 'WHATSAPP_SESSION_LOST';
        this.currentRow = options.currentRow || null;
        this.originalError = options.originalError || null;
    }
}

function stringifyError(error) {
    if (!error) return '';
    if (error.message) return error.message;
    if (error.text) return error.text;
    if (typeof error === 'object') {
        try {
            return JSON.stringify(error);
        } catch (_) {
            return String(error);
        }
    }
    return String(error);
}

function safeStringify(obj) {
    try {
        if (obj instanceof Error) return obj.stack || obj.message;
        return typeof obj === 'string' ? obj : JSON.stringify(obj, Object.getOwnPropertyNames(obj));
    } catch (_) {
        return String(obj);
    }
}

function isWhatsAppSessionError(error) {
    const message = stringifyError(error).toLowerCase();

    return [
        'detached frame',
        'execution context was destroyed',
        'target closed',
        'protocol error',
        'page crashed',
        'session closed',
        'browser has disconnected',
        'browser disconnected',
        'browserclose',
        'desconnectedmobile',
        'disconnected',
        'lost connection',
        'navigation failed because browser has disconnected',
        'cannot find context with specified id'
    ].some((needle) => message.includes(needle));
}

module.exports = {
    WhatsAppSessionError,
    isWhatsAppSessionError,
    stringifyError,
    safeStringify,
};
