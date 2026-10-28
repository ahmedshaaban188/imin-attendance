/**
 * ============================================================================
 *  ImIn | قاعدة البيانات التجريبية (وضع Demo بدون Supabase) — النسخة المطوّرة
 * ============================================================================
 *  تعمل هذه الوحدة على السيرفر فقط (تُستخدم من /api/demo) وتوفّر سلوك
 *  جداول Supabase (users / sessions / attendance / notifications / schedule /
 *  suspicious_events / config) فوق ملف JSON محلي يُحفظ في data/imin-demo.json.
 *
 *  الجديد في هذه النسخة:
 *  - سجلات الحضور تحمل status (present|late) يحددها الخادم حسب مهلة السماح
 *    (grace_minutes) و check_in_time بالثانية — العميل لا يحدد الحالة إطلاقاً.
 *  - قيد فريد فعلي على (session_id, student_id) لمنع تكرار الحضور.
 *  - نظام إشعارات كامل (notifications) مع توليد تلقائي للأحداث.
 *  - جدول محاضرات (schedule) بحالات لحظية تُحسب من وقت العميل الحقيقي.
 *  - كشف أنشطة مشبوهة (suspicious_events) مع Rate-limiting خادمي.
 *  - دخول الدكتور ببريده ورقمه الوظيفي وبريد مؤكد (OTP) — إعادة ربط جهاز
 *    جديد تُسجّل تدقيقياً في الأنشطة المشبوهة (device_rebound).
 *  - عتبات الحالة الذكية (warning/critical) قابلة للتعديل من config.
 * ============================================================================
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { haversineDistance } from "./geo";

/* -------------------------------------------------------------------------- */
/*  الأنواع (مطابقة لمخطط supabase/schema.sql المحدّث)                         */
/* -------------------------------------------------------------------------- */

interface DemoUser {
  id: string;
  full_name: string;
  email: string;
  university_id: string;
  role: "student" | "professor";
  id_card_url: string | null;
  id_card_back_url: string | null;
  personal_photo_url: string | null;
  subject: string | null;
  status: "pending" | "approved" | "rejected";
  email_verified: boolean;
  otp_code: string | null;
  otp_expires_at: string | null;
  /** بيانات أكاديمية (تظهر في البطاقة الرقمية للطالب) */
  faculty: string | null;
  program: string | null;
  academic_year: string | null;
  /** معرّف الجهاز المرتبط بالحساب — حماية من مشاركة بيانات الدخول */
  device_id: string | null;
  /** متى رُبط الحساب بهذا الجهاز (آخر ربط) */
  device_linked_at: string | null;
  created_at: string;
}

/** طلب ربط جهاز جديد بحساب طالب — يوافق عليه الدكتور من لوحته */
interface DemoDeviceRequest {
  id: string;
  user_id: string;
  /** الجهاز الجديد الذي يريد الطالب ربطه بحسابه */
  device_id: string;
  created_at: string;
}

interface DemoSession {
  id: string;
  professor_id: string;
  subject: string | null;
  lat: number;
  lng: number;
  radius: number;
  is_open: boolean;
  created_at: string;
}

interface DemoAttendance {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  university_id: string;
  /** حاضر أم متأخر — يحددها الخادم فقط */
  status: "present" | "late";
  /** وقت تسجيل الحضور الدقيق (ISO بالثانية) */
  check_in_time: string;
  created_at: string;
}

interface DemoBlocked {
  id: string;
  professor_id: string;
  student_id: string;
  created_at: string;
}

interface DemoWarning {
  id: string;
  professor_id: string;
  student_id: string;
  reason: string | null;
  created_at: string;
}

interface DemoNotification {
  id: string;
  user_id: string;
  type: string;
  params: Record<string, string | number>;
  read: boolean;
  created_at: string;
}

interface DemoSchedule {
  id: string;
  professor_id: string;
  /** 0=الأحد ... 6=السبت */
  day_of_week: number;
  /** دقائق من منتصف الليل (توقيت الطالب المحلي) */
  start_minutes: number;
  end_minutes: number;
  subject: string;
  room: string | null;
  created_at: string;
}

interface DemoSuspiciousEvent {
  id: string;
  event_type: string;
  actor_name: string | null;
  university_id: string | null;
  session_id: string | null;
  reason: string | null;
  created_at: string;
}

interface DemoConfig {
  /** دقائق السماح قبل اعتبار الحضور «متأخراً» */
  grace_minutes: number;
  /** نسبة الحضور التي تبدأ عندها حالة التحذير */
  warning_threshold: number;
  /** نسبة الحضور التي تبدأ عندها حالة الخطر */
  critical_threshold: number;
}

interface DemoDb {
  users: DemoUser[];
  sessions: DemoSession[];
  attendance: DemoAttendance[];
  blocked: DemoBlocked[];
  warnings: DemoWarning[];
  notifications: DemoNotification[];
  schedule: DemoSchedule[];
  suspicious_events: DemoSuspiciousEvent[];
  device_requests: DemoDeviceRequest[];
  config: DemoConfig;
}

/* -------------------------------------------------------------------------- */
/*  التحميل والحفظ (ملف JSON يبقى بعد إعادة تشغيل سيرفر التطوير)               */
/* -------------------------------------------------------------------------- */

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "imin-demo.json");

const DEFAULT_CONFIG: DemoConfig = {
  grace_minutes: 15,
  warning_threshold: 75,
  critical_threshold: 60,
};

function normalizeUser(user: Record<string, unknown>): DemoUser {
  return {
    id: String(user.id ?? ""),
    full_name: String(user.full_name ?? ""),
    email: String(user.email ?? "").toLowerCase(),
    university_id: String(user.university_id ?? ""),
    role: user.role === "professor" ? "professor" : "student",
    id_card_url: typeof user.id_card_url === "string" ? user.id_card_url : null,
    id_card_back_url: typeof user.id_card_back_url === "string" ? user.id_card_back_url : null,
    personal_photo_url: typeof user.personal_photo_url === "string" ? user.personal_photo_url : null,
    subject: typeof user.subject === "string" ? user.subject : null,
    status:
      user.status === "pending" || user.status === "rejected" || user.status === "approved"
        ? user.status
        : "approved",
    email_verified: typeof user.email_verified === "boolean" ? user.email_verified : true,
    otp_code: typeof user.otp_code === "string" ? user.otp_code : null,
    otp_expires_at: typeof user.otp_expires_at === "string" ? user.otp_expires_at : null,
    faculty: typeof user.faculty === "string" ? user.faculty : null,
    program: typeof user.program === "string" ? user.program : null,
    academic_year: typeof user.academic_year === "string" ? user.academic_year : null,
    device_id: typeof user.device_id === "string" && user.device_id ? user.device_id : null,
    device_linked_at:
      typeof user.device_linked_at === "string" ? user.device_linked_at : null,
    created_at: String(user.created_at ?? new Date().toISOString()),
  };
}

