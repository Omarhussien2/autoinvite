const db = require('../database/pg-client');

function subscriptionGuard(redirect = true) {
    return async (req, res, next) => {
        if (!req.session || !req.session.tenantId) {
            return redirect ? res.redirect('/login') : res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        try {
            const result = await db.query(
                'SELECT subscription_status, subscription_plan, current_period_end, trial_ends_at FROM tenants WHERE id = $1',
                [req.session.tenantId]
            );

            if (result.rows.length === 0) {
                return redirect ? res.redirect('/login') : res.status(401).json({ success: false, error: 'Tenant not found' });
            }

            const tenant = result.rows[0];
            const status = tenant.subscription_status || 'trialing';
            const now = new Date();

            if (status === 'active' || status === 'trialing') {
                if (status === 'trialing' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < now) {
                    await db.query(
                        "UPDATE tenants SET subscription_status = 'past_due' WHERE id = $1",
                        [req.session.tenantId]
                    );
                    if (redirect) return res.redirect('/billing');
                    return res.status(402).json({ success: false, error: 'Trial expired', code: 'TRIAL_EXPIRED' });
                }
                return next();
            }

            if (redirect) return res.redirect('/billing');
            return res.status(402).json({ success: false, error: 'Subscription inactive', code: 'SUBSCRIPTION_INACTIVE' });
        } catch (err) {
            console.error('[SubscriptionGuard] DB error — denying access:', err.message);
            if (redirect) return res.redirect('/billing');
            return res.status(503).json({ success: false, error: 'Service unavailable', code: 'SUBSCRIPTION_CHECK_FAILED' });
        }
    };
}

module.exports = subscriptionGuard;
