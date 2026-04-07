# AutoInvite — Phase Progress Tracker

**Last Updated:** 2026-04-07
**Commits:** c3b0292 (Phase 1a), ab6acf2 (Phase 1b), 52f6d0d (Phase 2.2+2.3)

---

## PHASE 1 COMPLETE — All 12 Bugs Fixed

### First Half (BUGs 1-6) — Commit c3b0292

| Bug | Description | Fix Applied |
|-----|-------------|-------------|
| BUG-1 | Settings saved but never consumed by engine | processBatch.js now reads tenant settings from DB before loop; falls back to config defaults |
| BUG-2 | stopJob() leaves campaign stuck as 'running' | stopJob() now updates campaign status to 'paused' in DB before deleting from jobs map |
| BUG-3 | Global stop flag never cleaned | Flag deleted in .then() and .catch() handlers; reset at job start in addJob() |
| BUG-4 | Campaign progress shows row number as % | Real percentage calculated from sent_logs (sent/total) via campaignStatsRes query |
| BUG-5 | extraScript rendered twice in main.ejs | Removed duplicate line 181 |
| BUG-6 | Dead code normalizer.js | Deleted — grep confirmed zero imports |

### Second Half (BUGs 7-12) — Commit ab6acf2

| Bug | Description | Fix Applied |
|-----|-------------|-------------|
| BUG-7 | Partially-failed campaigns marked as 'completed' | processBatch tracks successCount/failCount, returns them. BackgroundQueue checks ratio — if fail > success, sets status to 'partial_failure'. Added orange badge + Arabic label to campaigns.ejs |
| BUG-8 | Memory leak — orphaned setInterval in sleep monitor | Stored interval ID as `this._sleepMonitorId`. Added `stopSleepMonitor()` method. Added SIGTERM/SIGINT graceful shutdown in server.js |
| BUG-9 | Quota race condition during batch processing | Added per-message quota check inside processBatch loop. Queries `messages_used` vs `message_quota` from DB before each send, breaks loop when exhausted |
| BUG-10 | Missing browser cleanup on init failure | Wrapped wppconnect.create() in inner try-catch that attempts client.close() on partial browser before re-throwing |
| BUG-11 | No transaction for sent_logs + campaign update | Wrapped INSERT sent_logs + UPDATE campaigns.last_sent_row in PostgreSQL transaction (BEGIN/COMMIT/ROLLBACK via db.pool.connect()) |
| BUG-12 | Typing duration calculation mismatch | Replaced `Math.min(message.length * 50, 3000)` with `AntiBanEngine.typingDuration(message)` — WPM-based with ±20% variance, clamped 1.5s-12s |

---

## PHASE 2.2+2.3 COMPLETE — Voice Notes + Settings to Engine — Commit 52f6d0d

### Phase 2.2 — Enable Voice Notes

| Task | Status | Details |
|------|--------|---------|
| Remove disabled from voice tab | Done | Removed `disabled`, `cursor-not-allowed`, `opacity-60`, and "قريباً" badge from campaign-form.ejs |
| Add onclick handler | Done | Added `onclick="switchTab('voice')"` matching text tab pattern |
| Verify full pipeline | Verified | Entire pipeline was already built: recording UI → file upload fallback → campaign-editor.js formData → campaigns.js backend upload → whatsapp.api.js voicenote_path → BackgroundQueue → processBatch OGG conversion → sendPttFromBase64 |

**Key finding:** The voice note feature was fully implemented — recording UI, waveform visualization, OGG/Opus conversion via ffmpeg, PTT sending. Only the `disabled` attribute on the tab button was blocking it.

### Phase 2.3 — Connect Settings to Engine

| Task | Status | Details |
|------|--------|---------|
| BUG-1 settings→delay connection | Verified | processBatch reads min_delay/max_delay from tenants.settings JSONB, passes to AntiBanEngine.applyDelay() |
| safe_mode flag | Done | processBatch reads safe_mode from tenant settings; AntiBanEngine.applyDelay() accepts safeMode param (default true); skips daily budget guard when false |
| Password change UI | Done | Added "تغيير كلمة المرور" section to settings.ejs with current/new/confirm fields |
| Password change endpoint | Done | Added PUT /api/tenant/password in server.js — bcrypt.compare for current, bcrypt.hash for new |

### Files Modified in Phase 2.2+2.3

- `src/views/dashboard/campaign-form.ejs` — enabled voice tab button
- `src/core/AntiBanEngine.js` — added safeMode param to applyDelay()
- `src/core/processBatch.js` — reads safe_mode from tenant settings, passes to applyDelay
- `src/views/dashboard/settings.ejs` — password change section + handler
- `src/server.js` — PUT /api/tenant/password endpoint

---

## PHASE 2.6 COMPLETE — Smart Scheduling

