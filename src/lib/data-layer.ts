/**
 * ============================================================================
 *  ImIn | طبقة البيانات الموحّدة (Supabase الحقيقي + الوضع التجريبي)
 * ============================================================================
 *  كل استعلامات الواجهات تمر من هنا:
 *   - إذا كانت بيانات Supabase مضبوطة في src/lib/supabaseClient.js
 *     → تُنفَّذ على قاعدة البيانات الحقيقية مع Realtime.
 *   - إذا لم تكن مضبوطة بعد → يعمل "الوضع التجريبي" تلقائياً عبر
 *     /api/demo (قاعدة بيانات محلية على السيرفر) مع بث لحظي بالتحديث
 *     الدوري كل 3 ثوانٍ.
 *
 *  النتيجة: النظام يعمل كاملاً فور فتحه — بدون أي إعداد مسبق —
 *  ويتحول لـ Supabase الحقيقي تلقائياً بمجرد إدخال بيانات الاتصال.
 * ============================================================================
 */

import {
  supabase,
  isSupabaseConfigured,
  USERS_TABLE,
  SESSIONS_TABLE,
  ATTENDANCE_TABLE,
  BLOCKED_TABLE,
  WARNINGS_TABLE,
  ID_CARDS_BUCKET,
} from "./supabaseClient";
import type {
  AccountStatus,
  AppUser,
  AttendanceRow,
  DeviceRequestRow,
  NotificationRow,
  ProfessorRosterStats,
  RealtimeStatus,
  ScheduleRow,
  SessionRow,
  StudentStats,
  SuspiciousEventRow,
  WarningRow,
} from "./types";

/** إعادة تصدير الأنواع التي تستوردها الواجهات من طبقة البيانات */
export type { StudentStats, AppUser, AttendanceRow, ScheduleRow, SessionRow, WarningRow };

/** نوع HistoryRow (معرف في history-table) — نعيد تعريفه هنا لتجنب الاستيراد الدائري */
export interface HistoryRowData extends AttendanceRow {
  sessions:
    | {
        created_at: string;
        radius: number;
        subject: string | null;
        users: { full_name: string } | null;
      }
    | null;
}

/** صف من سجل جلسات الدكتور السابقة (مع عدد الحضور في كل جلسة) */
export interface SessionHistoryRow {
  id: string;
  professor_id: string;
  subject: string | null;
  lat: number | string;
  lng: number | string;
  radius: number;
  is_open: boolean;
  created_at: string;
  attendanceCount: number;
}

/** ملخّص إحصائيات الطالب (لعرضه في لوحة الطالب) */
export interface StudentSummary {
  totalAttended: number;
  warnings: number;
  lastAttendedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/*  الوضع التجريبي                                                             */
/* -------------------------------------------------------------------------- */

/** true عندما لا تكون بيانات Supabase مضبوطة بعد */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

/** استدعاء مسار API التجريبي */
async function demoApi<T>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    const error = new Error("تعذّر الاتصال بالخادم المحلي.");
    (error as Error & { code?: string }).code = "NETWORK";
    throw error;
  }

  const json = (await response.json().catch(() => null)) as
    | { ok: boolean; data?: T; code?: string; error?: string }
    | null;

  if (!json || !response.ok || json.ok === false) {
    const error = new Error(
      json?.error || "حدث خطأ غير متوقع أثناء الاتصال بالخادم."
    ) as Error & { code?: string };
    error.code = json?.code;
    throw error;
  }

  return json.data as T;
}

/** تحويل صورة Blob إلى Data URL (في الوضع التجريبي تُخزَّن مباشرة) */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذّر قراءة صورة البطاقة."));
    reader.readAsDataURL(blob);
  });
}

/* -------------------------------------------------------------------------- */
/*  المصادقة (تسجيل الدخول / إنشاء الحساب)                                     */
/* -------------------------------------------------------------------------- */

/**
 * البحث عن حساب عبر البريد + الرقم الجامعي/الوظيفي.
 * ترجع null إذا لم يوجد الحساب (كلمة "غير مسجل").
 * معرّف الجهاز يُفحص خادمياً: الحساب مربوط بجهاز آخر → خطأ DEVICE_MISMATCH.
 */
export async function findUserByLogin(
  email: string,
  universityId: string,
  deviceId?: string
): Promise<AppUser | null> {
  if (isDemoMode()) {
    return demoApi<AppUser | null>("login", {
      email,
      university_id: universityId,
      device_id: deviceId ?? "",
    });
  }

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .select("*")
    .eq("email", email)
    .eq("university_id", universityId)
    .limit(1);

  if (error) throw error;
  return data && data.length > 0 ? (data[0] as AppUser) : null;
}

/** التحقق من أن البريد مسجّل مسبقاً */
export async function emailExists(email: string): Promise<boolean> {
  if (isDemoMode()) {
    return demoApi<boolean>("check-email", { email });
  }

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .select("id")
    .eq("email", email)
    .limit(1);

  if (error) throw error;
  return Boolean(data && data.length > 0);
}

/**
 * رفع صورة البطاقة:
 *  - Supabase  → ترفع إلى Storage وترجع الرابط العام.
 *  - تجريبي    → تُحوَّل إلى Data URL وتُخزَّن مع بيانات المستخدم.
 */
