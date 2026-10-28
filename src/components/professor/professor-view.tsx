"use client";

/**
 * ============================================================================
 *  ImIn | لوحة تحكم الدكتور — النسخة المطوّرة
 * ============================================================================
 *  - فتح جلسة محاضرة جديدة: التقاط موقع GPS + نطاق الأمتار (radius)
 *  - عرض الحضور الفوري واللحظي (Realtime) مع حالة كل طالب (حاضر/متأخر)
 *  - سجل الأنشطة المشبوهة (محاولات مكررة / رموز منتهية / تجاوز التحقق)
 *  - مركز إشعارات في الشريط العلوي (طلبات التسجيل تلقّى إشعاراً)
 *  - كامل الترجمة عربي/إنجليزي مع RTL/LTR
 * ============================================================================
 */

import * as React from "react";
import { toast } from "sonner";
import { Users, Radio, Radius, BookOpen, BellRing } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { DemoBadge } from "@/components/demo-badge";
import { SessionControl } from "@/components/professor/session-control";
import { LiveAttendance } from "@/components/professor/live-attendance";
import { SessionHistory } from "@/components/professor/session-history";
import { PendingStudents } from "@/components/professor/pending-students";
import { DeviceRequests } from "@/components/professor/device-requests";
import { SuspiciousLog } from "@/components/professor/suspicious-log";
import {
  ConfirmAction,
  type PendingAction,
} from "@/components/professor/confirm-action";
import {
  fetchProfessorSessions,
  fetchAttendance,
  createSession,
  closeSession,
  updateSession,
  deleteSession,
  deleteAttendance,
  updateAttendanceStatus,
  deleteWarning,
  subscribeAttendanceUpdates,
  fetchProfessorStats,
  fetchStudentProfiles,
  blockStudent,
  unblockStudent,
  warnStudent,
} from "@/lib/data-layer";
import { useI18n, localizedError } from "@/lib/i18n";
import { formatDate, greetingForNow } from "@/lib/format";
import type {
  AppUser,
  AttendanceRow,
  ProfessorRosterStats,
  RealtimeStatus,
  SessionRow,
} from "@/lib/types";

