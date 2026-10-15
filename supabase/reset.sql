-- =====================================================================
--  Dental Clinic — إعادة بناء مخطط Supabase من الصفر
--  ⚠ تحذير: هذا الملف يحذف كل جداول البيانات على Supabase Postgres.
--  استخدمه فقط عندما تكون قاعدة جهاز السطح المكتب (clinic.db) هي المصدر
--  الكامل والموثوق للبيانات، ثم ارفعها للأعلى بعد ذلك من زر «إصلاح المزامنة».
--
--  الخطوات:
--    1) نفّذ هذا الملف كاملاً في Supabase Dashboard > SQL Editor > New query.
--    2) نفّذ بعده ملف schema.sql (يعيد إنشاء الجداول بمفاتيح uuid + RLS + دالة البصمة).
--    3) من تطبيق السطح المكتب: الإعدادات ← اضغط «🔧 إصلاح/إعادة بناء المزامنة السحابية».
-- =====================================================================

drop table if exists public.treatment_plan_items       cascade;
drop table if exists public.treatment_plans            cascade;
drop table if exists public.invoice_materials          cascade;
drop table if exists public.invoice_items              cascade;
drop table if exists public.invoices                   cascade;
drop table if exists public.appointments               cascade;
drop table if exists public.catalog_materials          cascade;
drop table if exists public.stock_movements            cascade;
drop table if exists public.catalog                    cascade;
drop table if exists public.materials                  cascade;
drop table if exists public.expenses                   cascade;
drop table if exists public.patient_files              cascade;
drop table if exists public.patient_medications        cascade;
drop table if exists public.medicines                  cascade;
drop table if exists public.patients                   cascade;
drop table if exists public.users                      cascade;
drop table if exists public.dental_charts              cascade;
drop table if exists public.periodontal_charts         cascade;
drop table if exists public.recall_reminders           cascade;
drop table if exists public.tooth_history              cascade;
drop table if exists public.anesthesia_records         cascade;
drop table if exists public.lab_cases                  cascade;
drop table if exists public.implant_records            cascade;
drop table if exists public.consent_forms              cascade;
drop table if exists public.risk_assessments           cascade;
drop table if exists public.referrals                  cascade;
drop table if exists public.procedure_templates        cascade;
drop table if exists public.insurance_fees             cascade;
drop table if exists public.sterilization_log          cascade;
drop table if exists public.education_materials        cascade;
drop table if exists public.postop_instructions        cascade;
drop table if exists public.clinical_note_templates    cascade;
drop table if exists public.settings                   cascade;

drop function if exists public.sync_table_digest(text);

-- تم. نفّذ الآن schema.sql.
