"use client";

/**
 * ============================================================================
 *  ImIn | مركز الإشعارات — جرس بعدد غير المقروء + لوحة منزلقة
 * ============================================================================
 *  - زر الجرس في الشريط العلوي مع شارة عدد الإشعارات غير المقروءة
 *  - استقصاء خفيف كل 15 ثانية للعدد فقط + إعادة جلب كاملة عند الفتح
 *  - كل إشعار: أيقونة حسب النوع + عنوان ونص مترجمان حسب لغة الواجهة
 *    + نقطة غير مقروء + وقت نسبي — والضغط عليه يحدده مقروءاً
 *  - «تحديد الكل كمقروء» + حالة فارغة واضحة
 * ============================================================================
 */

import * as React from "react";
import {
  Bell,
  RadioTower,
  CheckCircle2,
  Copy,
  TriangleAlert,
  AlarmClock,
  CalendarClock,
  Lock,
  UserCheck,
  UserMinus,
  UserX,
  ShieldAlert,
  Smartphone,
  Info,
  Loader2,
  CheckCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  clearNotifications,
} from "@/lib/data-layer";
import { useI18n, localizedError, attendanceStatusLabel } from "@/lib/i18n";
import { relativeTime } from "@/lib/format";
import type { NotificationRow, NotificationType } from "@/lib/types";

