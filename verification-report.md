# AutoInvite SaaS — تقرير المراجعة المحدث
**المراجع:** Principal QA Engineer / System Architect  
**التاريخ:** 2026-03-30  
**الفرع:** `001-saas-transformation`  
**المقارنة:** مراجعة كاملة بالنسبة للتقرير الأول (النسخة القديمة)

---

## ملخص تنفيذي

التحول نحو SaaS حقيقي وملموس. **6 من أصل 6 مشاكل حرجة** من التقرير الأول تم معالجتها معمارياً. البنية الجديدة صحيحة في مجملها. ما تبقى هو **6 أخطاء حرجة جديدة** معظمها في الأسلاك الداخلية (Wiring) وليس في التصميم — أي أن الهيكل صح لكن بعض الاتصالات مقطوعة بعد.

---

## القسم الأول: ما تم إصلاحه ✅ (مقارنة بالتقرير الأول)

| ID القديم | المشكلة | الحالة |
|-----------|---------|--------|
| **C-01** | لا يوجد tenant_id في أي جدول | ✅ مُصلح — جميع الجداول (tenants, campaigns, contacts, sent_logs) بها UUID tenant_id مع FK |
| **C-02** | WhatsApp Client واحد مشترك بين الجميع | ✅ مُصلح — WhatsAppManager يدير Map كاملة (tenantId → client) مع عزل تام |
| **C-03** | مسار ملف الاتصالات مُضمَّن في الكود | ✅ مُصلح — loadContacts() تقبل customFilePath وتقرأ مسار الحملة |
| **C-04** | قالب الصورة مُضمَّن ويتجاهل إعدادات الحملة | ✅ مُصلح — generateImage() تقبل templatePath و canvasConfig لكل حملة |
| **C-05** | لا يوجد Background Job Queue، السيرفر يتجمد | ✅ مُصلح — BackgroundQueue يشغّل processBatch بدون await |
| **C-06** | لا يوجد Tenant Registration | ✅ مُصلح — POST /auth/register موجود وكامل |
| **H-01** | PUT/DELETE بدون فحص الملكية | ✅ مُصلح — كل query تحتوي `AND tenant_id = $X` |
| **M-01** | تكرار دالتي normalizePhone بمنطق مختلف | ✅ مُصلح — dataProcessor.js أصبح المصدر الرئيسي |
| **M-02** | state.js يُصدَّر لكن لا يُستخدم | ✅ تم استبداله بنظام أفضل (BackgroundQueue + WhatsAppManager states) |

---

## القسم الثاني: جدول الأخطاء والفجوات الحالية

### 🔴 حرجة (CRITICAL) — تمنع التشغيل

| # | ID | الملف | الوصف | التأثير |
|---|---|-------|------|---------|
| 1 | **C-01** | `src/core.js` سطر 161 | **tenant_id مفقود في INSERT إلى sent_logs.** الكود: `INSERT INTO sent_logs (campaign_id, phone, name)` — لا يتضمن tenant_id رغم وجوده في الـ Schema. كل استعلامات `SELECT COUNT(*) FROM sent_logs WHERE tenant_id = ?` ستُرجع صفراً دائماً. | إحصائيات لوحة التحكم (الرسائل المُرسلة) ستظهر 0 دائماً لكل المستأجرين. |
| 2 | **C-02** | `package.json` سطر 7 | **سكريبت start خاطئ.** القيمة الحالية: `"node src/database/init.js && node src/server.js"` — يشغّل `init.js` القديم (SQLite) وليس `init_saas.js` (PostgreSQL). السيرفر سيُعطي خطأ على الفور. | السيرفر لا يعمل على أي بيئة نظيفة. |
| 3 | **C-03** | `src/core/WhatsAppManager.js` سطر 57 | **لا يوجد executablePath للـ Chromium.** `puppeteer: { headless: true, args: [...] }` — بدون `executablePath`، سيحاول استخدام Chromium المُدمج في puppeteer الذي لا يوجد على NixOS/Replit/VPS بدون تثبيت مسبق. | WhatsApp Client لن يُهيَّأ لأي مستأجر على بيئة الاستضافة. |
| 4 | **C-04** | `src/routes/whatsapp.api.js` سطر 72 | **Null Reference على tenantId جديد.** `WhatsAppManager.states.get(tenantId).status = 'WORKING'` — إذا لم يُضف المستأجر client بعد، `states.get()` تُرجع undefined، والإسناد يُحدث `TypeError: Cannot set properties of undefined`. | خطأ مفاجئ عند بدء أي حملة لمستأجر لم يُهيئ WhatsApp بعد. |
| 5 | **C-05** | `src/database/pg-client.js` سطر 13 | **`process.exit(-1)` عند أي خطأ بـ PostgreSQL.** `pool.on('error', (err) => { process.exit(-1) })` — أي مشكلة في الاتصال بالـ Pool (timeout، إعادة اتصال، إلخ) ستُنهي السيرفر فوراً بدون إشعار. | السيرفر يسقط في الإنتاج بسبب انقطاع مؤقت في قاعدة البيانات. |
| 6 | **C-06** | `src/server.js` سطر 26 | **PORT الافتراضي 3000 بدلاً من 5000.** `const PORT = process.env.PORT \|\| 3000` — على Replit، يجب أن يكون الافتراضي 5000 أو يُضبط عبر متغير بيئي واضح. | الواجهة لا تظهر في Preview على Replit. |