/** ترحيل سجلات الحضور القديمة: إضافة status و check_in_time */
function normalizeAttendance(row: Record<string, unknown>): DemoAttendance {
  return {
    id: String(row.id ?? ""),
    session_id: String(row.session_id ?? ""),
    student_id: String(row.student_id ?? ""),
    student_name: String(row.student_name ?? ""),
    university_id: String(row.university_id ?? ""),
    status: row.status === "late" ? "late" : "present",
    check_in_time:
      typeof row.check_in_time === "string" ? row.check_in_time : String(row.created_at ?? new Date().toISOString()),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function emptyDb(): DemoDb {
  return {
    users: [],
    sessions: [],
    attendance: [],
    blocked: [],
    warnings: [],
    notifications: [],
    schedule: [],
    suspicious_events: [],
    device_requests: [],
    config: { ...DEFAULT_CONFIG },
  };
}

function loadDb(): DemoDb {
  try {
    if (!existsSync(DATA_FILE)) {
      return emptyDb();
    }
    const parsed = JSON.parse(readFileSync(DATA_FILE, "utf8"));
    const db: DemoDb = {
      users: Array.isArray(parsed?.users) ? parsed.users.map(normalizeUser) : [],
      sessions: Array.isArray(parsed?.sessions) ? parsed.sessions : [],
      attendance: Array.isArray(parsed?.attendance) ? parsed.attendance.map(normalizeAttendance) : [],
      blocked: Array.isArray(parsed?.blocked) ? parsed.blocked : [],
      warnings: Array.isArray(parsed?.warnings) ? parsed.warnings : [],
      notifications: Array.isArray(parsed?.notifications) ? parsed.notifications : [],
      schedule: Array.isArray(parsed?.schedule) ? parsed.schedule : [],
      suspicious_events: Array.isArray(parsed?.suspicious_events) ? parsed.suspicious_events : [],
      device_requests: Array.isArray(parsed?.device_requests)
        ? parsed.device_requests.filter(
            (row: Record<string, unknown>) =>
              row && typeof row.id === "string" && typeof row.user_id === "string" && typeof row.device_id === "string"
          )
        : [],
      config: {
        ...DEFAULT_CONFIG,
        ...(parsed?.config && typeof parsed.config === "object"
          ? {
              grace_minutes: Number(parsed.config.grace_minutes) || DEFAULT_CONFIG.grace_minutes,
              warning_threshold: Number(parsed.config.warning_threshold) || DEFAULT_CONFIG.warning_threshold,
              critical_threshold: Number(parsed.config.critical_threshold) || DEFAULT_CONFIG.critical_threshold,
            }
          : {}),
      },
    };
    seedScheduleIfEmpty(db);
    return db;
  } catch {
    return emptyDb();
  }
}

/**
 * بذر جدول المحاضرات عند أول تشغيل — يُنشأ من مواد الدكاترة المسجلين
 * بفترات زمنية واقعية حتى تظهر الحالات اللحظية (جارية/قادمة/منتهية).
 */
function seedScheduleIfEmpty(db: DemoDb): void {
  if (db.schedule.length > 0) return;
  const professors = db.users.filter((user) => user.role === "professor");
  if (professors.length === 0) return;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const professor of professors) {
    const subject = professor.subject || "محاضرة";
    const entries: Array<[number, number]> =
      dayOfWeek >= 0 && dayOfWeek <= 4
        ? [
            [9 * 60, 11 * 60],
            [12 * 60, 14 * 60],
            [15 * 60, 17 * 60],
            [18 * 60, 20 * 60],
          ]
        : [
            [10 * 60, 12 * 60],
            [13 * 60, 15 * 60],
          ];

    entries.forEach(([start, end], index) => {
      // في يوم اليوم الحالي: اجعل إحدى الفترات «جارية الآن» عند الإمكان
      // عبر إزاحة الفترات لتحيط بالوقت الحالي — بشرط بقاء الترتيب منطقياً
      let adjustedStart = start;
      let adjustedEnd = end;
      if (index === 2) {
        adjustedStart = Math.max(6 * 60, Math.min(22 * 60, currentMinutes - 20));
        adjustedEnd = Math.min(23 * 60, adjustedStart + 110);
      }
      db.schedule.push({
        id: randomUUID(),
        professor_id: professor.id,
        day_of_week: dayOfWeek,
        start_minutes: adjustedStart,
        end_minutes: adjustedEnd,
        subject,
        room: `A-${101 + index}`,
        created_at: new Date().toISOString(),
      });
    });

    // بقية أيام الأسبوع الدراسية (الأحد-الخميس) بفترتين ثابتتين
    for (let day = 0; day <= 4; day++) {
      if (day === dayOfWeek) continue;
      db.schedule.push(
        {
          id: randomUUID(),
          professor_id: professor.id,
          day_of_week: day,
          start_minutes: 9 * 60,
          end_minutes: 11 * 60,
          subject,
          room: "A-101",
          created_at: new Date().toISOString(),
        },
        {
          id: randomUUID(),
          professor_id: professor.id,
          day_of_week: day,
          start_minutes: 12 * 60,
          end_minutes: 14 * 60,
          subject,
          room: "B-204",
          created_at: new Date().toISOString(),
        }
      );
    }
  }
}

let db: DemoDb = loadDb();

/** آخر mtime معروف للملف — لاكتشاف التعديلات الخارجية (سكريبت reset) */
let knownMtimeMs = statMtime();

function statMtime(): number {
  try {
    return statSync(DATA_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

function syncFromFileIfChanged(): void {
  const mtime = statMtime();
  if (mtime !== knownMtimeMs) {
    knownMtimeMs = mtime;
    db = loadDb();
  }
}

function saveDb() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (error) {
    console.warn("ImIn demo store: تعذر حفظ ملف البيانات التجريبية", error);
  }
}

/* -------------------------------------------------------------------------- */
/*  أدوات مساعدة                                                              */
/* -------------------------------------------------------------------------- */

/** خطأ نطاقي يحمل رمزاً (مثل 23505 للتكرار) كما تفعل أخطاء Postgres/Supabase */
function fail(message: string, code?: string): never {
  const error = new Error(message) as Error & { code?: string };
  if (code) error.code = code;
  throw error;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function byNewest<T extends { created_at: string }>(a: T, b: T): number {
  return b.created_at.localeCompare(a.created_at);
}

function sessionWithProfessor(session: DemoSession) {
  const professor = db.users.find((user) => user.id === session.professor_id);
  return {
    ...session,
    users: { full_name: professor?.full_name ?? null },
  };
}

/** نسخة عامة من المستخدم — بدون أسرار OTP */
function publicUser(user: DemoUser): Omit<DemoUser, "otp_code" | "otp_expires_at"> {
  const { otp_code: _otpCode, otp_expires_at: _otpExpires, ...safe } = user;
  return safe;
}

function generateOtp(): { code: string; expiresAt: string } {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return { code, expiresAt };
}

/* -------------------------------------------------------------------------- */
/*  الإشعارات (توليد + قراءة) — نصوص الواجهة تُترجم عند العميل حسب اللغة        */
/* -------------------------------------------------------------------------- */

function notify(
  userId: string,
  type: string,
  params: Record<string, string | number> = {}
): void {
  db.notifications.push({
    id: randomUUID(),
    user_id: userId,
    type,
    params,
    read: false,
    created_at: new Date().toISOString(),
  });
}

/** إشعار لكل الطلاب المقبولين (فتح جلسة مثلاً) */
function notifyAllApprovedStudents(type: string, params: Record<string, string | number>): void {
  for (const student of db.users) {
    if (student.role === "student" && student.status === "approved") {
      notify(student.id, type, params);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  الأنشطة المشبوهة + الحد من المحاولات (Rate limiting) — في الذاكرة           */
/* -------------------------------------------------------------------------- */

interface SuspiciousContext {
  actor_name?: string | null;
  university_id?: string | null;
  session_id?: string | null;
}

function logSuspicious(eventType: string, reason: string, context: SuspiciousContext = {}): void {
  db.suspicious_events.push({
    id: randomUUID(),
    event_type: eventType,
    actor_name: context.actor_name ?? null,
    university_id: context.university_id ?? null,
    session_id: context.session_id ?? null,
    reason,
    created_at: new Date().toISOString(),
  });
  // الاحتفاظ بآخر 200 حدث فقط حتى لا يتضخم الملف
  if (db.suspicious_events.length > 200) {
    db.suspicious_events = db.suspicious_events.sort(byNewest).slice(0, 200);
  }
}

/** محاولات تسجيل الحضور المتكررة: { studentId → timestamps[] } */
const checkInAttempts = new Map<string, number[]>();
const MAX_CHECKINS_PER_MINUTE = 5;

function isRateLimited(studentId: string): boolean {
  const now = Date.now();
  const stamps = (checkInAttempts.get(studentId) ?? []).filter((ts) => now - ts < 60_000);
  return stamps.length >= MAX_CHECKINS_PER_MINUTE;
}

function recordCheckInAttempt(studentId: string): void {
  const now = Date.now();
  const stamps = (checkInAttempts.get(studentId) ?? []).filter((ts) => now - ts < 60_000);
  stamps.push(now);
  checkInAttempts.set(studentId, stamps);
}

/* -------------------------------------------------------------------------- */
/*  الحماية: ربط الحساب بجهاز واحد (Device Binding) — خادمي بالكامل           */
/* -------------------------------------------------------------------------- */

/**
 * فحص جهاز المستخدم عند الدخول:
 *  - الحساب مربوط بجهاز آخر → رفض (DEVICE_MISMATCH) + تسجيل مشبوه
 *    (طلاب فقط — الدكتور يُعاد ربط جهازه تلقائياً مع تسجيل تدقيقي)
 *  - الحساب بلا جهاز (قديم/أول مرة) → يُربط بهذا الجهاز فوراً
 *  - نفس الجهاز → دخول طبيعي
 */
function verifyDeviceBinding(user: DemoUser, deviceId: string): void {
  const provided = deviceId.trim();

  // حساب مربوط + العميل أرسل جهازاً مختلفاً (أو لم يرسل شيئاً — لا نسمح بالتجاوز)
  if (user.device_id && user.device_id !== provided) {
    if (user.role === "professor") {
      // دخول الدكتور ببريده ورقمه الوظيفي وبريد مؤكد — نسمح بإعادة الربط
      // للجهاز الجديد مع تسجيل تدقيقي في سجل الأنشطة المشبوهة
      user.device_id = provided;
      user.device_linked_at = new Date().toISOString();
      saveDb();
      logSuspicious(
        "device_rebound",
        `إعادة ربط جهاز دكتور بعد تسجيل دخول ناجح (${user.email})`,
        { actor_name: user.full_name, university_id: user.university_id }
      );
      return;
    }
    logSuspicious(
      "device_mismatch",
      `محاولة دخول من جهاز مختلف لحساب مربوط (${user.email})`,
      { actor_name: user.full_name, university_id: user.university_id }
    );
    fail(
      "هذا الحساب مربوط بجهاز آخر — اطلب من الدكتور ربط جهازك الجديد.",
      "DEVICE_MISMATCH"
    );
  }

  // حساب غير مربوط بعد → أول جهاز يدخل به يُربط بالحساب
  if (!user.device_id && provided) {
    user.device_id = provided;
    user.device_linked_at = new Date().toISOString();
    saveDb();
  }
}

/* -------------------------------------------------------------------------- */
/*  إحصائيات الطالب + الحالة الذكية (تُحسب خادمياً بالكامل)                      */
/* -------------------------------------------------------------------------- */

function computeStudentStats(studentId: string) {
  const student = db.users.find((user) => user.id === studentId);
  if (!student) {
    fail("لم يُعثر على الطالب.", "NOT_FOUND");
  }

  // أساتذة الطالب: أصحاب الجدول (المادة المسجلة للطالب) أو من حضر عندهم
  const attendedProfessorIds = new Set(
    db.attendance
      .filter((row) => row.student_id === studentId)
      .map((row) => db.sessions.find((s) => s.id === row.session_id)?.professor_id)
      .filter((id): id is string => Boolean(id))
  );
  const scheduledProfessorIds = new Set(db.schedule.map((entry) => entry.professor_id));
  const professorIds =
    scheduledProfessorIds.size > 0 ? scheduledProfessorIds : attendedProfessorIds;

  // الجلسات المحسوبة: جلسات أساتذته التي بدأت بعد تسجيل حسابه (إنشاء الطالب)
  const studentSince = new Date(student.created_at).getTime();
  const relevantSessions = db.sessions.filter((session) => {
    if (!professorIds.has(session.professor_id)) return false;
    // نحسب الجلسات التي فُتحت بعد أن أصبح للطالب حساب — القديمة لا تُحسب عليه
    return new Date(session.created_at).getTime() >= studentSince;
  });

  const myRows = db.attendance.filter((row) => row.student_id === studentId);
  const relevantSessionIds = new Set(relevantSessions.map((session) => session.id));
  const myRelevant = myRows.filter((row) => relevantSessionIds.has(row.session_id));

  const present = myRelevant.filter((row) => row.status === "present").length;
  const late = myRelevant.filter((row) => row.status === "late").length;

  const closedRelevant = relevantSessions.filter((session) => !session.is_open);
  const attendedClosed = myRelevant.filter(
    (row) => closedRelevant.some((session) => session.id === row.session_id)
  ).length;
  const absent = Math.max(0, closedRelevant.length - attendedClosed);

  const total = present + late + absent;
  const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : null;

  const { warning_threshold: warningAt, critical_threshold: criticalAt } = db.config;
  let smart_status: "safe" | "warning" | "critical" | "no_data" = "no_data";
  if (percentage !== null) {
    if (percentage >= warningAt) smart_status = "safe";
    else if (percentage >= criticalAt) smart_status = "warning";
    else smart_status = "critical";
  }

  const lastAttended = [...myRows].sort(byNewest)[0] ?? null;

  return {
    present,
    late,
    absent,
    total,
    percentage,
    smart_status,
    thresholds: { warning: warningAt, critical: criticalAt },
    last_attended_at: lastAttended ? lastAttended.check_in_time : null,
    warnings: db.warnings.filter((row) => row.student_id === studentId).length,
  };
}

/* -------------------------------------------------------------------------- */
/*  الجدول: حساب الحالة اللحظية من وقت العميل الحقيقي                           */
/* -------------------------------------------------------------------------- */

function scheduleRowsFor(nowIso: string | undefined) {
  // وقت العميل إن أُرسل (دقيق حسب المنطقة الزمنية للطالب) وإلا وقت الخادم
  const now = nowIso ? new Date(nowIso) : new Date();
  if (Number.isNaN(now.getTime())) return [];
  const dayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const withStatus = db.schedule.map((entry) => {
    const professor = db.users.find((user) => user.id === entry.professor_id);
    let status: "current" | "upcoming" | "finished" = "upcoming";
    let minutesUntilStart: number | null = null;

    if (entry.day_of_week === dayOfWeek) {
      if (currentMinutes >= entry.end_minutes) status = "finished";
      else if (currentMinutes >= entry.start_minutes) status = "current";
      else {
        status = "upcoming";
        minutesUntilStart = entry.start_minutes - currentMinutes;
      }
    } else {
      status = "upcoming";
      // أيام حتى المحاضرة القادمة (بحد أدنى يوم واحد لأن اليوم نفسه عُالج أعلاه)
      let daysAhead = (entry.day_of_week - dayOfWeek + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      minutesUntilStart = daysAhead * 24 * 60 - currentMinutes + entry.start_minutes;
    }

    return {
      ...entry,
      professor_name: professor?.full_name ?? null,
      status,
      minutes_until_start: minutesUntilStart,
    };
  });

  // الترتيب: محاضرات اليوم غير المنتهية أولاً (current ثم upcoming) ثم باقي الأسبوع
  const dayWeight = (entry: DemoSchedule) => {
    let d = (entry.day_of_week - dayOfWeek + 7) % 7;
    if (d === 0 && entry.end_minutes <= currentMinutes) d = 7; // انتهت اليوم → الأسبوع القادم
    return d;
  };

  return withStatus.sort((a, b) => {
    const da = dayWeight(a);
    const dbb = dayWeight(b);
    if (da !== dbb) return da - dbb;
    return a.start_minutes - b.start_minutes;
  });
}

/* -------------------------------------------------------------------------- */
/*  تنفيذ الإجراءات                                                            */
/* -------------------------------------------------------------------------- */

export async function demoAction(
  action: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  syncFromFileIfChanged();
  switch (action) {
    /* ------------------------------ المصادقة ------------------------------ */

    case "login": {
      const email = asText(payload.email).toLowerCase();
      const universityId = asText(payload.university_id);
      const deviceId = asText(payload.device_id);
      const user = db.users.find(
        (row) => row.email === email && row.university_id === universityId
      );

      if (!user) {
        // لا نكشف إن كان البريد أو الرقم هو الخطأ — رسالة واحدة موحّدة
        logSuspicious("validation_bypass", `محاولة دخول ببيانات غير مسجلة (${email})`, {
          actor_name: email,
          university_id: universityId,
        });
        return null;
      }

      // حماية مشاركة الحساب: الجهاز الحالي يجب أن يكون الجهاز المرتبط
      verifyDeviceBinding(user, deviceId);

      return publicUser(user);
    }

    case "check-email": {
      const email = asText(payload.email).toLowerCase();
      return db.users.some((row) => row.email === email);
    }

    case "register": {
      const email = asText(payload.email).toLowerCase();
      if (db.users.some((row) => row.email === email)) {
        fail("هذا البريد الإلكتروني مسجّل مسبقاً.", "EMAIL_EXISTS");
      }
      const role = payload.role === "professor" ? "professor" : "student";

      const otp =
        role === "professor" ? generateOtp() : { code: null, expiresAt: null };

      const user: DemoUser = {
        id: randomUUID(),
        full_name: asText(payload.full_name),
        email,
        university_id: asText(payload.university_id),
        role,
        id_card_url: typeof payload.id_card_url === "string" ? payload.id_card_url : null,
        id_card_back_url: typeof payload.id_card_back_url === "string" ? payload.id_card_back_url : null,
        personal_photo_url: typeof payload.personal_photo_url === "string" ? payload.personal_photo_url : null,
        subject:
          role === "professor" && typeof payload.subject === "string"
            ? asText(payload.subject).slice(0, 80)
            : null,
        status: role === "student" ? "pending" : "approved",
        email_verified: role !== "professor",
        otp_code: otp.code,
        otp_expires_at: otp.expiresAt,
        faculty:
          role === "student" && typeof payload.faculty === "string"
            ? asText(payload.faculty).slice(0, 80) || null
            : null,
        program:
          role === "student" && typeof payload.program === "string"
            ? asText(payload.program).slice(0, 80) || null
            : null,
        academic_year:
          role === "student" && typeof payload.academic_year === "string"
            ? asText(payload.academic_year).slice(0, 40) || null
            : null,
        device_id: asText(payload.device_id) || null,
        device_linked_at: asText(payload.device_id) ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      };
      db.users.push(user);
      saveDb();
      return { user: publicUser(user), otp: otp.code };
    }

    /* ---------------- تأكيد بريد الدكتور عبر رمز OTP ---------------- */

    case "verify-otp": {
      const email = asText(payload.email).toLowerCase();
      const code = asText(payload.code);
      const user = db.users.find((row) => row.email === email && row.role === "professor");
      if (!user) {
        fail("لا يوجد حساب دكتور بهذا البريد.", "NOT_FOUND");
      }
      if (user.email_verified) {
        return publicUser(user);
      }
      if (!user.otp_code || !user.otp_expires_at) {
        fail("لا يوجد رمز تحقق — اطلب رمزاً جديداً.", "OTP_MISSING");
      }
      if (new Date(user.otp_expires_at).getTime() < Date.now()) {
        fail("انتهت صلاحية الرمز — اطلب رمزاً جديداً.", "OTP_EXPIRED");
      }
      if (user.otp_code !== code) {
        logSuspicious("validation_bypass", `رمز OTP خاطئ (${email})`, { actor_name: email });
        fail("الرمز الذي أدخلته غير صحيح — تحقق منه وأعد المحاولة.", "WRONG_OTP");
      }
      user.email_verified = true;
      user.otp_code = null;
      user.otp_expires_at = null;
      saveDb();
      return publicUser(user);
    }

    case "request-otp": {
      const email = asText(payload.email).toLowerCase();
      const user = db.users.find((row) => row.email === email && row.role === "professor");
      if (!user) {
        fail("لا يوجد حساب دكتور بهذا البريد.", "NOT_FOUND");
      }
      if (user.email_verified) {
        fail("هذا الحساب مؤكد بالفعل — سجّل دخولك مباشرة.", "ALREADY_VERIFIED");
      }
      const otp = generateOtp();
      user.otp_code = otp.code;
      user.otp_expires_at = otp.expiresAt;
      saveDb();
      return { otp: otp.code };
    }

    /* ------------- طلبات تسجيل الطلاب (موافقة/رفض الدكتور) ------------- */

    case "pending-students": {
      return db.users
        .filter((row) => row.role === "student" && row.status === "pending")
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(0, 50)
        .map(publicUser);
    }

    case "set-student-status": {
      const studentId = asText(payload.student_id);
      const status = payload.status === "rejected" ? "rejected" : "approved";
      const user = db.users.find((row) => row.id === studentId && row.role === "student");
      if (!user) {
        fail("لم يُعثر على الطالب.", "NOT_FOUND");
      }
      user.status = status;
      // إشعار الطالب بقرار الدكتور فوراً
      notify(user.id, status === "approved" ? "account_approved" : "account_rejected");
      saveDb();
      return { ok: true };
    }

    /* ------------- طلبات ربط جهاز جديد (موافقة/رفض الدكتور) ------------- */

    /**
     * طلب ربط جهاز جديد بحساب طالب:
     *  - يتحقق من بيانات الدخول (بريد + رقم جامعي) قبل إنشاء الطلب
     *  - لا يمنح الدخول — الدكتور يراجع الطلب ويقرر من لوحته
     *  - طلب مكرر لنفس الطالب والجهاز نفسه لا يُكرّر
     */
    case "request-device-transfer": {
      const email = asText(payload.email).toLowerCase();
      const universityId = asText(payload.university_id);
      const deviceId = asText(payload.device_id);
      if (!deviceId) {
        fail("تعذر تحديد هذا الجهاز — أعد المحاولة.", "BAD_REQUEST");
      }
      const user = db.users.find(
        (row) => row.email === email && row.university_id === universityId && row.role === "student"
      );
      if (!user) {
        // نفس رسالة الدخول الموحّدة — لا نكشف أي بيانات صحيحة
        fail("بيانات الحساب غير صحيحة.", "NOT_FOUND");
      }

      // طلب معلّق لنفس الجهاز؟ لا تكرار
      const alreadyPending = db.device_requests.some(
        (row) => row.user_id === user.id && row.device_id === deviceId
      );
      if (alreadyPending) {
        return { ok: true, pending: true };
      }

      db.device_requests.push({
        id: randomUUID(),
        user_id: user.id,
        device_id: deviceId,
        created_at: new Date().toISOString(),
      });

      // إشعار كل الدكاترة بالطلب الوارد
      for (const professor of db.users) {
        if (professor.role === "professor") {
          notify(professor.id, "device_transfer_request", {
            student: user.full_name.split(" ")[0],
          });
        }
      }
      saveDb();
      return { ok: true, pending: false };
    }

    /** قائمة طلبات ربط الأجهزة المعلّقة (لوحة الدكتور) */
    case "device-requests": {
      return db.device_requests
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(0, 50)
        .map((request) => {
          const student = db.users.find((row) => row.id === request.user_id);
          return {
            id: request.id,
            device_id: request.device_id,
            created_at: request.created_at,
            student: student
              ? {
                  id: student.id,
                  full_name: student.full_name,
                  university_id: student.university_id,
                  email: student.email,
                  personal_photo_url: student.personal_photo_url,
                }
              : null,
          };
        });
    }

    /** قرار الدكتور في طلب ربط جهاز — الموافقة تنقل الحساب للجهاز الجديد */
    case "resolve-device-request": {
      const professorId = asText(payload.professor_id);
      const requestId = asText(payload.request_id);
      const approve = payload.approve === true;

      // التحقق الخادمي: القرار من حساب دكتور فقط
      const professor = db.users.find(
        (row) => row.id === professorId && row.role === "professor"
      );
      if (!professor) {
        logSuspicious("validation_bypass", `محاولة قرار جهاز من حساب غير دكتور (${professorId})`);
        fail("لا يمكن تنفيذ هذا الإجراء إلا من حساب دكتور.", "FORBIDDEN");
      }

      const request = db.device_requests.find((row) => row.id === requestId);
      if (!request) {
        fail("الطلب غير موجود — قد يكون معالجاً بالفعل.", "NOT_FOUND");
      }
      const student = db.users.find((row) => row.id === request.user_id);

      if (approve && student) {
        // نقل الربط للجهاز الجديد — يسري فوراً
        student.device_id = request.device_id;
        student.device_linked_at = new Date().toISOString();
      }

      // حذف الطلب (وكذلك أي طلبات أخرى معلّقة لنفس الطالب — حُسم الأمر)
      db.device_requests = db.device_requests.filter(
        (row) => row.id !== requestId && row.user_id !== request.user_id
      );

      if (student) {
        notify(
          student.id,
          approve ? "device_transfer_approved" : "device_transfer_rejected"
        );
      }
      saveDb();
      return { ok: true };
    }

    /* ------- تحديث صور الطالب من حسابه (إضافة/استبدال مستند) ------- */

    case "update-user-photos": {
      const userId = asText(payload.user_id);
      const user = db.users.find((row) => row.id === userId);
      if (!user) {
        fail("لم يُعثر على الحساب.", "NOT_FOUND");
      }
      const fields: [keyof DemoUser, string][] = [
        ["personal_photo_url", "personal_photo_url"],
        ["id_card_url", "id_card_url"],
        ["id_card_back_url", "id_card_back_url"],
      ];
      for (const [field] of fields) {
        const value = payload[field as string];
        if (typeof value === "string" && value.length > 0) {
          (user as unknown as Record<string, unknown>)[field as string] = value;
        }
      }
      saveDb();
      return publicUser(user);
    }

    /* ------------------------------ الجلسات ------------------------------ */

    case "professor-sessions": {
      const professorId = asText(payload.professor_id);
      const mine = db.sessions.filter((session) => session.professor_id === professorId);
      const open = mine.filter((session) => session.is_open).sort(byNewest)[0] ?? null;
      const lastClosed =
        mine.filter((session) => !session.is_open).sort(byNewest)[0] ?? null;
      return { open, lastClosed };
    }

    case "create-session": {
      const professorId = asText(payload.professor_id);
      const professor = db.users.find(
        (user) => user.id === professorId && user.role === "professor"
      );
      if (!professor) {
        // منع إنشاء جلسات من حسابات ليست دكتور — تحقق خادمي
        logSuspicious("validation_bypass", `محاولة إنشاء جلسة من حساب غير دكتور (${professorId})`);
        fail("لا يمكن إنشاء جلسة إلا من حساب دكتور.", "FORBIDDEN");
      }
      const rawSubject = asText(payload.subject);
      const session: DemoSession = {
        id: randomUUID(),
        professor_id: professorId,
        subject: rawSubject.length > 0 ? rawSubject.slice(0, 80) : professor.subject,
        lat: Number(payload.lat),
        lng: Number(payload.lng),
        radius: Math.max(20, Math.round(Number(payload.radius)) || 50),
        is_open: true,
        created_at: new Date().toISOString(),
      };
      if (!Number.isFinite(session.lat) || !Number.isFinite(session.lng)) {
        fail("إحداثيات الجلسة غير صالحة.", "BAD_REQUEST");
      }
      db.sessions.push(session);

      // إشعار كل الطلاب المقبولين بفتح الجلسة
      notifyAllApprovedStudents("session_opened", {
        professor: professor.full_name.split(" ")[0],
        subject: session.subject ?? "",
        radius: session.radius,
      });

      saveDb();
      return session;
    }

    case "close-session": {
      const sessionId = asText(payload.session_id);
      const session = db.sessions.find((row) => row.id === sessionId);
      if (!session) fail("الجلسة غير موجودة.", "SESSION_NOT_FOUND");
      if (session.is_open) {
        session.is_open = false;
        // إشعار الحاضرين بإقفال الجلسة
        const professor = db.users.find((user) => user.id === session.professor_id);
        for (const row of db.attendance.filter((r) => r.session_id === sessionId)) {
          notify(row.student_id, "session_closed", {
            professor: professor?.full_name.split(" ")[0] ?? "",
            subject: session.subject ?? "",
          });
        }
        saveDb();
      }
      return { ok: true };
    }

    case "open-sessions": {
      return db.sessions
        .filter((session) => session.is_open)
        .sort(byNewest)
        .slice(0, 10)
        .map(sessionWithProfessor);
    }

    /* --------------- تعديل بيانات الجلسة المفتوحة (دكتورها فقط) --------------- */

    case "update-session": {
      const professorId = asText(payload.professor_id);
      const sessionId = asText(payload.session_id);
      const professor = db.users.find(
        (row) => row.id === professorId && row.role === "professor"
      );
      const session = db.sessions.find((row) => row.id === sessionId);
      if (!session) {
        fail("الجلسة غير موجودة.", "SESSION_NOT_FOUND");
      }
      if (!professor) {
        logSuspicious(
          "validation_bypass",
          `محاولة تعديل جلسة من حساب غير دكتور (${professorId})`,
          { session_id: sessionId }
        );
        fail("لا يمكن تعديل الجلسة إلا من حساب الدكتور صاحبها.", "FORBIDDEN");
      }
      if (session.professor_id !== professorId) {
        logSuspicious(
          "validation_bypass",
          `محاولة تعديل جلسة لا يملكها (${professorId})`,
          { session_id: sessionId }
        );
        fail("لا يمكنك تعديل جلسة ليست لك.", "FORBIDDEN");
      }
      if (!session.is_open) {
        // الجلسة المنتهية سجل موثّق — بياناتها لا تُعدّل بعد القفل
        fail("لا يمكن تعديل جلسة منتهية — بياناتها موثّقة.", "SESSION_CLOSED");
      }

      // المادة: نص فارغ يعود لمادة الدكتور المسجلة
      if (typeof payload.subject === "string") {
        const rawSubject = asText(payload.subject);
        session.subject =
          rawSubject.length > 0 ? rawSubject.slice(0, 80) : professor.subject;
      }

      // النطاق: بحد أدنى 20 متراً كإنشاء الجلسة
      const rawRadius = Number(payload.radius);
      if (Number.isFinite(rawRadius) && rawRadius > 0) {
        session.radius = Math.max(20, Math.round(rawRadius));
      }

      // الموقع: يُحدَّث فقط إن أُرسلت إحداثيات صالحة
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      const hasCoords = payload.lat !== undefined && payload.lng !== undefined;
      if (
        hasCoords &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        session.lat = lat;
        session.lng = lng;
      }

      saveDb();
      return session;
    }

    /* --------------- حذف جلسة نهائياً مع سجلات حضورها (دكتورها فقط) --------------- */

    case "delete-session": {
      const professorId = asText(payload.professor_id);
      const sessionId = asText(payload.session_id);
      const professor = db.users.find(
        (row) => row.id === professorId && row.role === "professor"
      );
      const session = db.sessions.find((row) => row.id === sessionId);
      if (!session) {
        fail("الجلسة غير موجودة.", "SESSION_NOT_FOUND");
      }
      if (!professor || session.professor_id !== professorId) {
        logSuspicious(
          "validation_bypass",
          `محاولة حذف جلسة من حساب غير مالك (${professorId})`,
          { session_id: sessionId }
        );
        fail("لا يمكنك حذف جلسة ليست لك.", "FORBIDDEN");
      }

      const removedAttendance = db.attendance.filter(
        (row) => row.session_id === sessionId
      ).length;
      db.attendance = db.attendance.filter((row) => row.session_id !== sessionId);
      db.sessions = db.sessions.filter((row) => row.id !== sessionId);
      saveDb();
      return { ok: true, removedAttendance };
    }

    /* --------------- تعديل حالة حضور (حاضر ↔ متأخر) — دكتور الجلسة فقط --------------- */

    case "update-attendance-status": {
      const professorId = asText(payload.professor_id);
      const attendanceId = asText(payload.attendance_id);
      const status =
        payload.status === "late"
          ? "late"
          : payload.status === "present"
            ? "present"
            : null;
      if (!status) {
        fail("حالة الحضور غير صالحة.", "BAD_REQUEST");
      }
      const professor = db.users.find(
        (row) => row.id === professorId && row.role === "professor"
      );
      const record = db.attendance.find((row) => row.id === attendanceId);
      if (!record) {
        fail("سجل الحضور غير موجود.", "NOT_FOUND");
      }
      const session = db.sessions.find((row) => row.id === record.session_id);
      if (!professor || !session || session.professor_id !== professorId) {
        logSuspicious(
          "validation_bypass",
          `محاولة تعديل حالة حضور من حساب غير مالك (${professorId})`,
          { session_id: record.session_id }
        );
        fail("لا يمكنك تعديل حضور جلسة ليست لك.", "FORBIDDEN");
      }

      record.status = status;
      saveDb();
      return record;
    }

    /* --------------- حذف سجل حضور نهائياً — دكتور الجلسة فقط --------------- */

    case "delete-attendance": {
      const professorId = asText(payload.professor_id);
      const attendanceId = asText(payload.attendance_id);
      const professor = db.users.find(
        (row) => row.id === professorId && row.role === "professor"
      );
      const record = db.attendance.find((row) => row.id === attendanceId);
      if (!record) {
        fail("سجل الحضور غير موجود.", "NOT_FOUND");
      }
      const session = db.sessions.find((row) => row.id === record.session_id);
      if (!professor || !session || session.professor_id !== professorId) {
        logSuspicious(
          "validation_bypass",
          `محاولة حذف حضور من حساب غير مالك (${professorId})`,
          { session_id: record.session_id }
        );
        fail("لا يمكنك حذف حضور جلسة ليست لك.", "FORBIDDEN");
      }

      db.attendance = db.attendance.filter((row) => row.id !== attendanceId);

      // إشعار الطالب بإلغاء حضوره حتى لا يفاجأ باختفائه من إحصائياته
      notify(record.student_id, "attendance_revoked", {
        professor: professor.full_name.split(" ")[0],
        subject: session.subject ?? "",
      });
      saveDb();
      return { ok: true };
    }

    /* --------------- حذف إنذار نهائياً — الدكتور المسجِّل له فقط --------------- */

    case "delete-warning": {
      const professorId = asText(payload.professor_id);
      const warningId = asText(payload.warning_id);
      const professor = db.users.find(
        (row) => row.id === professorId && row.role === "professor"
      );
      const warning = db.warnings.find((row) => row.id === warningId);
      if (!warning) {
        fail("الإنذار غير موجود.", "NOT_FOUND");
      }
      if (!professor || warning.professor_id !== professorId) {
        logSuspicious(
          "validation_bypass",
          `محاولة حذف إنذار من حساب غير مسجّله (${professorId})`
        );
        fail("لا يمكنك حذف إنذار لم تسجّله.", "FORBIDDEN");
      }

      db.warnings = db.warnings.filter((row) => row.id !== warningId);
      saveDb();
      return { ok: true };
    }

    /* --------------- إنذارات طالب معين عند دكتور معين (لملف الطالب) --------------- */

    case "student-warnings": {
      const professorId = asText(payload.professor_id);
      const studentId = asText(payload.student_id);
      return db.warnings
        .filter(
          (row) => row.professor_id === professorId && row.student_id === studentId
        )
        .sort(byNewest)
        .slice(0, 20);
    }

    /* ------------------------------ الحضور ------------------------------- */

    case "attendance": {
      const sessionId = asText(payload.session_id);
      return db.attendance
        .filter((row) => row.session_id === sessionId)
        .sort(byNewest);
    }

    case "attended-ids": {
      const studentId = asText(payload.student_id);
      const sessionIds = Array.isArray(payload.session_ids)
        ? (payload.session_ids as unknown[])
        : [];
      if (sessionIds.length === 0 || !studentId) return [];
      /* نُرجع الحالة (حاضر/متأخر) مع كل جلسة — لعرضها للطالب بدل «حاضر» دائماً */
      return db.attendance
        .filter(
          (row) => row.student_id === studentId && sessionIds.includes(row.session_id)
        )
        .map((row) => ({ session_id: row.session_id, status: row.status }));
    }

    case "history": {
      const studentId = asText(payload.student_id);
      return db.attendance
        .filter((row) => row.student_id === studentId)
        .sort(byNewest)
        .slice(0, 50)
        .map((row) => {
          const session = db.sessions.find((s) => s.id === row.session_id);
          return {
            ...row,
            sessions: session
              ? {
                  created_at: session.created_at,
                  radius: session.radius,
                  subject: session.subject,
                  users: {
                    full_name:
                      db.users.find((user) => user.id === session.professor_id)?.full_name ?? null,
                  },
                }
              : null,
          };
        });
    }

    case "check-in": {
      const sessionId = asText(payload.session_id);
      const studentId = asText(payload.student_id);

      // الطالب يجب أن يكون موجوداً ومقبولاً — لا ثقة بأي اسم يرسله العميل
      const student = db.users.find((user) => user.id === studentId && user.role === "student");
      if (!student || student.status !== "approved") {
        logSuspicious("validation_bypass", `محاولة تسجيل حضور من حساب غير مقبول (${studentId})`);
        fail("الحساب غير مصرح له بتسجيل الحضور.", "FORBIDDEN");
      }

      // الحد من المحاولات المتكررة (سلوك غير طبيعي)
      if (isRateLimited(studentId)) {
        logSuspicious("rate_limited", "محاولات حضور متكررة خلال دقيقة", {
          actor_name: student.full_name,
          university_id: student.university_id,
          session_id: sessionId,
        });
        fail("محاولات كثيرة خلال وقت قصير — انتظر قليلاً ثم أعد المحاولة.", "RATE_LIMITED");
      }
      recordCheckInAttempt(studentId);

      const session = db.sessions.find((row) => row.id === sessionId);
      if (!session) {
        logSuspicious("invalid_session", "محاولة حضور لجلسة غير موجودة", {
          actor_name: student.full_name,
          university_id: student.university_id,
          session_id: sessionId,
        });
        fail("هذه الجلسة غير موجودة.", "SESSION_NOT_FOUND");
      }

      if (!session.is_open) {
        logSuspicious("closed_session", "محاولة حضور لجلسة مقفلة", {
          actor_name: student.full_name,
          university_id: student.university_id,
          session_id: sessionId,
        });
        fail("هذه الجلسة غير مفتوحة — لا يمكن تسجيل الحضور.", "SESSION_CLOSED");
      }

      // طالب محظور من هذا الدكتور؟
      const isBlocked = db.blocked.some(
        (row) => row.professor_id === session.professor_id && row.student_id === studentId
      );
      if (isBlocked) {
        logSuspicious("blocked_attempt", "محاولة حضور من طالب محظور", {
          actor_name: student.full_name,
          university_id: student.university_id,
          session_id: sessionId,
        });
        fail("أنت محظور من حضور محاضرات هذا الدكتور.", "BLOCKED");
      }

      // القيد الفريد session_id + student_id (مكافئ 23505 في Postgres)
      const duplicate = db.attendance.some(
        (row) => row.session_id === sessionId && row.student_id === studentId
      );
      if (duplicate) {
        logSuspicious("duplicate", "محاولة حضور مكررة لنفس الجلسة", {
          actor_name: student.full_name,
          university_id: student.university_id,
          session_id: sessionId,
        });
        notify(studentId, "attendance_duplicate", {
          subject: session.subject ?? "",
        });
        saveDb();
        fail("حضور مكرر في نفس الجلسة.", "23505");
      }

      /* التحقق الجغرافي على الخادم — الإحداثيات تُفحص هنا ولا ثقة بأي حساب عميل
         (إغلاق ثغرة: سابقاً كان الزر فقط يُقفل خارج النطاق أما الخادم فيقبل أي شيء) */
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      ) {
        logSuspicious("geo_bypass", "طلب حضور بدون إحداثيات صالحة", {
          actor_name: student.full_name,
          university_id: student.university_id,
          session_id: sessionId,
        });
        fail("تعذر التحقق من موقعك — شغّل GPS وامنح الإذن ثم أعد المحاولة.", "GEO_REQUIRED");
      }

      // المسافة يحسبها الخادم بنفسه (Haversine) من إحداثيات الجلسة
      const distance = haversineDistance(lat, lng, Number(session.lat), Number(session.lng));

      // سماحية عدالة لضبابية GPS: بحد أقصى 20 متراً ولا تُقبل سوى لقطة دقة معقولة
      const rawAccuracy = Number(payload.accuracy);
      const tolerance =
        Number.isFinite(rawAccuracy) && rawAccuracy > 0 && rawAccuracy <= 100
          ? Math.min(rawAccuracy, 20)
          : 0;

      if (distance > session.radius + tolerance) {
        logSuspicious(
          "out_of_range",
          `محاولة حضور خارج النطاق (${Math.round(distance)}م من القاعة / النطاق ${session.radius}م)`,
          {
            actor_name: student.full_name,
            university_id: student.university_id,
            session_id: sessionId,
          }
        );
        fail(
          `أنت خارج نطاق الجلسة — المسافة ${Math.round(distance)} متر من القاعة.`,
          "OUT_OF_RANGE"
        );
      }

      // الحالة يحددها الخادم فقط: متأخر إذا تجاوز مهلة السماح منذ فتح الجلسة
      const checkInTime = new Date();
      const sessionStart = new Date(session.created_at).getTime();
      const elapsedMinutes = (checkInTime.getTime() - sessionStart) / 60000;
      const status: "present" | "late" =
        elapsedMinutes > db.config.grace_minutes ? "late" : "present";

      const record: DemoAttendance = {
        id: randomUUID(),
        session_id: sessionId,
        student_id: studentId,
        student_name: student.full_name,
        university_id: student.university_id,
        status,
        check_in_time: checkInTime.toISOString(),
        created_at: checkInTime.toISOString(),
      };
      db.attendance.push(record);

      // إشعار الطالب بتوثيق حضوره وحالته
      notify(studentId, "attendance_recorded", {
        subject: session.subject ?? "",
        status,
      });

      // كشف تغيّر الحالة الذكية (تحذير/خطر) وإشعار الطالب فوراً
      const stats = computeStudentStats(studentId);
      if (stats.smart_status === "warning" || stats.smart_status === "critical") {
        notify(studentId, `status_${stats.smart_status}`, {
          percentage: stats.percentage ?? 0,
        });
      }

      saveDb();
      return record;
    }

    /* --------------------------- الحظر والإنذارات --------------------------- */

    case "get-session": {
      const session = db.sessions.find((row) => row.id === asText(payload.session_id));
      return session ? { ...session, users: null } : null;
    }

    /* ----------------- سجل جلسات الدكتور السابقة (مع عدد الحضور) ----------------- */

    case "professor-session-history": {
      const professorId = asText(payload.professor_id);
      const limit = Math.min(50, Math.max(1, Number(payload.limit) || 20));
      const mine = db.sessions
        .filter((session) => session.professor_id === professorId)
        .sort(byNewest)
        .slice(0, limit);
      return mine.map((session) => ({
        ...session,
        attendanceCount: db.attendance.filter((row) => row.session_id === session.id).length,
      }));
    }

    /* ----------------- إحصائيات الطالب (للوحة الطالب) ----------------- */

    case "student-summary": {
      const studentId = asText(payload.student_id);
      const myAttendance = db.attendance.filter((row) => row.student_id === studentId);
      const lastAttendance = [...myAttendance].sort(byNewest)[0] ?? null;
      return {
        totalAttended: myAttendance.length,
        warnings: db.warnings.filter((row) => row.student_id === studentId).length,
        lastAttendedAt: lastAttendance ? lastAttendance.created_at : null,
      };
    }

    /* ----------------- إحصائيات الطالب الكاملة (نسبة + حالة ذكية) ----------------- */

    case "student-stats": {
      return computeStudentStats(asText(payload.student_id));
    }

    case "student-profiles": {
      const ids = Array.isArray(payload.student_ids)
        ? (payload.student_ids as unknown[]).map((id) => asText(id))
        : [];
      if (ids.length === 0) return [];
      return db.users.filter((user) => ids.includes(user.id));
    }

    case "professor-stats": {
      const professorId = asText(payload.professor_id);
      const mySessions = db.sessions.filter(
        (session) => session.professor_id === professorId
      );
      const closedIds = new Set(
        mySessions.filter((session) => !session.is_open).map((session) => session.id)
      );
      const mySessionIds = new Set(mySessions.map((session) => session.id));

      const attendedByStudent: Record<string, number> = {};
      const closedAttendedByStudent: Record<string, number> = {};
      for (const row of db.attendance) {
        if (!mySessionIds.has(row.session_id)) continue;
        attendedByStudent[row.student_id] = (attendedByStudent[row.student_id] ?? 0) + 1;
        if (closedIds.has(row.session_id)) {
          closedAttendedByStudent[row.student_id] =
            (closedAttendedByStudent[row.student_id] ?? 0) + 1;
        }
      }

      const warningsByStudent: Record<string, number> = {};
      for (const warning of db.warnings) {
        if (warning.professor_id !== professorId) continue;
        warningsByStudent[warning.student_id] = (warningsByStudent[warning.student_id] ?? 0) + 1;
      }

      return {
        totalSessions: mySessions.length,
        totalClosedSessions: closedIds.size,
        attendedByStudent,
        closedAttendedByStudent,
        warningsByStudent,
        blockedIds: db.blocked
          .filter((row) => row.professor_id === professorId)
          .map((row) => row.student_id),
      };
    }

    case "block-student": {
      const professorId = asText(payload.professor_id);
      const studentId = asText(payload.student_id);
      if (!professorId || !studentId) {
        fail("بيانات الحظر غير مكتملة.", "BAD_REQUEST");
      }
      const exists = db.blocked.some(
        (row) => row.professor_id === professorId && row.student_id === studentId
      );
      if (!exists) {
        db.blocked.push({
          id: randomUUID(),
          professor_id: professorId,
          student_id: studentId,
          created_at: new Date().toISOString(),
        });
        saveDb();
      }
      return { ok: true };
    }

    case "unblock-student": {
      const professorId = asText(payload.professor_id);
      const studentId = asText(payload.student_id);
      db.blocked = db.blocked.filter(
        (row) => !(row.professor_id === professorId && row.student_id === studentId)
      );
      saveDb();
      return { ok: true };
    }

    case "warn-student": {
      const professorId = asText(payload.professor_id);
      const studentId = asText(payload.student_id);
      if (!professorId || !studentId) {
        fail("بيانات الإنذار غير مكتملة.", "BAD_REQUEST");
      }
      const professor = db.users.find((user) => user.id === professorId);
      db.warnings.push({
        id: randomUUID(),
        professor_id: professorId,
        student_id: studentId,
        reason: typeof payload.reason === "string" ? asText(payload.reason) : null,
        created_at: new Date().toISOString(),
      });
      // إشعار الطالب بالإنذار
      notify(studentId, "attendance_warning", {
        subject: professor?.subject ?? "",
      });
      saveDb();
      return { ok: true };
    }

    case "is-blocked": {
      const professorId = asText(payload.professor_id);
      const studentId = asText(payload.student_id);
      return db.blocked.some(
        (row) => row.professor_id === professorId && row.student_id === studentId
      );
    }

    /* ------------------------------ الإشعارات ------------------------------ */

    case "notifications": {
      const userId = asText(payload.user_id);
      if (!userId) return [];
      const nowIso = typeof payload.now === "string" ? payload.now : undefined;
      const localDate = typeof payload.local_date === "string" ? payload.local_date : undefined;

      // توليد «محاضرة قادمة» تلقائياً: محاضرات تبدأ خلال 30 دقيقة ولم يُنبَّه عنها
      if (nowIso && localDate) {
        const now = new Date(nowIso);
        if (!Number.isNaN(now.getTime())) {
          const dayOfWeek = now.getDay();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          for (const entry of db.schedule) {
            if (entry.day_of_week !== dayOfWeek) continue;
            const minutesUntil = entry.start_minutes - currentMinutes;
            if (minutesUntil < 0 || minutesUntil > 30) continue;
            const dedupKey = `upcoming:${entry.id}:${localDate}`;
            const alreadyNotified = db.notifications.some(
              (n) => n.user_id === userId && n.params?.dedup === dedupKey
            );
            if (alreadyNotified) continue;
            const professor = db.users.find((user) => user.id === entry.professor_id);
            notify(userId, "upcoming_class", {
              subject: entry.subject,
              professor: professor?.full_name.split(" ")[0] ?? "",
              minutes: Math.max(1, minutesUntil),
              room: entry.room ?? "",
              dedup: dedupKey,
            });
          }
          if (db.notifications.some((n) => n.user_id === userId)) saveDb();
        }
      }

      return db.notifications
        .filter((n) => n.user_id === userId)
        .sort(byNewest)
        .slice(0, 30);
    }

    case "notifications-unread-count": {
      const userId = asText(payload.user_id);
      if (!userId) return 0;
      return db.notifications.filter((n) => n.user_id === userId && !n.read).length;
    }

    case "mark-notification-read": {
      const id = asText(payload.id);
      const notification = db.notifications.find((n) => n.id === id);
      if (notification) {
        notification.read = true;
        saveDb();
      }
      return { ok: true };
    }

    case "mark-notifications-read": {
      const userId = asText(payload.user_id);
      let changed = false;
      for (const n of db.notifications) {
        if (n.user_id === userId && !n.read) {
          n.read = true;
          changed = true;
        }
      }
      if (changed) saveDb();
      return { ok: true };
    }

    /* --------------- حذف إشعار واحد (صاحبه فقط — تطابق user_id) --------------- */

    case "delete-notification": {
      const userId = asText(payload.user_id);
      const id = asText(payload.id);
      db.notifications = db.notifications.filter(
        (n) => !(n.id === id && n.user_id === userId)
      );
      saveDb();
      return { ok: true };
    }

    /* --------------- حذف كل إشعارات مستخدم (صاحبها فقط) --------------- */

    case "clear-notifications": {
      const userId = asText(payload.user_id);
      db.notifications = db.notifications.filter((n) => n.user_id !== userId);
      saveDb();
      return { ok: true };
    }

    /* ------------------------------ الجدول ------------------------------ */

    case "schedule": {
      const nowIso = typeof payload.now === "string" ? payload.now : undefined;
      return scheduleRowsFor(nowIso);
    }

    /* --------------------------- الأنشطة المشبوهة --------------------------- */

    case "suspicious-events": {
      const limit = Math.min(100, Math.max(1, Number(payload.limit) || 30));
      return db.suspicious_events.sort(byNewest).slice(0, limit);
    }

    /* ------------------------------ الإعدادات ------------------------------ */

    case "config": {
      return { ...db.config };
    }

    case "update-config": {
      // تعديل العتبات ومهلة التأخير (إداري — يستدعى من لوحة الدكتور مستقبلاً)
      if (Number.isFinite(Number(payload.grace_minutes))) {
        db.config.grace_minutes = Math.max(0, Math.min(120, Number(payload.grace_minutes)));
      }
      if (Number.isFinite(Number(payload.warning_threshold))) {
        db.config.warning_threshold = Math.max(1, Math.min(100, Number(payload.warning_threshold)));
      }
      if (Number.isFinite(Number(payload.critical_threshold))) {
        db.config.critical_threshold = Math.max(0, Math.min(100, Number(payload.critical_threshold)));
      }
      saveDb();
      return { ...db.config };
    }

    default:
      fail(`إجراء غير معروف: ${action}`, "UNKNOWN_ACTION");
  }
}
