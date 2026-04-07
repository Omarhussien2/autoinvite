# AutoInvite SaaS — WhatsApp Invitation Automation Platform

A multi-tenant SaaS platform for sending personalized WhatsApp invitations at scale, with real-time monitoring via Socket.io, an Admin-Centric Quota System, and a beautiful Arabic-first dashboard.

---

## Features

- **Multi-Tenant Architecture** — Each business gets its own isolated session, contacts, and campaign data
- **WhatsApp Web Integration** — QR-code based session management via whatsapp-web.js
- **Smart Message Rotation** — Multiple message templates with weighted randomization (anti-ban)
- **Image Overlay Engine** — Personalized invitation images generated on-the-fly using Canvas
- **Real-Time Monitoring** — Live campaign progress via Socket.io (no page refresh needed)
- **Admin-Centric Quota System** — Super Admin manually controls each tenant's message quota
- **Saudi Dialect Error Messages** — Failure notifications in clear, friendly Arabic
- **Anti-Ban Engine** — Random delays between messages to stay under WhatsApp radar
- **Cross-Campaign Deduplication** — Never send the same person the same message twice
- **PostgreSQL Backend** — Persistent sessions, logs, and analytics
- **Landing Page** — React-based landing page served as static files

---

## Requirements

- Node.js 18+
- PostgreSQL 14+
- Chromium or Google Chrome (for WhatsApp Web automation)
- npm

---

## Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/autoinvite.git
cd autoinvite

# 2. Install backend dependencies
npm install

# 3. Copy and configure environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and SESSION_SECRET

# 4. Initialize the database schema
npm run db:init

# 5. Run schema migration (adds quota/role columns to existing DBs)
npm run db:migrate

# 6. Seed the Super Admin account
npm run db:seed-admin
# Default credentials: admin / admin123 — CHANGE IN PRODUCTION

# 7. (Optional) Build the landing page
cd landing-autoinvite && npm install && npm run build && cd ..

# 8. Start the server
npm start
```

The server runs on `http://localhost:5000` by default.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string: `postgresql://user:pass@localhost:5432/autoinvite` |
| `SESSION_SECRET` | Yes | Strong random string for session signing. Generate with: `openssl rand -hex 32` |
| `PORT` | Optional | Server port (default: `5000`) |
| `NODE_ENV` | Optional | Set to `production` to enable HTTPS-only cookies |
| `CHROMIUM_PATH` | Optional | Full path to Chromium binary (auto-detected if not set) |
| `MAX_TOTAL_CLIENTS` | Optional | Max concurrent WhatsApp sessions (default: `5`) |
| `DATA_DIR` | Optional | Base directory for tenant storage (default: project root) |

---

## Project Structure

```
autoinvite/
├── src/
│   ├── server.js              # Express app entry point + Socket.io
│   ├── core.js                # Campaign batch processor (WhatsApp sending logic)
│   ├── core/
│   │   ├── WhatsAppManager.js # Multi-tenant WhatsApp session manager
│   │   ├── AntiBanEngine.js   # Random delay system
│   │   └── BackgroundQueue.js # Non-blocking campaign job queue
│   ├── routes/
│   │   ├── auth.js            # Login / register / logout
│   │   ├── campaigns.js       # Campaign CRUD API
│   │   ├── whatsapp.api.js    # WhatsApp start/stop/test API
│   │   └── admin.js           # Super Admin dashboard API
│   ├── middleware/
│   │   ├── auth.js            # Session authentication guard
│   │   ├── tenantScope.js     # Injects tenantId from session
│   │   ├── quotaGuard.js      # Blocks requests when quota is exhausted
│   │   ├── uploadStorage.js   # Multer storage per-tenant
│   │   └── ejsLayout.js       # EJS layout wrapper
│   ├── views/
│   │   ├── layouts/main.ejs   # Main HTML shell
│   │   ├── partials/          # Sidebar, topbar
│   │   ├── auth/              # Login, register pages
│   │   ├── dashboard/         # All tenant dashboard pages
│   │   └── admin/             # Super Admin dashboard
│   ├── database/
│   │   ├── pg-client.js       # PostgreSQL pool
│   │   ├── init_saas.js       # Schema creation
│   │   ├── migrate_saas.js    # Safe column migration (IF NOT EXISTS)
│   │   └── seed_admin.js      # Creates default admin account
│   ├── utils/                 # Data processing, image gen, logger
│   └── config/                # i18n, settings
├── landing-autoinvite/        # React landing page (Vite)
├── public/                    # Static assets
├── storage/                   # Per-tenant uploads & auth sessions (gitignored)
├── .env.example               # Environment template
├── package.json
├── README.md
└── docs/DEPLOYMENT.md         # VPS deployment guide
```

---

## Admin-Centric Quota System

Every new user automatically gets **1,000 messages** of quota on registration.

The Super Admin (`role = 'admin'`) can:
1. View all users at `/admin/dashboard`
2. Edit any user's quota via the table UI
3. Reset a user's usage counter
4. Monitor consumption with visual progress bars

Quota is enforced on HTTP routes only. Active campaigns running through Socket.io are never interrupted mid-send.

Error messages displayed to users are in Saudi dialect Arabic:
- "خلص رصيدك من الرسائل! تواصل مع الإدارة لتجديد الباقة 📩"
- "الرقم مو مسجل في الواتساب 🚫"
- "انقطع الاتصال، جرّب تعيد الربط 🔌"
- "ما وصلت الرسالة لـ [الاسم] ⚠️"
- "صارت مشكلة غير متوقعة 🛑"

---

## قسم عربي — نظام الحصص

كل مستخدم جديد يحصل تلقائياً على حصة **1,000 رسالة**. المشرف العام يتحكم في الحصص يدوياً من لوحة التحكم على المسار `/admin/dashboard`.

عند استنفاد الحصة تظهر الرسالة: **"خلص رصيدك من الرسائل! تواصل مع الإدارة لتجديد الباقة 📩"**

---

## License

ISC
