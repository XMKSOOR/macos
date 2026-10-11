import { getDb } from './db'
import { supabaseConfig } from './supabase'
import { fingerprintTables } from './syncCore'

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
  'settings'
]

// ترتيب الحذف على الخادم (الأبناء أولاً لاحترام المفاتيح الأجنبية)
const DELETE_ORDER: string[] = [
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
  'medicines',
  'patients',
  'users',
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
  'settings'
]

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
  const seq = await request(cfg, '/rpc/reset_sequences', { method: 'POST', body: '{}' })
  const seqOk = seq.ok
  return seqOk
    ? 'تم الاتصال بقاعدة بيانات Supabase Postgres بنجاح'
    : 'تم الاتصال، لكن الدالة reset_sequences غير موجودة (نفّذ ملف schema.sql في Supabase)'
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

export async function cloudRemoteFp(): Promise<{ hash: string; rows: number } | null> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('أدخل عنوان مشروع Supabase والمفتاح السري في الإعدادات أولاً')
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

export async function cloudPush(): Promise<string> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('أدخل عنوان مشروع Supabase والمفتاح السري في الإعدادات أولاً')
  console.log(`[SYNC:cloud] push يبدأ (المفتاح: ${maskedKey()}, الرابط: ${cfg.rest})`)

  // دمج النسخة المحلية في السحابة دون حذف صفوف أُنشئت من الجوال (upsert بالمعرّف)
  let count = 0
  const failed: string[] = []
  for (const t of INSERT_ORDER) {
    let rows: Record<string, unknown>[]
    try {
      rows = readLocalTable(t)
    } catch (e) {
      diagnoseCloud(`push/قراءة ${t}`, e)
      failed.push(t)
      continue
    }
    if (rows.length === 0) continue
    try {
      const res = await request(cfg, `/${t}`, {
        method: 'POST',
        headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify(rows)
      })
      if (!res.ok) {
        await fail(res)
      }
      count += rows.length
      console.log(`[SYNC:cloud] push ${t}: ${rows.length} صفاً ✓`)
    } catch (e) {
      diagnoseCloud(`push/${t}`, e)
      failed.push(t)
    }
  }

  // تصحيح تسلسلات المعرّفات على الخادم
  try {
    const res = await request(cfg, '/rpc/reset_sequences', { method: 'POST', body: '{}' })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.warn(`[SYNC:cloud] reset_sequences لم يُنفّذ (${res.status}): ${txt.slice(0, 160)} — تأكد من وجود الدالة في schema.sql`)
    } else {
      console.log('[SYNC:cloud] reset_sequences ✓')
    }
  } catch (e) {
    console.warn('[SYNC:cloud] reset_sequences فشل (غير مميت)', e instanceof Error ? e.message : e)
  }

  if (failed.length > 0) {
    const msg = `فشلت الجداول التالية: ${failed.join(', ')} — راجع السجل لتشخيص السبب`
    console.error(`[SYNC:cloud] push: ${msg}`)
    throw new Error(msg)
  }
  console.log(`[SYNC:cloud] push انتهى: ${count} صفاً في ${INSERT_ORDER.length} جداول`)
  return `تم رفع نسخة كاملة إلى Supabase Postgres (${count} صفاً في ${INSERT_ORDER.length} جداول)`
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

  // 1) نجلب كل الجداول أولاً؛ من فشل جلبُه نتجاوزه (لا نحذف محلياً ما لم نستطع قراءته)
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
    console.log('[SYNC:cloud] pull: جميع الجداول فارغة على السحابة — سأفرّغ النسخة المحلية')
  }

  const db = getDb()
  db.exec('BEGIN')
  let inserted = 0
  const badInsert: string[] = []
  try {
    for (const t of DELETE_ORDER) {
      if (!SYNC_TABLES.includes(t) || failed.includes(t)) continue
      try {
        db.prepare(`DELETE FROM \`${t}\``).run()
      } catch (e) {
        console.warn(`[SYNC:cloud] pull: تعذّر حذف ${t} محلياً — سأتخطاه`, e instanceof Error ? e.message : e)
      }
    }
    for (const t of INSERT_ORDER) {
      if (!SYNC_TABLES.includes(t) || failed.includes(t)) continue
      const recs = data[t]
      if (!recs || recs.length === 0) continue
      try {
        const cols = Object.keys(recs[0])
        const stmt = db.prepare(
          `INSERT INTO \`${t}\` (\`${cols.join('`,`')}\`) VALUES (${cols.map(() => '?').join(',')})`
        )
        for (const r of recs) {
          stmt.run(...cols.map((c) => normalizeValue(r[c])))
        }
        inserted += recs.length
      } catch (e) {
        diagnoseCloud(`pull/إدراج ${t}`, e)
        badInsert.push(t)
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  if (badInsert.length > 0) {
    const msg = `تعذّر إدراج الجداول المحلية: ${badInsert.join(', ')} — طابق الأعمدة مع schema.sql`
    console.error(`[SYNC:cloud] pull: ${msg}`)
    throw new Error(msg)
  }
  console.log(`[SYNC:cloud] pull انتهى: ${inserted} صفاً في ${Object.keys(data).length} جداول`)
  return `تم سحب نسخة كاملة من Supabase Postgres واستبدال قاعدة البيانات المحلية (${total} صف)`
}

function normalizeValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'object') return JSON.stringify(v)
  return v as string | number
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