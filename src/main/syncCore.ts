import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { backupDatabase, getDb, getDbPath, replaceDbFrom } from './db'
import { DatabaseSync } from './sqlite'

export type TransportId = 'drive' | 'supabase'

export const SYNC_TABLES = [
  'users',
  'patients',
  'patient_medications',
  'medicines',
  'appointments',
  'catalog',
  'catalog_materials',
  'invoices',
  'invoice_items',
  'invoice_materials',
  'materials',
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
] as const

const STATE_PREFIX = 'sync_state_'
const MAX_LOCAL_BACKUPS = 10

export interface Fingerprint {
  hash: string
  rows: number
  perTable: Record<string, number>
}

export interface RemoteSnapshot {
  buf: Buffer
  hash: string
  rows: number
  uploadedAt: string
}

export interface Transport {
  id: TransportId
  label: string
  isConfigured(): boolean
  isConnected(): boolean
  fetchRemote(): Promise<RemoteSnapshot | null>
  pushRemote(buf: Buffer, meta: { hash: string; rows: number; uploadedAt: string }): Promise<void>
}

interface SyncState {
  lastSyncAt: string
  localHash: string
  remoteHash: string
  remoteRows: number
}

export type BlockCode = 'remote_richer' | 'conflict' | 'local_richer' | 'no_remote'

export interface SyncPlan {
  action: 'push' | 'pull' | 'none'
  reason: string
  local: Fingerprint
  remote: RemoteSnapshot | null
  blocked?: BlockCode
}

export interface SyncStatus {
  id: TransportId
  label: string
  configured: boolean
  connected: boolean
  lastSyncAt: string
  localRows: number
  localHash: string
  remoteRows: number | null
  remoteHash: string | null
  plan: SyncPlan | null
}

const registry = new Map<TransportId, Transport>()

export function registerTransport(t: Transport): void {
  registry.set(t.id, t)
}

export function getTransport(id: TransportId): Transport {
  const t = registry.get(id)
  if (!t) throw new Error('ناقل المزامنة غير معروف: ' + id)
  return t
}

export function activeTransportId(): TransportId | null {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key='sync_transport'").get() as
      | { value?: string }
      | undefined
    const v = row?.value ?? ''
    return v === 'drive' || v === 'supabase' ? v : null
  } catch {
    return null
  }
}

function stateKey(id: TransportId): string {
  return STATE_PREFIX + id
}

function readState(id: TransportId): SyncState | null {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(stateKey(id)) as
      | { value?: string }
      | undefined
    if (!row?.value) return null
    const p = JSON.parse(row.value) as Partial<SyncState>
    if (typeof p.localHash !== 'string' || typeof p.remoteHash !== 'string') return null
    return {
      lastSyncAt: String(p.lastSyncAt ?? ''),
      localHash: p.localHash,
      remoteHash: p.remoteHash,
      remoteRows: Number(p.remoteRows ?? 0)
    }
  } catch {
    return null
  }
}

function writeState(id: TransportId, s: SyncState): void {
  const db = getDb()
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(
    stateKey(id),
    JSON.stringify(s)
  )
}

export function readSyncState(id: string): SyncState | null {
  return readState(id as TransportId)
}

export function writeSyncState(id: string, s: SyncState): void {
  writeState(id as TransportId, s)
}
export function fingerprintSnapshot(buf: Buffer): { hash: string; rows: number } {
  let rows = 0
  const h = createHash('sha256')
  const probe = new (getDb().constructor as new (p: string) => { close(): void })('' + '')
  probe.close()
  return { hash: h.update(buf).digest('hex'), rows }
}

