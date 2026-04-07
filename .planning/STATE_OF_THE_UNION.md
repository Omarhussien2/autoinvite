# AutoInvite — State of the Union & Execution Plan
**Date:** 2026-04-07
**Author:** AI Principal Architect
**Status:** Awaiting Phase-by-Phase Execution

---

## Architecture Summary

| Layer | Tech | Location |
|-------|------|----------|
| Backend | Node.js + Express 5 | `src/server.js` |
| Database | PostgreSQL | `src/database/pg-client.js` |
| WhatsApp Engine | WPPConnect (Puppeteer) | `src/core/WhatsAppManager.js` |
| Anti-Ban | Custom Gaussian delay engine | `src/core/AntiBanEngine.js` |
| Queue | In-memory background jobs | `src/core/BackgroundQueue.js` |
| Batch Processor | Contact loop + send | `src/core/processBatch.js` |
| Real-time | Socket.io | `src/server.js` (lines 511-533) |
| Frontend (Dashboard) | EJS + Tailwind CDN | `src/views/` |
| Frontend (Landing) | React + Vite + Tailwind | `landing-autoinvite/` |
| Deployment | PM2 on Hostinger VPS (8GB RAM) | `ecosystem.config.js` |

---

## PHASE 1: CRITICAL BUG FIXES (P0/P1)

### BUG-1: Settings saved but NEVER consumed by engine
- **Location:** `src/views/dashboard/settings.ejs` saves to `tenants.settings` JSONB
- **Problem:** `src/core/processBatch.js:182` reads delays from `src/config/settings.js` hardcoded values (30s/60s), NOT from tenant settings
- **Impact:** Settings page is cosmetic only. Changing delays does nothing.
- **Fix:** Read tenant settings from DB in `processBatch.js`, pass to `AntiBanEngine.applyDelay()`

### BUG-2: `stopJob()` leaves campaign stuck in 'running' forever
- **Location:** `src/core/BackgroundQueue.js:68-76`
- **Problem:** Sets `global.stopBatchRequested[tenantId] = true` and immediately deletes job from `this.jobs`. The `.then()` handler at line 41 won't find the job, so campaign status never updates.
- **Impact:** Stopped campaigns stay as 'running' in DB permanently.
- **Fix:** Update campaign status to 'paused' BEFORE deleting from jobs map.

### BUG-3: Global stop flag never cleaned up — breaks campaign restart
- **Location:** `src/core/BackgroundQueue.js:70-71` and `src/core/processBatch.js:64`
- **Problem:** `global.stopBatchRequested[tenantId]` is set to `true` but NEVER deleted after job completes. Next job for same tenant checks flag → still true → stops immediately.
- **Impact:** Users cannot restart campaigns after cancellation.
- **Fix:** Delete flag in `.then()` and `.catch()` handlers, and reset at job start.

### BUG-4: Campaign delivery percentage shows row number as percentage
- **Location:** `src/views/dashboard/campaigns.ejs:101-109`
- **Problem:** Shows `last_sent_row` (a row number like 47) directly as percentage in progress bar.
- **Impact:** Misleading progress (47 out of 200 shows as 47% instead of 23.5%).
- **Fix:** Calculate real percentage: `(sentCount / totalContacts) * 100`

### BUG-5: `extraScript` rendered twice in layout
- **Location:** `src/views/layouts/main.ejs:179` and `main.ejs:181`
- **Problem:** Duplicate `<%- typeof extraScript !== 'undefined' ? extraScript : '' %>`
- **Impact:** JavaScript injected twice, potential double-initialization.
- **Fix:** Remove one of the duplicate lines.

### BUG-6: Dead code — duplicate `normalizePhone`
- **Location:** `src/utils/normalizer.js` (44 lines, never imported anywhere)
- **Problem:** `src/utils/dataProcessor.js:101` has the real normalizer used everywhere. `normalizer.js` is dead code.
- **Fix:** Delete `src/utils/normalizer.js`

### BUG-7: Partially-failed campaigns marked as 'completed'
- **Location:** `src/core/processBatch.js` and `src/core/BackgroundQueue.js:44`
- **Problem:** If WhatsApp disconnects mid-batch, individual errors are caught per-contact but batch still completes normally. Campaign status = 'completed' even if 80% of messages failed.
- **Fix:** Track success/fail ratio; if >50% fail, mark as 'partial' or 'error'.

### BUG-8: Memory leak — orphaned setInterval in sleep monitor
- **Location:** `src/core/WhatsAppManager.js:283-292`
- **Problem:** `setInterval` has no stored reference. Cannot be cleared on shutdown.
- **Fix:** Store interval ID, clear on SIGTERM.

### BUG-9: Quota race condition during batch processing
- **Location:** `src/core/processBatch.js:163-175` and `src/middleware/quotaGuard.js`
- **Problem:** Quota is checked only at route entry (middleware), not during batch. A tenant starting at quota-1 can send unlimited messages.
- **Fix:** Check quota inside the batch loop before each send.

### BUG-10: Missing browser cleanup on init failure
- **Location:** `src/core/WhatsAppManager.js:178-189`
- **Problem:** If `initializeClient` throws after Puppeteer browser is partially created, browser instance leaks. No try-finally.
- **Fix:** Wrap in try-finally to ensure browser.close() on failure.

### BUG-11: No transaction wrapping for sent_logs + campaign update
- **Location:** `src/core/processBatch.js:165-170`
- **Problem:** INSERT into sent_logs and UPDATE campaigns.last_sent_row are separate queries. If first succeeds but second fails, next restart re-sends to same contact.
- **Fix:** Wrap in a transaction.

