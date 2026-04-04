# 🧠 AutoInvite SaaS - Project Context & AI Guidelines

## 🎯 Project Overview
AutoInvite is a Multi-Tenant SaaS platform for bulk WhatsApp messaging. It features an Anti-Ban Engine, background queue processing, and subscription-based billing via Stripe.
- **Environment:** Production runs on Hostinger VPS (Ubuntu/Linux).
- **Core Challenge:** Managing Puppeteer RAM consumption efficiently and ensuring stable WebSocket connections for QR codes.

---

## 🛠️ Tech Stack & Architecture
- **Backend:** Node.js, Express.js
- **Views (Dashboard):** EJS templates (`src/views`)
- **Landing Page:** React + Vite + Tailwind (`landing-autoinvite/`)
- **Database:** PostgreSQL (Production) / SQLite (Local/Legacy)
- **WhatsApp Engine:** Puppeteer (Headless Chrome), `whatsapp-web.js`
- **Real-time:** Socket.io (Requires specific Nginx proxy settings)
- **Billing:** Stripe (Checkout, Webhooks, Customer Portal)
- **Process Manager:** PM2 (`ecosystem.config.js`)

---

## 📂 Directory Structure Highlights
- `src/core/`: The heart of the app (WhatsAppManager, AntiBanEngine, BackgroundQueue). *Modify with extreme caution.*
- `src/routes/`: API and web routes.
- `src/database/`: DB initialization (`init_saas.js`), migrations, and models.
- `landing-autoinvite/`: Separate frontend for the marketing landing page.
- `logs/`: Application logs (Monitor these for Puppeteer crashes).

---

## 🤖 Claude's Operational Directives (CRITICAL)

### 1. 🔍 Exploration & Navigation (Save Time & Tokens)
- **DO NOT** `read` large files blindly. Always use `grep` or `glob` first to find the specific function or variable.
- Example: If asked about Stripe Webhooks, `grep "stripe" src/routes` before reading full files.

### 2. 💻 Coding Standards
- **JavaScript/TypeScript:** The project is migrating towards standardizing JS with strict JSDoc typing. Avoid `any` logic.
- **Puppeteer Care:** Always ensure browser instances are properly closed `browser.close()` in `try/catch/finally` blocks to prevent RAM leaks on the Hostinger VPS.
- **Async/Await:** Never leave dangling promises, especially in the `BackgroundQueue`.

### 3. 🚀 Infrastructure & Hostinger VPS Rules
- **Puppeteer Executable:** In production, rely on `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`.
- **Nginx & WebSockets:** If modifying Nginx configs, ALWAYS ensure `Upgrade $http_upgrade` and `Connection 'upgrade'` headers are present, otherwise Socket.io QR codes will fail behind Cloudflare/Nginx.
- **Multi-Tenancy:** Each user gets an isolated WhatsApp session. Be mindful of concurrent sessions eating the 8GB RAM limit.

### 4. 💳 Stripe SaaS Implementation Rules
- Never hardcode subscription logic. Always verify via `Subscription Guard` middleware.
- Webhooks must be idempotent (handle the same event twice safely).
- Ensure `price_id` mappings align with the Stripe Dashboard.

---

## 💻 Commands & Workflow

### Development
- Start App: `npm run dev`
- Run Landing Page: `cd landing-autoinvite && npm run dev`
- Init SaaS DB: `node src/database/init_saas.js`

### Deployment (Automated via Hooks)
- We use a custom dual-deployment script `.claude/scripts/deploy.sh` that checks linting, builds, and pushes to GitHub + Hostinger.
- **NEVER** commit changes without running `npm run lint`.

### Production (Hostinger / PM2)
- Restart App: `pm2 restart autoinvite`
- Monitor Logs: `pm2 logs autoinvite`

---

## 🔐 Environment Variables Guide
When generating code or debugging, assume the following `.env` structure exists:
`DATABASE_URL`, `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MAIL_HOST`, `APP_URL`, `PUPPETEER_EXECUTABLE_PATH`.
*Do not log or expose these in code.*