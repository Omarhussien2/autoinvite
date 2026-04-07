const express = require('express');
const crypto = require('crypto');
const db = require('../database/pg-client');
const { isAuthenticated } = require('../middleware/auth');
const { stripe, PLANS, getPlanQuota, isStripeConfigured } = require('../config/stripe');

const router = express.Router();

const APP_URL = process.env.APP_URL || 'http://localhost:5000';

// ── Billing Page ──
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT subscription_plan, subscription_status, stripe_customer_id,
                    stripe_subscription_id, message_quota, messages_used,
                    trial_ends_at, current_period_end
             FROM tenants WHERE id = $1`,
            [req.session.tenantId]
        );
        const tenant = result.rows[0];

        const plan = PLANS[tenant.subscription_plan] || PLANS.free;
        const quota = parseInt(tenant.message_quota || 0);
        const used = parseInt(tenant.messages_used || 0);
        const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 100;
        const periodEnd = tenant.current_period_end
            ? new Date(tenant.current_period_end).toLocaleDateString('ar-SA')
            : null;
        const trialEnd = tenant.trial_ends_at
            ? new Date(tenant.trial_ends_at).toLocaleDateString('ar-SA')
            : null;

        res.renderPage('dashboard/billing', {
            pageTitle: 'الاشتراك والفوترة',
            activePage: 'billing',
            tenantName: req.session.tenantName,
            billing: {
                plan,
                planKey: tenant.subscription_plan || 'free',
                status: tenant.subscription_status || 'trialing',
                quota,
                used,
                pct,
                periodEnd,
                trialEnd,
                stripeEnabled: isStripeConfigured(),
                customerId: tenant.stripe_customer_id,
            },
            plans: PLANS,
        });
    } catch (err) {
        console.error('[Billing] Page error:', err.message);
        res.status(500).send('Error loading billing');
    }
});

// ── Checkout Session ──
router.post('/checkout', isAuthenticated, async (req, res) => {
    if (!isStripeConfigured()) {
        return res.status(400).json({ success: false, message: 'Stripe غير مُعد حالياً' });
    }

    try {
        const { planKey } = req.body;
        const selectedPlan = PLANS[planKey];

        if (!selectedPlan || !selectedPlan.priceId) {
            return res.status(400).json({ success: false, message: 'خطة غير صالحة' });
        }

        const tenantId = req.session.tenantId;

        let customerId = req.session.stripeCustomerId;
        if (!customerId) {
            const result = await db.query('SELECT stripe_customer_id, username, name FROM tenants WHERE id = $1', [tenantId]);
            const tenant = result.rows[0];
            customerId = tenant.stripe_customer_id;

            if (!customerId) {
                const customer = await stripe.customers.create({
                    email: tenant.username,
                    name: tenant.name,
                    metadata: { tenantId },
                });
                customerId = customer.id;
                await db.query('UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2', [customerId, tenantId]);
            }
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: selectedPlan.priceId, quantity: 1 }],
            success_url: `${APP_URL}/billing?success=1`,
            cancel_url: `${APP_URL}/billing?canceled=1`,
            metadata: { tenantId, planKey },
        });

        res.json({ success: true, url: session.url });
    } catch (err) {
        console.error('[Billing] Checkout error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Customer Portal ──
router.post('/portal', isAuthenticated, async (req, res) => {
    if (!isStripeConfigured()) {
        return res.status(400).json({ success: false, message: 'Stripe غير مُعد حالياً' });
    }

    try {
        const result = await db.query('SELECT stripe_customer_id FROM tenants WHERE id = $1', [req.session.tenantId]);
        const customerId = result.rows[0]?.stripe_customer_id;

        if (!customerId) {
            return res.status(400).json({ success: false, message: 'لا يوجد حساب Stripe مرتبط' });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${APP_URL}/billing`,
        });

        res.json({ success: true, url: session.url });
    } catch (err) {
        console.error('[Billing] Portal error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Webhook Handler ──
// IMPORTANT: raw body required for signature verification
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!isStripeConfigured()) {
        return res.status(400).send('Stripe not configured');
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        if (webhookSecret) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            event = JSON.parse(req.body);
            console.warn('[Stripe Webhook] No STRIPE_WEBHOOK_SECRET set — skipping verification');
        }
    } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const eventId = event.id;
    const eventType = event.type;

    console.log(`[Stripe Webhook] ${eventType} (${eventId})`);

    // Idempotency: check if we already processed this event
    try {
        const existing = await db.query(
            'SELECT id FROM processed_webhooks WHERE event_id = $1',
            [eventId]
        );
        if (existing.rows.length > 0) {
            console.log(`[Stripe Webhook] Duplicate event ${eventId} — skipping`);
            return res.json({ received: true });
        }
    } catch (_) {
        // processed_webhooks table may not exist yet — continue processing
    }

    try {
        switch (eventType) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const tenantId = session.metadata?.tenantId;
                const planKey = session.metadata?.planKey || 'free';
                const plan = PLANS[planKey] || PLANS.free;

                if (!tenantId) {
                    console.error('[Stripe Webhook] No tenantId in checkout session metadata');
                    break;
                }

                const subscriptionId = session.subscription;
                const customerId = session.customer;

                // Retrieve subscription for period end
                let periodEnd = null;
                if (subscriptionId) {
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                    periodEnd = new Date(subscription.current_period_end * 1000);
                }

                await db.query(
                    `UPDATE tenants SET
                        stripe_customer_id = COALESCE(stripe_customer_id, $1),
                        stripe_subscription_id = $2,
                        subscription_plan = $3,
                        subscription_status = 'active',
                        message_quota = $4,
                        current_period_end = $5
                    WHERE id = $6`,
                    [customerId, subscriptionId, planKey, plan.quota, periodEnd, tenantId]
                );

                console.log(`[Stripe Webhook] Activated ${planKey} plan for tenant ${tenantId} (quota: ${plan.quota})`);
                break;
            }

            case 'invoice.paid': {
                const invoice = event.data.object;
                const customerId = invoice.customer;
                const subscriptionId = invoice.subscription;

                if (!subscriptionId) break;

                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const periodEnd = new Date(subscription.current_period_end * 1000);

                // Determine plan from price ID
                const priceId = subscription.items?.data?.[0]?.price?.id;
                let planKey = 'free';
                for (const [key, plan] of Object.entries(PLANS)) {
                    if (plan.priceId === priceId) { planKey = key; break; }
                }
                const plan = PLANS[planKey] || PLANS.free;

                await db.query(
                    `UPDATE tenants SET
                        messages_used = 0,
                        subscription_status = 'active',
                        message_quota = $1,
                        current_period_end = $2,
                        subscription_plan = $3
                    WHERE stripe_customer_id = $4`,
                    [plan.quota, periodEnd, planKey, customerId]
                );

                console.log(`[Stripe Webhook] Invoice paid — reset usage for customer ${customerId}`);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const periodEnd = new Date(subscription.current_period_end * 1000);
                const status = subscription.status;

                const priceId = subscription.items?.data?.[0]?.price?.id;
                let planKey = 'free';
                for (const [key, plan] of Object.entries(PLANS)) {
                    if (plan.priceId === priceId) { planKey = key; break; }
                }
                const plan = PLANS[planKey] || PLANS.free;

                await db.query(
                    `UPDATE tenants SET
                        subscription_status = $1,
                        subscription_plan = $2,
                        message_quota = $3,
                        current_period_end = $4
                    WHERE stripe_customer_id = $5`,
                    [status, planKey, plan.quota, periodEnd, customerId]
                );

                console.log(`[Stripe Webhook] Subscription updated: ${planKey}/${status} for customer ${customerId}`);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const customerId = subscription.customer;

                await db.query(
                    `UPDATE tenants SET
                        subscription_plan = 'free',
                        subscription_status = 'canceled',
                        message_quota = $1,
                        stripe_subscription_id = NULL
                    WHERE stripe_customer_id = $2`,
                    [PLANS.free.quota, customerId]
                );

                console.log(`[Stripe Webhook] Subscription deleted — downgraded to free for customer ${customerId}`);
                break;
            }

            default:
                console.log(`[Stripe Webhook] Unhandled event type: ${eventType}`);
        }

        // Mark event as processed (idempotency)
        try {
            await db.query(
                'INSERT INTO processed_webhooks (event_id, event_type, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (event_id) DO NOTHING',
                [eventId, eventType]
            );
        } catch (_) {
            // processed_webhooks table may not exist — create it
            try {
                await db.query(`
                    CREATE TABLE IF NOT EXISTS processed_webhooks (
                        event_id TEXT PRIMARY KEY,
                        event_type TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await db.query(
                    'INSERT INTO processed_webhooks (event_id, event_type, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (event_id) DO NOTHING',
                    [eventId, eventType]
                );
            } catch (err2) {
                console.error('[Stripe Webhook] Failed to record processed event:', err2.message);
            }
        }
    } catch (err) {
        console.error(`[Stripe Webhook] Error processing ${eventType}:`, err.message);
    }

    res.json({ received: true });
});

module.exports = router;
