-- =====================================================================
--  Dental Clinic — تحويل الأعمدة الرقمية على Supabase من bigint إلى double precision
--  السبب: SQLite (جهاز السطح المكتب) يخزّن الأرقام ديناميكياً وقد تكون بعض المبالغ
--  كسرية (مثال: cost=0.207)، بينما bigint على Postgres يرفض الكسور (خطأ 22P02).
--  نفّذ هذا الملف مرة واحدة في Supabase Dashboard > SQL Editor > New query.
--  آمن للتشغيل أكثر من مرة.
-- =====================================================================

alter table public.catalog                alter column price        type double precision using price::double precision;
alter table public.catalog                alter column total        type double precision using total::double precision;
alter table public.materials              alter column cost         type double precision using cost::double precision;
alter table public.materials              alter column total        type double precision using total::double precision;
alter table public.invoices               alter column subtotal     type double precision using subtotal::double precision;
alter table public.invoices               alter column discount     type double precision using discount::double precision;
alter table public.invoices               alter column total        type double precision using total::double precision;
alter table public.invoices               alter column paid         type double precision using paid::double precision;
alter table public.invoice_items          alter column cost         type double precision using cost::double precision;
alter table public.invoice_items          alter column qty          type double precision using qty::double precision;
alter table public.expenses               alter column amount       type double precision using amount::double precision;
alter table public.patient_files          alter column size         type double precision using size::double precision;
alter table public.treatment_plans        alter column total_cost   type double precision using total_cost::double precision;
alter table public.treatment_plan_items   alter column cost         type double precision using cost::double precision;
alter table public.treatment_plan_items   alter column sort_order   type double precision using sort_order::double precision;
alter table public.periodontal_charts     alter column pocket_depth type double precision using pocket_depth::double precision;
alter table public.periodontal_charts     alter column bleeding     type double precision using bleeding::double precision;
alter table public.periodontal_charts     alter column mobility     type double precision using mobility::double precision;
alter table public.periodontal_charts     alter column recession    type double precision using recession::double precision;
alter table public.lab_cases              alter column cost         type double precision using cost::double precision;
alter table public.procedure_templates    alter column default_cost type double precision using default_cost::double precision;
alter table public.insurance_fees         alter column fee          type double precision using fee::double precision;

-- تم. بعد التنفيذ اضغط في البرنامج: الإعدادات ← 🔧 إصلاح/إعادة بناء المزامنة السحابية.