---

### 🟠 عالية (HIGH)

| # | ID | الملف | الوصف | التأثير |
|---|---|-------|------|---------|
| 7 | **H-01** | `src/server.js` سطر 37 | **Session Secret مُضمَّن في الكود.** `secret: 'autoinvite-v3-saas-secret'` — يجب أن يكون `process.env.SESSION_SECRET`. | ثغرة أمنية — من يقرأ الكود يستطيع تزوير الجلسات. |
| 8 | **H-02** | `src/utils/dataProcessor.js` | **normalizePhone لا تدعم الأرقام المصرية في المعالجة الدفعية.** الدالة تعالج سعودي (05x, 5x, 966x) لكن لا تعالج مصري (01x, 20x). normalizer.js يدعمها لكن core.js يستورد من dataProcessor.js فقط. | الأرقام المصرية ستُحذف كـ "Invalid" خلال batch processing بصمت. |
| 9 | **H-03** | `src/utils/dataProcessor.js` `processName()` | **Google Translate API تُستدعى لكل اسم في الـ Batch.** طلب HTTP خارجي لكل جهة اتصال غير معروفة. 500 جهة اتصال = 500 طلب HTTP متتالي. Rate limiting أو failure يُوقف كل البيانات. | تباطؤ شديد في الإرسال + خطر توقف الـ Batch كامل عند انقطاع الـ API. |
| 10 | **H-04** | `src/middleware/ejsLayout.js` سطر 23 | **كشف Stack Trace للمستخدم.** `res.status(500).send('<pre>' + err.message + '</pre>')` — يُظهر تفاصيل داخلية في حالة خطأ EJS. | كشف معلومات النظام في الإنتاج. |
| 11 | **H-05** | `src/routes/campaigns.js` | **PATCH /:id/progress مفقود.** كان موجوداً في النسخة القديمة لكنه لم يُنقل للنسخة الجديدة. التحديث يتم الآن فقط في processBatch مباشرة (عبر core.js)، لكن ليس من واجهة API مستقلة. | Frontend لا يمكنه تحديث تقدم الحملة من الخارج. |

---

### 🟡 متوسطة (MEDIUM)

| # | ID | الملف | الوصف | التأثير |
|---|---|-------|------|---------|
| 12 | **M-01** | البروجكت كله | **لا يوجد `.env.example`.** `pg-client.js` يستخدم `dotenv` لكن لا يوجد ملف مثال يوضح المتغيرات المطلوبة. | مطورون جدد لا يعرفون ما يجب إعداده (DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, SESSION_SECRET). |
| 13 | **M-02** | `src/server.js` | **MemoryStore للجلسات.** express-session يستخدم MemoryStore الافتراضي الذي يسرب الذاكرة عند وجود مستأجرين كُثر. | تدهور أداء السيرفر على المدى الطويل. |
| 14 | **M-03** | `src/core/BackgroundQueue.js` سطر 67-73 | **stopJob يحذف المهمة قبل توقفها.** `this.jobs.delete(tenantId)` يحدث فوراً، لكن `processBatch` لا تزال تعمل. مستأجر يضغط Stop ثم Start فوراً سيبدأ مهمتين متوازيتين. | تشغيل حملتين في نفس الوقت لنفس المستأجر — خطر إرسال مضاعف. |
| 15 | **M-04** | `src/core/BackgroundQueue.js` سطر 31 | **BackgroundQueue لا يُوقف Chromium من النوم.** `processBatch` لا تستدعي `WhatsAppManager.updateActivity(tenantId)` بانتظام خلال التأخيرات الطويلة (20-45 ثانية). إذا كان idleMs = 15 دقيقة وكانت الحملة تعمل، قد يُوقف SleepMonitor الـ Client. | قطع مفاجئ لجلسة WhatsApp أثناء الإرسال — فقدان تقدم الحملة. |
| 16 | **M-05** | `src/utils/dataProcessor.js` | **processContacts() لا تزال غير مُدمجة.** الدالة مُصدَّرة لكن لا تُستدعى أثناء رفع CSV، مما يعني عدم وجود validation للبيانات المرفوعة. | ملفات CSV بأرقام خاطئة تدخل النظام بدون فحص. |

