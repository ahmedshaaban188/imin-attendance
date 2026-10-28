/**
 * ImIn | سكربت تدقيق شامل (audit) — يشغَّل بـ tsx ولا يعدّل أي ملف
 * 1) مقارنة مفاتيح قاموسي i18n-ar / i18n-en (ناقص/زائد)
 * 2) استخراج كل t("...") المستخدمة في المكونات ومطابقتها مع القاموسين
 * 3) البحث عن console.log / debugger متبقية في src/
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "/home/z/my-project/src";

/* ---------- 1) قراءة القاموسين وتسطيح المفاتيح ---------- */
async function loadDict(file: string): Promise<Set<string>> {
  const mod = await import(file);
  let dict = (mod.default ?? mod) as Record<string, unknown>;
  // القاموس ملفوف بمفتاح اللغة (ar/en) — انزل داخله
  const rootKeys = Object.keys(dict);
  if (rootKeys.length === 1 && (rootKeys[0] === "ar" || rootKeys[0] === "en")) {
    dict = dict[rootKeys[0]] as Record<string, unknown>;
  }
  const keys = new Set<string>();
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") walk(v as Record<string, unknown>, full);
      else keys.add(full);
    }
  };
  walk(dict, "");
  return keys;
}

const ar = await loadDict("/home/z/my-project/src/lib/i18n-ar.ts");
const en = await loadDict("/home/z/my-project/src/lib/i18n-en.ts");

const onlyInAr = [...ar].filter((k) => !en.has(k));
const onlyInEn = [...en].filter((k) => !ar.has(k));
console.log(`\n=== [1] مقارنة القاموسين (ar=${ar.size} / en=${en.size}) ===`);
console.log(`مفاتيح في العربي فقط (${onlyInAr.length}):`);
onlyInAr.forEach((k) => console.log(`  - ${k}`));
console.log(`مفاتيح في الإنجليزي فقط (${onlyInEn.length}):`);
onlyInEn.forEach((k) => console.log(`  - ${k}`));

/* ---------- 2) جمع استدعاءات t() من كل المكونات ---------- */
const exts = [".tsx", ".ts"];
const files: string[] = [];
(function collect(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collect(p);
    else if (exts.some((e) => name.endsWith(e))) files.push(p);
  }
})(SRC);

// أنماط: t("key") | t('key') | t(`key`) | geoErrorMessage(...) لا (نلتزم بـ t فقط)
const used = new Map<string, string[]>(); // key -> files
let dynamicKeys = 0;
for (const f of files) {
  if (f.includes("i18n-ar") || f.includes("i18n-en")) continue;
  const text = readFileSync(f, "utf8");
  // t("common.x") مع تجاهل السلاسل التي فيها ${ (ديناميكية)
  const re = /\bt\(\s*(["'`])([^"'`\n]+?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const key = m[2];
    if (key.includes("${")) { dynamicKeys++; continue; }
    if (!used.has(key)) used.set(key, []);
    used.get(key)!.push(f.split("/src/")[1]);
  }
}

console.log(`\n=== [2] مفاتيح t() المستخدمة في الكود (${used.size}) — الديناميكية: ${dynamicKeys} ===`);
const missingInAr: string[] = [];
const missingInEn: string[] = [];
const dynamicPrefixes: string[] = [];
for (const key of used.keys()) {
  // مفاتيح ديناميكية معروفة (status_x / device_transfer_x) نتعامل معها بالبادئة
  if (/^(student|professor)\./.test(key) === false && /^[a-z]+$/i.test(key) && !key.includes(".")) {
    // مفتاح بلا نقطة غالباً متغير — تجاهل
    continue;
  }
  if (!ar.has(key) && !key.includes("${")) {
    // جرّب بادئة حالة ديناميكية مثل status_warning
    missingInAr.push(key);
  }
  if (!en.has(key) && !key.includes("${")) {
    missingInEn.push(key);
  }
}
console.log(`مستخدمة ومفقودة من العربي (${missingInAr.length}):`);
missingInAr.forEach((k) => console.log(`  - ${k}  ←  ${[...new Set(used.get(k))].join(", ")}`));
console.log(`مستخدمة ومفقودة من الإنجليزي (${missingInEn.length}):`);
missingInEn.forEach((k) => console.log(`  - ${k}  ←  ${[...new Set(used.get(k))].join(", ")}`));

/* ---------- 3) بقايا تطوير ---------- */
console.log(`\n=== [3] بقايا تطوير في src/ ===`);
const junk: string[] = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (/console\.(log|debug)\(/.test(line) && !f.includes("node_modules")) {
      junk.push(`${f.split("/src/")[1]}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
    if (/\bdebugger\b/.test(line)) {
      junk.push(`${f.split("/src/")[1]}:${i + 1}  DEBUGGER`);
    }
    if (/TODO|FIXME|XXX|HACK/.test(line)) {
      junk.push(`${f.split("/src/")[1]}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}
console.log(junk.length ? junk.join("\n") : "لا شيء ✓");

/* ---------- 4) نصوص hardcoded داخل JSX (عربي أو إنجليزي طويل) ---------- */
console.log(`\n=== [4] نصوص hardcoded في JSX (بدون t()) ===`);
const hardcoded: string[] = [];
for (const f of files) {
  if (f.includes("i18n") || f.includes("/ui/")) continue; // مكونات shadcn فيها نصوص قياسية
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // نص عربي مباشر داخل JSX خارج i18n
    if (/[\u0600-\u06FF]{4,}/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line.trim())) {
      hardcoded.push(`${f.split("/src/")[1]}:${i + 1}  ${line.trim().slice(0, 80)}`);
    }
  });
}
console.log(hardcoded.length ? hardcoded.join("\n") : "لا شيء ✓");
console.log("\n=== انتهى التدقيق ===");
