"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الدكتور — سجل الأنشطة المشبوهة
 * ============================================================================
 *  يعرض الأحداث المرصودة تلقائياً من الخادم:
 *  محاولات حضور مكررة / جلسات مقفلة / رموز غير صالحة / تجاوز التحقق /
 *  محاولات متكررة خلال وقت قصير / دخول من جهاز مختلف /
 *  محاولات حضور بدون إحداثيات أو خارج النطاق الجغرافي.
 *  التسجيل فقط — لا حظر تلقائي للحسابات بدون سبب واضح (حسب الطلب).
 * ============================================================================
 */

import * as React from "react";
import {
  ShieldAlert,
  Copy,
  Lock,
  Ban,
  Gauge,
  MapPin,
  MapPinOff,
  Smartphone,
  ShieldCheck,
  ShieldX,
  ChevronDown,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fetchSuspiciousEvents } from "@/lib/data-layer";
import { useI18n } from "@/lib/i18n";
import { relativeTime } from "@/lib/format";
import type { SuspiciousEventRow, SuspiciousEventType } from "@/lib/types";

/* أيقونة كل نوع حدث */
const EVENT_ICONS: Record<SuspiciousEventType, React.ComponentType<{ className?: string }>> = {
  duplicate: Copy,
  closed_session: Lock,
  invalid_session: ShieldX,
  blocked_attempt: Ban,
  rate_limited: Gauge,
  validation_bypass: ShieldAlert,
  device_mismatch: Smartphone,
  device_rebound: ShieldCheck,
  geo_bypass: MapPinOff,
  out_of_range: MapPin,
};

const EVENT_TONES: Record<SuspiciousEventType, string> = {
  duplicate: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  closed_session: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  invalid_session: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  blocked_attempt: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  rate_limited: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  validation_bypass: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  device_mismatch: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  device_rebound: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  geo_bypass: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  out_of_range: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
};

export function SuspiciousLog({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<SuspiciousEventRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSuspiciousEvents(30);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* جلب عند الفتح + عند إشارة التحديث إذا كان القسم مفتوحاً */
  React.useEffect(() => {
    if (open) void load();
  }, [open, load, refreshKey]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="glass-card p-5 sm:p-6" aria-label={t("professor.suspiciousTitle")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-start"
            aria-expanded={open}
          >
            <h2 className="flex items-center gap-2.5 text-lg font-black">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="h-5 w-5" />
              </span>
              {t("professor.suspiciousTitle")}
              {rows && rows.length > 0 && (
                <span className="rounded-full bg-rose-500/12 px-2.5 py-0.5 text-sm font-black tabular-nums text-rose-600 dark:text-rose-400">
                  {rows.length}
                </span>
              )}
            </h2>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {t("professor.suspiciousNote")}
      </p>

        <CollapsibleContent>
          <div className="mt-4">
            {loading && !rows ? (
              <div className="flex h-20 items-center justify-center text-xs font-bold text-muted-foreground">
                {t("common.loading")}
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-center">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <p className="text-sm font-bold text-muted-foreground">
                  {t("professor.suspiciousEmpty")}
                </p>
              </div>
            ) : (
              <>
                <ul className="nice-scroll max-h-72 space-y-2 overflow-y-auto pe-1">
                  {rows.map((event) => {
                    const Icon = EVENT_ICONS[event.event_type] ?? ShieldAlert;
                    const tone = EVENT_TONES[event.event_type] ?? "bg-muted text-muted-foreground";
                    return (
                      <li
                        key={event.id}
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 px-3.5 py-2.5"
                      >
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}>
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-extrabold text-foreground">
                            {t(`suspicious.${event.event_type}`)}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] font-bold text-muted-foreground">
                            {event.actor_name ?? t("professor.suspiciousUnknownStudent")}
                            {event.university_id ? ` · ${event.university_id}` : ""}
                          </p>
                        </div>
                        <p className="shrink-0 text-[10px] font-bold text-muted-foreground/80">
                          {relativeTime(event.created_at, Date.now(), locale)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-end text-[10px] font-bold text-muted-foreground">
                  {t("professor.suspiciousFooter", { count: rows.length })}
                </p>
              </>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
