"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الدكتور — بطاقة التحكم بالجلسة (زر واحد: فتح / قفل)
 * ============================================================================
 *  التصميم الجديد:
 *  1) {t("professor.statNoSession")} → نموذج الإعداد الكامل قبل الفتح:
 *     - اسم المادة/المحاضرة (اختياري)
 *     - نطاق الحضور بعدد الأمتار (الدكتور هو من يحدده: كتابة/منزلق/قيم سريعة)
 *     - تحديد موقع القاعة (GPS تلقائي أو إدخال يدوي)
 *     - زر أساسي واحد «فتح الجلسة الآن» — لا يعمل حتى يُحدَّد الموقع
 *  2) جلسة مفتوحة → المؤقت المباشر + التفاصيل + نفس المكان يتحول إلى
 *     زر واحد «قفل الجلسة الآن» (بتأكيد داخلي) — وبمجرد القفل يُرفض أي
 *     تسجيل حضور من الطلاب برسالة 
 *  + حالة «آخر جلسة منتهية» مع ملخصها وزر بدء جلسة جديدة
 * ============================================================================
 */

import * as React from "react";
import {
  LocateFixed,
  Loader2,
  MapPin,
  Radius,
  Users,
  Lock,
  Check,
  X,
  ExternalLink,
  Timer,
  Navigation,
  BookOpen,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { getCurrentPositionOnce } from "@/lib/geo";
import { formatDurationClock, formatTime, relativeTime } from "@/lib/format";
import { useI18n, geoErrorMessage } from "@/lib/i18n";
import type { GeoPosition, SessionRow } from "@/lib/types";

const RADIUS_MIN = 10;
const RADIUS_MAX = 1000;
const RADIUS_PRESETS = [25, 50, 100, 200, 500];

/** تحليل نص إحداثيات بصيغة "30.123, 31.456" (يدعم لصق رابط/نص من خرائط جوجل) */
function parseCoordsInput(raw: string): { lat: number; lng: number } | null {
  // استخراج أول رقمين عشريين من النص (يتعامل مع "30.12, 31.45" و "@30.12,31.45,17z" وغيرها)
  const matches = raw.match(/(-?\d{1,3}\.\d{3,})\s*[,; ]\s*(-?\d{1,3}\.\d{3,})/);
  if (!matches) return null;
  const lat = Number(matches[1]);
  const lng = Number(matches[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export interface SessionControlProps {
  /** الجلسة المعروضة حالياً (مفتوحة أو آخر جلسة مغلقة) أو null */
  session: SessionRow | null;
  /** عدد الطلاب المسجّلين في الجلسة المعروضة */
  presentCount: number;
  /** true أثناء تنفيذ عملية إنشاء/إنهاء */
  busy: boolean;
  /** التوقيت الحالي (لتحديث المؤقت والحسابات النسبية) */
  now: number;
  /** مادة الدكتور المسجلة عند إنشاء حسابه — تُعبّأ تلقائياً في الجلسة الجديدة */
  defaultSubject?: string | null;
  /** إنشاء جلسة جديدة — ترجع true عند النجاح */
  onCreateSession: (
    coords: Pick<GeoPosition, "lat" | "lng" | "accuracy">,
    radius: number,
    subject: string
  ) => Promise<boolean>;
  /** قفل الجلسة المفتوحة */
  onCloseSession: () => Promise<void>;
  /** تعديل بيانات الجلسة المفتوحة (المادة/النطاق/الموقع) — ترجع true عند النجاح */
  onUpdateSession: (updates: {
    subject: string;
    radius: number;
    lat: number;
    lng: number;
  }) => Promise<boolean>;
}

export function SessionControl({
  session,
  presentCount,
  busy,
  now,
  defaultSubject,
  onCreateSession,
  onCloseSession,
  onUpdateSession,
}: SessionControlProps) {
  const { t, locale } = useI18n();
  const [locating, setLocating] = React.useState(false);
  const [draft, setDraft] = React.useState<GeoPosition | null>(null);
  const [radius, setRadius] = React.useState(50);
  const [radiusInput, setRadiusInput] = React.useState("50");
  const [confirmingLock, setConfirmingLock] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  /* حالة فشل تحديد الموقع: رسالة + عرض خيار الإدخال اليدوي */
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const [manualMode, setManualMode] = React.useState(false);
  const [manualInput, setManualInput] = React.useState("");
  const [manualError, setManualError] = React.useState<string | null>(null);

  /* اسم المادة/المحاضرة للجلسة الجديدة — مادة الدكتور تُعبّأ تلقائياً */
  const [subject, setSubject] = React.useState(defaultSubject ?? "");

  /* ------------------ وضع تعديل الجلسة المفتوحة ------------------ */

  const [editing, setEditing] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [editSubject, setEditSubject] = React.useState("");
  const [editRadius, setEditRadius] = React.useState(50);
  const [editRadiusInput, setEditRadiusInput] = React.useState("50");
  /* موقع الجلسة — يبدأ من موقعها الحالي والتغيير اختياري */
  const [editDraft, setEditDraft] = React.useState<GeoPosition | null>(null);
  const [editLocating, setEditLocating] = React.useState(false);
  const [editGeoError, setEditGeoError] = React.useState<string | null>(null);
  const [editManualMode, setEditManualMode] = React.useState(false);
  const [editManualInput, setEditManualInput] = React.useState("");
  const [editManualError, setEditManualError] = React.useState<string | null>(null);

  /* لو تغيّرت مادة الدكتور المسجلة نزامن الحقل (إن لم يعدّلها الدكتور يدوياً) */
  React.useEffect(() => {
    setSubject((current) =>
      current.length === 0 ? (defaultSubject ?? "") : current
    );
  }, [defaultSubject]);

  const sessionOpen = Boolean(session?.is_open);

  /** تحديث النطاق من أي مصدر (المنزلق / الأرقام / الأزرار السريعة) */
  function applyRadius(value: number) {
    const clamped = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, value));
    setRadius(clamped);
    setRadiusInput(String(clamped));
  }

  /* ---------------------- بدء تحديد الموقع (GPS) ---------------------- */

  async function startLocating() {
    setLocating(true);
    setGeoError(null);
    setManualMode(false);
    setManualError(null);
    try {
      const position = await getCurrentPositionOnce();
      setDraft(position);
      toast.success(t("professor.gpsCapturedToast"));
    } catch (error) {
      const message = geoErrorMessage(error, locale);
      const isPermissionDenied = String((error as Error)?.message) === "1";
      setGeoError(
        isPermissionDenied
          ? t("professor.gpsPermissionDenied")
          : message
      );
      toast.error(message);
    } finally {
      setLocating(false);
    }
  }

  /* ------------------ إدخال الإحداثيات يدوياً (خطة بديلة) ------------------ */

  function applyManualLocation() {
    const parsed = parseCoordsInput(manualInput);
    if (!parsed) {
      setManualError(
        t("professor.coordsHelp")
      );
      return;
    }
    setManualError(null);
    setDraft({ ...parsed, accuracy: 30 });
    setGeoError(null);
    setManualMode(false);
    toast.success(t("professor.manualAdoptedToast"));
  }

  /* ------------------------- فتح الجلسة (الزر الموحّد) ------------------------- */

  async function openSessionNow() {
    if (!draft) return;
    setCreating(true);
    const created = await onCreateSession(
      { lat: draft.lat, lng: draft.lng, accuracy: draft.accuracy },
      radius,
      subject.trim()
    );
    setCreating(false);
    if (created) {
      setDraft(null);
      setManualInput("");
      setManualMode(false);
      // نعيد تعبئة مادة الدكتور المسجلة للجلسة القادمة (قابلة للتعديل دائماً)
      setSubject(defaultSubject ?? "");
      // النطاق (عدد الأمتار) يبقى محفوظاً للجلسة القادمة — تفضيل شخصي للدكتور
    }
  }

  /* ---------------------- بدء تعديل الجلسة المفتوحة ---------------------- */

  function beginEdit() {
    if (!session) return;
    setEditSubject(session.subject ?? defaultSubject ?? "");
    setEditRadius(session.radius);
    setEditRadiusInput(String(session.radius));
    // نبدأ من موقع الجلسة الحالي — تغييره اختياري تماماً
    setEditDraft({
      lat: Number(session.lat),
      lng: Number(session.lng),
      accuracy: 0,
    });
    setEditGeoError(null);
    setEditManualMode(false);
    setEditManualInput("");
    setEditManualError(null);
    setEditing(true);
  }

  /** تحديث النطاق في وضع التعديل (المنزلق / الأرقام / الأزرار السريعة) */
  function applyEditRadius(value: number) {
    const clamped = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, value));
    setEditRadius(clamped);
    setEditRadiusInput(String(clamped));
  }

  /* التقاط موقع جديد للجلسة أثناء التعديل */
  async function startEditLocating() {
    setEditLocating(true);
    setEditGeoError(null);
    setEditManualMode(false);
    setEditManualError(null);
    try {
      const position = await getCurrentPositionOnce();
      setEditDraft(position);
      toast.success(t("professor.gpsCapturedToast"));
    } catch (error) {
      const message = geoErrorMessage(error, locale);
      const isPermissionDenied = String((error as Error)?.message) === "1";
      setEditGeoError(
        isPermissionDenied ? t("professor.gpsPermissionDenied") : message
      );
      toast.error(message);
    } finally {
      setEditLocating(false);
    }
  }

  /* إدخال إحداثيات جديدة يدوياً أثناء التعديل */
  function applyEditManualLocation() {
    const parsed = parseCoordsInput(editManualInput);
    if (!parsed) {
      setEditManualError(t("professor.coordsHelp"));
      return;
    }
    setEditManualError(null);
    setEditDraft({ ...parsed, accuracy: 30 });
    setEditGeoError(null);
    setEditManualMode(false);
    toast.success(t("professor.manualAdoptedToast"));
  }

  /* حفظ تعديلات الجلسة عبر الأب (يحدّث بيانات الجلسة على السيرفر) */
  async function saveEdit() {
    if (!session || !editDraft) return;
    setSavingEdit(true);
    const updated = await onUpdateSession({
      subject: editSubject.trim(),
      radius: editRadius,
      lat: editDraft.lat,
      lng: editDraft.lng,
    });
    setSavingEdit(false);
    if (updated) {
      setEditing(false);
    }
  }

  /* مغادرة وضع التعديل عند تغيّر الجلسة المعروضة (قفل/حذف/تبديل) */
  React.useEffect(() => {
    setEditing(false);
  }, [session?.id]);

  /* ------------------------------ العرض ------------------------------ */

  return (
    <section className="glass-card p-5 sm:p-6" aria-label={t("professor.controlTitle")}>
      <header className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-black">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <Navigation className="h-5 w-5" />
          </span>
          {t("professor.controlTitle")}
        </h2>
        {session && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-extrabold ${
              sessionOpen
                ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {sessionOpen ? t("professor.controlOpen") : t("professor.controlClosed")}
          </span>
        )}
      </header>

      {/* شريط العدّاد اللحظي: عدد الحاضرين أثناء المحاضرة أو «لا جلسة مفتوحة» */}
      <div
        className={`mt-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
          sessionOpen
            ? "border-primary/25 bg-primary/8"
            : "border-border bg-muted/30"
        }`}
        aria-live="polite"
      >
        {sessionOpen ? (
          <>
            <p className="flex items-center gap-2 text-sm font-extrabold text-primary">
              <Users className="h-4.5 w-4.5" />
              {t("professor.statPresent")}
            </p>
            <p className="text-2xl font-black leading-none tabular-nums text-primary">
              {presentCount}
            </p>
          </>
        ) : (
          <p className="w-full text-center text-sm font-extrabold text-muted-foreground">
            {t("professor.statNoSession")}
          </p>
        )}
      </div>

      {sessionOpen && session ? (
        /* ============ (1) جلسة مفتوحة — التفاصيل + زر القفل الموحّد ============ */
        <div className="mt-5">
          {editing ? (
            /* ============ (1-ب) وضع التعديل: المادة + النطاق + الموقع ============ */
            <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 px-5 py-6">
              <div className="text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary">
                  <Pencil className="h-6 w-6" />
                </span>
                <h3 className="mt-2.5 text-lg font-black">
                  {t("professor.editSessionTitle")}
                </h3>
                <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {t("professor.editSessionHint")}
                </p>
              </div>

              {/* المادة */}
              <div className="mt-5">
                <label
                  htmlFor="edit-session-subject"
                  className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground"
                >
                  {t("professor.subjectLabel")}
                </label>
                <Input
                  id="edit-session-subject"
                  type="text"
                  maxLength={80}
                  placeholder={defaultSubject ?? t("professor.subjectPlaceholder")}
                  value={editSubject}
                  onChange={(event) => setEditSubject(event.target.value)}
                  disabled={savingEdit}
                  className="input-glass mt-2 text-sm font-bold"
                  aria-label={t("professor.subjectAria")}
                />
              </div>

              {/* النطاق */}
              <div className="mt-5 rounded-2xl border border-primary/25 bg-white/45 dark:bg-white/5 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="edit-session-radius"
                    className="flex items-center gap-1.5 text-sm font-extrabold text-foreground"
                  >
                    <Radius className="h-4 w-4 text-primary" />
                    {t("professor.radiusLabel")}
                  </label>
                  <span className="rounded-full bg-primary/12 px-2.5 py-1 text-[10px] font-extrabold text-primary">
                    {t("professor.radiusYouSet")}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-center gap-3">
                  <Input
                    id="edit-session-radius"
                    type="number"
                    dir="ltr"
                    inputMode="numeric"
                    min={RADIUS_MIN}
                    max={RADIUS_MAX}
                    step={5}
                    value={editRadiusInput}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setEditRadiusInput(raw);
                      const parsed = Number.parseInt(raw, 10);
                      if (Number.isFinite(parsed)) {
                        setEditRadius(
                          Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, parsed))
                        );
                      }
                    }}
                    onBlur={() => setEditRadiusInput(String(editRadius))}
                    disabled={savingEdit}
                    className="input-glass h-12 w-32 text-center text-xl font-black tabular-nums"
                    aria-label={t("professor.radiusAria")}
                  />
                  <span className="text-base font-extrabold text-muted-foreground">
                    {t("common.meters")}
                  </span>
                </div>

                <Slider
                  id="edit-session-radius-slider"
                  value={[editRadius]}
                  onValueChange={(values) => applyEditRadius(values[0])}
                  min={RADIUS_MIN}
                  max={RADIUS_MAX}
                  step={5}
                  disabled={savingEdit}
                  className="mt-4"
                  aria-label={t("professor.radiusSliderAria")}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {RADIUS_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyEditRadius(preset)}
                      disabled={savingEdit}
                      className={`glass-chip rounded-full px-3.5 py-1.5 text-xs font-extrabold tabular-nums transition-all ${
                        editRadius === preset
                          ? "text-primary ring-2 ring-primary/40"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      dir="ltr"
                    >
                      {preset} {t("common.metersShort")}
                    </button>
                  ))}
                </div>
              </div>

              {/* الموقع — يبدأ من الموقع الحالي وقابل للتغيير */}
              <div className="mt-5 rounded-2xl border border-border bg-white/45 dark:bg-white/5 px-4 py-4">
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  {t("professor.hallLocation")}
                </p>

                {editDraft && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/8 border border-primary/25 px-3.5 py-2.5">
                    <p className="font-mono text-xs font-extrabold tabular-nums text-primary" dir="ltr">
                      {editDraft.lat.toFixed(5)}, {editDraft.lng.toFixed(5)}
                    </p>
                    {editDraft.accuracy > 0 && (
                      <span className="rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-bold text-primary">
                        {t("professor.gpsAccuracy", { meters: Math.round(editDraft.accuracy) })}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startEditLocating}
                    disabled={editLocating || savingEdit}
                    className="glass-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-foreground/80 transition-all hover:text-primary disabled:opacity-50"
                  >
                    {editLocating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LocateFixed className="h-3.5 w-3.5" />
                    )}
                    {t("professor.relocateGps")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditManualMode((value) => !value)}
                    disabled={savingEdit}
                    className="glass-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-foreground/80 transition-all hover:text-primary disabled:opacity-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {editManualMode ? t("professor.hideManual") : t("professor.manualEdit")}
                  </button>
                </div>

                {editGeoError && !editLocating && (
                  <div
                    className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/8 px-4 py-3 text-start"
                    role="alert"
                  >
                    <p className="text-sm font-bold leading-relaxed text-rose-600 dark:text-rose-400">
                      {editGeoError}
                    </p>
                  </div>
                )}

                {editManualMode && (
                  <div className="mt-3 text-start">
                    <label
                      htmlFor="edit-manual-coords"
                      className="text-xs font-bold text-foreground"
                    >
                      {t("professor.coordsLabel")}
                    </label>
                    <Input
                      id="edit-manual-coords"
                      type="text"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder={t("professor.coordsPlaceholder")}
                      value={editManualInput}
                      onChange={(event) => {
                        setEditManualInput(event.target.value);
                        setEditManualError(null);
                      }}
                      className="input-glass mt-2 text-center font-mono text-sm font-bold"
                      aria-invalid={Boolean(editManualError)}
                    />
                    {editManualError ? (
                      <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-400" role="alert">
                        {editManualError}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        {t("professor.coordsHelp")}
                      </p>
                    )}
                    <Button
                      type="button"
                      onClick={applyEditManualLocation}
                      className="btn-gradient mt-3 h-11 w-full rounded-xl text-sm font-extrabold"
                    >
                      <MapPin className="h-4 w-4" />
                      {t("professor.adoptLocation")}
                    </Button>
                  </div>
                )}
              </div>

              {/* حفظ / إلغاء */}
              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Button
                  onClick={saveEdit}
                  disabled={savingEdit || !editDraft}
                  className="btn-gradient h-12 rounded-2xl text-sm font-extrabold"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {t("professor.editSavingBtn")}
                    </>
                  ) : (
                    <>
                      <Check className="h-5 w-5" />
                      {t("professor.editSaveBtn")}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditing(false)}
                  disabled={savingEdit}
                  className="h-12 rounded-2xl text-sm font-bold"
                >
                  <X className="h-4.5 w-4.5" />
                  {t("professor.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-500/8 border border-emerald-500/25 px-4 py-3.5">
            <p className="flex items-center gap-2.5 text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
              <span className="live-dot" />
              {t("professor.controlOpenNote")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("professor.controlOpenedAt", { time: formatTime(session.created_at, locale), relative: relativeTime(session.created_at, now, locale) })}
            </p>
          </div>

          {/* اسم المادة (إن وُجد) */}
          {session.subject && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/8 px-4 py-3">
              <BookOpen className="h-4.5 w-4.5 shrink-0 text-primary" />
              <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-primary">
                {session.subject}
              </p>
            </div>
          )}

          {/* المؤقت المباشر */}
          <div className="mt-5 grid gap-4">
            <div className="rounded-2xl bg-white/45 dark:bg-white/5 border border-border p-5 flex flex-col items-center justify-center">
              <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <Timer className="h-3.5 w-3.5" />
                {t("professor.liveTimerLabel")}
              </p>
              <p
                dir="ltr"
                className="mt-2 text-4xl font-black tabular-nums tracking-tight text-foreground"
              >
                {formatDurationClock(now - new Date(session.created_at).getTime())}
              </p>
            </div>

            <div className="rounded-2xl bg-white/45 dark:bg-white/5 border border-border p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-bold text-muted-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  {t("professor.registeredLabel")}
                </span>
                <span className="text-lg font-black text-primary tabular-nums">
                  {presentCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-bold text-muted-foreground">
                  <Radius className="h-4 w-4 text-primary" />
                  {t("professor.allowedRange")}
                </span>
                <span className="font-extrabold tabular-nums" dir="ltr">
                  {session.radius} {t("common.metersShort")}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-bold text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  {t("professor.hallCoords")}
                </span>
                <span className="font-mono text-xs font-extrabold tabular-nums" dir="ltr">
                  {Number(session.lat).toFixed(5)}, {Number(session.lng).toFixed(5)}
                </span>
              </div>
              <a
                href={`https://www.google.com/maps?q=${Number(session.lat)},${Number(session.lng)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("professor.viewOnMap")}
              </a>
            </div>
          </div>

          {/* ============ زر التعديل + الزر الموحّد للقفل ============ */}
          <div className="mt-5 space-y-2.5">
            <Button
              onClick={beginEdit}
              disabled={busy}
              variant="outline"
              className="h-11 w-full rounded-2xl border-primary/40 text-primary hover:bg-primary/10 hover:text-primary font-extrabold"
            >
              <Pencil className="h-4.5 w-4.5" />
              {t("professor.editSessionBtn")}
            </Button>
            {confirmingLock ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <p className="flex-1 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
                  {t("professor.closeConfirmMsg")}
                </p>
                <Button
                  onClick={async () => {
                    await onCloseSession();
                    setConfirmingLock(false);
                  }}
                  disabled={busy}
                  className="h-11 rounded-xl bg-destructive text-white hover:bg-destructive/90 font-bold"
                >
                  {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Check className="h-4.5 w-4.5" />}
                  {t("professor.closeConfirmYes")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmingLock(false)}
                  disabled={busy}
                  className="h-11 rounded-xl font-bold"
                >
                  <X className="h-4.5 w-4.5" />
                  {t("professor.cancel")}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setConfirmingLock(true)}
                disabled={busy}
                variant="outline"
                className="h-12 w-full rounded-2xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive font-extrabold"
              >
                <Lock className="h-5 w-5" />
                {t("professor.closeNow")}
              </Button>
            )}
          </div>
            </>
          )}
        </div>
      ) : (
        /* ============ (2) لا جلسة مفتوحة — الإعداد الكامل ثم الفتح ============ */
        <div className="mt-5">
          {/* ملخص آخر جلسة إن وُجدت */}
          {session && !sessionOpen && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-white/40 dark:bg-white/5 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {t("professor.lastSessionEnded")}{" "}
                <span className="font-bold text-foreground">
                  {relativeTime(session.created_at, now, locale)}
                </span>{" "}
                {t("professor.lastSessionDocumented")}{" "}
                <span className="font-black text-primary tabular-nums">{presentCount}</span> {t("professor.lastSessionStudents")}
              </p>
            </div>
          )}

          <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-5 py-6">
            <div className="text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-primary/12 text-primary animate-float-y">
                <LocateFixed className="h-7 w-7" />
              </span>
              <h3 className="mt-3 text-lg font-black">
                {t("professor.openNewSession")}
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                {t("professor.setupHint")}
                
              </p>
            </div>

            {/* اسم المادة / المحاضرة — تُعبّأ تلقائياً من مادة الدكتور المسجلة */}
            <div className="mt-5">
              <label htmlFor="session-subject" className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                {t("professor.subjectLabel")}
                <span className="font-medium text-muted-foreground">
                  {t("professor.subjectAutoNote")}
                </span>
              </label>
              <Input
                id="session-subject"
                type="text"
                maxLength={80}
                placeholder={defaultSubject ?? t("professor.subjectPlaceholder")}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                disabled={creating}
                className="input-glass mt-2 text-sm font-bold"
                aria-label={t("professor.subjectAria")}
              />
              {defaultSubject && subject.trim() === defaultSubject && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                  <BookOpen className="h-3.5 w-3.5" />
                  {t("professor.subjectNote")}
                </p>
              )}
            </div>

            {/* ============ نطاق الحضور بالأمتار — الدكتور يحدده ============ */}
            <div className="mt-5 rounded-2xl border border-primary/25 bg-white/45 dark:bg-white/5 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="session-radius" className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
                  <Radius className="h-4 w-4 text-primary" />
                  {t("professor.radiusLabel")}
                </label>
                <span className="rounded-full bg-primary/12 px-2.5 py-1 text-[10px] font-extrabold text-primary">
                  {t("professor.radiusYouSet")}
                </span>
              </div>

              {/* عرض القيمة الكبير + الإدخال الرقمي */}
              <div className="mt-3 flex items-center justify-center gap-3">
                <Input
                  id="session-radius"
                  type="number"
                  dir="ltr"
                  inputMode="numeric"
                  min={RADIUS_MIN}
                  max={RADIUS_MAX}
                  step={5}
                  value={radiusInput}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setRadiusInput(raw);
                    const parsed = Number.parseInt(raw, 10);
                    if (Number.isFinite(parsed)) {
                      setRadius(Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, parsed)));
                    }
                  }}
                  onBlur={() => setRadiusInput(String(radius))}
                  disabled={creating}
                  className="input-glass h-12 w-32 text-center text-xl font-black tabular-nums"
                  aria-label={t("professor.radiusAria")}
                />
                <span className="text-base font-extrabold text-muted-foreground">{t("common.meters")}</span>
              </div>

              <Slider
                id="session-radius-slider"
                value={[radius]}
                onValueChange={(values) => applyRadius(values[0])}
                min={RADIUS_MIN}
                max={RADIUS_MAX}
                step={5}
                disabled={creating}
                className="mt-4"
                aria-label={t("professor.radiusSliderAria")}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {RADIUS_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyRadius(preset)}
                    disabled={creating}
                    className={`glass-chip rounded-full px-3.5 py-1.5 text-xs font-extrabold tabular-nums transition-all ${
                      radius === preset ? "text-primary ring-2 ring-primary/40" : "text-muted-foreground hover:text-foreground"
                    }`}
                    dir="ltr"
                  >
                    {preset} {t("common.metersShort")}
                  </button>
                ))}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {t("professor.radiusIntro")}{" "}
                <span className="font-extrabold text-primary" dir="ltr">{radius} {t("common.meters")}</span>{" "}
                {t("professor.radiusHelp2")}
                ({t("professor.radiusMinMax", { min: RADIUS_MIN, max: RADIUS_MAX })}).
              </p>
            </div>

            {/* ============ موقع القاعة (GPS أو إدخال يدوي) ============ */}
            <div className="mt-5 rounded-2xl border border-border bg-white/45 dark:bg-white/5 px-4 py-4">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                {t("professor.hallLocation")}
              </p>

              {draft ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/8 border border-primary/25 px-3.5 py-2.5">
                    <p className="font-mono text-xs font-extrabold tabular-nums text-primary" dir="ltr">
                      {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
                    </p>
                    <span className="rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-bold text-primary">
                      {t("professor.gpsAccuracy", { meters: Math.round(draft.accuracy) })}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={startLocating}
                      disabled={locating || creating}
                      className="glass-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-foreground/80 transition-all hover:text-primary disabled:opacity-50"
                    >
                      {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                      {t("professor.relocateGps")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualMode((value) => !value)}
                      disabled={creating}
                      className="glass-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-foreground/80 transition-all hover:text-primary disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {manualMode ? t("professor.hideManual") : t("professor.manualEdit")}
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t("professor.gpsHint")}
                </p>
              )}

              {/* فشل تحديد الموقع — إرشادات + إدخال يدوي */}
              {geoError && !locating && (
                <div
                  className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/8 px-4 py-3 text-start"
                  role="alert"
                >
                  <p className="text-sm font-bold leading-relaxed text-rose-600 dark:text-rose-400">
                    {geoError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setManualMode((value) => !value)}
                    className="mt-2 text-xs font-extrabold text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    {manualMode ? t("professor.hideManual") : t("professor.showManual")}
                  </button>
                </div>
              )}

              {/* زر التقاط GPS (يظهر عند عدم وجود موقع محدد) */}
              {!draft && (
                <Button
                  onClick={startLocating}
                  disabled={locating || creating}
                  variant="outline"
                  className="mt-3 h-11 w-full rounded-xl font-extrabold"
                >
                  {locating ? (
                    <>
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                      {t("professor.locatingGps")}
                    </>
                  ) : (
                    <>
                      <LocateFixed className="h-4.5 w-4.5" />
                      {geoError ? t("professor.retryGps") : t("professor.captureGps")}
                    </>
                  )}
                </Button>
              )}

              {/* نموذج الإدخال اليدوي للإحداثيات */}
              {manualMode && (
                <div className="mt-3 text-start">
                  <label
                    htmlFor="manual-coords"
                    className="text-xs font-bold text-foreground"
                  >
                    {t("professor.coordsLabel")}
                  </label>
                  <Input
                    id="manual-coords"
                    type="text"
                    dir="ltr"
                    inputMode="decimal"
                    placeholder={t("professor.coordsPlaceholder")}
                    value={manualInput}
                    onChange={(event) => {
                      setManualInput(event.target.value);
                      setManualError(null);
                    }}
                    className="input-glass mt-2 text-center font-mono text-sm font-bold"
                    aria-invalid={Boolean(manualError)}
                  />
                  {manualError ? (
                    <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-400" role="alert">
                      {manualError}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {t("professor.coordsHelp")}
                      
                    </p>
                  )}
                  <Button
                    type="button"
                    onClick={applyManualLocation}
                    className="btn-gradient mt-3 h-11 w-full rounded-xl text-sm font-extrabold"
                  >
                    <MapPin className="h-4 w-4" />
                    {t("professor.adoptLocation")}
                  </Button>
                </div>
              )}
            </div>

            {/* ============ الزر الموحّد: فتح الجلسة ============ */}
            <div className="mt-5">
              <Button
                onClick={openSessionNow}
                disabled={!draft || creating || busy}
                className="btn-gradient h-13 w-full rounded-2xl px-6 text-base font-extrabold"
                aria-label={t("professor.openNewSession")}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t("professor.openingSession")}
                  </>
                ) : !draft ? (
                  t("professor.needLocationFirst")
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    t("professor.openNowBtn", { radius })
                  </>
                )}
              </Button>
              {!draft && !creating && (
                <p className="mt-2 text-center text-[11px] font-bold text-muted-foreground">
                  {t("professor.openBtnHint")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
