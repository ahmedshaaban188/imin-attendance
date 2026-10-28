"use client";

/**
 * ============================================================================
 *  ImIn | الصفحة الرئيسية — موزّع الواجهات الثلاث
 * ============================================================================
 *  تعمل هذه الصفحة كنقطة الدخول الوحيدة للنظام وتتنقّل بين الواجهات الثلاث
 *  حسب حالة المستخدم المسجّلة في sessionStorage (imin-user-session):
 *
 *    1) AuthView        (مكافئ index.html)            → الدخول والتسجيل
 *    2) ProfessorView   (مكافئ professor-dashboard.html) → لوحة الدكتور
 *    3) StudentView     (مكافئ student-dashboard.html)   → لوحة الطالب
 *
 *  سياسة أمان الجلسة (SessionGuard):
 *    - خمول 120 ثانية بدون أي تفاعل → خروج تلقائي مع رسالة سبب في صفحة الدخول
 *    - إغلاق المتصفح/التبويب → الجلسة تنتهي من أصله (sessionStorage)
 *
 *  ملاحظة معمارية: وفق قيود بيئة المعاينة هذه، لا يستطيع المستخدم رؤية سوى
 *  مسار "/" لذلك تتم إدارة "الصفحات" داخل هذه الصفحة الواحدة بدلاً من
 *  التوجيه إلى مسارات متعددة — والنتيجة النهائية مطابقة تماماً.
 * ============================================================================
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { AuthView } from "@/components/auth/auth-view";
import { ProfessorView } from "@/components/professor/professor-view";
import { StudentView } from "@/components/student/student-view";
import { SessionGuard } from "@/components/session-guard";
import {
  clearUserSession,
  getUserSession,
  saveUserSession,
  setLogoutReason,
} from "@/lib/supabaseClient";
import { useI18n } from "@/lib/i18n";
import type { AppUser } from "@/lib/types";

type ActiveView = "loading" | "auth" | "professor" | "student";

export default function HomePage() {
  const { t } = useI18n();
  const [view, setView] = React.useState<ActiveView>("loading");
  const [user, setUser] = React.useState<AppUser | null>(null);

  /* قراءة المستخدم الحالي من sessionStorage عند تحميل الصفحة */
  React.useEffect(() => {
    const storedUser = getUserSession();
    if (storedUser) {
      setUser(storedUser);
      setView(storedUser.role === "professor" ? "professor" : "student");
    } else {
      setView("auth");
    }
  }, []);

  /* بعد تسجيل الدخول أو إنشاء حساب جديد بنجاح */
  function handleAuthSuccess(authenticatedUser: AppUser) {
    setUser(authenticatedUser);
    setView(authenticatedUser.role === "professor" ? "professor" : "student");
  }

  /* بعد تحديث بيانات المستخدم (إضافة/استبدال صوره من حسابه) */
  function handleUserUpdate(updatedUser: AppUser) {
    saveUserSession(updatedUser);
    setUser(updatedUser);
  }

  /* تسجيل الخروج — يدوي، أو تلقائي بسبب الخمول (سبب يظهر في صفحة الدخول) */
  function handleLogout(reason?: "idle") {
    clearUserSession();
    if (reason === "idle") {
      setLogoutReason("idle");
    }
    setUser(null);
    setView("auth");
  }

  /* الخروج التلقائي (يُثبَّت بالمرجع حتى لا يُعاد ضبط مؤقت الخمول) */
  const handleAutoLogout = React.useCallback(() => handleLogout("idle"), []);

  /* شاشة التحميل الأولية أثناء قراءة الجلسة */
  if (view === "loading" || (view !== "auth" && !user)) {
    return (
      <main className="relative flex min-h-screen items-center justify-center">
        <div className="orbs" aria-hidden="true">
          <span className="orb orb-1" />
          <span className="orb orb-2" />
          <span className="orb orb-3" />
        </div>
        <div className="glass-card flex flex-col items-center gap-4 px-10 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground">{t("common.loading")}</p>
        </div>
      </main>
    );
  }

  if (view === "professor" && user) {
    return (
      <React.Fragment>
        <ProfessorView user={user} onLogout={() => handleLogout()} />
        <SessionGuard onAutoLogout={handleAutoLogout} />
      </React.Fragment>
    );
  }

  if (view === "student" && user) {
    return (
      <React.Fragment>
        <StudentView user={user} onLogout={() => handleLogout()} onUserUpdate={handleUserUpdate} />
        <SessionGuard onAutoLogout={handleAutoLogout} />
      </React.Fragment>
    );
  }

  return <AuthView onSuccess={handleAuthSuccess} />;
}
