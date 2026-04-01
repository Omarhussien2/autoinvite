function isAuthenticated(req, res, next) {
    if (req.session && req.session.tenantId) {
        return next();
    }

    // Log why auth failed — helps debug production issues
    const reason = !req.session ? 'no session object' : 'session exists but no tenantId';
    console.log(`🔒 Auth blocked: ${req.method} ${req.originalUrl} — reason: ${reason} | cookie: ${req.headers.cookie ? 'present' : 'MISSING'}`);

    // If it's an API request, return 401 JSON
    if (req.path.startsWith('/api') || req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Otherwise redirect to EJS login page
    res.redirect('/login');
}

module.exports = { isAuthenticated };
