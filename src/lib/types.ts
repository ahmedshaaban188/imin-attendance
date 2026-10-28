/**
 * ImIn | الأنواع المشتركة المستخدمة في كل واجهات النظام
 * (مطابقة تماماً لمخطط قاعدة بيانات Supabase في supabase/schema.sql)
 */

export type UserRole = "student" | "professor";

/** حالة سجل الحضور: حاضر / متأخر (الغياب = غياب السجل نفسه) */
export type AttendanceStatus = "present" | "late";

/** حالة الحضور الذكية للطالب حسب النسبة والعتبات */
export type SmartStatus = "safe" | "warning" | "critical" | "no_data";

/**
 * حالة الحساب:
 *  - الطالب يبدأ «pending» ولا يستطيع الدخول إلا بعد قبول الدكتور لطلبه
 *  - الدكاترة «approved» مباشرة (بعد تأكيد البريد عبر OTP)
 *  - الحسابات القديمة (بدون الحقل) تُعامل كأنها «approved»
 */
export type AccountStatus = "pending" | "approved" | "rejected";

/** صف من جدول users */
export interface AppUser {
  id: string;
  full_name: string;
  email: string;
  university_id: string;
  role: UserRole;
  /** صورة البطاقة — الوجه الأمامي (للطلاب) */
  id_card_url: string | null;
  /** صورة البطاقة — الوجه الخلفي/الظهر (للطلاب) */
  id_card_back_url: string | null;
  /** صورة شخصية (للطلاب والدكاترة) */
  personal_photo_url: string | null;
  /** المادة التي يدرّسها الدكتور (تُطلب عند إنشاء حسابه وتُعبّئ اسم الجلسة) */
  subject?: string | null;
  /** حالة الحساب — الطلاب الجدد «pending» حتى موافقة الدكتور */
  status?: AccountStatus;
  /** تأكيد البريد عبر OTP (للدكاترة) — الحسابات القديمة تعتبر مؤكدة */
  email_verified?: boolean | null;
  /** بيانات أكاديمية للطالب (تظهر في البطاقة الرقمية) */
  faculty?: string | null;
  program?: string | null;
  academic_year?: string | null;
  /** الجهاز المرتبط بالحساب — حماية من مشاركة بيانات الدخول */
  device_id?: string | null;
  /** متى رُبط الحساب بهذا الجهاز (آخر ربط) */
  device_linked_at?: string | null;
  created_at: string;
}

/** صف من جدول sessions مع اسم الدكتور (عبر علاقة users) */
export interface SessionRow {
  id: string;
  professor_id: string;
  /** اسم المادة/المحاضرة (اختياري — null يعني «جلسة حضور») */
  subject: string | null;
  lat: number | string;
  lng: number | string;
  radius: number;
  is_open: boolean;
  created_at: string;
  /** يأتي من الاستعلام المتداخل: sessions -> users(full_name) */
  users?: { full_name: string } | null;
}

/** صف من جدول attendance */
export interface AttendanceRow {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  university_id: string;
  /** حالة الحضور (يحددها الخادم حسب مهلة التأخير) */
  status?: AttendanceStatus;
  /** وقت تسجيل الحضور الدقيق (بالثانية — ISO) */
  check_in_time?: string;
  created_at: string;
}

/** نوع الإشعار — يُترجم عبر notif.{type}.title/body مع params */
export type NotificationType =
  | "session_opened"
  | "attendance_recorded"
  | "attendance_duplicate"
  | "attendance_warning"
  | "status_warning"
  | "status_critical"
  | "upcoming_class"
  | "session_closed"
  | "account_approved"
  | "account_rejected"
  | "device_transfer_request"
  | "device_transfer_approved"
  | "device_transfer_rejected"
  | "suspicious_activity"
  | "attendance_revoked"
  | "system";

/** صف من جدول notifications */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  /** بارامترات نص الإشعار (اسم المادة، الدكتور، النسبة...) */
  params: Record<string, string | number>;
  read: boolean;
  created_at: string;
}

