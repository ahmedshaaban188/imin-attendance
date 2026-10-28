/**
 * ============================================================================
 *  ImIn | دوال تنسيق الأرقام والتواريخ حسب اللغة (عربي أرقام لاتينية / إنجليزي)
 * ============================================================================
 *  كل الدوال تقبل locale اختيارياً (ar | en) — الافتراضي "ar" للتوافق الخلفي.
 *  المكوّنات تمرر locale من useI18n() لضمان تنسيق مطابق للغة الواجهة.
 * ============================================================================
 */

import type { Locale } from "./i18n";
import { translate } from "./i18n";

function tag(locale: Locale): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
}

/** الوقت بصيغة HH:MM (عربي: 09:45 صباحاً / إنجليزي: 09:45 am) */
export function formatTime(isoDate: string, locale: Locale = "ar"): string {
  return new Date(isoDate).toLocaleTimeString(tag(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** الوقت بصيغة HH:MM:SS — لتسجيل وقت الحضور بالثانية */
export function formatTimeWithSeconds(isoDate: string, locale: Locale = "ar"): string {
  return new Date(isoDate).toLocaleTimeString(tag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** التاريخ بصيغة كاملة (عربي: الأحد، 5 أكتوبر 2026 / إنجليزي: Sunday, 5 October 2026) */
export function formatDate(isoDate: string, locale: Locale = "ar"): string {
  return new Date(isoDate).toLocaleDateString(tag(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** التاريخ والوقت معاً */
export function formatDateTime(isoDate: string, locale: Locale = "ar"): string {
  return `${formatDate(isoDate, locale)} — ${formatTime(isoDate, locale)}`;
}

/** تاريخ مختصر (عربي: 5 أكتوبر / إنجليزي: 5 Oct) */
export function formatShortDate(isoDate: string, locale: Locale = "ar"): string {
  return new Date(isoDate).toLocaleDateString(tag(locale), {
    day: "numeric",
    month: "short",
  });
}

/** الوقت المنقضي بصيغة نسبية حسب اللغة — النصوص من قاموس i18n (relative.*) */
export function relativeTime(
  isoDate: string,
  now: number = Date.now(),
  locale: Locale = "ar"
): string {
  const diffSeconds = Math.max(0, Math.floor((now - new Date(isoDate).getTime()) / 1000));
  if (diffSeconds < 30) return translate(locale, "relative.justNow");
  if (diffSeconds < 60) return translate(locale, "relative.secondsAgo", { n: diffSeconds });

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) {
    if (minutes === 1) return translate(locale, "relative.minuteAgo");
    if (minutes === 2) return translate(locale, "relative.minutesDual");
    return translate(locale, "relative.minutesAgo", { n: minutes });
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    if (hours === 1) return translate(locale, "relative.hourAgo");
    if (hours === 2) return translate(locale, "relative.hoursDual");
    return translate(locale, "relative.hoursAgo", { n: hours });
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return translate(locale, "relative.dayAgo");
  return translate(locale, "relative.daysAgo", { n: days });
}

/** عدّاد مدة الجلسة بصيغة رقمية (mm:ss أو h:mm:ss) — مستقل عن اللغة */
export function formatDurationClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padded = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${padded(minutes)}:${padded(seconds)}`
    : `${padded(minutes)}:${padded(seconds)}`;
}

/** تنسيق المسافة (عربي: 34 م / 1.24 كم — إنجليزي: 34 m / 1.24 km) — الوحدات من القاموس */
export function formatDistance(meters: number, locale: Locale = "ar"): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} ${translate(locale, "common.kmShort")}`;
  }
  if (meters < 10) {
    return `${meters.toFixed(1)} ${translate(locale, "common.metersShort")}`;
  }
  return `${Math.round(meters)} ${translate(locale, "common.metersShort")}`;
}

/** تحية حسب الوقت الحالي واللغة — من قاموس i18n (student.greeting*) */
export function greetingForNow(date: Date = new Date(), locale: Locale = "ar"): string {
  const hour = date.getHours();
  const key =
    hour < 12
      ? "student.greetingMorning"
      : hour < 17
        ? "student.greetingAfternoon"
        : "student.greetingEvening";
  return translate(locale, key);
}

/** اسم يوم الأسبوع حسب اللغة (0=الأحد) — من قاموس i18n (days.*) */
export function weekdayName(dayIndex: number, locale: Locale = "ar"): string {
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const index = ((dayIndex % 7) + 7) % 7;
  return translate(locale, `days.${keys[index]}`);
}

/** وقت بصيغة "HH:MM" من دقائق من منتصف الليل (للجدول) */
export function minutesToClock(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mm = String(normalized % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
