"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الدكتور — سجل الجلسات السابقة
 * ============================================================================
 *  قائمة قابلة للطي بآخر جلسات الدكتور (حتى 20 جلسة) مع:
 *  - اسم المادة/المحاضرة (إن وُجد) + التاريخ ووقت الفتح
 *  - عدد الحضور الموثّق في كل جلسة + مدتها التقريبية إن كانت مفتوحة
 *  - تُحدَّث تلقائياً عند إنهاء الجلسة الحالية أو إنشاء جلسة جديدة
 * ============================================================================
 */

import * as React from "react";
import { CalendarRange, ChevronDown, Loader2, Radio, Trash2, Users } from "lucide-react";
import { fetchProfessorSessionHistory, type SessionHistoryRow } from "@/lib/data-layer";
import { formatDate, formatTime, relativeTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export interface SessionHistoryProps {
  /** معرف الدكتور */
  professorId: string;
  /** التوقيت الحالي لتحديث الأزمنة النسبية */
  now: number;
  /** رمز تحديث خارجي — يتغيّر عند إنشاء/إنهاء جلسة لإعادة الجلب */
  refreshKey: string | number;
  /** طلب حذف جلسة — الأب (لوحة الدكتور) يتولى نافذة التأكيد والتنفيذ */
  onDeleteSession: (row: SessionHistoryRow) => void;
}

export function SessionHistory({ professorId, now, refreshKey, onDeleteSession }: SessionHistoryProps) {
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<SessionHistoryRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadedOnce, setLoadedOnce] = React.useState(false);

  /* جلب السجل عند فتح القسم (أو عند تغيّر refreshKey بعد أول تحميل) */
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProfessorSessionHistory(professorId, 20);
      setRows(data);
    } catch {
      /* السجل غير حرج — تُهمل أخطاؤه بهدوء */
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [professorId]);

  React.useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load, refreshKey]);

  /* إعادة الجلب في الخلفية إذا كان القسم مفتوحاً وتغيّرت الجلسات */
  React.useEffect(() => {
    if (open && loadedOnce) void load();
  }, [refreshKey]);

  const closedCount = rows.filter((row) => !row.is_open).length;

  return (
    <section className="glass-card p-5 sm:p-6" aria-label={t("professor.historyTitle")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3"
        aria-expanded={open}
      >
        <h2 className="flex items-center gap-2.5 text-lg font-black">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <CalendarRange className="h-5 w-5" />
          </span>
          {t("professor.historyTitle")}
          {loadedOnce && (
            <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-sm font-black tabular-nums text-primary">
              {closedCount}
            </span>
          )}
        </h2>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-4">
          {loading && !loadedOnce ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm font-bold text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("professor.loadingHistory")}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-center">
              <p className="text-sm font-bold text-muted-foreground">
                {t("professor.noSessions")}
              </p>
              <p className="text-xs text-muted-foreground/80">
                {t("professor.noSessionsHint")}
              </p>
            </div>
          ) : (
            <ul className="nice-scroll max-h-[22rem] space-y-2 overflow-y-auto pe-1">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${
                    row.is_open
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-border/60 bg-white/40 dark:bg-white/4"
                  }`}
                >
                  {/* التاريخ والوقت */}
                  <div className="min-w-28 shrink-0">
                    <p className="text-sm font-extrabold text-foreground">
                      {formatDate(row.created_at, locale)}
                    </p>
                    <p className="text-[11px] font-bold tabular-nums text-muted-foreground">
                      {formatTime(row.created_at, locale)} • {relativeTime(row.created_at, now, locale)}
                    </p>
                  </div>

                  {/* المادة */}
                  <div className="order-last w-full min-w-0 flex-1 text-start sm:order-none sm:w-auto">
                    <p className="truncate text-sm font-bold text-foreground">
                      {row.subject ?? t("professor.sessionDefaultName")}
                    </p>
                    <p className="text-[11px] font-bold text-muted-foreground" dir="ltr">
                      {t("professor.sessionRange", { radius: row.radius })}
                    </p>
                  </div>

                  {/* الحالة + عدد الحضور + زر الحذف */}
                  <div className="ms-auto flex shrink-0 items-center gap-2">
                    {row.is_open ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                        <Radio className="h-3 w-3" />
                        {t("professor.sessionOpenNow")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-extrabold text-muted-foreground">
                        {t("professor.sessionEnded")}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-extrabold text-primary tabular-nums">
                      <Users className="h-3 w-3" />
                      {t("professor.attendanceCountLabel", { count: row.attendanceCount })}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteSession(row)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-600 transition-all hover:bg-rose-500/22 hover:scale-105 active:scale-95 dark:text-rose-400"
                      title={t("professor.deleteSessionAria")}
                      aria-label={t("professor.deleteSessionAria")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
