#!/usr/bin/env python3
"""
ImIn | سكريبت ترجمة live-attendance.tsx و session-control.tsx إلى t()
كل استبدال يُتحقق منه — أي استبدال فاشل يُطبع للمعالجة اليدوية.
"""
import re

FILES = {
    "src/components/professor/live-attendance.tsx": [
        # 1) الاستيراد
        ('import { formatTime, relativeTime } from "@/lib/format";',
         'import { formatTime, relativeTime } from "@/lib/format";\nimport { useI18n, attendanceStatusLabel } from "@/lib/i18n";'),
        # 2) الخطاف
        ('  const [viewing, setViewing] = React.useState<AppUser | null>(null);',
         '  const { t, locale } = useI18n();\n  const [viewing, setViewing] = React.useState<AppUser | null>(null);'),
        # CSV
        ('      "الاسم الكامل,البريد الجامعي,الرقم الجامعي,وقت تسجيل الحضور,عدد الحضور,عدد الغياب,عدد الإنذارات,الحالة";',
         '      t("professor.csvHeaders");'),
        ('        const time = new Date(row.created_at).toLocaleString("ar-EG-u-nu-latn");',
         '        const time = new Date(row.created_at).toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB");'),
        ('          time,\n          String(attended),',
         '          time,\n          attendanceStatusLabel(locale, row.status ?? "present"),\n          String(attended),'),
        ('          blocked ? "محظور" : "نشط",',
         '          blocked ? t("professor.csvStatusBlocked") : t("professor.csvStatusActive"),'),
        # statusLabel
        ('      ? "متصل مباشرة"', '      ? t("professor.statLiveOpen")'),
        ('        ? "جارٍ الاتصال..."', '        ? t("professor.statLiveConnecting")'),
        ('          ? "تعذر الاتصال اللحظي"', '          ? t("professor.statLiveError")'),
        ('          : "غير متصل";', '          : t("professor.statLiveOffline");'),
        # الرأس
        ('aria-label="قائمة الحضور"', 'aria-label={t("professor.liveTitle")}'),
        ('          {isLiveSession ? "الحضور اللحظي" : "حضور آخر جلسة"}',
         '          {isLiveSession ? t("professor.liveTitle") : t("professor.liveTitleClosed")}'),
        ('              title={`حالة الاتصال اللحظي: ${statusLabel}`}',
         '              title={t("professor.connectionStatusAria", { status: statusLabel })}'),
        ('            aria-label="تصدير سجل الحضور بصيغة CSV"',
         '            aria-label={t("professor.exportCsvAria")}'),
        ('            title="تصدير CSV (يفتح في Excel)"',
         '            title={t("professor.exportCsvTitle")}'),
        ('            تصدير CSV', '            {t("professor.exportCsv")}'),
        # البحث والفراغات
        ('placeholder="ابحث بالاسم أو الرقم الجامعي أو البريد..."',
         'placeholder={t("professor.searchPlaceholder")}'),
        ('aria-label="البحث في قائمة الحضور"', 'aria-label={t("professor.searchAria")}'),
        ('aria-label="جارٍ تحميل قائمة الحضور"', 'aria-label={t("professor.loadingList")}'),
        ('aria-label="لا يوجد حضور بعد"', 'aria-label={t("professor.emptyLive")}'),
        ('              ? "لم يسجّل أحد حضوره بعد"', '              ? t("professor.emptyLive")'),
        ('              : "لا حضور مسجّل في آخر جلسة"}', '              : t("professor.emptyClosed")}'),
        ('                ? "ستظهر أسماء الطلاب هنا تلقائياً ولحظياً بمجرد تسجيلهم الحضور من داخل النطاق."',
         '                ? t("professor.emptyLiveHint")'),
        ('                : "ابدأ جلسة جديدة وسيوثّق الطلاب حضورهم فيها."}',
         '                : t("professor.emptyClosedHint")}'),
        ('          aria-label="لا نتائج مطابقة للبحث"', '          aria-label={t("professor.noSearchResults")}'),
        ('                لا نتائج مطابقة لـ«{query.trim()}»',
         '                {t("professor.noSearchResults", { query: query.trim() })}'),
        ('                مسح البحث وعرض الكل', '                {t("professor.clearSearch")}'),
        # المحظورون
        ('          الطلاب المحظورون (مفصولون من المادة)', '          {t("professor.blockedSection")}'),
        ('              {profilesById[studentId]?.full_name ?? "طالب"}',
         '              {profilesById[studentId]?.full_name ?? t("common.student")}'),
        ('title="فك الحظر والسماح بالحضور مجدداً"', 'title={t("professor.unblockHint")}'),
        ('aria-label="فك الحظر"', 'aria-label={t("professor.unblockAria")}'),
        # بطاقة الطالب في الصف
        ('                  title={profile ? "عرض ملف الطالب وصوره كاملة" : undefined}',
         '                  title={profile ? t("professor.viewProfileHint") : undefined}'),
        ('                    ? `عرض ملف الطالب ${row.student_name}`',
         '                    ? t("professor.viewProfileAria", { name: row.student_name })'),
        ('                              محظور\n', '                              {t("professor.blockedLabel")}\n'),
        # وقت التسجيل + شارة الحالة
        ('''                        <span className="text-sm font-black tabular-nums text-foreground">
                          {formatTime(row.created_at)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {relativeTime(row.created_at, now)}
                        </span>''',
         '''                        <span className="text-sm font-black tabular-nums text-foreground">
                          {formatTime(row.check_in_time ?? row.created_at, locale)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {relativeTime(row.created_at, now, locale)}
                        </span>
                        <span
                          className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            (row.status ?? "present") === "present"
                              ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {attendanceStatusLabel(locale, row.status ?? "present")}
                        </span>'''),
        # الإحصائيات والأزرار
        ('                        حضور\n                        <span className="tabular-nums">{attended}</span>',
         '                        {t("professor.attendedLabel")}\n                        <span className="tabular-nums">{attended}</span>'),
        ('                        غياب\n                        <span className="tabular-nums">{absences}</span>',
         '                        {t("professor.absencesLabel")}\n                        <span className="tabular-nums">{absences}</span>'),
        ('                        إنذار\n                        <span className="tabular-nums">{warnings}</span>',
         '                        {t("professor.warningsLabel")}\n                        <span className="tabular-nums">{warnings}</span>'),
        ('                        title="تسجيل إنذار على هذا الطالب"',
         '                        title={t("professor.warnHint")}'),
        ('                        إنذار\n                      </button>',
         '                        {t("professor.warnBtn")}\n                      </button>'),
        ('                            ? "فك الحظر — سيستطيع تسجيل الحضور مجدداً"',
         '                            ? t("professor.unblockHintLong")'),
        ('                            : "بلوك — لن يستطيع تسجيل الحضور في جلساتك (فصل من المادة)"',
         '                            : t("professor.blockHintLong")'),
        ('                            فك الحظر\n', '                            {t("professor.unblockBtn")}\n'),
        ('                            بلوك\n', '                            {t("professor.blockBtn")}\n'),
        # نافذة الملف
        ('                <DialogTitle>ملف الطالب</DialogTitle>',
         '                <DialogTitle>{t("professor.profileTitle")}</DialogTitle>'),
        ('                  البيانات والصور كما رفعها الطالب عند إنشاء حسابه',
         '                  {t("professor.profileNote")}'),
        ('                        الصورة الشخصية\n                      </p>',
         '                        {t("professor.personalPhoto")}\n                      </p>'),
        ('                        alt={`صورة شخصية لـ ${viewing.full_name}`}',
         '                        alt={t("professor.personalPhotoOf", { name: viewing.full_name })}'),
        ('                          البطاقة — الوش\n                        </p>',
         '                          {t("professor.idFront")}\n                        </p>'),
        ('                          alt={`بطاقة ${viewing.full_name} — الوجه الأمامي`}',
         '                          alt={t("idCard.idFrontOf", { name: viewing.full_name })}'),
        ('                          البطاقة — الظهر\n                        </p>',
         '                          {t("professor.idBack")}\n                        </p>'),
        ('                          alt={`بطاقة ${viewing.full_name} — الوجه الخلفي`}',
         '                          alt={t("idCard.idBackOf", { name: viewing.full_name })}'),
        ('                  لا توجد صور مرفوعة لهذا الطالب', '                  {t("professor.noPhotos")}'),
        ('حضور {viewingStats.attended}', '{t("professor.attendedLabel")} {viewingStats.attended}'),
        ('غياب {viewingStats.absences}', '{t("professor.absencesLabel")} {viewingStats.absences}'),
        ('إنذار {viewingStats.warnings}', '{t("professor.warningsLabel")} {viewingStats.warnings}'),
    ],
    "src/components/professor/session-control.tsx": [
        # 1) الاستيراد
        ('import { formatDurationClock, formatTime, relativeTime } from "@/lib/format";',
         'import { formatDurationClock, formatTime, relativeTime } from "@/lib/format";\nimport { useI18n } from "@/lib/i18n";'),
        # 2) الرسائل داخل المعالجات
        ('"تم تحديد موقع القاعة — اضغط «فتح الجلسة الآن» بالأسفل"',
         't("professor.gpsCapturedToast")'),
        ('? "تم رفض الإذن بالوصول إلى الموقع. اسمح به من أيقونة القفل/الموقع في شريط عنوان المتصفح ثم أعد المحاولة — أو أدخل إحداثيات القاعة يدوياً من الأسفل."',
         '? t("professor.gpsPermissionDenied")'),
        ('"اكتب الإحداثيات بصيغة: 30.05955, 31.32850 (خط العرض ثم خط الطول) — يمكنك نسخها من خرائط جوجل بالضغط المطوّل على موقع القاعة."',
         't("professor.coordsHelp")'),
        ('"تم اعتماد الموقع المُدخل يدوياً — اضغط «فتح الجلسة الآن» بالأسفل"',
         't("professor.manualAdoptedToast")'),
        # الرأس والحالات
        ('aria-label="التحكم بجلسة الحضور"', 'aria-label={t("professor.controlTitle")}'),
        ('          التحكم بالجلسة', '          {t("professor.controlTitle")}'),
        ('{sessionOpen ? "مفتوحة الآن" : "منتهية"}',
         '{sessionOpen ? t("professor.controlOpen") : t("professor.controlClosed")}'),
        ('طالب حاضر بآخر جلسة', '{t("professor.statPresent")}'),
        ('لا جلسة مفتوحة', '{t("professor.statNoSession")}'),
        ('الجلسة مفتوحة — الطلاب داخل النطاق يسجّلون حضورهم الآن',
         '{t("professor.controlOpenNote")}'),
        ('فُتحت {formatTime(session.created_at)} ({relativeTime(session.created_at, now)})',
         '{t("professor.controlOpenedAt", { time: formatTime(session.created_at, locale), relative: relativeTime(session.created_at, now, locale) })}'),
        ('              مدة الجلسة حتى الآن', '              {t("professor.liveTimerLabel")}'),
        ('              المسجّلون', '              {t("professor.registeredLabel")}'),
        ('              النطاق المسموح (كما حددته)', '              {t("professor.allowedRange")}'),
        ('              {session.radius} م', '              {session.radius} {t("common.metersShort")}'),
        ('              إحداثيات القاعة', '              {t("professor.hallCoords")}'),
        ('              عرض موقع الجلسة على الخريطة', '              {t("professor.viewOnMap")}'),
        # تأكيد القفل
        ('قفل الجلسة الآن؟ لن يستطيع أي طالب تسجيل الحضور بعدها — سيظهر له',
         '{t("professor.closeConfirmMsg")}'),
        ('«الجلسة غير متاحة».', ''),
        ('                نعم، اقفل الجلسة', '                {t("professor.closeConfirmYes")}'),
        ('              قفل الجلسة الآن', '              {t("professor.closeNow")}'),
        ('            إلغاء', '            {t("professor.cancel")}'),
        # ملخص آخر جلسة
        ('آخر جلسة لك انتهت{" "}', '{t("professor.lastSessionEnded")}{" "}'),
        ('ووثّقت حضور{" "}', '{t("professor.lastSessionDocumented")}{" "}'),
        ('<span className="font-black text-primary tabular-nums">{presentCount}</span> طالباً.',
         '<span className="font-black text-primary tabular-nums">{presentCount}</span> {t("professor.lastSessionStudents")}'),
        # فتح جلسة جديدة
        ('{session ? "فتح جلسة حضور جديدة" : "فتح جلسة حضور جديدة"}',
         '{t("professor.openNewSession")}'),
        ('اضبط تفاصيل الجلسة من الأعلى ثم حدد موقع القاعة — الطلاب داخل',
         '{t("professor.setupHint")}'),
        ('النطاق فقط يستطيعون تسجيل الحضور.', ''),
        # المادة
        ('                  اسم المادة / المحاضرة', '                  {t("professor.subjectLabel")}'),
        ('                  (من مادتك المسجلة — قابل للتعديل)',
         '                  {t("professor.subjectAutoNote")}'),
        ('placeholder={defaultSubject ?? "مثال: قواعد بيانات — الأسبوع 5"}',
         'placeholder={defaultSubject ?? t("professor.subjectPlaceholder")}'),
        ('aria-label="اسم المادة أو المحاضرة"', 'aria-label={t("professor.subjectAria")}'),
        ('اسم مادتك المسجلة عند إنشاء الحساب — سيظهر لطلابك عند تسجيل الحضور',
         '{t("professor.subjectNote")}'),
        # النطاق
        ('                  نطاق الحضور (عدد الأمتار)', '                  {t("professor.radiusLabel")}'),
        ('                  أنت من يحدد النطاق', '                  {t("professor.radiusYouSet")}'),
        ('aria-label="عدد الأمتار المسموح بها للتسجيل"',
         'aria-label={t("professor.radiusAria")}'),
        ('<span className="text-base font-extrabold text-muted-foreground">متر</span>',
         '<span className="text-base font-extrabold text-muted-foreground">{t("common.meters")}</span>'),
        ('aria-label="تحديد نطاق الجلسة بالأمتار"',
         'aria-label={t("professor.radiusSliderAria")}'),
        ('                    {preset} م', '                    {preset} {t("common.metersShort")}'),
        ('لن يستطيع أي طالب تسجيل حضوره إلا إذا كان داخل دائرة',
         '{t("professor.radiusIntro")}'),
        ('{radius} متر', '{radius} {t("common.meters")}'),
        ('حول موقع القاعة — اكتب العدد مباشرة أو حرّك الشريط أو اختر قيمة سريعة',
         '{t("professor.radiusHelp2")}'),
        ('من {RADIUS_MIN} إلى {RADIUS_MAX} متر',
         '{t("professor.radiusMinMax", { min: RADIUS_MIN, max: RADIUS_MAX })}'),
        # الموقع
        ('                  موقع القاعة', '                  {t("professor.hallLocation")}'),
        ('الدقة ±{Math.round(draft.accuracy)} م',
         '{t("professor.gpsAccuracy", { meters: Math.round(draft.accuracy) })}'),
        ('                  إعادة تحديد الموقع عبر GPS', '                  {t("professor.relocateGps")}'),
        ('{manualMode ? "إخفاء الإدخال اليدوي" : "تعديل الإحداثيات يدوياً"}',
         '{manualMode ? t("professor.hideManual") : t("professor.manualEdit")}'),
        ('التقط موقعك تلقائياً عبر GPS — أو أدخل إحداثيات القاعة يدوياً إن تعذر GPS.',
         '{t("professor.gpsHint")}'),
        ('{manualMode ? "إخفاء الإدخال اليدوي" : "إدخال إحداثيات القاعة يدوياً بدلاً من GPS"}',
         '{manualMode ? t("professor.hideManual") : t("professor.showManual")}'),
        ('                    جارٍ التقاط موقعك الحالي...', '                    {t("professor.locatingGps")}'),
        ('{geoError ? "إعادة محاولة تحديد موقعي (GPS)" : "تحديد موقع القاعة تلقائياً (GPS)"}',
         '{geoError ? t("professor.retryGps") : t("professor.captureGps")}'),
        ('                  إحداثيات القاعة (خط العرض، خط الطول)',
         '                  {t("professor.coordsLabel")}'),
        ('placeholder="30.05955, 31.32850"', 'placeholder={t("professor.coordsPlaceholder")}'),
        ('انسخ الإحداثيات من خرائط جوجل (اضغط مطوّلاً على موقع القاعة ثم انسخ الرقمين)',
         '{t("professor.coordsHelp")}'),
        ('والصقها هنا كما هي.', ''),
        ('                    اعتماد هذا الموقع', '                    {t("professor.adoptLocation")}'),
        ('                    جارٍ فتح الجلسة...', '                    {t("professor.openingSession")}'),
        ('"حدّد موقع القاعة أولاً لتفعيل الزر"', 't("professor.needLocationFirst")'),
        ('فتح الجلسة الآن — نطاق {radius} متر', 't("professor.openNowBtn", { radius })'),
        ('                الزر يتفعّل بعد تحديد موقع القاعة (GPS أو إدخال يدوي)',
         '                {t("professor.openBtnHint")}'),
        ('aria-label="فتح جلسة الحضور الآن"', 'aria-label={t("professor.openNewSession")}'),
        # تنسيقات مع locale
        ('{formatTime(session.created_at)}', '{formatTime(session.created_at, locale)}'),
        ('{relativeTime(session.created_at, now)}', '{relativeTime(session.created_at, now, locale)}'),
    ],
}

