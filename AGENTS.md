# AutoInvite — AI Agent Guide

> WhatsApp Bulk Invitation SaaS Platform — Arabic-first, multi-tenant, production-ready.

## Quick Start

```bash
npm install
cp .env.example .env   # Edit DATABASE_URL and SESSION_SECRET
npm run db:init
npm run db:seed-admin  # Default: admin / admin123
npm start              # Runs on PORT (default 5000)
```

## Architecture Overview

AutoInvite is a **multi-tenant SaaS** for sending bulk WhatsApp invitations. Each tenant (business) gets an isolated session, contacts, campaigns, and send logs. The platform has two user roles:

| Role | Access |
|------|--------|
| `admin` (Super Admin) | Full platform control, manages all tenants' quotas |
| `user` (Tenant) | Own dashboard, campaigns, contacts, settings |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express 5.x (CommonJS) |
| Database | PostgreSQL (via `pg` pool) |
| Sessions | express-session + connect-pg-simple (stored in `user_sessions` table) |
| Views | EJS with layout middleware (`res.renderPage()`) |
| Real-time | Socket.IO (campaign progress, QR codes) |
| WhatsApp | WPPConnect 2.2.1 via WhatsAppProvider registry (default: WPPConnect, QR-based auth) |
| Scheduling | pg-boss 10.4.2 (durable job queue for scheduled campaigns) |
| Billing | Stripe (subscriptions, webhooks, checkout) |
| Landing Page | React + Vite + TypeScript (built to `landing-autoinvite/dist/`) |
| File Uploads | Multer (tenant-scoped storage) |
| Process Manager | PM2 (production) |
| Reverse Proxy | Nginx |
| Logging | Unified logger (`src/utils/logger.js` — `createLogger()` per module) |

## Project Structure

