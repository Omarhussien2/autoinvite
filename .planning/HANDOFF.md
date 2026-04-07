# AutoInvite — توجيه استكمال العمل للأسبوع القادم

**التاريخ:** 2026-04-07  
**من:** عمر حسين  
**إلى:** عضو الفريق  
**المستودع:** https://github.com/Omarhussien2/autoinvite  
**السيرفر:** Hostinger VPS — IP: `31.97.123.204` — Domain: `www.inviteauto.com`

---

## 1. الوضع الحالي — ما الذي يعمل؟

المنصة تعمل ومرحبة بالعملاء. إليك ملخص سريع:

### يعمل بشكل ممتاز
- **تسجيل الدخول والخروج** — جلسات PostgreSQL، bcrypt، 7 أيام تجريبية تلقائية
- **إنشاء حملات نصية** — رفع ملف أرقام، كتابة رسائل، إرسال فوري عبر واتساب
- **إرسال الرسائل النصية** — محرك anti-ban، تأخير عشوائي، محاكاة كتابة
- **لوحة التحكم** — إحصائيات، حصص استخدام، قائمة الحملات
- **نظام الفوترة Stripe** — خطط (Free/Basic/Pro/Enterprise)، Checkout، Customer Portal، Webhooks، فواتير
- **حماية الاشتراك** — subscriptionGuard يمنع المستخدمين المنتهيين من الدخول
- **الصفحة الهبوطية** — React + Vite مبنية وم_deployed
- **صندوق الردود** — عرض رسائل الواتساب الواردة

### معطل مؤقتاً (بـ "قريباً") لاعطابات برمجية
- **الجدولة الذكية** — مشكلة timezone (BUG-C في PENDING_FIXES.md)
- **المصمم الذكي (Canvas)** — overlay الأسماء لا يعمل (BUG-A)
- **رفع صورة الدعوة** — إرسال الصور يفشل (BUG-B)
- **تفعيل التبويب الصوتي** — يعمل لكنه معطل مؤقتاً

### لم يُبنَ بعد
- إدارة جهات الاتصال الكاملة (CRUD منفصل)
- تحسينات التقارير
- تحسينات لوحة المشرف

---

## 2. هيكل المشروع — خريطة سريعة

```
src/
├── server.js                 # نقطة الدخول — كل مسارات الـ UI هنا
├── config/
│   ├── stripe.js             # تعريفات الخطط + Stripe SDK
│   ├── i18n.js               # Arabic/English i18n
│   └── settings.js           # إعدادات افتراضية
├── core/
│   ├── WhatsAppManager.js    # إدارة جلسات واتساب (WPPConnect)
│   ├── BackgroundQueue.js    # طابور إرسال الحملات
│   ├── AntiBanEngine.js      # تأخير عشوائي + محاكاة بشرية
│   ├── processBatch.js       # معالجة إرسال رسالة برسالة
│   └── ScheduleManager.js    # تشغيل الحملات المجدولة (معطل)
├── database/
│   ├── pg-client.js          # PostgreSQL Pool
│   ├── init_saas.js          # إنشاء الجداول
│   ├── migrate_saas.js       # إضافة أعمدة جديدة بأمان
│   └── seed_admin.js         # إنشاء حساب admin افتراضي
├── middleware/
│   ├── auth.js               # حماية المسارات (isAuthenticated)
│   ├── ejsLayout.js          # res.renderPage() + حقن بيانات الاشتراك
│   ├── subscriptionGuard.js  # منع المستخدمين المنتهيين
│   ├── quotaGuard.js         # منع تجاوز الحصة
│   └── uploadStorage.js      # Multer (رفع ملفات)
├── routes/
│   ├── auth.js               # تسجيل/دخول/خروج
│   ├── billing.js            # Stripe checkout + portal + webhook
│   ├── campaigns.js          # CRUD الحملات
│   ├── whatsapp.api.js       # بدء/إيقاف/حالة واتساب
│   └── admin.js              # لوحة المشرف
├── utils/
│   ├── dataProcessor.js      # تحليل CSV/Excel + تطبيع الأرقام
│   ├── generator.js          # توليد صور دعوة (Canvas) — معطل
│   └── logger.js             # تسجيل أخطاء
└── views/                    # قوالب EJS (عربي RTL)
    ├── layouts/main.ejs      # الهيكل الرئيسي + banner ديناميكي
    ├── partials/sidebar.ejs  # القائمة الجانبية + شارة الخطة
    └── dashboard/            # كل صفحات لوحة التحكم
```

---

## 3. كيف تعمل المنصة — المسارات الأساسية

### مسار الإرسال (الأهم)
```
مستخدم يرفع CSV → dataProcessor.js يحلل الأرقام
  → campaigns.js يحفظ الحملة + يدخل جهات الاتصال في DB
  → مستخدم يضغط "تشغيل" → run-campaign.ejs (Socket.IO)
  → WhatsAppManager.getClient(tenantId) → جلسة واتساب
  → BackgroundQueue.addJob() → processBatch()
  → لكل جهة اتصال: AntiBanEngine.delay() → WhatsAppManager.sendMessage()
  → INSERT في sent_logs → UPDATE حصة المستخدم
  → تحديث فوري عبر Socket.IO (progress, sent, failed)
```

