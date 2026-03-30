function isAuthenticated(req, res, next) {
    if (req.session && req.session.tenantId) {
        return next();
    }

    // If it's an API request, return 401 JSON
    if (req.path.startsWith('/api') || req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Otherwise redirect to EJS login page
    res.redirect('/login');
}

module.exports = { isAuthenticated };
