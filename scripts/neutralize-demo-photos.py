#!/usr/bin/env python3
"""تحديث صور الـ demo المضمّنة (base64) بالنسخ المحايدة الجديدة — إزالة البنفسجي من بيانات العرض"""
import json
import base64
import mimetypes

DATA = "/home/z/my-project/data/imin-demo.json"
FIX = "/home/z/my-project/tests/fixtures"

# الصور الجديدة المحايدة
FIXTURES = {
    "personal_photo_url": f"{FIX}/personal-photo.jpg",
    "id_card_url": f"{FIX}/id-front.jpg",
    "id_card_back_url": f"{FIX}/id-back.jpg",
}

def to_data_url(path: str) -> str:
    with open(path, "rb") as f:
        raw = f.read()
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"

data = json.load(open(DATA, encoding="utf-8"))
changed = 0
for u in data.get("users", []):
    for key, fix_path in FIXTURES.items():
        old = u.get(key)
        # استبدال أي صورة شخصية/بطاقة مضمّنة قديمة (بنفسجية) بالنسخة المحايدة
        if old and old.startswith("data:image/"):
            u[key] = to_data_url(fix_path)
            changed += 1

json.dump(data, open(DATA, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"Replaced {changed} embedded photos with neutral versions")
print("DONE")
