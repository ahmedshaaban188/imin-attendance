"use client";

/**
 * ============================================================================
 *  ImIn | صفحة المصادقة والتسجيل — نظيفة ومركّزة
 * ============================================================================
 *  - صفحة دخول مركّزة: بطاقة واحدة في المنتصف بدون محتوى تسويقي
 *  - تسجيل الدخول: البريد + الرقم الجامعي/الوظيفي
 *  - إنشاء حساب جديد:
 *      • الدكتور  → المادة + صورة شخصية إلزامية + تأكيد البريد برمز OTP
 *      • الطالب   → بيانات أكاديمية اختيارية (كلية/برنامج/فرقة) +
 *                   صور البطاقة (وش + ظهر) + صورة شخصية (الثلاث إلزامية)
 *  - كامل الترجمة عبر useI18n() — عربي/إنجليزي مع RTL/LTR
 * ============================================================================
 */

import * as React from "react";
import {
  GraduationCap,
  BookOpen,
  Loader2,
  LogIn,
  UserRound,
  Mail,
  Hash,
  Upload,
  X,
  Camera,
  IdCard,
  FlipHorizontal,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  ShieldQuestion,
  Smartphone,
  Hourglass,
  Building2,
  Layers,
  GraduationCap as GraduationYearIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { DemoBadge } from "@/components/demo-badge";
import {
  findUserByLogin,
  emailExists,
  uploadIdCard,
  insertUser,
  verifyOtp,
  requestOtp,
  requestDeviceTransfer,
} from "@/lib/data-layer";
import { compressImage, safePhotoPath, validateImageFile } from "@/lib/image-utils";
import { saveUserSession, takeLogoutReason } from "@/lib/supabaseClient";
import { getDeviceId } from "@/lib/device";
import { useI18n, localizedError } from "@/lib/i18n";
import type { AppUser, UserRole } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  أدوات مساعدة                                                              */
/* -------------------------------------------------------------------------- */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIVERSITY_ID_REGEX = /^[A-Za-z0-9\u0600-\u06FF-]{3,25}$/;

/* -------------------------------------------------------------------------- */
/*  أنواع مساعدة                                                              */
/* -------------------------------------------------------------------------- */

type AuthMode = "login" | "register";

/** مراحل الصفحة: النموذج العادي / تأكيد OTP للدكتور / انتظار موافقة الدكتور للطالب */
type AuthStep = "auth" | "otp" | "awaiting-approval";

/** خانات رفع الصور */
type PhotoSlot = "idFront" | "idBack" | "personal";

/** مفتاحات أخطاء الحقول (تُعرض تحت كل حقل بشكل دائم حتى يُصحّح) */
type FieldKey =
  | "name"
  | "email"
  | "universityId"
  | "subject"
  | "idFront"
  | "idBack"
  | "personal"
  | "loginEmail"
  | "loginId"

/** رسالة خطأ صغيرة تُعرض تحت الحقل */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-400" role="alert">
      {message}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*  حقل رفع صورة موحّد                                                          */
/* -------------------------------------------------------------------------- */

interface PhotoFieldProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  shape?: "square" | "wide";
  file: File | null;
  previewUrl: string | null;
  error?: string;
  onPick: (file: File) => void;
  onClear: () => void;
}

function PhotoField({
  inputRef,
  label,
  hint,
  icon: Icon,
  shape = "wide",
  file,
  previewUrl,
  error,
  onPick,
  onClear,
}: PhotoFieldProps) {
  const { t } = useI18n();
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-sm font-bold">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
        }}
        aria-label={label}
        aria-invalid={Boolean(error)}
      />
      {previewUrl && file ? (
        <div className="drop-zone relative flex items-center gap-3.5 p-3">
          <img
            src={previewUrl}
            alt={`${t("auth.previewOf")} ${label}`}
            className={
              shape === "square"
                ? "h-20 w-20 rounded-2xl object-cover ring-2 ring-primary/25"
                : "h-16 w-24 rounded-xl object-cover ring-1 ring-border"
            }
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("auth.photoPicked")}
            </p>
            <p className="mt-0.5 truncate text-xs font-bold" dir="ltr">
              {file.name}
            </p>
            <p className="text-[11px] text-muted-foreground" dir="ltr">
              {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="glass-chip grid h-9 w-9 place-items-center rounded-full text-foreground/70 hover:text-destructive"
            aria-label={`${t("auth.removePhoto")} ${label}`}
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) onPick(dropped);
          }}
          className={`drop-zone flex w-full flex-col items-center gap-1.5 px-4 py-5 ${
            dragOver ? "dragover" : ""
          } ${error ? "border-rose-500/60" : ""}`}
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/12 text-primary">
            {dragOver ? <Camera className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
          </span>
          <span className="text-sm font-bold text-foreground">
            {t("auth.dragOrClick")}
          </span>
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        </button>
      )}
      <FieldError message={error} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  مكوّن الصفحة                                                               */
