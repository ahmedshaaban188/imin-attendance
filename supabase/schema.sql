-- ============================================================================
--  ImIn | نظام الحضور الجامعي الذكي — ملف إعداد قاعدة بيانات Supabase
-- ============================================================================
--
--  خطوات التشغيل (دقيقتان):
--  1) أنشئ مشروعاً مجانياً على https://supabase.com
--  2) افتح:  SQL Editor  ->  New query
--  3) الصق هذا الملف كاملاً واضغط  RUN
--  4) من: Project Settings -> API  انسخ  Project URL  و  anon public key
--     وضعهما في ملف src/lib/supabaseClient.js داخل مشروع Next.js
--
--  هذا الملف "آمن للتشغيل المتكرر" (idempotent) — لن يكرر الجداول أو السياسات.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) الإضافة المطلوبة لتوليد UUID تلقائياً
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- (2) جدول المستخدمين (users)
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  email              text unique not null,
  university_id      text not null,
  role               text not null check (role in ('student', 'professor')),
  id_card_url        text,
  id_card_back_url   text,
  personal_photo_url text,
  subject            text,
  status             text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  email_verified     boolean not null default true,
  otp_code           text,
  otp_expires_at     timestamptz,
  device_id          text,
  device_linked_at   timestamptz,
  -- كلمة المرور (مضافة في تحديث الأمان):
  -- تُحسب في المتصفح بصيغة v1$iterations$hash مع ملح فريد لكل مستخدم
  -- ولا تُخزَّن كلمة المرور الأصلية في أي مكان إطلاقاً
  password_hash      text,
  password_salt      text,
  created_at         timestamptz not null default now()
);

-- ترحيل آمن للحسابات القديمة (إن وُجد جدول من نسخة سابقة بدون أعمدة كلمة المرور)
alter table public.users add column if not exists password_hash text;
alter table public.users add column if not exists password_salt text;

comment on table public.users is 'ImIn: مستخدمو النظام (طلاب ودكاترة)';
comment on column public.users.id_card_url        is 'ImIn: صورة البطاقة — الوجه الأمامي (للطلاب)';
comment on column public.users.id_card_back_url   is 'ImIn: صورة البطاقة — الوجه الخلفي/الظهر (للطلاب)';
comment on column public.users.personal_photo_url is 'ImIn: صورة شخصية (للطلاب والدكاترة)';
comment on column public.users.subject        is 'ImIn: المادة التي يدرّسها الدكتور — تُعبّأ تلقائياً في جلساته';
comment on column public.users.status         is 'ImIn: حالة الحساب — الطالب الجديد «pending» حتى موافقة الدكتور';
comment on column public.users.email_verified is 'ImIn: تأكيد بريد الدكتور عبر رمز OTP';
comment on column public.users.otp_code       is 'ImIn: رمز التحقق الحالي (يُفرّغ بعد التأكيد) — مؤقتاً بلا خدمة بريد';
comment on column public.users.otp_expires_at is 'ImIn: انتهاء صلاحية رمز التحقق (10 دقائق)';
comment on column public.users.device_id       is 'ImIn: الجهاز المرتبط بالحساب — حماية من مشاركة بيانات الدخول';
comment on column public.users.device_linked_at is 'ImIn: متى رُبط الحساب بهذا الجهاز (آخر ربط)';

-- ترقية آمنة للمشاريع القائمة بالفعل: إضافة أعمدة الصور الإضافية إن لم تكن موجودة
-- (الطالب: بطاقة وش + ظهر + صورة شخصية — الدكتور: صورة شخصية)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'id_card_back_url'
  ) then
    alter table public.users add column id_card_back_url text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'personal_photo_url'
  ) then
    alter table public.users add column personal_photo_url text;
  end if;

  -- عمود المادة + حالة الحساب + تأكيد البريد ورمز OTP (طلبات الموافقة وتفعيل الدكاترة)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'subject'
  ) then
    alter table public.users add column subject text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'status'
  ) then
    alter table public.users add column status text not null default 'approved';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'email_verified'
  ) then
    alter table public.users add column email_verified boolean not null default true;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'otp_code'
  ) then
    alter table public.users add column otp_code text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'otp_expires_at'
  ) then
    alter table public.users add column otp_expires_at timestamptz;
  end if;

  -- ربط الحساب بالجهاز (حماية مشاركة الحسابات)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'device_id'
  ) then
    alter table public.users add column device_id text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'device_linked_at'
  ) then
    alter table public.users add column device_linked_at timestamptz;
  end if;
