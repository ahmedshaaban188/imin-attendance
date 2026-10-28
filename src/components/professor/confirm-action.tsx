"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الدكتور — نافذة تأكيد موحّدة للإجراءات الحساسة
 * ============================================================================
 *  تستبدل نوافذ window.confirm الأصلية بنوافذ حوارية أنيقة تتماشى مع هوية
 *  النظام الزجاجية، وتُستخدم لتأكيد: الإنذار / الحظر / فك الحظر /
 *  قبول طلب تسجيل طالب / رفضه.
 *
 *  الاستخدام: مكوّن مُدار (controlled) — الأب يخزن "الإجراء المعلّق" ويمرره:
 *    <ConfirmAction
 *      pending={{ type: "warn", studentId: "..." }}
 *      busy={busy}
 *      onCancel={() => setPending(null)}
 *      onConfirm={() => executePending()}
 *    />
 * ============================================================================
 */

import { AlertTriangle, Ban, CalendarX2, FileX2, Loader2, ShieldCheck, Smartphone, UserCheck, UserMinus, UserX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";

/** نوع الإجراء المعلّق الذي ينتظر تأكيد الدكتور */
export type PendingAction =
  | { type: "warn"; studentId: string; studentName: string }
  | { type: "block"; studentId: string; studentName: string }
  | { type: "unblock"; studentId: string; studentName: string }
  | { type: "approve"; studentId: string; studentName: string }
  | { type: "reject"; studentId: string; studentName: string }
  | { type: "approve-device"; requestId: string; studentId: string; studentName: string }
  | { type: "reject-device"; requestId: string; studentId: string; studentName: string }
  | { type: "delete-session"; sessionId: string; sessionLabel: string }
  | { type: "delete-attendance"; attendanceId: string; studentId: string; studentName: string }
  | { type: "delete-warning"; warningId: string; studentId: string; studentName: string };

/** نص «من/عن» الذي يُمرر لوصف الإجراء — اسم الطالب أو عنوان الجلسة */
function actionLabelOf(pending: PendingAction): string {
  if (pending.type === "delete-session") return pending.sessionLabel;
  return pending.studentName;
}

/** دالة الترجمة t — تُمرر لبناء نصوص الإجراءات */
type TFunc = (key: string, params?: Record<string, string | number>) => string;

/** مظهر كل إجراء: الأيقونة، الألوان، النصوص (مترجمة حسب اللغة) */
function actionMeta(t: TFunc): Record<
  PendingAction["type"],
  {
    title: string;
    description: (name: string) => string;
    confirmLabel: string;
    icon: typeof AlertTriangle;
    iconClass: string;
    actionClass: string;
  }
> {
  return {
    warn: {
      title: t("professor.confirmWarnTitle"),
      description: (name) => t("professor.confirmWarnBody", { name }),
      confirmLabel: t("professor.confirmWarnYes"),
      icon: AlertTriangle,
      iconClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
      actionClass:
        "bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500/40",
    },
    block: {
      title: t("professor.confirmBlockTitle"),
      description: (name) => t("professor.confirmBlockBody", { name }),
      confirmLabel: t("professor.confirmBlockYes"),
      icon: Ban,
      iconClass: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
      actionClass:
        "bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500/40",
    },
    unblock: {
      title: t("professor.confirmUnblockTitle"),
      description: (name) => t("professor.confirmUnblockBody", { name }),
      confirmLabel: t("professor.confirmUnblockYes"),
      icon: ShieldCheck,
      iconClass: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      actionClass:
        "bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500/40",
    },
    approve: {
      title: t("professor.confirmApproveTitle"),
      description: (name) => t("professor.confirmApproveBody", { name }),
      confirmLabel: t("professor.confirmApproveYes"),
      icon: UserCheck,
      iconClass: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      actionClass:
        "bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500/40",
    },
    reject: {
      title: t("professor.confirmRejectTitle"),
      description: (name) => t("professor.confirmRejectBody", { name }),
      confirmLabel: t("professor.confirmRejectYes"),
      icon: UserX,
      iconClass: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
      actionClass:
        "bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500/40",
    },
    "approve-device": {
      title: t("professor.confirmDeviceApproveTitle"),
      description: (name) => t("professor.confirmDeviceApproveBody", { name }),
      confirmLabel: t("professor.confirmDeviceApproveYes"),
      icon: Smartphone,
      iconClass: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      actionClass:
        "bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500/40",
    },
    "reject-device": {
      title: t("professor.confirmDeviceRejectTitle"),
      description: (name) => t("professor.confirmDeviceRejectBody", { name }),
      confirmLabel: t("professor.confirmDeviceRejectYes"),
      icon: Smartphone,
      iconClass: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
      actionClass:
        "bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500/40",
    },
    "delete-session": {
      title: t("professor.confirmDeleteSessionTitle"),
      description: (name) => t("professor.confirmDeleteSessionBody", { name }),
      confirmLabel: t("professor.confirmDeleteSessionYes"),
      icon: CalendarX2,
      iconClass: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
      actionClass:
        "bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500/40",
    },
    "delete-attendance": {
      title: t("professor.confirmDeleteAttendanceTitle"),
      description: (name) => t("professor.confirmDeleteAttendanceBody", { name }),
      confirmLabel: t("professor.confirmDeleteAttendanceYes"),
      icon: UserMinus,
      iconClass: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
      actionClass:
        "bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500/40",
    },
    "delete-warning": {
      title: t("professor.confirmDeleteWarningTitle"),
      description: (name) => t("professor.confirmDeleteWarningBody", { name }),
      confirmLabel: t("professor.confirmDeleteWarningYes"),
      icon: FileX2,
      iconClass: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
      actionClass:
        "bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500/40",
    },
  };
}

export interface ConfirmActionProps {
  /** الإجراء المعلّق — أو null لإخفاء النافذة */
  pending: PendingAction | null;
  /** true أثناء تنفيذ الإجراء على السيرفر */
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmAction({
  pending,
  busy,
  onConfirm,
  onCancel,
}: ConfirmActionProps) {
  const { t, locale } = useI18n();
  const meta = pending ? actionMeta(t)[pending.type] : null;
  const Icon = meta?.icon;
  const label = pending ? actionLabelOf(pending) : "";

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="max-w-md rounded-2xl" dir={locale === "ar" ? "rtl" : "ltr"}>
        {pending && meta && Icon && (
          <>
            <AlertDialogHeader className="flex items-start gap-3 space-y-0">
              <span
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${meta.iconClass}`}
                aria-hidden="true"
              >
                <Icon className="h-6 w-6" />
              </span>
              <div className="min-w-0 pt-0.5">
                <AlertDialogTitle className="text-start text-lg font-black">
                  {meta.title}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-1.5 text-start text-sm leading-relaxed">
                  {meta.description(label)}
                </AlertDialogDescription>
              </div>
            </AlertDialogHeader>

            <AlertDialogFooter className="flex-row-reverse gap-2 sm:justify-start">
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
                disabled={busy}
                className={`h-11 rounded-xl px-5 text-sm font-extrabold ${meta.actionClass}`}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("professor.executing")}
                  </>
                ) : (
                  meta.confirmLabel
                )}
              </AlertDialogAction>
              <AlertDialogCancel
                disabled={busy}
                className="h-11 rounded-xl px-5 text-sm font-bold"
              >
                {t("professor.cancel")}
              </AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
