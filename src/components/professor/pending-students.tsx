"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الدكتور — طلبات تسجيل الطلاب (حماية الحسابات)
 * ============================================================================
 *  - كل حساب طالب جديد يبدأ «بانتظار موافقة الدكتور» ولا يستطيع تسجيل الدخول
 *    قبل قبوله — هذه البطاقة تعرض الطلبات الواردة مع مستندات الطالب كاملة
 *    (الصورة الشخصية + بطاقة الوش + بطاقة الظهر) لمراجعتها قبل القرار
 *  - أي دكتور في الجامعة يمكنه قبول الطلب أو رفضه (بتأكيد موحّد)
 *  - تحديث دوري كل 10 ثوانٍ + زر تحديث يدوي — حتى تظهر الطلبات فور وصولها
 * ============================================================================
 */

import * as React from "react";
import {
  BadgeCheck,
  Ban,
  CalendarDays,
  Expand,
  IdCard,
  FlipHorizontal,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  UserCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ConfirmAction,
  type PendingAction,
} from "@/components/professor/confirm-action";
import { fetchPendingStudents, setStudentStatus } from "@/lib/data-layer";
import { useI18n, localizedError } from "@/lib/i18n";
import { formatShortDate } from "@/lib/format";
import type { AppUser } from "@/lib/types";

export interface PendingStudentsProps {
  /** مفتاح التحديث الخارجي (يتغيّر عند فتح/قفل جلسة مثلاً) */
  refreshKey?: string;
  /** يُخبر الأب بعدد الطلبات المعلّقة (لشارة التنبيه في الترحيب) */
  onCountChange?: (count: number) => void;
}

