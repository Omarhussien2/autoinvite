# AutoInvite SaaS — Backend Verification Report
**Auditor:** Principal QA Engineer / System Architect  
**Date:** 2026-03-30  
**Scope:** Full `src/` directory audit, user journey trace, gap analysis  

---

## Executive Summary

The codebase currently represents a **functional single-tenant tool**, not a SaaS platform. The claim that a "Multi-Tenancy phase" has been completed is **not reflected anywhere in the code**. Zero multi-tenancy primitives (tenant_id columns, tenant-scoped queries, per-tenant WhatsApp sessions) exist. The backend must be considered **pre-MVP** before any SaaS frontend can be connected.

---

## Task 1: Code Audit & Architecture Review

### ✅ Successfully Verified Features

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 1 | Express server boots on port 5000 | `server.js` | ✅ Working |
| 2 | Session-based login / logout | `routes/auth.js` | ✅ Working |
| 3 | `GET /auth/me` session check endpoint | `routes/auth.js` | ✅ Working |
| 4 | `isAuthenticated` middleware guards API routes | `middleware/auth.js` | ✅ Working |
| 5 | Campaign CRUD (Create, List, Get, Update, Delete) | `routes/campaigns.js` | ✅ Working |
| 6 | Campaign progress tracking (`last_sent_row`) | `routes/campaigns.js` | ✅ Working |
| 7 | File upload (template image + CSV contacts) via Multer | `routes/campaigns.js` | ✅ Working |
| 8 | Phone normalization — Saudi 05x, 5x, 966x formats | `utils/dataProcessor.js` | ✅ Working |
| 9 | Phone normalization — Egyptian 01x, 20x formats | `utils/normalizer.js` | ✅ Working |
| 10 | Arabic name transliteration from English mappings | `utils/dataProcessor.js` | ✅ Working |
| 11 | Weighted random message selection (Spintax-lite) | `core.js` | ✅ Working |
| 12 | Anti-ban randomized delay (20–45 seconds) | `core.js` | ✅ Working |
| 13 | WhatsApp QR code generated and emitted via Socket.io | `server.js` | ✅ Working |
| 14 | WhatsApp `ready` event broadcasts phone number | `server.js` | ✅ Working |
| 15 | Stop batch via `stop_batch` Socket.io event | `server.js` | ✅ Working |
| 16 | In-campaign deduplication via `sent_logs` table | `core.js` | ✅ Working |
| 17 | Temp image cleanup after send | `core.js` | ✅ Working |
| 18 | Log result to file (`logs/report.txt`) | `utils/logger.js` | ✅ Working |
| 19 | SQLite database with better-sqlite3 | `database/db.js` | ✅ Working |
| 20 | Chromium path resolved at runtime from system PATH | `core.js` | ✅ Working |

---

## Task 2: Bug, Gap & Missing Logic Table

### 🔴 CRITICAL

| # | ID | Location | Description | Impact |
|---|---|---------|------------|--------|
| 1 | **C-01** | Entire codebase | **No multi-tenancy exists.** There is no `tenant_id` column in `users`, `campaigns`, or `sent_logs`. All campaign queries return data for ALL users (`SELECT * FROM campaigns`). Any logged-in user can read, edit, or delete any other user's campaigns. | Complete data isolation failure. SaaS is impossible without this. |
| 2 | **C-02** | `core.js` line 13 | **Single global WhatsApp client.** One `Client` instance is shared by all users. In a multi-tenant context, every tenant would share the same WhatsApp session — scanning one QR would disconnect everyone else. | SaaS multi-tenant WhatsApp is architecturally impossible in current form. |
| 3 | **C-03** | `core.js` `loadContacts()` (line 50) | **Contact file path is hardcoded** to `'../data/data - Sheet1.csv'`. Even though campaigns store a `contacts_path` field, it is **never passed into `loadContacts()`**. Every campaign run reads the same static CSV file regardless of which campaign was selected. | All campaigns silently send to the same contact list — wrong contacts. |
| 4 | **C-04** | `utils/generator.js` line 19 | **Template image path is hardcoded** to `config.image.templatePath` (`assets/TEMPLATE2.png`). Campaigns store their own `template_path` and `canvas_config`, but `generateImage()` ignores both completely. | Every invitation uses the same hardcoded design regardless of campaign settings. |
| 5 | **C-05** | `server.js` | **No background job queue.** `processBatch` runs in-band inside the Socket.io event handler. The Node.js event loop is occupied for the entire duration (potentially hours). A second user attempting to start a batch is silently blocked by a single in-memory `currentState` flag. | Server freezes for all tenants while any one batch is running. Not scalable beyond 1 concurrent user. |
| 6 | **C-06** | `routes/auth.js` | **No tenant registration endpoint.** There is no `POST /auth/register`. The only way to create a user is via `database/init.js` which hardcodes `admin / admin123` as the only account. | A SaaS cannot onboard new tenants. |

