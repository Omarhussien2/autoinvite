# سجل التحديات والحلول — عزام

<!--
  ╔══════════════════════════════════════════════════════════════╗
  ║  MUST يتم تحديث هذا الملف مع كل تحدٍّ يواجهك أثناء التطوير  ║
  ║  آخر مهمة دائمة في أي task: تحديث CHANGELOG.md + DEVLOG.md  ║
  ║  لو لقيت الملف قديم أو ناقص → حدّثه فوراً                  ║
  ╚══════════════════════════════════════════════════════════════╝

  هيكل كل تحدّي:
    المشكلة    → ماذا حدث؟
    السبب      → لماذا حدث؟
    المحاولات  → ماذا جرّبنا؟ (كل المحاولات حتى الفاشلة)
    الحل       → ما الذي عمل فعلاً؟
    الدرس      → ماذا تعلّمنا؟
-->

---

## التحدي ١٥ — إزالة خلفية اللوجو البيضاء
**التاريخ:** 2026-04-21 | **Commit:** `d05b0cd`

### المشكلة
اللوجو الجديد (logo-new.png) كان يحتوي على خلفية بيضاء تظهر بوضوح على الـ Navbar الداكن في Landing Page.

### المحاولات
1. **`mix-blend-mode: screen`** — حيلة CSS تُخفي الأبيض على الخلفيات الداكنة. عملت جزئياً لكن:
   - لا تعمل على الخلفيات الفاتحة (صفحة الدخول)
   - تُغيّر ألوان اللوجو نفسه
   - حل جزئي وليس جذري

### الحل
توفير نسخة PNG شفافة (transparent) من اللوجو واستبدال الملف مباشرة. تم إزالة `mix-blend-mode` hack.

### الدرس
> الحلول CSSية (mix-blend-mode, filter, opacity) هي حلول مؤقتة. الصح هو توفير الأصل (transparent PNG) من البداية. يوفر وقت debugging وضمان عرض متسق على كل الخلفيات.

---

## التحدي ١٤ — تغيير مسار المشروع على السيرفر
**التاريخ:** 2026-04-21

### المشكلة
بعد rebrand، كان المشروع على السيرفر في `/var/www/takarer` باسم PM2 `takarer`. الأوامر القديمة `cd ~/autoinvite` لم تعد تعمل.

### المحاولات
1. `pm2 show takarer` → اكتشفنا `PWD: '/var/www/takarer'`
2. `find / -name "ecosystem.config.js"` → أكّد المسار

### الحل
```bash
pm2 delete takarer
mv /var/www/takarer /var/www/azzam
cd /var/www/azzam && pm2 start ecosystem.config.js --env production && pm2 save
```

### الدرس
> بعد أي عملية rename/rebrand، تحديث أمر deployment مطلوب فوراً. وثّق المسارات الصحيحة في AGENTS.md بعد كل تغيير.

---

## التحدي ١٣ — السيرفر ليس فيه `.git`
**التاريخ:** 2026-04-21

### المشكلة
بعد تغيير اسم المجلد، `git pull` فشل بـ `fatal: not a git repository`. المشروع كان منزّل كـ ZIP أو عبر SCP بدون `.git`.

### الحل
```bash
cd /var/www/azzam
cp .env /root/.env-backup          # نسخة احتياطية
git init
git remote add origin https://github.com/Omarhussien2/autoinvite.git
git fetch origin
git reset --hard origin/main
cp /root/.env-backup .env          # استعادة .env
```

### الدرس
> دائماً خذ نسخة احتياطية من `.env` قبل أي عملية git. وحافظ على deployment عبر `git clone` من البداية لتسهيل التحديثات.

---

## التحدي ١٢ — WhatsApp Sleep Timeout قصير جداً
**التاريخ:** 2026-04-12 | **Commit:** `3a0a3f5`

### المشكلة
جلسات الواتساب كانت تنام بعد 15 دقيقة من الخمول، مما يقطع الحملات الطويلة.