/* -------------------------------------------------------------------------- */

export function AuthView({ onSuccess }: { onSuccess: (user: AppUser) => void }) {
  const { t, locale } = useI18n();
  const [mode, setMode] = React.useState<AuthMode>("login");
  const [busy, setBusy] = React.useState(false);

  /* مرحلة الصفحة الحالية (النموذج / OTP / انتظار الموافقة) */
  const [step, setStep] = React.useState<AuthStep>("auth");

  /* هل انتهت الجلسة السابقة بخروج تلقائي؟ (رسالة توضيحية لمرة واحدة) */
  const [autoLoggedOut, setAutoLoggedOut] = React.useState(false);

  React.useEffect(() => {
    if (takeLogoutReason() === "idle") {
      setAutoLoggedOut(true);
      toast.info(t("session.autoLogoutToast"));
    }
  }, [t]);

  // حقول تسجيل الدخول
  const [loginEmail, setLoginEmail] = React.useState("");
  const [loginId, setLoginId] = React.useState("");

  // حقول إنشاء الحساب
  const [fullName, setFullName] = React.useState("");
  const [registerEmail, setRegisterEmail] = React.useState("");
  const [universityId, setUniversityId] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("student");
  const [subject, setSubject] = React.useState("");

  // البيانات الأكاديمية للطالب (تظهر في البطاقة الرقمية)
  const [faculty, setFaculty] = React.useState("");
  const [program, setProgram] = React.useState("");
  const [academicYear, setAcademicYear] = React.useState("");

  /* مرحلة تأكيد البريد عبر OTP (الدكتور) */
  const [otpEmail, setOtpEmail] = React.useState("");
  const [otpValue, setOtpValue] = React.useState("");
  const [otpDemoCode, setOtpDemoCode] = React.useState<string | null>(null);
  const [otpError, setOtpError] = React.useState<string | null>(null);
  const [otpBusy, setOtpBusy] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);

  /* اسم الطالب الذي ينتظر موافقة الدكتور (لشاشة الانتظار) */
  const [registeredName, setRegisteredName] = React.useState("");

  /* حالة ربط الجهاز: الحساب مربوط بجهاز آخر + هل أُرسل طلب الربط بالفعل */
  const [deviceMismatch, setDeviceMismatch] = React.useState(false);
  const [transferBusy, setTransferBusy] = React.useState(false);
  const [transferRequested, setTransferRequested] = React.useState(false);

  // ملفات الصور الثلاثة: بطاقة وش + بطاقة ظهر + صورة شخصية
  const [photoFiles, setPhotoFiles] = React.useState<Record<PhotoSlot, File | null>>({
    idFront: null,
    idBack: null,
    personal: null,
  });
  const [previews, setPreviews] = React.useState<Record<PhotoSlot, string | null>>({
    idFront: null,
    idBack: null,
    personal: null,
  });

  /* أخطاء الحقول — تبقى ظاهرة تحت الحقل حتى يصحّح المستخدم القيمة */
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<FieldKey, string>>>({});

  const idFrontInputRef = React.useRef<HTMLInputElement>(null);
  const idBackInputRef = React.useRef<HTMLInputElement>(null);
  const personalInputRef = React.useRef<HTMLInputElement>(null);

  const idLabel = role === "student" ? t("auth.idLabelStudent") : t("auth.idLabelProfessor");
  const idPlaceholder =
    role === "student" ? t("auth.idPlaceholderStudent") : t("auth.idPlaceholderProfessor");

  /* ------------------------- إدارة ملفات الصور ------------------------- */

  const previewsRef = React.useRef(previews);
  React.useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  React.useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  function pickPhoto(slot: PhotoSlot, file: File) {
    const validationError = validateImageFile(file);
    if (validationError) {
      setFieldErrors((prev) => ({ ...prev, [slot]: validationError }));
      toast.error(validationError);
      return;
    }
    setPhotoFiles((prev) => ({ ...prev, [slot]: file }));
    setPreviews((prev) => {
      if (prev[slot]) URL.revokeObjectURL(prev[slot] as string);
      return { ...prev, [slot]: URL.createObjectURL(file) };
    });
    setFieldErrors((prev) => ({ ...prev, [slot]: undefined }));
  }

  function clearPhoto(slot: PhotoSlot) {
    setPreviews((prev) => {
      if (prev[slot]) URL.revokeObjectURL(prev[slot] as string);
      return { ...prev, [slot]: null };
    });
    setPhotoFiles((prev) => ({ ...prev, [slot]: null }));
    const input =
      slot === "idFront"
        ? idFrontInputRef.current
        : slot === "idBack"
          ? idBackInputRef.current
          : personalInputRef.current;
    if (input) input.value = "";
  }

  /* مسح خطأ حقل واحد عند تعديل قيمته */
  function clearFieldError(key: FieldKey) {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  /* --------------------------- تسجيل الدخول --------------------------- */

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    const idNumber = loginId.trim();

    const errors: Partial<Record<FieldKey, string>> = {};
    if (!EMAIL_REGEX.test(email)) {
      errors.loginEmail = t("auth.emailError");
    }
    if (!UNIVERSITY_ID_REGEX.test(idNumber)) {
      errors.loginId = t("auth.idError");
    }
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    // إخفاء بانر الجهاز عند كل محاولة جديدة
    setDeviceMismatch(false);

    setBusy(true);
    try {
      const user = await findUserByLogin(
        email,
        idNumber,
        getDeviceId()
      );

      if (!user) {
        setFieldErrors({ loginEmail: t("auth.notRegistered") });
        toast.error(t("auth.notRegistered"));
        return;
      }

      /* حماية حساب الطالب: لا دخول قبل موافقة الدكتور على طلب التسجيل */
      const accountStatus = user.status ?? "approved";
      if (user.role === "student" && accountStatus === "pending") {
        setFieldErrors({ loginEmail: t("auth.pendingAccount") });
        toast.info(t("auth.pendingAccountToast"));
        return;
      }
      if (user.role === "student" && accountStatus === "rejected") {
        setFieldErrors({ loginEmail: t("auth.rejectedAccount") });
        toast.error(t("auth.rejectedAccountToast"));
        return;
      }

      /* الدكتور الذي لم يؤكد بريده بعد: نحوّله لشاشة رمز التحقق */
      if (user.role === "professor" && user.email_verified === false) {
        try {
          const { otp } = await requestOtp(email);
          setOtpEmail(email);
          setOtpDemoCode(otp ?? null);
          setOtpValue("");
          setOtpError(null);
          setResendCooldown(30);
          setStep("otp");
          toast.info(t("auth.otpNeededToast"));
        } catch (otpError) {
          toast.error(localizedError(otpError, locale));
        }
        return;
      }

      saveUserSession(user);
      toast.success(t("auth.welcomeBack", { name: user.full_name.split(" ")[0] }));
      onSuccess(user);
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      // الحساب مربوط بجهاز آخر → بانر واضح مع إمكانية طلب ربط هذا الجهاز
      if (code === "DEVICE_MISMATCH") {
        setDeviceMismatch(true);
        setTransferRequested(false);
        toast.error(t("auth.deviceMismatchToast"));
        return;
      }
      toast.error(localizedError(error, locale));
    } finally {
      setBusy(false);
    }
  }

  /* طلب ربط الجهاز الحالي بالحساب — الدكتور يوافق من لوحته */
  async function handleRequestDeviceTransfer() {
    const email = loginEmail.trim().toLowerCase();
    const idNumber = loginId.trim();
    if (transferBusy) return;

    setTransferBusy(true);
    try {
      await requestDeviceTransfer({
        email,
        university_id: idNumber,
        device_id: getDeviceId(),
      });
      setTransferRequested(true);
      toast.success(t("auth.deviceTransferSentToast"));
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setTransferBusy(false);
    }
  }

  async function uploadPhoto(file: File, suffix: string, idNumber: string): Promise<string> {
    const blob = await compressImage(file);
    const path = safePhotoPath(idNumber, suffix);
    return uploadIdCard(path, blob);
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    const name = fullName.trim();
    const email = registerEmail.trim().toLowerCase();
    const idNumber = universityId.trim();

    const errors: Partial<Record<FieldKey, string>> = {};
    if (name.length < 3 || !name.includes(" ")) {
      errors.name = t("auth.nameError");
    }
    if (!EMAIL_REGEX.test(email)) {
      errors.email = t("auth.emailError");
    }
    if (!UNIVERSITY_ID_REGEX.test(idNumber)) {
      errors.universityId = t("auth.idRegisterError");
    }

    // الدكتور: اسم المادة إلزامي
    if (role === "professor") {
      if (subject.trim().length < 2) {
        errors.subject = t("auth.subjectError");
      }
    }

    // الدكتور: صورة شخصية إلزامية — الطالب: بطاقة وش + ظهر + صورة شخصية
    if (!photoFiles.personal) {
      errors.personal = t("auth.personalRequired");
    }
    if (role === "student") {
      if (!photoFiles.idFront) {
        errors.idFront = t("auth.idFrontRequired");
      }
      if (!photoFiles.idBack) {
        errors.idBack = t("auth.idBackRequired");
      }
    }

    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      toast.error(t("auth.fieldsReviewError"));
      return;
    }

    setBusy(true);
    try {
      // 1) التأكد أن البريد غير مستخدم مسبقاً
      const exists = await emailExists(email);
      if (exists) {
        setFieldErrors({ email: t("auth.emailExistsField") });
        toast.error(t("auth.emailExistsField"));
        return;
      }

      // 2) رفع الصور المطلوبة
      const [personalUrl, idFrontUrl, idBackUrl] = await Promise.all([
        photoFiles.personal
          ? uploadPhoto(photoFiles.personal, "personal", idNumber)
          : Promise.resolve(null),
        role === "student" && photoFiles.idFront
          ? uploadPhoto(photoFiles.idFront, "front", idNumber)
          : Promise.resolve(null),
        role === "student" && photoFiles.idBack
          ? uploadPhoto(photoFiles.idBack, "back", idNumber)
          : Promise.resolve(null),
      ]);

      // 3) حفظ بيانات المستخدم — يُربط الحساب بهذا الجهاز فوراً (device_id)
      const result = await insertUser({
        full_name: name,
        email,
        university_id: idNumber,
        role,
        id_card_url: idFrontUrl,
        id_card_back_url: idBackUrl,
        personal_photo_url: personalUrl,
        subject: role === "professor" ? subject.trim() : null,
        device_id: getDeviceId(),
        faculty: role === "student" ? faculty.trim() || null : null,
        program: role === "student" ? program.trim() || null : null,
        academic_year: role === "student" ? academicYear.trim() || null : null,
      });

      if (role === "professor") {
        setOtpEmail(email);
        setOtpDemoCode(result.otp ?? null);
        setOtpValue("");
        setOtpError(null);
        setResendCooldown(30);
        setStep("otp");
        toast.success(t("auth.otpResendSuccessTitle"));
      } else {
        setRegisteredName(name);
        setStep("awaiting-approval");
        toast.success(t("auth.registerSuccessStudent"));
      }
    } catch (error) {
      toast.error(localizedError(error, locale));
    } finally {
      setBusy(false);
    }
  }

  /* ------------------- تأكيد بريد الدكتور (رمز OTP) ------------------- */

  async function handleVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    const code = otpValue.trim();
    if (!/^\d{6}$/.test(code)) {
      setOtpError(t("auth.otpError6"));
      return;
    }

    setOtpBusy(true);
    try {
      const user = await verifyOtp(otpEmail, code);
      saveUserSession(user);
      toast.success(t("auth.otpVerifiedToast", { name: user.full_name.split(" ")[0] }));
      onSuccess(user);
    } catch (error) {
      setOtpError(localizedError(error, locale));
    } finally {
      setOtpBusy(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || otpBusy) return;
    setOtpBusy(true);
    try {
      const { otp } = await requestOtp(otpEmail);
      setOtpDemoCode(otp ?? null);
      setOtpValue("");
      setOtpError(null);
      setResendCooldown(30);
      toast.success(t("auth.otpResendSuccess"));
    } catch (error) {
      setOtpError(localizedError(error, locale));
    } finally {
      setOtpBusy(false);
    }
  }

  /* العودة من شاشة OTP / الانتظار إلى نموذج تسجيل الدخول */
  function backToLoginForm() {
    setStep("auth");
    setMode("login");
    setOtpEmail("");
    setOtpDemoCode(null);
    setOtpValue("");
    setOtpError(null);
    setResendCooldown(0);
  }

  /* عدّاد التهدئة لإعادة إرسال الرمز (30 ثانية) */
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((seconds) => seconds - 1),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  /* ------------------------------- العرض ------------------------------- */

  return (
    <main className="relative min-h-screen flex flex-col">
      {/* الخلفية الزجاجية المتوهجة */}
      <div className="orbs" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
      </div>

      {/* شريط علوي مصغّر */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-end gap-2 px-4 pt-6">
        <div className="flex items-center gap-2">
          <DemoBadge />
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* المحتوى — بطاقة مصادقة واحدة في المنتصف بدون أي محتوى تسويقي */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:py-10">
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <span className="pop-in">
            <Logo size={64} tagline={t("common.tagline")} />
          </span>

          <section
            className="glass-card w-full p-6 sm:p-8"
            aria-label={t("auth.tabLogin")}
          >
            {/* رسالة الخروج التلقائي — تظهر مرة واحدة بعد خمول 120 ثانية */}
            {step === "auth" && autoLoggedOut && (
              <div
                className="mt-2 rounded-2xl border border-amber-500/40 bg-amber-500/8 px-4 py-3.5 pop-in"
                role="status"
              >
                <p className="flex items-center gap-2 text-sm font-black text-amber-700 dark:text-amber-300">
                  <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
                  {t("session.autoLogoutTitle")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("session.autoLogoutBody")}
                </p>
              </div>
            )}
            {/* مبدّل الوضع — يظهر في مرحلة النموذج فقط */}
            {step === "auth" && (
              <div className="glass-chip grid grid-cols-2 gap-1 rounded-2xl p-1.5">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={`h-10 rounded-xl text-sm font-bold transition-all ${
                    mode === "login"
                      ? "btn-gradient"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("auth.tabLogin")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={`h-10 rounded-xl text-sm font-bold transition-all ${
                    mode === "register"
                      ? "btn-gradient"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("auth.tabRegister")}
                </button>
              </div>
            )}

            {step === "otp" ? (
              /* ------------------- تأكيد البريد برمز OTP (الدكتور) ------------------- */
              <form onSubmit={handleVerifyOtp} className="mt-7 space-y-5" noValidate>
                <div className="text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/12 text-primary">
                    <KeyRound className="h-7 w-7" />
                  </span>
                  <h2 className="mt-3 text-xl font-black text-foreground">
                    {t("auth.otpTitle")}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {t("auth.otpSentTo")}
                    <span className="block truncate font-bold text-foreground" dir="ltr">
                      {otpEmail}
                    </span>
                  </p>
                </div>

                <div className="flex justify-center" dir="ltr">
                  <InputOTP
                    maxLength={6}
                    value={otpValue}
                    onChange={setOtpValue}
                    disabled={otpBusy}
                    aria-label={t("auth.otpLabel")}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <FieldError message={otpError ?? undefined} />

                <Button
                  type="submit"
                  className="btn-gradient h-12 w-full rounded-2xl text-base font-extrabold"
                  disabled={otpBusy || otpValue.length !== 6}
                >
                  {otpBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5" />
                      {t("auth.otpVerifyBtn")}
                    </>
                  )}
                </Button>

                {/* الوضع التجريبي: لا خدمة بريد مفعّلة بعد — الرمز يظهر هنا مؤقتاً */}
                {otpDemoCode && (
                  <div className="rounded-2xl border border-primary/25 bg-primary/8 px-4 py-3.5 text-center">
                    <p className="text-[11px] font-bold leading-relaxed text-muted-foreground">
                      {t("auth.otpDemoNote")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
                      <span
                        className="rounded-xl bg-background/60 px-4 py-1.5 text-2xl font-black tracking-[0.35em] tabular-nums text-primary"
                        dir="ltr"
                      >
                        {otpDemoCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOtpValue(otpDemoCode)}
                        disabled={otpBusy}
                        className="glass-chip inline-flex h-9 items-center rounded-full px-3.5 text-xs font-bold text-primary transition-all hover:scale-105"
                      >
                        {t("auth.otpUseThisCode")}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || otpBusy}
                    className="font-bold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                  >
                    {resendCooldown > 0
                      ? t("auth.otpResendIn", { seconds: resendCooldown })
                      : t("auth.otpResend")}
                  </button>
                  <button
                    type="button"
                    onClick={backToLoginForm}
                    className="font-bold text-muted-foreground hover:text-foreground"
                  >
                    {t("auth.otpBackToLogin")}
                  </button>
                </div>
              </form>
            ) : step === "awaiting-approval" ? (
              /* ------------------- انتظار موافقة الدكتور (الطالب) ------------------- */
              <div className="mt-7 space-y-5 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-amber-500/12 text-amber-600 dark:text-amber-400 animate-float-y">
                  <Hourglass className="h-8 w-8" />
                </span>
                <div>
                  <h2 className="text-xl font-black text-foreground">
                    {t("auth.awaitingTitle")}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("auth.awaitingBody", {
                      name: registeredName.split(" ")[0],
                    })}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3.5">
                  <p className="flex items-center justify-center gap-2 text-sm font-extrabold text-amber-600 dark:text-amber-400">
                    <Hourglass className="h-4.5 w-4.5" />
                    {t("auth.awaitingBadge")}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    {t("auth.awaitingNote")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={backToLoginForm}
                  className="h-12 w-full rounded-2xl font-extrabold"
                >
                  <LogIn className="h-5 w-5" />
                  {t("auth.awaitingBackBtn")}
                </Button>
              </div>
            ) : mode === "login" ? (
              /* ------------------- نموذج تسجيل الدخول ------------------- */
              <form onSubmit={handleLogin} className="mt-7 space-y-5" noValidate>
                <div className="text-center">
                  <h2 className="text-xl font-black text-foreground">
                    {t("auth.loginTitle")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("auth.loginSubtitle")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-bold">
                    {t("auth.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      dir="ltr"
                      className={`input-glass ps-11 ${fieldErrors.loginEmail ? "border-rose-500/60 focus-visible:ring-rose-500/30" : ""}`}
                      placeholder={t("auth.emailPlaceholder")}
                      value={loginEmail}
                      onChange={(e) => {
                        setLoginEmail(e.target.value);
                        clearFieldError("loginEmail");
                      }}
                      autoComplete="email"
                      disabled={busy}
                      required
                      aria-invalid={Boolean(fieldErrors.loginEmail)}
                    />
                  </div>
                  <FieldError message={fieldErrors.loginEmail} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-id" className="text-sm font-bold">
                    {t("auth.loginIdLabel")}
                  </Label>
                  <div className="relative">
                    <Hash className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-id"
                      type="text"
                      dir="ltr"
                      className={`input-glass ps-11 ${fieldErrors.loginId ? "border-rose-500/60 focus-visible:ring-rose-500/30" : ""}`}
                      placeholder="202304571"
                      value={loginId}
                      onChange={(e) => {
                        setLoginId(e.target.value);
                        clearFieldError("loginId");
                      }}
                      disabled={busy}
                      required
                      aria-invalid={Boolean(fieldErrors.loginId)}
                    />
                  </div>
                  <FieldError message={fieldErrors.loginId} />
                </div>

                {/* بانر ربط الجهاز — يظهر فقط عند رفض الدخول من جهاز مختلف */}
                {deviceMismatch && (
                  <div
                    className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/8 px-4 py-4 pop-in"
                    role="alert"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Smartphone className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-amber-700 dark:text-amber-300">
                          {t("auth.deviceMismatchTitle")}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {transferRequested
                            ? t("auth.deviceTransferSentBody")
                            : t("auth.deviceMismatchBody")}
                        </p>
                      </div>
                    </div>
                    {!transferRequested && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRequestDeviceTransfer}
                        disabled={transferBusy}
                        className="h-11 w-full rounded-xl border-amber-500/40 bg-amber-500/10 font-extrabold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                      >
                        {transferBusy ? (
                          <Loader2 className="h-4.5 w-4.5 animate-spin" />
                        ) : (
                          <>
                            <ShieldQuestion className="h-4.5 w-4.5" />
                            {t("auth.deviceTransferBtn")}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  className="btn-gradient h-12 w-full rounded-2xl text-base font-extrabold"
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="h-5 w-5" />
                      {t("auth.loginBtn")}
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  {t("auth.noAccount")}{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="font-bold text-primary hover:underline"
                  >
                    {t("auth.createAccount")}
                  </button>
                </p>

                <p className="rounded-xl bg-muted/40 px-3 py-2.5 text-center text-[11px] leading-relaxed text-muted-foreground">
                  {t("auth.sessionSecurityNote")}
                </p>

                <p className="rounded-xl bg-muted/40 px-3 py-2.5 text-center text-[11px] leading-relaxed text-muted-foreground">
                  {t("auth.studentPendingNote")}
                </p>
              </form>
            ) : (
              /* ------------------- نموذج إنشاء حساب جديد ------------------- */
              <form onSubmit={handleRegister} className="mt-7 space-y-5" noValidate>
                <div className="text-center">
                  <h2 className="text-xl font-black text-foreground">
                    {t("auth.registerTitle")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("auth.registerSubtitle")}
                  </p>
                </div>

                {/* اختيار الدور */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    aria-pressed={role === "student"}
                    className={`rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all ${
                      role === "student"
                        ? "border-primary bg-primary/10 shadow-[0_0_0_3px_rgba(23,24,28,0.14)]"
                        : "border-border bg-white/40 dark:bg-white/5 hover:border-primary/50"
                    }`}
                  >
                    <GraduationCap
                      className={`h-7 w-7 ${role === "student" ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <span className="text-sm font-extrabold">{t("auth.roleStudent")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("professor")}
                    aria-pressed={role === "professor"}
                    className={`rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all ${
                      role === "professor"
                        ? "border-primary bg-primary/10 shadow-[0_0_0_3px_rgba(23,24,28,0.14)]"
                        : "border-border bg-white/40 dark:bg-white/5 hover:border-primary/50"
                    }`}
                  >
                    <BookOpen
                      className={`h-7 w-7 ${role === "professor" ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <span className="text-sm font-extrabold">{t("auth.roleProfessor")}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-name" className="text-sm font-bold">
                    {t("auth.fullName")}
                  </Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="register-name"
                      type="text"
                      className={`input-glass ps-11 ${fieldErrors.name ? "border-rose-500/60 focus-visible:ring-rose-500/30" : ""}`}
                      placeholder={t("auth.fullNamePlaceholder")}
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        clearFieldError("name");
                      }}
                      disabled={busy}
                      required
                      aria-invalid={Boolean(fieldErrors.name)}
                    />
                  </div>
                  <FieldError message={fieldErrors.name} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="register-email" className="text-sm font-bold">
                      {t("auth.email")}
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="register-email"
                        type="email"
                        dir="ltr"
                        className={`input-glass ps-11 ${fieldErrors.email ? "border-rose-500/60 focus-visible:ring-rose-500/30" : ""}`}
                        placeholder={t("auth.emailPlaceholder")}
                        value={registerEmail}
                        onChange={(e) => {
                          setRegisterEmail(e.target.value);
                          clearFieldError("email");
                        }}
                        autoComplete="email"
                        disabled={busy}
                        required
                        aria-invalid={Boolean(fieldErrors.email)}
                      />
                    </div>
                    <FieldError message={fieldErrors.email} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-id" className="text-sm font-bold">
                      {idLabel}
                    </Label>
                    <div className="relative">
                      <Hash className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="register-id"
                        type="text"
                        dir="ltr"
                        className={`input-glass ps-11 ${fieldErrors.universityId ? "border-rose-500/60 focus-visible:ring-rose-500/30" : ""}`}
                        placeholder={idPlaceholder}
                        value={universityId}
                        onChange={(e) => {
                          setUniversityId(e.target.value);
                          clearFieldError("universityId");
                        }}
                        disabled={busy}
                        required
                        aria-invalid={Boolean(fieldErrors.universityId)}
                      />
                    </div>
                    <FieldError message={fieldErrors.universityId} />
                  </div>
                </div>

                {/* ============ بيانات حسب الدور ============ */}
                {role === "student" ? (
                  <div className="space-y-4 rounded-2xl border border-border bg-white/35 dark:bg-white/4 px-4 py-4">
                    {/* البيانات الأكاديمية — تظهر في البطاقة الرقمية */}
                    <p className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                      <GraduationCap className="h-4 w-4 text-primary" />
                      {t("idCard.noAcademicInfo")}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="register-faculty" className="flex items-center gap-1.5 text-xs font-bold">
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                          {t("auth.faculty")}
                        </Label>
                        <Input
                          id="register-faculty"
                          type="text"
                          maxLength={80}
                          className="input-glass h-10 text-sm"
                          placeholder={t("auth.facultyPlaceholder")}
                          value={faculty}
                          onChange={(e) => setFaculty(e.target.value)}
                          disabled={busy}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-program" className="flex items-center gap-1.5 text-xs font-bold">
                          <Layers className="h-3.5 w-3.5 text-primary" />
                          {t("auth.program")}
                        </Label>
                        <Input
                          id="register-program"
                          type="text"
                          maxLength={80}
                          className="input-glass h-10 text-sm"
                          placeholder={t("auth.programPlaceholder")}
                          value={program}
                          onChange={(e) => setProgram(e.target.value)}
                          disabled={busy}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-year" className="flex items-center gap-1.5 text-xs font-bold">
                          <GraduationYearIcon className="h-3.5 w-3.5 text-primary" />
                          {t("auth.academicYear")}
                        </Label>
                        <Input
                          id="register-year"
                          type="text"
                          maxLength={40}
                          className="input-glass h-10 text-sm"
                          placeholder={t("auth.academicYearPlaceholder")}
                          value={academicYear}
                          onChange={(e) => setAcademicYear(e.target.value)}
                          disabled={busy}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t("auth.academicInfoNote")}
                    </p>

                    <p className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                      <IdCard className="h-4 w-4 text-primary" />
                      {t("auth.studentDocsTitle")}
                    </p>

                    <PhotoField
                      inputRef={idFrontInputRef}
                      label={t("auth.photoIdFront")}
                      hint={t("auth.photosMaxHint")}
                      icon={IdCard}
                      shape="wide"
                      file={photoFiles.idFront}
                      previewUrl={previews.idFront}
                      error={fieldErrors.idFront}
                      onPick={(file) => pickPhoto("idFront", file)}
                      onClear={() => clearPhoto("idFront")}
                    />

                    <PhotoField
                      inputRef={idBackInputRef}
                      label={t("auth.photoIdBack")}
                      hint={t("auth.photosMaxHint")}
                      icon={FlipHorizontal}
                      shape="wide"
                      file={photoFiles.idBack}
                      previewUrl={previews.idBack}
                      error={fieldErrors.idBack}
                      onPick={(file) => pickPhoto("idBack", file)}
                      onClear={() => clearPhoto("idBack")}
                    />

                    <PhotoField
                      inputRef={personalInputRef}
                      label={t("auth.photoPersonal")}
                      hint={t("auth.photoPersonalStudentHint")}
                      icon={UserRound}
                      shape="square"
                      file={photoFiles.personal}
                      previewUrl={previews.personal}
                      error={fieldErrors.personal}
                      onPick={(file) => pickPhoto("personal", file)}
                      onClear={() => clearPhoto("personal")}
                    />

                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t("auth.studentDocsNote")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-2xl border border-border bg-white/35 dark:bg-white/4 px-4 py-4">
                    <p className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                      <UserRound className="h-4 w-4 text-primary" />
                      {t("auth.professorDocsTitle")}
                    </p>

                    {/* المادة التي يدرّسها الدكتور */}
                    <div className="space-y-2">
                      <Label htmlFor="register-subject" className="text-sm font-bold">
                        {t("auth.subjectField")}
                      </Label>
                      <div className="relative">
                        <BookOpen className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="register-subject"
                          type="text"
                          maxLength={80}
                          className={`input-glass ps-11 ${fieldErrors.subject ? "border-rose-500/60 focus-visible:ring-rose-500/30" : ""}`}
                          placeholder={t("auth.subjectPlaceholder")}
                          value={subject}
                          onChange={(e) => {
                            setSubject(e.target.value);
                            clearFieldError("subject");
                          }}
                          disabled={busy}
                          required
                          aria-invalid={Boolean(fieldErrors.subject)}
                        />
                      </div>
                      <FieldError message={fieldErrors.subject} />
                    </div>

                    <PhotoField
                      inputRef={personalInputRef}
                      label={t("auth.photoPersonal")}
                      hint={t("auth.photoPersonalProfessorHint")}
                      icon={UserRound}
                      shape="square"
                      file={photoFiles.personal}
                      previewUrl={previews.personal}
                      error={fieldErrors.personal}
                      onPick={(file) => pickPhoto("personal", file)}
                      onClear={() => clearPhoto("personal")}
                    />

                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t("auth.professorDocsNote")}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="btn-gradient h-12 w-full rounded-2xl text-base font-extrabold"
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    t("auth.registerBtn")
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  {t("auth.haveAccount")}{" "}
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="font-bold text-primary hover:underline"
                  >
                    {t("auth.loginHere")}
                  </button>
                </p>
              </form>
            )}
          </section>
        </div>
      </div>

      {/* تذييل */}
      <footer className="relative z-10 py-5 text-center text-xs text-muted-foreground">
        <p className="font-extrabold text-foreground/70">{t("auth.footerLine1")}</p>
        <p className="mt-0.5">
          {t("auth.footerLine2", { name: "Ahmed Shaban" })}
        </p>
      </footer>
    </main>
  );
}
