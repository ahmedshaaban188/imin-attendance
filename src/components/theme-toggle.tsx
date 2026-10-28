"use client";

/**
 * ImIn | زر تبديل الوضع الفاتح/الداكن مع انتقال سلس
 */

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useI18n } from "@/lib/i18n";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? t("theme.toLight") : t("theme.toDark")}
      title={isDark ? t("theme.light") : t("theme.dark")}
      className="glass-chip inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 hover:text-primary hover:scale-105 active:scale-95 transition-all"
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-5 w-5" strokeWidth={2.2} />
        ) : (
          <Moon className="h-5 w-5" strokeWidth={2.2} />
        )
      ) : (
        <span className="h-5 w-5" />
      )}
    </button>
  );
}
