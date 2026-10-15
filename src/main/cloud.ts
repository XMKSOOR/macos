import { createHash } from 'node:crypto'
import { getDb } from './db'
import { supabaseConfig } from './supabase'
import { fingerprintTables } from './syncCore'
import { planPush, saveBaseline, mergeIntoLocal, pkColumn } from './syncDelta'

// الجداول المركّبة كاملة (نسخة معكوسة) على Supabase Postgres
const SYNC_TABLES: string[] = [
  'users',
  'patients',
  'patient_medications',
  'medicines',
  'materials',
  'catalog',
  'catalog_materials',
  'appointments',
  'invoices',
  'invoice_items',
  'invoice_materials',
  'stock_movements',
  'expenses',
  'dental_charts',
  'treatment_plans',
  'treatment_plan_items',
  'periodontal_charts',
  'recall_reminders',
  'tooth_history',
  'anesthesia_records',
  'lab_cases',
  'implant_records',
  'consent_forms',
  'risk_assessments',
  'referrals',
  'procedure_templates',
  'insurance_fees',
  'sterilization_log',
  'education_materials',
  'postop_instructions',
  'clinical_note_templates',
  'settings'
]

// ترتيب الحذف على الخادم (الأبناء أولاً لاحترام المفاتيح الأجنبية)
const DELETE_ORDER: string[] = [
  'treatment_plan_items',
  'treatment_plans',
  'invoice_materials',
  'invoice_items',
  'invoices',
  'appointments',
  'catalog_materials',
  'stock_movements',
  'catalog',
  'materials',
  'expenses',
  'patient_medications',
  'dental_charts',
  'periodontal_charts',
  'recall_reminders',
  'tooth_history',
  'anesthesia_records',
  'lab_cases',
  'implant_records',
  'consent_forms',
  'risk_assessments',
  'referrals',
  'medicines',
  'patients',
  'users',
  'procedure_templates',
  'insurance_fees',
  'sterilization_log',
  'education_materials',
  'postop_instructions',
  'clinical_note_templates',
  'settings'
]

// ترتيب الإدخال (الآباء أولاً)
const INSERT_ORDER: string[] = [
  'users',
  'patients',
  'patient_medications',
  'medicines',
  'materials',
  'catalog',
  'catalog_materials',
  'appointments',
  'invoices',
  'invoice_items',
  'invoice_materials',
  'stock_movements',
  'expenses',
  'treatment_plans',
  'treatment_plan_items',
  'dental_charts',
  'periodontal_charts',
  'recall_reminders',
  'tooth_history',
  'anesthesia_records',
  'lab_cases',
  'implant_records',
  'consent_forms',
  'risk_assessments',
  'referrals',
  'procedure_templates',
  'insurance_fees',
  'sterilization_log',
  'education_materials',
  'postop_instructions',
  'clinical_note_templates',
  'settings'
]

const TRANSPORT = 'cloud'

let lastPullChanged = 0

interface CloudConfig {
  rest: string
  key: string
}

export function cloudConfig(): CloudConfig | null {
  const s = supabaseConfig()
  if (!s) return null
  return { rest: s.url + '/rest/v1', key: s.key }
}

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra
  }
}

async function request(cfg: CloudConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(cfg.rest + path, {
    ...init,
    headers: headers(cfg.key, (init.headers as Record<string, string>) ?? {})
  })
  return res
}

async function fail(res: Response): Promise<never> {
  let detail = ''
  try {
    detail = await res.text()
  } catch {
    /* ignore */
  }
  throw new Error(`Supabase Postgres (${res.status}): ${detail.slice(0, 300) || res.statusText}`)
}

function maskedKey(): string {
  const s = supabaseConfig()
  if (!s) return '(غير مهيأ)'
  return s.key.length > 8 ? s.key.slice(0, 4) + '…' + s.key.slice(-2) + '(len=' + s.key.length + ')' : '(قصير)'
}

/** يشرح في السجل سبب تعطل مزامنة Postgres (مفتاح/جدول/أعمدة/اتصال) */
function diagnoseCloud(fn: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error && err.stack ? err.stack : ''
  console.error(`[SYNC:cloud] ${fn} فشل: ${msg}`)
  if (process.env['SYNC_TRACE'] === '1' && stack) console.error(`[SYNC:cloud] ${fn} STACK\n${stack}`)
  if (/\b401\b|\b403\b|invalid.{0,10}api|jwt|apikey|permission|forbidden/i.test(msg)) {
    console.error('[SYNC:cloud] السبب المرجّح: مفتاح API خاطئ أو صلاحيات RLS تمنع العملية — استخدم Service Role Key وتحقق من Policies.')
  } else if (/42P01|relation .* does not exist|doesn't exist|not found/i.test(msg)) {
    console.error('[SYNC:cloud] السبب المرجّح: جدول غير موجود على Supabase Postgres — نفّذ schema.sql كاملاً على قاعدة Postgres.')
  } else if (/42703|column|no such column/i.test(msg)) {
    console.error('[SYNC:cloud] السبب المرجّح: اختلاف أعمدة الجدول بين SQLite و Supabase — طابق بنية الجداول (schema.sql).')
  } else if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network/i.test(msg)) {
    console.error('[SYNC:cloud] السبب المرجّح: مشكلة اتصال بالشبكة أو عنوان مشروع خاطئ.')
  }
}