export async function uploadIdCard(
  path: string,
  blob: Blob
): Promise<string> {
  if (isDemoMode()) {
    return blobToDataUrl(blob);
  }

  const { error } = await supabase.storage
    .from(ID_CARDS_BUCKET)
    .upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      upsert: false,
      cacheControl: "3600",
    });
  if (error) throw error;

  const { data } = supabase.storage.from(ID_CARDS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** نتيجة إنشاء الحساب: المستخدم + رمز OTP (للدكاترة فقط — يظهر للواجهة في الوضع التجريبي) */
export interface RegisterResult {
  user: AppUser;
  otp: string | null;
}

/** توليد رمز OTP من 6 أرقام (يُستخدم في وضع Supabase — لا يوجد بريد مفعّل بعد) */
function generateOtpCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(100000 + (array[0] % 900000));
}

/** صلاحية رمز التحقق: 10 دقائق */
const OTP_TTL_MS = 10 * 60 * 1000;

/** إنشاء حساب جديد في جدول users
 *  - الطالب : status = «pending» حتى يوافق الدكتور على طلبه
 *  - الدكتور: يفعّل حسابه بتأكيد بريده برمز OTP
 */
export async function insertUser(params: {
  full_name: string;
  email: string;
  university_id: string;
  role: "student" | "professor";
  id_card_url: string | null;
  id_card_back_url: string | null;
  personal_photo_url: string | null;
  /** المادة التي يدرّسها الدكتور */
  subject?: string | null;
  /** بيانات أكاديمية للطالب (تظهر في البطاقة الرقمية) */
  faculty?: string | null;
  program?: string | null;
  academic_year?: string | null;
  /** معرّف الجهاز — يُربط الحساب به فور إنشائه */
  device_id?: string;
}): Promise<RegisterResult> {
  if (isDemoMode()) {
    return demoApi<RegisterResult>("register", {
      ...params,
      subject: params.subject ?? null,
      faculty: params.faculty ?? null,
      program: params.program ?? null,
      academic_year: params.academic_year ?? null,
      device_id: params.device_id ?? "",
    });
  }

  const isProfessor = params.role === "professor";
  const otp = isProfessor ? generateOtpCode() : null;

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .insert({
      ...params,
      subject: isProfessor ? (params.subject ?? null) : null,
      status: isProfessor ? "approved" : "pending",
      email_verified: !isProfessor,
      otp_code: otp,
      otp_expires_at: otp
        ? new Date(Date.now() + OTP_TTL_MS).toISOString()
        : null,
    })
    .select()
    .single();

  if (error) throw error;
  return { user: data as AppUser, otp };
}

/** تأكيد بريد الدكتور برمز OTP — يرجع المستخدم بعد التفعيل */
export async function verifyOtp(
  email: string,
  code: string
): Promise<AppUser> {
  if (isDemoMode()) {
    return demoApi<AppUser>("verify-otp", { email, code });
  }

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .select("id, role, email_verified, otp_code, otp_expires_at")
    .eq("email", email)
    .eq("role", "professor")
    .limit(1);
  if (error) throw error;

  const record = (data || [])[0] as
    | {
        id: string;
        role: string;
        email_verified: boolean | null;
        otp_code: string | null;
        otp_expires_at: string | null;
      }
    | undefined;

  if (!record) {
    throw Object.assign(new Error("لا يوجد حساب دكتور بهذا البريد."), {
      code: "NOT_FOUND",
    });
  }
  if (record.email_verified) {
    // مؤكد بالفعل — نجلب بياناته كاملة ونعيدها
    const { data: full, error: fullError } = await supabase
      .from(USERS_TABLE)
      .select("*")
      .eq("id", record.id)
      .limit(1);
    if (fullError) throw fullError;
    return (full || [])[0] as AppUser;
  }
  if (
    !record.otp_code ||
    !record.otp_expires_at ||
    new Date(record.otp_expires_at).getTime() < Date.now()
  ) {
    throw Object.assign(
      new Error("انتهت صلاحية الرمز — اطلب رمزاً جديداً."),
      { code: "OTP_EXPIRED" }
    );
  }
  if (record.otp_code !== code) {
    throw Object.assign(
      new Error("الرمز الذي أدخلته غير صحيح — تحقق منه وأعد المحاولة."),
      { code: "WRONG_OTP" }
    );
  }

  const { error: updateError } = await supabase
    .from(USERS_TABLE)
    .update({ email_verified: true, otp_code: null, otp_expires_at: null })
    .eq("id", record.id);
  if (updateError) throw updateError;

  const { data: full, error: fullError } = await supabase
    .from(USERS_TABLE)
    .select("*")
    .eq("id", record.id)
    .limit(1);
  if (fullError) throw fullError;
  return (full || [])[0] as AppUser;
}

/** إعادة إرسال رمز OTP لدكتور لم يؤكد بريده بعد */
export async function requestOtp(email: string): Promise<{ otp: string }> {
  if (isDemoMode()) {
    return demoApi<{ otp: string }>("request-otp", { email });
  }

  const otp = generateOtpCode();
  const { error } = await supabase
    .from(USERS_TABLE)
    .update({
      otp_code: otp,
      otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    })
    .eq("email", email)
    .eq("role", "professor")
    .eq("email_verified", false);
  if (error) throw error;
  return { otp };
}

/* -------------------------------------------------------------------------- */
/*  طلبات تسجيل الطلاب (موافقة الدكتور)                                        */
/* -------------------------------------------------------------------------- */