### مسار الفوترة
```
مستخدم يضغط "ترقية" → billing.js POST /billing/checkout
  → Stripe Checkout Session → المستخدم يدفع
  → Stripe يرسل webhook → POST /billing/webhook
  → webhook يحدث: subscription_plan, subscription_status, message_quota
  → invoice.paid → يصفر messages_used ويعين الحصة الجديدة
```

### مسار التسجيل
```
POST /auth/register → bcrypt.hash → إنشاء Stripe customer
  → INSERT tenant (free plan, 7 يوم تجريبية, 99 رسالة)
  → Stripe metadata يُحدث بـ tenant_id
  → تسجيل دخول تلقائي → redirect /dashboard
```

---

## 4. المهام المطلوبة — مرتبة حسب الأولوية

### الأولوية القصوى (يجب إنجازها أولاً)

#### أ. إصلاح إرسال الصور (BUG-B)
**لماذا:** ميزة أساسية للمنصة — العملاء يريدون إرسال دعوات مصورة
- **الملف:** `src/core/processBatch.js` + `src/core/WhatsAppManager.js`
- **المشكلة:** عندما تكون الحملة بها `template_path` (صورة)، الإرسال يفشل
- **السبب المحتمل:** (1) مسار الملف لا يُحل بشكل صحيح، (2) WPPConnect API لإرسال الوسائط غير صحيح
- **خطوات الإصلاح:**
  1. تتبع المسار من processBatch → WhatsAppManager.sendMessage
  2. تحقق أن الملف موجود فعلاً على القرص قبل الإرسال
  3. تحقق من WPPConnect API الصحيح لإرسال صور (`sendImage` أو `sendMessageWithThumb`)
  4. اختبر من أول حملة بصورة حتى النهاية
- **بعد الإصلاح:** أزل `disabled` و `opacity-50 pointer-events-none` من رفع الصور في `campaign-form.ejs`
- **ملف التوثيق:** `.planning/PENDING_FIXES.md` — BUG-B

#### ب. إصلاح المصمم الذكي (BUG-A)
**لماذا:** ميزة مميزة — العملاء يتوقعون وضع الاسم على الصورة
- **الملفات:** `src/utils/generator.js` + `public/js/campaign-editor.js`
- **المشكلة:** overlay الأسماء لا يُرسم أو لا يتحرك بشكل صحيح على Canvas
- **خطوات الإصلاح:**
  1. اختبر السحب والإفلات في المتصفح — راقب console للأخطاء
  2. تحقق من أن `campaign-editor.js` يقرأ أحداث اللمس/الفأرة بشكل صحيح
  3. تحقق من أن `generator.js` يقرأ `canvas_config` (x, y, fontSize, color)
  4. اختبر الناتج النهائي — صورة عليها اسم الضيف
- **بعد الإصلاح:** أزل `قريباً 🚀` badge و `opacity-50 pointer-events-none` من المصمم في `campaign-form.ejs`
- **ملف التوثيق:** `.planning/PENDING_FIXES.md` — BUG-A

#### ج. إصلاح الجدولة + تفعيلها (BUG-C)
**لماذا:** ميزة مهمة — العملاء يريدون جدولة حملاتهم
- **الملف:** `src/core/ScheduleManager.js`
- **المشكلة:** (1) مشكلة timezone — السيرفر UTC والحملات تتوقع Asia/Riyadh (UTC+3)، (2) Off-by-one تم إصلاحه، لكن التحقق الشامل مطلوب
- **خطوات الإصلاح:**
  1. في `_poll()`: حوّل `scheduled_at` مقارنة بـ timezone المستخدم
  2. أضف retry logic عند الفشل العابر
  3. اختبر: أنشئ حملة مجدولة بعد 2 دقيقة — تأكد أنها تعمل
- **بعد الإصلاح:** 
  - في `sidebar.ejs`: غيّر `href="#"` إلى `href="/campaigns"`، أزل `pointer-events-none opacity-60 cursor-default`، أزل الشارة
  - في `campaign-form.ejs`: أزل `opacity-50 pointer-events-none` و `disabled` من قسم الجدولة
- **ملف التوثيق:** `.planning/PENDING_FIXES.md` — BUG-C

### أولوية متوسطة

#### د. إدارة جهات الاتصال الكاملة
- حالياً: جهات الاتصال تُدخل في DB فقط عند إنشاء حملة (من CSV)
- المطلوب:
  1. صفحة `/contacts` — عرض كل جهات الاتصال مع بحث وفلترة
  2. إضافة يدوية — زر "إضافة جهة اتصال" (اسم + رقم)
  3. حذف — زر حذف بجانب كل جهة
  4. تصدير CSV — زر تحميل