end $$;

-- قيد حالة الحساب للمشاريع القائمة (آمن للتكرار)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_status_check'
  ) then
    alter table public.users add constraint users_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists idx_users_status on public.users (status);
create index if not exists idx_users_device_id on public.users (device_id);

-- ----------------------------------------------------------------------------
-- (2-b) جدول طلبات ربط جهاز جديد (device_requests)
-- ----------------------------------------------------------------------------
create table if not exists public.device_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  device_id  text not null,
  created_at timestamptz not null default now()
);

comment on table public.device_requests is 'ImIn: طلبات ربط جهاز جديد بحساب طالب — يقرر فيها الدكتور';
comment on column public.device_requests.user_id is 'ImIn: الطالب صاحب الحساب';
comment on column public.device_requests.device_id is 'ImIn: الجهاز الجديد المطلوب ربطه';

-- طلب واحد معلّق لكل (طالب + جهاز) — يمنع تكرار نفس الطلب
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'device_requests_user_device_unique'
  ) then
    alter table public.device_requests
      add constraint device_requests_user_device_unique unique (user_id, device_id);
  end if;
end $$;

create index if not exists idx_device_requests_user on public.device_requests (user_id);

-- ----------------------------------------------------------------------------
-- (2-c) قرار الدكتور في طلب ربط جهاز (RPC) — الموافقة تنقل الحساب للجهاز الجديد
-- ----------------------------------------------------------------------------
create or replace function public.resolve_device_request(
  p_professor_id uuid,
  p_request_id   uuid,
  p_approve      boolean
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_request  public.device_requests%ROWTYPE;
  v_student  public.users%ROWTYPE;
begin
  -- التحقق: القرار من حساب دكتور فقط
  if not exists (
    select 1 from public.users
    where id = p_professor_id and role = 'professor'
  ) then
    raise exception 'FORBIDDEN: professor account required';
  end if;

  select * into v_request from public.device_requests where id = p_request_id;
  if not found then
    raise exception 'NOT_FOUND: request not found';
  end if;

  select * into v_student from public.users where id = v_request.user_id;

  if p_approve and v_student.id is not null then
    update public.users
       set device_id = v_request.device_id,
           device_linked_at = now()
     where id = v_request.user_id;
  end if;

  -- حذف كل طلبات هذا الطالب (حُسم الأمر)
  delete from public.device_requests where user_id = v_request.user_id;

  -- إشعار الطالب بالقرار
  insert into public.notifications (user_id, type, params, read, created_at)
  values (
    v_request.user_id,
    case when p_approve then 'device_transfer_approved' else 'device_transfer_rejected' end,
    '{}'::jsonb,
    false,
    now()
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- (3) جدول الجلسات (sessions)
-- ----------------------------------------------------------------------------
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.users (id) on delete cascade,
  subject      text,
  lat          numeric not null,
  lng          numeric not null,
  radius       integer not null default 50,
  is_open      boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table public.sessions is 'ImIn: جلسات الحضور التي يفتحها الدكاترة بإحداثيات GPS';
comment on column public.sessions.subject is 'ImIn: اسم المادة/المحاضرة (اختياري — يظهر للطلاب وفي سجل الحضور)';

-- ترقية آمنة للمشاريع القائمة بالفعل: إضافة عمود subject إن لم يكن موجوداً
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions' and column_name = 'subject'
  ) then
    alter table public.sessions add column subject text;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (4) جدول الحضور (attendance)
-- ----------------------------------------------------------------------------
create table if not exists public.attendance (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions (id) on delete cascade,
  student_id    uuid not null references public.users (id) on delete cascade,
  student_name  text not null,
  university_id text not null,
  created_at    timestamptz not null default now()
);

comment on table public.attendance is 'ImIn: سجلات حضور الطلاب في الجلسات';

-- قيد فريد: لا يمكن للطالب تسجيل حضوره مرتين في نفس الجلسة
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_session_student_unique'
  ) then
    alter table public.attendance
      add constraint attendance_session_student_unique unique (session_id, student_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (5) فهارس لتسريع الاستعلامات
-- ----------------------------------------------------------------------------
create index if not exists idx_sessions_professor on public.sessions (professor_id);
create index if not exists idx_sessions_open      on public.sessions (is_open);
create index if not exists idx_attendance_session on public.attendance (session_id);
create index if not exists idx_attendance_student on public.attendance (student_id);
create index if not exists idx_users_university_id on public.users (university_id);

-- ----------------------------------------------------------------------------
-- (6) تفعيل البث اللحظي (Realtime) على جدولي attendance و sessions
--     - attendance: ليظهر الحضور أمام الدكتور لحظة بلحظة
--     - sessions : ليكشف الطلاب فتح/إنهاء الجلسات فوراً
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance'
  ) then
    alter publication supabase_realtime add table public.attendance;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;

