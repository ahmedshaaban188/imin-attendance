"use client";

/**
 * ============================================================================
 *  ImIn | نظام الترجمة المركزي (i18n) — عربي/إنجليزي مع RTL/LTR
 * ============================================================================
 *  - I18nProvider يغلّف التطبيق ويوفّر useI18n() { t, locale, dir, setLocale, toggleLocale }
 *  - t("auth.loginTitle") يقرأ من قاموس اللغة الحالية مع دعم البارامترات {name}
 *  - تبديل اللغة يحدّث <html lang dir> فوراً بدون إعادة تحميل الصفحة
 *  - الاختيار محفوظ في localStorage (imin-locale)
 * ============================================================================
 */

import * as React from "react";
import { ar } from "./i18n-ar";
import { en } from "./i18n-en";

export type Locale = "ar" | "en";

const LOCALE_STORAGE_KEY = "imin-locale";

const DICTIONARIES: Record<Locale, unknown> = { ar, en };

/* -------------------------------------------------------------------------- */
/*  أدوات داخلية                                                               */
/* -------------------------------------------------------------------------- */

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readStoredLocale(): Locale | null {
  if (!isBrowser()) return null;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === "ar" || stored === "en" ? stored : null;
  } catch {
    return null;
  }
}

function persistLocale(locale: Locale): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* تجاهل */
  }
}

/** قراءة مفتاح متداخل "a.b.c" من القاموس */
function lookup(dictionary: unknown, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = dictionary;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** استبدال {param} داخل النص */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/** ترجمة مفتاح — ترجع المفتاح نفسه عند غيابه (بدل الانهيار) */
export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const value = lookup(DICTIONARIES[locale], key);
  if (typeof value === "string") return interpolate(value, params);
  // احتياط: جرّب اللغة الأخرى قبل الفشل
  const fallback = lookup(DICTIONARIES[locale === "ar" ? "en" : "ar"], key);
  if (typeof fallback === "string") return interpolate(fallback, params);
  return key;
}

/* -------------------------------------------------------------------------- */
/*  السياق والمزوّد                                                             */
/* -------------------------------------------------------------------------- */

interface I18nContextValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  /** ترجمة مفتاح مع بارامترات اختيارية */
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("ar");

  /* قراءة اللغة المحفوظة عند أول تحميل */
  React.useEffect(() => {
    const stored = readStoredLocale();
    if (stored && stored !== locale) {
      setLocaleState(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* تحديث اتجاه الصفحة ولغتها عند كل تغيير — بدون إعادة تحميل */
  React.useEffect(() => {
    const dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    persistLocale(locale);
  }, [locale]);

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      t: (key, params) => translate(locale, key, params),
      setLocale: setLocaleState,
      toggleLocale: () => setLocaleState((prev) => (prev === "ar" ? "en" : "ar")),
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** الوصول لنظام الترجمة من أي مكوّن داخل I18nProvider */
export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext);
  if (!context) {
    // مزوّد افتراضي آمن إن استُخدم خارج Provider (لن ينهار التطبيق)
    return {
      locale: "ar",
      dir: "rtl",
      t: (key, params) => translate("ar", key, params),
      setLocale: () => undefined,
      toggleLocale: () => undefined,
    };
  }
  return context;
}

/* -------------------------------------------------------------------------- */
/*  أدوات التنسيق حسب اللغة                                                     */
/* -------------------------------------------------------------------------- */

/** كود التنسيق الكامل (أرقام لاتينية في العربية للوضوح التقني) */
export function localeTag(locale: Locale): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
}

/** ترجمة حالة الحضور (present/late/absent) */
export function attendanceStatusLabel(locale: Locale, status: string): string {
  if (status === "present") return translate(locale, "student.statusPresent");
  if (status === "late") return translate(locale, "student.statusLate");
  return translate(locale, "student.statsAbsent");
}

/** ترجمة حالة الحضور الذكية (safe/warning/critical/no_data) */
export function smartStatusLabel(locale: Locale, status: string): string {
  const key =
    status === "safe"
      ? "student.statusSafe"
      : status === "warning"
        ? "student.statusWarning"
        : status === "critical"
          ? "student.statusCritical"
          : "student.statusNoData";
  return translate(locale, key);
}

/* -------------------------------------------------------------------------- */
/*  تحويل أخطاء الخادم (code) إلى رسالة مترجمة                                  */
/* -------------------------------------------------------------------------- */

/** خريطة كود الخطأ → مفتاح الترجمة */
const ERROR_KEYS: Record<string, string> = {
  NETWORK: "errors.network",
  SESSION_CLOSED: "errors.sessionClosedShort",
  SESSION_NOT_FOUND: "errors.sessionNotFound",
  BLOCKED: "errors.blocked",
  "23505": "errors.duplicate",
  EMAIL_EXISTS: "errors.emailExists",
  WRONG_OTP: "errors.wrongOtp",
  OTP_EXPIRED: "errors.otpExpired",
  OTP_MISSING: "errors.otpMissing",
  NOT_FOUND: "errors.notFound",
  BAD_REQUEST: "errors.badRequest",
  UNKNOWN_ACTION: "errors.unknownAction",
  RATE_LIMITED: "errors.rateLimited",
  FORBIDDEN: "errors.forbidden",
  ALREADY_VERIFIED: "errors.alreadyVerified",
  DEVICE_MISMATCH: "errors.deviceMismatch",
  OUT_OF_RANGE: "errors.outOfRange",
  GEO_REQUIRED: "errors.geoRequired",
};

/**
 * تحويل أي خطأ (من demoApi أو Supabase) إلى رسالة بلغة الواجهة.
 * يُستخدم بدل friendlyError القديمة في كل الواجهات.
 */
export function localizedError(
  error: unknown,
  locale: Locale
): string {
  if (!error) return translate(locale, "errors.fallback");
  const err = error as Error & { code?: string };
  if (err.code && ERROR_KEYS[err.code]) {
    return translate(locale, ERROR_KEYS[err.code]);
  }
  const message = String(err.message || "");
  // أخطاء الشبكة المعروفة
  if (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("تعذّر الاتصال بالخادم")
  ) {
    return translate(locale, "errors.network");
  }
  if (message.includes("duplicate key")) {
    return translate(locale, "errors.duplicate");
  }
  return message || translate(locale, "errors.fallback");
}

/* -------------------------------------------------------------------------- */
/*  أخطاء الموقع الجغرافي (Geolocation API) — النصوص من قسم geo.*            */
/* -------------------------------------------------------------------------- */

/** خريطة كود خطأ الموقع → مفتاح الترجمة */
const GEO_ERROR_KEYS: Record<string, string> = {
  GEO_UNSUPPORTED: "geo.unsupported",
  "1": "geo.permissionDenied",
  "2": "geo.positionUnavailable",
  "3": "geo.timeout",
};

/** ترجمة أكواد أخطاء الموقع (Geolocation API) إلى رسالة بلغة الواجهة */
export function geoErrorMessage(error: unknown, locale: Locale): string {
  const code = String(error instanceof Error ? error.message : error);
  const key = GEO_ERROR_KEYS[code];
  return key ? translate(locale, key) : translate(locale, "geo.unavailable");
}
