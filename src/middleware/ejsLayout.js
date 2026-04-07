/**
 * EJS Layout Middleware
 * Wraps page content inside the main layout template.
 * Usage: res.renderPage('dashboard/index', { stats, campaigns, ... })
 */
const path = require('path');
const ejs = require('ejs');
const db = require('../database/pg-client');

const layoutPath = path.join(__dirname, '../views/layouts/main.ejs');

const SUB_CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function getSubscriptionInfo(tenantId) {
    const now = Date.now();
    const cached = SUB_CACHE.get(tenantId);
    if (cached && now - cached.ts < CACHE_TTL) return cached.data;

    try {
        const result = await db.query(
            `SELECT subscription_plan, subscription_status, trial_ends_at, current_period_end
             FROM tenants WHERE id = $1`,
            [tenantId]
        );
        const row = result.rows[0] || {};
        const data = {
            subscriptionPlan: row.subscription_plan || 'free',
            subscriptionStatus: row.subscription_status || 'trialing',
            trialEndsAt: row.trial_ends_at,
            currentPeriodEnd: row.current_period_end,
        };
        SUB_CACHE.set(tenantId, { data, ts: now });
        return data;
    } catch (_) {
        return { subscriptionPlan: 'free', subscriptionStatus: 'trialing', trialEndsAt: null, currentPeriodEnd: null };
    }
}

function layoutMiddleware(req, res, next) {
    res.renderPage = async function (view, locals = {}) {
        const viewsDir = path.join(__dirname, '../views');

        const sessionLocals = {
            tenantRole: req.session && req.session.tenantRole ? req.session.tenantRole : 'user',
        };

        let subInfo = { subscriptionPlan: 'free', subscriptionStatus: 'trialing', trialEndsAt: null, currentPeriodEnd: null };
        if (req.session && req.session.tenantId) {
            subInfo = await getSubscriptionInfo(req.session.tenantId);
        }

        const pageFilePath = path.join(viewsDir, view + '.ejs');
        const allLocals = { ...sessionLocals, ...subInfo, ...locals, __dirname: viewsDir };

        ejs.renderFile(pageFilePath, allLocals, { views: [viewsDir] }, (err, pageHtml) => {
            if (err) {
                console.error('EJS Page Render Error:', err);
                return res.status(500).send('<h1>500 — خطأ في السيرفر</h1>');
            }

            const layoutLocals = { ...allLocals, body: pageHtml };

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
