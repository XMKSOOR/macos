import { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { backupDatabase, getDb, getDbPath, getSettings } from './db'
import { fingerprintDb, readSyncState, writeSyncState, SYNC_TABLES } from './syncCore'
import { driveRemote, driveUpload, driveDownload } from './sync'
import { mysqlConfig, mysqlPush, mysqlPull, mysqlRemoteFp, mysqlPullChanged, resetMysqlPullChanged, mysqlSync } from './mysql'
import { supabaseConfig, supabasePush, supabasePull, supabaseRemoteFp } from './supabase'
import { cloudConfig, cloudPush, cloudPull, cloudRemoteFp, cloudPullChanged, resetCloudPullChanged, cloudSync } from './cloud'
import { clearAllBaselines } from './syncDelta'

const DEBOUNCE_MS = 3000
const PERIOD_MS = 60 * 1000
const UNIT_TIMEOUT_MS = 25 * 1000
const MAX_BACKUPS = 10

const TIMEOUT = Symbol('timeout')

let debounceTimer: NodeJS.Timeout | null = null
let periodTimer: NodeJS.Timeout | null = null
let notifyTimer: NodeJS.Timeout | null = null
let lastMutationAt = 0
let running = false
let pending = false

interface RemoteFp {
  hash: string
  rows: number
}

interface SyncUnit {
  id: string
  autoOn: () => boolean
  whyOff?: () => string
  fetchRemote: () => Promise<RemoteFp | null>
  push: () => Promise<void>
  pull: () => Promise<void>
  /** مزامنة ثنائية الاتجاه (سحب ثم رفع) — تُعيد عدد الصفوف التي غيّرها السحب */
  sync?: () => Promise<number>
  /** عدد الصفوف التي غيّرها آخر سحب فعلياً (يُستعمل لتحديد هل نُعيد تحميل الواجهة) */
  pullChanged?: () => number
}

function logUnit(u: SyncUnit, msg: string): void {
  console.log(`[SYNC:${u.id}] ${msg}`)
}

function errUnit(u: SyncUnit, fn: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error && err.stack ? err.stack : ''
  console.error(`[SYNC:${u.id}] ${fn} فشل: ${msg}`)
  if (process.env['SYNC_TRACE'] === '1' && stack) console.error(`[SYNC:${u.id}] ${fn} STACK\n${stack}`)
}

/** مرة واحدة: يُحذّر من الجداول المحلية غير المشمولة بقوائم المزامنة */
let schemaWarned = false
function warnUnsyncedTables(): void {
  if (schemaWarned) return
  schemaWarned = true
  try {
    const rows = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as unknown as { name: string }[]
    const missing = rows.map((r) => r.name).filter((t) => !(SYNC_TABLES as readonly string[]).includes(t))
    if (missing.length > 0) {
      console.warn(
        `[SYNC] الجداول التالية موجودة محلياً لكنها ليست ضمن نطاق المزامنة (${missing.length}): ${missing.join(', ')} — أي تعديل فيها لن يُرفع إلى السحابة. أضفها إلى SYNC_TABLES وأعد إنشاء الجداول المطابقة في Supabase حسب الحاجة.`
      )
    }
  } catch {
    /* ignore */
  }
}

function units(): SyncUnit[] {
  const s = getSettings()
  return [
    {
      id: 'drive',
      autoOn: () =>
        (s.drive_auto ?? '0') === '1' && !!(s.drive_client_id ?? '').trim() && !!(s.drive_client_secret ?? '').trim(),
      whyOff: () =>
        (s.drive_auto ?? '0') !== '1'
          ? 'drive_auto != 1'
          : 'مفاتيح Google Drive غير مكتملة في الإعدادات',
      fetchRemote: async () => driveRemote(),
      push: async () => {
        await driveUpload()
      },
      pull: async () => {
        await driveDownload()
      },
      pullChanged: () => 1
    },
    {
      id: 'mysql',
      autoOn: () => {
        if ((s.mysql_auto ?? '0') !== '1') return false
        const cfg = mysqlConfig()
        if (!cfg) return false
        // عنوان Postgres (مثل Supabase pooler) لا يعمل مع بروتوكول MySQL — نُعطّله
        return !/supabase|pooler/i.test(cfg.host)
      },
      whyOff: () => {
        if ((s.mysql_auto ?? '0') !== '1') return 'mysql_auto != 1'
        const cfg = mysqlConfig()
        if (!cfg) return 'بيانات اتصال MySQL غير مكتملة'
        if (/supabase|pooler/i.test(cfg.host))
          return 'عنوان MySQL يشير إلى Postgres (Supabase pooler) — أدخل بيانات MySQL حقيقية أو عطّل مزامنة MySQL'
        return 'غير مفعّل'
      },
      fetchRemote: mysqlRemoteFp,
      push: async () => {
        await mysqlPush()
      },
      pull: async () => {
        await mysqlPull()
      },
      sync: () => mysqlSync(),
      pullChanged: () => mysqlPullChanged()
    },
    {
      id: 'supabase',
      autoOn: () => (s.supabase_auto ?? '0') === '1' && !!supabaseConfig() && !cloudConfig(),
      whyOff: () => {
        if ((s.supabase_auto ?? '0') !== '1') return 'supabase_auto != 1'
        if (!!cloudConfig()) return 'مزامنة Postgres مفعّلة — نسخة الملفات (bucket) لا تُفعّل معها لتجنّب استبدال ملف القاعدة'
        return 'لا يوجد رابط/مفتاح Supabase (تحقق من .env أو resources/app.env أو الإعدادات)'
      },
      fetchRemote: supabaseRemoteFp,
      push: async () => {
        await supabasePush()
      },
      pull: async () => {
        await supabasePull()
      },
      pullChanged: () => 1
    },
    {
      id: 'cloud',
      autoOn: () => (s.supabase_pg_auto ?? '0') === '1' && !!cloudConfig(),
      whyOff: () =>
        (s.supabase_pg_auto ?? '0') !== '1'
          ? 'supabase_pg_auto != 1'
          : 'لا يوجد رابط/مفتاح Supabase (تحقق من .env أو resources/app.env أو الإعدادات)',
      fetchRemote: cloudRemoteFp,
      push: async () => {
        await cloudPush()
      },
      pull: async () => {
        await cloudPull()
      },
      sync: () => cloudSync(),
      pullChanged: () => cloudPullChanged()
    }
  ]
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([
    p,
    new Promise<T | typeof TIMEOUT>((resolve) => {
      setTimeout(() => resolve(TIMEOUT), ms)
    })
  ])
}

function backupBeforePull(id: string): void {
  try {
    const dir = join(getDbPath(), '..', 'sync-backups')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backupDatabase(join(dir, `pre-${id}-${stamp}.db`))
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

function storeState(id: string, remoteHash: string, remoteRows: number): void {
  const fp = fingerprintDb()
  writeSyncState(id, {
    lastSyncAt: new Date().toISOString(),
    localHash: fp.hash,
    remoteHash: remoteHash || fp.hash,
    remoteRows
  })
}

async function runUnit(u: SyncUnit): Promise<'push' | 'pull' | 'none' | 'error'> {
  let remote: RemoteFp | null
  try {
    const res = await withTimeout(u.fetchRemote(), UNIT_TIMEOUT_MS)
    if (res === TIMEOUT) {
      logUnit(u, `مهلة fetchRemote (${UNIT_TIMEOUT_MS}ms) انتهت — تجاوز هذه الدورة`)
      return 'error'
    }
    remote = res
    logUnit(u, remote ? `نسخة بعيدة موجودة rows=${remote.rows} hash=${remote.hash.slice(0, 12)}…` : 'لا توجد نسخة بعيدة بعد — سأرفع المحلي')
  } catch (e) {
    errUnit(u, 'fetchRemote', e)
    return 'error'
  }

  const local = fingerprintDb()
  const state = readSyncState(u.id)

  // أمان: البعيد الفارغ (لا نسخة) يعني «لا شيء على السحابة» — نبنيه بالرفع ولا ندمج نسخة
  // فارغة في المحلي، وإلّا لحذف الدمج الصفوف المحلية غير المتغيّرة (كارثة بعد إعادة إنشاء المخطط).
  if (!remote) {
    const res = await withTimeout(u.push(), UNIT_TIMEOUT_MS)
    if (res === TIMEOUT) {
      logUnit(u, `مهلة push (${UNIT_TIMEOUT_MS}ms) انتهت (لا نسخة بعيدة)`)
      return 'error'
    }
    storeState(u.id, local.hash, local.rows)
    logUnit(u, 'لا نسخة بعيدة — رُفع المحلي لبناء السحابة ✓')
    return 'push'
  }

  // مزامنة ثنائية الاتجاه للنقلات القائمة (Postgres/MySQL): تنتقل التعديلات والحذوفات
  // في الاتجاهين معاً بدل «رفع أو سحب» الذي كان يُلغي تعديل أحد الجهازين.
  if (u.sync && state && state.lastSyncAt) {
    const remoteChanged = (remote?.hash ?? '') !== state.remoteHash
    const localChanged = local.hash !== state.localHash
    if (!remoteChanged && !localChanged) {
      storeState(u.id, remote?.hash ?? '', remote?.rows ?? 0)
      logUnit(u, 'لا تغييرات على الجهازين — بلا عمل')
      return 'none'
    }
    const changed = await withTimeout(u.sync(), UNIT_TIMEOUT_MS)
    if (changed === TIMEOUT) {
      logUnit(u, `مهلة sync (${UNIT_TIMEOUT_MS}ms) انتهت`)
      return 'error'
    }
    storeState(u.id, remote?.hash ?? '', remote?.rows ?? 0)
    logUnit(u, `sync اكتمل ✓ (سحب ${changed} صفاً)`)
    return changed > 0 ? 'pull' : 'push'
  }

  let action: 'push' | 'pull'
  if (!remote) {
    // لا توجد نسخة على البعيد — نرفع نسخة هذا الجهاز لتأسيس المزامنة
    action = 'push'
  } else if (!state || !state.lastSyncAt) {
    // أول مزامنة: النسخة الأغنى بيانات هي المصدر، والجهاز المحلي مصان
    if (remote.hash === local.hash) {
      storeState(u.id, remote.hash, remote.rows)
      logUnit(u, 'أول مزامنة: الهاشان متطابقان — بلا عمل')
      return 'none'
    }
    action = remote.rows > local.rows ? 'pull' : 'push'
  } else {
    const remoteChanged = remote.hash !== state.remoteHash
    const localChanged = local.hash !== state.localHash
    if (remoteChanged && localChanged) {
      // تغيّر الجهازان — جهاز العيادة المحلي هو المرجع: نرفع المحلي
      action = 'push'
    } else if (remoteChanged && !localChanged) {
      action = 'pull'
    } else if (!remoteChanged && localChanged) {
      action = 'push'
    } else {
      storeState(u.id, remote.hash, remote.rows)
      logUnit(u, 'لا تغييرات — بلا عمل')
      return 'none'
    }
  }

  logUnit(
    u,
    `قرّرت ${action.toUpperCase()} (local rows=${local.rows} hash=${local.hash.slice(0, 12)}… / remote rows=${remote?.rows ?? 0})`
  )

  if (action === 'push') {
    const res = await withTimeout(u.push(), UNIT_TIMEOUT_MS)
    if (res === TIMEOUT) {
      logUnit(u, `مهلة push (${UNIT_TIMEOUT_MS}ms) انتهت`)
      return 'error'
    }
    storeState(u.id, local.hash, local.rows)
    logUnit(u, 'push اكتمل ✓')
    return 'push'
  }

  if (!remote) return 'error'
  backupBeforePull(u.id)
  const res = await withTimeout(u.pull(), UNIT_TIMEOUT_MS)
  if (res === TIMEOUT) {
    logUnit(u, `مهلة pull (${UNIT_TIMEOUT_MS}ms) انتهت`)
    return 'error'
  }
  storeState(u.id, remote.hash, remote.rows)
  logUnit(u, 'pull اكتمل ✓')
  return 'pull'
}

function notifyRendererRefreshed(changed: number): void {
  if (notifyTimer) return
  // لا نقاطع المستخدم أثناء الكتابة: ننتظر حتى يهدأ التفاعل قبل تحديث الواجهة
  const wait = Math.max(0, lastMutationAt + 5000 - Date.now())
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('sync:refreshed', { at: new Date().toISOString(), changed })
      } catch {
        /* ignore */
      }
    }
  }, wait)
}

