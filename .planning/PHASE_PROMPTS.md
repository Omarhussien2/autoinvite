# AutoInvite — Phase Execution Prompts

> **Instructions:** Copy ONE prompt per session. After each session completes, the AI will update memory automatically. Start the next session with the next prompt.

---

## SESSION 1: Phase 1 — Critical Bug Fixes (Bugs 1-6)

```
Role: You are the Principal Software Architect for AutoInvite SaaS. Read `.planning/STATE_OF_THE_UNION.md` and your memory files to understand the full context.

This session: Execute Phase 1 (first half) — fix bugs 1 through 6.

BUG-1 (Settings not consumed): In `src/core/processBatch.js`, before the contact loop, read the tenant's settings from DB (`SELECT settings FROM tenants WHERE id = $1`). Pass `settings.min_delay * 1000` and `settings.max_delay * 1000` to `AntiBanEngine.applyDelay()` instead of the hardcoded `config.whatsapp.minDelay/maxDelay`. If settings are missing, fall back to config defaults.

BUG-2 (stopJob leaves campaign stuck): In `src/core/BackgroundQueue.js`, modify `stopJob()` to update campaign status to 'paused' in DB BEFORE deleting from the jobs map. Add: `await db.query('UPDATE campaigns SET status = $1 WHERE id = (SELECT campaign_id FROM ...)')` or track campaignId in the job object.

BUG-3 (Global stop flag never cleaned): In `BackgroundQueue.js`, add cleanup of `global.stopBatchRequested[tenantId]` in both `.then()` and `.catch()` handlers. Also in `addJob()`, reset the flag at the start: `global.stopBatchRequested[tenantId] = false`.

BUG-4 (Campaign progress percentage wrong): In `src/views/dashboard/campaigns.ejs`, replace the raw `last_sent_row` percentage display. The campaigns route in `server.js` already loads campaigns — add a `sent_logs COUNT` query per campaign, or use the `/stats` endpoint data pattern to calculate real percentage.

BUG-5 (extraScript rendered twice): In `src/views/layouts/main.ejs`, delete line 181 (the duplicate `<%- typeof extraScript !== 'undefined' ? extraScript : '' %>`).

BUG-6 (Dead code normalizer.js): Delete `src/utils/normalizer.js` entirely. Verify with grep that nothing imports it.

After fixing all 6, commit with a clear message. Then update memory with what was completed and what remains.
```

---

## SESSION 2: Phase 1 — Critical Bug Fixes (Bugs 7-12)

```
Role: You are the Principal Software Architect for AutoInvite SaaS. Read `.planning/STATE_OF_THE_UNION.md` and your memory files to understand progress.

This session: Execute Phase 1 (second half) — fix bugs 7 through 12.

BUG-7 (Partial failures marked completed): In `src/core/processBatch.js`, add counters for successCount and failCount inside the loop. After the loop ends, return an object `{ successCount, failCount }`. In `BackgroundQueue.js` `.then()`, check the ratio: if failCount > successCount, set campaign status to 'partial_failure' instead of 'completed'.

BUG-8 (Memory leak — orphaned setInterval): In `src/core/WhatsAppManager.js`, store the interval ID: `this._sleepMonitorId = setInterval(...)`. Add a `stopSleepMonitor()` method that calls `clearInterval(this._sleepMonitorId)`. In `src/server.js`, add graceful shutdown: `process.on('SIGTERM', () => { WhatsAppManager.stopSleepMonitor(); ... })`.

BUG-9 (Quota race condition): In `src/core/processBatch.js`, before each message send inside the loop, add a quota check: `const quotaRes = await db.query('SELECT messages_used, message_quota FROM tenants WHERE id = $1', [tenantId])`. If `messages_used >= message_quota`, break the loop with an appropriate log message.

BUG-10 (Missing browser cleanup on init failure): In `src/core/WhatsAppManager.js`, wrap the `wppconnect.create()` call in a try-catch-finally. In the catch block, attempt to close any partially-created client before re-throwing.

BUG-11 (No transaction for sent_logs + campaign update): In `src/core/processBatch.js`, wrap the INSERT into sent_logs and UPDATE campaigns.last_sent_row in a transaction using `BEGIN` / `COMMIT` / `ROLLBACK`.

BUG-12 (Typing duration mismatch): In `src/core/processBatch.js` line 125, replace the hardcoded `Math.min(message.length * 50, 3000)` with `AntiBanEngine.typingDuration(message)` which already exists and uses proper human-like calculation.

After fixing all 6, commit. Update memory with Phase 1 completion status.
```