/** الطلاب الجدد المنتظرون موافقة الدكتور (الأقدم أولاً) */
export async function fetchPendingStudents(): Promise<AppUser[]> {
  if (isDemoMode()) {
    return demoApi<AppUser[]>("pending-students");
  }

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .select("*")
    .eq("role", "student")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data || []) as AppUser[];
}

/** قبول / رفض طلب تسجيل طالب */
export async function setStudentStatus(
  studentId: string,
  status: Extract<AccountStatus, "approved" | "rejected">
): Promise<void> {
  if (isDemoMode()) {
    await demoApi("set-student-status", { student_id: studentId, status });
    return;
  }

  const { error } = await supabase
    .from(USERS_TABLE)
    .update({ status })
    .eq("id", studentId)
    .eq("role", "student");
  if (error) throw error;
}

/** تحديث صور المستخدم من حسابه (الصورة الشخصية / بطاقة الوش / بطاقة الظهر) */
export async function updateUserPhotos(
  userId: string,
  photos: {
    personal_photo_url?: string;
    id_card_url?: string;
    id_card_back_url?: string;
  }
): Promise<AppUser> {
  if (isDemoMode()) {
    return demoApi<AppUser>("update-user-photos", {
      user_id: userId,
      ...photos,
    });
  }

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .update(photos)
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data as AppUser;
}

/* -------------------------------------------------------------------------- */
/*  الجلسات (لوحة الدكتور)                                                     */
/* -------------------------------------------------------------------------- */

/** جلب جلسة الدكتور المفتوحة + آخر جلسة منتهية */
export async function fetchProfessorSessions(
  professorId: string
): Promise<{ open: SessionRow | null; lastClosed: SessionRow | null }> {
  if (isDemoMode()) {
    return demoApi<{ open: SessionRow | null; lastClosed: SessionRow | null }>(
      "professor-sessions",
      { professor_id: professorId }
    );
  }

  const { data: openSessions, error: openError } = await supabase
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("professor_id", professorId)
    .eq("is_open", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (openError) throw openError;

  const { data: closedSessions, error: closedError } = await supabase
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("professor_id", professorId)
    .eq("is_open", false)
    .order("created_at", { ascending: false })
    .limit(1);
  if (closedError) throw closedError;

  return {
    open: (openSessions && openSessions[0]) || null,
    lastClosed: (closedSessions && closedSessions[0]) || null,
  };
}

/** فتح جلسة حضور جديدة (is_open = true) — مع اسم المادة/المحاضرة اختيارياً */
export async function createSession(params: {
  professor_id: string;
  subject?: string | null;
  lat: number;
  lng: number;
  radius: number;
}): Promise<SessionRow> {
  if (isDemoMode()) {
    return demoApi<SessionRow>("create-session", {
      ...params,
      subject: params.subject ?? null,
      is_open: true,
    });
  }

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .insert({ ...params, subject: params.subject ?? null, is_open: true })
    .select()
    .single();
  if (error) throw error;
  return data as SessionRow;
}

/* -------------------------------------------------------------------------- */
/*  تعديل وحذف الجلسات (دكتورها فقط — تحقق خادمي من الملكية)                     */
/* -------------------------------------------------------------------------- */

/**
 * تعديل بيانات الجلسة المفتوحة: المادة / النطاق / موقع القاعة.
 * تُقبل فقط الجلسة المفتوحة المملوكة لنفس الدكتور — الخادم يرفض غير ذلك.
 */
export async function updateSession(params: {
  session_id: string;
  professor_id: string;
  subject?: string;
  radius?: number;
  lat?: number;
  lng?: number;
}): Promise<SessionRow> {
  if (isDemoMode()) {
    return demoApi<SessionRow>("update-session", params);
  }

  const updates: Record<string, unknown> = {};
  if (typeof params.subject === "string") updates.subject = params.subject || null;
  if (Number.isFinite(params.radius) && (params.radius ?? 0) > 0) {
    updates.radius = params.radius;
  }
  if (Number.isFinite(params.lat) && Number.isFinite(params.lng)) {
    updates.lat = params.lat;
    updates.lng = params.lng;
  }

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update(updates)
    .eq("id", params.session_id)
    .eq("professor_id", params.professor_id)
    .eq("is_open", true)
    .select("*")
    .single();
  if (error) throw error;
  return data as SessionRow;
}

/** حذف جلسة نهائياً مع كل سجلات حضورها — دكتورها فقط */
export async function deleteSession(
  sessionId: string,
  professorId: string
): Promise<{ ok: boolean; removedAttendance: number }> {
  if (isDemoMode()) {
    return demoApi<{ ok: boolean; removedAttendance: number }>("delete-session", {
      session_id: sessionId,
      professor_id: professorId,
    });
  }

  // التحقق من الملكية قبل أي حذف (الصف null يعني جلسة غير موجودة أو ليست له)
  const { data: owned, error: findError } = await supabase
    .from(SESSIONS_TABLE)
    .select("id")
    .eq("id", sessionId)
    .eq("professor_id", professorId)
    .limit(1);
  if (findError) throw findError;
  if (!owned || owned.length === 0) {
    const err = new Error("لا يمكنك حذف جلسة ليست لك.") as Error & { code?: string };
    err.code = "FORBIDDEN";
    throw err;
  }

  // حذف الحضور أولاً (قيد المفتاح الأجنبي) ثم الجلسة
  const { error: attError } = await supabase
    .from(ATTENDANCE_TABLE)
    .delete()
    .eq("session_id", sessionId);
  if (attError) throw attError;

  const { error: sessionError } = await supabase
    .from(SESSIONS_TABLE)
    .delete()
    .eq("id", sessionId)
    .eq("professor_id", professorId);
  if (sessionError) throw sessionError;

  return { ok: true, removedAttendance: -1 };
}

/** سجل جلسات الدكتور السابقة مع عدد الحضور في كل جلسة */
export async function fetchProfessorSessionHistory(
  professorId: string,
  limit = 20
): Promise<SessionHistoryRow[]> {
  if (isDemoMode()) {
    return demoApi<SessionHistoryRow[]>("professor-session-history", {
      professor_id: professorId,
      limit,
    });
  }

  // جلب آخر الجلسات (الأحدث أولاً)
  const { data: sessions, error: sessionsError } = await supabase
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("professor_id", professorId)
    .order("created_at", { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)));
  if (sessionsError) throw sessionsError;

  const rows = (sessions || []) as SessionRow[];
  if (rows.length === 0) return [];

  // عدّ الحضور لكل جلسة دفعة واحدة
  const { data: counts, error: countsError } = await supabase
    .from(ATTENDANCE_TABLE)
    .select("session_id")
    .in("session_id", rows.map((row) => row.id));
  if (countsError) throw countsError;

  const countBySession: Record<string, number> = {};
  for (const row of (counts || []) as { session_id: string }[]) {
    countBySession[row.session_id] = (countBySession[row.session_id] ?? 0) + 1;
  }

  return rows.map((row) => ({
    ...row,
    attendanceCount: countBySession[row.id] ?? 0,
  }));
}

