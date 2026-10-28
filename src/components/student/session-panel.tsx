"use client";

/**
 * ============================================================================
 *  ImIn | لوحة الطالب — لوحة الجلسة الحالية والتحقق الجغرافي
 * ============================================================================
 *  - فحص موقع الطالب جغرافياً عبر المتصفح (GPS) بشكل مستمر (watchPosition)
 *  - مقارنة الموقع بإحداثيات الجلسة المفتوحة باستخدام معادلة Haversine
 *  - زر "تسجيل الحضور الآن" متاح فقط داخل النطاق (<= radius) ومقفل خارجه
 *  - خريطة مصغرة (SVG) توضح موقع الطالب نسبةً لمركز الجلسة ودائرة النطاق
 *  - كشف تلقائي للجلسات المفتوحة (Realtime + تحديث دوري)
 * ============================================================================
 */

import * as React from "react";
import {
  Navigation,
  LocateFixed,
  Loader2,
  RefreshCw,
  CheckCircle2,
  RadioTower,
  ShieldCheck,
  ShieldX,
  MapPin,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { haversineDistance, initialBearing } from "@/lib/geo";
import { formatDistance, formatTime, relativeTime } from "@/lib/format";
import { useI18n, geoErrorMessage } from "@/lib/i18n";
import type { GeoPosition, SessionRow } from "@/lib/types";

/* -------------------------------------------------------------------------- */

type GpsStatus = "idle" | "locating" | "active" | "error";

export interface SessionPanelProps {
  /** الجلسات المفتوحة حالياً (مع اسم الدكتور) */
  openSessions: SessionRow[];
  loadingSessions: boolean;
  /** خريطة حالة حضور الطالب: session_id → status (حاضر/متأخر) */
  attendedStatuses: Record<string, string>;
  /** الجلسة التي سجّل حضورها للتوّ (لعرض تأكيد النجاح) */
  justCheckedInSessionId: string | null;
  checkingIn: boolean;
  /** يُمرر موقع الطالب اللحظي ليُرسل للخادم ويتحقق منه جغرافياً */
  onCheckIn: (session: SessionRow, position: GeoPosition | null) => void;
  onRefresh: () => void;
}

export function SessionPanel({
  openSessions,
  loadingSessions,
  attendedStatuses,
  justCheckedInSessionId,
  checkingIn,
  onCheckIn,
  onRefresh,
}: SessionPanelProps) {
  const { t, locale } = useI18n();
  const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(null);
  const [position, setPosition] = React.useState<GeoPosition | null>(null);
  const [gpsStatus, setGpsStatus] = React.useState<GpsStatus>("idle");
  const [gpsError, setGpsError] = React.useState<string | null>(null);
  const [gpsRetryCount, setGpsRetryCount] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  /* ---------- إبقاء الجلسة المختارة صالحة عند تغيّر القائمة ---------- */
  React.useEffect(() => {
    if (openSessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSessionId || !openSessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(openSessions[0].id);
    }
  }, [openSessions, selectedSessionId]);

  const selectedSession = React.useMemo(
    () => openSessions.find((s) => s.id === selectedSessionId) ?? null,
    [openSessions, selectedSessionId]
  );

  /* --------------------- المراقبة المستمرة لموقع GPS -------------------- */
  React.useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGpsStatus("error");
      setGpsError(geoErrorMessage("GEO_UNSUPPORTED", locale));
      return;
    }

    setGpsStatus("locating");
    setGpsError(null);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsStatus("active");
        setGpsError(null);
      },
      (error) => {
        setGpsStatus("error");
        setGpsError(geoErrorMessage(error.code, locale));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsRetryCount, locale]);

  /* --------- عدّاد 30 ثانية لتحديث "منذ متى فُتحت الجلسة" وغيرها -------- */
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  /* ------------------- الحسابات الجغرافية (Haversine) ------------------- */
  const sessionLat = selectedSession ? Number(selectedSession.lat) : 0;
  const sessionLng = selectedSession ? Number(selectedSession.lng) : 0;
  const radius = selectedSession?.radius ?? 0;

  const distance = React.useMemo(() => {
    if (!position || !selectedSession) return null;
    return haversineDistance(position.lat, position.lng, sessionLat, sessionLng);
     
  }, [position, selectedSession?.id, sessionLat, sessionLng]);

  const inRange = distance !== null && selectedSession !== null && distance <= radius;

  const attendedStatus = selectedSession ? attendedStatuses[selectedSession.id] : undefined;
  const attended = attendedStatus !== undefined;
  const justCheckedIn =
    selectedSession !== null && justCheckedInSessionId === selectedSession.id;

  const canCheckIn =
    selectedSession !== null &&
    gpsStatus === "active" &&
    inRange &&
    !attended &&
    !checkingIn;

  const progress =
    distance !== null && radius > 0 ? Math.min((distance / radius) * 100, 100) : 0;

  /* ------------------- موقع الطالب على الخريطة المصغرة ------------------- */
  const studentDot = React.useMemo(() => {
    if (!position || !selectedSession || distance === null || radius <= 0) return null;
    const bearing = initialBearing(sessionLat, sessionLng, position.lat, position.lng);
    const ratio = Math.min(distance / radius, 1.24);
    const distPx = ratio * 70;
    const radians = (bearing * Math.PI) / 180;
    const accuracyPx = Math.min((position.accuracy / radius) * 70, 34);
    return {
      x: 100 + Math.sin(radians) * distPx,
      y: 100 - Math.cos(radians) * distPx,
      accuracyPx,
    };
     
  }, [position, selectedSession?.id, distance, radius, sessionLat, sessionLng]);

  /* ------------------------------ العرض ------------------------------ */

  return (
    <section className="glass-card p-5 sm:p-6" aria-label={t("student.sessionTitle")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-black">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <Navigation className="h-5 w-5" />
          </span>
          {t("student.sessionTitle")}
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loadingSessions}
          className="glass-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-foreground/80 transition-all hover:text-primary disabled:opacity-50"
          aria-label={t("common.refresh")}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingSessions ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </button>
      </header>

      {loadingSessions && openSessions.length === 0 ? (
        /* ---------- تحميل الجلسات ---------- */
        <div className="mt-4 space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : !selectedSession ? (
        /* ---------- لا جلسات مفتوحة ---------- */
        <div
          className="mt-4 flex h-[26rem] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 text-center"
          aria-label={t("student.noOpenSessions")}
        >
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-muted text-muted-foreground animate-float-y">
            <RadioTower className="h-8 w-8" />
          </span>
          <p className="text-base font-black text-foreground">{t("student.noOpenSessions")}</p>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("student.noOpenSessionsHint")}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* ---------- اختيار الجلسة عند تعددها ---------- */}
          {openSessions.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("student.sessionTitle")}>
              {openSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  role="tab"
                  aria-selected={session.id === selectedSessionId}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                    session.id === selectedSessionId
                      ? "btn-gradient"
                      : "glass-chip text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {session.subject
                    ? session.subject
                    : session.users?.full_name
                      ? `${t("common.professorPrefix")}${session.users.full_name.split(" ")[0]}`
                      : t("student.openSessionLabel")}{" "}
                  • {relativeTime(session.created_at, now, locale)}
                </button>
              ))}
            </div>
          )}

          {/* ---------- معلومات الجلسة ---------- */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-emerald-500/8 border border-emerald-500/25 px-4 py-3.5">
            <p className="flex items-center gap-2.5 text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
              <span className="live-dot" />
              {t("student.openNowWith", {
                name: selectedSession.users?.full_name
                  ? `${t("common.professorPrefix")}${selectedSession.users.full_name}`
                  : t("student.lecturer"),
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("student.startedAt", {
                time: formatTime(selectedSession.created_at, locale),
                relative: relativeTime(selectedSession.created_at, now, locale),
              })}
            </p>
          </div>

          {/* اسم المادة/المحاضرة (إن حدّدها الدكتور) */}
          {selectedSession.subject && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-primary/25 bg-primary/8 px-4 py-3">
              <BookOpen className="h-4.5 w-4.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-primary">
                  {selectedSession.subject}
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  {t("student.lectureNameNote")}
                </p>
              </div>
            </div>
          )}

          {/* ---------- الخريطة المصغرة + مؤشر النطاق ---------- */}
          <div className="grid items-center gap-4 rounded-2xl bg-white/45 dark:bg-white/5 border border-border p-4 sm:grid-cols-2">
            {/* الخريطة */}
            <div className="mx-auto" role="img" aria-label={t("student.distanceToHall")}>
              <svg viewBox="0 0 200 200" className="h-52 w-52">
                {/* دائرة النطاق المسموح */}
                <circle
                  cx={100}
                  cy={100}
                  r={70}
                  fill={inRange ? "rgba(94,140,113,0.09)" : "rgba(171,106,99,0.07)"}
                  stroke={inRange ? "#5e8c71" : "#ab6a63"}
                  strokeWidth={1.6}
                  strokeDasharray="6 5"
                />
                {/* شبكة خفيفة */}
                <line x1={100} y1={22} x2={100} y2={178} stroke="currentColor" className="text-border" strokeWidth={0.5} />
                <line x1={22} y1={100} x2={178} y2={100} stroke="currentColor" className="text-border" strokeWidth={0.5} />

                {/* مركز الجلسة (القاعة) — نقطة حبرية */}
                <circle cx={100} cy={100} r={9} fill="currentColor" className="text-foreground" />
                <circle cx={100} cy={100} r={15} fill="none" stroke="currentColor" className="text-foreground" strokeWidth={1.5} opacity={0.45} />
                <text x={100} y={126} textAnchor="middle" fontSize={9} fontWeight="bold" fill="currentColor" className="text-muted-foreground">
                  {t("common.hall")}
                </text>

                {/* موقع الطالب */}
                {studentDot && (
                  <>
                    <circle
                      cx={studentDot.x}
                      cy={studentDot.y}
                      r={studentDot.accuracyPx}
                      fill={inRange ? "rgba(94,140,113,0.17)" : "rgba(171,106,99,0.15)"}
                      stroke={inRange ? "rgba(94,140,113,0.42)" : "rgba(171,106,99,0.42)"}
                      strokeWidth={1}
                    />
                    <circle
                      cx={studentDot.x}
                      cy={studentDot.y}
                      r={7}
                      fill={inRange ? "#5e8c71" : "#ab6a63"}
                      stroke="#ffffff"
                      strokeWidth={2.2}
                    />
                    <text
                      x={studentDot.x}
                      y={studentDot.y - 13}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight="bold"
                      fill={inRange ? "#476e56" : "#96524c"}
                    >
                      {t("common.you")}
                    </text>
                  </>
                )}
              </svg>
            </div>

            {/* مؤشرات النطاق والمسافة */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {t("student.distanceToHall")}
                  </span>
                  <span className="tabular-nums" dir="ltr">
                    {distance !== null ? formatDistance(distance, locale) : "—"}
                  </span>
                </div>
                {/* شريط التقدم نحو حد النطاق */}
                <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      inRange ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] font-bold text-muted-foreground" dir="ltr">
                  <span>0 {t("common.metersShort")}</span>
                  <span>{t("student.rangeLimit", { radius })}</span>
                </div>
              </div>

              <div
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-extrabold ${
                  inRange
                    ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/12 text-rose-600 dark:text-rose-400"
                }`}
              >
                {inRange ? <ShieldCheck className="h-5 w-5" /> : <ShieldX className="h-5 w-5" />}
                {inRange
                  ? t("student.inRangeMsg")
                  : t("student.outRangeMsg", {
                      distance:
                        distance !== null
                          ? formatDistance(Math.max(0, distance - radius), locale)
                          : "",
                    })}
              </div>
            </div>
          </div>

          {/* ---------- حالة GPS ---------- */}
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs font-bold ${
              gpsStatus === "active"
                ? "bg-primary/8 text-primary"
                : gpsStatus === "error"
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            {gpsStatus === "active" && position ? (
              <>
                <span className="flex items-center gap-1.5">
                  <LocateFixed className="h-3.5 w-3.5" />
                  {t("student.gpsActive")}
                </span>
                <span className="tabular-nums" dir="ltr">
                  ±{Math.round(position.accuracy)} {t("common.metersShort")} • {position.lat.toFixed(5)},{" "}
                  {position.lng.toFixed(5)}
                </span>
              </>
            ) : gpsStatus === "error" ? (
              <>
                <span className="flex-1">{gpsError}</span>
                <button
                  type="button"
                  onClick={() => setGpsRetryCount((count) => count + 1)}
                  className="rounded-full bg-rose-500/15 px-3 py-1 text-[11px] font-extrabold text-rose-600 dark:text-rose-400 hover:bg-rose-500/25"
                >
                  {t("student.gpsRetry")}
                </button>
              </>
            ) : (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("student.gpsLocating")}
              </span>
            )}
          </div>

          {/* ---------- زر تسجيل الحضور ---------- */}
          {attended ? (
            <div
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/10 px-4 py-5 text-center ${
                justCheckedIn ? "pop-in" : ""
              }`}
              role="status"
            >
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-base font-black text-emerald-700 dark:text-emerald-300">
                {t("student.checkedInTitle")}
              </p>
              <p className="text-xs font-bold text-muted-foreground">
                {justCheckedIn
                  ? t("student.alreadyCheckedIn")
                  : attendedStatus === "late"
                    ? t("student.checkedInStatusLate")
                    : t("student.checkedInStatusPresent")}
              </p>
            </div>
          ) : (
            <Button
              onClick={() => selectedSession && onCheckIn(selectedSession, position)}
              disabled={!canCheckIn}
              className="btn-gradient h-14 w-full rounded-2xl text-lg font-black"
              aria-label={t("student.checkInNow")}
            >
              {checkingIn ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  {t("student.checkingIn")}
                </>
              ) : !selectedSession ? (
                t("student.noSessionBtn")
              ) : gpsStatus !== "active" ? (
                t("student.waitingLocationBtn")
              ) : !inRange ? (
                t("student.outOfRangeBtn")
              ) : (
                t("student.checkInNow")
              )}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
