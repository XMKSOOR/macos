import mysql from 'mysql2/promise'
import { getDb, getSettings } from './db'
import { fingerprintTables, DELETE_ORDER, INSERT_ORDER, SYNC_TABLES, runExclusive } from './syncCore'
import { planPush, saveBaseline, mergeIntoLocal, pkColumn, clearBaselines } from './syncDelta'

const TRANSPORT = 'mysql'

let lastPullChanged = 0

export interface MysqlConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export function mysqlConfig(): MysqlConfig | null {
  const s = getSettings()
  const host = (s.mysql_host ?? '').trim()
  const database = (s.mysql_db ?? '').trim()
  const user = (s.mysql_user ?? '').trim()
  if (!host || !database || !user) return null
  return {
    host,
    port: Number(s.mysql_port || 3306),
    database,
    user,
    password: s.mysql_secret ?? ''
  }
}

async function connect(): Promise<mysql.Connection> {
  const cfg = mysqlConfig()
  if (!cfg) throw new Error('أدخل بيانات الاستضافة السحابية في الإعدادات أولاً')
  const c = await mysql.createConnection({ ...cfg, connectTimeout: 15000, charset: 'utf8mb4' })
  await c.query("SET NAMES utf8mb4")
  return c
}

interface ColInfo {
  name: string
  type: string
  pk: number
}

function localTables(): { name: string; cols: ColInfo[] }[] {
  const db = getDb()
  const out: { name: string; cols: ColInfo[] }[] = []
  for (const t of SYNC_TABLES) {
    const cols = db.prepare(`PRAGMA table_info(\`${t}\`)`).all() as unknown as ColInfo[]
    if (cols.length) out.push({ name: t, cols })
  }
  return out
}

function mysqlType(t: string): string {
  const up = (t || 'TEXT').toUpperCase()
  if (up.includes('INT')) return 'INT'
  if (up.includes('REAL')) return 'DOUBLE'
  if (up.includes('BLOB')) return 'LONGBLOB'
  return 'TEXT'
}

/** عمود المفتاح الأساسي في SQLite (id لكل الجداول، key لجدول الإعدادات) */
function pkOf(cols: ColInfo[]): ColInfo | undefined {
  return cols.find((c) => c.pk === 1)
}

/** نوع MySQL الآمن للمفتاح النصّي UUID: VARCHAR بدل TEXT حتى يقبل PRIMARY KEY/UNIQUE */
function pkMysqlType(tbl: string, col: ColInfo): string {
  if (tbl === 'settings' && col.name === 'key') return 'VARCHAR(191)'
  return 'VARCHAR(64)'
}