-- هوية النسخ الكاملة لضمان عمل أحداث UPDATE مع Realtime
alter table public.attendance replica identity full;
alter table public.sessions    replica identity full;

-- ----------------------------------------------------------------------------
-- (7) أمان صفوف Row Level Security (RLS)
--
--  ملاحظة أمنية مهمة:
--  السياسات أدناه "متساهلة" لأن هذا النموذج يعتمد على anon key مباشرة من
--  المتصفح بدون كلمات مرور (حسب المخطط المطلوب). في بيئة إنتاج حقيقية
--  يُنصح بشدة باستخدام Supabase Auth وتقييد السياسات بـ auth.uid().
-- ----------------------------------------------------------------------------
alter table public.users      enable row level security;
alter table public.sessions   enable row level security;
alter table public.attendance enable row level security;

-- users: قراءة (لتسجيل الدخول) + إدراج (لإنشاء الحسابات)
--        + تعديل (قبول/رفض الطلاب، تأكيد OTP، تحديث صور الملف)
drop policy if exists "imin_users_select" on public.users;
create policy "imin_users_select" on public.users
  for select using (true);

drop policy if exists "imin_users_insert" on public.users;
create policy "imin_users_insert" on public.users
  for insert with check (true);

drop policy if exists "imin_users_update" on public.users;
create policy "imin_users_update" on public.users
  for update using (true) with check (true);

-- sessions: قراءة (لكشف الجلسات المفتوحة) + إدراج (لفتح جلسة) + تعديل (للإنهاء)
drop policy if exists "imin_sessions_select" on public.sessions;
create policy "imin_sessions_select" on public.sessions
  for select using (true);

drop policy if exists "imin_sessions_insert" on public.sessions;
create policy "imin_sessions_insert" on public.sessions
  for insert with check (true);

drop policy if exists "imin_sessions_update" on public.sessions;
create policy "imin_sessions_update" on public.sessions
  for update using (true) with check (true);

-- attendance: قراءة (للوحات الحضور) + إدراج (لتسجيل الحضور)
drop policy if exists "imin_attendance_select" on public.attendance;
create policy "imin_attendance_select" on public.attendance
  for select using (true);

drop policy if exists "imin_attendance_insert" on public.attendance;
create policy "imin_attendance_insert" on public.attendance
  for insert with check (true);

-- ----------------------------------------------------------------------------
-- (8) جدول الطلاب المحظورين (blocked_students) — حظر/فصل الطالب من محاضرات الدكتور
-- ----------------------------------------------------------------------------
create table if not exists public.blocked_students (
  id           uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.users (id) on delete cascade,
  student_id   uuid not null references public.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (professor_id, student_id)
);

comment on table public.blocked_students is 'ImIn: الطلاب المحظورون/المفصولون من محاضرات الدكتور (ممنوعون من تسجيل الحضور)';

create index if not exists idx_blocked_professor on public.blocked_students (professor_id);
create index if not exists idx_blocked_student   on public.blocked_students (student_id);

