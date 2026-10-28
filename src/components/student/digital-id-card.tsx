"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الطالب — البطاقة الجامعية الرقمية (نسخة مطوّرة)
 * ============================================================================
 *  - بيانات الطالب: الاسم + الرقم الجامعي + البيانات الأكاديمية
 *    (الكلية / البرنامج / الفرقة إن وُجدت) + «عضو منذ»
 *  - QR للهوية فقط (يتولّد من الرقم الجامعي) — ليس وسيلة لتسجيل الحضور،
 *    الحضور يتم عبر الجلسات الجغرافية فقط
 *  - «مستنداتي المسجّلة»: الصورة الشخصية + بطاقة الوش + بطاقة الظهر —
 *    إضافة/استبدال في أي وقت ويظهر فوراً عند الدكتور أيضاً
 *  - باركود CODE128 قابل للمسح — على بلاطة بيضاء للوضوح في الوضعين
 *  - كامل الترجمة عربي/إنجليزي مع RTL/LTR
 * ============================================================================
 */

import * as React from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import {
  QrCode,
  ScanLine,
  BadgeCheck,
  CalendarDays,
  IdCard,
  FlipHorizontal,
  UserRound,
  Expand,
  Pencil,
  Plus,
  Loader2,
  Building2,
  Layers,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { LogoMark } from "@/components/logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShortDate } from "@/lib/format";
import { uploadIdCard, updateUserPhotos } from "@/lib/data-layer";
import { compressImage, validateImageFile, safePhotoPath } from "@/lib/image-utils";
import { useI18n, localizedError } from "@/lib/i18n";
import type { AppUser } from "@/lib/types";

/* خانات المستندات الثلاثة — مع حقل كل خانة في جدول users */
type DocSlot = "personal" | "front" | "back";

const DOC_META: Record<
  DocSlot,
  {
    /** مفتاح الترجمة لعنوان الخانة */
    titleKey: string;
    icon: React.ComponentType<{ className?: string }>;
    field: "personal_photo_url" | "id_card_url" | "id_card_back_url";
    suffix: string;
  }
> = {
  personal: {
    titleKey: "idCard.docPersonal",
    icon: UserRound,
    field: "personal_photo_url",
    suffix: "personal",
  },
  front: {
    titleKey: "idCard.docIdFront",
    icon: IdCard,
    field: "id_card_url",
    suffix: "front",
  },
  back: {
    titleKey: "idCard.docIdBack",
    icon: FlipHorizontal,
    field: "id_card_back_url",
    suffix: "back",
  },
};

const DOC_ORDER: DocSlot[] = ["personal", "front", "back"];

export function DigitalIdCard({
  user,
  onUserUpdate,
}: {
  user: AppUser;
  /** يُستدعى بعد حفظ صورة جديدة لتحدّث بيانات المستخدم في كل النظام */
  onUserUpdate: (user: AppUser) => void;
}) {
  const { t, locale } = useI18n();
  const qrCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const barcodeCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const [barcodeSupported, setBarcodeSupported] = React.useState(true);

  /* الصورة المعروضة في نافذة العرض الكامل (اختياري) */
  const [viewing, setViewing] = React.useState<{ url: string; title: string } | null>(null);

  /* رفع/استبدال المستندات من داخل البطاقة */
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const slotToUploadRef = React.useRef<DocSlot | null>(null);
  const [uploadingSlot, setUploadingSlot] = React.useState<DocSlot | null>(null);

  /* ------------------ توليد رمز QR من الرقم الجامعي ------------------ */
  React.useEffect(() => {
    if (!qrCanvasRef.current || !user.university_id) return;

    QRCode.toCanvas(qrCanvasRef.current, user.university_id, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#17181c",
        light: "#ffffff",
      },
    }).catch((error) => {
      console.warn("ImIn: QR generation failed", error);
    });
  }, [user.university_id]);

  /* ---------------- توليد الباركود CODE128 من الرقم الجامعي ---------------- */
  React.useEffect(() => {
    if (!barcodeCanvasRef.current || !user.university_id) return;
    try {
      JsBarcode(barcodeCanvasRef.current, user.university_id, {
        format: "CODE128",
        width: 2,
        height: 58,
        displayValue: true,
        fontSize: 16,
        font: "monospace",
        fontOptions: "bold",
        textMargin: 4,
        margin: 6,
        lineColor: "#17181c",
        background: "#ffffff",
        valid: (isValid: boolean) => setBarcodeSupported(isValid),
      });
    } catch (error) {
      console.warn("ImIn: barcode generation failed", error);
      setBarcodeSupported(false);
    }
  }, [user.university_id]);

  const initials = user.full_name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");

  /* الصورة الشخصية أولاً — وإن لم توجد فصورة البطاقة (توافق مع الحسابات القديمة) */
  const mainPhoto = user.personal_photo_url ?? user.id_card_url;

  /* البيانات الأكاديمية المتوفرة */
  const academicInfo = [
    { icon: Building2, label: t("idCard.faculty"), value: user.faculty },
    { icon: Layers, label: t("idCard.program"), value: user.program },
    { icon: GraduationCap, label: t("idCard.academicYear"), value: user.academic_year },
  ].filter((item) => Boolean(item.value));

  /* ---------------- إضافة / استبدال مستند من حساب الطالب ---------------- */

  function pickForSlot(slot: DocSlot) {
    slotToUploadRef.current = slot;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const slot = slotToUploadRef.current;
    if (!file || !slot) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      toast.error(validationError);
      slotToUploadRef.current = null;
      return;
    }

    setUploadingSlot(slot);
    try {
      const blob = await compressImage(file);
      const path = safePhotoPath(user.university_id, DOC_META[slot].suffix);
      const url = await uploadIdCard(path, blob);
      const updatedUser = await updateUserPhotos(user.id, {
        [DOC_META[slot].field]: url,
      });
      onUserUpdate(updatedUser);
      toast.success(t("idCard.docSavedToast", { title: t(DOC_META[slot].titleKey) }));
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setUploadingSlot(null);
      slotToUploadRef.current = null;
    }
  }

  return (
    <section className="glass-card overflow-hidden" aria-label={t("idCard.title")}>
      {/* رأس البطاقة — شريط حبري داكن دائم مع المونوجرام */}
      <div className="ink-strip flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <LogoMark size={38} />
          <div className="leading-tight">
            <p className="text-base font-black text-white">ImIn</p>
            <p className="text-[11px] font-bold text-white/85">{t("idCard.title")}</p>
          </div>
        </div>
        <span className="rounded-full bg-white/18 px-3 py-1 text-[11px] font-extrabold text-white">
          {t("idCard.roleStudent")}
        </span>
      </div>

      {/* بيانات الطالب — الصورة الشخصية بجانب «عضو منذ» */}
      <div className="flex items-center gap-4 px-5 py-5">
        {mainPhoto ? (
          <button
            type="button"
            onClick={() => setViewing({ url: mainPhoto, title: t("idCard.docPersonal") })}
            className="group relative shrink-0 rounded-2xl focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label={t("idCard.viewFullSize")}
            title={t("idCard.viewFullSize")}
          >
            <img
              src={mainPhoto}
              alt={t("idCard.photoOf", { name: user.full_name })}
              className="h-24 w-20 rounded-2xl object-cover ring-2 ring-primary/25 transition-transform duration-300 group-hover:scale-105"
            />
            <span className="absolute -bottom-1.5 -end-1.5 grid h-7 w-7 place-items-center rounded-full bg-primary text-white shadow-lg">
              <Expand className="h-3.5 w-3.5" />
            </span>
          </button>
        ) : (
          <span className="grid h-24 w-20 shrink-0 place-items-center rounded-2xl bg-primary/12 text-2xl font-black text-primary ring-2 ring-primary/20">
            {initials}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black leading-snug text-foreground">
            {user.full_name}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-extrabold tabular-nums text-primary" dir="ltr">
            <BadgeCheck className="h-4 w-4 shrink-0" />
            {user.university_id}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">
            {user.email}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {t("idCard.memberSince", { date: formatShortDate(user.created_at, locale) })}
          </p>
        </div>
      </div>

      {/* البيانات الأكاديمية (إن وُجدت) — تُجمع عند التسجيل أو تُترك فارغة */}
      {academicInfo.length > 0 && (
        <div className="mx-5 mb-1 grid grid-cols-3 gap-2">
          {academicInfo.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border/60 bg-background/40 px-2.5 py-2 text-center"
            >
              <item.icon className="mx-auto h-4 w-4 text-primary" />
              <p className="mt-1 text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-0.5 truncate text-xs font-black text-foreground" title={item.value ?? undefined}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* رمز QR — للهوية والتحقق الشخصي فقط وليس لتسجيل الحضور */}
      <div className="px-5 pb-2">
        <div className="flex items-center gap-4">
          <div className="code-tile shrink-0">
            <canvas
              ref={qrCanvasRef}
              className="block h-[176px] w-[176px]"
              role="img"
              aria-label={t("idCard.qrAria", { id: user.university_id })}
            />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
              <QrCode className="h-4 w-4 text-primary" />
              {t("idCard.quickVerify")}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t("idCard.qrNote")}
            </p>
          </div>
        </div>
      </div>

      {/* مستنداتي المسجّلة: الصورة الشخصية + بطاقة الوش + بطاقة الظهر —
          الخانة الناقصة يمكن إضافتها والموجودة يمكن استبدالها بصورة أوضح */}
      <div className="px-5 pb-2 pt-3">
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
          <IdCard className="h-4 w-4 text-primary" />
          {t("idCard.myDocuments")}
        </p>

        <div className="mt-2.5 grid grid-cols-3 gap-2.5">
          {DOC_ORDER.map((slot) => {
            const meta = DOC_META[slot];
            const url = user[meta.field];
            const DocIcon = meta.icon;
            const uploading = uploadingSlot === slot;
            const title = t(meta.titleKey);

            return (
              <div key={slot} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (uploading) return;
                    if (url) {
                      setViewing({ url, title });
                    } else {
                      pickForSlot(slot);
                    }
                  }}
                  disabled={uploadingSlot !== null}
                  className="group relative block w-full overflow-hidden rounded-xl ring-1 ring-border transition-all hover:ring-2 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70"
                  aria-label={url ? title : `${t("idCard.add")} ${title}`}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={title}
                      className="h-20 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-20 w-full flex-col items-center justify-center gap-1 border-2 border-dashed border-border bg-muted/25 text-muted-foreground">
                      <Plus className="h-4.5 w-4.5" />
                      <span className="text-[10px] font-extrabold">{t("idCard.add")}</span>
                    </span>
                  )}

                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/55 px-1.5 py-1 text-[9px] font-bold text-white backdrop-blur-sm">
                    <DocIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{title}</span>
                    {url && <Expand className="ms-auto h-3 w-3 shrink-0" />}
                  </span>

                  {uploading && (
                    <span className="absolute inset-0 grid place-items-center bg-background/70">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </span>
                  )}
                </button>

                {/* زر الاستبدال — يظهر على الخانات التي لها صورة بالفعل */}
                {url && (
                  <button
                    type="button"
                    onClick={() => pickForSlot(slot)}
                    disabled={uploadingSlot !== null}
                    className="absolute end-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-all hover:scale-110 hover:bg-primary disabled:opacity-40"
                    aria-label={`${t("idCard.replace")} ${title}`}
                    title={t("idCard.replaceWith", { title })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] font-bold leading-relaxed text-muted-foreground">
          {t("idCard.documentsNote")}
        </p>
      </div>

      {/* الباركود */}
      <div className="px-5 pb-5 pt-3">
        {barcodeSupported ? (
          <div className="code-tile overflow-hidden">
            <canvas
              ref={barcodeCanvasRef}
              className="block w-full"
              role="img"
              aria-label={t("idCard.barcodeAria", { id: user.university_id })}
            />
          </div>
        ) : (
          <div className="rounded-xl bg-white/70 dark:bg-white/10 px-4 py-3 text-center text-xs font-bold text-muted-foreground" dir="ltr">
            {user.university_id}
          </div>
        )}
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-bold text-muted-foreground">
          <ScanLine className="h-3.5 w-3.5" />
          {t("idCard.barcodeNote")}
        </p>
      </div>

      {/* حقل الملف المخفي لإضافة/استبدال المستندات */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChosen}
        aria-label={t("idCard.pickImage")}
      />

      {/* نافذة عرض المستند بالحجم الكامل */}
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
                <DialogDescription>{t("idCard.docViewerNote")}</DialogDescription>
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
    </section>
  );
}
