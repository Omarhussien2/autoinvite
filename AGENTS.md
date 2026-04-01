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
| WhatsApp | whatsapp-web.js + Puppeteer (QR-based auth) |
| Landing Page | React + Vite + TypeScript (built to `landing-autoinvite/dist/`) |
| File Uploads | Multer (tenant-scoped storage) |
| Process Manager | PM2 (production) |
| Reverse Proxy | Nginx |

## Project Structure

```
autoinvite/
├── src/                          # Backend source (CommonJS)
│   ├── server.js                 # Express entry + Socket.IO + all UI routes
│   ├── config/
│   │   ├── i18n.js               # i18next Arabic/English config
│   │   └── settings.js           # App settings (delays, quotas, etc.)
│   ├── core/
│   │   ├── WhatsAppManager.js    # Multi-tenant WhatsApp session manager (QR, send, status)
│   │   ├── BackgroundQueue.js    # Non-blocking campaign job queue
│   │   └── AntiBanEngine.js      # Random delay system between messages
│   ├── database/
│   │   ├── pg-client.js          # PostgreSQL Pool (single export)
│   │   ├── init_saas.js          # Table creation (tenants, campaigns, contacts, sent_logs)
│   │   ├── migrate_saas.js       # Safe column migration (IF NOT EXISTS)
│   │   └── seed_admin.js         # Creates default admin tenant
│   ├── middleware/
│   │   ├── auth.js               # isAuthenticated guard (redirects to /login)
│   │   ├── ejsLayout.js          # res.renderPage() layout wrapper (provides sidebar, topbar)
│   │   ├── quotaGuard.js         # Blocks requests when tenant quota exhausted
│   │   ├── tenantScope.js        # Injects tenantId from session into requests
│   │   └── uploadStorage.js      # Multer config (tenant-scoped storage paths)
│   ├── routes/
│   │   ├── auth.js               # POST /auth/login, /auth/register, /auth/logout, GET /auth/me
│   │   ├── campaigns.js          # Campaign CRUD API (/api/campaigns)
│   │   ├── whatsapp.api.js       # WhatsApp start/stop/test/status API
│   │   └── admin.js              # Super Admin dashboard + quota management
│   ├── utils/
│   │   ├── dataProcessor.js      # CSV/Excel parsing, phone normalization, dedup
│   │   ├── generator.js          # Canvas-based invitation image generation
│   │   ├── logger.js             # Simple file + console logger
│   │   ├── normalizer.js         # Phone number and name normalization (Arabic support)
│   │   └── state.js              # Campaign state management
│   └── views/
│       ├── layouts/main.ejs      # Main HTML shell (RTL, brand colors, sidebar, topbar)
│       ├── partials/
│       │   ├── sidebar.ejs       # Navigation sidebar (dashboard, campaigns, contacts, etc.)
│       │   └── topbar.ejs        # Top bar with tenant name and logout
│       ├── auth/
│       │   ├── login.ejs         # Login page (Arabic, inline errors)
│       │   └── register.ejs      # Registration page (Arabic, inline errors)
│       ├── dashboard/
│       │   ├── index.ejs         # Dashboard overview (stats, charts, campaigns list)
│       │   ├── campaigns.ejs     # Campaign list with quota meter
│       │   ├── campaign-form.ejs # Create/edit campaign (CSV upload, message templates)
│       │   ├── contacts.ejs      # Contact management table
│       │   ├── run-campaign.ejs  # Live campaign monitor (Socket.IO)
│       │   ├── settings.ejs      # Tenant settings (name, delays, safe mode)
│       │   └── reports.ejs       # Send history and logs
│       └── admin/
│           └── dashboard.ejs     # Super Admin (all tenants, quota management)
├── public/                       # Static assets served by Express
│   ├── assets/images/            # Hero images, logo
│   ├── assets/template.csv       # Contact upload template
│   └── js/
│       ├── campaign-editor.js    # Canvas-based invitation designer
│       └── campaign-runner.js    # Socket.IO campaign runner (live progress)
├── landing-autoinvite/           # React landing page (Vite + TypeScript)
│   ├── App.tsx                   # Main React app
│   ├── components/Hero.tsx       # GSAP animated hero section
│   ├── components/Navbar.tsx     # Fixed navbar (login + WhatsApp links)
│   ├── CTA.tsx                   # Call-to-action section
│   ├── FeaturesBento.tsx         # Feature grid
│   ├── Timeline.tsx              # How it works timeline
│   ├── Comparison.tsx            # Before/after comparison
│   ├── FAQ.tsx                   # FAQ accordion
│   ├── Footer.tsx                # Footer
│   ├── Hero.tsx                  # Simple hero (unused if GSAP hero active)
│   ├── index.css                 # Global styles (RTL, brand colors)
│   ├── index.html                # Vite HTML entry
│   ├── main.tsx                  # React DOM entry
│   ├── vite.config.ts            # Vite config (builds to dist/)
│   ├── tsconfig.json             # TypeScript config
│   └── package.json              # Frontend dependencies
├── assets/                       # Design assets (template images, fonts)
│   ├── template.png              # Invitation template (base)
│   ├── TEMPLATE2.png             # Alternative template
│   └── TSNAS-BOLD.OTF            # Arabic font for canvas rendering
├── .env.example                  # Environment variable reference
├── .gitignore                    # Git ignore rules
├── package.json                  # Backend dependencies + scripts
├── ecosystem.config.js           # PM2 config
├── Dockerfile                    # Docker build
├── nginx.conf                    # Nginx reverse proxy config
├── DEPLOYMENT-GUIDE.md           # Detailed deployment instructions
└── README.md                     # Project overview
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
| message_quota | INTEGER | Max messages allowed (default 1000) |
| messages_used | INTEGER | Messages consumed |
| settings | JSONB | { min_delay, max_delay, safe_mode } |
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
| status | VARCHAR | draft, active, running, completed, failed |
| last_sent_row | INTEGER | Resume point for interrupted campaigns |
| failed_count | INTEGER | Consecutive failures |
| created_at | TIMESTAMP | Auto |

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
4. User clicks "Run" → run-campaign.ejs + Socket.IO
5. WhatsAppManager.getClient(tenantId) gets/creates WhatsApp session
6. BackgroundQueue.js processes contacts in batches
7. Each message: AntiBanEngine.delay() → whatsapp-web.js.sendMessage() → sent_logs
8. Real-time progress via Socket.IO (tenant_{id} room)
```