---

### 🔵 منخفضة (LOW)

| # | ID | الملف | الوصف |
|---|---|-------|------|
| 17 | **L-01** | `src/index.js` | ملف CLI قديم لا يزال موجوداً، يُنشئ WhatsApp Client مستقلاً. خطر تعارض مع النظام الجديد إذا شُغّل بالخطأ. |
| 18 | **L-02** | `src/core.js` | `qrcode-terminal` مُستورَد في core.js القديم لكن لم يُستخدم. |
| 19 | **L-03** | `src/server.js` | `tenantScope` middleware غير مُستخدم في route `/api/tenant/settings` و `/api/tenant/stats` — يستخدم `req.session.tenantId` مباشرة بدلاً من `req.tenantId`. يعمل لكنه غير متناسق. |
| 20 | **L-04** | `src/database/init_saas.js` | `process.exit(0)` في نهاية الدالة — إذا استُدعيت كـ module وليس كـ script مستقل، ستُنهي السيرفر. يجب أن تُرجع Promise بدلاً. |

---

## القسم الثالث: User Journey Trace — التحقق من المسار الكامل

### 1. التسجيل والدخول ✅ مع ملاحظة

| الخطوة | الملف | الحالة | الملاحظة |
|--------|-------|--------|---------|
| POST /auth/register | `routes/auth.js` | ✅ | يحفظ tenant في PostgreSQL مع إعدادات افتراضية |
| POST /auth/login | `routes/auth.js` | ✅ | يستعلم tenants ويضع tenantId في session |
| Session Setup | `server.js` | ✅ | tenantId, tenantName في الجلسة |
| isAuthenticated | `middleware/auth.js` | ✅ | يفحص session.tenantId بدلاً من userId |
| tenantScope | `middleware/tenantScope.js` | ✅ | يُعيّن req.tenantId من الجلسة |

### 2. إنشاء الحملة وعزل التخزين ✅ مع خلل

| الخطوة | الملف | الحالة | الملاحظة |
|--------|-------|--------|---------|
| رفع الملفات | `middleware/uploadStorage.js` | ✅ | `storage/tenant_{id}/uploads/` — عزل تام |
| حفظ الحملة في DB | `routes/campaigns.js` | ✅ | tenant_id مُدرج في INSERT |
| فحص الملكية عند Edit/Delete | `routes/campaigns.js` | ✅ | WHERE id = ? AND tenant_id = ? |
| contactsPath في Campaign | `routes/campaigns.js` | ✅ | يُحفظ المسار الصحيح |
| قراءة CSV من مسار الحملة | `routes/whatsapp.api.js` | ✅ | يمرر contactsPath لـ loadContacts() |

### 3. محرك WhatsApp وإدارة الجلسات ✅ مع خلل

| الخطوة | الملف | الحالة | الملاحظة |
|--------|-------|--------|---------|
| إنشاء Client مستقل لكل مستأجر | `WhatsAppManager.js` | ✅ | Map(tenantId → client) |
| عزل جلسات Auth | `WhatsAppManager.js` | ✅ | `storage/tenant_{id}/auth_session/` |
| توليد QR وبثه | `WhatsAppManager.js` + `server.js` | ✅ | io.to(`tenant_{id}`) — عزل بالـ Room |
| Sleep Monitor | `WhatsAppManager.js` | ✅ | setInterval كل دقيقة |
| Chromium Path | `WhatsAppManager.js` | 🔴 **مفقود** | executablePath غير محدد — سيفشل على NixOS |

### 4. تنفيذ الحملة — الإرسال الفعلي

| الخطوة | الملف | الحالة | الملاحظة |
|--------|-------|--------|---------|
| BackgroundQueue — عدم تجميد السيرفر | `BackgroundQueue.js` | ✅ | .then().catch() بدون await |
| Stop flag per-tenant | `core.js` | ✅ | global.stopBatchRequested[tenantId] |
| Anti-ban delays | `AntiBanEngine.js` + `core.js` | ✅ | تأخير عشوائي بين كل رسالة |
| فحص رقم الواتساب | `core.js` | ✅ | isRegisteredUser() مع timeout 10 ثانية |
| توليد الصورة بقالب الحملة | `core.js` + `generator.js` | ✅ | templatePath + canvasConfig مُمرَّران |
| INSERT في sent_logs | `core.js` سطر 161 | 🔴 **خلل** | tenant_id مفقود في INSERT |
| تحديث last_sent_row | `core.js` | ✅ | يُحدَّث بعد كل رسالة |
| Timeout على sendMessage | `core.js` | ✅ | 30 ثانية للنص، 60 للصور |
| تنظيف الصور المؤقتة | `core.js` | ✅ | fs.remove() بعد الإرسال |

