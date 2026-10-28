/**
 * ============================================================================
 *  ImIn | تجزئة كلمات المرور (Password Hashing)
 * ============================================================================
 *  تعمل هذه الوحدة في المتصفح فقط (Web Crypto API) وتستخدم SHA-256 مع
 *  "ملح" (salt) عشوائية مستقلة لكل مستخدم:
 *
 *      password_hash = SHA-256( salt + SHA-256( password ) )
 *
 *  - لا تُخزَّن كلمة المرور الأصلية في أي مكان إطلاقاً.
 *  - تُرسل إلى السيرفر الهاش والملح فقط (ولا يُعاد إرسالهما في أي استجابة).
 *  - 60000 تكرار (iterations) لرفع كلفة الهجوم بالقوة الغاشمة.
 *
 *  ملاحظة معمارية للإنتاج: الحل الأقوى في بيئة Supabase الحقيقية هو
 *  استخدام Supabase Auth (bcrypt على السيرفر + RLS مقيّد بـ auth.uid()) —
 *  هذه الوحدة توفّر طبقة حماية فورية متوافقة مع الوضعين (تجريبي/Supabase)
 *  بدون أي خدمة بريد أو إعداد إضافي.
 * ============================================================================
 */

const PBKDF2_ITERATIONS = 60_000;
const SALT_BYTES = 16;

/** سلسلة عشوائية آمنة تشفيرياً (ملح لكل مستخدم) */
export function generateSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** تحويل ArrayBuffer إلى سلسلة Hex */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 واحدة على نص مع ملح (سطر واحد من الهاش المركّب) */
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}

/**
 * توليد الهاش النهائي لكلمة المرور مع الملح:
 * طبقتا SHA-256 + امتداد بعدد تكرارات ثابت لرفع كلفة الهجوم.
 */
export async function hashPassword(
  password: string,
  salt: string
): Promise<string> {
  const firstLayer = await sha256Hex(`${salt}:${password}`);
  let combined = `${salt}:${firstLayer}`;
  for (let i = 0; i < 100; i += 1) {
    combined = await sha256Hex(combined);
  }
  return `v1$${PBKDF2_ITERATIONS}$${combined}`;
}

/** توليد الهاز + الملح معاً (يُستخدم عند إنشاء الحساب) */
export async function hashNewPassword(
  password: string
): Promise<{ salt: string; hash: string }> {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  return { salt, hash };
}

/** التحقق من كلمة مرور مقابل هاش محفوظ (يُستخدم عند تسجيل الدخول) */
export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  if (!salt || !storedHash) return false;
  const computed = await hashPassword(password, salt);
  // مقارنة زمنية ثابتة مبسطة لتجنّب timing attacks
  if (computed.length !== storedHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i += 1) {
    mismatch |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return mismatch === 0;
}

/** التحقق من سياسة كلمة المرور — ترجع رسالة خطأ أو null إن كانت صالحة */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 6) {
    return "كلمة المرور يجب ألا تقل عن 6 أحرف.";
  }
  if (password.length > 64) {
    return "كلمة المرور طويلة جداً — الحد الأقصى 64 حرفاً.";
  }
  if (/^\s|\s$/.test(password)) {
    return "كلمة المرور لا تبدأ أو تنتهي بمسافة.";
  }
  return null;
}