/* أيقونة ولون كل نوع إشعار */
const TYPE_META: Record<
  NotificationType,
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  session_opened: { icon: RadioTower, tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  attendance_recorded: { icon: CheckCircle2, tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  attendance_duplicate: { icon: Copy, tone: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  attendance_warning: { icon: TriangleAlert, tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  status_warning: { icon: TriangleAlert, tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  status_critical: { icon: AlarmClock, tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  upcoming_class: { icon: CalendarClock, tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  session_closed: { icon: Lock, tone: "bg-muted text-muted-foreground" },
  account_approved: { icon: UserCheck, tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  account_rejected: { icon: UserX, tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  device_transfer_request: { icon: Smartphone, tone: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  device_transfer_approved: { icon: CheckCircle2, tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  device_transfer_rejected: { icon: UserX, tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  suspicious_activity: { icon: ShieldAlert, tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  attendance_revoked: { icon: UserMinus, tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  system: { icon: Info, tone: "bg-primary/12 text-primary" },
};

export function NotificationsPanel({
  userId,
  refreshSignal = 0,
}: {
  userId: string;
  /** إشارة من الأب لإعادة الجلب بعد حدث (تسجيل حضور مثلاً) */
  refreshSignal?: number;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  const [markingAll, setMarkingAll] = React.useState(false);
  /* تأكيد حذف الكل: نقرة أولى تجهّزه ونقرة ثانية تنفّذه */
  const [confirmingClear, setConfirmingClear] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const unreadCount = open ? (rows?.filter((row) => !row.read).length ?? 0) : unread;

  /* استقصاء خفيف لعدد غير المقروء فقط (كل 15 ثانية) */
  React.useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const count = await fetchUnreadNotificationCount(userId);
        if (!stopped) setUnread(count);
      } catch {
        /* تجاهل أخطاء الاستقصاء الفردي */
      }
    };
    void poll();
    const id = window.setInterval(poll, 15000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [userId]);

  /* جلب القائمة الكاملة عند فتح اللوحة أو إشارة التحديث أثناء الفتح */
  const loadRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications(userId);
      setRows(data);
      setUnread(data.filter((row) => !row.read).length);
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setLoading(false);
    }
  }, [userId, locale]);

  React.useEffect(() => {
    if (open) void loadRows();
  }, [open, loadRows, refreshSignal]);

  /* تحديد إشعار واحد كمقروء عند الضغط عليه */
  async function handleRead(row: NotificationRow) {
    if (row.read) return;
    setRows((prev) =>
      prev ? prev.map((item) => (item.id === row.id ? { ...item, read: true } : item)) : prev
    );
    try {
      await markNotificationRead(row.id);
      setUnread((prev) => Math.max(0, prev - 1));
    } catch {
      /* تجاهل — سيُعاد مزامنته في الجلب القادم */
    }
  }

  /* تحديد الكل كمقروء */
  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(userId);
      setRows((prev) => (prev ? prev.map((row) => ({ ...row, read: true })) : prev));
      setUnread(0);
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setMarkingAll(false);
    }
  }

  /* حذف إشعار واحد */
  async function handleDelete(row: NotificationRow) {
    setDeletingId(row.id);
    try {
      await deleteNotification(row.id, userId);
      setRows((prev) => (prev ? prev.filter((item) => item.id !== row.id) : prev));
      if (!row.read) setUnread((prev) => Math.max(0, prev - 1));
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setDeletingId(null);
    }
  }

  /* حذف كل الإشعارات (بتأكيد من خطوتين) */
  async function handleClearAll() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      // إلغاء التأكيد تلقائياً بعد 4 ثوانٍ إن لم يُؤكّد
      window.setTimeout(() => setConfirmingClear(false), 4000);
      return;
    }
    setClearing(true);
    try {
      await clearNotifications(userId);
      setRows([]);
      setUnread(0);
      setConfirmingClear(false);
      toast.success(t("notifications.notificationsClearedToast"));
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setClearing(false);
    }
  }

  /** نص الإشعار المترجم مع تجهيز البارامترات (حالة الحضور مثلاً) */
  function notificationText(row: NotificationRow, part: "title" | "body"): string {
    const params: Record<string, string | number> = { ...row.params };
    if (row.type === "attendance_recorded" && typeof params.status === "string") {
      params.status = attendanceStatusLabel(locale, params.status);
    }
    return t(`notif.${row.type}.${part}`, params);
  }

  return (
    <>
      {/* زر الجرس + شارة العدد */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          unreadCount > 0
            ? `${t("notifications.openPanel")} — ${t("notifications.unreadBadge", { count: unreadCount })}`
            : t("notifications.openPanel")
        }
        title={t("notifications.title")}
        className="glass-chip relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-all hover:scale-105 hover:text-primary active:scale-95"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -end-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white tabular-nums shadow-md"
            dir="ltr"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* لوحة الإشعارات المنزلقة — تعمل ممتازاً على الموبايل والكمبيوتر */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={locale === "ar" ? "left" : "right"}
          className="glass-sheet w-full sm:max-w-md p-0 flex flex-col"
        >
          <SheetHeader className="px-5 pb-3 pt-5 border-b border-border/60">
            <SheetTitle className="flex items-center gap-2 text-lg font-black">
              <Bell className="h-5 w-5 text-primary" />
              {t("notifications.title")}
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-extrabold text-rose-600 dark:text-rose-400 tabular-nums" dir="ltr">
                  {unreadCount}
                </span>
              )}
            </SheetTitle>
            {rows && rows.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearing}
                className={`inline-flex w-fit items-center gap-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${
                  confirmingClear
                    ? "text-rose-600 dark:text-rose-400 hover:underline"
                    : "text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                }`}
                aria-label={t("notifications.clearAllAria")}
              >
                {clearing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {confirmingClear
                  ? t("notifications.clearAllConfirm")
                  : t("notifications.clearAll")}
              </button>
            )}
            {rows && rows.some((row) => !row.read) && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={markingAll}
                className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-primary hover:underline disabled:opacity-60"
              >
                {markingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                {t("notifications.markAllRead")}
              </button>
            )}
          </SheetHeader>

          {/* القائمة */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {loading && !rows ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs font-bold">{t("common.loading")}</p>
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <Bell className="h-7 w-7" />
                </span>
                <p className="text-sm font-extrabold text-foreground">
                  {t("notifications.empty")}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("notifications.emptyHint")}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {rows.map((row) => {
                  const meta = TYPE_META[row.type] ?? TYPE_META.system;
                  const Icon = meta.icon;
                  const deleting = deletingId === row.id;
                  return (
                    <li key={row.id} className="relative">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleRead(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleRead(row);
                          }
                        }}
                        className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border pe-11 px-3.5 py-3 text-start transition-all hover:scale-[1.01] ${
                          row.read
                            ? "border-border/50 bg-transparent opacity-70"
                            : "border-primary/25 bg-primary/6"
                        }`}
                      >
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${meta.tone}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-extrabold text-foreground">
                              {notificationText(row, "title")}
                            </span>
                            {!row.read && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {notificationText(row, "body")}
                          </span>
                          <span className="mt-1 block text-[10px] font-bold text-muted-foreground/80">
                            {relativeTime(row.created_at, Date.now(), locale)}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={deleting}
                        className="absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full text-muted-foreground/70 transition-all hover:bg-rose-500/12 hover:text-rose-600 active:scale-90 disabled:opacity-40 dark:hover:text-rose-400"
                        title={t("notifications.deleteAria")}
                        aria-label={t("notifications.deleteAria")}
                      >
                        {deleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