---

## القسم الرابع: جاهزية API للـ Frontend

### APIs متاحة وجاهزة ✅

| Method | Route | الوصف |
|--------|-------|------|
| POST | `/auth/register` | تسجيل مستأجر جديد |
| POST | `/auth/login` | تسجيل الدخول |
| POST | `/auth/logout` | تسجيل الخروج |
| GET | `/auth/me` | حالة الجلسة الحالية |
| GET | `/api/campaigns` | قائمة حملات المستأجر |
| POST | `/api/campaigns` | إنشاء حملة جديدة |
| GET | `/api/campaigns/:id` | تفاصيل حملة |
| PUT | `/api/campaigns/:id` | تعديل حملة |
| DELETE | `/api/campaigns/:id` | حذف حملة |
| GET | `/api/campaigns/:id/stats` | إحصائيات حملة (sent/pending) |
| POST | `/api/whatsapp/init` | بدء تهيئة WhatsApp |
| GET | `/api/whatsapp/status` | حالة الاتصال الحالية |
| POST | `/api/whatsapp/start` | بدء إرسال الحملة |
| POST | `/api/whatsapp/stop` | إيقاف الإرسال |
| POST | `/api/whatsapp/test` | إرسال رسالة تجريبية |
| POST | `/api/whatsapp/disconnect` | قطع جلسة WhatsApp |
| PUT | `/api/tenant/settings` | تحديث إعدادات المستأجر |
| GET | `/api/tenant/stats` | إحصائيات عامة للمستأجر |

### APIs مفقودة يحتاجها Frontend

| Method | Route | لماذا مطلوبة؟ |
|--------|-------|--------------|
| GET | `/api/campaigns/:id/logs` | عرض سجل الإرسال التفصيلي لكل حملة |
| GET | `/api/reports` | تقرير الإرسال الكامل (صفحة التقارير) |
| PATCH | `/api/campaigns/:id/progress` | تحديث last_sent_row مستقل |
| GET | `/api/contacts` | قائمة جهات الاتصال المرفوعة |
| POST | `/api/contacts/preview` | معاينة CSV قبل بدء الحملة |

---

## ترتيب الإصلاحات الموصى به (قبل بناء الـ Frontend)

1. **[C-01]** أضف `tenant_id` في INSERT الخاص بـ sent_logs في `core.js`
2. **[C-02]** صحّح `start` script في `package.json` ليُشغّل `init_saas.js`
3. **[C-03]** أضف `executablePath` في `WhatsAppManager.js` (مثل: `process.env.CHROMIUM_PATH || require('child_process').execSync('which chromium').toString().trim()`)
4. **[C-04]** أضف null check قبل `.status = 'WORKING'` في `whatsapp.api.js`
5. **[C-05]** غيّر `process.exit(-1)` في `pg-client.js` إلى `console.error()` فقط
6. **[C-06]** ضبط PORT الافتراضي إلى 5000 في `server.js`
7. **[H-01]** حرّك SESSION_SECRET إلى متغير بيئي
8. **[H-02]** دمج منطق normalizePhone من `normalizer.js` (مع دعم المصري) في `dataProcessor.js`
9. **[M-04]** أضف `WhatsAppManager.updateActivity(tenantId)` في حلقة processBatch كل تكرار
10. أنشئ `.env.example` يشرح جميع المتغيرات المطلوبة

---

## الخلاصة

| المعيار | التقرير الأول | التقرير الحالي |
|---------|--------------|---------------|
| مشاكل حرجة | 6 | 6 (جديدة، أبسط) |
| مشاكل عالية | 6 | 5 |
| مشاكل متوسطة | 7 | 5 |
| مشاكل منخفضة | 4 | 4 |
| Multi-Tenancy | ❌ غائب | ✅ موجود |
| Background Queue | ❌ غائب | ✅ موجود |
| WhatsApp Pool | ❌ غائب | ✅ موجود |
| Storage Isolation | ❌ غائب | ✅ موجود |
| EJS Views | ❌ غائب | ✅ 12 ملف |
| i18n (Arabic) | ❌ غائب | ✅ موجود |
| PostgreSQL | ❌ SQLite | ✅ PostgreSQL |
| **الجاهزية للـ Frontend** | **0%** | **~75%** |
