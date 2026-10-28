#!/usr/bin/env python3
"""
ImIn | استعادة البيانات التجريبية لحالتها الأصلية
يحذف بيانات الاختبار (الجلسة/الحضور/الإنذار/الحظر/المستخدم التجريبي)
ويُبقي حسابَي المالك الأصليين فقط.
"""
import json

DATA_FILE = "/home/z/my-project/data/imin-demo.json"

with open(DATA_FILE, "r", encoding="utf-8") as f:
    db = json.load(f)

# الحسابات الأصلية فقط (أول حسابين كانا موجودين قبل الاختبار)
original_emails = {"ahmed.126630@mgt.mti.edu.eg", "126630@mgt.mti.edu.eg",
                    "mahmoud.126631@mgt.mti.edu.eg"}
db["users"] = [u for u in db.get("users", []) if u.get("email") in original_emails]

# تصفير بيانات الاختبار
for u in db["users"]:
    if u.get("email") == "mahmoud.126631@mgt.mti.edu.eg":
        u["status"] = "pending"

db["sessions"] = []
db["attendance"] = []
db["blocked"] = []
db["warnings"] = []

with open(DATA_FILE, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print("users:", len(db["users"]))
for u in db["users"]:
    print(" -", u["full_name"], "|", u["role"])
print("sessions:", len(db["sessions"]), "| attendance:", len(db["attendance"]),
      "| blocked:", len(db["blocked"]), "| warnings:", len(db["warnings"]))