-- ----------------------------------------------------------------------------
-- (9) جدول الإنذارات (warnings) — إنذارات الطلاب من الدكتور
-- ----------------------------------------------------------------------------
create table if not exists public.warnings (
  id           uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.users (id) on delete cascade,
  student_id   uuid not null references public.users (id) on delete cascade,
  reason       text,
  created_at   timestamptz not null default now()
);

comment on table public.warnings is 'ImIn: إنذارات الطلاب المسجّلة من قبل الدكاترة';

create index if not exists idx_warnings_professor on public.warnings (professor_id);
create index if not exists idx_warnings_student   on public.warnings (student_id);

-- ----------------------------------------------------------------------------
-- (10) منع الطلاب المحظورين من تسجيل الحضور (على مستوى قاعدة البيانات نفسها)
--      يمنع أي إدراج حضور لطالب محظور لدى صاحب الجلسة حتى لو جاء الطلب من خارج الواجهة
-- ----------------------------------------------------------------------------
create or replace function public.imin_block_check() returns trigger as $$
begin
  if exists (
    select 1
    from public.blocked_students b
    join public.sessions s on s.id = new.session_id
    where b.student_id = new.student_id
      and b.professor_id = s.professor_id
  ) then
    raise exception 'أنت محظور من حضور محاضرات هذا الدكتور.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists imin_attendance_block_trigger on public.attendance;
create trigger imin_attendance_block_trigger
  before insert on public.attendance
  for each row execute function public.imin_block_check();

-- ----------------------------------------------------------------------------
-- (11) أمان RLS للجدولين الجديدين (نفس أسلوب باقي الجداول في هذا النموذج)
-- ----------------------------------------------------------------------------
alter table public.blocked_students enable row level security;
alter table public.warnings      enable row level security;

drop policy if exists "imin_blocked_select" on public.blocked_students;
create policy "imin_blocked_select" on public.blocked_students
  for select using (true);

drop policy if exists "imin_blocked_insert" on public.blocked_students;
create policy "imin_blocked_insert" on public.blocked_students
  for insert with check (true);

drop policy if exists "imin_blocked_delete" on public.blocked_students;
create policy "imin_blocked_delete" on public.blocked_students
  for delete using (true);

drop policy if exists "imin_warnings_select" on public.warnings;
create policy "imin_warnings_select" on public.warnings
  for select using (true);

drop policy if exists "imin_warnings_insert" on public.warnings;
create policy "imin_warnings_insert" on public.warnings
  for insert with check (true);

-- ----------------------------------------------------------------------------
-- (12) مخزن الملفات (Storage): bucket عام لصور بطاقات الهوية
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('id-cards', 'id-cards', true)
on conflict (id) do nothing;

-- السماح بقراءة روابط الصور العامة
drop policy if exists "imin_idcards_read" on storage.objects;
create policy "imin_idcards_read" on storage.objects
  for select using (bucket_id = 'id-cards');

-- السماح برفع صور البطاقات من صفحة التسجيل
drop policy if exists "imin_idcards_upload" on storage.objects;
create policy "imin_idcards_upload" on storage.objects
  for insert with check (bucket_id = 'id-cards');

-- ============================================================================
-- (13) توسيعات النسخة المطوّرة — حالات الحضور + الإشعارات + الجدول + الأمان
-- ============================================================================

-- أعمدة جديدة على attendance: الحالة (حاضر/متأخر — يحددها الخادم) + وقت التسجيل بالثانية
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance' and column_name = 'status'
  ) then
    alter table public.attendance add column status text not null default 'present'
      check (status in ('present', 'late'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance' and column_name = 'check_in_time'
  ) then
    alter table public.attendance add column check_in_time timestamptz not null default now();
  end if;
end $$;

-- أعمدة users الأكاديمية (تظهر في البطاقة الرقمية)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'faculty'
  ) then
    alter table public.users add column faculty text;
    alter table public.users add column program text;
    alter table public.users add column academic_year text;
  end if;
end $$;

