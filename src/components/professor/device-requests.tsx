"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الدكتور — طلبات ربط جهاز جديد (حماية الحسابات)
 * ============================================================================
 *  - حين يُرفض دخول طالب لأن حسابه مربوط بجهاز آخر (DEVICE_MISMATCH)
 *    يمكنه طلب ربط جهازه الجديد من شاشة الدخول — الطلب يظهر هنا
 *  - الدكتور يراجع الطلب (اسم الطالب + رقمه + تاريخ الطلب) ويقرر:
 *      قبول → ينتقل الحساب للجهاز الجديد فوراً
 *      رفض  → يبقى الحساب على جهازه الأصلي (محاولة دخول مشتركة على الأغلب)
 *  - تحديث دوري كل 10 ثوانٍ + زر تحديث يدوي
 * ============================================================================
 */

import * as React from "react";
import {
  BadgeCheck,
  CalendarDays,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Smartphone,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ConfirmAction,
  type PendingAction,
} from "@/components/professor/confirm-action";
import { fetchDeviceRequests, resolveDeviceRequest } from "@/lib/data-layer";
import { useI18n, localizedError } from "@/lib/i18n";
import { formatShortDate } from "@/lib/format";
import type { DeviceRequestRow } from "@/lib/types";

export interface DeviceRequestsProps {
  /** معرّف الدكتور — لقرار الموافقة/الرفض (تحقق خادمي من صلاحيته) */
  professorId: string;
  /** مفتاح التحديث الخارجي (يتغيّر عند فتح/قفل جلسة مثلاً) */
  refreshKey?: string;
}

export function DeviceRequests({ professorId, refreshKey }: DeviceRequestsProps) {
  const { t, locale } = useI18n();
  const [requests, setRequests] = React.useState<DeviceRequestRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);

  /* ----------------------- جلب الطلبات المعلّقة ----------------------- */

  const loadRequests = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const rows = await fetchDeviceRequests();
      setRequests(rows);
    } catch (error) {
      if (!silent) toast.error(localizedError(error, locale));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  React.useEffect(() => {
    loadRequests();
  }, [loadRequests, refreshKey]);

  /* تحديث دوري كل 10 ثوانٍ (لا يعمل والتبويب مخفي) */
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      loadRequests(true);
    }, 10000);
    return () => window.clearInterval(id);
  }, [loadRequests]);

  /* ------------------- قبول / رفض الطلب (بتأكيد) ------------------- */

  async function executePendingAction() {
    if (!pendingAction) return;

    setActionBusy(true);
    try {
      if (pendingAction.type === "approve-device") {
        const { requestId, studentName } = pendingAction;
        await resolveDeviceRequest({ professor_id: professorId, request_id: requestId, approve: true });
        toast.success(t("professor.deviceApproveToast", { name: studentName }));
      } else if (pendingAction.type === "reject-device") {
        const { requestId, studentName } = pendingAction;
        await resolveDeviceRequest({ professor_id: professorId, request_id: requestId, approve: false });
        toast.info(t("professor.deviceRejectToast", { name: studentName }));
      }
      await loadRequests(true);
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setActionBusy(false);
      setPendingAction(null);
    }
  }

  /** أول حرفين من اسم الطالب — للأفاتار عند غياب الصورة */
  function initials(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0)).join("") || "؟";
  }

  /* ------------------------------ العرض ------------------------------ */

  return (
    <section className="glass-card p-5 sm:p-6" aria-label={t("professor.deviceRequestsTitle")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-black">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <Smartphone className="h-5 w-5" />
          </span>
          {t("professor.deviceRequestsTitle")}
          {requests.length > 0 && (
            <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-sm font-black tabular-nums text-sky-600 dark:text-sky-400">
              {requests.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => loadRequests(true)}
          disabled={refreshing}
          className="glass-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-foreground/80 transition-all hover:text-primary disabled:opacity-50"
          aria-label={t("common.refresh")}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </button>
      </header>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {t("professor.deviceRequestsNote")}
      </p>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div
            className="flex h-32 flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-border text-center"
            aria-label={t("professor.noDeviceRequests")}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Inbox className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-muted-foreground">
              {t("professor.noDeviceRequests")}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li
                key={request.id}
                className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {/* صورة الطالب + بياناته */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="h-12 w-12 shrink-0 rounded-xl border border-border">
                      <AvatarImage
                        src={request.student?.personal_photo_url ?? undefined}
                        alt={request.student?.full_name ?? ""}
                      />
                      <AvatarFallback className="rounded-xl bg-primary/12 text-sm font-black text-primary">
                        {initials(request.student?.full_name ?? "؟")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-black text-foreground">
                        <span className="truncate">{request.student?.full_name ?? "—"}</span>
                        <span className="rounded-full bg-sky-500/12 px-2.5 py-0.5 text-[10px] font-extrabold text-sky-600 dark:text-sky-400">
                          {t("professor.newDeviceBadge")}
                        </span>
                      </p>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">
                        <span className="flex items-center gap-1.5 tabular-nums" dir="ltr">
                          <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                          {request.student?.university_id ?? "—"}
                        </span>
                        <span className="flex items-center gap-1.5 truncate" dir="ltr">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          {request.student?.email ?? "—"}
                        </span>
                      </p>
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                        <CalendarDays className="h-3 w-3" />
                        {t("professor.requestOn", {
                          date: formatShortDate(request.created_at, locale),
                        })}
                      </p>
                    </div>
                  </div>

                  {/* أزرار القرار */}
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        setPendingAction({
                          type: "approve-device",
                          requestId: request.id,
                          studentId: request.student?.id ?? "",
                          studentName: request.student?.full_name ?? "—",
                        })
                      }
                      className="h-9 rounded-xl bg-emerald-500 px-4 text-xs font-extrabold text-white hover:bg-emerald-600"
                    >
                      <UserCheck className="h-4 w-4" />
                      {t("professor.deviceApproveBtn")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPendingAction({
                          type: "reject-device",
                          requestId: request.id,
                          studentId: request.student?.id ?? "",
                          studentName: request.student?.full_name ?? "—",
                        })
                      }
                      className="h-9 rounded-xl border-rose-500/40 px-4 text-xs font-extrabold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                    >
                      <UserX className="h-4 w-4" />
                      {t("professor.deviceRejectBtn")}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* نافذة تأكيد قرار الجهاز */}
      <ConfirmAction
        pending={pendingAction}
        busy={actionBusy}
        onConfirm={executePendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </section>
  );
}