for path, pairs in FILES.items():
    with open(path, encoding="utf-8") as fh:
        content = fh.read()

    # إدراج الخطاف بعد فتح مكوّن SessionControl مباشرة
    if "useI18n()" not in content and "session-control" in path:
        match = re.search(r"(export function SessionControl\([^)]*\)\s*\{\n)", content)
        if match:
            content = content.replace(
                match.group(1),
                match.group(1) + "  const { t, locale } = useI18n();\n",
                1,
            )
            print(f"[HOOK] {path}: inserted useI18n hook")
        else:
            print(f"[HOOK-FAILED] {path}: SessionControl opening not matched!")

    failed = []
    applied = 0
    for old, new in pairs:
        if old in content:
            content = content.replace(old, new, 1)
            applied += 1
        else:
            failed.append(old[:90])

    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)

    print(f"[OK] {path}: {applied}/{len(pairs)} replacements applied")
    if failed:
        print(f"[FAILED] {path}:")
        for item in failed:
            print(f"   - {item}")

# فحص ما تبقى من نصوص عربية في الملفين
import io
for path in FILES:
    with open(path, encoding="utf-8") as fh:
        for i, line in enumerate(fh, 1):
            s = line.rstrip()
            if re.search(r"[\u0600-\u06FF]", s) and not s.strip().startswith(("*", "/*", "//", "*/", " *")):
                # تعليقات فقط تُهمل إن كانت داخل بلوك تعليق
                print(f"REMAIN {path}:{i}: {s.strip()[:120]}")
print("DONE")