### الحل
زيادة timeout من 15 دقيقة إلى 8 ساعات في `WhatsAppManager.js`.

### الدرس
> Session timeout يجب أن يتماشى مع أطول حملة متوقعة. 8 ساعات كافية لمعظم الحالات.

---

## التحدي ١١ — Feature Toggle لـ V1.0
**التاريخ:** 2026-04-07 | **Commit:** `2589a03`

### المشكلة
بعض الميزات (Smart Scheduling, Image Upload, Canvas Designer) كانت buggy وغير جاهزة للإنتاج، لكن كودها موجود ومرتبط بباقي النظام.

### المحاولات
1. حذف الكود → خطر إزالة dependencies مطلوبة لأماكن أخرى
2. التعليق (comment out) → غير عملي ويُربك المطور التالي

### الحل
Feature Toggle: تعطيل الميزات عبر flags في الكود مع إظهار badges "قريباً" في الواجهة + إنشاء debt tracker ل跟踪 الميزات المعلقة.

### الدرس
> Feature Toggle أفضل من الحذف. يسمح بالاسترجاع السريع ويحافظ على الـ codebase نظيف. كل ميزة معطلة يجب أن يكون لها ticket أو debt entry.

---

## التحدي ١٠ — Stripe Webhook Security
**التاريخ:** 2026-04-07 | **Commit:** `9488e60`

### المشكلة
webhooks Stripe كانت تقبل أي request بدون التحقق من signature، مما يسمح بـ spoofing.

### الحل
إضافة `stripe.webhooks.constructEvent()` مع التحقق من `STRIPE_WEBHOOK_SECRET`.

### الدرس
> أي webhook من طرف ثالث يجب أن يتم التحقق من signature دائماً. لا تثق بأي incoming request بدون verification.

---

## التحدي ٩ — Voice Notes لا تُرسل كـ PTT
**التاريخ:** 2026-04-05 | **Commits:** `c4a5c0c` → `6bf17ec` → `93acace`

### المشكلة
Voice notes كانت تُرسل كملفات عادية وليس كـ Push-to-Talk (PTT) في واتساب.

### المحاولات
1. إرسال كـ sendAudio مع flag `sendAudioAsVoice: true` → `InvalidMediaCheckRepairFailedType`
2. تحويل لـ OGG/Opus بـ ffmpeg → عمل جزئياً لكن بعض الملفات تُرسل كـ audio عادي

### الحل
تحويل جميع voice notes إلى OGG/Opus عبر ffmpeg قبل الإرسال، ثم استخدام `sendVoice` (وليس `sendAudio`) مع flag المناسب.

### الدرس
> WhatsApp يقبل PTT فقط بصيغة OGG/Opus. أي صيغة ثانية تُرسل كـ audio عادي. اسم الدالة في SDK يفرق: `sendVoice` ≠ `sendAudio`.

---

## التحدي ٨ — WPPConnect Error Objects تظهر كـ `[object Object]`
**التاريخ:** 2026-04-05 | **Commit:** `a03b10c`

### المشكلة
عند فشل إرسال رسالة، الخطأ كان يظهر كـ `[object Object]` في الـ logs وUI بدون تفاصيل مفيدة.

### السبب
WPPConnect يُرجع Error objects مع خصائص مخصصة (منطقية). عند تحويلها لـ string يتحول لـ `[object Object]`.

### الحل
```javascript
const errorMsg = typeof err === 'object' 
  ? JSON.stringify(err, null, 2) 
  : String(err);
```

### الدرس
> دائماً تحقق من نوع الـ error قبل عرضه. `JSON.stringify` للـ objects، `String()` للـ primitives. أنشئ helper function يُستخدم في كل مكان.

---

## التحدي ٧ — Chrome Singleton Lock Crashes
**التاريخ:** 2026-03-30 | **Commits:** `06ee25b` → `4c0bdcd` → `6d3115f` → `17e89d4` → `9833d91`