- **API endpoints موجودة مسبقاً:** `POST /api/contacts` و `DELETE /api/contacts/:id` في `server.js`
- **مطلوب:** بناء واجهة CRUD كاملة في `src/views/dashboard/contacts.ejs`

#### ه. تحسين التقارير
- **الملف:** `src/views/dashboard/reports.ejs`
- المطلوب:
  1. فلترة بالتاريخ (من / إلى)
  2. بطاقات ملخص (إجمالي مرسل، نسبة نجاح، فشل، أكثر حملة نشاطاً)
  3. زر تصدير CSV

### أولوية منخفضة (تحسينات)

#### و. تحسين لوحة المشرف
- إنشاء مستخدم جديد من لوحة المشرف
- حذف مستخدم مع تأكيد مزدوج
- فصل اتصال واتساب لمستخدم معين
- حالة النظام (ذاكرة، uptime، اتصالات نشطة)

---

## 5. بيانات الاعتماد والأوامر المهمة

### بيانات الدخول
| الحساب | اسم المستخدم | كلمة المرور |
|--------|-------------|-------------|
| Admin (مشرف) | admin | admin123 |
| مستخدم تجريبي | (أنشئ واحد من /register) | — |

### أوامر التطوير المحلي
```bash
npm install                    # تثبيت المكتبات
cp .env.example .env           # عدّل DATABASE_URL + SESSION_SECRET
npm run db:init                # إنشاء الجداول
npm run db:seed-admin          # إنشاء حساب admin
npm run dev                    # تشغيل مع auto-reload
```

### أوامر النشر على السيرفر
```bash
cd ~/autoinvite
git fetch origin
git reset --hard origin/main
npm install
npm run db:migrate
# لتحديث الحصص:
sudo -u postgres psql -d autoinvite -c "UPDATE tenants SET message_quota = 99;"
pm2 restart autoinvite
pm2 status
```

### أوامر التشخيص
```bash
pm2 logs autoinvite            # متابعة اللوقات
pm2 restart autoinvite         # إعادة التشغيل
sudo -u postgres psql -d autoinvite -c "SELECT username, subscription_status, message_quota, messages_used FROM tenants;"  # حالة المستخدمين
sudo nginx -t && sudo systemctl reload nginx   # إعادة تحميل Nginx
```

---

## 6. ملفات التوثيق المهمة

| الملف | محتواه |
|-------|--------|
| `.planning/STATE_OF_THE_UNION.md` | خريطة كامل المشروع + كل الـ phases + كل bug تم إصلاحه |
| `.planning/PENDING_FIXES.md` | الميزات المعطلة + طريقة إعادة تفعيلها + شرح كل bug |
| `.planning/memory/phase1-progress.md` | تاريخ كل phase + الملفات المعدلة + commits |
| `AGENTS.md` | دليل تقني شامل (بنية المشروع، قاعدة البيانات، الأوامر) |
| `DEPLOYMENT-GUIDE.md` | دليل النشر الكامل |

---

## 7. تحذيرات مهمة

1. **لا تحذف كود** — الميزات المعطلة مُخفاة بـ CSS فقط. الكود البرمجي كامل ومحفوظ.
2. **Stripe Webhook** — يتطلب `STRIPE_WEBHOOK_SECRET` في `.env`. بدونه يرفض أي payload (أمان).
3. **الحصة الافتراضية** — 99 رسالة للمستخدمين الجدد. لاحقاً كل خطة لها حصتها في `src/config/stripe.js`.
4. **`subscriptionGuard`** — مضبوط على كل المسارات المحمية. لو DB يفشل، يمنع الدخول (fail-closed).
5. **لا تعدّل `src/middleware/ejsLayout.js`** بدون حذر — يقرأ بيانات الاشتراك من DB ويضخها في كل صفحة. الكاش 5 دقائق.

---

## 8. سير العمل المقترح للأسبوع القادم

| اليوم | المهمة | الملفات الأساسية |
|-------|--------|-----------------|
| يوم 1 | إصلاح إرسال الصور (BUG-B) + اختباره | processBatch.js, WhatsAppManager.js |
| يوم 2 | إصلاح المصمم الذكي (BUG-A) + اختباره | generator.js, campaign-editor.js |
| يوم 3 | إصلاح الجدولة (BUG-C) + تفعيلها + إزالة كل شارات "قريباً" | ScheduleManager.js, sidebar.ejs, campaign-form.ejs |
| يوم 4 | إدارة جهات الاتصال الكاملة | contacts.ejs, server.js |
| يوم 5 | تحسين التقارير + اختبار شامل + نشر | reports.ejs, server.js |

---

بالتوفيق! لو واجهتك أي مشكلة، راجع `.planning/STATE_OF_THE_UNION.md` و `.planning/PENDING_FIXES.md` — كل شيء موثق هناك.
