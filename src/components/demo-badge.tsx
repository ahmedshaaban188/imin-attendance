"use client";

/**
 * ImIn | شارة الوضع التجريبي
 * شارة صغيرة تظهر فقط عندما يعمل النظام بدون Supabase الحقيقي،
 * لتوضيح أن البيانات تُحفَظ محلياً لأغراض الاستكشاف والتجربة.
 * (تختفي تلقائياً بمجرد ضبط بيانات الاتصال الحقيقية)
 */

import { FlaskConical } from "lucide-react";
import { isDemoMode } from "@/lib/data-layer";
import { useI18n } from "@/lib/i18n";

export function DemoBadge() {
  const { t } = useI18n();
  if (!isDemoMode()) return null;

  return (
    <span
      className="glass-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-amber-600 dark:text-amber-400"
      title={t("header.demoModeTitle")}
    >
      <FlaskConical className="h-3.5 w-3.5" />
      {t("header.demoMode")}
    </span>
  );
}
