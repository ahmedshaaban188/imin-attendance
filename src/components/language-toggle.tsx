"use client";

/**
 * ImIn | زر تبديل اللغة (عربي ⇄ إنجليزي)
 * يقلب اتجاه الصفحة كاملاً (RTL/LTR) فوراً بدون إعادة تحميل.
 */

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, toggleLocale, t } = useI18n();

  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={locale === "ar" ? t("lang.switchToEnglish") : t("lang.switchToArabic")}
      title={locale === "ar" ? t("lang.switchToEnglish") : t("lang.switchToArabic")}
      className={`glass-chip inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold text-foreground/80 transition-all hover:scale-105 hover:text-primary active:scale-95 ${className}`}
    >
      <Languages className="h-4.5 w-4.5" />
      <span dir="ltr">{locale === "ar" ? "EN" : "ع"}</span>
    </button>
  );
}
