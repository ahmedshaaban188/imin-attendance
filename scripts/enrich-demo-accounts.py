#!/usr/bin/env python3
"""
ImIn | تجهيز البيانات التجريبية للجولة الجديدة:
 1) حساب الطالب الافتراضي (ahmed) تُضاف له الصور الثلاث (شخصية + بطاقة وش + ظهر)
    من ملفات tests/fixtures — لتظهر في بطاقته الرقمية و"مستنداتي المسجلة".
 2) حساب الدكتور الافتراضي: يُضاف له "المادة" + status=approved + email_verified.
 3) إضافة طالب تجريبي «بانتظار موافقة الدكتور» (pending) ليختبر المستخدم
    قبول/رفض الطلبات من لوحة الدكتور فوراً.
 4) تصفير الجلسات/الحضور/الحظر/الإنذارات.
"""
import base64
import json
import os

DATA_FILE = "/home/z/my-project/data/imin-demo.json"
FIXTURES = "/home/z/my-project/tests/fixtures"

PENDING_DEMO = {
    "id": "demo-pending-student-0001",
    "full_name": "محمود عبد الرحمن حسن",
    "email": "mahmoud.126631@mgt.mti.edu.eg",
    "university_id": "202312345",
    "role": "student",
    "subject": None,
    "status": "pending",
    "email_verified": True,
    "otp_code": None,
    "otp_expires_at": None,
    "created_at": "2026-10-01T09:00:00.000Z",
}


def data_url(file_name: str) -> str:
    path = os.path.join(FIXTURES, file_name)
    with open(path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


with open(DATA_FILE, "r", encoding="utf-8") as f:
    db = json.load(f)

personal = data_url("personal-photo.jpg")
id_front = data_url("id-front.jpg")
id_back = data_url("id-back.jpg")

kept = []
for user in db.get("users", []):
    email = user.get("email")
    if email == "ahmed.126630@mgt.mti.edu.eg":
        # الطالب الافتراضي: الصور الثلاث + حالة معتمدة
        user["personal_photo_url"] = personal
        user["id_card_url"] = id_front
        user["id_card_back_url"] = id_back
        user["status"] = "approved"
        user["email_verified"] = True
        user["subject"] = None
        user.pop("otp_code", None)
        user.pop("otp_expires_at", None)
        kept.append(user)
    elif email == "126630@mgt.mti.edu.eg":
        # الدكتور الافتراضي: مادته + حساب مفعّل
        user["subject"] = "نظم المعلومات الإدارية"
        user["status"] = "approved"
        user["email_verified"] = True
        user.pop("otp_code", None)
        user.pop("otp_expires_at", None)
        kept.append(user)

# الطالب المنتظر موافقة الدكتور (إن لم يكن موجوداً بالفعل)
emails = {user.get("email") for user in kept}
if PENDING_DEMO["email"] not in emails:
    pending = dict(PENDING_DEMO)
    pending["personal_photo_url"] = personal
    pending["id_card_url"] = id_front
    pending["id_card_back_url"] = id_back
    kept.append(pending)
else:
    for user in kept:
        if user.get("email") == PENDING_DEMO["email"]:
            user["status"] = "pending"
            user["personal_photo_url"] = personal
            user["id_card_url"] = id_front
            user["id_card_back_url"] = id_back

db["users"] = kept
db["sessions"] = []
db["attendance"] = []
db["blocked"] = []
db["warnings"] = []

with open(DATA_FILE, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print("users:", len(db["users"]))
for user in db["users"]:
    print(
        " -", user["role"], "|", user["full_name"], "|", user["email"],
        "| status:", user.get("status"), "| subject:", user.get("subject"),
        "| photos:", bool(user.get("personal_photo_url")),
        bool(user.get("id_card_url")), bool(user.get("id_card_back_url")),
    )
print("sessions:", len(db["sessions"]), "| attendance:", len(db["attendance"]))
