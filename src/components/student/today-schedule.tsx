"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الطالب — جدول محاضرات اليوم بحالات لحظية
 * ============================================================================
 *  - يعرض محاضرات اليوم مرتبة (الجارية → القادمة → المنتهية)
 *  - حالة كل محاضرة تُحسب من الوقت الحقيقي (خادمياً) وليست قيماً ثابتة:
 *      CURRENT (جارية الآن) / UPCOMING (قادمة) / FINISHED (انتهت)
 *  - إذا لم تكن هناك محاضرات اليوم: يعرض المحاضرة القادمة من الأسبوع
 * ============================================================================
 */

import * as React from "react";
import {
  CalendarDays,
  Clock3,
  MapPin,
  UserRound,
  PlayCircle,
  Hourglass,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { minutesToClock, weekdayName } from "@/lib/format";
import type { ScheduleRow } from "@/lib/types";

/* أنماط الحالات الثلاث */
const STATUS_STYLES: Record<
  ScheduleRow["status"],
  { badge: string; icon: React.ComponentType<{ className?: string }>; row: string }
> = {
  current: {
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: PlayCircle,
    row: "border-emerald-500/40 bg-emerald-500/6",
  },
  upcoming: {
    badge: "bg-violet-500/12 text-violet-600 dark:text-violet-400 border-violet-500/30",
    icon: Hourglass,
    row: "border-border/60 bg-background/40",
  },
  finished: {
    badge: "bg-muted text-muted-foreground border-border",
    icon: CheckCircle2,
    row: "border-border/40 bg-transparent opacity-60",
  },
};

export function TodaySchedule({
  schedule,
  loading,
}: {
  schedule: ScheduleRow[];
  loading: boolean;
}) {
  const { t, locale } = useI18n();
  const [, forceTick] = React.useState(0);

  /* تحديث الحالة كل دقيقة (العدّاد التنازلي للقادمة) */
  React.useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const today = new Date();
  const todayEntries = schedule.filter((row) => row.day_of_week === today.getDay());
  const nextFromWeek = schedule.find(
    (row) => row.day_of_week !== today.getDay() && row.status !== "finished"
  );

  const statusLabel = (status: ScheduleRow["status"]) =>
    status === "current"
      ? t("student.scheduleCurrent")
      : status === "upcoming"
        ? t("student.scheduleUpcoming")
        : t("student.scheduleFinished");

  return (
    <section className="glass-card p-5 sm:p-6" aria-label={t("student.scheduleTitle")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-black text-foreground">
          <CalendarDays className="h-5 w-5 text-primary" />
          {t("student.scheduleTitle")}
        </h2>
        <span className="text-xs font-extrabold text-muted-foreground">
          {weekdayName(today.getDay(), locale)}
        </span>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-xs font-bold">{t("common.loading")}</p>
        </div>
      ) : todayEntries.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm font-extrabold text-foreground">
            {t("student.noClassesToday")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("student.noClassesTodayHint")}
          </p>
          {nextFromWeek && (
            <p className="mt-3 inline-flex flex-wrap items-center justify-center gap-1.5 rounded-full bg-violet-500/10 px-3.5 py-1.5 text-xs font-extrabold text-violet-600 dark:text-violet-400">
              <Clock3 className="h-3.5 w-3.5" />
              {nextFromWeek.subject} — {weekdayName(nextFromWeek.day_of_week, locale)}{" "}
              {minutesToClock(nextFromWeek.start_minutes)}
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {todayEntries.map((entry) => {
            const styles = STATUS_STYLES[entry.status];
            const StatusIcon = styles.icon;
            return (
              <li
                key={entry.id}
                className={`flex flex-wrap items-center gap-3 rounded-2xl border px-3.5 py-3 ${styles.row} ${
                  entry.status === "current" ? "shadow-[0_0_0_3px_rgba(16,185,129,0.08)]" : ""
                }`}
              >
                {/* الوقت */}
                <div className="text-center" dir="ltr">
                  <p className="text-sm font-black tabular-nums text-foreground">
                    {minutesToClock(entry.start_minutes)}
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground">
                    {minutesToClock(entry.end_minutes)}
                  </p>
                </div>

                {/* المادة + الدكتور + القاعة */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-foreground">
                    {entry.subject}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-bold text-muted-foreground">
                    {entry.professor_name && (
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3 w-3" />
                        {t("common.professorPrefix")}
                        {entry.professor_name.split(" ")[0]}
                      </span>
                    )}
                    {entry.room && (
                      <span className="inline-flex items-center gap-1" dir="ltr">
                        <MapPin className="h-3 w-3" />
                        {entry.room}
                      </span>
                    )}
                  </p>
                </div>

                {/* الحالة اللحظية */}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black ${styles.badge}`}
                >
                  {entry.status === "current" && (
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                  )}
                  <StatusIcon className="h-3.5 w-3.5" />
                  {statusLabel(entry.status)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
