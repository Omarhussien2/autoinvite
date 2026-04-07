const Stripe = require('stripe');

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' })
    : null;

const PLANS = {
    free: {
        name: 'مجاني',
        nameEn: 'Free',
        quota: 50,
        priceId: process.env.STRIPE_PRICE_FREE || null,
        features: ['50 رسالة شهرياً', 'حملة واحدة نشطة', 'دعم بالبريد الإلكتروني'],
    },
    basic: {
        name: 'أساسي',
        nameEn: 'Basic',
        quota: 500,
        priceId: process.env.STRIPE_PRICE_BASIC || null,
        priceAmount: 4900,
        priceLabel: '$49/شهر',
        features: ['500 رسالة شهرياً', '5 حملات نشطة', 'تصدير التقارير', 'دعم بالبريد الإلكتروني'],
    },
    pro: {
        name: 'احترافي',
        nameEn: 'Pro',
        quota: 2000,
        priceId: process.env.STRIPE_PRICE_PRO || null,
        priceAmount: 9900,
        priceLabel: '$99/شهر',
        features: ['2,000 رسالة شهرياً', 'حملات غير محدودة', 'الجدولة الذكية', 'صندوق الردود', 'أولوية الدعم'],
    },
    enterprise: {
        name: 'مؤسسات',
        nameEn: 'Enterprise',
        quota: 999999,
        priceId: process.env.STRIPE_PRICE_ENTERPRISE || null,
        priceAmount: 24900,
        priceLabel: '$249/شهر',
        features: ['رسائل غير محدودة', 'حملات غير محدودة', 'API access', 'مدير حساب مخصص', 'SLA 99.9%'],
    },
};

function getPlanQuota(plan) {
    return PLANS[plan] ? PLANS[plan].quota : PLANS.free.quota;
}

function isStripeConfigured() {
    return stripe !== null;
}

module.exports = { stripe, PLANS, getPlanQuota, isStripeConfigured };