---

### 🟠 HIGH

| # | ID | Location | Description | Impact |
|---|---|---------|------------|--------|
| 7 | **H-01** | `routes/campaigns.js` lines 104, 133 | **No ownership check on PUT/DELETE.** `PUT /:id` and `DELETE /:id` do not verify the campaign belongs to the requesting user. Any authenticated user can destroy any other user's campaign. | Unauthorized data modification across users. |
| 8 | **H-02** | `server.js` line 23 | **Session secret is hardcoded.** `'autoinvite-v2-secret-key'` is a plaintext constant in source code. Sessions can be forged by anyone who reads the repo. | Session forgery vulnerability. Must be an environment variable. |
| 9 | **H-03** | `database/db.js` line 5 | **`verbose: console.log` is enabled in production.** Every SQL statement — including queries containing user passwords and phone numbers — is printed to stdout. | Performance degradation + potential PII exposure in logs. |
| 10 | **H-04** | `routes/campaigns.js` lines 18–28 | **No file type validation in Multer.** The upload handler accepts any file extension and MIME type. A user can upload a `.js` script disguised as a template image. | Remote code execution risk if uploaded files are ever executed or `require()`d. |
| 11 | **H-05** | `routes/auth.js` | **No brute-force / rate limiting on login.** Unlimited password attempts are accepted. | Credential stuffing and brute-force attacks. |
| 12 | **H-06** | `config/settings.js` line 6 | **Template path references `TEMPLATE2.png`** which exists in `/assets`, however the image generation uses global config, not the campaign's uploaded template (see C-04). Additionally the global config uses `assets/TEMPLATE2.png` but some parts of the code were written for `template.png`. Any mismatch will cause a runtime crash mid-batch with no recovery. | Batch crashes silently after investing hours in setup. |

---

### 🟡 MEDIUM

| # | ID | Location | Description | Impact |
|---|---|---------|------------|--------|
| 13 | **M-01** | `utils/normalizer.js` vs `utils/dataProcessor.js` | **Duplicate `normalizePhone` functions with different logic.** `normalizer.js` handles Egyptian numbers (`01x`). `dataProcessor.js` does not. `core.js` imports from `dataProcessor.js`. Egyptian numbers sent via the test message handler (server.js) work, but Egyptian numbers in a batch CSV will be dropped as invalid. | Silent data loss for non-Saudi contacts in batch mode. |
| 14 | **M-02** | `utils/state.js` | **`state.js` is completely orphaned.** `loadSession()`, `saveSession()`, `clearSession()` are exported but imported by nobody. The session resume feature (crash recovery) was planned but never wired up. | Incomplete feature. A crash mid-batch loses all progress, forcing restart from row 1. |
| 15 | **M-03** | `utils/dataProcessor.js` | **`processContacts()` is exported but never called.** This is the deduplication/validation pipeline for CSV uploads. It was never integrated into the campaign creation flow. | Uploaded CSVs are stored raw with no validation. Bad data silently enters the pipeline. |
| 16 | **M-04** | `routes/campaigns.js` line 45 | **`canvas_config` is saved but never used.** The per-campaign font, size, color, and position settings are stored in the DB but `generateImage()` always reads `config.image.*` globals. Campaign customization is a dead feature. | UI allows customization that has zero effect on output. |
| 17 | **M-05** | `server.js` | **In-memory session store (MemoryStore).** `express-session` defaults to MemoryStore which leaks memory on every new session. Under any significant load the server will run out of RAM. | Memory leak — server will eventually crash under real traffic. |
| 18 | **M-06** | `database/init.js` | **`init.js` is never called by `server.js`.** If the database file does not have the required tables (fresh environment), the server will crash on startup. There is no automatic bootstrap check. | First-time deployment will fail without manual intervention. |
| 19 | **M-07** | `core.js` line 86 | **`currentRow` variable is declared but never used.** Dead code. | Minor — no functional impact. |

---

### 🔵 LOW

| # | ID | Location | Description | Impact |
|---|---|---------|------------|--------|
| 20 | **L-01** | `src/index.js` | **`index.js` is a dead CLI entry point** that calls `client.initialize()` independently. If run accidentally alongside `server.js`, it creates a second simultaneous WhatsApp session initialization on the same `LocalAuth` storage, corrupting the session. | Risk of WhatsApp session corruption if script is run by mistake. |
| 21 | **L-02** | `core.js` line 2 | **`qrcode-terminal` is imported in `core.js` but never used there.** QR display is handled in `server.js`. | Dead import. Minor noise. |
| 22 | **L-03** | `server.js` line 186 | **Unused variable `egyptianLocal`** in `send_test` handler. The value is computed and immediately discarded. | Dead code. No functional impact. |
| 23 | **L-04** | `middleware/auth.js` line 7 | **`req.path.startsWith('/api')` detection is unreliable** in router-mounted contexts. When middleware is attached at the router level, `req.path` is relative. However since `isAuthenticated` is always applied per-route in campaigns.js, this is currently harmless. | Fragile pattern that will break if middleware placement changes. |

