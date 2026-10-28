"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الدكتور — قائمة الحضور (اللحظي + حضور آخر جلسة)
 * ============================================================================
 *  - تعرض الطلاب لحظة تسجيلهم حضورهم (Realtime) وتبقى ظاهرة بعد إنهاء الجلسة
 *  - لكل طالب: الاسم + الإيميل الجامعي + الرقم الجامعي + صورة البطاقة (اضغط
 *    على الصورة لعرض الملف كاملاً) + عدد الحضور والغياب والإنذارات
 *  - زر "بلوك" لحظر الطالب (فصله من المادة) فلا يستطيع تسجيل الحضور مجدداً
 *  - زر "إنذار" لتسجيل إنذار جديد على الطالب
 *  - تصدير السجل كاملاً بصيغة CSV (متوافق مع Excel بالعربية عبر BOM)
 * ============================================================================
 */

import * as React from "react";
import {
  AlertTriangle,
  Ban,
  Camera,
  Clock,
  Download,
  FlipHorizontal,
  IdCard,
  Loader2,
  Mail,
  Radio,
  Search,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
  UserRound,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTime, relativeTime } from "@/lib/format";
import { useI18n, attendanceStatusLabel } from "@/lib/i18n";
import { fetchStudentWarnings, type WarningRow } from "@/lib/data-layer";
import type {
  AppUser,
  AttendanceRow,
  ProfessorRosterStats,
  RealtimeStatus,
} from "@/lib/types";

/* أفاتارز رمادية متدرجة خفيفة — تكمل الهوية الأحادية (الحروف الأولى تميز الطالب) */
const AVATAR_GRADIENTS = [
  "from-zinc-800 to-zinc-600",
  "from-stone-700 to-stone-500",
  "from-neutral-700 to-neutral-500",
  "from-zinc-700 to-zinc-500",
  "from-stone-600 to-stone-400",
];

function initialsOf(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");
}

/** حماية خلايا CSV (علامات الاقتباس المزدوجة) */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export interface LiveAttendanceProps {
  attendance: AttendanceRow[];
  status: RealtimeStatus;
  loading: boolean;
  /** هل القائمة مرتبطة بجلسة مفتوحة الآن؟ */
  isLiveSession: boolean;
  /** التوقيت الحالي لتحديث الأزمنة النسبية */
  now: number;
  /** ملفات الطلاب (الإيميل الجامعي + صورة البطاقة) حسب المعرف */
  profilesById: Record<string, AppUser>;
  /** إحصائيات الحضور/الغياب/الإنذارات/المحظورين */
  stats: ProfessorRosterStats | null;
  /** حظر طالب أو فك الحظر عنه */
  onToggleBlock: (studentId: string, currentlyBlocked: boolean) => void;
  /** تسجيل إنذار على طالب */
  onWarn: (studentId: string, studentName: string) => void;
  /** معرف الطالب الجاري تنفيذ إجراء عليه الآن (بلوك/إنذار/حذف...) */
  actionBusyStudentId: string | null;
  /** معرف الدكتور — لجلب إنذارات الطالب في ملفه */
  professorId: string;
  /** تحويل حالة الحضور (حاضر ↔ متأخر) */
  onToggleStatus: (row: AttendanceRow) => void;
  /** حذف سجل حضور نهائياً (بتأكيد من الأب) */
  onDeleteAttendance: (row: AttendanceRow) => void;
  /** حذف إنذار نهائياً (بتأكيد من الأب) */
  onDeleteWarning: (warningId: string, studentId: string, studentName: string) => void;
}

