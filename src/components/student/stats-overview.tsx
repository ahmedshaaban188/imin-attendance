"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الطالب — نظرة الحضور الشاملة (النسبة + العدادات + الحالة الذكية)
 * ============================================================================
 *  - نسبة الحضور الكلية (تُحسب خادمياً — لا قيم من الواجهة)
 *  - عدادات حاضر / متأخر / غائب
 *  - الحالة الذكية: 🟢 آمن / 🟡 تحذير / 🔴 خطر + رسالة مفهومة تشرح الحالة
 *  - آخر حضور موثّق
 * ============================================================================
 */

import {
  CheckCircle2,
  Clock3,
  UserX,
  CalendarCheck2,
  ShieldCheck,
  TriangleAlert,
  AlarmClock,
  CircleDashed,
} from "lucide-react";
import { useI18n, smartStatusLabel } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import type { StudentStats } from "@/lib/types";

export function StatsOverview({
  stats,
  loading,
}: {
  stats: StudentStats | null;
  loading: boolean;
}) {
  const { t, locale } = useI18n();

  if (loading || !stats) {
    return (
      <section className="glass-card p-5 sm:p-6" aria-busy="true">
        <div className="h-28 animate-pulse rounded-2xl bg-muted/50" />
      </section>
    );
  }

  const status = stats.smart_status;
  const percentageText =
    stats.percentage === null ? "—" : `${stats.percentage}%`;

  /* ألوان الحالة الذكية */
  const statusStyles =
    status === "safe"
      ? {
          badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          banner: "border-emerald-500/30 bg-emerald-500/8",
          icon: CheckCircle2,
          iconColor: "text-emerald-600 dark:text-emerald-400",
          bar: "bg-emerald-500",
        }
      : status === "warning"
        ? {
            badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            banner: "border-amber-500/30 bg-amber-500/8",
            icon: TriangleAlert,
            iconColor: "text-amber-600 dark:text-amber-400",
            bar: "bg-amber-500",
          }
        : status === "critical"
          ? {
              badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
              banner: "border-rose-500/30 bg-rose-500/8",
              icon: AlarmClock,
              iconColor: "text-rose-600 dark:text-rose-400",
              bar: "bg-rose-500",
            }
          : {
              badge: "bg-muted text-muted-foreground",
              banner: "border-border bg-muted/40",
              icon: CircleDashed,
              iconColor: "text-muted-foreground",
              bar: "bg-muted-foreground/40",
            };

  const StatusIcon = statusStyles.icon;
  const statusMessageKey =
    status === "safe"
      ? "student.safeMsg"
      : status === "warning"
        ? "student.warningMsg"
        : status === "critical"
          ? "student.criticalMsg"
          : "student.noDataMsg";

  /* العدادات */
  const counters = [
    { label: t("student.statsPresent"), value: stats.present, icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/12" },
    { label: t("student.statsLate"), value: stats.late, icon: Clock3, tone: "text-amber-600 dark:text-amber-400 bg-amber-500/12" },
    { label: t("student.statsAbsent"), value: stats.absent, icon: UserX, tone: "text-rose-600 dark:text-rose-400 bg-rose-500/12" },
    { label: t("student.statsTotal"), value: stats.total, icon: CalendarCheck2, tone: "text-primary bg-primary/12" },
  ];

  return (
    <section className="glass-card p-5 sm:p-6" aria-label={t("student.statsAttendance")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-foreground">
            {t("student.statsAttendance")}
          </h2>
          <p className="mt-0.5 text-xs font-bold text-muted-foreground">
            {t("student.statsStatus")}{" "}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${statusStyles.badge}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {smartStatusLabel(locale, status)}
            </span>
          </p>
        </div>

        {/* النسبة الكبيرة */}
        <div className="text-end">
          <p className="text-4xl font-black tabular-nums leading-none text-foreground" dir="ltr">
            {percentageText}
          </p>
          {/* شريط تقدم النسبة */}
          <div className="mt-2 h-2 w-32 overflow-hidden rounded-full bg-muted" dir="ltr">
            <div
              className={`h-full rounded-full transition-all duration-700 ${statusStyles.bar}`}
              style={{ width: `${stats.percentage ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] font-bold text-muted-foreground" dir="ltr">
            {t("student.statusWarning")} ≥ {stats.thresholds.warning}% ·{" "}
            {t("student.statusCritical")} ≥ {stats.thresholds.critical}%
          </p>
        </div>
      </div>

      {/* العدادات */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {counters.map((counter) => (
          <div
            key={counter.label}
            className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-background/40 px-3 py-2.5"
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${counter.tone}`}>
              <counter.icon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-black tabular-nums leading-none text-foreground" dir="ltr">
                {counter.value}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-muted-foreground">
                {counter.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* رسالة الحالة + آخر حضور */}
      <div className={`mt-4 flex items-start gap-2.5 rounded-2xl border px-4 py-3 ${statusStyles.banner}`}>
        <StatusIcon className={`mt-0.5 h-5 w-5 shrink-0 ${statusStyles.iconColor}`} />
        <div className="min-w-0 text-sm">
          <p className={`font-extrabold ${statusStyles.iconColor}`}>
            {smartStatusLabel(locale, status)}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">
            {t(statusMessageKey)}
          </p>
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        {t("student.lastAttendance")}:{" "}
        {stats.last_attended_at ? (
          <span className="text-foreground">
            {formatDateTime(stats.last_attended_at, locale)}
          </span>
        ) : (
          <span>{t("student.never")}</span>
        )}
      </p>
    </section>
  );
}