| Task | Status | Details |
|------|--------|---------|
| DB Migration | Done | Added `scheduled_at TIMESTAMP` and `timezone TEXT DEFAULT 'Asia/Riyadh'` columns to campaigns table via migrate_saas.js |
| Campaign Form Step 3 | Done | Added "توقيت الإرسال" section with toggle (إرسال فوري / جدولة لوقت لاحق), date+time pickers, hint text. Pre-fills on edit. |
| Campaign Route POST | Done | Accepts `scheduled_at` from form. If provided, sets status to 'scheduled' instead of 'active'. |
| Campaign Route PUT | Done | Accepts `scheduled_at` on update. Updates status and scheduled_at accordingly. |
| ScheduleManager | Done | New `src/core/ScheduleManager.js` — polls DB every 60s for due campaigns, triggers BackgroundQueue.addJob(). Graceful error handling. |
| Server Integration | Done | ScheduleManager.start(60000) called in server.js. ScheduleManager.stop() in graceful shutdown. |
| Sidebar | Done | Changed disabled "الجدولة الذكية" div to active `<a href="/campaigns">` link. Removed "قريباً" badge. |
| Campaigns List | Done | Added 'scheduled' status with purple color (`bg-purple-50 text-purple-700`), Arabic label "مجدولة", purple dot indicator. Shows scheduled date/time under campaign name. |

### Files Modified in Phase 2.6

- `src/database/migrate_saas.js` — scheduled_at + timezone columns
- `src/views/dashboard/campaign-form.ejs` — step 3 scheduling section + JS toggle
- `public/js/campaign-editor.js` — append scheduled_at to FormData
- `src/routes/campaigns.js` — POST and PUT accept scheduled_at, set status
- `src/core/ScheduleManager.js` — new polling service
- `src/server.js` — import + start ScheduleManager, stop on shutdown
- `src/views/partials/sidebar.ejs` — enabled scheduling link
- `src/views/dashboard/campaigns.ejs` — scheduled status label/color/dot + date display

---

## PHASE 4.1 COMPLETE — Stripe Billing Integration (Part 1 + Part 2)

### Part 1 — Backend & Config (from prior session)
- Database columns: stripe_customer_id, stripe_subscription_id, subscription_plan, subscription_status, trial_ends_at, current_period_end
- `src/config/stripe.js`: Plan definitions (free/basic/pro/enterprise) with quotas, price IDs, Arabic names
- `src/routes/billing.js`: Full billing routes (checkout, portal, webhook)
- `src/middleware/subscriptionGuard.js`: Blocks expired/canceled subscriptions
- Webhook: Idempotent via processed_webhooks table

### Part 2 — UI & Integration (this session)

| Task | Status | Details |
|------|--------|---------|
| Billing Page Invoice History | Done | Added invoice table to billing.ejs — fetches last 12 Stripe invoices with status badges and PDF download links |
| Sidebar Plan Badge | Done | Color-coded badge next to billing link: gray (Free), blue (Basic), green (Pro), purple (Enterprise) |
| Dynamic Trial Banner | Done | main.ejs banner now reads subscription_status from injected data — trialing shows days left (amber), expired shows red warning, past_due shows payment warning, active hides banner. Links to /billing instead of WhatsApp. |
| ejsLayout Subscription Injection | Done | ejsLayout.js now fetches subscription info from DB (5-min cache) and injects subscriptionPlan, subscriptionStatus, trialEndsAt, currentPeriodEnd into ALL page renders |
| Registration Stripe Flow | Done | auth.js register: creates Stripe customer (if configured), sets 7-day trial (trial_ends_at), free plan, 50 msg quota. Updates Stripe customer metadata with tenant ID after insert. |
| Removed hardcoded trialActive | Done | server.js dashboard route no longer passes trialActive: true |
| Quota auto-reset on invoice.paid | Verified | Webhook handler resets messages_used=0, sets message_quota based on plan tier, updates current_period_end |

### Files Modified in Phase 4.1 Part 2

- `src/middleware/ejsLayout.js` — async renderPage, subscription DB query with cache, injects sub data into all renders
- `src/views/layouts/main.ejs` — dynamic trial banner based on subscription_status/trialEndsAt
- `src/views/partials/sidebar.ejs` — plan badge next to billing link
- `src/views/dashboard/billing.ejs` — invoice history section (table with status badges, PDF links)
- `src/routes/billing.js` — fetches Stripe invoices list (last 12), passes to template
- `src/routes/auth.js` — Stripe customer creation + 7-day trial on registration
- `src/server.js` — removed hardcoded trialActive: true from dashboard route
- `.planning/STATE_OF_THE_UNION.md` — updated Phase 4.1 status

---

## Remaining Phases

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 2.1 | Pending | Full contacts management (DB insertion, CRUD, sidebar badge removal) |
| Phase 2.4 | Pending | Reports upgrade (CSV export, date range, summary cards) |
| Phase 2.5 | Pending | Admin dashboard enhancement (create/delete tenants, force disconnect, system health) |
| Phase 3 | Pending | Infrastructure hardening (local Tailwind, indexes, error logging, dev script, graceful shutdown) |
| Phase 4.1 | DONE | Stripe billing integration (Part 1 + Part 2) |
