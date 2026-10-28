# -*- coding: utf-8 -*-
"""ترحيل جلسة المستخدم من localStorage إلى sessionStorage (يقفل مع المتصفح)"""

PATH = "/home/z/my-project/src/lib/supabaseClient.js"

with open(PATH, encoding="utf-8") as f:
    lines = f.read().split("\n")

# 1) استبدال سطر المفتاح القديم (وسطر تعليقه)
for i, line in enumerate(lines):
    if 'export const LOCAL_STORAGE_USER_KEY = "imin-user";' in line:
        # التعليق فوقه مباشرة
        assert "localStorage" in lines[i - 1] and lines[i - 1].strip().startswith("/**"), lines[i - 1]
        lines[i - 1] = "/** مفتاح الجلسة الحالية في sessionStorage — مرتبط بعمر المتصفح/التبويب */"
        lines[i] = 'export const SESSION_USER_KEY = "imin-user-session";'
        break
else:
    raise SystemExit("old key line not found")

# 2) استبدال كتلة الدوال الثلاث (من تعليق saveUserToLocalStorage حتى نهاية الملف)
start = None
for i, line in enumerate(lines):
    if "export function saveUserToLocalStorage(user) {" in line:
        # ارجع 3 أسطر للتعليق /** ... */
        start = i - 3
        assert lines[start].strip() == "/**", lines[start]
        break
assert start is not None, "saveUserToLocalStorage not found"

NEW_BLOCK = '''/**
 * حفظ بيانات المستخدم الحالي بعد الدخول أو التسجيل.
 * التخزين في sessionStorage: الجلسة تعيش مع التبويب/المتصفح — إغلاق المتصفح
 * يعني خروجاً تلقائياً (دواعي الأمان) بينما إعادة التحميل تبقيك داخلًا.
 */
export function saveUserSession(user) {
  try {
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    // تنظيف أي نسخة قديمة في localStorage حتى لا تُستخدم للدخول التلقائي
    localStorage.removeItem(LEGACY_USER_KEY);
  } catch (error) {
    console.warn("ImIn: تعذر حفظ الجلسة في sessionStorage", error);
  }
}

/**
 * قراءة بيانات المستخدم الحالي من الجلسة (أو null إن لم يسجّل دخوله).
 */
export function getUserSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (user && typeof user.id === "string" && (user.role === "student" || user.role === "professor")) {
      return user;
    }
    return null;
  } catch {
    return null;
  }
}

/** حذف بيانات الجلسة الحالية عند تسجيل الخروج (يدوي أو تلقائي) */
export function clearUserSession() {
  try {
    sessionStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    /* تجاهل */
  }
}

/** تسجيل سبب الخروج التلقة ليظهر كرسالة توضيحية واحدة في صفحة الدخول */
export function setLogoutReason(reason) {
  try {
    sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
  } catch {
    /* تجاهل */
  }
}

/** قراءة سبب الخروج التلقي وحذفه (يُقرأ مرة واحدة) — null إن لم يوجد */
export function takeLogoutReason() {
  try {
    const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
    if (reason) sessionStorage.removeItem(LOGOUT_REASON_KEY);
    return reason;
  } catch {
    return null;
  }
}
'''

lines = lines[:start] + NEW_BLOCK.split("\n")

# إدراج ثابت LEGACY_USER_KEY بعد مفتاح الجلسة
for i, line in enumerate(lines):
    if 'export const SESSION_USER_KEY = "imin-user-session";' in line:
        lines.insert(
            i + 1,
            '\n/** مفتاح قديم من نسخ سابقة (localStorage) — يُنظّف حتى لا يُستخدم للدخول التلقائي */\nconst LEGACY_USER_KEY = "imin-user";\n\n/** سبب آخر خروج تلقائي (تقرأه صفحة الدخول وتعرضه مرة واحدة) */\nexport const LOGOUT_REASON_KEY = "imin-logout-reason";',
        )
        break
else:
    raise SystemExit("session key line not found after replacement")

text = "\n".join(lines)
with open(PATH, "w", encoding="utf-8") as f:
    f.write(text)

# تحقق نهائي
assert "saveUserToLocalStorage" not in text
assert "getUserFromLocalStorage" not in text
assert "clearUserFromLocalStorage" not in text
assert "localStorage.getItem" not in text
assert "sessionStorage.setItem(SESSION_USER_KEY" in text
print("OK — supabaseClient.js migrated to sessionStorage")