export function fingerprintTables(rowsByTable: Record<string, unknown[]>): Fingerprint {
  const h = createHash('sha256')
  const perTable: Record<string, number> = {}
  let rows = 0
  for (const t of SYNC_TABLES) {
    let rs = rowsByTable[t] ?? []
    if (t === 'settings') {
      rs = rs.filter((r) => {
        const k = (r as { key?: string }).key ?? ''
        return !k.startsWith(STATE_PREFIX) && k !== 'sync_transport'
      })
    }
    rs = [...rs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    perTable[t] = rs.length
    rows += rs.length
    h.update(t)
    h.update(' ')
    h.update(JSON.stringify(rs))
  }
  return { hash: h.digest('hex'), rows, perTable }
}

export function fingerprintDb(): Fingerprint {
  const db = getDb()
  const rowsByTable: Record<string, unknown[]> = {}
  for (const t of SYNC_TABLES) {
    try {
      rowsByTable[t] = db.prepare(`SELECT * FROM "${t}"`).all() as unknown[]
    } catch {
      rowsByTable[t] = []
    }
  }
  return fingerprintTables(rowsByTable)
}
export function snapshotBuffer(): Buffer {
  const tmp = join(getDbPath(), '..', `.sync-snapshot-${Date.now()}.db`)
  backupDatabase(tmp)
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const buf = readFileSync(tmp)
  try {
    unlinkSync(tmp)
  } catch {
    /* ignore */
  }
  return buf
}

export function snapshotFingerprint(buf: Buffer): { hash: string; rows: number } {
  const tmp = join(getDbPath(), '..', `.sync-fp-${Date.now()}.db`)
  const { writeFileSync } = require('node:fs') as typeof import('node:fs')
  writeFileSync(tmp, buf)
  try {
    const probe = new DatabaseSync(tmp)
    try {
      const rowsByTable: Record<string, unknown[]> = {}
      for (const t of SYNC_TABLES) {
        try {
          rowsByTable[t] = probe.prepare(`SELECT * FROM "${t}"`).all() as unknown[]
        } catch {
          rowsByTable[t] = []
        }
      }
      const fp = fingerprintTables(rowsByTable)
      return { hash: fp.hash, rows: fp.rows }
    } finally {
      probe.close()
    }
  } catch (e) {
    console.error('[SYNC:core] snapshotFingerprint فشل فتح النسخة — سيُستخدم fallback للهاش', e)
    return { hash: createHash('sha256').update(buf).digest('hex'), rows: 0 }
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}
export function planSync(id: TransportId, remote: RemoteSnapshot | null, local = fingerprintDb()): SyncPlan {
  const state = readState(id)

  if (!remote) {
    return { action: 'push', reason: 'لا توجد نسخة على البعيد — سيتم رفع نسخة هذا الجهاز', local, remote: null }
  }

  if (!state || !state.lastSyncAt) {
    if (remote.rows > local.rows) {
      return {
        action: 'none',
        reason:
          'توقف: النسخة البعيدة تحتوي بيانات أكثر من هذا الجهاز (' +
          remote.rows +
          ' مقابل ' +
          local.rows +
          ' صف). اسحب أولاً لمنع الكتابة فوق بيانات العيادة.',
        local,
        remote,
        blocked: 'remote_richer'
      }
    }
    return {
      action: 'push',
      reason: 'أول مزامنة — بيانات هذا الجهاز هي المصدر',
      local,
      remote
    }
  }

  const remoteChanged = remote.hash !== state.remoteHash
  const localChanged = local.hash !== state.localHash

  if (remoteChanged && localChanged) {
    return {
      action: 'none',
      reason:
        'توقف: تعديلات على الجهازين — الجهاز البعيد تغيّر منذ آخر مزامنة، وهذا الجهاز تغيّر أيضاً. ' +
        'اختر «سحب» أو «رفع» يدوياً بعد أخذ نسخة احتياطية.',
      local,
      remote,
      blocked: 'conflict'
    }
  }

  if (remoteChanged && !localChanged) {
    return { action: 'pull', reason: 'النسخة البعيدة أحدث — سيتم السحب', local, remote }
  }

  if (!remoteChanged && localChanged) {
    return { action: 'push', reason: 'تعديلات محلية — سيتم الرفع', local, remote }
  }

  return { action: 'none', reason: 'الجهازان متطابقان — لا حاجة لمزامنة', local, remote }
}

function backupBeforePull(id: TransportId): string {
  const dir = join(getDbPath(), '..', 'sync-backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(dir, `pre-${id}-${stamp}.db`)
  backupDatabase(dest)
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  for (const old of files.slice(MAX_LOCAL_BACKUPS)) {
    try {
      unlinkSync(join(dir, old.f))
    } catch {
      /* ignore */
    }
  }
  return dest
}

export interface SyncResult {
  message: string
  action: 'push' | 'pull' | 'none'
  localRows: number
  remoteRows: number | null
  backupPath?: string
}

async function withRemote<T>(id: TransportId, fn: (t: Transport, remote: RemoteSnapshot | null) => Promise<T>): Promise<T> {
  const t = getTransport(id)
  if (!t.isConfigured()) throw new Error('ناقل المزامنة غير مُهيّأ — أكمل إعداداته أولاً')
  if (!t.isConnected()) throw new Error('لا يوجد اتصال بـ ' + t.label + ' — أكمل خطوات الربط')
  let remote: RemoteSnapshot | null = null
  try {
    remote = await t.fetchRemote()
  } catch {
    remote = null
  }
  return fn(t, remote)
}

export async function syncPush(id: TransportId, opts: { force?: boolean } = {}): Promise<SyncResult> {
  return withRemote(id, async (t, remote) => {
    const local = fingerprintDb()
    const plan = planSync(id, remote, local)

    if (plan.blocked && !opts.force) {
      throw new Error(plan.reason + ' (للمتابعة رغم ذلك استخدم force)')
    }
    if (plan.action === 'none' && !opts.force) {
      return {
        message: plan.reason,
        action: 'none' as const,
        localRows: local.rows,
        remoteRows: remote?.rows ?? null
      }
    }

    const buf = snapshotBuffer()
    const uploadedAt = new Date().toISOString()
    await t.pushRemote(buf, { hash: local.hash, rows: local.rows, uploadedAt })
    writeState(id, {
      lastSyncAt: uploadedAt,
      localHash: local.hash,
      remoteHash: local.hash,
      remoteRows: local.rows
    })
    return {
      message: 'تم رفع نسخة إلى ' + t.label + ' (' + local.rows + ' صف)',
      action: 'push',
      localRows: local.rows,
      remoteRows: local.rows
    }
  })
}

export async function syncPull(id: TransportId, opts: { force?: boolean } = {}): Promise<SyncResult> {
  return withRemote(id, async (t, remote) => {
    const local = fingerprintDb()
    if (!remote) throw new Error('لا توجد نسخة على ' + t.label + ' — ارفع نسخة أولاً')

    const state = readState(id)
    const neverSynced = !state || !state.lastSyncAt
    if (neverSynced && local.rows > remote.rows && !opts.force) {
      throw new Error(
        'توقف: هذا الجهاز يحتوي بيانات أكثر من البعيد (' +
          local.rows +
          ' مقابل ' +
          remote.rows +
          ' صف). السحب سيمسح بياناتك المحلية. اضغط سحب مع force فقط إذا كنت متأكداً.'
      )
    }

    const remoteFp = snapshotFingerprint(remote.buf)
    if (remoteFp.hash === local.hash) {
      writeState(id, {
        lastSyncAt: new Date().toISOString(),
        localHash: local.hash,
        remoteHash: remote.hash,
        remoteRows: remote.rows
      })
      return {
        message: 'الجهازان متطابقان — لا حاجة لسحب',
        action: 'none',
        localRows: local.rows,
        remoteRows: remote.rows
      }
    }

    const backupPath = backupBeforePull(id)
    const tmp = join(getDbPath(), '..', `.sync-pull-${Date.now()}.db`)
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    writeFileSync(tmp, remote.buf)
    try {
      replaceDbFrom(tmp)
    } finally {
      try {
        unlinkSync(tmp)
      } catch {
        /* ignore */
      }
    }

    writeState(id, {
      lastSyncAt: new Date().toISOString(),
      localHash: remoteFp.hash,
      remoteHash: remote.hash,
      remoteRows: remote.rows
    })
    return {
      message: 'تم استبدال البيانات من ' + t.label + ' (' + remoteFp.rows + ' صف)',
      action: 'pull',
      localRows: remoteFp.rows,
      remoteRows: remote.rows,
      backupPath
    }
  })
}

export async function syncStatus(id: TransportId): Promise<SyncStatus> {
  const t = getTransport(id)
  const local = fingerprintDb()
  const state = readState(id)
  let remote: RemoteSnapshot | null = null
  if (t.isConfigured() && t.isConnected()) {
    try {
      remote = await t.fetchRemote()
    } catch {
      remote = null
    }
  }
  return {
    id,
    label: t.label,
    configured: t.isConfigured(),
    connected: t.isConnected(),
    lastSyncAt: state?.lastSyncAt ?? '',
    localRows: local.rows,
    localHash: local.hash,
    remoteRows: remote?.rows ?? null,
    remoteHash: remote?.hash ?? null,
    plan: t.isConfigured() && t.isConnected() ? planSync(id, remote, local) : null
  }
}

export async function syncAutoStart(): Promise<void> {
  const id = activeTransportId()
  if (!id) return
  try {
    const t = getTransport(id)
    if (!t.isConfigured() || !t.isConnected()) return
    let remote: RemoteSnapshot | null = null
    try {
      remote = await t.fetchRemote()
    } catch {
      return
    }
    const plan = planSync(id, remote)
    if (plan.action === 'pull') await syncPull(id)
  } catch {
    /* best effort */
  }
}

export async function syncAutoQuit(): Promise<void> {
  const id = activeTransportId()
  if (!id) return
  try {
    const t = getTransport(id)
    if (!t.isConfigured() || !t.isConnected()) return
    const remote = await t.fetchRemote().catch(() => null)
    const plan = planSync(id, remote)
    if (plan.action === 'push') await syncPush(id)
  } catch {
    /* best effort */
  }
}