export async function syncAll(): Promise<void> {
  if (process.env['SKIP_SYNC'] === '1') return
  warnUnsyncedTables()
  const started = Date.now()
  const us = units()
  const enabled = us.filter((u) => u.autoOn()).map((u) => u.id)
  console.log(`[SYNC] بدء دورة مزامنة — النواقل المفعّلة: ${enabled.length ? enabled.join(', ') : '(لا شيء)'}`)
  resetCloudPullChanged()
  resetMysqlPullChanged()
  let pullChanged = 0
  for (const u of us) {
    if (!u.autoOn()) {
      console.log(`[SYNC:${u.id}] معطّل: ${u.whyOff ? u.whyOff() : 'غير مفعّل'}`)
      continue
    }
    try {
      const r = await runUnit(u)
      if (r === 'pull') pullChanged += u.pullChanged ? u.pullChanged() : 1
    } catch (e) {
      // runUnit يمسك الأخطاء داخلياً؛ هذه شبكة أمان إضافية حتى لا يتوقف المحرك
      errUnit(u, 'runUnit', e)
    }
  }
  console.log(`[SYNC] انتهت دورة المزامنة في ${Math.round(Date.now() - started)}ms`)
  // إعادة تحميل الواجهة فقط إذا غيّر السحب بيانات فعلية — لا أقفّل التطبيق بلا سبب
  if (pullChanged > 0) notifyRendererRefreshed(pullChanged)
}

