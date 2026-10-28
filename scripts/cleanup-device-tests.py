#!/usr/bin/env python3
"""
تنظيف بيانات اختبار ربط الجهاز + التحقق الجغرافي الخادمي:
  1. حذف جلسة «اختبار الجغرافيا الخادمية» وسجل حضورها وإشعاراتها
  2. تصفير ربط الأجهزة (device_id = null) لكل الحسابات — حتى يرتبط
     جهاز المستخدم الفعلي عند أول دخول بعد التسليم
  3. إبقاء سجل الأنشطة المشبوهة كما هو (عرض حقيقي للميزة الجديدة)
"""
import json

PATH = "/home/z/my-project/data/imin-demo.json"

with open(PATH, "r", encoding="utf-8") as f:
    db = json.load(f)

TEST_SUBJECT = "اختبار الجغرافيا الخادمية"

# 1) حذف جلسات الاختبار وما يرتبط بها
test_session_ids = [s["id"] for s in db.get("sessions", []) if s.get("subject") == TEST_SUBJECT]
db["sessions"] = [s for s in db.get("sessions", []) if s.get("subject") != TEST_SUBJECT]
db["attendance"] = [a for a in db.get("attendance", []) if a.get("session_id") not in test_session_ids]
db["notifications"] = [
    n for n in db.get("notifications", [])
    if not (n.get("params", {}).get("subject") == TEST_SUBJECT)
]
# إشعار تأكيد ربط الجهاز من الاختبار يُحذف أيضاً (سيُولد حقيقي عند الاستخدام)
db["notifications"] = [n for n in db["notifications"] if n.get("type") not in
                       ("device_transfer_request", "device_transfer_approved", "device_transfer_rejected")]

# 2) تصفير ربط الأجهزة
for u in db.get("users", []):
    u["device_id"] = None
    u["device_linked_at"] = None

# 3) إزالة أي طلبات أجهزة متبقية
db["device_requests"] = []

# ضمان وجود المفتاح
db.setdefault("device_requests", [])

with open(PATH, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print("تم التنظيف:")
print(f"  - جلسات اختبار محذوفة: {len(test_session_ids)}")
print(f"  - حسابات تم تصفير ربطها: {len(db['users'])}")
print(f"  - طلبات أجهزة متبقية: {len(db['device_requests'])}")
print(f"  - سجلات حضور متبقية: {len(db['attendance'])}")
print(f"  - أحداث مشبوهة محفوظة (للعرض): {len(db['suspicious_events'])}")