---

## Task 3: Gap Analysis & API Readiness

### Missing API Endpoints (Frontend Will Definitely Need)

| Method | Route | Status | Notes |
|--------|-------|--------|-------|
| `POST` | `/auth/register` | ❌ MISSING | SaaS tenant self-registration |
| `GET` | `/auth/me` | ✅ EXISTS | Returns `{ loggedIn, username }` |
| `POST` | `/auth/login` | ✅ EXISTS | Returns `{ success, redirect }` |
| `POST` | `/auth/logout` | ✅ EXISTS | Clears session |
| `POST` | `/api/campaigns` | ✅ EXISTS | Create campaign (multipart/form-data) |
| `GET` | `/api/campaigns` | ✅ EXISTS | List all campaigns (unscoped — no tenant filter) |
| `GET` | `/api/campaigns/:id` | ✅ EXISTS | Get single campaign |
| `PUT` | `/api/campaigns/:id` | ✅ EXISTS | Update campaign (no ownership check) |
| `DELETE` | `/api/campaigns/:id` | ✅ EXISTS | Delete campaign (no ownership check) |
| `PATCH` | `/api/campaigns/:id/progress` | ✅ EXISTS | Update `last_sent_row` |
| `GET` | `/api/campaigns/:id/contacts` | ❌ MISSING | Preview/count contacts from campaign's CSV |
| `GET` | `/api/campaigns/:id/logs` | ❌ MISSING | Paginated sent_logs for a campaign |
| `GET` | `/api/campaigns/:id/stats` | ❌ MISSING | Total sent / failed / pending counts |
| `GET` | `/api/whatsapp/status` | ❌ MISSING | REST equivalent of Socket.io status (needed for page load) |
| `GET` | `/api/settings` | ❌ MISSING | Read delay, daily limit, safe_mode settings |
| `PUT` | `/api/settings` | ❌ MISSING | Update global settings |
| `GET` | `/api/logs` | ❌ MISSING | Fetch/download the `logs/report.txt` file |
| `GET` | `/api/users` | ❌ MISSING | List all users (admin only — needed for SaaS user management) |
| `POST` | `/api/users` | ❌ MISSING | Create a user / invite a tenant |
| `DELETE` | `/api/users/:id` | ❌ MISSING | Remove a user |

---

### Background Job Queue — Is It Implemented?

**No. It is not implemented.**

The current architecture runs `processBatch()` synchronously inside a Socket.io event callback. The implications:

1. **The Node.js process is occupied** for the entire batch duration (potentially hours with 20–45 second delays between each contact). During this time, the event loop is not free to handle other requests.
2. **A single in-memory `currentState` flag** prevents concurrent batches from starting. This is not thread-safe and is not tenant-aware. A second tenant connecting cannot run their own campaign.
3. **If the server restarts mid-batch** (crash, deploy, OOM), the entire batch is lost. No recovery mechanism exists (`state.js` was written for this but is never called).
4. **The correct architecture** requires a job queue (e.g., `bull`, `bee-queue`, or `p-queue`) with a worker pool, where each tenant's batch is enqueued as an independent job and processed in a dedicated worker thread or process.

**Verdict: 5 tenants sending simultaneously would cause the server to queue only one and silently block the others, with the event loop effectively frozen.**

---

## Recommended Fix Priority Order

Before any frontend is built, these must be addressed in order:

1. **[C-01 + C-02]** Design and implement multi-tenancy: `tenant_id` on all tables, per-tenant WhatsApp client pool, tenant-scoped queries.
2. **[C-03]** Wire `contacts_path` from the selected campaign into `loadContacts()`.
3. **[C-04]** Wire `template_path` and `canvas_config` from the campaign into `generateImage()`.
4. **[C-06]** Add `POST /auth/register` endpoint.
5. **[C-05]** Implement a background job queue (even a simple `bull`-based single-worker queue) to free the event loop.
6. **[H-01]** Add ownership checks (`WHERE id = ? AND user_id = ?`) to all campaign mutations.
7. **[H-02]** Move session secret to `SESSION_SECRET` environment variable.
8. **[H-03]** Remove `verbose: console.log` from `db.js` for production.
9. **[M-01]** Consolidate `normalizePhone` — use `normalizer.js` (which handles both Saudi + Egyptian) everywhere.
10. **[M-02]** Wire `state.js` into `processBatch` for crash recovery.
11. **[M-05]** Replace MemoryStore with `connect-sqlite3` or `better-sqlite3-session-store`.
12. Add all 8 missing API endpoints listed above.