```
autoinvite/
├── src/                              # Backend source (CommonJS)
│   ├── server.js                     # Express entry + Socket.IO + UI routes + middleware wiring
│   ├── config/
│   │   ├── i18n.js                   # i18next Arabic/English config
│   │   ├── settings.js               # App settings (delays, quotas, etc.)
│   │   └── stripe.js                 # Stripe client + plan definitions
│   ├── core/
│   │   ├── index.js                  # Barrel export (WhatsAppManager, loadContacts, processBatch, AntiBanEngine)
│   │   ├── WhatsAppManager.js        # Multi-tenant WPPConnect session manager (QR, send, status, inbox)
│   │   ├── WhatsAppSessionError.js   # Custom error class + safeStringify + stringifyError + session error detection
│   │   ├── BackgroundQueue.js        # Non-blocking campaign job queue (per-tenant singleton)
│   │   ├── processBatch.js           # Core message sending loop (daily limit, quota, msgChunks bypass)
│   │   ├── AntiBanEngine.js          # Gaussian delays, typing simulation, time-of-day awareness, micro-breaks
│   │   └── ScheduleManager.js        # pg-boss durable scheduler (campaign + batch scheduling, reconciliation)
│   ├── database/
│   │   ├── pg-client.js              # PostgreSQL Pool (single export via `db.pool`)
│   │   ├── init_saas.js              # Table creation (tenants, campaigns, contacts, sent_logs, messages)
│   │   ├── migrate_saas.js           # Safe column migration (IF NOT EXISTS)
│   │   ├── ensure_smart_schedule_schema.js  # Ensures campaign_batches table exists
│   │   └── seed_admin.js             # Creates default admin tenant
│   ├── middleware/
│   │   ├── auth.js                   # isAuthenticated guard (redirects to /login)
│   │   ├── ejsLayout.js              # res.renderPage() layout wrapper (provides sidebar, topbar)
│   │   ├── quotaGuard.js             # Blocks requests when tenant quota exhausted
│   │   ├── subscriptionGuard.js      # Blocks expired/trial-ended tenants, redirects to billing
│   │   ├── tenantScope.js            # Injects tenantId from session into req.tenantId
│   │   └── uploadStorage.js          # Multer config (tenant-scoped storage paths)
│   ├── routes/
│   │   ├── auth.js                   # POST /auth/login, /auth/register, /auth/logout, GET /auth/me
│   │   ├── campaigns.js              # Campaign CRUD API (/api/campaigns) + smart batch scheduling
│   │   ├── whatsapp.api.js           # WhatsApp start/stop/test/status/disconnect/logout API
│   │   ├── admin.js                  # Super Admin dashboard + quota/tenant management + health API
│   │   ├── billing.js                # Stripe checkout, portal, webhooks, billing page
│   │   ├── contacts.js               # Contact CRUD API (/api/contacts)
│   │   ├── tenant.js                 # Tenant settings, password change, stats API (/api/tenant)
│   │   └── inbox.js                  # Inbox messages + reply API (/api/inbox)
│   ├── services/
│   │   └── campaign.service.js       # Campaign business logic (importContacts, scheduling policy, parseScheduleBody)
│   ├── utils/
│   │   ├── logger.js                 # Unified logger — createLogger(module) + logResult for report file
│   │   ├── dataProcessor.js          # CSV/Excel parsing, phone normalization, dedup, Google Translate names
│   │   ├── generator.js              # Canvas-based invitation image generation (Readex Pro + TSNAS fonts)
│   │   ├── messageTemplates.js       # Message template normalization, weighted rotation, placeholder rendering
│   │   ├── smartScheduler.js         # Smart batch builder (daily limits, send windows, safety presets)
│   │   └── audioConverter.js         # FFmpeg audio → OGG/Opus conversion for WhatsApp voice notes
│   └── views/
│       ├── layouts/main.ejs          # Main HTML shell (RTL, brand colors, sidebar, topbar)
│       ├── partials/
│       │   ├── sidebar.ejs           # Navigation sidebar (dashboard, campaigns, contacts, etc.)
│       │   └── topbar.ejs            # Top bar with tenant name and logout
│       ├── auth/
│       │   ├── login.ejs             # Login page (Arabic, inline errors)
│       │   └── register.ejs          # Registration page (Arabic, inline errors)
│       ├── dashboard/
│       │   ├── index.ejs             # Dashboard overview (stats, charts, campaigns list)
│       │   ├── campaigns.ejs         # Campaign list with quota meter
│       │   ├── campaign-form.ejs     # Create/edit campaign (CSV upload, message templates, smart schedule)
│       │   ├── contacts.ejs          # Contact management table
│       │   ├── run-campaign.ejs      # Live campaign monitor (Socket.IO)
│       │   ├── settings.ejs          # Tenant settings (name, delays, safe mode)
│       │   ├── reports.ejs           # Send history and logs
│       │   ├── inbox.ejs             # Live WhatsApp inbox (conversations, replies)
│       │   └── billing.ejs           # Subscription plans and billing management
│       └── admin/
│           └── dashboard.ejs         # Super Admin (all tenants, quota management, health)
├── test/
│   ├── dataProcessor.test.js         # Phone normalization + contact parsing tests
│   ├── messageTemplates.test.js      # Template normalization + weighted rotation tests
│   └── smartScheduler.test.js        # Batch building + daily limit tests
├── public/                           # Static assets served by Express
│   ├── assets/images/                # Hero images, logo
│   └── js/
│       ├── campaign-editor.js        # Canvas-based invitation designer
│       └── campaign-runner.js        # Socket.IO campaign runner (live progress)
├── landing-autoinvite/               # React landing page (Vite + TypeScript)
│   ├── components/                   # Hero, Navbar, FeaturesBento, Timeline, Comparison, FAQ, Footer
│   ├── App.tsx                       # Main React app
│   ├── main.tsx                      # React DOM entry
│   ├── vite.config.ts                # Vite config (builds to dist/)
│   └── package.json                  # Frontend dependencies
├── assets/                           # Design assets (template images, fonts)
│   ├── template.png                  # Invitation template (base)
│   ├── TEMPLATE2.png                 # Alternative template
│   ├── ReadexPro-Bold.ttf            # Primary Arabic font for canvas
│   └── TSNAS-BOLD.OTF                # Fallback Arabic font for canvas
├── scripts/                          # Utility scripts
├── docs/                             # Documentation
├── .env.example                      # Environment variable reference
├── .gitignore                        # Git ignore rules
├── package.json                      # Backend dependencies + scripts
├── ecosystem.config.js               # PM2 config
├── Dockerfile                        # Docker build
├── nginx.conf                        # Nginx reverse proxy config
├── AGENTS.md                         # This file — AI agent guide
├── CHANGELOG.md                      # Version changelog
└── README.md                         # Project overview
```

## Database Schema

