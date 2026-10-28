/**
 * ============================================================================
 *  ImIn | معرّف الجهاز (Device ID) — حماية الحساب من المشاركة
 * ============================================================================
 *  يولّد معرّفاً فريداً دائماً لجهاز المستخدم ويحفظه في localStorage:
 *  - أول زيارة للموقع على الجهاز → توليد UUID وتخزينه (يبقى للأبد)
 *  - كل زيارة بعدها → قراءة نفس المعرف
 *
 *  الاستخدام: يُرسل مع تسجيل الدخول وإنشاء الحساب، فيربط الخادم الحساب
 *  بهذا الجهاز فقط. أي جهاز آخر يحاول الدخول بنفس البيانات يُرفض
 *  (DEVICE_MISMATCH) ويُسجَّل في الأنشطة المشبوهة.
 *
 *  ملحوظة أمنية: المعرف يُطلب في الخادم لكنه لا يُعتبر سراً — هو أقرب
 *  لـ «اسم الجهاز» الدائم. الحماية الفعلية هي المنع + التسجيل + موافقة
 *  الدكتور على نقل الجهاز، وليست التخمين.
 * ============================================================================
 */

const DEVICE_ID_KEY = "imin-device-id";

/** توليد UUID مع بديل آمن للمتصفحات القديمة */
function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // بديل: crypto.getRandomValues (متوفر في كل المتصفحات الحديثة)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // إصدار UUID v4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // متغيّر RFC
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * قراءة معرّف الجهاز الحالي — يولّده عند أول استدعاء إن لم يكن موجوداً.
 * يعيد نصاً فارغاً فقط عند التشغيل على السيرفر (SSR) حيث لا يوجد localStorage.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 8) return existing;

    const id = createId();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // localStorage معطّل (وضع التصفح الخاص المشدد مثلاً)
    return "";
  }
}

/** مسح معرّف الجهاز (للاختبارات فقط — لا يُستدعى في التطبيق) */
export function resetDeviceId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    /* تجاهل */
  }
}
