#!/bin/bash

# 1. فحص الأخطاء البرمجية الأساسية
echo "🔍 فحص جودة الكود (Linting)..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ فشل الفحص! يرجى إصلاح أخطاء Lint قبل الرفع."
    exit 1
fi

# 2. بناء المشروع (إذا كان هناك خطوة بناء لـ Tailwind أو Frontend)
echo "📦 جاري بناء النسخة (Building)..."
npm run build
if [ $? -ne 0 ]; then
    echo "⚠️ لا توجد خطوة بناء أو فشلت، سنستمر إذا كان المشروع يعمل مباشرة بـ Node."
fi

# 3. الرفع إلى GitHub
echo "🐙 جاري الرفع إلى GitHub (فرع main)..."
git push origin main

# 4. الرفع إلى Hostinger VPS
echo "🚀 جاري الرفع إلى Hostinger..."
git push production main

echo "✅ تم التحديث بنجاح!"