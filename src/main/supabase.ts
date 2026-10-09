import { StorageClient } from '@supabase/storage-js'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { backupDatabase, getDb, getDbPath, getSettings, replaceDbFrom } from './db'
import { fingerprintDb, snapshotBuffer, snapshotFingerprint } from './syncCore'

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

const STATE_KEY = 'sync_state_supabase_last'
const MAX_BACKUPS = 10

interface SupaState {
  localHash: string
  remoteHash: string
  at: string
}

function readState(): SupaState | null {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(STATE_KEY) as
      | { value?: string }
      | undefined
    if (!row?.value) return null
    const p = JSON.parse(row.value) as Partial<SupaState>
    if (typeof p.localHash !== 'string' || typeof p.remoteHash !== 'string') return null
    return { localHash: p.localHash, remoteHash: p.remoteHash, at: String(p.at ?? '') }
  } catch {
    return null
  }
}

function writeState(localHash: string, remoteHash: string): void {
  try {
    getDb()
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      )
      .run(STATE_KEY, JSON.stringify({ localHash, remoteHash, at: new Date().toISOString() }))
  } catch {
    /* ignore */
  }
}

function backupBeforeImport(): void {
  try {
    const dir = join(getDbPath(), '..', 'sync-backups')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backupDatabase(join(dir, `pre-supabase-${stamp}.db`))
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
    for (const old of files.slice(MAX_BACKUPS)) {
      try {
        unlinkSync(join(dir, old.f))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* backup is best-effort */
  }
}

async function fetchRemoteBuffer(): Promise<Buffer | null> {
  const c = getClient()
  await ensureBucket(c)
  const { data: files, error } = await c.from(BUCKET).list('')
  if (error) throw new Error(error.message)
  if (!files?.some((f) => f.name === DB_FILE)) return null
  const { data: blob, error: e2 } = await c.from(BUCKET).download(DB_FILE)
  if (e2) throw new Error(e2.message)
  if (!blob) return null
  return Buffer.from(await blob.arrayBuffer())
}

function applyRemoteBuffer(buf: Buffer): void {
  backupBeforeImport()
  const tmp = join(app.getPath('temp'), `supabase-pull-${Date.now()}.db`)
  writeFileSync(tmp, buf)
  try {
    replaceDbFrom(tmp)
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
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
  writeState(fp.hash, fp.hash)
  return `تم رفع نسخة كاملة إلى Supabase (${fp.rows} صف)`
}

export async function supabasePull(): Promise<string> {
  const buf = await fetchRemoteBuffer()
  if (!buf) throw new Error('لا توجد نسخة على Supabase بعد — ارفع نسخة أولاً')
  applyRemoteBuffer(buf)
  const fp = fingerprintDb()
  writeState(fp.hash, fp.hash)
  return `تم سحب نسخة كاملة من Supabase واستبدال قاعدة البيانات المحلية (${fp.rows} صف)`
}

export async function supabasePushOnQuit(): Promise<void> {
  if (process.env['SKIP_SYNC'] === '1') return
  if (!supabaseConfig()) return
  try {
    await supabasePush()
  } catch {
    /* best effort */
  }
}

/**
 * عند تشغيل البرنامج: استيراد نسخة قاعدة البيانات من Supabase Storage.
 * يحمي التعديلات المحلية غير المرفوعة (لا يستبدل بيانات أحدث محلياً).
 */
export async function supabasePullOnStart(): Promise<void> {
  if (process.env['SKIP_SYNC'] === '1') return
  if (!supabaseConfig()) return

  let buf: Buffer | null = null
  try {
    buf = await fetchRemoteBuffer()
  } catch {
    return // لا اتصال / لا صلاحية — نُبقي النسخة المحلية
  }

  const local = fingerprintDb()

  // لا توجد نسخة على البعيد: ارفع نسخة هذا الجهاز إن كان فيه بيانات
  if (!buf) {
    if (local.rows > 0) {
      try {
        await supabasePush()
      } catch {
        /* best effort */
      }
    }
    return
  }

  const remoteFp = snapshotFingerprint(buf)
  if (remoteFp.hash === local.hash) {
    writeState(local.hash, remoteFp.hash)
    return
  }

  const st = readState()
  const localChanged = !st || st.localHash !== local.hash
  const remoteChanged = !st || st.remoteHash !== remoteFp.hash

  let action: 'push' | 'pull'
  if (!st) {
    // أول مزامنة: الأغنى بيانات هو المصدر
    action = local.rows === 0 || remoteFp.rows > local.rows ? 'pull' : 'push'
  } else if (remoteChanged && !localChanged) {
    action = 'pull'
  } else if (localChanged && !remoteChanged) {
    action = 'push'
  } else {
    // تغيّر الطرفان — جهاز العيادة (المحلي) هو المرجع
    action = 'push'
  }

  try {
    if (action === 'pull') {
      applyRemoteBuffer(buf)
      const fp = fingerprintDb()
      writeState(fp.hash, remoteFp.hash)
    } else {
      await supabasePush()
    }
  } catch {
    /* best effort */
  }
}