/** ملخّص إحصائيات الطالب: إجمالي الحضور + الإنذارات + آخر حضور */
export async function fetchStudentSummary(
  studentId: string
): Promise<StudentSummary> {
  if (isDemoMode()) {
    return demoApi<StudentSummary>("student-summary", {
      student_id: studentId,
    });
  }

  const [attendanceRes, warningsRes] = await Promise.all([
    supabase
      .from(ATTENDANCE_TABLE)
      .select("created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from(WARNINGS_TABLE)
      .select("id")
      .eq("student_id", studentId),
  ]);

  if (attendanceRes.error) throw attendanceRes.error;

  let warnings = 0;
  // جدول الإنذارات قد لا يكون منشأً بعد في المخطط القديم — يُهمل بلطف
  try {
    if (warningsRes.error) throw warningsRes.error;
    warnings = (warningsRes.data || []).length;
  } catch (error) {
    if ((error as Error & { code?: string }).code !== "42P01") throw error;
  }

  const attendanceRows = (attendanceRes.data || []) as { created_at: string }[];
  return {
    totalAttended: attendanceRows.length,
    warnings,
    lastAttendedAt: attendanceRows[0]?.created_at ?? null,
  };
}

/** إنهاء الجلسة (is_open = false) */
export async function closeSession(sessionId: string): Promise<void> {
  if (isDemoMode()) {
    await demoApi("close-session", { session_id: sessionId });
    return;
  }

  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ is_open: false })
    .eq("id", sessionId);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/*  الحضور                                                                     */
/* -------------------------------------------------------------------------- */

/** جلب سجلات حضور جلسة معينة (الأحدث أولاً) */
export async function fetchAttendance(
  sessionId: string
): Promise<AttendanceRow[]> {
  if (isDemoMode()) {
    return demoApi<AttendanceRow[]>("attendance", { session_id: sessionId });
  }

  const { data, error } = await supabase
    .from(ATTENDANCE_TABLE)
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as AttendanceRow[];
}

/** تسجيل حضور طالب (يرمي 23505 عند التكرار — في الوضعين)
 *  الإحداثيات تُرسل للخادم ليُتحقق منها جغرافياً (Haversine) قبل القبول */
export async function insertAttendance(params: {
  session_id: string;
  student_id: string;
  student_name: string;
  university_id: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
}): Promise<AttendanceRow | null> {
  if (isDemoMode()) {
    return demoApi<AttendanceRow | null>("check-in", {
      ...params,
      lat: params.lat,
      lng: params.lng,
      accuracy: params.accuracy,
    });
  }

  // وضع Supabase: أعمدة الجدول فقط — التحقق الجغرافي الخادمي يجري في وضع
  // الإنتاج عبر Edge Function/RLS، أما الوضع التجريبي فيتحقق كاملاً أعلاه
  const { error } = await supabase.from(ATTENDANCE_TABLE).insert({
    session_id: params.session_id,
    student_id: params.student_id,
    student_name: params.student_name,
    university_id: params.university_id,
  });
  if (error) throw error;
  return null;
}

/* -------------------------------------------------------------------------- */
/*  ربط الحساب بالجهاز (طلبات النقل + قرارات الدكتور)                           */
/* -------------------------------------------------------------------------- */

/**
 * طلب ربط جهاز جديد بحساب طالب — يُرسل بعد رفض الدخول بـ DEVICE_MISMATCH.
 * لا يمنح الدخول: ينشئ طلباً معلّقاً يظهر للدكتور في لوحته.
 */