async function ensureSchema(c: mysql.Connection): Promise<void> {
  const tables = localTables()
  // 1) إنشاء الجداول المفقودة — مع مفتاح أساسي دائماً (حتى لو كان المفتاح نصّاً UUID)
  for (const t of tables) {
    const pk = pkOf(t.cols)
    const defs = t.cols
      .map((col) => {
        const type = pk && col.name === pk.name ? pkMysqlType(t.name, col) : mysqlType(col.type)
        const notNull = pk && col.name === pk.name ? ' NOT NULL' : ''
        return `\`${col.name}\` ${type}${notNull}`
      })
      .join(', ')
    const pkSql = pk ? `, PRIMARY KEY (\`${pk.name}\`)` : ''
    await c.query(`CREATE TABLE IF NOT EXISTS \`${t.name}\` (${defs}${pkSql}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  }
  // 2) تطور الجداول: إضافة الأعمدة الجديدة (مثل مبالغ الدولار) للأعمدة الموجودة مسبقاً
  for (const t of tables) {
    const [remote] = await c.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
      [t.name]
    ) as unknown as [{ COLUMN_NAME: string }[], unknown]
    const have = new Set(remote.map((r) => r.COLUMN_NAME))
    for (const col of t.cols) {
      if (!have.has(col.name)) {
        const type = mysqlType(col.type)
        await c.query(`ALTER TABLE \`${t.name}\` ADD COLUMN \`${col.name}\` ${type}`)
      }
    }
  }
  // 3) إصلاح الجداول القديمة بلا مفتاح أساسي (سبب تكرار الصفوف في كل رفع):
  //    حذف النسخ المكرّرة بنفس المفتاح ثم إضافة PRIMARY KEY حتى يعمل ON DUPLICATE KEY UPDATE
  for (const t of tables) {
    const pk = pkOf(t.cols)
    if (!pk) continue
    const [cols] = (await c.query(
      `SELECT COLUMN_NAME, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
      [t.name]
    )) as unknown as [{ COLUMN_NAME: string; COLUMN_KEY: string }[], unknown]
    const hasPk = cols.some((r) => r.COLUMN_KEY === 'PRI')
    if (hasPk) continue
    console.warn(`[SYNC:mysql] إصلاح الجدول ${t.name}: إزالة الصفوف المكرّرة ثم إضافة PRIMARY KEY على ${pk.name}`)
    // احتفظ بصف واحد لكل مفتاح ثم أعد ضبط عمود المفتاح وأضف PRIMARY KEY
    await c.query(`ALTER TABLE \`${t.name}\` ADD COLUMN \`_sync_fix\` INT NULL`)
    await c.query(
      `UPDATE \`${t.name}\` SET \`_sync_fix\` = ROW_NUMBER() OVER (PARTITION BY \`${pk.name}\` ORDER BY \`${pk.name}\`)`
    )
    await c.query(`DELETE FROM \`${t.name}\` WHERE \`_sync_fix\` > 1`)
    await c.query(`ALTER TABLE \`${t.name}\` DROP COLUMN \`_sync_fix\``)
    await c.query(`ALTER TABLE \`${t.name}\` MODIFY \`${pk.name}\` ${pkMysqlType(t.name, pk)} NOT NULL`)
    await c.query(`ALTER TABLE \`${t.name}\` ADD PRIMARY KEY (\`${pk.name}\`)`)
  }
}

function readLocalRows(t: string): Record<string, unknown>[] {
  const db = getDb()
  return db.prepare(`SELECT * FROM \`${t}\``).all() as unknown as Record<string, unknown>[]
}

/** يفحص إن كان خادم MySQL فارغاً تماماً (لم يُبذَر بعد) — عندها نُصفّر البصمات ليرفع
 *  هذا الجهاز نسخته كاملة بدل أن تبقى السحابة فارغة بسبب بصمات البذر المحلية. */
async function mysqlRemoteEmpty(c: mysql.Connection): Promise<boolean> {
  for (const t of SYNC_TABLES) {
    const [rows] = (await c.query(`SELECT 1 FROM \`${t}\` LIMIT 1`)) as unknown as [unknown[], unknown]
    if (rows.length > 0) return false
  }
  return true
}

export function mysqlPullChanged(): number {
  return lastPullChanged
}

export function resetMysqlPullChanged(): void {
  lastPullChanged = 0
}

/** بصمة النسخة البعيدة على MySQL (null إذا لم توجد بيانات بعد) */
export async function mysqlRemoteFp(): Promise<{ hash: string; rows: number } | null> {
  const c = await connect()
  try {
    await ensureSchema(c)
    const rowsByTable: Record<string, unknown[]> = {}
    let total = 0
    for (const t of SYNC_TABLES) {
      const [rows] = (await c.query(`SELECT * FROM \`${t}\``)) as unknown as [Record<string, string | number | null>[], unknown]
      rowsByTable[t] = rows as unknown as unknown[]
      total += rows.length
    }
    if (total === 0) return null
    const fp = fingerprintTables(rowsByTable)
    return { hash: fp.hash, rows: fp.rows }
  } finally {
    await c.end()
  }
}

export async function mysqlTest(): Promise<string> {
  const c = await connect()
  try {
    await c.query('SELECT 1')
    return 'تم الاتصال بخادم MySQL بنجاح'
  } finally {
    await c.end()
  }
}

interface PushPlan {
  upsert: Record<string, unknown>[]
  deletes: (string | number)[]
}

/** يلتقط تغييرات الطرف المحلي بالنسبة لآخر مزامنة */
function capturePlans(): Record<string, PushPlan> {
  const plans: Record<string, PushPlan> = {}
  for (const t of INSERT_ORDER) {
    try {
      plans[t] = planPush(TRANSPORT, t, readLocalRows(t))
    } catch (e) {
      console.error(`[SYNC:mysql] تخطيط ${t} فشل:`, e instanceof Error ? e.message : e)
      plans[t] = { upsert: [], deletes: [] }
    }
  }
  return plans
}

