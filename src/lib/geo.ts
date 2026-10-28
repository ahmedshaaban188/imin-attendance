/**
 * ============================================================================
 *  ImIn | الدوال الجغرافية (GPS) — نقية بلا واجهة
 * ============================================================================
 *  - haversineDistance: معادلة Haversine لحساب المسافة بالأمتار بين نقطتين
 *  - initialBearing: الاتجاه (زاوية البوصلة) بين نقطتين — تُستخدم في الخريطة المصغرة
 *  - getCurrentPositionOnce: التقاط الموقع الحالي مرة واحدة
 *  (رسائل أخطاء الموقع المترجمة في i18n.tsx — geoErrorMessage)
 *  ملاحظة: هذا الملف يستورده الخادم (demo-store) — لا تضِف فيه أي كود واجهة.
 * ============================================================================
 */

import type { GeoPosition } from "./types";

const EARTH_RADIUS_METERS = 6371000; // نصف قطر الأرض بالأمتار

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * معادلة Haversine:
 * تحسب المسافة الدائرية العظمى بين نقطتين على سطح الأرض (بالأمتار).
 * a = sin²(Δφ/2) + cos(φ1)·cos(φ2)·sin²(Δλ/2)
 * c = 2·atan2(√a, √(1−a))
 * d = R·c
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * الاتجاه الابتدائي (Initial Bearing) بالنسب المئوية الدائرية (0-360)
 * حيث 0 = شمال، 90 = شرق — يُستخدم لرسم موقع الطالب حول مركز الجلسة.
 */
export function initialBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const y = Math.sin(toRadians(lng2 - lng1)) * Math.cos(toRadians(lat2));
  const x =
    Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
    Math.sin(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.cos(toRadians(lng2 - lng1));
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/**
 * التقاط الموقع الحالي مرة واحدة عبر واجهة المتصفح (Geolocation API)
 * بدقة عالية ومهلة 15 ثانية. ترجع Promise تُرفض عند الفشل.
 */
export function getCurrentPositionOnce(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("GEO_UNSUPPORTED"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (positionError) => reject(new Error(String(positionError.code))),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}
