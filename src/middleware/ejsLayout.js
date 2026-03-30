/**
 * EJS Layout Middleware
 * Wraps page content inside the main layout template.
 * Usage: res.renderPage('dashboard/index', { stats, campaigns, ... })
 */
const path = require('path');
const ejs = require('ejs');
const fs = require('fs');

const layoutPath = path.join(__dirname, '../views/layouts/main.ejs');

function layoutMiddleware(req, res, next) {
    // Add renderPage method to response
    res.renderPage = function (view, locals = {}) {
        const viewsDir = path.join(__dirname, '../views');

        // Inject session-based globals (role for admin sidebar link, etc.)
        const sessionLocals = {
            tenantRole: req.session && req.session.tenantRole ? req.session.tenantRole : 'user',
        };

        // First render the page partial
        const pageFilePath = path.join(viewsDir, view + '.ejs');

        ejs.renderFile(pageFilePath, { ...sessionLocals, ...locals, __dirname: viewsDir }, { views: [viewsDir] }, (err, pageHtml) => {
            if (err) {
                console.error('EJS Page Render Error:', err);
                return res.status(500).send('<h1>500 — خطأ في السيرفر</h1>');
            }

            // Then render the layout, passing the page HTML as `body`
            const layoutLocals = {
                ...sessionLocals,
                ...locals,
                body: pageHtml,
                __dirname: viewsDir,
            };

            ejs.renderFile(layoutPath, layoutLocals, { views: [viewsDir] }, (err2, fullHtml) => {
                if (err2) {
                    console.error('EJS Layout Render Error:', err2);
                    return res.status(500).send('<h1>500 — خطأ في السيرفر</h1>');
                }
                res.send(fullHtml);
            });
        });
    };

    next();
}

module.exports = layoutMiddleware;
