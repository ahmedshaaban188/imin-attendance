# -*- coding: utf-8 -*-
"""إزالة نظام كود الوصول من auth-view.tsx + تحييد الظل البنفسجي المتبقي"""

PATH = "/home/z/my-project/src/components/auth/auth-view.tsx"

with open(PATH, encoding="utf-8") as f:
    lines = f.read().split("\n")

log = []

# ---------------------------------------------------------------- بلوكات JSX
def find_block(start_pred, end_pred, from_idx=0):
    s = -1
    for i in range(from_idx, len(lines)):
        if start_pred(lines[i]):
            s = i
            break
    if s < 0:
        return None
    for j in range(s + 1, len(lines)):
        if end_pred(lines[j]):
            return (s, j)  # حذف [s, j)
    return None

# بلوك حقل كود الوصول في نموذج الدخول (ينتهي قبل بانر ربط الجهاز)
blk = find_block(
    lambda l: "{/*" in l and "كود الوصول" in l,
    lambda l: "بانر ربط الجهاز" in l,
)
assert blk, "login access-code block not found"
s, e = blk
assert any("login-access-code" in lines[i] for i in range(s, e)), "wrong login block"
del lines[s:e]
log.append(f"login JSX field block: removed {e - s} lines")

# بلوك حقل كود الوصول في نموذج التسجيل (ينتهي قبل حقل المادة)
blk = find_block(
    lambda l: "{/*" in l and "كود الوصول" in l,
    lambda l: "المادة التي" in l and "{/*" in l,
)
assert blk, "register access-code block not found"
s, e = blk
assert any("register-access-code" in lines[i] for i in range(s, e)), "wrong register block"
del lines[s:e]
log.append(f"register JSX field block: removed {e - s} lines")

# ------------------------------------------------------- أسطر مفردة وبلوكات صغيرة
out = []
i = 0
n = len(lines)
while i < n:
    line = lines[i]
    stripped = line.strip()

    # استيراد LockKeyhole (كان لحقل الكود فقط)
    if stripped == "LockKeyhole,":
        i += 1
        log.append("import LockKeyhole removed")
        continue

    # أعضاء نوع FieldKey
    if stripped in ('| "accessCode"', '| "loginAccessCode";'):
        i += 1
        log.append(f"FieldKey member removed: {stripped}")
        continue

    # حالات الـ state
    if "const [loginAccessCode, setLoginAccessCode]" in line or "const [accessCode, setAccessCode]" in line:
        i += 1
        log.append("state removed")
        continue

    # وسيط findUserByLogin
    if stripped == "loginAccessCode.trim(),":
        i += 1
        log.append("findUserByLogin arg removed")
        continue

    # تعليقات الترويسة (سطران)
    if "كود الوصول للدكاترة" in line:
        out.append(" *  - تسجيل الدخول: البريد + الرقم الجامعي/الوظيفي")
        i += 1
        log.append("header comment 1 rewritten")
        continue
    if "كود وصول إداري" in line and "•" in line:
        out.append(" *      • الدكتور  → المادة + صورة شخصية إلزامية + تأكيد البريد برمز OTP")
        i += 1
        log.append("header comment 2 rewritten")
        continue

    # تعليق التحقق: المادة + الكود
    if "// الدكتور: المادة + كود الوصول" in line:
        out.append("    // الدكتور: اسم المادة إلزامي")
        i += 1
        log.append("validation comment rewritten")
        continue

    # تعليق insertUser
    if "// 3) حفظ بيانات المستخدم" in line and "كود الوصول" in line:
        out.append("      // 3) حفظ بيانات المستخدم — يُربط الحساب بهذا الجهاز فوراً (device_id)")
        i += 1
        log.append("insertUser comment rewritten")
        continue
    if stripped.startswith("//") and "والحساب" in line and "device_id" in line:
        i += 1
        log.append("insertUser comment continuation removed")
        continue

    # تعليق أخطاء الكود في الدخول
    if "أخطاء كود الوصول" in line:
        i += 1
        log.append("login catch comment removed")
        continue

    # سطر access_code في insertUser
    if "access_code:" in line:
        i += 1
        log.append("insertUser access_code arg removed")
        continue

    # بلوك التحقق: accessCode.trim().length === 0
    if "accessCode.trim().length === 0" in line:
        assert "errors.accessCode" in lines[i + 1], "unexpected validation block"
        assert lines[i + 2].strip() == "}", "unexpected validation block end"
        i += 3
        log.append("register validation block removed")
        continue

    # بلوكات BAD_ACCESS_CODE (الدخول والتسجيل)
    if 'if (code === "BAD_ACCESS_CODE"' in line:
        assert "setFieldErrors" in lines[i + 1], "unexpected BAD_ACCESS_CODE block"
        assert lines[i + 2].strip() == "}", "unexpected BAD_ACCESS_CODE block end"
        i += 3
        log.append("BAD_ACCESS_CODE block removed")
        continue

    out.append(line)
    i += 1

lines = out

# ------------------------------------- حذف const code غير المستخدم (التسجيل)
text = "\n".join(lines)
final_lines = []
for idx, line in enumerate(lines):
    if "const code = (error as Error & { code?: string }).code;" in line:
        # ابحث حتى نهاية الـ catch: هل يُستخدم code لاحقاً؟
        span_end = idx
        for j in range(idx + 1, len(lines)):
            if "finally" in lines[j] or lines[j].strip() == "} catch (error) {":
                span_end = j
                break
        used = any("code === " in lines[j] or "(code" in lines[j] for j in range(idx + 1, span_end))
        if not used:
            log.append("unused const code removed (register catch)")
            continue
    final_lines.append(line)

text = "\n".join(final_lines)

# ------------------------------------------------- تحييد الظل البنفسجي المتبقي
assert text.count("rgba(139,92,246,0.15)") == 2, f"purple shadows: {text.count('rgba(139,92,246')}"
text = text.replace("rgba(139,92,246,0.15)", "rgba(23,24,28,0.14)")
log.append("2 purple shadows -> neutral ink")

# ------------------------------------------------------------ تحقق نهائي
for leftover in ["accessCode", "access_code", "BAD_ACCESS_CODE", "ACCESS_LOCKED",
                 "LockKeyhole", "rgba(139,92,246", "كود الوصول", "كود وصول"]:
    assert leftover not in text, f"LEFTOVER: {leftover}"

with open(PATH, "w", encoding="utf-8") as f:
    f.write(text)

print("\n".join(log))
print(f"\nOK — total lines now: {text.count(chr(10)) + 1}")