### المشكلة
السيرفر ينهار عند إعادة التشغيل بسبب Chrome/Chromium Singleton Lock files المتروكة من جلسة سابقة.

### المحاولات
1. `--ignore-certificate-errors` + تجاهل lock → لم يحل المشكلة
2. حذف `SingletonLock` عند startup → حل جزئي
3. حذف جميع locks بشكل recursive → أفضل لكن لا يزال يفشل أحياناً
4. حذف مجلد auth بالكامل عند الفشل → خطر (يفقد الجلسة)
5. استخدام ephemeral auth + حذف locks recursive → **عمل**

### الحل
```javascript
// عند إنشاء client جديد
const client = await wppconnect.create({
  session: tenantId,
  // ... config
});
// + cleanup function تحذف كل SingletonLock files عند startup
```

### الدرس
> Puppeteer/Chromium في بيئة server لازم يكون فيه cleanup قوي. خمسة commits للوصول للحل يعكس تعقيد المشكلة. الأفضل: ephemeral sessions مع persist فقط للـ tokens المطلوبة.

---

## التحدي ٦ — Landing Page لا تُخدم بشكل صحيح
**التاريخ:** 2026-04-01 + 2026-04-05 | **Commits:** `c0c95be` → `45ef04c` → `45ccc0c`

### المشكلة
Landing Page (React/Vite) كانت تُقدم كـ static files عبر `express.static` لكن المسارات كانت خاطئة بعد rename المجلد.

### المحاولات
1. تصحيح asset paths → لم يكفِ
2. `express.static('landing-autoinvite/dist')` → عمل في development لكن فشل بعد npm install على السيرفر

### الحل
استخدام `res.sendFile()` بشكل explicit بدل `express.static` + إضافة `postinstall` script يبني Landing Page تلقائياً بعد `npm install`.

### الدرس
> `express.static` مناسب للـ public assets لكن ليس لـ SPA كاملة. `sendFile` للـ index.html + `express.static` للـ dist/assets هو النمط الأصح. دائماً ضع build في `postinstall`.

---

## التحدي ٥ — Session Cookie لا يُحفظ
**التاريخ:** 2026-04-01 | **Commit:** `d670f6a`

### المشكلة
بعد تسجيل الدخول، الـ session cookie لم يكن يُحفظ في المتصفح، مما يمنع المستخدم من الوصول للـ dashboard.

### السبب
`res.json()` كان يُرسل الرد قبل أن يكتمل `req.session.save()`. Express يُرسل الرد فوراً ولا ينتظر async operations.

### الحل
```javascript
req.session.save(() => {
  res.json({ success: true, redirect: '/dashboard' });
});
```

### الدرس
> في Express، أي async operation (مثل session.save) لازم تُدار داخل callback أو await قبل `res.send/json/redirect`. ترتيب middleware يفرق.

---

## التحدي ٤ — Refactor خاطئ يُفقد دوال أساسية
**التاريخ:** 2026-04-01 | **Commit:** `a736c5f`

### المشكلة
بعد refactor لـ `src/core/`، الدوال `loadContacts` و `processBatch` اختفت. الحملات توقفت عن العمل.

### السبب
استبدال `src/` بالنسخة النظيفة (clean Downloads version) بدون التحقق من تطابق جميع الـ exports.

### الحل
استعادة الدوال المفقودة + إنشاء `src/core/index.js` كـ barrel file يُصدّر كل modules.

### الدرس
> بعد أي refactor كبير: شغّل grep على كل الدوال المستخدمة (`grep -r "loadContacts" src/`) وتأكد أنها لسه موجودة. Barrel files (index.js) تضمن consistency.

---

## التحدي ٣ — Image Sending يفشل مع WhatsApp Web
**التاريخ:** 2026-04-04 | **Commits:** `4849b02` → `c4a5c0c`

### المشكلة
إرسال الصور (invitation templates) كان يفشل بخطأ `InvalidMediaCheckRepairFailedType`.

