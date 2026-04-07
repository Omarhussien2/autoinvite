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

## Backend Bugs to Fix (Post-V1.0)

### BUG-A: Canvas name overlay not rendering/moving correctly
- **Location:** `src/utils/generator.js` + `public/js/campaign-editor.js`
- **Problem:** The drag-to-position name overlay on the invitation template does not render or move correctly. The canvas drawImage + fillText coordinates may be miscalculated relative to the template dimensions.
- **Impact:** Smart Designer feature is unusable — users cannot position guest names on invitation images.
- **Fix needed:** Debug canvas coordinate system, verify `generator.js` reads `canvas_config` (x, y, fontSize, color) correctly, test end-to-end with actual template images.

### BUG-B: Image attachment causing campaign failure
- **Location:** `src/core/processBatch.js` + `src/core/WhatsAppManager.js`
- **Problem:** When a campaign has a `template_path` (image), the send flow fails. Likely causes: (1) file path resolution issue on server vs local, (2) WPPConnect/Puppeteer `sendMessageWithThumb` or `sendImage` API misuse, (3) image buffer not loaded correctly before send.
- **Impact:** Any campaign using image templates will fail per-contact. Text-only campaigns work fine.
- **Fix needed:** Trace the image send path from `processBatch` → `WhatsAppManager.sendMessage`, verify file exists, test with WPPConnect's correct media send API.

### BUG-C: Schedule manager timezone/trigger issues
- **Location:** `src/core/ScheduleManager.js`
- **Problem:** (1) Off-by-one bug was fixed (changed `0, contacts.length-1` to `1, contacts.length`), but broader timezone handling may still be wrong — server runs in UTC, campaigns expect Asia/Riyadh (UTC+3). (2) The polling interval (60s) may miss the exact scheduled minute. (3) No retry logic on transient failures.
- **Impact:** Scheduled campaigns may fire at wrong times or fail silently.
- **Fix needed:** Convert `scheduled_at` comparison to tenant timezone, add retry logic, consider reducing poll interval or using a more precise trigger mechanism.

---

## How to Re-Enable

When each bug is fixed, revert the UI changes:

| Feature | File | What to revert |
|---------|------|----------------|
| Scheduling sidebar | `sidebar.ejs` | Change `href="#"` back to `href="/campaigns"`, remove `pointer-events-none opacity-60 cursor-default`, remove badge |
| Smart Designer | `campaign-form.ejs` | Remove `قريباً 🚀` badge from header, remove `opacity-50 pointer-events-none` from canvas container and controls |
| Image Upload | `campaign-form.ejs` | Remove `opacity-50 pointer-events-none` from container, remove `disabled` from input |
| Schedule Toggle | `campaign-form.ejs` | Remove `opacity-50 pointer-events-none` wrapper, remove `disabled` from buttons and inputs, remove badge |