export function ProfessorView({
  user,
  onLogout,
}: {
  user: AppUser;
  onLogout: () => void;
}) {
  const { t, locale } = useI18n();
  const [session, setSession] = React.useState<SessionRow | null>(null);
  const [attendance, setAttendance] = React.useState<AttendanceRow[]>([]);
  const [realtimeStatus, setRealtimeStatus] = React.useState<RealtimeStatus>("closed");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  /* إحصائيات الطلاب (حضور/غياب/إنذارات/محظورون) وملفاتهم */
  const [stats, setStats] = React.useState<ProfessorRosterStats | null>(null);
  const [profilesById, setProfilesById] = React.useState<Record<string, AppUser>>({});
  const [actionBusyStudentId, setActionBusyStudentId] = React.useState<string | null>(null);

  /* الإجراء المعلّق الذي ينتظر تأكيد الدكتور (إنذار/حظر/فك حظر) */
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);

  /* عدد طلبات تسجيل الطلاب المنتظرة موافقة الدكتور */
  const [pendingRequestsCount, setPendingRequestsCount] = React.useState(0);

  /* إشارة تحديث الإشعارات (ترتفع عند تغيّر الطلبات المعلقة) */
  const [notificationsSignal, setNotificationsSignal] = React.useState(0);

  const sessionOpen = Boolean(session?.is_open);

  /* مرآة ref لقائمة الحضور — تقرأها refreshRoster دون الاعتماد عليها */
  const attendanceRef = React.useRef<AttendanceRow[]>([]);
  React.useEffect(() => {
    attendanceRef.current = attendance;
  }, [attendance]);

  /* ------------------------------------------------------------------ */
  /*  عدّاد الزمن: كل ثانية أثناء الجلسة المفتوحة وكل 30 ثانية فيما عداها  */
  /* ------------------------------------------------------------------ */
  React.useEffect(() => {
    const interval = sessionOpen ? 1000 : 30000;
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [sessionOpen]);

  /* ------------------------------------------------------------------ */
  /*  تحميل آخر جلسة (المفتوحة أولاً) + حضورها عند فتح اللوحة             */
  /* ------------------------------------------------------------------ */
  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const { open, lastClosed } = await fetchProfessorSessions(user.id);

      if (open) {
        setSession(open);
        await loadAttendanceFor(open.id);
        return;
      }

      if (lastClosed) {
        setSession(lastClosed);
        await loadAttendanceFor(lastClosed.id);
      } else {
        setSession(null);
        setAttendance([]);
      }
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, locale]);

  React.useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function loadAttendanceFor(sessionId: string) {
    try {
      const rows = await fetchAttendance(sessionId);
      setAttendance(rows);
    } catch (error) {
      toast.error(localizedError(error, locale));
    }
  }

  /* ------------------------------------------------------------------ */
  /*  إحصائيات وملفات الطلاب — تُحدَّث عند الفتح وعند تسجيل حضور جديد       */
  /* ------------------------------------------------------------------ */
  const refreshRoster = React.useCallback(async () => {
    try {
      const statsData = await fetchProfessorStats(user.id);
      setStats(statsData);

      const ids = new Set<string>([
        ...attendanceRef.current.map((row) => row.student_id),
        ...statsData.blockedIds,
      ]);
      if (ids.size > 0) {
        const profiles = await fetchStudentProfiles([...ids]);
        setProfilesById(
          Object.fromEntries(profiles.map((profile) => [profile.id, profile]))
        );
      } else {
        setProfilesById({});
      }
    } catch (error) {
      toast.error(localizedError(error, locale));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, locale]);

  const attendanceCount = attendance.length;
  React.useEffect(() => {
    void refreshRoster();
  }, [refreshRoster, attendanceCount]);

  /* ------------------------------------------------------------------ */
  /*  الاشتراك اللحظي (Realtime) في تسجيلات الحضور للجلسة المفتوحة        */
  /* ------------------------------------------------------------------ */
  React.useEffect(() => {
    if (!session?.id || !session.is_open) {
      setRealtimeStatus("closed");
      return;
    }

    const unsubscribe = subscribeAttendanceUpdates(session.id, {
      onRows: (rows) => setAttendance(rows),
      onAppend: (newRow) => {
        setAttendance((previous) =>
          previous.some((row) => row.id === newRow.id) ? previous : [newRow, ...previous]
        );
      },
      onStatus: (status) => setRealtimeStatus(status),
    });

    return unsubscribe;
  }, [session?.id, session?.is_open]);

  /* ------------------------------------------------------------------ */
  /*  إنشاء جلسة جديدة (is_open = true)                                   */
  /* ------------------------------------------------------------------ */
  async function handleCreateSession(
    coords: { lat: number; lng: number; accuracy: number },
    radius: number,
    subject: string
  ): Promise<boolean> {
    setBusy(true);
    try {
      const created = await createSession({
        professor_id: user.id,
        subject: subject.length > 0 ? subject : null,
        lat: coords.lat,
        lng: coords.lng,
        radius,
      });

      setSession(created);
      setAttendance([]);
      toast.success(
        subject.length > 0
          ? t("professor.sessionOpenedToast", { subject, radius })
          : t("professor.sessionOpenedToastNoSubject", { radius })
      );
      return true;
    } catch (error) {
      toast.error(localizedError(error, locale));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  إنهاء الجلسة (is_open = false)                                      */
  /* ------------------------------------------------------------------ */
  async function handleCloseSession() {
    if (!session) return;
    setBusy(true);
    try {
      await closeSession(session.id);

      setSession({ ...session, is_open: false });
      toast.success(t("professor.sessionClosedToast", { count: attendance.length }));
      setNotificationsSignal((n) => n + 1);
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  تعديل بيانات الجلسة المفتوحة (المادة/النطاق/الموقع)                 */
  /* ------------------------------------------------------------------ */
  async function handleUpdateSession(updates: {
    subject: string;
    radius: number;
    lat: number;
    lng: number;
  }): Promise<boolean> {
    if (!session) return false;
    setBusy(true);
    try {
      const updated = await updateSession({
        session_id: session.id,
        professor_id: user.id,
        ...updates,
      });
      setSession(updated);
      toast.success(t("professor.sessionUpdatedToast"));
      return true;
    } catch (error) {
      toast.error(localizedError(error, locale));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  تحويل حالة الحضور (حاضر ↔ متأخر) — تصحيح فوري                      */
  /* ------------------------------------------------------------------ */
  async function handleToggleStatus(row: AttendanceRow) {
    const next = (row.status ?? "present") === "present" ? "late" : "present";
    setActionBusyStudentId(row.student_id);
    try {
      await updateAttendanceStatus(row.id, user.id, next);
      setAttendance((previous) =>
        previous.map((item) => (item.id === row.id ? { ...item, status: next } : item))
      );
      toast.success(t("professor.statusUpdatedToast", { name: row.student_name }));
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setActionBusyStudentId(null);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  تنفيذ الإجراء المعلّق بعد تأكيده من نافذة الحوار                    */
  /* ------------------------------------------------------------------ */
  async function executePendingAction() {
    if (!pendingAction) return;
    const { type } = pendingAction;

    try {
      if (type === "warn") {
        setActionBusyStudentId(pendingAction.studentId);
        await warnStudent(user.id, pendingAction.studentId);
        toast.success(t("professor.warnToast", { name: pendingAction.studentName }));
        await refreshRoster();
      } else if (type === "block") {
        setActionBusyStudentId(pendingAction.studentId);
        await blockStudent(user.id, pendingAction.studentId);
        toast.success(t("professor.blockToast"));
        await refreshRoster();
      } else if (type === "unblock") {
        setActionBusyStudentId(pendingAction.studentId);
        await unblockStudent(user.id, pendingAction.studentId);
        toast.success(t("professor.unblockToast"));
        await refreshRoster();
      } else if (type === "delete-attendance") {
        setActionBusyStudentId(pendingAction.studentId);
        await deleteAttendance(pendingAction.attendanceId, user.id);
        setAttendance((previous) => previous.filter((row) => row.id !== pendingAction.attendanceId));
        toast.success(t("professor.attendanceDeletedToast", { name: pendingAction.studentName }));
        await refreshRoster();
      } else if (type === "delete-warning") {
        setActionBusyStudentId(pendingAction.studentId);
        await deleteWarning(pendingAction.warningId, user.id);
        toast.success(t("professor.warningDeletedToast"));
        await refreshRoster();
      } else if (type === "delete-session") {
        setBusy(true);
        const result = await deleteSession(pendingAction.sessionId, user.id);
        toast.success(
          t("professor.sessionDeletedToast", { count: result.removedAttendance })
        );
        // إعادة تحميل اللوحة كاملة: الجلسة المعروضة/حضورها قد يكونا المحذوفين
        await loadDashboard();
        setNotificationsSignal((n) => n + 1);
      }
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setActionBusyStudentId(null);
      setPendingAction(null);
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  طلب حذف جلسة من السجل — تأكيد موحّد ثم تنفيذ                        */
  /* ------------------------------------------------------------------ */
  function handleDeleteSession(
    row: { id: string; subject: string | null; attendanceCount: number }
  ) {
    // وصف الجلسة للتأكيد: المادة (أو الاسم الافتراضي) + عدد الحضور المسجّل فيها
    const label = `${row.subject ?? t("professor.sessionDefaultName")} — ${row.attendanceCount}`;
    setPendingAction({
      type: "delete-session",
      sessionId: row.id,
      sessionLabel: label,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  حذف حضور/إنذار — تأكيد موحّد ثم تنفيذ                               */
  /* ------------------------------------------------------------------ */
  function handleDeleteAttendance(row: AttendanceRow) {
    setPendingAction({
      type: "delete-attendance",
      attendanceId: row.id,
      studentId: row.student_id,
      studentName: row.student_name,
    });
  }

  function handleDeleteWarning(warningId: string, studentId: string, studentName: string) {
    setPendingAction({
      type: "delete-warning",
      warningId,
      studentId,
      studentName,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  حظر طالب / فك الحظر (فصل من المادة) — بتأكيد موحّد                  */
  /* ------------------------------------------------------------------ */
  function handleToggleBlock(studentId: string, currentlyBlocked: boolean) {
    const studentName = profilesById[studentId]?.full_name ?? t("common.student");
    setPendingAction({
      type: currentlyBlocked ? "unblock" : "block",
      studentId,
      studentName,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  تسجيل إنذار على طالب — بتأكيد موحّد                                 */
  /* ------------------------------------------------------------------ */
  function handleWarn(studentId: string, studentName: string) {
    setPendingAction({ type: "warn", studentId, studentName });
  }

  /* ------------------------------------------------------------------ */
  /*  العرض                                                               */
  /* ------------------------------------------------------------------ */

  const liveStatusLabel =
    sessionOpen
      ? realtimeStatus === "live"
        ? t("professor.statLiveOpen")
        : realtimeStatus === "connecting"
          ? t("professor.statLiveConnecting")
          : realtimeStatus === "error"
            ? t("professor.statLiveError")
            : t("professor.statLiveOffline")
      : t("professor.statNoSession");

  return (
    <main className="relative flex min-h-screen flex-col">
      {/* الخلفية الزجاجية المتوهجة */}
      <div className="orbs" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
      </div>

      <AppHeader
        badge={t("header.professorBadge")}
        onLogout={onLogout}
        extra={<DemoBadge />}
        userId={user.id}
        notificationsRefreshSignal={notificationsSignal}
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6 sm:px-6">
        {/* الترحيب */}
        <section className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-foreground sm:text-[1.7rem]">
              {greetingForNow(new Date(), locale)} {t("common.professorPrefix")}
              {user.full_name.split(" ")[0]}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{formatDate(new Date().toISOString(), locale)}</span>
              {user.subject && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">
                  <BookOpen className="h-3.5 w-3.5" />
                  {t("professor.subjectBadge", { subject: user.subject })}
                </span>
              )}
              {pendingRequestsCount > 0 && (
                <span className="inline-flex animate-none items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1 text-xs font-extrabold text-amber-600 dark:text-amber-400">
                  <BellRing className="h-3.5 w-3.5" />
                  {t("professor.pendingRequests", { count: pendingRequestsCount })}
                </span>
              )}
            </p>
          </div>
          <p className="text-xs font-bold text-muted-foreground" dir="ltr">
            {user.email}
          </p>
        </section>

        {/* بطاقات الإحصائيات */}
        <section className="grid grid-cols-3 gap-3 sm:gap-4" aria-label={t("professor.statLiveTitle")}>
          <div className="glass-card flex items-center gap-3 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
              <Users className="h-5.5 w-5.5" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-black tabular-nums text-foreground leading-none">
                {loading ? "—" : attendance.length}
              </p>
              <p className="mt-1 text-xs font-bold leading-snug text-muted-foreground">
                {t("professor.statPresent")}
              </p>
            </div>
          </div>

          <div className="glass-card flex items-center gap-3 p-4">
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                sessionOpen
                  ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Radio className="h-5.5 w-5.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-foreground leading-none">
                {liveStatusLabel}
              </p>
              <p className="mt-1 text-xs font-bold leading-snug text-muted-foreground">
                {t("professor.statLiveTitle")}
              </p>
            </div>
          </div>

          <div className="glass-card flex items-center gap-3 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500/12 text-amber-600 dark:text-amber-400">
              <Radius className="h-5.5 w-5.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black tabular-nums text-foreground leading-none" dir="ltr">
                {session ? `${session.radius} ${t("common.metersShort")}` : "—"}
              </p>
              <p className="mt-1 text-xs font-bold leading-snug text-muted-foreground">
                {t("professor.statRange")}
              </p>
            </div>
          </div>
        </section>

        {/* طلبات تسجيل الطلاب — قبول/رفض حمايةً للنظام */}
        <PendingStudents
          refreshKey={`${session?.id ?? "none"}-${sessionOpen ? "open" : "closed"}`}
          onCountChange={(count) => {
            setPendingRequestsCount(count);
            if (count > 0) setNotificationsSignal((n) => n + 1);
          }}
        />

        {/* طلبات ربط جهاز جديد — قرار الدكتور بعد رفض الدخول من جهاز مختلف */}
        <DeviceRequests
          professorId={user.id}
          refreshKey={`${session?.id ?? "none"}-${sessionOpen ? "open" : "closed"}`}
        />

        {/* الشبكة الرئيسية: التحكم بالجلسة + قائمة الحضور بالبيانات الكاملة */}
        <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SessionControl
              session={session}
              presentCount={attendance.length}
              busy={busy}
              now={now}
              defaultSubject={user.subject ?? null}
              onCreateSession={handleCreateSession}
              onCloseSession={handleCloseSession}
              onUpdateSession={handleUpdateSession}
            />
          </div>
          <div className="lg:col-span-3">
            <LiveAttendance
              attendance={attendance}
              status={realtimeStatus}
              loading={loading}
              isLiveSession={sessionOpen}
              now={now}
              profilesById={profilesById}
              stats={stats}
              onToggleBlock={handleToggleBlock}
              onWarn={handleWarn}
              actionBusyStudentId={actionBusyStudentId}
              professorId={user.id}
              onToggleStatus={handleToggleStatus}
              onDeleteAttendance={handleDeleteAttendance}
              onDeleteWarning={handleDeleteWarning}
            />
          </div>
        </div>

        {/* سجل الجلسات السابقة (قابل للطي) — يتحدّث عند فتح/إنهاء جلسة */}
        <SessionHistory
          professorId={user.id}
          now={now}
          refreshKey={`${session?.id ?? "none"}-${sessionOpen ? "open" : "closed"}`}
          onDeleteSession={handleDeleteSession}
        />

        {/* سجل الأنشطة المشبوهة — كشف محاولات التلاعب */}
        <SuspiciousLog refreshKey={notificationsSignal} />
      </div>

      {/* تذييل */}
      <footer className="relative z-10 py-5 text-center text-xs text-muted-foreground">
        {t("professor.footer")}
      </footer>

      {/* نافذة تأكيد الإجراءات (إنذار / حظر / فك حظر) */}
      <ConfirmAction
        pending={pendingAction}
        busy={actionBusyStudentId !== null}
        onConfirm={executePendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </main>
  );
}