All tables use UUID primary keys. Multi-tenant isolation via `tenant_id` foreign key.

### `tenants`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| name | VARCHAR | Display name |
| username | VARCHAR | Unique login username |
| password_hash | VARCHAR | bcrypt hash |
| role | VARCHAR | 'admin' or 'user' |
| message_quota | INTEGER | Max messages allowed (default 50) |
| messages_used | INTEGER | Messages consumed |
| max_daily_limit | INTEGER | Per-tenant daily send cap (default 200) |
| settings | JSONB | { min_delay, max_delay, safe_mode } |
| subscription_plan | VARCHAR | free, basic, pro, enterprise |
| subscription_status | VARCHAR | trialing, active, past_due, canceled |
| stripe_customer_id | VARCHAR | Stripe customer reference |
| whatsapp_status | VARCHAR | connected, disconnected, error |
| whatsapp_phone | VARCHAR | Connected phone number |
| trial_ends_at | TIMESTAMP | Trial expiration |
| created_at | TIMESTAMP | Auto |

### `campaigns`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| tenant_id | UUID | FK → tenants |
| name | VARCHAR | Campaign name |
| template_path | VARCHAR | Path to invitation template image |
| contacts_path | VARCHAR | Path to uploaded CSV/Excel |
| message_templates | JSONB | Array of message variants with weights |
| canvas_config | JSONB | Text position, font size, color |
| voicenote_path | VARCHAR | Path to uploaded voice note |
| status | VARCHAR | draft, active, running, completed, failed, paused, scheduled |
| last_sent_row | INTEGER | Resume point for interrupted campaigns |
| failed_count | INTEGER | Consecutive failures |
| smart_schedule_enabled | BOOLEAN | Whether smart scheduling is active |
| schedule_mode | VARCHAR | immediate, later, smart |
| scheduled_at | TIMESTAMP | When campaign is scheduled to start |
| schedule_job_id | VARCHAR | pg-boss job ID |
| schedule_attempts | INTEGER | Retry counter |
| paused_reason | VARCHAR | daily_limit_reached, etc. |
| created_at | TIMESTAMP | Auto |

### `campaign_batches`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| tenant_id | UUID | FK → tenants |
| campaign_id | UUID | FK → campaigns |
| batch_number | INTEGER | Batch sequence number |
| start_row | INTEGER | First contact row |
| end_row | INTEGER | Last contact row |
| scheduled_at | TIMESTAMP | When batch starts |
| status | VARCHAR | scheduled, running, completed, failed, paused |
| daily_limit | INTEGER | Per-batch daily limit |
| min_delay_seconds | INTEGER | Inter-message min delay |
| max_delay_seconds | INTEGER | Inter-message max delay |
| break_after_messages | INTEGER | Messages before break |
| break_min_minutes | INTEGER | Break minimum duration |
| break_max_minutes | INTEGER | Break maximum duration |
| safety_mode | VARCHAR | conservative, balanced, faster |

### `contacts`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| tenant_id | UUID | FK → tenants |
| campaign_id | UUID | FK → campaigns |
| name | VARCHAR | Contact name |
| phone | VARCHAR | Normalized phone number |
| status | VARCHAR | pending, sent, failed |
| created_at | TIMESTAMP | Auto |

### `sent_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| tenant_id | UUID | FK → tenants |
| campaign_id | UUID | FK → campaigns |
| phone | VARCHAR | Recipient phone |
| name | VARCHAR | Recipient name |
| status | VARCHAR | success, failed, invalid |
| sent_at | TIMESTAMP | When sent |
| failed_at | TIMESTAMP | When failed |

### `messages`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| tenant_id | UUID | FK → tenants |
| remote_phone | VARCHAR | Other party phone |
| sender | VARCHAR | 'me' or 'them' |
| direction | VARCHAR | inbound or outbound |
| body | TEXT | Message content |
| sender_name | VARCHAR | Display name |
| is_read | BOOLEAN | Read status |
| whatsapp_timestamp | TIMESTAMP | Original WhatsApp timestamp |

### `user_sessions`
Auto-created by `connect-pg-simple`. Stores Express session data.

## Key Flows

