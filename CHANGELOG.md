# سجل التحديثات — عزام

<!--

---

## [v3.3.0] — 2026-04-28 — تفعيل المصمم الذكي

### Fixed
- إصلاح BUG-A: توحيد خط الاسم بين Frontend و Backend (Readex Pro) `TBD`
- إصلاح BUG-A: hit test للـ drag يستخدم `measureText()` بدل تقدير ASCII `TBD`
- إصلاح BUG-A: `loadImageFromUrl` كان يفشل عند x=0 بسبب falsy check `TBD`
- إصلاح BUG-A: إضافة `ctx.direction = 'rtl'` لدعم النص العربي على Canvas `TBD`
- إصلاح BUG-B: إضافة fallback لنص عادي عند فشل إرسال الصورة بعد 3 محاولات `TBD`
- إصلاح BUG-B: cleanup مضمون للـ temp images عبر `finally` block `TBD`

### Added
- خط Readex Pro Bold (ReadexPro-Bold.ttf) للـ server-side canvas rendering `TBD`
- `getTextHitBox()` function لقياس عرض النص العربي بدقة `TBD`
- cursor تغيير (grab/grabbing) عند hover/drag على الاسم `TBD`
- logging محسّن في retry logic (عرض رقم المحاولة) `TBD`

### Changed
- Frontend preview name: "الاسم" → "محمد أحمد" (اسم حقيقي للمعاينة) `TBD`
- Retry count: 2 → 3 محاولات لإرسال الصور `TBD`
- generator.js: font registration priority (Readex Pro → TSNAS Bold → system) `TBD`
- settings.js: fontFamily default: "CustomFont" → "Readex Pro" `TBD`

### Removed
- إزالة `قريباً 🚀` badge من المصمم الذكي `TBD`
- إزالة `opacity-50 pointer-events-none` من canvas-container و canvas-controls `TBD`
- إزالة `disabled` من imgUpload و fontSize و fontColor inputs `TBD`

---

-->
  ╔══════════════════════════════════════════════════════════════╗
  ║  MUST يتم تحديث هذا الملف مع كل تغيير يُدخل على المشروع     ║
  ║  آخر مهمة دائمة في أي task: تحديث CHANGELOG.md + DEVLOG.md  ║
  ║  لو لقيت الملف قديم أو ناقص → حدّثه فوراً                  ║
  ╚══════════════════════════════════════════════════════════════╝

  تصنيفات التغييرات:
    Added     → ميزة أو مكون جديد
    Changed   → تعديل على ميزة موجودة
    Fixed     → إصلاح bug أو مشكلة
    Removed   → حذف ميزة أو ملف
    Security  → إصلاح أمني أو تحسين حماية
-->

---

## [v3.2.0] — 2026-04-21 — إعادة الهوية البصرية (Rebrand)

### Changed
- استبدال هوية "AutoInvite" بـ "عزام" في كل الواجهات والصفحات `a1aa91d`
  - EJS: sidebar, login, register, main layout
  - Landing Page: Navbar, Hero, Footer, CTA, FAQ, FeaturesBento, Comparison
  - Locales: ar-SA/common.json, en/common.json
  - Config: package.json, ecosystem.config.js (PM2 → azzam)
  - Docs: README, CHANGELOG, Dockerfile, .env.example
- استبدال اللوجو القديم بلوجو جديد (logo-new.png) `a1aa91d`

### Added
- خط **Readex Pro** (Google Fonts) لاسم البراند "عزام" بدل Tajawal/TSNAS `becb948`
- استيراد Readex Pro في: main.ejs, login.ejs, index.html

### Changed
- تكبير حجم اللوجو في Navbar (38px → 52px) `becb948`
- تكبير حجم اللوجو في Dashboard Sidebar (w-9 → w-12) `becb948`
- تكبير حجم اللوجو في صفحة الدخول (w-10 → w-14) `becb948`

### Fixed
- إزالة خلفية اللوجو البيضاء: استبدال PNG بلوجو شفاف + إزالة mix-blend-mode hack `d05b0cd`

---

## [v3.1.0] — 2026-04-12 — تحسينات الإنتاج

### Fixed
- زيادة WhatsApp sleep timeout من 15 دقيقة إلى 8 ساعات لمنع انقطاع الجلسات أثناء الحملات الطويلة `3a0a3f5`

### Changed
- إزالة الأسعار من قسم المقارنة في Landing Page `9b92c39`

### Added
- ميزة "قطع الاتصال وتغيير الرقم" — حذف عميق للتوكنات + QR جديد `d19cad5`

### Changed
- تغيير quota الرسائل الافتراضي من 1000 إلى 99 رسالة `ca61806`

---

## [v3.0.0] — 2026-04-07 — إطلاق النظام الشامل (Billing + V1 Toggle)

### Added
- تكامل **Stripe** الكامل: checkout, portal, webhooks, subscription guard `9293d9b`
- واجهة Billing: banner ديناميكي، plan badges، invoice history، فترة تجريبية عند التسجيل `a2460f9`
- ميزة **Smart Scheduling** للجدولة الذكية للحملات `317fb19`
- تفعيل **Voice Notes** + ربط الإعدادات بمحرك الإرسال `52f6d0d`
- تحسين صفحة التقارير + لوحة المشرف (Admin Dashboard) `53bfe9e`
- Feature Toggle: تعطيل الميزات غير المستقرة مع badges "قريباً" + debt tracker `2589a03`

