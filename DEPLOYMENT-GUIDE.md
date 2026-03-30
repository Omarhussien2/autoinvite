# AutoInvite SaaS — دليل النشر على Hostinger VPS

> **البيئة المستهدفة:** Ubuntu 22.04 LTS | Node.js 20 | PostgreSQL 15 | PM2 | Nginx | Let's Encrypt SSL
>
> **المتطلبات الدنيا:** VPS بـ 2GB RAM، 20GB SSD، دومين مُوجّه للـ VPS

---

## 📋 الفهرس

1. [الخطوة 0 — تجهيز الـ VPS](#0-vps)
2. [الخطوة 1 — تثبيت الـ Node.js وأدواته](#1-nodejs)
3. [الخطوة 2 — تثبيت PostgreSQL وإنشاء قاعدة البيانات](#2-postgresql)
4. [الخطوة 3 — تثبيت Chromium ومتطلبات Puppeteer](#3-chromium)
5. [الخطوة 4 — تثبيت node-canvas system libraries](#4-canvas)
6. [الخطوة 5 — نقل وإعداد الكود](#5-code)
7. [الخطوة 6 — الإعدادات والـ Environment Variables](#6-env)
8. [الخطوة 7 — تثبيت الحزم وتهيئة قاعدة البيانات](#7-install)
9. [الخطوة 8 — إعداد PM2 لإدارة العملية](#8-pm2)
10. [الخطوة 9 — إعداد Nginx كـ Reverse Proxy](#9-nginx)
11. [الخطوة 10 — شهادة SSL مجانية مع Let's Encrypt](#10-ssl)
12. [الخطوة 11 — اختبار كامل وتشخيص المشاكل](#11-verify)
13. [الصيانة الدورية](#maintenance)
14. [RAM Budget & Scaling](#scaling)

---

## 0. تجهيز الـ VPS (Hostinger → SSH)

```bash
# اتصل بالـ VPS عبر SSH من جهازك المحلي
ssh root@YOUR_VPS_IP

# حدّث النظام أولاً
apt update && apt upgrade -y

# أنشئ مستخدماً غير root (أفضل ممارسة أمنية)
adduser ubuntu
usermod -aG sudo ubuntu

# أضف صلاحية SSH للمستخدم الجديد
rsync --archive --chown=ubuntu:ubuntu ~/.ssh /home/ubuntu

# من الآن فصاعداً، استخدم هذا المستخدم
# اخرج من الـ root وادخل بـ ubuntu:
exit
ssh ubuntu@YOUR_VPS_IP
```

---

## 1. تثبيت Node.js 20 (عبر NVM) {#1-nodejs}

```bash
# تثبيت NVM (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# تفعيل NVM في الجلسة الحالية
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

# تثبيت Node.js 20 LTS
nvm install 20
nvm use 20
nvm alias default 20

# تحقق من الإصدار
node --version    # يجب أن يظهر: v20.x.x
npm --version     # يجب أن يظهر: 10.x.x

# تثبيت PM2 عالمياً
npm install -g pm2
```

---

## 2. تثبيت PostgreSQL 15 وإنشاء قاعدة البيانات {#2-postgresql}

```bash
# تثبيت PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# تشغيل وتفعيل الخدمة
sudo systemctl start postgresql
sudo systemctl enable postgresql

# الدخول إلى psql كمستخدم postgres
sudo -u postgres psql

# ── داخل psql ──────────────────────────────────────────────────
-- أنشئ مستخدماً مخصصاً (استبدل STRONG_PASSWORD بكلمة مرور قوية)
CREATE USER autoinvite WITH PASSWORD 'STRONG_PASSWORD';

-- أنشئ قاعدة البيانات
CREATE DATABASE autoinvite_saas OWNER autoinvite;

-- أعطِ الصلاحيات الكاملة
GRANT ALL PRIVILEGES ON DATABASE autoinvite_saas TO autoinvite;

-- اخرج من psql
\q
# ───────────────────────────────────────────────────────────────

# اختبر الاتصال
psql postgresql://autoinvite:STRONG_PASSWORD@localhost:5432/autoinvite_saas -c "SELECT 1;"
# يجب أن يظهر: (1 row)
```

---

## 3. تثبيت Chromium ومتطلبات Puppeteer على Ubuntu {#3-chromium}

> ⚠️ هذه الخطوة حرجة. Puppeteer يحتاج Google Chrome أو Chromium مع مكتبات النظام كاملة.

```bash
# الطريقة الموصى بها: Google Chrome Stable
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/google.gpg
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'
sudo apt update
sudo apt install -y google-chrome-stable

# تحقق من المسار
which google-chrome-stable || which google-chrome
# الناتج المتوقع: /usr/bin/google-chrome-stable أو /usr/bin/google-chrome

# تحقق من التشغيل
google-chrome --version
# الناتج المتوقع: Google Chrome 12x.x.x

# تثبيت المكتبات المساعدة لـ Puppeteer على Ubuntu
sudo apt install -y \
    libnspr4 libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    fonts-liberation fonts-noto-color-emoji fonts-ipafont-gothic \
    --no-install-recommends
```

---

## 4. تثبيت مكتبات node-canvas (لتوليد صور الدعوات) {#4-canvas}

```bash
sudo apt install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3-dev
```

---

## 5. نقل الكود إلى الـ VPS {#5-code}

### الطريقة A: عبر Git (موصى بها)

```bash
# على الـ VPS — إنشاء مجلد التطبيق
sudo mkdir -p /var/www/autoinvite
sudo chown ubuntu:ubuntu /var/www/autoinvite

# استنساخ المشروع
cd /var/www/autoinvite
git clone https://github.com/YOUR_GITHUB/autoinvite.git .

# أو إن كان repo خاصاً، أضف SSH deploy key أولاً
```

### الطريقة B: عبر SCP (من جهازك المحلي)

```bash
# من جهازك المحلي — ضغط وإرسال المشروع
cd /path/to/your/local/autoinvite

# ضغط بدون node_modules وبدون ملفات حساسة
tar --exclude='./node_modules' \
    --exclude='./.git' \
    --exclude='./storage' \
    --exclude='./.env' \
    -czf autoinvite.tar.gz .

# إرسال للـ VPS
scp autoinvite.tar.gz ubuntu@YOUR_VPS_IP:/var/www/autoinvite/

# على الـ VPS — فك الضغط
cd /var/www/autoinvite
tar -xzf autoinvite.tar.gz
rm autoinvite.tar.gz
```

---

## 6. إنشاء ملف .env في الـ VPS {#6-env}

```bash
cd /var/www/autoinvite

# أنشئ ملف .env من القالب
cp .env.example .env

# عدّل الملف
nano .env
```

**محتوى ملف `.env` على الـ VPS (استبدل القيم):**

```env
NODE_ENV=production
PORT=5000

# أنشئه بـ: openssl rand -hex 32
SESSION_SECRET=PUT_YOUR_64_CHAR_HEX_SECRET_HERE

# استبدل STRONG_PASSWORD بكلمة المرور التي وضعتها في الخطوة 2
DATABASE_URL=postgresql://autoinvite:STRONG_PASSWORD@localhost:5432/autoinvite_saas

# مسار Chrome (من الخطوة 3)
CHROMIUM_PATH=/usr/bin/google-chrome

# مسار البيانات
DATA_DIR=/var/www/autoinvite

# حد الجلسات المتزامنة (حسب الـ RAM)
MAX_TOTAL_CLIENTS=3
```

```bash
# قيّد صلاحيات الملف (يقرأه المالك فقط)
chmod 600 .env

# تحقق من القيم
cat .env | grep -v SECRET | grep -v PASSWORD  # اعرض بدون القيم الحساسة
```

---

## 7. تثبيت الحزم وتهيئة قاعدة البيانات {#7-install}

```bash
cd /var/www/autoinvite

# تثبيت الحزم (production فقط — بدون devDependencies)
npm install --omit=dev

# ملاحظة: node-canvas ستُترجم هنا (تأخذ 2-3 دقائق)
# إن ظهر خطأ للـ canvas، تأكد من اكتمال خطوة 4

# تهيئة جداول PostgreSQL
npm run db:init
# الناتج المتوقع: ✅ SaaS PostgreSQL Schema is ready.

# أنشئ مجلدات التخزين
mkdir -p logs storage
```

---

## 8. إعداد PM2 لإدارة العملية {#8-pm2}

```bash
cd /var/www/autoinvite

# شغّل التطبيق عبر PM2
pm2 start ecosystem.config.js --env production

# تحقق من الحالة
pm2 status
# يجب أن يظهر: autoinvite | online | ...

# شاهد الـ logs مباشرة
pm2 logs autoinvite --lines 50

# احفظ قائمة العمليات (للإقلاع التلقائي عند restart الـ VPS)
pm2 save

# أضف PM2 لـ systemd (يبدأ تلقائياً بعد إعادة تشغيل الـ VPS)
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# سيعطيك أمراً — نفّذه كـ sudo:
sudo env PATH=$PATH:/home/ubuntu/.nvm/versions/node/v20.x.x/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

**أوامر PM2 المهمة:**

```bash
pm2 status                      # حالة جميع العمليات
pm2 logs autoinvite             # الـ logs المباشرة
pm2 logs autoinvite --err       # أخطاء فقط
pm2 restart autoinvite          # إعادة التشغيل
pm2 reload autoinvite           # إعادة تشغيل بدون downtime (zero-downtime)
pm2 stop autoinvite             # إيقاف مؤقت
pm2 monit                       # مراقبة RAM/CPU مباشرة
pm2 flush                       # حذف الـ logs القديمة
```

---

## 9. إعداد Nginx كـ Reverse Proxy {#9-nginx}

```bash
# تثبيت Nginx
sudo apt install -y nginx

# انسخ ملف الـ config
sudo cp /var/www/autoinvite/nginx.conf /etc/nginx/sites-available/autoinvite

# عدّل الدومين (استبدل yourdomain.com بدومينك الفعلي)
sudo nano /etc/nginx/sites-available/autoinvite
# ابحث عن: yourdomain.com واستبدله بدومينك في كل مكان

# فعّل الـ site
sudo ln -s /etc/nginx/sites-available/autoinvite /etc/nginx/sites-enabled/

# احذف الـ default config
sudo rm -f /etc/nginx/sites-enabled/default

# اختبر صحة الـ config
sudo nginx -t
# يجب أن يظهر: syntax is ok / test is successful

# أعد تشغيل Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 10. شهادة SSL مع Let's Encrypt (Certbot) {#10-ssl}

> ⚠️ قبل هذه الخطوة، تأكد أن دومينك يشير لـ IP الـ VPS في إعدادات الـ DNS

```bash
# تثبيت Certbot
sudo apt install -y certbot python3-certbot-nginx

# احصل على شهادة SSL مجانية
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# اتبع التعليمات:
#   - أدخل بريدك الإلكتروني
#   - وافق على الشروط (A)
#   - اختر التحويل التلقائي لـ HTTPS (2)

# تحقق من التجديد التلقائي
sudo certbot renew --dry-run
# يجب أن يظهر: Congratulations, all simulated renewals succeeded!

# Certbot يُضيف cron job تلقائياً للتجديد كل 90 يوم
```

---

## 11. اختبار كامل وتشخيص المشاكل {#11-verify}

### قائمة التحقق الكاملة

```bash
# ✅ 1. هل الـ Node.js يعمل؟
pm2 status
# يجب: autoinvite | online

# ✅ 2. هل الـ API يستجيب؟
curl http://localhost:5000/login
# يجب: HTML صفحة تسجيل الدخول

# ✅ 3. هل Nginx يعمل؟
sudo systemctl status nginx
curl -I https://yourdomain.com
# يجب: HTTP/2 200

# ✅ 4. هل Socket.IO يعمل عبر Nginx؟
curl -I https://yourdomain.com/socket.io/
# يجب: HTTP/1.1 400 (هذا طبيعي — WebSocket يرفض HTTP العادي)
# لا يجب: 502 Bad Gateway

# ✅ 5. هل قاعدة البيانات جاهزة؟
psql $DATABASE_URL -c "SELECT COUNT(*) FROM tenants;"
# يجب: count = 0 (فارغة جاهزة للاستخدام)

# ✅ 6. هل SSL صحيح؟
curl -vI https://yourdomain.com 2>&1 | grep "SSL certificate\|issuer"
# يجب: Let's Encrypt Authority
```

### تشخيص المشاكل الشائعة

| المشكلة | السبب المحتمل | الحل |
|---------|--------------|-------|
| `502 Bad Gateway` | التطبيق لا يعمل | `pm2 status` و `pm2 logs autoinvite` |
| `WebSocket disconnect` | Nginx لا يُمرر الـ WebSocket | تحقق من `/socket.io/` في nginx.conf |
| Puppeteer يفشل | Chromium غير مثبت أو مسار خاطئ | `which google-chrome` وتأكد من `CHROMIUM_PATH` في `.env` |
| `canvas` خطأ عند `npm install` | مكتبات النظام ناقصة | أعد تنفيذ خطوة 4 كاملة |
| `sessions lost` after restart | (محلول) PgSession يحفظها في PostgreSQL | — |
| RAM مرتفع جداً | Chromium يستهلك ذاكرة | قلّل `MAX_TOTAL_CLIENTS` أو زد RAM |

---

## 🔧 الصيانة الدورية {#maintenance}

```bash
# تحديث التطبيق (بعد push على GitHub)
cd /var/www/autoinvite
git pull origin main
npm install --omit=dev
pm2 reload autoinvite          # zero-downtime reload

# مراقبة الـ RAM والـ CPU
pm2 monit

# مراقبة logs الـ Nginx
sudo tail -f /var/log/nginx/autoinvite.error.log

# تنظيف الـ logs الكبيرة
pm2 flush                      # يحذف جميع الـ logs المحفوظة

# نسخ احتياطي لقاعدة البيانات (جدوله في cron يومياً)
pg_dump $DATABASE_URL > /var/backups/autoinvite_$(date +%Y%m%d).sql

# إضافة هذا الـ cron job:
# 0 3 * * * pg_dump postgresql://autoinvite:PASS@localhost/autoinvite_saas > /var/backups/autoinvite_$(date +%Y%m%d).sql
```

---

## 💰 دليل الـ RAM وعدد العملاء {#scaling}

| VPS | RAM | `MAX_TOTAL_CLIENTS` | العملاء المتزامنين |
|-----|-----|--------------------|--------------------|
| Starter | 2GB | 2 | حتى 2 واتساب |
| Business | 4GB | 4 | حتى 4 واتساب |
| Premium | 8GB | 8 | حتى 8 واتساب |

> **سبب المحدودية:** كل جلسة واتساب = Chromium instance = ~200-400MB RAM  
> **مع أعلام `--single-process --no-zygote`:** ~150-250MB لكل جلسة

---

## 🔐 ملاحظات أمنية مهمة

```bash
# 1. أغلق المنفذ 5000 من الخارج (يُقبل فقط من Nginx المحلي)
sudo ufw allow 22       # SSH
sudo ufw allow 80       # HTTP
sudo ufw allow 443      # HTTPS
sudo ufw deny 5000      # اغلق المنفذ المباشر
sudo ufw enable

# 2. احمِ ملف .env
chmod 600 /var/www/autoinvite/.env

# 3. انتبه: SESSION_SECRET يجب أن يكون مختلفاً في كل deploy
openssl rand -hex 32    # استخدم هذا الأمر لتوليد سر قوي

# 4. احذف .git من الـ production إن أردت (اختياري)
# rm -rf /var/www/autoinvite/.git
```

---

## ✅ قائمة مراجعة نهائية قبل الإطلاق

- [ ] السيرفر يعمل: `pm2 status` يظهر `online`
- [ ] HTTPS يعمل: `https://yourdomain.com` بدون تحذيرات
- [ ] Socket.IO يعمل: الـ logs الفورية تظهر في صفحة تشغيل الحملة
- [ ] Chromium مثبت: يمكن ربط واتساب من لوحة التحكم
- [ ] PostgreSQL يعمل: يمكن التسجيل وتسجيل الدخول
- [ ] Sessions دائمة: تسجيل الدخول يبقى بعد `pm2 reload`
- [ ] `.env` محمي: `chmod 600 .env`
- [ ] UFW مفعّل: `sudo ufw status`
- [ ] Certbot مجدول: `sudo certbot renew --dry-run` ينجح

---

*تاريخ الإنشاء: 2026 | AutoInvite SaaS Edition*