async function pushPlans(
  c: mysql.Connection,
  plans: Record<string, PushPlan>
): Promise<{ pushed: number; removed: number; bad: Set<string> }> {
  const bad = new Set<string>()
  let pushed = 0
  let removed = 0

  for (const t of INSERT_ORDER) {
    const plan = plans[t]
    if (!plan || plan.upsert.length === 0) continue
    const cols = Object.keys(plan.upsert[0])
    const values = plan.upsert.map((r) => cols.map((cc) => mysqlValue(r[cc])))
    const upd = cols.map((cc) => `\`${cc}\`=VALUES(\`${cc}\`)`).join(', ')
    try {
      await c.query(
        `INSERT INTO \`${t}\` (${cols.map((cc) => `\`${cc}\``).join(',')}) VALUES ? ON DUPLICATE KEY UPDATE ${upd}`,
        [values]
      )
      pushed += plan.upsert.length
      console.log(`[SYNC:mysql] push ${t}: رفع ${plan.upsert.length} صفاً متغيّراً ✓`)
    } catch (e) {
      console.error(`[SYNC:mysql] push/${t} فشل:`, e instanceof Error ? e.message : e)
      bad.add(t)
    }
  }

  for (const t of DELETE_ORDER) {
    if (bad.has(t)) continue
    const deletes = plans[t]?.deletes ?? []
    if (deletes.length === 0) continue
    const col = pkColumn(t)
    try {
      for (let i = 0; i < deletes.length; i += 500) {
        await c.query(`DELETE FROM \`${t}\` WHERE \`${col}\` IN (?)`, [deletes.slice(i, i + 500)])
      }
      removed += deletes.length
      console.log(`[SYNC:mysql] push ${t}: حذف ${deletes.length} صفاً من البعيد (حُذفت محلياً) ✓`)
    } catch (e) {
      console.error(`[SYNC:mysql] push/حذف ${t} فشل:`, e instanceof Error ? e.message : e)
      bad.add(t)
    }
  }

  return { pushed, removed, bad }
}

export async function mysqlPush(): Promise<string> {
  return runExclusive(TRANSPORT, () => mysqlPushUnlocked())
}

async function mysqlPushUnlocked(): Promise<string> {
  const c = await connect()
  try {
    await ensureSchema(c)
    if (await mysqlRemoteEmpty(c)) {
      console.log('[SYNC:mysql] push: الخادم فارغ — تصفير البصمات لرفع نسخة كاملة من هذا الجهاز')
      clearBaselines(TRANSPORT)
    }
    const plans = capturePlans()
    await c.query('SET FOREIGN_KEY_CHECKS=0')
    try {
      const { pushed, removed, bad } = await pushPlans(c, plans)
      for (const t of INSERT_ORDER) {
        if (bad.has(t)) continue
        try {
          saveBaseline(TRANSPORT, t, readLocalRows(t))
        } catch {
          /* best effort */
        }
      }
      if (bad.size > 0) {
        throw new Error(`فشلت الجداول التالية: ${[...bad].join(', ')} — راجع السجل لتشخيص السبب`)
      }
      return `تم رفع التعديلات إلى MySQL (${pushed} صفاً محدثاً، ${removed} صفاً محذوفاً)`
    } finally {
      await c.query('SET FOREIGN_KEY_CHECKS=1')
    }
  } finally {
    await c.end()
  }
}

/**
 * مزامنة MySQL ثنائية الاتجاه: تسحب تغييرات الخادم وتدمجها (المحلي يفوز عند التعارض)
 * ثم ترفع تغييرات المحلي. تُعيد عدد الصفوف التي غيّرها السحب.
 */
export async function mysqlSync(): Promise<number> {
  return runExclusive(TRANSPORT, () => mysqlSyncUnlocked())
}

