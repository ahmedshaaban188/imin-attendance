"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الطالب — سجل حضور المحاضرات السابقة
 * ============================================================================
 *  يعرض سجل حضور الطالب من جدول attendance مع تفاصيل الجلسة:
 *  التاريخ + المادة + المحاضر + وقت تسجيل الحضور بالثانية + الحالة
 *  (حاضر / متأخر — كما حددها الخادم لحظة التسجيل).
 * ============================================================================
 */

import * as React from "react";
import { History, CheckCircle2, Clock3, UserRound, BookOpen } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatTimeWithSeconds } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AttendanceRow } from "@/lib/types";

/** صف الحضور مع بيانات الجلسة المتداخلة (sessions -> users) */
export interface HistoryRow extends AttendanceRow {
  sessions:
    | {
        created_at: string;
        radius: number;
        subject: string | null;
        users: { full_name: string } | null;
      }
    | null;
}

export interface HistoryTableProps {
  history: HistoryRow[];
  loading: boolean;
}

export function HistoryTable({ history, loading }: HistoryTableProps) {
  const { t, locale } = useI18n();

  return (
    <section className="glass-card p-5 sm:p-6" aria-label={t("student.historyTitle")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-black">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <History className="h-5 w-5" />
          </span>
          {t("student.historyTitle")}
          <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-sm font-black tabular-nums text-primary">
            {history.length}
          </span>
        </h2>
      </header>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div
            className="flex h-44 flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-border text-center"
            aria-label={t("student.noHistory")}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <UserRound className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-muted-foreground">
              {t("student.noHistory")}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {t("student.noHistoryHint")}
            </p>
          </div>
        ) : (
          <div className="nice-scroll max-h-[24rem] overflow-y-auto pe-1">
            {/* نسخة الجدول (شاشات md وأكبر) */}
            <div className="hidden md:block">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white/70 backdrop-blur dark:bg-[#15161a]/80">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-start">{t("student.historyDate")}</TableHead>
                    <TableHead className="text-start">{t("student.historySubject")}</TableHead>
                    <TableHead className="text-start">{t("student.historyLecturer")}</TableHead>
                    <TableHead className="text-start">{t("student.historyTime")}</TableHead>
                    <TableHead className="text-start">{t("student.historyStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((row) => (
                    <TableRow
                      key={row.id}
                      className="row-enter bg-white/35 dark:bg-white/4 hover:bg-white/60 dark:hover:bg-white/8"
                    >
                      <TableCell className="py-3.5 text-sm font-bold">
                        {row.sessions ? formatDate(row.sessions.created_at, locale) : "—"}
                      </TableCell>
                      <TableCell className="max-w-44 py-3.5 text-sm font-bold">
                        {row.sessions?.subject ? (
                          <span className="flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="truncate">{row.sessions.subject}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5 text-sm font-extrabold text-primary">
                        {row.sessions?.users?.full_name
                          ? `${t("common.professorPrefix")}${row.sessions.users.full_name}`
                          : "—"}
                      </TableCell>
                      <TableCell className="py-3.5 text-sm font-black tabular-nums" dir="ltr">
                        {formatTimeWithSeconds(row.check_in_time ?? row.created_at, locale)}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <StatusBadge status={row.status ?? "present"} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* نسخة البطاقات (الموبايل) — جدول غير قابل للاستخدام على شاشة صغيرة */}
            <ul className="space-y-2.5 md:hidden">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="rounded-2xl border border-border/60 bg-white/35 dark:bg-white/4 px-3.5 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-extrabold text-foreground">
                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                        {row.sessions?.subject ?? t("student.historySession")}
                      </p>
                      <p className="mt-1 truncate text-xs font-bold text-muted-foreground">
                        {row.sessions?.users?.full_name
                          ? `${t("common.professorPrefix")}${row.sessions.users.full_name}`
                          : "—"}
                        {" · "}
                        {row.sessions ? formatDate(row.sessions.created_at, locale) : "—"}
                      </p>
                      <p className="mt-0.5 text-xs font-black tabular-nums text-muted-foreground" dir="ltr">
                        {formatTimeWithSeconds(row.check_in_time ?? row.created_at, locale)}
                      </p>
                    </div>
                    <StatusBadge status={row.status ?? "present"} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** شارة حالة الحضور (حاضر / متأخر) */
function StatusBadge({ status }: { status: "present" | "late" }) {
  const { t } = useI18n();
  const present = status === "present";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
        present
          ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/12 text-amber-600 dark:text-amber-400"
      }`}
    >
      {present ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
      {present ? t("student.statusPresent") : t("student.statusLate")}
    </span>
  );
}
