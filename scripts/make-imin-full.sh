#!/bin/bash
# ImIn — نسخة "كل الملفات" (بدون node_modules و .next لأنهما يتولدان تلقائياً بحجم 1.4GB)
set -e

BASE=/home/z/my-project
STAGE=$BASE/scripts/staging-full/imin-all-files
ZIP_OUT=$BASE/download/imin-all-files.zip

rm -rf "$BASE/scripts/staging-full"
mkdir -p "$STAGE"

# نسخ كل محتويات الجذر ما عدا: node_modules (1.2GB) و .next (180MB) و مجلدات المنصة الداخلية
for item in .env .git .gitignore Caddyfile bun.lock components.json data db dev.log \
            download eslint.config.mjs examples imin-project-extracted mini-services \
            next-env.d.ts package.json postcss.config.mjs prisma public \
            src supabase tailwind.config.ts test-results tests \
            tsconfig.json tsconfig.tsbuildinfo upload; do
  if [ -e "$BASE/$item" ]; then
    cp -a "$BASE/$item" "$STAGE/"
  fi
done

# مجلد scripts بدون نسخة الـ staging المكررة
mkdir -p "$STAGE/scripts"
for f in "$BASE/scripts/"*; do
  name=$(basename "$f")
  [ "$name" = "staging" ] && continue
  [ "$name" = "staging-full" ] && continue
  cp -a "$f" "$STAGE/scripts/"
done

# التغليف
rm -f "$ZIP_OUT"
cd "$BASE/scripts/staging-full"
zip -r -q "$ZIP_OUT" imin-all-files

echo "=== DONE ==="
ls -lh "$ZIP_OUT"
echo "=== FILE COUNT ==="
unzip -l "$ZIP_OUT" | tail -1
