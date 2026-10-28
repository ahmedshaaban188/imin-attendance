"use client";

/**
 * ImIn | مزوّدو الواجهة من جهة العميل
 * - ThemeProvider: إدارة الوضع الفاتح/الداكن (next-themes) بتبديل سلس
 * - I18nProvider: إدارة اللغة (عربي/إنجليزي) مع RTL/LTR لحظي
 * - Toaster: تنبيهات Sonner موجهة حسب لغة الواجهة
 */

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider, useI18n } from "@/lib/i18n";

/** توجيه التنبيهات حسب اللغة الحالية (RTL للعربية / LTR للإنجليزية) */
function LocalizedToaster() {
  const { dir } = useI18n();
  return <Toaster dir={dir} position="top-center" richColors closeButton />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableColorScheme
      disableTransitionOnChange={false}
    >
      <I18nProvider>
        {children}
        <LocalizedToaster />
      </I18nProvider>
    </NextThemesProvider>
  );
}
