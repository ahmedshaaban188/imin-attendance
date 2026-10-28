# -*- coding: utf-8 -*-
"""تنظيف أحداث كود الوصول القديمة من بيانات التجربة"""
import json

PATH = "/home/z/my-project/data/imin-demo.json"

with open(PATH, encoding="utf-8") as f:
    db = json.load(f)

events = db.get("suspicious_events", [])
before = len(events)
db["suspicious_events"] = [
    e for e in events
    if e.get("event_type") not in ("bad_access_code", "code_lockout")
]
after = len(db["suspicious_events"])

with open(PATH, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print(f"suspicious_events: {before} -> {after} (removed {before - after})")

# تحقق: لا بقايا لأي إشارة لكود الوصول في البيانات
raw = json.dumps(db, ensure_ascii=False)
assert "bad_access_code" not in raw and "code_lockout" not in raw
assert "access_code" not in raw
print("OK — demo data clean")
