"use client";

/**
 * ============================================================================
 *  ImIn | لوحة تحكم الطالب — النسخة المطوّرة
 * ============================================================================
 *  - نظرة الحضور الشاملة: النسبة + حاضر/متأخر/غائب + الحالة الذكية (خادمياً)
 *  - جدول محاضرات اليوم بحالات لحظية (جارية/قادمة/منتهية) من الوقت الحقيقي
 *  - كشف الجلسات المفتوحة لحظياً + تسجيل الحضور داخل النطاق
 *  - إشعارات فورية عبر الجرس في الشريط العلوي (تتحدّث بعد كل تسجيل)
 *  - سجل حضور مع حالة كل محاضرة (حاضر/متأخر) ووقت التسجيل بالثانية
 *  - كامل الترجمة عربي/إنجليزي مع RTL/LTR
 * ============================================================================
 */

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  UserCheck,
  Lock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { DemoBadge } from "@/components/demo-badge";
import { DigitalIdCard } from "@/components/student/digital-id-card";
import { SessionPanel } from "@/components/student/session-panel";
import { StatsOverview } from "@/components/student/stats-overview";
import { TodaySchedule } from "@/components/student/today-schedule";
import { HistoryTable, type HistoryRow } from "@/components/student/history-table";
import {
  fetchOpenSessions,
  fetchAttendedSessionStatuses,
  fetchStudentHistory,
  fetchStudentStats,
  fetchSchedule,
  fetchSessionById,
  insertAttendance,
  isStudentBlocked,
  subscribeSessionUpdates,
  type StudentStats,
  type AttendedStatusMap,
} from "@/lib/data-layer";
import { useI18n, localizedError, attendanceStatusLabel, geoErrorMessage } from "@/lib/i18n";
import { formatDate, formatDistance, greetingForNow } from "@/lib/format";
import { getCurrentPositionOnce, haversineDistance } from "@/lib/geo";
import type { AppUser, AttendanceRow, GeoPosition, ScheduleRow, SessionRow } from "@/lib/types";