### 3. WhatsApp Session Management
- Each tenant has an isolated WhatsApp session in `storage/tenant_{id}/auth_session/`
- QR code generated via `qrcode` library, sent via Socket.IO to frontend
- Sessions auto-sleep after 15 min idle (configurable)
- `WhatsAppManager.setIo(io)` must be called before starting

### 4. Quota System
- New tenants get 1,000 messages automatically
- Super Admin can edit any tenant's quota via `/admin/dashboard`
- `quotaGuard.js` middleware blocks requests when quota exhausted
- Active campaigns are NEVER interrupted mid-send (quota checked at HTTP level only)

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

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server (`node src/server.js`) |
| `npm run db:init` | Create database tables |
| `npm run db:migrate` | Run safe column migrations |
| `npm run db:seed-admin` | Create default admin (admin/admin123) |
| `npm run build:landing` | Build React landing page |

## Production Deployment

### Server Info
- **VPS**: Hostinger, Ubuntu 24.04 LTS, IP: `31.97.123.204`
- **Domain**: `www.inviteauto.com` (SSL via Let's Encrypt)
- **Process Manager**: PM2 (`pm2 start ecosystem.config.js`)
- **Nginx**: Reverse proxy to `127.0.0.1:3000`
- **PostgreSQL**: user `autoinvite`, db `autoinvite`, port `5432`

### Deployment Steps
```bash
# On server:
cd /root/autoinvite
git pull origin main
npm install
npm run db:migrate
npm run build:landing   # cd landing-autoinvite && npm install && npm run build
pm2 restart autoinvite
```

### Nginx Config Location
`/etc/nginx/sites-available/autoinvite` — proxies to `127.0.0.1:3000`

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
1. Create route in appropriate file under `src/routes/`
2. Add `isAuthenticated` middleware if protected
3. Use `req.session.tenantId` for tenant-scoped queries
4. Register route in `src/server.js`

### Modify WhatsApp sending logic
Edit `src/core/WhatsAppManager.js` — the `sendMessage` method handles individual message dispatch. Anti-ban delays are in `src/core/AntiBanEngine.js`.

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
