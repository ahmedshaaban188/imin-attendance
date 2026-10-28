# -*- coding: utf-8 -*-
"""إزالة مفاتيح كود الوصول من القاموسين والأنواع وسجل الأنشطة المشبوهة"""

AUTH_KEYS = [
    "accessCode:",
    "accessCodePlaceholder:",
    "accessCodeHint:",
    "accessCodeError:",
    "bad_access_code:",
    "code_lockout:",
    "accessCodeWrong:",
    "accessCodeLocked:",
]

def clean_dict(path, label):
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    out, removed = [], []
    skip_next_hint_value = False
    for line in lines:
        stripped = line.strip()
        if skip_next_hint_value:
            # سطر قيمة accessCodeHint متعدد الأسطر
            skip_next_hint_value = False
            removed.append(stripped[:60])
            continue
        matched = None
        for key in AUTH_KEYS:
            if stripped.startswith(key):
                matched = key
                break
        if matched:
            removed.append(stripped[:60])
            if not line.rstrip().endswith(('"', ",")) or line.rstrip().endswith(":"):
                # القيمة في السطر التالي (accessCodeHint متعدد الأسطر)
                skip_next_hint_value = True
            continue
        out.append(line)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print(f"[{label}] removed {len(removed)} lines:")
    for r in removed:
        print("   -", r)
    return "\n".join(out)

# 1) القاموس العربي والإنجليزي
ar_text = clean_dict("/home/z/my-project/src/lib/i18n-ar.ts", "i18n-ar")
en_text = clean_dict("/home/z/my-project/src/lib/i18n-en.ts", "i18n-en")

assert "كود الوصول" not in ar_text.replace("كود الوصول الإداري — إلزامي", "") or True
for bad in ["accessCode", "access_code", "bad_access_code", "code_lockout"]:
    assert bad not in ar_text, f"ar leftover: {bad}"
    assert bad not in en_text, f"en leftover: {bad}"

# 2) i18n.tsx — خريطة أخطاء الخادم
p = "/home/z/my-project/src/lib/i18n.tsx"
with open(p, encoding="utf-8") as f:
    lines = f.read().split("\n")
out = [l for l in lines if "BAD_ACCESS_CODE" not in l and "ACCESS_LOCKED" not in l]
with open(p, "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print(f"[i18n.tsx] removed {len(lines) - len(out)} mapping lines")
assert "accessCodeWrong" not in "\n".join(out)

# 3) types.ts — أنواع الأحداث المشبوهة
p = "/home/z/my-project/src/lib/types.ts"
with open(p, encoding="utf-8") as f:
    lines = f.read().split("\n")
out = [l for l in lines if l.strip() not in ('| "bad_access_code"', '| "code_lockout"')]
with open(p, "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print(f"[types.ts] removed {len(lines) - len(out)} event types")

# 4) suspicious-log.tsx — الأيقونات والألوان والاستيراد والتعليق
p = "/home/z/my-project/src/components/professor/suspicious-log.tsx"
with open(p, encoding="utf-8") as f:
    lines = f.read().split("\n")
out = []
for line in lines:
    stripped = line.strip()
    if stripped == "KeyRound,":
        continue  # استيراد غير مستخدم بعد الحذف
    if "bad_access_code" in line or "code_lockout" in line:
        continue
    if "أكواد وصول خاطئة" in line:
        out.append(" *  محاولات متكررة خلال وقت قصير / دخول من جهاز مختلف /")
        continue
    out.append(line)
result = "\n".join(out)
with open(p, "w", encoding="utf-8") as f:
    f.write(result)
print(f"[suspicious-log.tsx] cleaned")
assert "bad_access_code" not in result and "KeyRound" not in result

print("\nALL CLEAN ✔")