export function LiveAttendance({
  attendance,
  status,
  loading,
  isLiveSession,
  now,
  profilesById,
  stats,
  onToggleBlock,
  onWarn,
  actionBusyStudentId,
  professorId,
  onToggleStatus,
  onDeleteAttendance,
  onDeleteWarning,
}: LiveAttendanceProps) {
  const { t, locale } = useI18n();
  const [viewing, setViewing] = React.useState<AppUser | null>(null);

  /* إنذارات الطالب المعروض في ملفه — تُجلب عند فتح الملف وعند تحديث الإحصائيات */
  const [viewingWarnings, setViewingWarnings] = React.useState<WarningRow[] | null>(null);
  const [warningsLoading, setWarningsLoading] = React.useState(false);

  /* بحث/فلترة بالاسم أو الرقم الجامعي أو البريد */
  const [query, setQuery] = React.useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAttendance = React.useMemo(() => {
    if (!normalizedQuery) return attendance;
    return attendance.filter((row) => {
      const email = profilesById[row.student_id]?.email ?? "";
      return (
        row.student_name.toLowerCase().includes(normalizedQuery) ||
        row.university_id.toLowerCase().includes(normalizedQuery) ||
        email.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [attendance, normalizedQuery, profilesById]);

  const actionsBusy = actionBusyStudentId !== null;

  /* ------------------- إحصائيات طالب معين لدى الدكتور ------------------- */

  function statsOf(studentId: string) {
    const attended = stats ? (stats.attendedByStudent[studentId] ?? 0) : 0;
    const absences = stats
      ? Math.max(
          0,
          stats.totalClosedSessions -
            (stats.closedAttendedByStudent[studentId] ?? 0)
        )
      : 0;
    const warnings = stats ? (stats.warningsByStudent[studentId] ?? 0) : 0;
    const blocked = stats ? stats.blockedIds.includes(studentId) : false;
    return { attended, absences, warnings, blocked };
  }

  const viewingStats = viewing ? statsOf(viewing.id) : null;

  /* جلب إنذارات الطالب عند فتح ملفه (ومع كل تحديث للإحصائيات بعد حذف إنذار مثلاً) */
  React.useEffect(() => {
    if (!viewing) {
      setViewingWarnings(null);
      return;
    }
    let stopped = false;
    setWarningsLoading(true);
    fetchStudentWarnings(professorId, viewing.id)
      .then((rows) => {
        if (!stopped) setViewingWarnings(rows);
      })
      .catch(() => {
        if (!stopped) setViewingWarnings([]);
      })
      .finally(() => {
        if (!stopped) setWarningsLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [professorId, viewing, stats]);

  /* ------------------------- تصدير السجل CSV ------------------------- */

  function exportCsv() {
    if (filteredAttendance.length === 0) return;

    const header =
      t("professor.csvHeaders");
    const rows = filteredAttendance
      .map((row) => {
        const { attended, absences, warnings, blocked } = statsOf(
          row.student_id
        );
        const email = profilesById[row.student_id]?.email ?? "";
        const time = new Date(row.created_at).toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB");
        return [
          csvCell(row.student_name),
          csvCell(email),
          csvCell(row.university_id),
          time,
          attendanceStatusLabel(locale, row.status ?? "present"),
          String(attended),
          String(absences),
          String(warnings),
          blocked ? t("professor.csvStatusBlocked") : t("professor.csvStatusActive"),
        ].join(",");
      })
      .join("\n");

    const csv = `\uFEFF${header}\n${rows}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `imin-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const statusLabel =
    status === "live"
      ? t("professor.statLiveOpen")
      : status === "connecting"
        ? t("professor.statLiveConnecting")
        : status === "error"
          ? t("professor.statLiveError")
          : t("professor.statLiveOffline");

  /** الطلاب المحظورون غير الموجودين في قائمة الحضور الحالية */
  const blockedOnlyStudents = (stats?.blockedIds ?? []).filter(
    (studentId) => !attendance.some((row) => row.student_id === studentId)
  );

  /* ------------------------------- العرض ------------------------------ */

  return (
    <section className="glass-card flex flex-col p-5 sm:p-6" aria-label={t("professor.liveTitle")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-black">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <Users className="h-5 w-5" />
          </span>
          {isLiveSession ? t("professor.liveTitle") : t("professor.liveTitleClosed")}
          <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-sm font-black tabular-nums text-primary">
            {attendance.length}
          </span>
        </h2>

        <div className="flex items-center gap-2.5">
          {isLiveSession && (
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                status === "live"
                  ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                  : status === "error"
                    ? "bg-rose-500/12 text-rose-600 dark:text-rose-400"
                    : "bg-amber-500/12 text-amber-600 dark:text-amber-400"
              }`}
              title={t("professor.connectionStatusAria", { status: statusLabel })}
            >
              <span className={`live-dot ${status === "error" ? "live-dot--error" : ""}`} />
              <Radio className="h-3 w-3" />
              {statusLabel}
            </span>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={attendance.length === 0}
            aria-label={t("professor.exportCsvAria")}
            title={t("professor.exportCsvTitle")}
            className="glass-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-foreground/80 transition-all hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            {t("professor.exportCsv")}
          </button>
        </div>
      </header>

      {/* القائمة */}
      <div className="mt-4 flex-1">
        {/* البحث — يظهر عند وجود حضور فعلي */}
        {attendance.length > 0 && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("professor.searchPlaceholder")}
              className="input-glass h-10 ps-10 text-sm font-bold"
              aria-label={t("professor.searchAria")}
            />
            {normalizedQuery && (
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] font-extrabold tabular-nums text-muted-foreground">
                {filteredAttendance.length} / {attendance.length}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-2.5" aria-label={t("professor.loadingList")}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white/35 dark:bg-white/4 px-4 py-3"
              >
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded-full" />
                  <Skeleton className="h-3 w-44 rounded-full" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        ) : attendance.length === 0 && blockedOnlyStudents.length === 0 ? (
          <div
            className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border text-center"
            aria-label={t("professor.emptyLive")}
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <UserRound className="h-7 w-7" />
            </span>
            <p className="text-sm font-bold text-muted-foreground">
              {isLiveSession
                ? t("professor.emptyLive")
                : t("professor.emptyClosed")}
            </p>
            <p className="max-w-[240px] text-xs leading-relaxed text-muted-foreground/80">
              {isLiveSession
                ? t("professor.emptyLiveHint")
                : t("professor.emptyClosedHint")}
            </p>
          </div>
        ) : filteredAttendance.length === 0 && normalizedQuery ? (
          /* حالة خاصة: البحث لم يُرجع نتائج */
          <div
            className="flex h-48 flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-border text-center"
            aria-label={t("professor.noSearchResults")}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Search className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-muted-foreground">
              {t("professor.noSearchResults", { query: query.trim() })}
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs font-extrabold text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {t("professor.clearSearch")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* الطلاب المحظورون غير الحاضرين في هذه القائمة */}
            {blockedOnlyStudents.length > 0 && (
              <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 px-4 py-3">
                <p className="flex items-center gap-2 text-xs font-extrabold text-rose-600 dark:text-rose-400">
                  <Ban className="h-4 w-4" />
                  {t("professor.blockedSection")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {blockedOnlyStudents.map((studentId) => (
                    <span
                      key={studentId}
                      className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-foreground"
                    >
                      {profilesById[studentId]?.full_name ?? t("common.student")}
                      <button
                        type="button"
                        onClick={() => onToggleBlock(studentId, true)}
                        disabled={actionsBusy}
                        className="grid h-6 w-6 place-items-center rounded-full text-emerald-600 transition-colors hover:bg-emerald-500/15 dark:text-emerald-400"
                        title={t("professor.unblockHint")}
                        aria-label={t("professor.unblockAria")}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* قائمة الحضور ببياناتها الكاملة */}
            <ul className="nice-scroll max-h-[30rem] space-y-2.5 overflow-y-auto pe-1" dir="rtl">
              {filteredAttendance.map((row, index) => {
                const profile = profilesById[row.student_id];
                const { attended, absences, warnings, blocked } = statsOf(
                  row.student_id
                );
                const busy = actionsBusy;

                return (
                  <li
                    key={row.id}
                    className={`row-enter rounded-2xl border px-4 py-3 transition-colors ${
                      blocked
                        ? "border-rose-500/40 bg-rose-500/5"
                        : "border-border/60 bg-white/45 dark:bg-white/5 hover:bg-white/65 dark:hover:bg-white/8"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* الصورة الشخصية للطالب — اضغط لعرض الملف كاملاً */}
                      <button
                        type="button"
                        onClick={() => profile && setViewing(profile)}
                        className="relative shrink-0 rounded-full disabled:cursor-default"
                        disabled={!profile}
                        title={profile ? t("professor.viewProfileHint") : undefined}
                        aria-label={
                          profile
                            ? t("professor.viewProfileAria", { name: row.student_name })
                            : undefined
                        }
                      >
                        {profile && (profile.personal_photo_url || profile.id_card_url) ? (
                          <img
                            src={(profile.personal_photo_url ?? profile.id_card_url) ?? undefined}
                            alt=""
                            className="h-11 w-11 rounded-full object-cover ring-2 ring-border"
                          />
                        ) : (
                          <span
                            className={`grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br text-sm font-black text-white ${
                              AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]
                            }`}
                            aria-hidden="true"
                          >
                            {initialsOf(row.student_name)}
                          </span>
                        )}
                        {profile && (profile.personal_photo_url || profile.id_card_url) && (
                          <span className="absolute -bottom-0.5 -end-0.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-primary text-white shadow">
                            <Camera className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </button>

                      {/* الاسم + الإيميل الجامعي + الرقم */}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-extrabold text-foreground">
                          <span className="truncate">{row.student_name}</span>
                          {blocked && (
                            <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-extrabold text-rose-600 dark:text-rose-400">
                              {t("professor.blockedLabel")}
                            </span>
                          )}
                        </p>
                        <p
                          className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground"
                          dir="ltr"
                          title={profile?.email ?? ""}
                        >
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {profile?.email ?? row.university_id}
                          </span>
                        </p>
                        <p
                          className="mt-0.5 text-[11px] font-bold tabular-nums text-muted-foreground/80"
                          dir="ltr"
                        >
                          {row.university_id}
                        </p>
                      </div>

                      {/* وقت التسجيل */}
                      <div className="flex shrink-0 flex-col items-end leading-tight">
                        <span className="text-sm font-black tabular-nums text-foreground">
                          {formatTime(row.check_in_time ?? row.created_at, locale)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {relativeTime(row.created_at, now, locale)}
                        </span>
                        <span
                          className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            (row.status ?? "present") === "present"
                              ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {attendanceStatusLabel(locale, row.status ?? "present")}
                        </span>
                      </div>
                    </div>

                    {/* الإحصائيات + أزرار: تحويل الحالة / الإنذار / البلوك / حذف الحضور */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                        {t("professor.attendedLabel")}
                        <span className="tabular-nums">{attended}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2.5 py-1 text-[11px] font-extrabold text-rose-600 dark:text-rose-400">
                        {t("professor.absencesLabel")}
                        <span className="tabular-nums">{absences}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2.5 py-1 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
                        {t("professor.warningsLabel")}
                        <span className="tabular-nums">{warnings}</span>
                      </span>

                      <span className="flex-1" />

                      {/* تحويل حالة الحضور: حاضر ↔ متأخر (تصحيح فوري بدون نافذة) */}
                      <button
                        type="button"
                        onClick={() => onToggleStatus(row)}
                        disabled={busy}
                        className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-extrabold transition-colors disabled:opacity-50 ${
                          (row.status ?? "present") === "present"
                            ? "bg-sky-500/12 text-sky-600 hover:bg-sky-500/22 dark:text-sky-400"
                            : "bg-emerald-500/12 text-emerald-600 hover:bg-emerald-500/22 dark:text-emerald-400"
                        }`}
                        title={
                          (row.status ?? "present") === "present"
                            ? t("professor.toggleToLateBtn")
                            : t("professor.toggleToPresentBtn")
                        }
                        aria-label={
                          (row.status ?? "present") === "present"
                            ? t("professor.toggleToLateBtn")
                            : t("professor.toggleToPresentBtn")
                        }
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {(row.status ?? "present") === "present"
                          ? t("professor.toggleToLateBtn")
                          : t("professor.toggleToPresentBtn")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onWarn(row.student_id, row.student_name)}
                        disabled={busy}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-amber-500/12 px-2.5 text-[11px] font-extrabold text-amber-600 transition-colors hover:bg-amber-500/22 disabled:opacity-50 dark:text-amber-400"
                        title={t("professor.warnHint")}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t("professor.warnBtn")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onToggleBlock(row.student_id, blocked)
                        }
                        disabled={busy}
                        className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-extrabold transition-colors disabled:opacity-50 ${
                          blocked
                            ? "bg-emerald-500/12 text-emerald-600 hover:bg-emerald-500/22 dark:text-emerald-400"
                            : "bg-rose-500/12 text-rose-600 hover:bg-rose-500/22 dark:text-rose-400"
                        }`}
                        title={
                          blocked
                            ? t("professor.unblockHintLong")
                            : t("professor.blockHintLong")
                        }
                      >
                        {blocked ? (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {t("professor.unblockBtn")}
                          </>
                        ) : (
                          <>
                            <Ban className="h-3.5 w-3.5" />
                            {t("professor.blockBtn")}
                          </>
                        )}
                      </button>

                      {/* حذف سجل الحضور نهائياً (بتأكيد) */}
                      <button
                        type="button"
                        onClick={() => onDeleteAttendance(row)}
                        disabled={busy}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-500/12 text-rose-600 transition-all hover:bg-rose-500/25 hover:scale-105 active:scale-95 disabled:opacity-50 dark:text-rose-400"
                        title={t("professor.deleteAttendanceAria", { name: row.student_name })}
                        aria-label={t("professor.deleteAttendanceAria", { name: row.student_name })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* نافذة ملف الطالب (الصور الثلاث + البيانات + الإحصائيات) */}
      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-md">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{t("professor.profileTitle")}</DialogTitle>
                <DialogDescription>
                  {t("professor.profileNote")}
                </DialogDescription>
              </DialogHeader>

              {viewing.personal_photo_url || viewing.id_card_url || viewing.id_card_back_url ? (
                <div className="space-y-3">
                  {/* الصورة الشخصية — كبيرة وواضحة */}
                  {viewing.personal_photo_url && (
                    <div>
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                        <UserRound className="h-3.5 w-3.5 text-primary" />
                        {t("professor.personalPhoto")}
                      </p>
                      <img
                        src={viewing.personal_photo_url}
                        alt={t("professor.personalPhotoOf", { name: viewing.full_name })}
                        className="max-h-56 w-full rounded-xl object-contain ring-1 ring-border"
                      />
                    </div>
                  )}

                  {/* بطاقة الوش + بطاقة الظهر — جنباً إلى جنب */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {viewing.id_card_url && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-extrabold text-foreground">
                          <IdCard className="h-3.5 w-3.5 text-primary" />
                          {t("professor.idFront")}
                        </p>
                        <img
                          src={viewing.id_card_url}
                          alt={t("idCard.idFrontOf", { name: viewing.full_name })}
                          className="h-32 w-full rounded-xl object-cover ring-1 ring-border"
                        />
                      </div>
                    )}
                    {viewing.id_card_back_url && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-extrabold text-foreground">
                          <FlipHorizontal className="h-3.5 w-3.5 text-primary" />
                          {t("professor.idBack")}
                        </p>
                        <img
                          src={viewing.id_card_back_url}
                          alt={t("idCard.idBackOf", { name: viewing.full_name })}
                          className="h-32 w-full rounded-xl object-cover ring-1 ring-border"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-muted text-sm font-bold text-muted-foreground">
                  {t("professor.noPhotos")}
                </div>
              )}

              <div className="space-y-2 text-sm">
                <p className="font-extrabold text-foreground">
                  {viewing.full_name}
                </p>
                <p
                  className="flex items-center gap-2 text-muted-foreground"
                  dir="ltr"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {viewing.email}
                </p>
                <p className="font-bold tabular-nums text-muted-foreground" dir="ltr">
                  {viewing.university_id}
                </p>
                {viewingStats && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                      {t("professor.attendedLabel")} {viewingStats.attended}
                    </span>
                    <span className="rounded-full bg-rose-500/12 px-2.5 py-1 text-[11px] font-extrabold text-rose-600 dark:text-rose-400">
                      {t("professor.absencesLabel")} {viewingStats.absences}
                    </span>
                    <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
                      {t("professor.warningsLabel")} {viewingStats.warnings}
                    </span>
                    {viewingStats.blocked && (
                      <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-extrabold text-rose-600 dark:text-rose-400">
                        {t("professor.blockedLabel")}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* إنذارات الطالب — قائمة قابلة للحذف سجلاً بسجل */}
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3.5">
                <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t("professor.profileWarningsTitle")}
                </p>

                {warningsLoading ? (
                  <div className="mt-2 flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("common.loading")}
                  </div>
                ) : !viewingWarnings || viewingWarnings.length === 0 ? (
                  <p className="mt-2 text-xs font-bold text-muted-foreground">
                    {t("professor.profileWarningsEmpty")}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {viewingWarnings.map((warning) => (
                      <li
                        key={warning.id}
                        className="flex items-center gap-2 rounded-xl bg-white/45 dark:bg-white/5 px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 text-[11px] font-bold leading-relaxed text-muted-foreground">
                          {relativeTime(warning.created_at, now, locale)}
                          {warning.reason && (
                            <span className="block truncate text-foreground">
                              {warning.reason}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onDeleteWarning(warning.id, viewing.id, viewing.full_name)
                          }
                          disabled={actionBusyStudentId !== null}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-500/12 text-rose-600 transition-all hover:bg-rose-500/25 hover:scale-105 active:scale-95 disabled:opacity-50 dark:text-rose-400"
                          title={t("professor.deleteWarningAria")}
                          aria-label={t("professor.deleteWarningAria")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