### BUG-12: Typing duration calculation mismatch
- **Location:** `src/core/processBatch.js:125` vs `src/core/AntiBanEngine.js:103-113`
- **Problem:** processBatch uses 50ms/char (max 3s). AntiBanEngine has a `typingDuration()` method using 267ms/char that is NEVER CALLED.
- **Fix:** Use `AntiBanEngine.typingDuration(message)` in processBatch instead of hardcoded calculation.

---

## PHASE 2: COMPLETE THE INCOMPLETE FEATURES

### 2.1 Contacts Management (Currently: Empty Shell)
- **What exists:** Route `/contacts`, EJS view, search, filter, CSV export
- **What's missing:** Contacts never written to DB (uploaded file goes to disk only)
- **Plan:**
  1. On campaign creation, parse uploaded file → INSERT each contact into `contacts` table
  2. During `processBatch`, UPDATE each contact's status to 'sent' or 'failed'
  3. Add manual "Add Contact" form
  4. Add delete/edit per contact
  5. Remove "قريباً" badge from sidebar

### 2.2 Enable Voice Notes (Currently: Tab disabled)
- **What exists:** Full recording UI, backend PTT support, audioConverter works
- **What's missing:** Tab button has `disabled` attribute in `campaign-form.ejs:81`
- **Plan:**
  1. Remove `disabled` from voice tab button
  2. Remove "قريباً" badge
  3. End-to-end test: record → upload → convert → send via PTT

### 2.3 Connect Settings to Engine
- **What exists:** Full settings form (min/max delay, safe mode)
- **What's missing:** Engine ignores tenant settings (uses hardcoded config)
- **Plan:**
  1. Read tenant settings in processBatch before loop
  2. Pass tenant's delays to AntiBanEngine
  3. Honor safe_mode toggle
  4. Add password change to settings page

### 2.4 Reports Page Upgrade
- **What exists:** Full table with filters, print button
- **What's missing:** CSV export, date range filter, summary metrics
- **Plan:**
  1. Add CSV export button
  2. Add date range picker
  3. Add summary cards (success rate, top campaigns)

### 2.5 Admin Dashboard Enhancement
- **What exists:** Tenant list, quota management, usage reset
- **What's missing:** Create/delete tenants, force disconnect, system health
- **Plan:**
  1. Add "Create Tenant" form
  2. Add "Delete Tenant" with cascade
  3. Add "Force Disconnect WhatsApp" per tenant
  4. Add system health indicators (RAM, active instances)

### 2.6 Smart Scheduling
- **What exists:** Sidebar placeholder (disabled, "قريباً")
- **What's missing:** Everything
- **Plan:**
  1. Add `scheduled_at` TIMESTAMP to campaigns table
  2. Add date/time picker on campaign form
  3. Build `ScheduleManager` polling service
  4. Auto-trigger BackgroundQueue when schedule fires
  5. Saudi timezone awareness (UTC+3)

---

## PHASE 3: INFRASTRUCTURE HARDENING

### 3.1 Replace Tailwind CDN with Local Build
- Build Tailwind CSS locally, serve compiled file
- Eliminates CDN dependency and improves load time

### 3.2 Add Missing Database Indexes
- `campaigns(tenant_id)`, `campaigns(status)`
- `sent_logs(tenant_id, campaign_id)`
- `sent_logs(sent_at)` for date range queries
- `contacts(tenant_id, phone)` for dedup

### 3.3 Add Proper Error Logging
- Replace 16+ `.catch(() => {})` patterns with proper error logging
- Add structured logging (winston or pino)

### 3.4 Add `dev` Script
- Add `"dev": "node --watch src/server.js"` to package.json

### 3.5 Graceful Shutdown
- Handle SIGTERM: close all WhatsApp clients, clear intervals, drain queue

---

## PHASE 4: SCALING ROADMAP (Future)

### 4.1 Stripe Billing Integration
- Subscription tiers: Free (50 msg), Basic (500/mo), Pro (2000/mo), Enterprise
- Stripe Checkout, Webhooks, Customer Portal
- Auto-quota reset on billing cycle

### 4.2 API Access for Power Users
- REST API with API key auth
- Endpoints: send message, create campaign, check status, get reports
- Rate limiting per tier, webhook callbacks

### 4.3 Message Templates Gallery
- Pre-built templates: weddings, events, promotions, reminders
- Dynamic variables: `[الشركة]`, `[الموعد]`, `[المبلغ]`, `[الرابط]`
- A/B testing: auto-pick best performing variant

### 4.4 Multi-Channel Expansion
- SMS fallback via Twilio/Unifonic
- Email via SendGrid
- Unified inbox across channels

### 4.5 Analytics Dashboard
- Delivery/read/response rate tracking
- Campaign comparison, best time-to-send analysis
- Contact engagement scoring
- Exportable PDF reports

---

## EXECUTION TIMELINE

| Week | Phase | Description |
|------|-------|-------------|
| 1-2 | Phase 1 | Fix all 12 bugs (critical stability) |
| 3 | Phase 2.2 + 2.3 | Enable voice notes + connect settings |
| 4 | Phase 2.1 | Full contacts management |
| 5 | Phase 2.6 | Smart scheduling |
| 6 | Phase 2.4 + 2.5 | Reports upgrade + admin tools |
| 7 | Phase 3 | Infrastructure hardening |
| 8-11 | Phase 4.1 | Stripe billing |
| 12+ | Phase 4.2-4.5 | API, templates, multi-channel, analytics |