---

## SESSION 3: Phase 2.2 + 2.3 — Enable Voice Notes & Connect Settings

```
Role: You are the Principal Software Architect for AutoInvite SaaS. Read `.planning/STATE_OF_THE_UNION.md` and memory files.

This session: Phase 2.2 (Enable Voice Notes) + Phase 2.3 (Connect Settings to Engine).

VOICE NOTES (2.2):
1. In `src/views/dashboard/campaign-form.ejs` line 81-84, remove the `disabled` attribute and the "قريباً" span from the voice tab button.
2. Make the button functional like the text tab button.
3. Verify the full pipeline works: the recording UI, file upload fallback, `voicenoteUpload` input, `campaign-editor.js` form submission with voicenote field, backend `campaigns.js` route handling `voicenote` file, and `processBatch.js` PTT sending logic.
4. If anything is broken in the pipeline, fix it.

CONNECT SETTINGS (2.3):
1. Settings are already saved via `PUT /api/tenant/settings` to `tenants.settings` JSONB.
2. BUG-1 fix from Phase 1 should have connected min/max delay. Verify it works end-to-end.
3. Add password change functionality to `src/views/dashboard/settings.ejs`:
   - Add a "Change Password" section with current_password, new_password, confirm_password fields.
   - Add a `PUT /api/tenant/password` endpoint in `src/server.js` that verifies current password with bcrypt.compare, then updates with bcrypt.hash.
4. If `safe_mode` is set to false in tenant settings, skip the daily budget guard in AntiBanEngine (pass a flag to `applyDelay`).

Commit changes. Update memory.
```

---

## SESSION 4: Phase 2.1 — Full Contacts Management

```
Role: You are the Principal Software Architect for AutoInvite SaaS. Read `.planning/STATE_OF_THE_UNION.md` and memory files.

This session: Phase 2.1 — Make the Contacts page fully functional.

Currently contacts are uploaded as files and stored on disk (`contacts_path`), but never inserted into the `contacts` DB table. The `/contacts` page queries from this table and always shows empty.

TASKS:
1. In `src/routes/campaigns.js` POST route (campaign creation), after saving the campaign, parse the uploaded contacts file using `loadContacts(contactsPath)`, then INSERT each contact into the `contacts` table with: `tenant_id`, `campaign_id`, `name`, `phone` (normalized), `status='pending'`.

2. In `src/core/processBatch.js`, after successful send, UPDATE the contact in the `contacts` table: `UPDATE contacts SET status = 'sent', sent_at = NOW() WHERE tenant_id = $1 AND campaign_id = $2 AND phone = $3`. On failure: `SET status = 'failed'`.

3. In `src/views/partials/sidebar.ejs`, remove the "قريباً" badge from the Contacts nav item (around line 54).

4. Add a manual "Add Contact" form on the contacts page:
   - A simple inline form at the top: Name + Phone + "Add" button
   - POST to `/api/contacts` endpoint (create this endpoint)
   - Insert into contacts table with `tenant_id`, no `campaign_id`, status='manual'

5. Add delete action per contact row:
   - Add a delete button/icon in each table row
   - DELETE `/api/contacts/:id` endpoint with tenant_id guard

6. Verify the CSV export function in contacts.ejs still works with real data.

Commit. Update memory.
```

---

## SESSION 5: Phase 2.6 — Smart Scheduling

```
Role: You are the Principal Software Architect for AutoInvite SaaS. Read `.planning/STATE_OF_THE_UNION.md` and memory files.

This session: Phase 2.6 — Build the Smart Scheduling feature.

Currently the sidebar shows "الجدولة الذكية" as a disabled "قريباً" link with no functionality.

TASKS:
1. Database: Add migration for `scheduled_at TIMESTAMP` and `timezone TEXT DEFAULT 'Asia/Riyadh'` columns to campaigns table. Run via `src/database/migrate_saas.js`.

2. Campaign Form: In `src/views/dashboard/campaign-form.ejs`, add a scheduling section (step 3):
   - Toggle: "إرسال فوري" vs "جدولة لوقت لاحق"
   - If scheduled: date picker + time picker inputs
   - Pass `scheduled_at` in the form submission

3. Campaign Route: In `src/routes/campaigns.js` POST, accept `scheduled_at`. If provided, set campaign status to 'scheduled' instead of 'active'.

4. Schedule Manager: Create `src/core/ScheduleManager.js`:
   - Poll every 60 seconds: `SELECT * FROM campaigns WHERE status = 'scheduled' AND scheduled_at <= NOW()`
   - For each due campaign, trigger `BackgroundQueue.addJob()` with the campaign's data
   - Update status to 'running'
   - Handle errors gracefully

5. Server Integration: In `src/server.js`, import and start the ScheduleManager alongside WhatsAppManager.

6. Sidebar: In `src/views/partials/sidebar.ejs`, change the disabled scheduling div to a real `<a href="/campaigns">` link (scheduling is part of campaigns now, not a separate page). Remove "قريباً" badge. Or alternatively, create a `/schedule` page that lists only scheduled campaigns.

7. Campaigns List: In `campaigns.ejs`, add a 'scheduled' status color/label (e.g., bg-purple-50 text-purple-700, label "مجدولة").

Commit. Update memory.
```