export function PendingStudents({ refreshKey, onCountChange }: PendingStudentsProps) {
  const { t, locale } = useI18n();
  const [students, setStudents] = React.useState<AppUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
  const [viewing, setViewing] = React.useState<{ url: string; title: string } | null>(null);

  const onCountChangeRef = React.useRef(onCountChange);
  React.useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  /* ----------------------- جلب الطلبات المعلّقة ----------------------- */

  const loadPending = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const rows = await fetchPendingStudents();
      setStudents(rows);
      onCountChangeRef.current?.(rows.length);
    } catch (error) {
      if (!silent) toast.error(localizedError(error, locale));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  React.useEffect(() => {
    loadPending();
  }, [loadPending, refreshKey]);

  /* تحديث دوري كل 10 ثوانٍ (لا يعمل والتبويب مخفي) */
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      loadPending(true);
    }, 10000);
    return () => window.clearInterval(id);
  }, [loadPending]);

  /* ------------------- قبول / رفض الطلب (بتأكيد) ------------------- */

  async function executePendingAction() {
    if (!pendingAction) return;
    /* هذا المكوّن ينشئ إجراءي القبول/الرفض فقط — تأمين النوع قبل التفكيك */
    if (pendingAction.type !== "approve" && pendingAction.type !== "reject") return;
    const { type, studentId, studentName } = pendingAction;

    setActionBusy(true);
    try {
      if (type === "approve") {
        await setStudentStatus(studentId, "approved");
        toast.success(t("professor.approveToast", { name: studentName }));
      } else if (type === "reject") {
        await setStudentStatus(studentId, "rejected");
        toast.success(t("professor.rejectToast", { name: studentName }));
      }
      await loadPending(true);
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setActionBusy(false);
      setPendingAction(null);
    }
  }

  /* ------------------------------ العرض ------------------------------ */

  return (
    <section className="glass-card p-5 sm:p-6" aria-label={t("professor.pendingTitle")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-black">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <UserCheck className="h-5 w-5" />
          </span>
          {t("professor.pendingTitle")}
          {students.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-sm font-black tabular-nums text-amber-600 dark:text-amber-400">
              {students.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => loadPending(true)}
          disabled={refreshing}
          className="glass-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-foreground/80 transition-all hover:text-primary disabled:opacity-50"
          aria-label={t("professor.pendingRefresh")}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {t("professor.pendingRefresh")}
        </button>
      </header>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {t("professor.pendingNote")}
      </p>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : students.length === 0 ? (
          <div
            className="flex h-36 flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-border text-center"
            aria-label={t("professor.noPending")}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Inbox className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-muted-foreground">
              {t("professor.noPending")}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {t("professor.noPendingHint")}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {students.map((student) => (
              <li
                key={student.id}
                className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {/* بيانات الطالب */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-black text-foreground">
                      {student.full_name}
                      <span className="rounded-full bg-amber-500/12 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                        {t("professor.awaitingYourApproval")}
                      </span>
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-xs font-bold text-muted-foreground" dir="ltr">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {student.email}
                    </p>
                    <p className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <span className="flex items-center gap-1.5 tabular-nums" dir="ltr">
                        <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                        {student.university_id}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {t("professor.requestOn", { date: formatShortDate(student.created_at, locale) })}
                      </span>
                    </p>

                    {/* مستندات الطالب — اضغط للعرض الكامل */}
                    <div className="flex flex-wrap gap-2 pt-1.5">
                      {(
                        [
                          { url: student.personal_photo_url, title: t("idCard.docPersonal"), icon: UserRound },
                          { url: student.id_card_url, title: t("idCard.docIdFront"), icon: IdCard },
                          { url: student.id_card_back_url, title: t("idCard.docIdBack"), icon: FlipHorizontal },
                        ] as const
                      ).map(
                        (doc) =>
                          doc.url && (
                            <button
                              key={doc.title}
                              type="button"
                              onClick={() => setViewing({ url: doc.url!, title: doc.title })}
                              className="group relative overflow-hidden rounded-lg ring-1 ring-border transition-all hover:ring-2 hover:ring-primary/50"
                              aria-label={`عرض ${doc.title} — ${student.full_name}`}
                            >
                              <img
                                src={doc.url}
                                alt={`${doc.title} — ${student.full_name}`}
                                className="h-14 w-20 object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 px-1 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                                <doc.icon className="h-3 w-3 shrink-0" />
                                <span className="truncate">{doc.title}</span>
                                <Expand className="h-3 w-3 shrink-0" />
                              </span>
                            </button>
                          )
                      )}
                      {!student.personal_photo_url && !student.id_card_url && !student.id_card_back_url && (
                        <p className="text-[11px] font-bold text-muted-foreground">
                          {t("professor.noDocuments")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* أزرار القرار */}
                  <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                    <Button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          type: "approve",
                          studentId: student.id,
                          studentName: student.full_name,
                        })
                      }
                      disabled={actionBusy}
                      className="h-11 flex-1 rounded-xl bg-emerald-500 px-4 text-sm font-extrabold text-white hover:bg-emerald-600 focus-visible:ring-emerald-500/40 sm:w-32"
                    >
                      <UserCheck className="h-4.5 w-4.5" />
                      {t("professor.approve")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          type: "reject",
                          studentId: student.id,
                          studentName: student.full_name,
                        })
                      }
                      disabled={actionBusy}
                      variant="outline"
                      className="h-11 flex-1 rounded-xl border-rose-500/40 px-4 text-sm font-extrabold text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 sm:w-32"
                    >
                      <Ban className="h-4.5 w-4.5" />
                      {t("professor.reject")}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* نافذة تأكيد القبول/الرفض */}
      <ConfirmAction
        pending={pendingAction}
        busy={actionBusy}
        onConfirm={executePendingAction}
        onCancel={() => setPendingAction(null)}
      />

      {/* نافذة عرض مستندات الطالب بالحجم الكامل */}
      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      >
        <DialogContent className="max-w-lg">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.title}</DialogTitle>
                <DialogDescription>
                  {t("professor.docsFullSize")}
                </DialogDescription>
              </DialogHeader>
              <img
                src={viewing.url}
                alt={viewing.title}
                className="max-h-[60vh] w-full rounded-xl object-contain ring-1 ring-border"
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* مؤشر تنفيذ صغير عند التحديث الصامت */}
      {refreshing && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("professor.updatingRequests")}
        </p>
      )}
    </section>
  );
}