export async function cloudTest(): Promise<string> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('أدخل عنوان مشروع Supabase والمفتاح السري في الإعدادات أولاً')
  const res = await request(cfg, '/patients?select=id&limit=1')
  if (!res.ok) await fail(res)
  return 'تم الاتصال بقاعدة بيانات Supabase Postgres بنجاح'
}

export function cloudPullChanged(): number {
  return lastPullChanged
}

export function resetCloudPullChanged(): void {
  lastPullChanged = 0
}

function readLocalTable(t: string): Record<string, unknown>[] {
  const db = getDb()
  return db.prepare(`SELECT * FROM \`${t}\``).all() as unknown as Record<string, unknown>[]
}

function countLocal(t: string): number {
  try {
    const r = getDb().prepare(`SELECT COUNT(*) AS c FROM \`${t}\``).get() as { c: number }
    return Number(r?.c ?? 0)
  } catch {
    return 0
  }
}

/** بصمة خفيفة عبر دالة sync_table_digest في Postgres — إن لم توجد نعود للجلب الكامل */
async function cheapRemoteDigest(
  cfg: CloudConfig
): Promise<{ t: string; cnt: number; h: number }[] | null> {
  try {
    const out: { t: string; cnt: number; h: number }[] = []
    for (const t of SYNC_TABLES) {
      const res = await request(cfg, `/rpc/sync_table_digest?p_table=${t}`)
      if (!res.ok) return null
      const data = (await res.json()) as { cnt?: number | string; h?: number | string }[]
      const row = Array.isArray(data) ? data[0] : undefined
      out.push({ t, cnt: Number(row?.cnt ?? 0), h: Number(row?.h ?? 0) })
    }
    return out
  } catch {
    return null
  }
}

export async function cloudRemoteFp(): Promise<{ hash: string; rows: number } | null> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('أدخل عنوان مشروع Supabase والمفتاح السري في الإعدادات أولاً')

  const digests = await cheapRemoteDigest(cfg)
  if (digests) {
    const total = digests.reduce((s, d) => s + d.cnt, 0)
    if (total === 0) return null
    const h = createHash('sha256')
    for (const t of SYNC_TABLES) {
      const d = digests.find((x) => x.t === t)
      h.update(JSON.stringify(t))
      h.update(' ')
      h.update(String(d?.cnt ?? 0))
      h.update(' ')
      h.update(String(d?.h ?? 0))
    }
    return { hash: h.digest('hex'), rows: total }
  }
  console.warn(
    '[SYNC:cloud] الدالة sync_table_digest غير موجودة على Supabase — استخدم طريقة الجلب الكامل (أبطأ). نفّذ SQL المقترحة في محرر SQL لتسريع العملية.'
  )

  const rowsByTable: Record<string, unknown[]> = {}
  let total = 0
  let failedTables = 0
  for (const t of SYNC_TABLES) {
    try {
      const rows = await fetchTable(cfg, t)
      rowsByTable[t] = rows as unknown as unknown[]
      total += rows.length
    } catch (e) {
      failedTables++
      diagnoseCloud(`remoteFp/${t}`, e)
      rowsByTable[t] = []
    }
  }
  if (failedTables === SYNC_TABLES.length) return null
  if (failedTables > 0) {
    console.warn(`[SYNC:cloud] remoteFp: فشل جلب ${failedTables} جدولاً من ${SYNC_TABLES.length} — سيُحسب الهاش على المتاح فقط`)
  }
  if (total === 0) return null
  const fp = fingerprintTables(rowsByTable)
  return { hash: fp.hash, rows: fp.rows }
}

function inQuery(col: string, ids: (string | number)[]): string {
  const parts = ids.map((i) => {
    const s = String(i)
    if (/^\d+$/.test(s)) return s
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  })
  return `${col}=in.(${parts.join(',')})`
}

