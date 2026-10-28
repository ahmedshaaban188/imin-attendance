#!/bin/bash
# ImIn System Backup Packager
set -e

BASE=/home/z/my-project
STAGE=$BASE/scripts/staging/imin-system
ZIP_OUT=$BASE/download/imin-system-backup-2026-10-08.zip

# تنظيف أي staging سابق
rm -rf "$BASE/scripts/staging"
mkdir -p "$STAGE"

# نسخ ملفات النظام الأساسية
cp -r "$BASE/src"        "$STAGE/src"
cp -r "$BASE/data"       "$STAGE/data"
cp -r "$BASE/db"         "$STAGE/db"
cp -r "$BASE/prisma"     "$STAGE/prisma"
cp -r "$BASE/public"     "$STAGE/public"
cp -r "$BASE/supabase"   "$STAGE/supabase"

# ملفات الإعداد
cp "$BASE/package.json"       "$STAGE/"
cp "$BASE/bun.lock"           "$STAGE/"
cp "$BASE/next.config.ts"     "$STAGE/"
cp "$BASE/tsconfig.json"      "$STAGE/"
cp "$BASE/tailwind.config.ts" "$STAGE/"
cp "$BASE/postcss.config.mjs" "$STAGE/"
cp "$BASE/components.json"    "$STAGE/"
cp "$BASE/eslint.config.mjs"  "$STAGE/"

# .env بمسار نسبي قابل للنقل
printf 'DATABASE_URL="file:../db/custom.db"\n' > "$STAGE/.env"

# دليل الاسترجاع بالعربي
cp "$BASE/scripts/README-IMIN-BACKUP.md" "$STAGE/README.md"

# إزالة أي مخلفات بناء داخل النسخة
find "$STAGE" -name "*.tsbuildinfo" -delete 2>/dev/null || true

# التغليف
rm -f "$ZIP_OUT"
cd "$BASE/scripts/staging"
zip -r -q "$ZIP_OUT" imin-system

echo "=== DONE ==="
ls -lh "$ZIP_OUT"
echo "=== CONTENT SAMPLE ==="
unzip -l "$ZIP_OUT" | head -25
unzip -l "$ZIP_OUT" | tail -3
