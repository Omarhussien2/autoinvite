const i18next = require('i18next');
const middleware = require('i18next-http-middleware');
const Backend = require('i18next-fs-backend');
const path = require('path');

i18next
    .use(Backend)
    .use(middleware.LanguageDetector)
    .init({
        fallbackLng: 'ar-SA',
        supportedLngs: ['ar-SA', 'en'],
        defaultNS: 'common',
        ns: ['common'],
        backend: {
            loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
        },
        detection: {
            order: ['session', 'cookie', 'header'],
            caches: ['cookie'],
            cookieName: 'lang',
        },
        interpolation: {
            escapeValue: false,
        },
    });

module.exports = { i18next, middleware };
