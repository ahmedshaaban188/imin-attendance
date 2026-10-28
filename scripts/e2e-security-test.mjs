/**
 * ImIn | اختبار حتمي شامل لسير Device ID + التحقق الجغرافي الخادمي
 * يشغَّل ضد السيرفر الحي على localhost:3000 عبر /api/demo
 * يعيد ربط جهاز الطالب الأصلي في النهاية (لا يترك أثراً على البيانات)
 */
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000/api/demo";
const db = JSON.parse(readFileSync("/home/z/my-project/data/imin-demo.json", "utf8"));

const student = db.users.find((u) => u.email === "ahmed.126630@mgt.mti.edu.eg");
const STUDENT = { email: student.email, university_id: student.university_id };
const ORIG_DEVICE = student.device_id; // الجهاز المرتبط حالياً
const PROF = { email: "126630@mgt.mti.edu.eg", university_id: "12345678", access_code: "IMIN-ADMIN-2026" };

async function call(action, payload) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json();
}

let pass = 0;
let failCount = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failCount++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}

async function approveDevice(deviceId) {
  const r = await call("login", { ...PROF, device_id: "prof-device-ccc" });
  const profId = r.data?.id;
  const rr = await call("device-requests", {});
  const req = (rr.data || []).find((q) => q.device_id === deviceId);
  if (!req) return false;
  const res = await call("resolve-device-request", {
    professor_id: profId,
    request_id: req.id,
    approve: true,
  });
  return res.ok === true;
}

console.log("\n═══ [A] دخول الطالب من جهازه المرتبط ═══");
let r = await call("login", { ...STUDENT, device_id: ORIG_DEVICE });
check("الدخول من الجهاز المرتبط ينجح ويعيد بيانات الطالب", r.ok === true && Boolean(r.data?.id), r);

console.log("\n═══ [B] دخول من جهاز مختلف → DEVICE_MISMATCH ═══");
r = await call("login", { ...STUDENT, device_id: "intruder-device-bbb" });
check("الرفض برمز DEVICE_MISMATCH", r.ok === false && r.code === "DEVICE_MISMATCH", r);
check("الرسالة تطلب موافقة الدكتور", (r.error || "").includes("الدكتور"), r.error);

console.log("\n═══ [C] طلب ربط الجهاز الجديد ═══");
r = await call("request-device-transfer", {
  email: STUDENT.email,
  university_id: STUDENT.university_id,
  device_id: "intruder-device-bbb",
});
check("إنشاء الطلب ينجح", r.ok === true && r.data?.ok === true, r);

r = await call("request-device-transfer", {
  email: STUDENT.email,
  university_id: STUDENT.university_id,
  device_id: "intruder-device-bbb",
});
check("الطلب المكرر يعيد pending", r.data?.pending === true, r);

console.log("\n═══ [D] الدكتور يشوف الطلب ويوافق ═══");
r = await call("login", { ...PROF, device_id: "prof-device-ccc" });
const profId = r.data?.id;
check("دخول الدكتور بالكود الإداري ينجح", r.ok === true && r.data?.role === "professor", r);

r = await call("device-requests", {});
const requests = r.data || [];
const mine = requests.find((q) => q.device_id === "intruder-device-bbb");
check("الطلب ظهر في قائمة الدكتور", Boolean(mine), requests.length);

if (mine) {
  r = await call("resolve-device-request", {
    professor_id: profId,
    request_id: mine.id,
    approve: true,
  });
  check("الموافقة تنجح", r.ok === true, r);

  console.log("\n═══ [E] بعد الموافقة: الجهاز الجديد يدخل والقديم يُرفض ═══");
  r = await call("login", { ...STUDENT, device_id: "intruder-device-bbb" });
  check("الجهاز الجديد يدخل الآن", r.ok === true && Boolean(r.data?.id), r);
  r = await call("login", { ...STUDENT, device_id: ORIG_DEVICE });
  check("الجهاز القديم يُرفض الآن", r.ok === false && r.code === "DEVICE_MISMATCH", r);

  // استرجاع: طلب ربط الجهاز الأصلي مرة أخرى
  await call("request-device-transfer", {
    email: STUDENT.email,
    university_id: STUDENT.university_id,
    device_id: ORIG_DEVICE,
  });
  const restored = await approveDevice(ORIG_DEVICE);
  check("استرجاع ربط الجهاز الأصلي بعد الاختبار", restored);
}

console.log("\n═══ [F] التحقق الجغرافي الخادمي للحضور ═══");
const open = db.sessions.find((s) => s.is_open);
check("توجد جلسة مفتوحة للاختبار", Boolean(open));

r = await call("login", { ...STUDENT, device_id: ORIG_DEVICE });
const studentId = r.data?.id;

// 1) بدون إحداثيات
r = await call("check-in", { session_id: open.id, student_id: studentId });
check("رفض حضور بدون إحداثيات (GEO_REQUIRED)", r.ok === false && r.code === "GEO_REQUIRED", r);

// 2) إحداثيات بعيدة (+0.01 درجة ≈ 1.1 كم)
r = await call("check-in", {
  session_id: open.id,
  student_id: studentId,
  lat: Number(open.lat) + 0.01,
  lng: Number(open.lng),
  accuracy: 10,
});
check("رفض حضور خارج النطاق (OUT_OF_RANGE)", r.ok === false && r.code === "OUT_OF_RANGE", r);
check("الرسالة تذكر المسافة بالمتر", (r.error || "").includes("متر"), r.error);

// 3) من داخل النطاق → نجاح أو مكرر 23505 (إن سجّل الطالب حضوره قبل الاختبار)
r = await call("check-in", {
  session_id: open.id,
  student_id: studentId,
  lat: Number(open.lat),
  lng: Number(open.lng),
  accuracy: 10,
});
check(
  "حضور من داخل النطاق ينجح (أو مكرر 23505)",
  r.ok === true || (r.ok === false && r.code === "23505"),
  r
);

// 4) ثغرة محتملة: accuracy ضخمة تحاول توسيع السماحية فوق 20م
r = await call("check-in", {
  session_id: open.id,
  student_id: studentId,
  lat: Number(open.lat) + 0.001, // ≈ 111م خارج المركز
  lng: Number(open.lng),
  accuracy: 5000,
});
check("دقة ضخمة لا توسّع النطاق (يُرفض إن تجاوز الحد)", r.ok === false, r.code);

console.log(`\n═══ النتيجة: ${pass} ناجح / ${failCount} فاشل ═══`);
process.exit(failCount > 0 ? 1 : 0);
