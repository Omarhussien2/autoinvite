# AutoInvite SaaS — WhatsApp Invitation Automation Platform

## Overview
A full multi-tenant SaaS platform for sending personalized WhatsApp invitations.
Built with Node.js/Express, PostgreSQL, Socket.IO, and whatsapp-web.js (Puppeteer).
Deployed via PM2 + Nginx on a Hostinger VPS (Ubuntu 22.04).

## Architecture

- **Backend**: Express.js v5 + Socket.IO (real-time logs and WhatsApp status)
- **Frontend**: EJS templates (Arabic RTL) + Tailwind CSS CDN + Chart.js
- **Database**: PostgreSQL via `pg` (connection pool, UUID PKs, tenant isolation)
- **Sessions**: `express-session` + `connect-pg-simple` (persistent in PostgreSQL)
- **WhatsApp**: whatsapp-web.js with Puppeteer/Chromium (per-tenant sessions)
- **Image Generation**: node-canvas for custom invitation cards with text overlay
- **Process Management**: PM2 (fork mode, not cluster — WhatsApp sessions are stateful)
- **Reverse Proxy**: Nginx with Socket.IO WebSocket proxying + Let's Encrypt SSL
- **Entry Point**: `src/server.js` (port 5000)

## Project Structure

```
/src
  server.js              - Express + Socket.IO server (port 5000)
  core.js                - processBatch() + loadContacts() engine
  core/
    WhatsAppManager.js   - Per-tenant Puppeteer/WhatsApp client pool
    BackgroundQueue.js   - Async job queue for campaign batches
    AntiBanEngine.js     - Random delays between messages
  config/
    i18n.js              - i18next Arabic RTL configuration
    settings.js          - Default message templates and delays
  database/
    pg-client.js         - PostgreSQL Pool (DATABASE_URL or individual vars)
    init_saas.js         - Schema: tenants, campaigns, contacts, sent_logs
  routes/
    auth.js              - /auth/login, /auth/register, /auth/logout
    campaigns.js         - /api/campaigns CRUD + multipart file upload
    whatsapp.api.js      - /api/whatsapp/* (init/start/stop/test/status)
  middleware/
    auth.js              - isAuthenticated + tenantId injection
    ejsLayout.js         - res.renderPage() with main.ejs layout
    tenantScope.js       - req.tenantId from session
    uploadStorage.js     - Multer: tenant-isolated upload storage
  utils/
    dataProcessor.js     - CSV/Excel parsing, phone normalization (SA + EG)
    generator.js         - Canvas image generation with drag position
    logger.js            - Result logging
  views/
    layouts/main.ejs     - Root layout (Tailwind, IBM Plex Sans Arabic, RTL)
    partials/sidebar.ejs - Navigation sidebar
    partials/topbar.ejs  - Top bar with WhatsApp status indicator
    auth/login.ejs       - Login page
    auth/register.ejs    - Registration page
    dashboard/
      index.ejs          - Dashboard overview (stats + chart + WA status)
      campaigns.ejs      - Campaigns list with quota bar
      campaign-form.ejs  - Create/edit campaign with canvas editor
      run-campaign.ejs   - Real-time campaign runner with Socket.IO logs
      contacts.ejs       - Contact list with filter/search
      reports.ejs        - Sent logs history with print support
      settings.ejs       - Tenant settings (Anti-Ban delays, safe mode)
/public
  /js
    campaign-editor.js   - Canvas drag-and-drop image editor (text overlay)
    campaign-runner.js   - Socket.IO real-time campaign runner
  landing.html / login.html - Legacy static pages
/storage                 - Per-tenant uploads and WhatsApp auth sessions (gitignored)
/logs                    - PM2 log files (gitignored)
```

## Database Schema (PostgreSQL)

| Table | Purpose |
|-------|---------|
| `tenants` | Tenant accounts (UUID PK, username, password_hash, settings JSONB) |
| `campaigns` | Per-tenant campaigns (template_path, contacts_path, message_templates JSONB) |
| `contacts` | Uploaded contacts linked to campaigns |
| `sent_logs` | Delivery history for analytics |
| `user_sessions` | Express sessions (auto-created by connect-pg-simple) |

## Key Configuration (Environment Variables)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `SESSION_SECRET` | Session encryption key (required, min 32 chars) |
| `CHROMIUM_PATH` | Chromium/Chrome binary path (auto-detected if not set) |
| `DATA_DIR` | Root for tenant storage (default: project root) |
| `MAX_TOTAL_CLIENTS` | Max simultaneous WhatsApp sessions (default: 5) |
| `PORT` | Server port (default: 5000) |

## Production Deployment (VPS)

See `DEPLOYMENT-GUIDE.md` for the complete step-by-step guide.
Key files:
- `ecosystem.config.js` — PM2 process configuration
- `nginx.conf` — Nginx reverse proxy with Socket.IO WebSocket support
- `.env.example` — Environment variable reference template
- `Dockerfile` — Docker alternative (not recommended for Hostinger VPS)

## Security Decisions

- Sessions persist in PostgreSQL (survive PM2 restarts)
- Startup validation: server refuses to start without DATABASE_URL + SESSION_SECRET
- Tenant isolation: every DB query is scoped by tenant_id
- File uploads: isolated per tenant in storage/tenant_{uuid}/uploads/
- Rate limiting via Nginx (auth: 10r/m, API: 60r/m)

## Workflow

- **Start application**: `npm start` → runs on port 5000 (webview)
- **Init DB**: `npm run db:init` → creates all tables