### المحاولات
1. تحويل الصورة لـ base64 → نفس الخطأ
2. تحسين MIME type detection → لم يحل
3. إضافة retry logic مع إعادة تحميل الصورة → **عمل**

### الحل
Retry mechanism: عند الفشل، أعد قراءة الملف من disk وأعد الإرسال مرة واحدة. إذا فشل مرة ثانية، سجّل كـ failed واستمر.

### الدرس
> WhatsApp Web API غير مستقر ١٠٠٪ في إرسال الملفات. دائماً أضف retry logic (max 1-2 retries) مع timeout. لا تدع رسالة واحدة توقف الحملة بالكامل.

---

## التحدي ٢ — BackgroundQueue 'msg' Typo
**التاريخ:** 2026-04-04 | **Commit:** `fda8afb`

### المشكلة
في error logs، كانت تظهر كلمة `undefined` بدل رسالة الخطأ الحقيقية، مما يصعّب debugging.

### السبب
Typo بسيط: `msg` بدل `err.message` في catch block.

### الحل
```javascript
// قبل
console.error('Send failed:', msg);
// بعد
console.error('Send failed:', err.message || err);
```

### الدرس
> الـ typos الصغيرة تُسبب أسوأ bugs لأنها تُخفي المشكلة الحقيقية. راجع كل catch block وتأكد إن المتغير الصحيح مُستخدم. ESLint rule `no-undef` يكشف بعض هذه الحالات.

---

## التحدي ١ — Quota System vs Active Campaigns
**التاريخ:** 2026-03-30 | **Ref:** `ca61806` + تصميم middleware

### المشكلة
عند نفاد quota الرسائل، النظام كان يُوقف الحملة في منتصف الإرسال، مما يُرسل نصف الرسائل ويُفقد state.

### الحل
`quotaGuard.js` middleware يفحص quota فقط عند **HTTP request level** (إنشاء/تشغيل حملة جديدة). الحملات النشطة (running) تكتمل حتى لو تجاوز quota.

### الدرس
> Business rules (quota, limits) تُفحص عند نقطة الدخول (HTTP)، ليس عند كل عملية فردية. قطع حملة في منتصفها أسوأ من السماح بتجاوز مؤقت.

---

## ملخص الدروس المستفادة

| # | التحدي | الدرس الرئيسي |
|---|--------|---------------|
| ١ | Quota vs Campaigns | Business rules تُفحص عند HTTP level، ليس داخل batch |
| ٢ | Typo in catch | المتغيرات في catch blocks لازم تتدقق. ESLint يساعد |
| ٣ | Image Send Failure | دائماً retry logic (1-2x) مع ملفات WhatsApp |
| ٤ | Missing Functions بعد Refactor | grep كل الدوال بعد refactor كبير. Barrel files تضمن consistency |
| ٥ | Session Cookie | session.save() قبل res.json(). ترتيب async يفرق |
| ٦ | Landing Page Serving | sendFile للـ index.html + static للـ assets. Build في postinstall |
| ٧ | Chrome Locks | Puppeteer لازم cleanup قوي. 5 commits = تعقيد. Ephemeral sessions أفضل |
| ٨ | Error Objects | JSON.stringify للـ error objects دائماً |
| ٩ | Voice Notes PTT | WhatsApp يقبل PTT فقط كـ OGG/Opus. sendVoice ≠ sendAudio |
| ١٠ | Webhook Security | كل webhook لازم signature verification |
| ١١ | Feature Toggle | Toggle أفضل من الحذف. كل ميزة معطلة = debt entry |
| ١٢ | Session Timeout | Timeout > أطول حملة متوقعة |
| ١٣ | No .git on Server | احفظ .env دائماً. استخدم git clone من البداية |
| ١٤ | Path Changes | وثّق مسارات deployment في AGENTS.md بعد كل تغيير |
| ١٥ | Logo Background | استخدم transparent PNG من البداية. CSS hacks = حلول مؤقتة |
