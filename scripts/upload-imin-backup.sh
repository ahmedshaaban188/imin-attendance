#!/bin/bash
# ImIn Backup — External Upload
# بيحاول يرفع ملف الـ zip على أكتر من خدمة، بالترتيب حسب جودة الخدمة

FILE=/home/z/my-project/download/imin-system-backup-2026-10-08.zip
UA="Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"

# التأكد إن الملف موجود
if [ ! -f "$FILE" ]; then
  echo "ERROR: file not found: $FILE"
  exit 1
fi

echo "### 1) catbox.moe (تخزين دائم) ###"
C1=$(curl -s -m 90 -A "$UA" \
  -F "reqtype=fileupload" \
  -F "fileToUpload=@${FILE}" \
  "https://catbox.moe/user/api.php" 2>&1)
echo "$C1"
echo ""

echo "### 2) litterbox.catbox.moe (72 ساعة) ###"
C2=$(curl -s -m 90 -A "$UA" \
  -F "reqtype=fileupload" \
  -F "time=72h" \
  -F "fileToUpload=@${FILE}" \
  "https://litterbox.catbox.moe/resources/internals/api.php" 2>&1)
echo "$C2"
echo ""

echo "### 3) file.io (رابط لمرة واحدة) ###"
C3=$(curl -s -m 90 -A "$UA" \
  -F "file=@${FILE}" \
  "https://file.io" 2>&1)
echo "$C3"
echo ""

echo "### SUMMARY ###"
case "$C1" in
  https://*) echo "CATBOX_OK: $C1" ;;
  *) echo "CATBOX_FAIL" ;;
esac
case "$C2" in
  https://*) echo "LITTERBOX_OK: $C2" ;;
  *) echo "LITTERBOX_FAIL" ;;
esac
case "$C3" in
  *\"link\"*) echo "FILEIO_OK" ;;
  *) echo "FILEIO_FAIL" ;;
esac
