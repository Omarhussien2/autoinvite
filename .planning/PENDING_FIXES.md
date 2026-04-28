# AutoInvite — Disabled Features Debt Tracker

**Date:** 2026-04-07
**Status:** Features visually disabled for V1.0 stable launch
**Policy:** No code deleted — only CSS opacity/pointer-events + HTML `disabled` attributes applied

---

## UI Changes Applied

### 1. Sidebar — الجدولة الذكية (Smart Scheduling)
- **File:** `src/views/partials/sidebar.ejs`
- **Change:** `href="#"`, added `pointer-events-none opacity-60 cursor-default`, added badge `قريباً 🚀`
- **Backend code preserved:** `src/core/ScheduleManager.js`, campaign `scheduled_at` column, scheduling routes — all intact

### 2. Campaign Form — المصمم الذكي (Smart Designer / Canvas)
- **File:** `src/views/dashboard/campaign-form.ejs`
- **Change:** Added `قريباً 🚀` badge to header. Canvas container and controls already had `opacity-50 pointer-events-none` + `disabled` on inputs.
- **Backend code preserved:** `public/js/campaign-editor.js`, `src/utils/generator.js`, canvas rendering logic — all intact

### 3. Campaign Form — صورة الدعوة (Image Template Upload)
- **File:** `src/views/dashboard/campaign-form.ejs`
- **Change:** Container `opacity-50 pointer-events-none`, input `disabled`
- **Backend code preserved:** Multer upload route, `template_path` column, `processBatch.js` image send logic — all intact

### 4. Campaign Form — الجدولة لوقت لاحق (Schedule for Later)
- **File:** `src/views/dashboard/campaign-form.ejs`
- **Change:** Entire section wrapped in `opacity-50 pointer-events-none`. Both toggle buttons `disabled`. Date/time inputs `disabled`. Badge `قريباً 🚀` added.
- **Backend code preserved:** `scheduled_at` column, `ScheduleManager.js` polling, campaign status transitions — all intact

---

## Backend Bugs — Status

### ~~BUG-A: Canvas name overlay not rendering/moving correctly~~ — FIXED ✅
- **Fixed in:** commit TBD (2026-04-28)
- **Root causes found:**
  1. Font mismatch: frontend used "IBM Plex Sans Arabic" while backend used TSNAS Bold → unified to Readex Pro
  2. Hit test used `fontSize * previewName.length * 0.6` (ASCII estimate) → replaced with `ctx.measureText()` for accurate Arabic text width
  3. `loadImageFromUrl` used falsy check `cc.x ?` which fails when x=0 → changed to `cc.x != null`
  4. No RTL direction set on canvas → added `ctx.direction = 'rtl'`
  5. Preview name was generic "الاسم" → changed to realistic "محمد أحمد"
- **Files changed:** `public/js/campaign-editor.js`, `src/utils/generator.js`, `src/config/settings.js`

### ~~BUG-B: Image attachment causing campaign failure~~ — FIXED ✅
- **Fixed in:** commit TBD (2026-04-28)
- **Root causes found:**
  1. No fallback when image send fails after retries → added text-only fallback
  2. Retry count was 2 → increased to 3 with better logging
  3. Temp image cleanup was not in finally block → moved to `finally` for guaranteed cleanup
  4. generator.js had no cleanup on failure → added temp file removal in catch
- **Files changed:** `src/core/processBatch.js`, `src/utils/generator.js`

### ~~BUG-C: Schedule manager timezone/trigger issues~~ — FIXED ✅
- **Fixed in:** commit TBD (2026-04-28)
- **Root causes found:**
  1. No WhatsApp readiness check before triggering → campaign fails instantly if WA disconnected
  2. No quota check → scheduled campaigns bypass quotaGuard middleware entirely
  3. No retry logic → single failure = permanently failed campaign
  4. 60s polling too coarse → up to 59s delay
  5. No Socket.IO notifications → user doesn't know campaign started/stopped
  6. No composite DB index → polling query scans full table
  7. ScheduleManager not connected to Socket.IO → no real-time feedback
- **Files changed:** `src/core/ScheduleManager.js` (full rewrite), `src/server.js`, `src/database/migrate_saas.js`, `src/views/dashboard/campaign-form.ejs`, `src/views/partials/sidebar.ejs`, `public/js/campaign-editor.js`

## How to Re-Enable

When each bug is fixed, revert the UI changes:

| Feature | File | Status | What was reverted |
|---------|------|--------|-------------------|
| Scheduling sidebar | `sidebar.ejs` | RE-ENABLED ✅ | Changed href to `/campaigns`, removed `pointer-events-none opacity-60 cursor-default`, removed badge |
| Smart Designer | `campaign-form.ejs` | RE-ENABLED ✅ | Removed `قريباً 🚀` badge, removed `opacity-50 pointer-events-none` from canvas container and controls |
| Image Upload | `campaign-form.ejs` | RE-ENABLED ✅ | Removed `opacity-50 pointer-events-none` from container, removed `disabled` from input |
| Schedule Toggle | `campaign-form.ejs` | RE-ENABLED ✅ | Removed `opacity-50 pointer-events-none` wrapper, removed `disabled` from buttons and inputs, removed badge |
