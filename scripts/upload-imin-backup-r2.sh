#!/bin/bash
# ImIn Backup — External Upload (Round 2: خدمات بديلة)

FILE=/home/z/my-project/download/imin-system-backup-2026-10-08.zip
UA="imin-backup-uploader/1.0 (curl; linux)"

if [ ! -f "$FILE" ]; then
  echo "ERROR: file not found"
  exit 1
fi

echo "### 1) file.io مع متابعة إعادة التوجيه ###"
curl -s -L -m 90 -A "$UA" -F "file=@${FILE}" "https://file.io" 2>&1
echo ""
echo "----------------------------------------"

echo "### 2) tmpfiles.org (ساعة) ###"
curl -s -L -m 90 -A "$UA" -F "file=@${FILE}" "https://tmpfiles.org/api/v1/upload" 2>&1
echo ""
echo "----------------------------------------"

echo "### 3) x0.at ###"
curl -s -L -m 90 -A "$UA" -F "file=@${FILE}" "https://x0.at/" 2>&1
echo ""
echo "----------------------------------------"

echo "### 4) 0x0.st ###"
curl -s -L -m 90 -A "$UA" -F "file=@${FILE}" "https://0x0.st/" 2>&1
echo ""
echo "----------------------------------------"

echo "### 5) uguu.se (48 ساعة) ###"
curl -s -L -m 90 -A "$UA" -F "files[]=@${FILE}" "https://uguu.se/upload.php" 2>&1
echo ""
echo "----------------------------------------"

echo "### 6) qu.ax ###"
curl -s -L -m 90 -A "$UA" -F "files[]=@${FILE}" "https://qu.ax/upload" 2>&1
echo ""
echo "----------------------------------------"

echo "### 7) bashupload.com (لمرة واحدة) ###"
curl -s -L -m 90 -A "$UA" --data-binary "@${FILE}" "https://bashupload.com/imin-system.zip" 2>&1 | grep -oE "https://[^\"' ]+" | head -3
echo ""
echo "----------------------------------------"

echo "### 8) temp.sh ###"
curl -s -L -m 90 -A "$UA" -F "file=@${FILE}" "https://temp.sh/upload" 2>&1
echo ""
echo "=== DONE ==="