---

## SESSION 6: Phase 2.4 + 2.5 — Reports Upgrade & Admin Tools

```
Role: You are the Principal Software Architect for AutoInvite SaaS. Read `.planning/STATE_OF_THE_UNION.md` and memory files.

This session: Phase 2.4 (Reports Upgrade) + Phase 2.5 (Admin Dashboard Enhancement).

REPORTS UPGRADE (2.4):
1. Add CSV export button to `src/views/dashboard/reports.ejs` (same pattern as contacts page export).
2. Add date range filter: two date inputs (from/to) that filter the table client-side.
3. Add summary stat cards above the table:
   - Total sent (already exists as `logs.length`)
   - Success rate: `(successCount / total * 100).toFixed(1)%`
   - Failed count
   - Most active campaign name

ADMIN DASHBOARD (2.5):
1. Add "Create Tenant" functionality:
   - Button that opens a modal with: name, username, password, message_quota fields
   - POST `/admin/tenants` endpoint in `src/routes/admin.js`
   - Hash password with bcrypt, insert into tenants table

2. Add "Delete Tenant" functionality:
   - Delete button per tenant row with confirmation
   - DELETE `/admin/tenants/:id` endpoint (CASCADE will clean up campaigns, contacts, etc.)
   - Prevent deleting yourself (check req.session.tenantId !== id)

3. Add "Force Disconnect WhatsApp" button per tenant:
   - POST `/admin/tenants/:id/disconnect` endpoint
   - Calls `WhatsAppManager.stopClient(id)`

4. Add system health section at top of admin dashboard:
   - Active WhatsApp instances: `WhatsAppManager.clients.size`
   - Max capacity: `WhatsAppManager.MAX_TOTAL_CLIENTS`
   - Server uptime: `process.uptime()`
   - Memory usage: `process.memoryUsage().rss`

Commit. Update memory.
```

---

## SESSION 7: Phase 3 — Infrastructure Hardening

```
Role: You are the Principal Software Architect for AutoInvite SaaS. Read `.planning/STATE_OF_THE_UNION.md` and memory files.

This session: Phase 3 — Infrastructure hardening and code quality.

TASKS:

3.1 Replace Tailwind CDN:
- Install tailwindcss as dev dependency
- Create `tailwind.config.js` with the existing theme from main.ejs
- Create `src/styles/input.css` with @tailwind directives
- Add build script: `"build:css": "npx tailwindcss -i src/styles/input.css -o public/css/tailwind.css --minify"`
- Replace CDN script tag in main.ejs with `<link rel="stylesheet" href="/css/tailwind.css">`
- Add to postinstall or create a build step

3.2 Add Database Indexes:
In `src/database/migrate_saas.js`, add:
- `CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id)`
- `CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status)`
- `CREATE INDEX IF NOT EXISTS idx_sent_logs_tenant ON sent_logs(tenant_id, campaign_id)`
- `CREATE INDEX IF NOT EXISTS idx_sent_logs_date ON sent_logs(sent_at)`
- `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone ON contacts(tenant_id, phone)`

3.3 Fix Silent Error Swallowing:
Search for all `.catch(() => {})` patterns. Replace with `.catch(err => console.error('[Context] Error:', err.message))`. Do NOT add complex error handling — just make failures visible in logs.

3.4 Add dev script:
In package.json, add: `"dev": "node --watch src/server.js"`

3.5 Graceful Shutdown:
In `src/server.js`, add:
- `process.on('SIGTERM', gracefulShutdown)`
- `process.on('SIGINT', gracefulShutdown)`
- Function: stop sleep monitor, close all WhatsApp clients, close DB pool, close HTTP server

Commit. Update memory with full Phase 1-3 completion.
```