export function StudentView({
  user,
  onLogout,
  onUserUpdate,
}: {
  user: AppUser;
  onLogout: () => void;
  /** تحديث بيانات المستخدم (بعد تعديل صوره من «مستنداتي المسجلة») */
  onUserUpdate: (user: AppUser) => void;
}) {
  const { t, locale } = useI18n();
  const [openSessions, setOpenSessions] = React.useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(true);
  const [attendedStatuses, setAttendedStatuses] = React.useState<AttendedStatusMap>({});
  const [history, setHistory] = React.useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const [justCheckedInSessionId, setJustCheckedInSessionId] = React.useState<string | null>(null);

  /* إحصائيات الطالب الكاملة (نسبة + عدادات + حالة ذكية + إنذارات) */
  const [stats, setStats] = React.useState<StudentStats | null>(null);
  const [loadingStats, setLoadingStats] = React.useState(true);

  /* جدول محاضرات اليوم */
  const [schedule, setSchedule] = React.useState<ScheduleRow[]>([]);
  const [loadingSchedule, setLoadingSchedule] = React.useState(true);

  /* إشارة تحديث الإشعارات (ترتفع بعد كل تسجيل حضور) */
  const [notificationsSignal, setNotificationsSignal] = React.useState(0);

  /** الجلسات المعروفة سابقاً — لاكتشاف الجلسات المفتوحة حديثاً وإشعار الطالب */
  const knownSessionIdsRef = React.useRef<Set<string> | null>(null);

  /* ------------------------------------------------------------------ */
  /*  جلب الجلسات المفتوحة + الجلسات التي حضرها الطالب بالفعل              */
  /* ------------------------------------------------------------------ */
  const refreshOpenSessions = React.useCallback(async () => {
    try {
      const sessions = await fetchOpenSessions();
      setOpenSessions(sessions);

      // إشعار الطالب عند اكتشاف جلسة مفتوحة جديدة (وليس في أول تحميل)
      if (knownSessionIdsRef.current === null) {
        knownSessionIdsRef.current = new Set(sessions.map((session) => session.id));
      } else {
        const newSessions = sessions.filter(
          (session) => !knownSessionIdsRef.current!.has(session.id)
        );
        if (newSessions.length > 0) {
          toast.info(t("student.sessionOpenedToast"));
          newSessions.forEach((session) => knownSessionIdsRef.current!.add(session.id));
          setNotificationsSignal((n) => n + 1);
        }
      }

      // التحقق من الجلسات التي سجّل فيها الطالب حضوره بالفعل (مع حالتها: حاضر/متأخر)
      if (sessions.length > 0) {
        const statuses = await fetchAttendedSessionStatuses(
          user.id,
          sessions.map((session) => session.id)
        );
        setAttendedStatuses(statuses);
      } else {
        setAttendedStatuses({});
      }
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setLoadingSessions(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, locale]);

  React.useEffect(() => {
    refreshOpenSessions();
  }, [refreshOpenSessions]);

  /* ------------------------------------------------------------------ */
  /*  سجل الحضور السابق + الإحصائيات + الجدول (تحميل أولي فقط)             */
  /* ------------------------------------------------------------------ */
  const loadHistory = React.useCallback(async () => {
    try {
      const rows = await fetchStudentHistory(user.id);
      setHistory(rows);
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setLoadingHistory(false);
    }
  }, [user.id, locale]);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const loadStats = React.useCallback(async () => {
    try {
      const data = await fetchStudentStats(user.id);
      setStats(data);
    } catch {
      /* الإحصائيات غير حرجة — تُهمل أخطاؤها بهدوء */
    } finally {
      setLoadingStats(false);
    }
  }, [user.id]);

  React.useEffect(() => {
    loadStats();
  }, [loadStats]);

  const loadSchedule = React.useCallback(async () => {
    try {
      const rows = await fetchSchedule();
      setSchedule(rows);
    } catch {
      /* الجدول غير حرج — يُعرض كحالة فارغة عند الفشل */
    } finally {
      setLoadingSchedule(false);
    }
  }, []);

  React.useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  /* ------------------------------------------------------------------ */
  /*  الاشتراك اللحظي في تغيّرات جدول sessions                            */
  /* ------------------------------------------------------------------ */
  React.useEffect(() => {
    const unsubscribe = subscribeSessionUpdates(() => {
      refreshOpenSessions();
    });

    return unsubscribe;
  }, [refreshOpenSessions]);

  /* تحديث دوري احتياطي كل 30 ثانية (إذا تعذر الاتصال اللحظي) */
  React.useEffect(() => {
    const id = window.setInterval(() => refreshOpenSessions(), 30000);
    return () => window.clearInterval(id);
  }, [refreshOpenSessions]);

  /* ------------------------------------------------------------------ */
  /*  تسجيل الحضور الآن: إدراج صف في جدول attendance                       */
  /*  كل التحقق يتم على الخادم: الجلسة مفتوحة؟ الطالب مقبول وغير محظور؟     */
  /*  لم يسجل من قبل؟ داخل النطاق جغرافياً (Haversine خادمياً)؟             */
  /*  والحالة (حاضر/متأخر) يحددها الخادم وحده                              */
  /* ------------------------------------------------------------------ */
  async function handleCheckIn(session: SessionRow, position?: GeoPosition | null) {
    setCheckingIn(true);
    try {
      // تحقق أخير قبل الكتابة: الجلسة ما زالت مفتوحة؟ والطالب غير محظور؟
      const [freshSession, blocked] = await Promise.all([
        fetchSessionById(session.id),
        isStudentBlocked(session.professor_id, user.id),
      ]);

      if (!freshSession || !freshSession.is_open) {
        toast.error(t("errors.sessionClosed"));
        refreshOpenSessions();
        return;
      }

      if (blocked) {
        toast.error(t("errors.blocked"));
        return;
      }

      let record: AttendanceRow | null = null;
      try {
        // الموقع يُرسل للخادم ليُتحقق منه هناك — لا يُعتمد حساب العميل أبداً
        record = await insertAttendance({
          session_id: session.id,
          student_id: user.id,
          student_name: user.full_name,
          university_id: user.university_id,
          lat: position?.lat,
          lng: position?.lng,
          accuracy: position?.accuracy,
        });
      } catch (error) {
        const code = (error as Error & { code?: string }).code;
        // حضور مكرر (القيد الفريد session_id + student_id — رمز 23505)
        if (code === "23505") {
          setAttendedStatuses((previous) =>
            session.id in previous ? previous : { ...previous, [session.id]: "present" }
          );
          toast.info(t("student.alreadyCheckedIn"));
          return;
        }
        // الجلسة قُفلت للتو على السيرفر — رفض واضح مع تحديث القائمة
        if (code === "SESSION_CLOSED") {
          toast.error(t("errors.sessionClosed"));
          refreshOpenSessions();
          return;
        }
        // الخادم رفض الموقع — خارج النطاق حسب حسابه هو
        if (code === "OUT_OF_RANGE") {
          toast.error(localizedError(error, locale));
          refreshOpenSessions();
          return;
        }
        // لا إحداثيات صالحة وصلت للخادم
        if (code === "GEO_REQUIRED") {
          toast.error(localizedError(error, locale));
          return;
        }
        throw error;
      }

      // الحالة كما حددها الخادم (حاضر/متأخر) تُخزَّن وتُعرض في لوحة الجلسة
      setAttendedStatuses((previous) => ({
        ...previous,
        [session.id]: record?.status ?? "present",
      }));
      setJustCheckedInSessionId(session.id);
      // رسالة نجاح واضحة تتضمن حالة الحضور (حاضر/متأخر) كما حددها الخادم
      toast.success(
        `${t("student.checkedInTitle")} — ${attendanceStatusLabel(locale, record?.status ?? "present")}`
      );
      loadHistory();
      loadStats();
      setNotificationsSignal((n) => n + 1);
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setCheckingIn(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  زر الحضور السريع: يعمل فقط أثناء جلسة مفتوحة للمادة                  */
  /* ------------------------------------------------------------------ */

  /** الجلسة المفتوحة الأحدث التي لم يسجّل الطالب حضوره فيها بعد */
  const quickTargetSession = React.useMemo(
    () => openSessions.find((session) => !(session.id in attendedStatuses)) ?? null,
    [openSessions, attendedStatuses]
  );

  /** سجّل حضوره في كل الجلسات المفتوحة حالياً؟ */
  const allOpenAttended =
    openSessions.length > 0 && openSessions.every((session) => session.id in attendedStatuses);

  async function handleQuickAttendance() {
    const session = quickTargetSession;
    if (!session) return;

    setCheckingIn(true);
    try {
      /* 1) لقطة موقع واحدة الآن (بثبات GPS داخل لوحة الجلسة) */
      let position;
      try {
        position = await getCurrentPositionOnce();
      } catch (error) {
        toast.error(geoErrorMessage(error, locale));
        return;
      }

      /* 2) داخل نطاق الجلسة الذي حدّده الدكتور؟ */
      const distance = haversineDistance(
        position.lat,
        position.lng,
        Number(session.lat),
        Number(session.lng)
      );
      if (distance > session.radius) {
        toast.error(
          `${t("student.outRangeMsg", {
            distance: formatDistance(Math.max(0, distance - session.radius), locale),
          })} (${formatDistance(distance, locale)} / ${formatDistance(session.radius, locale)})`
        );
        return;
      }

      /* 3) نفس مسار التسجيل الموثوق (تحقق الجلسة مفتوحة + غير محظور + الموقع للخادم) */
      await handleCheckIn(session, position);
    } finally {
      setCheckingIn(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  العرض                                                               */
  /* ------------------------------------------------------------------ */

  return (
    <main className="relative flex min-h-screen flex-col">
      {/* الخلفية الزجاجية المتوهجة */}
      <div className="orbs" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
      </div>

      <AppHeader
        badge={t("header.studentBadge")}
        onLogout={onLogout}
        extra={<DemoBadge />}
        userId={user.id}
        notificationsRefreshSignal={notificationsSignal}
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6 sm:px-6">
        {/* الترحيب */}
        <section className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <h1 className="text-2xl font-black text-foreground sm:text-[1.7rem]">
              {greetingForNow(new Date(), locale)} {user.full_name.split(" ")[0]}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{formatDate(new Date().toISOString(), locale)}</span>
              {stats && stats.warnings > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1 text-xs font-extrabold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {stats.warnings} {t("professor.warningsLabel")}
                </span>
              )}
            </p>
          </div>
          <p className="text-xs font-bold text-muted-foreground" dir="ltr">
            {user.email}
          </p>
        </section>

        {/* زر الحضور السريع — يعمل فقط أثناء جلسة مفتوحة للمادة */}
        <section className="glass-card p-4 sm:p-5" aria-label={t("student.checkInNow")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                <UserCheck className="h-4.5 w-4.5 shrink-0 text-primary" />
                {t("student.checkInNow")}
              </p>
              {quickTargetSession ? (
                <p className="truncate text-xs font-bold leading-relaxed text-muted-foreground">
                  {quickTargetSession.subject ?? t("student.historySession")}
                  {quickTargetSession.users?.full_name
                    ? ` — ${t("common.professorPrefix")}${quickTargetSession.users.full_name}`
                    : ""}
                </p>
              ) : allOpenAttended ? (
                <p className="text-xs font-bold leading-relaxed text-emerald-600 dark:text-emerald-400">
                  {t("student.alreadyCheckedIn")} ✓
                </p>
              ) : (
                <p className="text-xs font-bold leading-relaxed text-muted-foreground">
                  {t("student.noOpenSessionsHint")}
                </p>
              )}
            </div>

            <Button
              type="button"
              onClick={handleQuickAttendance}
              disabled={!quickTargetSession || checkingIn}
              className={`h-16 w-full shrink-0 flex-col gap-0.5 rounded-2xl text-xl font-black sm:w-52 ${
                quickTargetSession ? "btn-gradient" : ""
              }`}
              aria-label={t("student.checkInNow")}
            >
              {checkingIn ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">{t("student.checkingIn")}</span>
                </>
              ) : quickTargetSession ? (
                <>
                  <span className="text-2xl font-black leading-none">
                    {t("student.statsPresent")}
                  </span>
                  <span className="text-[10px] font-bold opacity-90">
                    {t("student.checkInNow")}
                  </span>
                </>
              ) : (
                <>
                  <Lock className="h-5 w-5" />
                  <span className="text-lg leading-none">{t("student.statsPresent")}</span>
                  <span className="text-[10px] font-bold opacity-80">
                    {allOpenAttended
                      ? t("student.alreadyCheckedIn")
                      : t("student.noSessionBtn")}
                  </span>
                </>
              )}
            </Button>
          </div>
        </section>

        {/* نظرة الحضور الشاملة: النسبة + العدادات + الحالة الذكية */}
        <StatsOverview stats={stats} loading={loadingStats} />

        {/* جدول محاضرات اليوم بحالات لحظية */}
        <TodaySchedule schedule={schedule} loading={loadingSchedule} />

        {/* البطاقة الرقمية + لوحة الجلسة الحالية — الجلسة أولاً على الموبايل */}
        <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-12">
          <div className="order-2 lg:order-1 lg:col-span-4">
            <DigitalIdCard user={user} onUserUpdate={onUserUpdate} />
          </div>
          <div className="order-1 lg:order-2 lg:col-span-8">
            <SessionPanel
              openSessions={openSessions}
              loadingSessions={loadingSessions}
              attendedStatuses={attendedStatuses}
              justCheckedInSessionId={justCheckedInSessionId}
              checkingIn={checkingIn}
              onCheckIn={handleCheckIn}
              onRefresh={refreshOpenSessions}
            />
          </div>
        </div>

        {/* سجل الحضور السابق */}
        <HistoryTable history={history} loading={loadingHistory} />
      </div>

      {/* تذييل */}
      <footer className="relative z-10 py-5 text-center text-xs text-muted-foreground">
        {t("professor.studentFooter")}
      </footer>
    </main>
  );
}
