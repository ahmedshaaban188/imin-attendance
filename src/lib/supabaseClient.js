/**
 * ============================================================================
 *  ImIn | نظام الحضور الجامعي الذكي — ملف الاتصال بقاعدة بيانات Supabase
 * ============================================================================
 *
 *  كيفية الضبط (خطوة واحدة فقط):
 *  1) أنشئ مشروعاً مجانياً على https://supabase.com
 *  2) من: Project Settings -> API  انسخ:
 *       - Project URL
 *       - anon public key
 *  3) الصق القيمتين في الثابتين أدناه (SUPABASE_URL و SUPABASE_ANON_KEY)
 *  4) شغّل ملف supabase/schema.sql داخل SQL Editor في لوحة تحكم Supabase
 *
 *  ملاحظة: يمكنك أيضاً وضع القيم في ملف .env.local بدلاً من تعديل هذا الملف:
 *       NEXT_PUBLIC_SUPABASE_URL=...
 *       NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 *  (المتغيرات البيئية تُستخدم تلقائياً إن وُجدت، وإلا تُستخدم القيم أدناه)
 * ============================================================================
 */

import { createClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------- */
/*  1) بيانات الاتصال — عدِّل القيمتين التاليتين فقط                            */
/* -------------------------------------------------------------------------- */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://YOUR_PROJECT_ID.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "YOUR_ANON_KEY_HERE";

/* -------------------------------------------------------------------------- */
/*  2) إنشاء عميل Supabase الموحّد الذي تستخدمه كل صفحات النظام                  */
/* -------------------------------------------------------------------------- */

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* -------------------------------------------------------------------------- */
/*  3) أسماء الجداول والمخازن (حسب مخطط قاعدة البيانات المطلوب)                   */
/* -------------------------------------------------------------------------- */

export const USERS_TABLE = "users";
export const SESSIONS_TABLE = "sessions";
export const ATTENDANCE_TABLE = "attendance";
export const BLOCKED_TABLE = "blocked_students";
export const WARNINGS_TABLE = "warnings";
export const ID_CARDS_BUCKET = "id-cards";

/** مفتاح الجلسة الحالية في sessionStorage — مرتبط بعمر المتصفح/التبويب */
export const SESSION_USER_KEY = "imin-user-session";

/** مفتاح قديم من نسخ سابقة (localStorage) — يُنظّف حتى لا يُستخدم للدخول التلقائي */
const LEGACY_USER_KEY = "imin-user";

/** سبب آخر خروج تلقائي (تقرأه صفحة الدخول وتعرضه مرة واحدة) */
export const LOGOUT_REASON_KEY = "imin-logout-reason";

/* -------------------------------------------------------------------------- */
/*  4) أدوات مساعدة عامة                                                       */
/* -------------------------------------------------------------------------- */

/**
 * للتحقق من أن المستخدم قد وضع بيانات الاتصال الفعلية بعد القيم الافتراضية.
 * تُستخدم لعرض تنبيه إعداد ودّي أعلى الواجهة بدلاً من رسائل خطأ غامضة.
 */
export function isSupabaseConfigured() {
  const urlOk =
    typeof SUPABASE_URL === "string" &&
    SUPABASE_URL.startsWith("http") &&
    !SUPABASE_URL.includes("YOUR_");
  const keyOk =
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes("YOUR_");
  return urlOk && keyOk;
}

/**
 * تحويل أخطاء Supabase/الشبكة إلى رسائل عربية واضحة للمستخدم النهائي.
 */
export function friendlyError(error) {
  if (!error) return "حدث خطأ غير متوقع.";

  // انقطاع الشبكة أو بيانات اتصال غير مضبوطة
  const message = String(error.message || error.toString());
  if (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("getaddrinfo")
  ) {
    return "تعذّر الاتصال بقاعدة البيانات — تأكد من ضبط بيانات Supabase في ملف src/lib/supabaseClient.js ومن تشغيل ملف supabase/schema.sql.";
  }

  // تكرار قيمة فريدة (بريد مسجّل مسبقاً / حضور مكرّر)
  if (error.code === "23505" || message.includes("duplicate key")) {
    return "هذه البيانات مسجّلة مسبقاً — لا يمكن تكرارها.";
  }

  if (error.code === "42P01") {
    return "الجداول غير موجودة بعد — شغّل ملف supabase/schema.sql داخل SQL Editor في Supabase.";
  }

  if (error.code === "23503") {
    return "بيانات مرتبطة غير موجودة في قاعدة البيانات.";
  }

  return message || "حدث خطأ غير متوقع.";
}

/**
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
