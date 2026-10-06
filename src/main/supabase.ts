import { StorageClient } from '@supabase/storage-js'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getDb, getSettings, replaceDbFrom } from './db'
import { fingerprintDb, snapshotBuffer } from './syncCore'

const BUCKET = 'dental-clinic-db'
const DB_FILE = 'clinic.db'
const META_FILE = 'clinic-meta.json'

export interface SupabaseConfig {
  url: string
  key: string
}

export function supabaseConfig(): SupabaseConfig | null {
  const s = getSettings()
  const url = ((s.supabase_url ?? '').trim() || (process.env['SUPABASE_URL'] ?? '').trim()).replace(/\/+$/, '')
  const key =
    (s.supabase_key ?? '').trim() ||
    (process.env['SUPABASE_SECRET_KEY'] ?? process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '').trim()
  if (!url || !key) return null
  return { url, key }
}

let client: StorageClient | null = null
let clientKey = ''

function getClient(): StorageClient {
  const cfg = supabaseConfig()
  if (!cfg) throw new Error('أدخل عنوان المشروع والمفتاح السري لـ Supabase في الإعدادات أولاً')
  const stamp = cfg.url + '|' + cfg.key
  if (!client || clientKey !== stamp) {
    client = new StorageClient(cfg.url + '/storage/v1', {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`
    })
    clientKey = stamp
  }
  return client
}

async function ensureBucket(c: StorageClient): Promise<void> {
  const { data, error } = await c.listBuckets()
  if (error) throw new Error(error.message)
  const exists = data?.some((b) => b.name === BUCKET)
  if (!exists) {
    const { error: e2 } = await c.createBucket(BUCKET, { public: false })
    if (e2 && !/exist/i.test(e2.message)) throw new Error(e2.message)
  }
}

export async function supabaseTest(): Promise<string> {
  const c = getClient()
  const { error } = await c.listBuckets()
  if (error) throw new Error(error.message)
  await ensureBucket(c)
  return 'تم الاتصال بـ Supabase بنجاح'
}

export async function supabasePush(): Promise<string> {
  const c = getClient()
  await ensureBucket(c)
  const fp = fingerprintDb()
  const buf = snapshotBuffer()
  const { error } = await c.from(BUCKET).upload(DB_FILE, new Uint8Array(buf), {
    upsert: true,
    contentType: 'application/vnd.sqlite3'
  })
  if (error) throw new Error(error.message)
  const meta = JSON.stringify({ hash: fp.hash, rows: fp.rows, uploadedAt: new Date().toISOString() })
  const { error: e2 } = await c.from(BUCKET).upload(META_FILE, meta, {
    upsert: true,
    contentType: 'application/json'
  })
  if (e2) throw new Error(e2.message)
  return `تم رفع نسخة كاملة إلى Supabase (${fp.rows} صف)`
}

export async function supabasePull(): Promise<string> {
  const c = getClient()
  await ensureBucket(c)
  const { data: files, error } = await c.from(BUCKET).list('')
  if (error) throw new Error(error.message)
  if (!files?.some((f) => f.name === DB_FILE)) {
    throw new Error('لا توجد نسخة على Supabase بعد — ارفع نسخة أولاً')
  }
  const { data: blob, error: e2 } = await c.from(BUCKET).download(DB_FILE)
  if (e2) throw new Error(e2.message)
  if (!blob) throw new Error('تعذّر تنزيل النسخة من Supabase')
  const tmp = join(app.getPath('temp'), `supabase-pull-${Date.now()}.db`)
  writeFileSync(tmp, Buffer.from(await blob.arrayBuffer()))
  try {
    replaceDbFrom(tmp)
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
  const { rows } = fingerprintDb()
  return `تم سحب نسخة كاملة من Supabase واستبدال قاعدة البيانات المحلية (${rows} صف)`
}

export async function supabasePushOnQuit(): Promise<void> {
  const s = getSettings()
  if ((s.supabase_auto ?? '0') === '1' && supabaseConfig()) {
    try {
      await supabasePush()
    } catch {
      /* best effort */
    }
  }
}

export async function supabasePullOnStart(): Promise<void> {
  const s = getSettings()
  if ((s.supabase_auto ?? '0') !== '1' || !supabaseConfig()) return
  if (process.env['SKIP_SYNC'] === '1') return
  const db = getDb()
  let rows = 0
  for (const t of ['patients', 'appointments', 'invoices']) {
    try {
      const r = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }
      rows += Number(r?.c ?? 0)
    } catch {
      /* ignore */
    }
  }
  if (rows > 0) return
  try {
    await supabasePull()
  } catch {
    /* keep local on failure */
  }
}