### 1. Authentication Flow
```
POST /auth/login → bcrypt.compare → req.session.tenantId = tenant.id
  → req.session.save(callback) → res.json({ success: true, redirect })
```
- Sessions stored in PostgreSQL (`user_sessions` table)
- Cookie: `secure` in production, `httpOnly: true`, `sameSite: 'lax'`, 7-day expiry
- `isAuthenticated` middleware checks `req.session.tenantId` and redirects to `/login` if missing
- Admin users (role='admin') redirect to `/admin/dashboard`, others to `/dashboard`

### 2. Campaign Flow
```
1. User uploads CSV → Multer saves to storage/tenant_{id}/uploads/
2. dataProcessor.js parses CSV/Excel, normalizes phones, deduplicates
3. User creates campaign → saved to campaigns table
4. If smart schedule → buildSmartBatches() creates campaign_batches rows + pg-boss jobs
5. User clicks "Run" → run-campaign.ejs + Socket.IO
6. WhatsAppProviders.getProviderForTenant(tenantId).getClient(tenantId) gets/creates the tenant WhatsApp session
7. BackgroundQueue.js → processBatch.js processes contacts in loop
8. Each message: AntiBanEngine.delay() → client.sendImageFromBase64/sendText → sent_logs
9. Real-time progress via Socket.IO (tenant_{id} room)
```

### 3. WhatsApp Session Management
- Each tenant has an isolated WhatsApp session in `storage/tenant_{id}/wpp_tokens/`
- QR code generated by WPPConnect, sent via Socket.IO to frontend as base64
- Sessions auto-sleep after 8 hours idle (configurable)
- `WhatsAppManager.setIo(io)` must be called before starting

### 4. Quota System
- New tenants get 50 messages (free plan)
- Super Admin can edit any tenant's quota via `/admin/dashboard`
- `quotaGuard.js` middleware blocks requests when quota exhausted
- Active campaigns are NEVER interrupted mid-send (quota checked at HTTP level only)

### 5. Smart Scheduling
- `smartScheduler.js` builds daily batches respecting send windows and daily limits
- `ScheduleManager.js` uses pg-boss for durable job scheduling
- Safety presets: conservative (55%), balanced (70%), faster (85% first-day factor)
- Hard daily limit: 200 messages (configurable per tenant by admin)

### 6. msgChunks Bypass (CRITICAL — DO NOT REMOVE)
- WPPConnect throws false-positive `msgChunks` errors during sendImageFromBase64/sendText
- `safeStringify()` (in `WhatsAppSessionError.js`) intercepts these errors
- The try-catch blocks in `processBatch.js` check `errStr.includes('msgChunks')` and treat as success
- **This logic is what keeps campaigns running — never refactor it out**

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 5000 | Server port |
| `NODE_ENV` | No | development | Set to `production` for HTTPS cookies |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | - | Session signing key (generate: `openssl rand -hex 32`) |
| `CHROMIUM_PATH` | No | auto-detect | Path to Chromium binary |
| `DATA_DIR` | No | project root | Base directory for tenant storage |
| `MAX_TOTAL_CLIENTS` | No | 5 | Max concurrent WhatsApp sessions |
| `COOKIE_SECURE` | No | false | Set to `true` for HTTPS |
| `STRIPE_SECRET_KEY` | No | - | Stripe API key (billing disabled if absent) |
| `STRIPE_WEBHOOK_SECRET` | No | - | Stripe webhook signature verification |
| `APP_URL` | No | http://localhost:5000 | Base URL for Stripe callbacks |

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server (`node src/server.js`) |
| `npm run dev` | Start with `--watch` for development |
| `npm run db:init` | Create database tables |
| `npm run db:migrate` | Run safe column migrations |
| `npm run db:seed-admin` | Create default admin (admin/admin123) |
| `npm run build:css` | Build Tailwind CSS |
| `npm run build:landing` | Build React landing page |
| `npm test` | Run test suite (`node --test test/*.test.js`) |

## API Routes Reference

