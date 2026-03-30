const db = require('../database/pg-client');

async function tenantScope(req, res, next) {
    if (!req.session || !req.session.tenantId) {
        return res.status(401).json({ error: 'Unauthorized: No active tenant session' });
    }

    req.tenantId = req.session.tenantId;
    next();
}

module.exports = { tenantScope };