/** صف من جدول warnings (إنذار سجّله دكتور على طالب) */
export interface WarningRow {
  id: string;
  professor_id: string;
  student_id: string;
  reason: string | null;
  created_at: string;
}

/** حالة محاضرة في الجدول — تُحسب من الوقت الحقيقي */
export type ScheduleStatus = "current" | "upcoming" | "finished";

/** صف من جدول schedule مع الحالة اللحظية المحسوبة خادمياً */
export interface ScheduleRow {
  id: string;
  professor_id: string;
  /** 0=الأحد ... 6=السبت */
  day_of_week: number;
  /** دقائق من منتصف الليل */
  start_minutes: number;
  end_minutes: number;
  subject: string;
  room: string | null;
  /** اسم الدكتور (عبر العلاقة) */
  professor_name: string | null;
  /** الحالة اللحظية المحسوبة من وقت الخادم */
  status: ScheduleStatus;
  /** دقائق حتى البدء (للـ upcoming فقط) */
  minutes_until_start: number | null;
}

/** نوع حدث النشاط المشبوه */
export type SuspiciousEventType =
  | "duplicate"
  | "closed_session"
  | "invalid_session"
  | "blocked_attempt"
  | "rate_limited"
  | "validation_bypass"
  | "device_mismatch"
  | "device_rebound"
  | "geo_bypass"
  | "out_of_range";

/** صف من جدول suspicious_events */
export interface SuspiciousEventRow {
  id: string;
  event_type: SuspiciousEventType;
  /** الطالب/الحساب المرتبط بالحدث (اسم للعرض) */
  actor_name: string | null;
  university_id: string | null;
  session_id: string | null;
  /** سبب تفصيلي (كود النطاق) */
  reason: string | null;
  created_at: string;
}

/** إحصائيات لوحة الطالب: نسبة الحضور + العدادات + الحالة الذكية */
export interface StudentStats {
  present: number;
  late: number;
  absent: number;
  /** إجمالي الجلسات المحسوبة (present + late + absent) */
  total: number;
  /** النسبة 0-100 أو null عند غياب البيانات */
  percentage: number | null;
  /** الحالة الذكية حسب العتبات القابلة للتعديل */
  smart_status: SmartStatus;
  /** العتبات المستخدمة (للعرض) */
  thresholds: { warning: number; critical: number };
  last_attended_at: string | null;
  /** عدد الإنذارات المسجّلة على الطالب */
  warnings: number;
}

/** حالة الاشتراك اللحظي (Realtime) */
export type RealtimeStatus = "connecting" | "live" | "error" | "closed";

/** إحصائيات حضور الطلاب لدى دكتور معين (تُعرض في لوحة الدكتور) */
export interface ProfessorRosterStats {
  /** إجمالي جلسات الدكتور */
  totalSessions: number;
  /** الجلسات المنتهية فقط (الجلسة الجارية لا تُحسب غياباً) */
  totalClosedSessions: number;
  /** عدد مرات الحضور لكل طالب (يشمل الجلسة الجارية) */
  attendedByStudent: Record<string, number>;
  /** عدد مرات الحضور في الجلسات المنتهية فقط (لحساب الغياب) */
  closedAttendedByStudent: Record<string, number>;
  /** عدد الإنذارات لكل طالب */
  warningsByStudent: Record<string, number>;
  /** معرفات الطلاب المحظورين (المفصولين من المادة) */
  blockedIds: string[];
}

/** موضع GPS الحالي */
export interface GeoPosition {
  lat: number;
  lng: number;
  /** دقة التحديد بالأمتار (±) */
  accuracy: number;
}

/** طلب ربط جهاز جديد بحساب طالب — يعرضه الدكتور في لوحته ويقرر فيه */
export interface DeviceRequestRow {
  id: string;
  /** الجهاز الجديد المطلوب ربطه */
  device_id: string;
  created_at: string;
  /** بيانات الطالب صاحب الطلب (اسم/رقم/بريد/صورة) */
  student: {
    id: string;
    full_name: string;
    university_id: string;
    email: string;
    personal_photo_url: string | null;
  } | null;
}