-- (14) جدول الإشعارات (notifications)
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       text not null,
  params     jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'ImIn: إشعارات المستخدمين (فتح جلسة/توثيق حضور/تحذيرات/محاضرات قادمة...)';
create index if not exists idx_notifications_user   on public.notifications (user_id);
create index if not exists idx_notifications_unread on public.notifications (user_id) where not read;

-- (15) جدول الجدول الدراسي (schedule)
create table if not exists public.schedule (
  id            uuid primary key default gen_random_uuid(),
  professor_id  uuid not null references public.users (id) on delete cascade,
  day_of_week   integer not null check (day_of_week between 0 and 6),
  start_minutes integer not null check (start_minutes between 0 and 1439),
  end_minutes   integer not null check (end_minutes between 1 and 1440),
  subject       text not null,
  room          text,
  created_at    timestamptz not null default now()
);

comment on table public.schedule is 'ImIn: جدول المحاضرات الأسبوعي — الحالة (جارية/قادمة/منتهية) تُحسب من الوقت الحقيقي';
create index if not exists idx_schedule_professor on public.schedule (professor_id);
create index if not exists idx_schedule_day       on public.schedule (day_of_week);

-- (16) جدول الأنشطة المشبوهة (suspicious_events) — تسجيل فقط دون حظر تلقائي
create table if not exists public.suspicious_events (
  id            uuid primary key default gen_random_uuid(),
  event_type    text not null,
  actor_name    text,
  university_id text,
  session_id    uuid,
  reason        text,
  created_at    timestamptz not null default now()
);

comment on table public.suspicious_events is 'ImIn: محاولات الحضور المشبوهة (تكرار/جلسات مقفلة/تجاوز تحقق) — رصد بلا حظر تلقائي';
create index if not exists idx_suspicious_created on public.suspicious_events (created_at desc);

-- (17) إعدادات النظام (config) — عتبات الحالة الذكية ومهلة التأخير (قابلة للتعديل)
create table if not exists public.config (
  key   text primary key,
  value jsonb not null
);

insert into public.config (key, value)
values ('attendance', '{"grace_minutes": 15, "warning_threshold": 75, "critical_threshold": 60}'::jsonb)
on conflict (key) do nothing;

-- (18) دالة إحصائيات الطالب (RPC) — تُحسب خادمياً بالكامل للوضع الحقيقي
create or replace function public.student_stats(p_student_id uuid)
returns jsonb as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'present', count(*) filter (where a.status = 'present'),
    'late', count(*) filter (where a.status = 'late')
  ) into result
  from public.attendance a where a.student_id = p_student_id;
  return result;
end;
$$ language plpgsql security definer;

-- (19) RLS للجداول الجديدة
alter table public.notifications     enable row level security;
alter table public.schedule          enable row level security;
alter table public.suspicious_events enable row level security;
alter table public.config            enable row level security;

drop policy if exists "imin_notifications_select" on public.notifications;
create policy "imin_notifications_select" on public.notifications
  for select using (true);
drop policy if exists "imin_notifications_insert" on public.notifications;
create policy "imin_notifications_insert" on public.notifications
  for insert with check (true);
drop policy if exists "imin_notifications_update" on public.notifications;
create policy "imin_notifications_update" on public.notifications
  for update using (true) with check (true);

drop policy if exists "imin_schedule_select" on public.schedule;
create policy "imin_schedule_select" on public.schedule
  for select using (true);
drop policy if exists "imin_schedule_insert" on public.schedule;
create policy "imin_schedule_insert" on public.schedule
  for insert with check (true);

drop policy if exists "imin_suspicious_select" on public.suspicious_events;
create policy "imin_suspicious_select" on public.suspicious_events
  for select using (true);
drop policy if exists "imin_suspicious_insert" on public.suspicious_events;
create policy "imin_suspicious_insert" on public.suspicious_events
  for insert with check (true);

drop policy if exists "imin_config_select" on public.config;
create policy "imin_config_select" on public.config
  for select using (true);

-- ----------------------------------------------------------------------------
-- تم! قاعدة البيانات جاهزة بالكامل.
-- ----------------------------------------------------------------------------