export async function requestDeviceTransfer(params: {
  email: string;
  university_id: string;
  device_id: string;
}): Promise<{ ok: boolean; pending: boolean }> {
  if (isDemoMode()) {
    return demoApi<{ ok: boolean; pending: boolean }>(
      "request-device-transfer",
      params
    );
  }

  // وضع Supabase: نعثر على المستخدم ببياناته ثم ندرج الطلب في device_requests
  const { data: userRows, error: findError } = await supabase
    .from(USERS_TABLE)
    .select("id")
    .eq("email", params.email)
    .eq("university_id", params.university_id)
    .limit(1);
  if (findError) throw findError;
  if (!userRows || userRows.length === 0) {
    const error = new Error("بيانات الحساب غير صحيحة.") as Error & { code?: string };
    error.code = "NOT_FOUND";
    throw error;
  }

  const { error } = await supabase.from("device_requests").insert({
    user_id: userRows[0].id,
    device_id: params.device_id,
  });
  if (error) throw error;
  return { ok: true, pending: false };
}

/** جلب طلبات ربط الأجهزة المعلّقة (لوحة الدكتور) */
export async function fetchDeviceRequests(): Promise<DeviceRequestRow[]> {
  if (isDemoMode()) {
    return demoApi<DeviceRequestRow[]>("device-requests", {});
  }

  const { data, error } = await supabase
    .from("device_requests")
    .select("*, student:users!device_requests_user_id_fkey(id, full_name, university_id, email, personal_photo_url)")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data || []) as unknown as DeviceRequestRow[];
}