---

## SESSION 8: Phase 4.1 — Stripe Billing Integration (Part 1: Setup)

```
Role: You are the Principal Software Architect for AutoInvite SaaS. Read `.planning/STATE_OF_THE_UNION.md` and memory files.

This session: Phase 4.1 Part 1 — Stripe billing setup and subscription infrastructure.

TASKS:

1. Database Schema:
   Add columns to tenants table via migration:
   - `stripe_customer_id TEXT`
   - `stripe_subscription_id TEXT`
   - `subscription_plan TEXT DEFAULT 'free'` (free, basic, pro, enterprise)
   - `subscription_status TEXT DEFAULT 'trialing'` (trialing, active, past_due, canceled)
   - `trial_ends_at TIMESTAMP`
   - `current_period_end TIMESTAMP`

2. Stripe Config:
   - Install `stripe` npm package
   - Create `src/config/stripe.js` with plan definitions:
     - free: 50 msg/mo, price_id from env
     - basic: 500 msg/mo, price_id from env
     - pro: 2000 msg/mo, price_id from env
     - enterprise: unlimited, price_id from env
   - Initialize Stripe with `process.env.STRIPE_SECRET_KEY`

3. Checkout Route:
   - Create `src/routes/billing.js`
   - GET `/billing` — show current plan, usage, upgrade options (EJS page)
   - POST `/billing/checkout` — create Stripe Checkout session for selected plan
   - GET `/billing/portal` — redirect to Stripe Customer Portal

4. Webhook Route:
   - POST `/billing/webhook` — handle Stripe webhook events:
     - `checkout.session.completed` — activate subscription, set quota
     - `invoice.paid` — reset monthly usage, update period_end
     - `customer.subscription.updated` — update plan/status
     - `customer.subscription.deleted` — downgrade to free
   - Must be idempotent (handle same event twice safely)
   - Use raw body parser for webhook signature verification

5. Subscription Guard Middleware:
   - Create `src/middleware/subscriptionGuard.js`
   - Check tenant's subscription_status is 'active' or 'trialing'
   - If expired/canceled, redirect to billing page

Commit. Update memory.
```

---

## SESSION 9: Phase 4.1 — Stripe Billing Integration (Part 2: UI & Integration)

```
Role: You are the Principal Software Architect for AutoInvite SaaS. Read `.planning/STATE_OF_THE_UNION.md` and memory files.

This session: Phase 4.1 Part 2 — Billing UI and full integration.

TASKS:

1. Billing Page UI:
   Create `src/views/dashboard/billing.ejs`:
   - Current plan card with usage meter
   - Available plans grid with features comparison
   - "Upgrade" / "Downgrade" buttons → Stripe Checkout
   - "Manage Subscription" → Stripe Customer Portal
   - Invoice history section

2. Sidebar Integration:
   Add billing link to sidebar between Settings and the divider.
   Show current plan badge (e.g., "Pro" in green, "Free" in gray).

3. Trial Banner Update:
   Replace the hardcoded trial banner in `main.ejs` with dynamic logic:
   - If `subscription_status === 'trialing'`: show trial days remaining
   - If `subscription_status === 'past_due'`: show payment warning
   - If `subscription_status === 'active'`: hide banner
   - Link to billing page instead of WhatsApp contact

4. Quota Auto-Reset:
   In the `invoice.paid` webhook handler:
   - Reset `messages_used = 0`
   - Set `message_quota` based on plan tier
   - Update `current_period_end`

5. Registration Flow:
   When new tenant registers:
   - Create Stripe customer via API
   - Store `stripe_customer_id`
   - Set 7-day free trial
   - Set `trial_ends_at = NOW() + 7 days`

6. Add billing route to server.js and wire up middleware.

Commit. Update memory with Phase 4.1 completion.
```

---

## Notes for All Sessions

- Always read memory files first: check `~/.claude/projects/C--Users-omarh-Desktop-AutoInvite/memory/MEMORY.md`
- Always read `.planning/STATE_OF_THE_UNION.md` for full context
- After completing work, update memory with: what was done, what remains, any discoveries
- Never skip testing — at minimum verify the app starts with `node src/server.js`
- Follow CLAUDE.md directives: no dangling promises, proper Puppeteer cleanup, async/await everywhere
