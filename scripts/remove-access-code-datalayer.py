# -*- coding: utf-8 -*-
"""إزالة كود الوصول من data-layer.ts (مطابقة آمنة بمراسي ASCII وكلمات بدون تشكيل)"""

PATH = "/home/z/my-project/src/lib/data-layer.ts"

with open(PATH, encoding="utf-8") as f:
    lines = f.read().split("\n")

out = []
removed = []
for line in lines:
    # أسطر الكود (ASCII) — تُحذف مباشرة
    if "accessCode" in line or "access_code" in line:
        removed.append(line.strip())
        continue
    # التعليقات العربية المذكورة لكود الوصول (كلمات بدون تشكيل = مطابقة آمنة)
    if "يحتاج كود وصول" in line:
        out.append(" *  - الدكتور: يفعّل حسابه بتأكيد بريده برمز OTP")
        removed.append(line.strip())
        continue
    if "كود الوصول" in line:
        removed.append(line.strip())
        continue
    out.append(line)

with open(PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(out))

print(f"lines: {len(lines)} -> {len(out)}")
print("removed:")
for r in removed:
    print("  -", r)

# تحقق نهائي: لا بقايا
leftover = [l for l in out if "access_code" in l or "accessCode" in l]
assert not leftover, leftover
print("OK: no access-code leftovers in data-layer.ts")