async function deleteIds(cfg: CloudConfig, t: string, ids: (string | number)[]): Promise<number> {
  const col = pkColumn(t)
  let removed = 0
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    const res = await request(cfg, `/${t}?${inQuery(col, chunk)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    })
    if (!res.ok) await fail(res)
    removed += chunk.length
  }
  return removed
}

interface PushPlan {
  upsert: Record<string, unknown>[]
  deletes: (string | number)[]
}

/** يلتقط تغييرات الطرف المحلي (الجديدة/المعدلة/المحذوفة) بالنسبة لآخر مزامنة */
function capturePlans(): Record<string, PushPlan> {
  const plans: Record<string, PushPlan> = {}
  for (const t of INSERT_ORDER) {
    try {
      plans[t] = planPush(TRANSPORT, t, readLocalTable(t))
    } catch (e) {
      diagnoseCloud(`تخطيط ${t}`, e)
      plans[t] = { upsert: [], deletes: [] }
    }
  }
  return plans
}

/** يرفع خططاً ملتقطة مسبقاً: upsert للصفوف المتغيرة، ثم حذف الصفوف المحذوفة محلياً */
async function pushPlans(
  cfg: CloudConfig,
  plans: Record<string, PushPlan>,
  failed: string[] = []
): Promise<{ pushed: number; removed: number; bad: Set<string> }> {
  const bad = new Set<string>()
  const skip = new Set(failed)
  let pushed = 0
  let removed = 0

  for (const t of INSERT_ORDER) {
    if (skip.has(t)) continue
    const plan = plans[t]
    if (!plan || plan.upsert.length === 0) continue
    try {
      const res = await request(cfg, `/${t}`, {
        method: 'POST',
        headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify(plan.upsert)
      })
      if (!res.ok) await fail(res)
      pushed += plan.upsert.length
      console.log(`[SYNC:cloud] push ${t}: رفع ${plan.upsert.length} صفاً متغيّراً ✓`)
    } catch (e) {
      diagnoseCloud(`push/${t}`, e)
      bad.add(t)
    }
  }

  for (const t of DELETE_ORDER) {
    if (bad.has(t) || skip.has(t)) continue
    const deletes = plans[t]?.deletes ?? []
    if (deletes.length === 0) continue
    try {
      const n = await deleteIds(cfg, t, deletes)
      removed += n
      console.log(`[SYNC:cloud] push ${t}: حذف ${n} صفاً من البعيد (حُذفت محلياً) ✓`)
    } catch (e) {
      diagnoseCloud(`push/حذف ${t}`, e)
      bad.add(t)
    }
  }

  return { pushed, removed, bad }
}

/** يحذف من السحابة أي مفاتيح إعدادات خاصّة بالمزامنة تسرّبت سابقاً (حالة كل جهاز يجب أن تبقى محلية) */
async function purgeRemoteMetaSettings(cfg: CloudConfig): Promise<void> {
  try {
    const res = await request(cfg, '/settings?key=like.sync_state_*', {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    })
    if (!res.ok) return
    await request(cfg, '/settings?key=eq.sync_transport', {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    })
  } catch (e) {
    console.warn('[SYNC:cloud] تنظيف مفاتيح المزامنة من السحابة فشل (غير مميت)', e instanceof Error ? e.message : e)
  }
}

export async function cloudPush(): Promise<string> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('أدخل عنوان مشروع Supabase والمفتاح السري في الإعدادات أولاً')
  console.log(`[SYNC:cloud] push يبدأ (المفتاح: ${maskedKey()}, الرابط: ${cfg.rest})`)

  const plans = capturePlans()
  const { pushed, removed, bad } = await pushPlans(cfg, plans)

  for (const t of INSERT_ORDER) {
    if (bad.has(t)) continue
    try {
      saveBaseline(TRANSPORT, t, readLocalTable(t))
    } catch (e) {
      console.warn(`[SYNC:cloud] push: تعذّر حفظ baseline ${t}`, e instanceof Error ? e.message : e)
    }
  }

  await purgeRemoteMetaSettings(cfg)

  if (bad.size > 0) {
    const msg = `فشلت الجداول التالية: ${[...bad].join(', ')} — راجع السجل لتشخيص السبب`
    console.error(`[SYNC:cloud] push: ${msg}`)
    throw new Error(msg)
  }
  console.log(`[SYNC:cloud] push انتهى: ${pushed} صفاً محدثاً، ${removed} صفاً محذوفاً`)
  return `تم رفع التعديلات إلى Supabase Postgres (${pushed} صفاً محدثاً، ${removed} صفاً محذوفاً)`
}

/**
 * مزامنة ثنائية الاتجاه: يسحب تغييرات البعيد ويدمجها (المحلي يفوز عند التعارض)،
 * ثم يرفع تغييرات المحلي — فتنتقل التعديلات والحذوفات بين الأجهزة في كل دورة.
 * تُعيد عدد الصفوف التي غيّرها السحب.
 */
export async function cloudSync(): Promise<number> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('أدخل عنوان مشروع Supabase والمفتاح السري في الإعدادات أولاً')

  // 1) التقط تغييرات المحلي قبل أي دمج
  const plans = capturePlans()

  // 2) اسحب كل الجداول وادمج التغييرات في مكانها
  const data: Record<string, Record<string, unknown>[]> = {}
  const failed: string[] = []
  for (const t of SYNC_TABLES) {
    try {
      data[t] = await fetchTable(cfg, t)
    } catch (e) {
      diagnoseCloud(`sync/جلب ${t}`, e)
      failed.push(t)
    }
  }
  const counts = mergeIntoLocal(TRANSPORT, data, DELETE_ORDER, INSERT_ORDER, failed)
  lastPullChanged = counts.inserted + counts.updated + counts.deleted

  // 3) ارفع تغييرات المحلي التي التقطناها قبل الدمج
  const { pushed, removed, bad } = await pushPlans(cfg, plans, failed)

  // 4) حدّث baseline من الحالة المحلية النهائية
  for (const t of INSERT_ORDER) {
    if (failed.includes(t) || bad.has(t)) continue
    try {
      saveBaseline(TRANSPORT, t, readLocalTable(t))
    } catch {
      /* best effort */
    }
  }

  await purgeRemoteMetaSettings(cfg)
  console.log(
    `[SYNC:cloud] sync انتهى: سحب(${counts.inserted} إدراج، ${counts.updated} تحديث، ${counts.deleted} حذف) / رفع(${pushed} محدث، ${removed} محذوف)`
  )
  return lastPullChanged
}

async function fetchTable(cfg: CloudConfig, t: string): Promise<Record<string, unknown>[]> {
  const res = await request(cfg, `/${t}?select=*`, {
    headers: { Range: '0-999999', 'Range-Unit': 'items' }
  })
  if (!res.ok) await fail(res)
  const data = (await res.json()) as Record<string, unknown>[]
  return Array.isArray(data) ? data : []
}

export async function cloudPull(): Promise<string> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('أدخل عنوان مشروع Supabase والمفتاح السري في الإعدادات أولاً')

  // 1) نجلب الجداول؛ من فشل جلبُه نتجاوزه (لا نلمس المحلي لما لم نستطع قراءته)
  const data: Record<string, Record<string, unknown>[]> = {}
  const failed: string[] = []
  let total = 0
  for (const t of SYNC_TABLES) {
    try {
      const rows = await fetchTable(cfg, t)
      data[t] = rows
      total += rows.length
    } catch (e) {
      diagnoseCloud(`pull/جلب ${t}`, e)
      failed.push(t)
    }
  }
  if (failed.length > 0) {
    console.warn(`[SYNC:cloud] pull: تجاوزت ${failed.length} جدولاً تعذّر جلبها: ${failed.join(', ')}`)
  }
  if (total === 0 && failed.length === SYNC_TABLES.length) {
    throw new Error('لا توجد بيانات على Supabase بعد — ارفع نسخة أولاً')
  }
  if (total === 0) {
    console.log('[SYNC:cloud] pull: جميع الجداول فارغة على السحابة — قسم فقط من الصفوف المتزامنة سيُحذف')
  }

  // 2) دمج في المكان داخل صفقة: لا مسح كامل، لا استبدال ملف، لا تعطيل للواجهة
  const counts = mergeIntoLocal(TRANSPORT, data, DELETE_ORDER, INSERT_ORDER, failed)
  lastPullChanged = counts.inserted + counts.updated + counts.deleted
  console.log(
    `[SYNC:cloud] pull انتهى: ${counts.inserted} إدراج، ${counts.updated} تحديث، ${counts.deleted} حذف`
  )
  return `تم سحب التغييرات من Supabase Postgres (${counts.inserted} جديد، ${counts.updated} معدّل، ${counts.deleted} محذوف)`
}

export async function cloudPushOnQuit(): Promise<void> {
  if (process.env['SKIP_SYNC'] === '1') return
  if (!cloudConfig()) {
    console.warn('[SYNC:cloud] عند الإغلاق: التكوين غير مكتمل — لن يتم الرفع')
    return
  }
  try {
    await cloudPush()
  } catch (e) {
    diagnoseCloud('pushOnQuit', e)
  }
}

export async function cloudPullOnStart(): Promise<void> {
  if (process.env['SKIP_SYNC'] === '1') return
  if (!cloudConfig()) {
    console.warn('[SYNC:cloud] عند الإقلاع: التكوين غير مكتمل — لن يتم السحب')
    return
  }
  // يُستخدم فقط عند أول تهيئة جهاز فارغ (نسخة Postgres للجوال)
  const empty = ['patients', 'appointments', 'invoices'].every((t) => countLocal(t) === 0)
  if (!empty) return
  try {
    await cloudPull()
  } catch (e) {
    diagnoseCloud('pullOnStart', e)
  }
}