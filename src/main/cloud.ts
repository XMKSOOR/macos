import { getDb, getSettings } from './db'
import { supabaseConfig } from './supabase'

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

function cloudConfig(): CloudConfig | null {
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

export async function cloudPush(): Promise<string> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('أدخل عنوان مشروع Supabase والمفتاح السري في الإعدادات أولاً')

  // دمج النسخة المحلية في السحابة دون حذف صفوف أُنشئت من الجوال (upsert بالمعرّف)
  let count = 0
  for (const t of INSERT_ORDER) {
    const rows = readLocalTable(t)
    if (rows.length === 0) continue
    count += rows.length
    const res = await request(cfg, `/${t}`, {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(rows)
    })
    if (!res.ok) await fail(res)
  }

  // تصحيح تسلسلات المعرّفات على الخادم
  await request(cfg, '/rpc/reset_sequences', { method: 'POST', body: '{}' })

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

  const data: Record<string, Record<string, unknown>[]> = {}
  let total = 0
  for (const t of SYNC_TABLES) {
    const rows = await fetchTable(cfg, t)
    if (rows.length === 0) continue
    data[t] = rows
    total += rows.length
  }
  if (total === 0) throw new Error('لا توجد بيانات على Supabase بعد — ارفع نسخة أولاً')

  const db = getDb()
  db.exec('BEGIN')
  try {
    for (const t of DELETE_ORDER) {
      if (SYNC_TABLES.includes(t)) db.prepare(`DELETE FROM \`${t}\``).run()
    }
    for (const t of INSERT_ORDER) {
      const recs = data[t]
      if (!recs || recs.length === 0) continue
      const cols = Object.keys(recs[0])
      const stmt = db.prepare(
        `INSERT INTO \`${t}\` (\`${cols.join('`,`')}\`) VALUES (${cols.map(() => '?').join(',')})`
      )
      for (const r of recs) {
        stmt.run(...cols.map((c) => normalizeValue(r[c])))
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return `تم سحب نسخة كاملة من Supabase Postgres واستبدال قاعدة البيانات المحلية (${total} صف)`
}

function normalizeValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'object') return JSON.stringify(v)
  return v as string | number
}

export async function cloudPushOnQuit(): Promise<void> {
  const s = getSettings()
  if ((s.supabase_pg_auto ?? '0') === '1' && cloudConfig()) {
    try {
      await cloudPush()
    } catch {
      /* best effort */
    }
  }
}

export async function cloudPullOnStart(): Promise<void> {
  const s = getSettings()
  if ((s.supabase_pg_auto ?? '0') !== '1' || !cloudConfig()) return
  if (process.env['SKIP_SYNC'] === '1') return
  const empty = ['patients', 'appointments', 'invoices'].every((t) => countLocal(t) === 0)
  if (!empty) return
  try {
    await cloudPull()
  } catch {
    /* keep local on failure */
  }
}