| Route | File | Endpoints |
|-------|------|-----------|
| `/auth` | `routes/auth.js` | POST login, register, logout; GET me, debug (dev only) |
| `/api/campaigns` | `routes/campaigns.js` | GET /, GET /:id, POST /, PUT /:id, DELETE /:id, GET /:id/stats |
| `/api/whatsapp` | `routes/whatsapp.api.js` | POST init, start, stop, test, disconnect, logout; GET status |
| `/api/contacts` | `routes/contacts.js` | POST /, DELETE /:id |
| `/api/tenant` | `routes/tenant.js` | PUT /settings, PUT /password, GET /stats |
| `/api/inbox` | `routes/inbox.js` | GET /:phone/messages, POST /:phone/reply |
| `/api/scheduler` | `server.js` (inline) | GET /status, POST /test (admin dev only) |
| `/admin` | `routes/admin.js` | GET /dashboard; PATCH tenants/:id/quota, daily-limit, reset-usage; POST tenants; DELETE tenants/:id; POST tenants/:id/disconnect; GET /health |
| `/billing` | `routes/billing.js` | GET /, POST /checkout, POST /portal, POST /webhook |

## Production Deployment

### Server Info
- **VPS**: Hostinger, Ubuntu 24.04 LTS, IP: `31.97.123.204`
- **Domain**: `www.inviteauto.com` (SSL via Let's Encrypt)
- **Process Manager**: PM2 (`pm2 start ecosystem.config.js`)
- **Nginx**: Reverse proxy to `127.0.0.1:3000`
- **PostgreSQL**: user `autoinvite`, db `autoinvite`, port `5432`

### Deployment Steps
```bash
cd /root/autoinvite
git pull origin main
npm install
npm run db:migrate
npm run build:landing
pm2 restart autoinvite
```

### Nginx Config Location
`/etc/nginx/sites-available/autoinvite` — proxies to `127.0.0.1:3000`

## Code Conventions

### Logging
All modules use the unified logger:
```js
const { createLogger } = require('../utils/logger');
const log = createLogger('ModuleName');
log.info('message');
log.warn('warning');
log.error('error:', err.message);
log.success('done');
```
The `onLog` callback in `processBatch.js` is NOT a logger — it's the Socket.IO relay to the frontend.

### Route Pattern
- Route files in `src/routes/` handle HTTP request/response only
- Business logic in `src/services/` (e.g., `campaign.service.js`)
- DB queries can live in routes or services depending on complexity

### Error Handling
- `WhatsAppSessionError` for session-related failures (triggers campaign pause)
- `safeStringify()` for WPPConnect error objects that don't serialize normally
- `.catch()` on non-critical DB updates to prevent cascade failures

## Brand Guidelines

| Token | Value | Usage |
|-------|-------|-------|
| `brand-green` | `#00C853` | Primary action buttons, accents |
| `brand-dark` | `#0A3D2E` | Sidebar, headers, text |
| `brand-light` | `#E8FAF0` | Backgrounds, highlights |

- **NO emojis in production UI** — use SVG icons instead
- **RTL layout** — all Arabic text, right-to-left
- **Clean, modern, minimal** design

## Common Tasks

### Add a new dashboard page
1. Create view in `src/views/dashboard/page-name.ejs`
2. Add route in `src/server.js` using `res.renderPage()`
3. Add sidebar link in `src/views/partials/sidebar.ejs`

### Add a new API endpoint
1. Create or extend route file in `src/routes/`
2. Add `isAuthenticated` middleware if protected
3. Use `req.session.tenantId` for tenant-scoped queries
4. Mount in `src/server.js` with `app.use('/api/xxx', require('./routes/xxx'))`

### Modify WhatsApp sending logic
Edit `src/core/processBatch.js` — the send loop handles individual message dispatch with msgChunks bypass. Anti-ban delays are in `src/core/AntiBanEngine.js`.

### Update landing page
Edit files in `landing-autoinvite/`, then run `cd landing-autoinvite && npm run build`. The build output is served from `landing-autoinvite/dist/`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Login returns "بيانات الدخول غير صحيحة" | Run `npm run db:seed-admin` to recreate admin user |
| Sessions not persisting | Check PostgreSQL connection, verify `user_sessions` table exists |
| WhatsApp QR not showing | Check Socket.IO connection, verify `WhatsAppManager.setIo(io)` is called |
| Campaign stuck | Check `last_sent_row` in campaigns table, restart campaign |
| Port mismatch | Verify `.env` PORT matches nginx upstream config |
| Cookie not set | Ensure `trust proxy` is set in Express, `NODE_ENV` matches HTTPS |
| `msgChunks` errors in logs | Normal — safeStringify bypass handles these, campaigns continue |
| `expiration cannot exceed 24 hours` | Ensure `deleteAfterDays` is not passed to pg-boss `boss.send()` |