/** قرار الدكتور في طلب ربط جهاز — الموافقة تنقل الحساب للجهاز الجديد فوراً */
export async function resolveDeviceRequest(params: {
  professor_id: string;
  request_id: string;
  approve: boolean;
}): Promise<{ ok: boolean }> {
  if (isDemoMode()) {
    return demoApi<{ ok: boolean }>("resolve-device-request", params);
  }

  // وضع Supabase: RPC المطلوب تعريفه في schema.sql (resolve_device_request)
  const { error } = await supabase.rpc("resolve_device_request", params);
  if (error) throw error;
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  الحظر والإنذارات وإحصائيات الطلاب (لوحة الدكتور)                            */
/* -------------------------------------------------------------------------- */

/** جلب جلسة بالمعرف (للتحقق منها قبل تسجيل الحضور) */
export async function fetchSessionById(
  sessionId: string
): Promise<SessionRow | null> {
  if (isDemoMode()) {
    return demoApi<SessionRow | null>("get-session", { session_id: sessionId });
  }

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("id", sessionId)
    .limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

/** جلب ملفات الطلاب (الإيميل الجامعي + صورة البطاقة) عبر معرفاتهم */
export async function fetchStudentProfiles(
  studentIds: string[]
): Promise<AppUser[]> {
  if (studentIds.length === 0) return [];

  if (isDemoMode()) {
    return demoApi<AppUser[]>("student-profiles", { student_ids: studentIds });
  }

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .select("*")
    .in("id", studentIds);
  if (error) throw error;
  return (data || []) as AppUser[];
}

/**
 * جلب إحصائيات حضور الطلاب لدى دكتور معين:
 * عدد الحضور / الغياب / الإنذارات / قائمة المحظورين.
 */
export async function fetchProfessorStats(
  professorId: string
): Promise<ProfessorRosterStats> {
  if (isDemoMode()) {
    return demoApi<ProfessorRosterStats>("professor-stats", {
      professor_id: professorId,
    });
  }

  // جلسات الدكتور (المعرف + حالة الفتح)
  const { data: sessions, error: sessionsError } = await supabase
    .from(SESSIONS_TABLE)
    .select("id,is_open")
    .eq("professor_id", professorId);
  if (sessionsError) throw sessionsError;

  const sessionList = (sessions || []) as { id: string; is_open: boolean }[];
  const sessionIds = sessionList.map((row) => row.id);
  const closedIds = new Set(
    sessionList.filter((row) => !row.is_open).map((row) => row.id)
  );

  // سجلات حضور تلك الجلسات
  let attRows: { student_id: string; session_id: string }[] = [];
  if (sessionIds.length > 0) {
    const { data: rows, error: attError } = await supabase
      .from(ATTENDANCE_TABLE)
      .select("student_id,session_id")
      .in("session_id", sessionIds);
    if (attError) throw attError;
    attRows = (rows || []) as { student_id: string; session_id: string }[];
  }

  const attendedByStudent: Record<string, number> = {};
  const closedAttendedByStudent: Record<string, number> = {};
  for (const row of attRows) {
    attendedByStudent[row.student_id] =
      (attendedByStudent[row.student_id] ?? 0) + 1;
    if (closedIds.has(row.session_id)) {
      closedAttendedByStudent[row.student_id] =
        (closedAttendedByStudent[row.student_id] ?? 0) + 1;
    }
  }

  // الإنذارات (تُهمل بلطف إذا كان المخطط القديم بدون الجدولين الجديدين)
  const warningsByStudent: Record<string, number> = {};
  try {
    const { data: warnings, error: warningsError } = await supabase
      .from(WARNINGS_TABLE)
      .select("student_id")
      .eq("professor_id", professorId);
    if (warningsError) throw warningsError;
    for (const row of (warnings || []) as { student_id: string }[]) {
      warningsByStudent[row.student_id] =
        (warningsByStudent[row.student_id] ?? 0) + 1;
    }
  } catch (error) {
    if ((error as Error & { code?: string }).code !== "42P01") throw error;
  }

  let blockedIds: string[] = [];
  try {
    const { data: blocked, error: blockedError } = await supabase
      .from(BLOCKED_TABLE)
      .select("student_id")
      .eq("professor_id", professorId);
    if (blockedError) throw blockedError;
    blockedIds = ((blocked || []) as { student_id: string }[]).map(
      (row) => row.student_id
    );
  } catch (error) {
    if ((error as Error & { code?: string }).code !== "42P01") throw error;
  }

  return {
    totalSessions: sessionList.length,
    totalClosedSessions: closedIds.size,
    attendedByStudent,
    closedAttendedByStudent,
    warningsByStudent,
    blockedIds,
  };
}

/** حظر طالب (فصله من المادة) — لن يستطيع تسجيل الحضور في جلسات هذا الدكتور */
export async function blockStudent(
  professorId: string,
  studentId: string
): Promise<void> {
  if (isDemoMode()) {
    await demoApi("block-student", {
      professor_id: professorId,
      student_id: studentId,
    });
    return;
  }

  const { error } = await supabase.from(BLOCKED_TABLE).upsert(
    { professor_id: professorId, student_id: studentId },
    { onConflict: "professor_id,student_id" }
  );
  if (error) throw error;
}

/** فك الحظر عن طالب */
export async function unblockStudent(
  professorId: string,
  studentId: string
): Promise<void> {
  if (isDemoMode()) {
    await demoApi("unblock-student", {
      professor_id: professorId,
      student_id: studentId,
    });
    return;
  }

  const { error } = await supabase
    .from(BLOCKED_TABLE)
    .delete()
    .eq("professor_id", professorId)
    .eq("student_id", studentId);
  if (error) throw error;
}

/** تسجيل إنذار على طالب */
export async function warnStudent(
  professorId: string,
  studentId: string,
  reason?: string
): Promise<void> {
  if (isDemoMode()) {
    await demoApi("warn-student", {
      professor_id: professorId,
      student_id: studentId,
      reason: reason ?? null,
    });
    return;
  }

  const { error } = await supabase
    .from(WARNINGS_TABLE)
    .insert({ professor_id: professorId, student_id: studentId, reason: reason ?? null });
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/*  تعديل وحذف سجلات الحضور والإنذارات (دكتور الجلسة فقط — تحقق خادمي)           */
/* -------------------------------------------------------------------------- */

/** تحويل حالة حضور الطالب (حاضر ↔ متأخر) — دكتور الجلسة فقط */
export async function updateAttendanceStatus(
  attendanceId: string,
  professorId: string,
  status: "present" | "late"
): Promise<AttendanceRow> {
  if (isDemoMode()) {
    return demoApi<AttendanceRow>("update-attendance-status", {
      attendance_id: attendanceId,
      professor_id: professorId,
      status,
    });
  }

  // التحقق من الملكية: الحضور → الجلسة → الدكتور
  const { data: record, error: findError } = await supabase
    .from(ATTENDANCE_TABLE)
    .select("id, session_id")
    .eq("id", attendanceId)
    .limit(1);
  if (findError) throw findError;
  if (!record || record.length === 0) {
    const err = new Error("سجل الحضور غير موجود.") as Error & { code?: string };
    err.code = "NOT_FOUND";
    throw err;
  }
  const { data: session, error: sessionError } = await supabase
    .from(SESSIONS_TABLE)
    .select("professor_id")
    .eq("id", record[0].session_id)
    .limit(1);
  if (sessionError) throw sessionError;
  if (!session || session[0]?.professor_id !== professorId) {
    const err = new Error("لا يمكنك تعديل حضور جلسة ليست لك.") as Error & { code?: string };
    err.code = "FORBIDDEN";
    throw err;
  }

  const { data, error } = await supabase
    .from(ATTENDANCE_TABLE)
    .update({ status })
    .eq("id", attendanceId)
    .select("*")
    .single();
  if (error) throw error;
  return data as AttendanceRow;
}

/** حذف سجل حضور نهائياً — دكتور الجلسة فقط (مع إشعار الطالب خادمياً في وضع Demo) */
export async function deleteAttendance(
  attendanceId: string,
  professorId: string
): Promise<{ ok: boolean }> {
  if (isDemoMode()) {
    return demoApi<{ ok: boolean }>("delete-attendance", {
      attendance_id: attendanceId,
      professor_id: professorId,
    });
  }

  // التحقق من الملكية ثم الحذف
  const { data: record, error: findError } = await supabase
    .from(ATTENDANCE_TABLE)
    .select("id, session_id")
    .eq("id", attendanceId)
    .limit(1);
  if (findError) throw findError;
  if (!record || record.length === 0) {
    const err = new Error("سجل الحضور غير موجود.") as Error & { code?: string };
    err.code = "NOT_FOUND";
    throw err;
  }
  const { data: session, error: sessionError } = await supabase
    .from(SESSIONS_TABLE)
    .select("professor_id")
    .eq("id", record[0].session_id)
    .limit(1);
  if (sessionError) throw sessionError;
  if (!session || session[0]?.professor_id !== professorId) {
    const err = new Error("لا يمكنك حذف حضور جلسة ليست لك.") as Error & { code?: string };
    err.code = "FORBIDDEN";
    throw err;
  }

  const { error } = await supabase
    .from(ATTENDANCE_TABLE)
    .delete()
    .eq("id", attendanceId);
  if (error) throw error;
  return { ok: true };
}

/** حذف إنذار نهائياً — الدكتور الذي سجّله فقط */
export async function deleteWarning(
  warningId: string,
  professorId: string
): Promise<{ ok: boolean }> {
  if (isDemoMode()) {
    return demoApi<{ ok: boolean }>("delete-warning", {
      warning_id: warningId,
      professor_id: professorId,
    });
  }

  const { error } = await supabase
    .from(WARNINGS_TABLE)
    .delete()
    .eq("id", warningId)
    .eq("professor_id", professorId);
  if (error) throw error;
  return { ok: true };
}

/** إنذارات طالب معين عند دكتور معين — لعرضها في ملف الطالب */
export async function fetchStudentWarnings(
  professorId: string,
  studentId: string
): Promise<WarningRow[]> {
  if (isDemoMode()) {
    return demoApi<WarningRow[]>("student-warnings", {
      professor_id: professorId,
      student_id: studentId,
    });
  }

  const { data, error } = await supabase
    .from(WARNINGS_TABLE)
    .select("*")
    .eq("professor_id", professorId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []) as WarningRow[];
}

/** هل الطالب محظور لدى هذا الدكتور؟ */
export async function isStudentBlocked(
  professorId: string,
  studentId: string
): Promise<boolean> {
  if (isDemoMode()) {
    return demoApi<boolean>("is-blocked", {
      professor_id: professorId,
      student_id: studentId,
    });
  }

  try {
    const { data, error } = await supabase
      .from(BLOCKED_TABLE)
      .select("id")
      .eq("professor_id", professorId)
      .eq("student_id", studentId)
      .limit(1);
    if (error) throw error;
    return Boolean(data && data.length > 0);
  } catch (error) {
    if ((error as Error & { code?: string }).code === "42P01") return false;
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*  إحصائيات الطالب + الحالة الذكية (تُحسب خادمياً بالكامل)                      */
/* -------------------------------------------------------------------------- */

/**
 * إحصائيات الطالب الكاملة: نسبة الحضور + present/late/absent + الحالة الذكية.
 * كل الحساب يتم على الخادم — لا تُقبل أي قيم من الواجهة.
 */
export async function fetchStudentStats(
  studentId: string
): Promise<StudentStats> {
  if (isDemoMode()) {
    return demoApi<StudentStats>("student-stats", {
      student_id: studentId,
    });
  }

  // Supabase: نفس المنطق عبر دالة RPC (student_stats) في المخطط المحدّث
  const { data, error } = await supabase.rpc("student_stats", {
    p_student_id: studentId,
  });
  if (error) throw error;
  return data as StudentStats;
}

/* -------------------------------------------------------------------------- */
/*  الجدول الدراسي                                                              */
/* -------------------------------------------------------------------------- */

/**
 * جدول المحاضرات مع الحالة اللحظية (current/upcoming/finished).
 * يُمرر وقت العميل لضمان دقة الحالة حسب منطقته الزمنية.
 */
export async function fetchSchedule(): Promise<ScheduleRow[]> {
  if (isDemoMode()) {
    return demoApi<ScheduleRow[]>("schedule", {
      now: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase
    .from("schedule")
    .select("*, users(full_name)")
    .order("day_of_week", { ascending: true })
    .order("start_minutes", { ascending: true });
  if (error) throw error;

  // حساب الحالة على العميل من البيانات الخام (Supabase mode)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return ((data || []) as unknown as Array<ScheduleRow & { users?: { full_name: string | null } }>).map(
    (row) => {
      let status: ScheduleRow["status"] = "upcoming";
      let minutesUntilStart: number | null = null;
      if (row.day_of_week === dayOfWeek) {
        if (currentMinutes >= row.end_minutes) status = "finished";
        else if (currentMinutes >= row.start_minutes) status = "current";
        else minutesUntilStart = row.start_minutes - currentMinutes;
      }
      return {
        ...row,
        professor_name: row.users?.full_name ?? null,
        status,
        minutes_until_start: minutesUntilStart,
      };
    }
  );
}

/* -------------------------------------------------------------------------- */
/*  الإشعارات                                                                   */
/* -------------------------------------------------------------------------- */

/** جلب إشعارات المستخدم (الأحدث أولاً — حتى 30) مع توليد إشعارات المحاضرات القادمة */
export async function fetchNotifications(
  userId: string
): Promise<NotificationRow[]> {
  if (isDemoMode()) {
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return demoApi<NotificationRow[]>("notifications", {
      user_id: userId,
      now: now.toISOString(),
      local_date: localDate,
    });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []) as NotificationRow[];
}

/** عدد الإشعارات غير المقروءة (لاستقصاء خفيف للجرس) */
export async function fetchUnreadNotificationCount(
  userId: string
): Promise<number> {
  if (isDemoMode()) {
    return demoApi<number>("notifications-unread-count", {
      user_id: userId,
    });
  }

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}

/** تحديد إشعار واحد كمقروء */
export async function markNotificationRead(id: string): Promise<void> {
  if (isDemoMode()) {
    await demoApi("mark-notification-read", { id });
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id);
  if (error) throw error;
}

/** تحديد كل إشعارات المستخدم كمقروءة */
export async function markAllNotificationsRead(
  userId: string
): Promise<void> {
  if (isDemoMode()) {
    await demoApi("mark-notifications-read", { user_id: userId });
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
}

/** حذف إشعار واحد — صاحبه فقط (تطابق user_id) */
export async function deleteNotification(
  id: string,
  userId: string
): Promise<void> {
  if (isDemoMode()) {
    await demoApi("delete-notification", { id, user_id: userId });
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

/** حذف كل إشعارات المستخدم — صاحبها فقط */
export async function clearNotifications(userId: string): Promise<void> {
  if (isDemoMode()) {
    await demoApi("clear-notifications", { user_id: userId });
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/*  الأنشطة المشبوهة                                                            */
/* -------------------------------------------------------------------------- */

/** سجل الأنشطة المشبوهة (للوحة الدكتور) — الأحدث أولاً */
export async function fetchSuspiciousEvents(
  limit = 30
): Promise<SuspiciousEventRow[]> {
  if (isDemoMode()) {
    return demoApi<SuspiciousEventRow[]>("suspicious-events", { limit });
  }

  const { data, error } = await supabase
    .from("suspicious_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as SuspiciousEventRow[];
}

/* -------------------------------------------------------------------------- */
/*  الجلسات المفتوحة (لوحة الطالب)                                             */
/* -------------------------------------------------------------------------- */

/** الجلسات المفتوحة حالياً مع اسم الدكتور (عبر users(full_name)) */
export async function fetchOpenSessions(): Promise<SessionRow[]> {
  if (isDemoMode()) {
    return demoApi<SessionRow[]>("open-sessions");
  }

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select("*, users(full_name)")
    .eq("is_open", true)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data || []) as unknown as SessionRow[];
}

/** حالات حضور الطالب في الجلسات المفتوحة: خريطة session_id → status (present/late) */
export type AttendedStatusMap = Record<string, string>;

export async function fetchAttendedSessionStatuses(
  studentId: string,
  sessionIds: string[]
): Promise<AttendedStatusMap> {
  if (sessionIds.length === 0) return {};

  if (isDemoMode()) {
    const rows = await demoApi<{ session_id: string; status: string }[]>(
      "attended-ids",
      {
        student_id: studentId,
        session_ids: sessionIds,
      }
    );
    const map: AttendedStatusMap = {};
    for (const row of rows) map[row.session_id] = row.status;
    return map;
  }

  const { data, error } = await supabase
    .from(ATTENDANCE_TABLE)
    .select("session_id, status")
    .eq("student_id", studentId)
    .in("session_id", sessionIds);
  if (error) throw error;
  const map: AttendedStatusMap = {};
  for (const row of (data || []) as { session_id: string; status: string }[]) {
    map[row.session_id] = row.status;
  }
  return map;
}

/** سجل حضور الطالب مع تفاصيل الجلسة والدكتور (sessions -> users) */
export async function fetchStudentHistory(
  studentId: string
): Promise<HistoryRowData[]> {
  if (isDemoMode()) {
    return demoApi<HistoryRowData[]>("history", { student_id: studentId });
  }

  const { data, error } = await supabase
    .from(ATTENDANCE_TABLE)
    .select(
      "id, session_id, student_id, student_name, university_id, created_at, sessions(created_at, radius, subject, users(full_name))"
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []) as unknown as HistoryRowData[];
}

/* -------------------------------------------------------------------------- */
/*  الاشتراك اللحظي (Realtime)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * اشتراك الدكتور في حضور جلسته:
 *  - Supabase : postgres_changes على INSERT في جدول attendance.
 *  - تجريبي   : تحديث دوري كل 3 ثوانٍ يستبدل القائمة كاملة.
 * ترجع دالة إلغاء الاشتراك.
 */
export function subscribeAttendanceUpdates(
  sessionId: string,
  handlers: {
    /** الوضع التجريبي: استبدال القائمة كاملة */
    onRows: (rows: AttendanceRow[]) => void;
    /** Supabase Realtime: إلحاق صف جديد */
    onAppend: (row: AttendanceRow) => void;
    onStatus: (status: RealtimeStatus) => void;
  }
): () => void {
  if (isDemoMode()) {
    let stopped = false;
    handlers.onStatus("live");

    const poll = async () => {
      if (stopped || typeof document === "undefined") return;
      if (document.visibilityState === "hidden") return;
      try {
        const rows = await fetchAttendance(sessionId);
        if (!stopped) handlers.onRows(rows);
      } catch {
        /* تجاهل أخطاء الاستقصاء الفردي */
      }
    };

    void poll();
    const intervalId = window.setInterval(poll, 3000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }

  handlers.onStatus("connecting");

  const channel = supabase
    .channel(`professor-attendance-${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: ATTENDANCE_TABLE,
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        handlers.onAppend(payload.new as AttendanceRow);
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") handlers.onStatus("live");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        handlers.onStatus("error");
      else handlers.onStatus("connecting");
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * اشتراك الطالب في تغيّرات الجلسات (فتح/إنهاء):
 *  - Supabase : postgres_changes على INSERT/UPDATE في جدول sessions.
 *  - تجريبي   : تحديث دوري كل 3 ثوانٍ.
 * ترجع دالة إلغاء الاشتراك.
 */
export function subscribeSessionUpdates(onChange: () => void): () => void {
  if (isDemoMode()) {
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden")
        return;
      onChange();
    };
    const intervalId = window.setInterval(tick, 3000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }

  const channel = supabase
    .channel("student-sessions-live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: SESSIONS_TABLE },
      () => onChange()
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: SESSIONS_TABLE },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
