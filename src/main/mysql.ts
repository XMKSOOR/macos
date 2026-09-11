import mysql from 'mysql2/promise'
import { getDb, getSettings } from './db'

// الجداول المركّبة كاملة (نسخة معكوسة) على MySQL
const SYNC_TABLES: string[] = [
  'users',
  'patients',
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

// ترتيب الحذف (الأبناء أولاً لاحترام قيود المفاتيح محلياً في SQLite)
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
  'patients',
  'users',
  'settings'
]

const INSERT_ORDER: string[] = [
  'users',
  'patients',
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

async function ensureSchema(c: mysql.Connection): Promise<void> {
  for (const t of localTables()) {
    const defs = t.cols
      .map((col) => {
        const type = mysqlType(col.type)
        const pk = col.pk && type === 'INT' ? ' NOT NULL PRIMARY KEY' : ''
        return `\`${col.name}\` ${type}${pk}`
      })
      .join(', ')
    await c.query(`CREATE TABLE IF NOT EXISTS \`${t.name}\` (${defs}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  }
  // تطور الجداول: إضافة الأعمدة الجديدة (مثل مبالغ الدولار) للأعمدة الموجودة مسبقاً
  for (const t of localTables()) {
    const [remote] = await c.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
      [t.name]
    ) as unknown as [{ COLUMN_NAME: string }[], unknown]
    const have = new Set(remote.map((r) => r.COLUMN_NAME))
    for (const col of t.cols) {
      if (!have.has(col.name)) {
        await c.query(`ALTER TABLE \`${t.name}\` ADD COLUMN \`${col.name}\` ${mysqlType(col.type)}`)
      }
    }
  }
}

function readLocalTable(t: string): { cols: string[]; rows: (string | number)[] }[] | null {
  const db = getDb()
  const recs = db.prepare(`SELECT * FROM \`${t}\``).all() as unknown as Record<string, string | number>[]
  if (recs.length === 0) return null
  const cols = Object.keys(recs[0])
  return recs.map((r) => ({ cols, rows: cols.map((c) => r[c]) }))
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

export async function mysqlPush(): Promise<string> {
  const c = await connect()
  try {
    await ensureSchema(c)
    await c.query('SET FOREIGN_KEY_CHECKS=0')
    try {
      for (const t of DELETE_ORDER) {
        if (SYNC_TABLES.includes(t)) await c.query(`DELETE FROM \`${t}\``)
      }
      let count = 0
      for (const t of INSERT_ORDER) {
        const data = readLocalTable(t)
        if (!data) continue
        const cols = data[0].cols
        const rows = data.map((d) => d.rows)
        count += rows.length
        await c.query(
          `INSERT INTO \`${t}\` (\`${cols.join('`,`')}\`) VALUES ?`,
          [rows]
        )
      }
      return `تم رفع نسخة كاملة إلى MySQL (${count} صفاً في ${INSERT_ORDER.length} جداول)`
    } finally {
      await c.query('SET FOREIGN_KEY_CHECKS=1')
    }
  } finally {
    await c.end()
  }
}

export async function mysqlPull(): Promise<string> {
  const c = await connect()
  try {
    await ensureSchema(c)
    let remote = 0
    while (remote === 0) {
      for (const t of SYNC_TABLES) {
        const [rows] = await c.query(`SELECT COUNT(*) AS n FROM \`${t}\``) as unknown as [{ n: number }[], unknown]
        remote += Number(rows[0].n)
      }
      if (remote === 0) throw new Error('لا توجد بيانات على الخادم بعد — ارفع نسخة أولاً')
    }

    const data: Record<string, { cols: string[]; rows: (string | number | null)[] }[]> = {}
    for (const t of SYNC_TABLES) {
      const [rows] = await c.query(`SELECT * FROM \`${t}\``) as unknown as [Record<string, string | number | null>[], unknown]
      if (rows.length === 0) continue
      const cols = Object.keys(rows[0])
      data[t] = rows.map((r) => ({ cols, rows: cols.map((cc) => r[cc]) }))
    }

    const db = getDb()
    db.exec('BEGIN')
    try {
      for (const t of DELETE_ORDER) {
        if (SYNC_TABLES.includes(t)) db.prepare(`DELETE FROM \`${t}\``).run()
      }
      for (const t of INSERT_ORDER) {
        const recs = data[t]
        if (!recs) continue
        const cols = recs[0].cols
        const stmt = db.prepare(`INSERT INTO \`${t}\` (\`${cols.join('`,`')}\`) VALUES (${cols.map(() => '?').join(',')})`)
        for (const r of recs) stmt.run(...r.rows)
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    return 'تم سحب نسخة كاملة من MySQL واستبدال قاعدة البيانات المحلية'
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