### Fixed
- إصلاح 12 bug حرج مقسم على Phase 1 (first half + second half) `c3b0292` `ab6acf2`
- إصلاح fatal syntax errors، webhook security، subscription guard، ScheduleManager off-by-one `9488e60`
- إصلاح campaign module: image/canvas/schedule bugs `d21b0e9`

### Changed
- **Infrastructure hardening**: local Tailwind compile, DB indexes, error logging, dev script `c4841fd`

### Removed
- حذف الميزات المُعطلة مؤقتاً من الواجهة (scheduling, image upload, smart designer) `2589a03`

---

## [v2.0.0] — 2026-04-04 — ترقية محرك الواتساب + صندوق الردود

### Added
- ترقية محرك الواتساب من `whatsapp-web.js` إلى **WPPConnect** `ea2a8e1`
- نظام **Anti-Ban Engine v2** بـ 6 طبقات حماية (توزيع غاوسي، محاكاة كتابة، مراعاة وقت، إحماء، حد يومي، استراحات) `ea2a8e1`
- **صندوق الردود المباشر** (Live Inbox) — محادثات فورية عبر Socket.io `ea2a8e1`
- **Live Voice Note (PTT)** — تسجيل وإرسال ملاحظات صوتية `9571422`
- مسجل صوتي داخل المتصفح (in-browser voice recorder) على campaign form `409723e`

### Fixed
- تحويل Voice Notes إلى OGG/Opus قبل الإرسال كـ PTT `6bf17ec`
- معالجة خطأ `InvalidMediaCheckRepairFailedType` من WhatsApp Web `c4a5c0c` `4849b02`
- معالجة WPPConnect error objects التي تظهر كـ `[object Object]` `a03b10c`
- إصلاح 10 bugs في صندوق الردود (inbox UX overhaul) `5ca20bd`
- إصلاح BackgroundQueue 'msg' typo المسبب لـ 'undefined' في الـ logs `fda8afb`
- تصحيح مسارات Landing Page assets + static serving `45ef04c`
- إصلاح auto-build للـ landing page عبر postinstall `45ccc0c`

### Changed
- تعطيل Voice Note tab مؤقتاً مع علامة "coming soon" `93acace`

### Removed
- حذف ملفات legacy: SQLite database files, single-page public files, src/index.js, dead root files `e905fb4` `fa9a78a` `09fc078` `50af3af`
- حذف `.claude/settings.local.json` من tracking `b5c5930`

### Security
- إغلاق ثغرات .gitignore `ed5d874`
- تحسين أمني شامل (security + performance) `f9cdb4a`

---

## [v1.5.0] — 2026-04-01 — تنظيم البنية التحتية

### Added
- خط **TSNAS Bold** لكل الواجهات (dashboard, auth, landing page) `b1ef6e0`
- Badges "قريباً" في الـ sidebar للخدمات المستقبلية `c5cf075`

### Fixed
- استعادة `loadContacts` و `processBatch` بعد refactor خاطئ `a736c5f`
- إضافة `src/core/index.js` module exports `095c113`
- إصلاح `session.save()` قبل response لضمان Set-Cookie header `d670f6a`
- إضافة Excel template download (.xlsx) + تحديث gitignore `ece68ee`

### Changed
- استبدال `src/` بالنسخة النظيفة + تطبيق الإصلاحات `6ecb5b7`
- إعادة تسمية `taqreerk` → `landing-autoinvite` + إضافة AGENTS.md `a114b56`

### Removed
- تعطيل canvas designer مؤقتاً `c5cf075`

---

## [v1.0.0] — 2026-03-30 — الإطلاق الأولي (AutoInvite SaaS)

### Added
- مشروع **AutoInvite SaaS** كامل: Express 5 + PostgreSQL + EJS + Socket.IO `92a239c`
- نظام Multi-tenant: admin/user roles, tenant isolation, quota system `01686a9`
- **Landing Page** (React + Vite + TypeScript): Hero بـ GSAP animations, Features, FAQ, Footer `724271d`
- محرك إرسال WhatsApp: QR auth, bulk sending, campaign management `8fb5ef3`
- نظام Campaigns: إنشاء، تشغيل، مراقبة مباشرة عبر Socket.IO `4d15d07`
- معالجة البيانات: CSV/Excel parsing، phone normalization، dedup `2ec2d67`
- Dashboard مستخدم: إحصائيات، حملات، جهات اتصال، تقارير `cf25ffd`
- لوحة تحكم Admin: إدارة tenants، quotas، مراقبة النظام `105d2b4`

### Fixed
- إصلاح nginx upstream port 3000 + server_name wildcard `fe8bbe2`
- إصلاح مسارات assets في Landing Page `c0c95be`
- إصلاح Chrome Singleton locks المتسببة في crash `06ee25b` → `4c0bdcd` → `6d3115f` → `17e89d4` → `9833d91`
- إصلاح missing columns: `last_sent_row`, `contacts_path`, `sent_logs` table `35ac6e8` `7b05d8e` `561740f`
- إصلاح WhatsApp number validation قبل الإرسال `deca34a`

### Changed
- تحسينات pre-deployment لـ Hostinger 8GB VPS `7c93c02`
- تحسين health meter من أرقام quotas إلى مؤشر نوعي `ebf899e` `4d24733`
- تكوين PM2 ecosystem + nginx reverse proxy `2598e30`

---

## [v0.1.0] — 2026-02-07 — النسخة التجريبية الأولى

### Added
- AutoInvite V2 — النسخة التجريبية الأولى `937eea8`
- الهيكل الأساسي للمشروع `5ebdf8c`
- دعم Railway deployment مع volumes `0faa17c`
