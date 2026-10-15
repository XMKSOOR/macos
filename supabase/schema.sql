-- =====================================================================
--  Dental Clinic — مخطط قاعدة بيانات Supabase (Postgres)
--  نفّذ هذا الملف كاملاً في:  Supabase Dashboard > SQL Editor > New query
--  آمن للتشغيل أكثر من مرة (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
--  1) الجداول (نسخة مطابقة لجداول SQLite في تطبيق السطح المكتب)
-- ---------------------------------------------------------------------

create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null default '',
  role          text not null default 'cashier',
  full_name     text not null default '',
  permissions   text not null default '',
  created_at    text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.patients (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text not null default '',
  birth_date          text not null default '',
  gender              text not null default '',
  address             text not null default '',
  notes               text not null default '',
  national_id         text not null default '',
  allergies           text not null default '',
  chronic_diseases    text not null default '',
  physiological_status text not null default '',
  medical_notes       text not null default '',
  created_at          text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at          text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.appointments (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  date       text not null default '',
  time       text not null default '',
  reason     text not null default '',
  notes      text not null default '',
  status     text not null default 'scheduled',
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.catalog (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  price       double precision not null default 0,
  qty         double precision not null default 1,
  total       double precision not null default 0,
  description text not null default '',
  price_usd   double precision not null default 0,
  cost_usd    double precision not null default 0,
  total_usd   double precision not null default 0,
  created_at  text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.materials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null default '',
  unit       text not null default '',
  quantity   double precision not null default 0,
  min_qty    double precision not null default 0,
  cost       double precision not null default 0,
  cost_usd   double precision not null default 0,
  total      double precision not null default 0,
  total_usd  double precision not null default 0,
  supplier   text not null default '',
  notes      text not null default '',
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.catalog_materials (
  id         uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalog(id) on delete cascade,
  material_id uuid not null references public.materials(id),
  qty        double precision not null default 1
);

create table if not exists public.invoices (
  id         uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  patient_id uuid not null references public.patients(id),
  date       text not null default '',
  usd_rate   double precision not null default 0,
  subtotal   double precision not null default 0,
  discount   double precision not null default 0,
  total      double precision not null default 0,
  paid       double precision not null default 0,
  subtotal_usd double precision not null default 0,
  discount_usd double precision not null default 0,
  total_usd  double precision not null default 0,
  paid_usd   double precision not null default 0,
  status     text not null default 'unpaid',
  notes      text not null default '',
  created_by text not null default '',
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.invoice_items (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  name       text not null default '',
  cost       double precision not null default 0,
  qty        double precision not null default 1,
  cost_usd   double precision not null default 0,
  catalog_id uuid
);

create table if not exists public.invoice_materials (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  item_id     uuid,
  material_id uuid not null references public.materials(id),
  qty         double precision not null default 0
);

create table if not exists public.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  qty        double precision not null default 0,
  operation  text not null default '',
  reference  text not null default '',
  user_name  text not null default '',
  note       text not null default '',
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  category   text not null default '',
  amount     double precision not null default 0,
  amount_usd double precision not null default 0,
  is_recurring integer not null default 0,
  recurrence text not null default 'monthly',
  next_due   text not null default '',
  last_generated text not null default '',
  note       text not null default '',
  date       text not null default '',
  created_by text not null default '',
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.settings (
  key   text primary key,
  value text not null default ''
);

create table if not exists public.patient_files (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  filename    text not null default '',
  stored_name text not null default '',
  ftype       text not null default 'other',
  mime        text not null default '',
  size        double precision not null default 0,
  created_at  text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.patient_medications (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients(id) on delete cascade,
  scientific_name     text not null default '',
  trade_name          text not null default '',
  dose                text not null default '',
  form                text not null default '',
  route               text not null default '',
  frequency           text not null default '',
  start_date          text not null default '',
  end_date            text not null default '',
  category            text not null default 'prescription',
  prescriber          text not null default '',
  prescriber_specialty text not null default '',
  pharmacist          text not null default '',
  dispense_date       text not null default '',
  dispense_place      text not null default '',
  next_review         text not null default '',
  notes               text not null default '',
  active              integer not null default 1,
  created_at          text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.medicines (
  id              uuid primary key default gen_random_uuid(),
  trade_name      text not null default '',
  scientific_name text not null default '',
  dose            text not null default '',
  form            text not null default '',
  route           text not null default '',
  frequency       text not null default '',
  category        text not null default 'prescription',
  created_at      text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------------------------------------------------------------------
--  1.a) جداول طب الأسنان والسجلات السريرية (نسخة مطابقة لـ SQLite)
-- ---------------------------------------------------------------------
create table if not exists public.dental_charts (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  tooth_number text not null,
  condition    text not null default 'healthy',
  surfaces     text not null default '',
  notes        text not null default '',
  created_at   text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at   text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.treatment_plans (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  title      text not null,
  status     text not null default 'proposed',
  total_cost double precision not null default 0,
  notes      text not null default '',
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.treatment_plan_items (
  id             uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.treatment_plans(id) on delete cascade,
  tooth_number   text not null default '',
  procedure_name text not null,
  cost           double precision not null default 0,
  status         text not null default 'pending',
  notes          text not null default '',
  sort_order     double precision not null default 0
);

create table if not exists public.periodontal_charts (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  tooth_number text not null,
  pocket_depth double precision not null default 0,
  bleeding     double precision not null default 0,
  mobility     double precision not null default 0,
  recession    double precision not null default 0,
  notes        text not null default '',
  created_at   text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.recall_reminders (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  recall_type text not null default 'checkup',
  due_date    text not null default '',
  status      text not null default 'pending',
  notes       text not null default '',
  created_at  text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.tooth_history (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients(id) on delete cascade,
  tooth_number   text not null default '',
  date           text not null default '',
  procedure_name text not null default '',
  doctor         text not null default '',
  notes          text not null default '',
  created_at     text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.anesthesia_records (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  date            text not null default '',
  tooth_number    text not null default '',
  anesthesia_type text not null default '',
  dose            text not null default '',
  batch_no        text not null default '',
  expiry_date     text not null default '',
  notes           text not null default '',
  created_at      text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.lab_cases (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients(id) on delete cascade,
  date          text not null default '',
  lab_name      text not null default '',
  case_type     text not null default '',
  tooth_number  text not null default '',
  shade         text not null default '',
  material      text not null default '',
  status        text not null default '',
  due_date      text not null default '',
  received_date text not null default '',
  cost          double precision not null default 0,
  notes         text not null default '',
  created_at    text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.implant_records (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients(id) on delete cascade,
  tooth_number   text not null default '',
  date           text not null default '',
  brand          text not null default '',
  size           text not null default '',
  position       text not null default '',
  healing_status text not null default '',
  notes          text not null default '',
  created_at     text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.consent_forms (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients(id) on delete cascade,
  date           text not null default '',
  procedure_name text not null default '',
  content        text not null default '',
  signed_by      text not null default '',
  notes          text not null default '',
  created_at     text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.risk_assessments (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  date            text not null default '',
  caries_risk     text not null default '',
  perio_risk      text not null default '',
  recommendations text not null default '',
  notes           text not null default '',
  created_at      text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.referrals (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  date       text not null default '',
  direction  text not null default 'out',
  specialist text not null default '',
  specialty  text not null default '',
  reason     text not null default '',
  status     text not null default '',
  notes      text not null default '',
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.procedure_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null default '',
  description  text not null default '',
  default_cost double precision not null default 0,
  materials    text not null default '',
  created_at   text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.insurance_fees (
  id             uuid primary key default gen_random_uuid(),
  code           text not null default '',
  procedure_name text not null default '',
  category       text not null default '',
  fee            double precision not null default 0,
  notes          text not null default '',
  created_at     text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.sterilization_log (
  id          uuid primary key default gen_random_uuid(),
  date        text not null default '',
  cycle_no    text not null default '',
  device      text not null default '',
  method      text not null default '',
  temperature text not null default '',
  pressure    text not null default '',
  duration    text not null default '',
  result      text not null default '',
  operator    text not null default '',
  notes       text not null default '',
  created_at  text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.education_materials (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  category   text not null default '',
  content    text not null default '',
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.postop_instructions (
  id             uuid primary key default gen_random_uuid(),
  procedure_name text not null default '',
  title          text not null default '',
  content        text not null default '',
  created_at     text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.clinical_note_templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  category   text not null default '',
  content    text not null default '',
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------------------------------------------------------------------
--  1.b) أعمدة إضافية للترقية (في حال وجود الجداول من نسخة سابقة)
-- ---------------------------------------------------------------------
alter table public.users     add column if not exists permissions      text not null default '';
alter table public.catalog   add column if not exists price_usd        double precision not null default 0;
alter table public.catalog   add column if not exists cost_usd         double precision not null default 0;
alter table public.catalog   add column if not exists qty              double precision not null default 1;
alter table public.catalog   add column if not exists total            double precision not null default 0;
alter table public.catalog   add column if not exists total_usd        double precision not null default 0;
alter table public.materials add column if not exists cost_usd         double precision not null default 0;
alter table public.materials add column if not exists total            double precision not null default 0;
alter table public.materials add column if not exists total_usd        double precision not null default 0;
alter table public.invoices  add column if not exists subtotal_usd     double precision not null default 0;
alter table public.invoices  add column if not exists discount_usd     double precision not null default 0;
alter table public.invoices  add column if not exists total_usd        double precision not null default 0;
alter table public.invoices  add column if not exists paid_usd         double precision not null default 0;
alter table public.invoice_items add column if not exists cost_usd     double precision not null default 0;
alter table public.expenses  add column if not exists amount_usd       double precision not null default 0;
alter table public.expenses  add column if not exists is_recurring     integer not null default 0;
alter table public.expenses  add column if not exists recurrence       text not null default 'monthly';
alter table public.expenses  add column if not exists next_due         text not null default '';
alter table public.expenses  add column if not exists last_generated   text not null default '';

-- ---------------------------------------------------------------------
--  2) فهارس مساعدة للبحث السريع من الجوال
-- ---------------------------------------------------------------------
create index if not exists idx_patients_name      on public.patients (name);
create index if not exists idx_patients_phone      on public.patients (phone);
create index if not exists idx_appointments_date   on public.appointments (date);
create index if not exists idx_invoices_patient    on public.invoices (patient_id);
create index if not exists idx_meds_patient        on public.patient_medications (patient_id);

-- ---------------------------------------------------------------------
--  3) الأمان (RLS): المستخدمون المسجّلون عبر Supabase Auth يصلون لكل البيانات.
--     تطبيق السطح المكتب يستخدم المفتاح السري (service_role) ويتجاوز RLS.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'users','patients','appointments','catalog','materials','catalog_materials',
    'invoices','invoice_items','invoice_materials','stock_movements','expenses',
    'settings','patient_files','patient_medications','medicines',
    'dental_charts','treatment_plans','treatment_plan_items','periodontal_charts',
    'recall_reminders','tooth_history','anesthesia_records','lab_cases','implant_records',
    'consent_forms','risk_assessments','referrals','procedure_templates','insurance_fees',
    'sterilization_log','education_materials','postop_instructions','clinical_note_templates'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated_all" on public.%I', t);
    execute format(
      'create policy "authenticated_all" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  4) دالة البصمة الخفيفة: تُرجع عدد الصفوف ومجموع بصمات hash لكل صف في جدول.
--     يتحقق بها تطبيق السطح المكتب من أي تغيير على السحابة دون تحميل الجداول
--     كاملة (مزامنة تفرقية سريعة). اختيارية: بدونها يعمل بالجلب الكامل لكن أبطأ.
-- ---------------------------------------------------------------------
create or replace function public.sync_table_digest(p_table text)
returns table(cnt bigint, h bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_table !~ '^[a-z_][a-z0-9_]*$' or not (
    p_table in ('users','patients','appointments','catalog','materials','catalog_materials',
                'invoices','invoice_items','invoice_materials','stock_movements','expenses',
                'settings','patient_medications','medicines',
                'dental_charts','treatment_plans','treatment_plan_items','periodontal_charts',
                'recall_reminders','tooth_history','anesthesia_records','lab_cases','implant_records',
                'consent_forms','risk_assessments','referrals','procedure_templates','insurance_fees',
                'sterilization_log','education_materials','postop_instructions','clinical_note_templates')
  ) then
    raise exception 'invalid table name';
  end if;
  return query
    execute format(
      'select count(*)::bigint as cnt, coalesce(sum(hashtext(row_to_json(t)::text)::bigint), 0)::bigint as h from public.%I t',
      p_table
    );
end;
$$;

-- ---------------------------------------------------------------------
--  تم. الخطوة التالية: أنشئ مستخدماً من  Authentication > Users > Add user
--  (البريد + كلمة المرور) ليستخدمه تطبيق الأندرويد لتسجيل الدخول.
-- ---------------------------------------------------------------------