async function mysqlSyncUnlocked(): Promise<number> {
  const c = await connect()
  try {
    await ensureSchema(c)
    if (await mysqlRemoteEmpty(c)) {
      console.log('[SYNC:mysql] sync: الخادم فارغ — تصفير البصمات لرفع نسخة كاملة من هذا الجهاز')
      clearBaselines(TRANSPORT)
    }
    const plans = capturePlans()

    const data: Record<string, Record<string, unknown>[]> = {}
    let remote = 0
    for (const t of SYNC_TABLES) {
      const [rows] = (await c.query(`SELECT * FROM \`${t}\``)) as unknown as [
        Record<string, string | number | null | Date>[],
        unknown
      ]
      data[t] = rows as unknown as Record<string, unknown>[]
      remote += rows.length
    }
    if (remote > 0) {
      const counts = mergeIntoLocal(TRANSPORT, data, DELETE_ORDER, INSERT_ORDER)
      lastPullChanged = counts.inserted + counts.updated + counts.deleted
    } else {
      lastPullChanged = 0
    }

    await c.query('SET FOREIGN_KEY_CHECKS=0')
    try {
      const { pushed, removed, bad } = await pushPlans(c, plans)
      for (const t of INSERT_ORDER) {
        if (bad.has(t)) continue
        try {
          saveBaseline(TRANSPORT, t, readLocalRows(t))
        } catch {
          /* best effort */
        }
      }
      if (bad.size > 0) {
        throw new Error(`فشلت الجداول التالية: ${[...bad].join(', ')} — راجع السجل لتشخيص السبب`)
      }
      console.log(`[SYNC:mysql] sync انتهى: سحب ${lastPullChanged} صفاً، رفع ${pushed}، حذف ${removed}`)
    } finally {
      await c.query('SET FOREIGN_KEY_CHECKS=1')
    }
    return lastPullChanged
  } finally {
    await c.end()
  }
}

function mysqlValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ')
  if (typeof v === 'object') return JSON.stringify(v)
  return v as string | number
}

export async function mysqlPull(): Promise<string> {
  return runExclusive(TRANSPORT, () => mysqlPullUnlocked())
}

async function mysqlPullUnlocked(): Promise<string> {
  const c = await connect()
  try {
    await ensureSchema(c)
    const data: Record<string, Record<string, unknown>[]> = {}
    let remote = 0
    for (const t of SYNC_TABLES) {
      const [rows] = (await c.query(`SELECT * FROM \`${t}\``)) as unknown as [Record<string, string | number | null | Date>[], unknown]
      data[t] = rows as unknown as Record<string, unknown>[]
      remote += rows.length
    }
    if (remote === 0) throw new Error('لا توجد بيانات على الخادم بعد — ارفع نسخة أولاً')

    // دمج في المكان داخل صفقة: لا مسح كامل ولا استبدال ملف
    const counts = mergeIntoLocal(TRANSPORT, data, DELETE_ORDER, INSERT_ORDER)
    lastPullChanged = counts.inserted + counts.updated + counts.deleted
    console.log(
      `[SYNC:mysql] pull انتهى: ${counts.inserted} إدراج، ${counts.updated} تحديث، ${counts.deleted} حذف`
    )
    return `تم سحب التغييرات من MySQL (${counts.inserted} جديد، ${counts.updated} معدّل، ${counts.deleted} محذوف)`
  } finally {
    await c.end()
  }
}

export async function mysqlPushOnQuit(): Promise<void> {
  const s = getSettings()
  if ((s.mysql_auto ?? '0') === '1' && mysqlConfig()) {
    try {
      await mysqlPush()
    } catch {
      /* best effort */
    }
  }
}

export async function mysqlPullOnStart(): Promise<void> {
  const s = getSettings()
  if ((s.mysql_auto ?? '0') !== '1' || !mysqlConfig()) return
  if (process.env['SKIP_SYNC'] === '1') return
  const empty = SYNC_TABLES.every((t) => countLocal(t) === 0)
  if (!empty) return
  try {
    await mysqlPull()
  } catch {
    /* keep local on failure */
  }
}

function countLocal(t: string): number {
  const db = getDb()
  try {
    const r = db.prepare(`SELECT COUNT(*) AS c FROM \`${t}\``).get() as { c: number }
    return Number(r?.c ?? 0)
  } catch {
    return 0
  }
}