async function runAutoSync(): Promise<void> {
  if (running) {
    pending = true
    return
  }
  running = true
  try {
    await syncAll()
  } finally {
    running = false
  }
  if (pending) {
    pending = false
    markDirty()
  }
}

export function markDirty(): void {
  lastMutationAt = Date.now()
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runAutoSync()
  }, DEBOUNCE_MS)
}

/**
 * بعد استعادة نسخة احتياطية (من هذا الجهاز أو أي جهاز آخر): نجعل النسخة المستعادة هي
 * المرجع. نصفّر بصمات المزامنة (baselines) وحالات النواقل حتى تُرفع كل الصفوف المستعادة
 * إلى السحابة، ثم تنتشر تلقائياً إلى بقية الأجهزة (ويندوز/ماك/الجوال) في الدورة التالية.
 * تُستدعى قبل markDirty (الذي يُستدعى تلقائياً بعد قناة db:restore).
 */
export function resetSyncForRestore(): void {
  clearAllBaselines()
  const now = new Date().toISOString()
  for (const id of ['drive', 'mysql', 'supabase', 'cloud'] as const) {
    try {
      // حالة «تغيّر الطرفان» تُجبر المحرك على المزامنة (الثنائية للنواقل القائمة، والرفع لغيرها)
      writeSyncState(id, { lastSyncAt: now, localHash: '', remoteHash: '', remoteRows: 0 })
    } catch {
      /* ignore */
    }
  }
  console.log('[SYNC] أُعيدت تهيئة حالات المزامنة بعد استعادة نسخة احتياطية — النسخة المستعادة هي المرجع')
}

export function startAutoSync(): void {
  if (periodTimer) return
  periodTimer = setInterval(() => {
    void runAutoSync()
  }, PERIOD_MS)
}

export async function syncAllOnStart(): Promise<void> {
  console.log('[SYNC] syncAllOnStart يبدأ بعد إقلاع التطبيق')
  await runAutoSync()
  console.log('[SYNC] syncAllOnStart اكتمل')
}

export async function syncAllOnQuit(): Promise<void> {
  if (process.env['SKIP_SYNC'] === '1') return
  console.log('[SYNC] syncAllOnQuit يبدأ قبل إغلاق التطبيق')
  try {
    await syncAll()
  } catch (e) {
    console.error('[SYNC] syncAllOnQuit فشل:', e instanceof Error ? e.message : e)
  }
  console.log('[SYNC] syncAllOnQuit اكتمل')
}