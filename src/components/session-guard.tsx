"use client";

/**
 * ============================================================================
 *  ImIn | حارس الجلسة — خروج تلقائي لدواعي الأمان
 * ============================================================================
 *  - خمول 120 ثانية كاملة بدون أي لمس/حركة/تمرير → تسجيل خروج تلقائي
 *  - تحذير ودّي مع عدّ تنازلي في آخر 30 ثانية (أي تفاعل يلغيه فوراً)
 *  - فحص فوري لحظة رجوع التبويب للمقدمة (يقاوم إبطاء المؤقتات بالخلفية)
 *  - إغلاق المتصفح/التبويب ينهي الجلسة من أصله (sessionStorage — supabaseClient)
 *
 *  المدة قابلة للتعديل من الثابت IDLE_TIMEOUT_MS أدناه فقط.
 * ============================================================================
 */

import * as React from "react";
import { Hourglass } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** مدة الخمول قبل الخروج التلقائي (120 ثانية حسب سياسة الأمان) */
export const IDLE_TIMEOUT_MS = 120 * 1000;

/** إظهار تحذير العدّ التنازلي قبل النهاية بهذه المدة */
const WARNING_WINDOW_MS = 30 * 1000;

/** دقة فحص الخمول */
const TICK_MS = 1000;

/** أي نشاط من هذه الأحداث يُحتسب «المستخدم موجود» */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "pointerdown",
  "mousemove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
];

export function SessionGuard({ onAutoLogout }: { onAutoLogout: () => void }) {
  const { t } = useI18n();
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const lastActivityRef = React.useRef(Date.now());
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    lastActivityRef.current = Date.now();
    firedRef.current = false;

    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    // مستمعات خفيفة (passive) — تحديث مرجع فقط دون أي إعادة رسم
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, bump, { passive: true })
    );

    const check = () => {
      if (firedRef.current) return;
      const idleFor = Date.now() - lastActivityRef.current;
      const left = IDLE_TIMEOUT_MS - idleFor;
      if (left <= 0) {
        firedRef.current = true;
        setSecondsLeft(null);
        onAutoLogout();
        return;
      }
      setSecondsLeft(left <= WARNING_WINDOW_MS ? Math.ceil(left / 1000) : null);
    };

    const timer = window.setInterval(check, TICK_MS);

    // رجوع للتبويب = فحص فوري (المتصفح يبطئ المؤقتات في الخلفية)
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, bump));
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [onAutoLogout]);

  if (secondsLeft === null) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 backdrop-blur-md pop-in"
      role="alert"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <Hourglass className="h-4.5 w-4.5" />
      </span>
      <p className="min-w-0 flex-1 text-xs font-extrabold leading-relaxed text-amber-700 dark:text-amber-300">
        {t("session.idleWarning", { seconds: secondsLeft })}
      </p>
      <span
        className="shrink-0 rounded-xl bg-amber-500/15 px-2.5 py-1 text-sm font-black tabular-nums text-amber-700 dark:text-amber-300"
        dir="ltr"
        aria-hidden="true"
      >
        {secondsLeft}
      </span>
    </div>
  );
}
