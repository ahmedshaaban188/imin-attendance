"use client";

/**
 * ============================================================================
 *  ImIn | الشريط العلوي الزجاجي للوحات التحكم (الدكتور / الطالب)
 * ============================================================================
 *  الشعار + شارة اللوحة على جهة البداية — وزر الوضع الداكن + مركز الإشعارات
 *  + تبديل اللغة + زر الخروج على جهة النهاية.
 *  بيانات المستخدم وصورته تظهر داخل اللوحة نفسها (الترحيب / البطاقة الرقمية).
 * ============================================================================
 */

import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { NotificationsPanel } from "@/components/notifications-panel";
import { useI18n } from "@/lib/i18n";
import type { ReactNode } from "react";

export function AppHeader({
  badge,
  onLogout,
  extra,
  userId,
  notificationsRefreshSignal,
}: {
  /** شارة اللوحة (لوحة الدكتور / لوحة الطالب) */
  badge: string;
  onLogout: () => void;
  /** عنصر إضافي اختياري بجانب شارة اللوحة (مثل شارة الوضع التجريبي) */
  extra?: ReactNode;
  /** معرف المستخدم الحالي — لمركز الإشعارات */
  userId?: string;
  /** إشارة لتحديث الإشعارات بعد حدث (تسجيل حضور مثلاً) */
  notificationsRefreshSignal?: number;
}) {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <div className="glass-nav mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 rounded-2xl px-2.5 sm:h-16 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Logo size={38} withWordmark={false} />
          <span
            className="truncate rounded-full bg-primary/12 px-2.5 py-1.5 text-[11px] font-extrabold text-primary sm:px-3.5 sm:text-xs"
            title={badge}
          >
            {badge}
          </span>
          {extra}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <LanguageToggle />
          {userId && (
            <NotificationsPanel
              userId={userId}
              refreshSignal={notificationsRefreshSignal}
            />
          )}
          <ThemeToggle />

          <button
            type="button"
            onClick={onLogout}
            aria-label={t("common.logout")}
            title={t("common.logout")}
            className="glass-chip inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-all hover:scale-105 hover:text-destructive active:scale-95"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
