/**
 * ============================================================================
 *  ImIn | مسار API قاعدة البيانات التجريبية (يعمل فقط قبل ربط Supabase)
 * ============================================================================
 *  POST /api/demo  { action: "...", ...payload }
 *  الاستجابة: { ok: true, data } أو { ok: false, code?, error }
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { demoAction } from "@/lib/demo-store";

export async function POST(request: Request) {
  let body: Record<string, unknown> | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "طلب غير صالح." },
      { status: 400 }
    );
  }

  const action = typeof body?.action === "string" ? body.action : "";
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "حدد إجراءً (action) صالحاً." },
      { status: 400 }
    );
  }

  try {
    const data = await demoAction(action, body as Record<string, unknown>);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const err = error as Error & { code?: string };
    // أخطاء النطاق (بريد مكرر / حضور مكرر / جلسة غير موجودة) تعود بحالة 200
    // مع ok:false و code — تماماً كما تعيد Supabase أخطاءها في نص الاستجابة.
    const isDomainError = Boolean(err.code);
    return NextResponse.json(
      {
        ok: false,
        code: err.code,
        error: err.message || "حدث خطأ غير متوقع.",
      },
      { status: isDomainError ? 200 : 500 }
    );
  }
}
