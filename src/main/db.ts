import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { dataDir, dbFilePath } from './config'
import { seedDefaultData, upgradePricesToStudy, upgradeSeedsToStudy } from './seed'
import type {
  Appointment,
  CatalogBomInput,
  CatalogItem,
  Expense,
  Invoice,
  InvoiceItemInput,
  Material,
  Patient,
  Role,
  Settings,
  StockMovement,
  User,
  PermissionOverride,
  DashboardStats
} from '../shared/types'

let db: DatabaseSync
let dbPath = ''

const _AR_D = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'
const _FA_D = '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9'
const _DM: Record<string, string> = {}
for (let i = 0; i < 10; i++) {
  _DM[_AR_D[i]] = String(i)
  _DM[_FA_D[i]] = String(i)
}
/** حصر كل الأرقام في قاعدة البيانات على الصيغة الإنجليزية 1234567890 (يحوّل ٠١٢٣... و۰۱۲۳...) */
function latinDigits(s: string): string {
  return (s ?? '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => _DM[d] ?? d)
}
/** رقم مُطبَّع من نص قد يحوي أرقاماً عربية/فارسية (يعيد NaN عند التعذّر) */
function numAny(s: unknown): number {
  const n = Number(latinDigits(String(s ?? '').trim()))
  return Number.isFinite(n) ? n : Number.NaN
}
export function getDb(): DatabaseSync {
  return db
}
export function getDbPath(): string {
  return dbPath
}

export function initDb(): void {
  dbPath = dbFilePath()
  const dir = join(dbPath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate()
  upgradeSeedsToStudy()
  try {
    seedDefaultData()
  } catch (e) {
    console.error('بذر بيانات العيادة الافتراضية فشل:', e)
  }
  upgradePricesToStudy()
}

function migrate(): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  full_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS catalog_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  FOREIGN KEY (catalog_id) REFERENCES catalog(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id)
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 0,
  min_qty REAL NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  usd_rate REAL NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  catalog_id INTEGER,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS invoice_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  operation TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)
  ensureCurrencyColumns()
  seed()
  recalcUsd()
}

// ---- العملة المزدوجة (ليرة/دولار) وحذف الأصفار ----
function ensureCurrencyColumns(): void {
  const add = (table: string, col: string, def: string): void => {
    const exists = db
      .prepare(`SELECT name FROM pragma_table_info('${table}') WHERE name=?`)
      .get(col) as unknown as { name: string } | undefined
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
  }
  add('catalog', 'price_usd', 'REAL NOT NULL DEFAULT 0')
  add('catalog', 'cost_usd', 'REAL NOT NULL DEFAULT 0')
  add('materials', 'cost_usd', 'REAL NOT NULL DEFAULT 0')
  add('invoices', 'subtotal_usd', 'REAL NOT NULL DEFAULT 0')
  add('invoices', 'discount_usd', 'REAL NOT NULL DEFAULT 0')
  add('invoices', 'total_usd', 'REAL NOT NULL DEFAULT 0')
  add('invoices', 'paid_usd', 'REAL NOT NULL DEFAULT 0')
  add('invoice_items', 'cost_usd', 'REAL NOT NULL DEFAULT 0')
  add('expenses', 'amount_usd', 'REAL NOT NULL DEFAULT 0')
  add('users', 'permissions', "TEXT NOT NULL DEFAULT ''")
}

/** إعادة حساب كل مبالغ الدولار من القيم المحلية حسب سعر الصرف الحالي */
export function recalcUsd(): void {
  const rate = getSettings().usd_rate
  if (!(rate > 0)) return
  const r = Number(rate)
  /** قسمة كسرية صحيحة: يجب «تعويم» البسط قبل القسمة لأن تقسيم عددين صحيحين في SQLite يكون تقسيمًا صحيحًا (30/130=0) */
  const R = (num: string, den: string): string => `ROUND(CAST(${num} AS REAL) / ${den}, 2)`
  db.exec(`UPDATE catalog SET price_usd=${R('price', `${r}`)}, cost_usd=(
    SELECT ${R('COALESCE(SUM(m.cost * cm.qty), 0)', `${r}`)} FROM catalog_materials cm JOIN materials m ON m.id=cm.material_id WHERE cm.catalog_id=catalog.id)`)
  db.exec(`UPDATE materials SET cost_usd=${R('cost', `${r}`)}`)
  db.exec(
    `UPDATE invoices SET subtotal_usd=${R('subtotal', 'usd_rate')}, discount_usd=${R('discount', 'usd_rate')}, total_usd=${R('total', 'usd_rate')}, paid_usd=${R('paid', 'usd_rate')}`
  )
  db.exec(`UPDATE invoice_items SET cost_usd=${R('cost', '(SELECT usd_rate FROM invoices WHERE invoices.id=invoice_items.invoice_id)')}`)
  db.exec(`UPDATE expenses SET amount_usd=${R('amount', `${r}`)}`)
}

/** تحويل القيم المحفوظة إلى العملة الجديدة (حذف الأصفار) مرة واحدة */
export function applyCurrencyScale(force = false): string {
  const s = getSettings()
  const scale = Number(s.currency_scale || 1)
  if (!(scale > 1)) return 'معامل التحويل غير صالح'
  if (!force && s.currency_converted === '1') return 'القيم محوّلة بالفعل إلى العملة الجديدة'
  db.exec('BEGIN')
  try {
    db.exec(`UPDATE catalog SET price=ROUND(CAST(price AS REAL)/${scale})`)
    db.exec(`UPDATE materials SET cost=ROUND(CAST(cost AS REAL)/${scale})`)
    db.exec(`UPDATE invoices SET usd_rate=ROUND(CAST(usd_rate AS REAL)/${scale}), subtotal=ROUND(CAST(subtotal AS REAL)/${scale}), discount=ROUND(CAST(discount AS REAL)/${scale}), total=ROUND(CAST(total AS REAL)/${scale}), paid=ROUND(CAST(paid AS REAL)/${scale})`)
    db.exec(`UPDATE invoice_items SET cost=ROUND(CAST(cost AS REAL)/${scale})`)
    db.exec(`UPDATE expenses SET amount=ROUND(CAST(amount AS REAL)/${scale})`)
    db.exec(`UPDATE settings SET value=ROUND(CAST(value AS REAL)/${scale}) WHERE key='usd_rate'`)
    db.prepare(`UPDATE settings SET value='1' WHERE key='currency_converted'`).run()
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  recalcUsd()
  return `تم تحويل القيم إلى العملة الجديدة (قسمة على ${scale} = حذف ${String(scale).length - 1} أصفار)`
}

function seed(): void {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get() as unknown as { c: number }
  if (users.c === 0) {
    const hash = hashPassword('admin123')
    db.prepare('INSERT INTO users (username, password_hash, role, full_name) VALUES (?,?,?,?)').run(
      'admin',
      hash,
      'admin',
      'مدير النظام'
    )
  }
  const defaults: [string, string][] = [
    ['clinic_name', 'عيادتي لطب الأسنان'],
    ['clinic_phone', ''],
    ['clinic_address', ''],
    ['receipt_header', ''],
    ['receipt_footer', 'شكراً لثقتكم بنا'],
    ['usd_rate', '130'],
    ['printer_name', ''],
    ['currency_scale', '100'],
    ['currency_converted', '0'],
    ['drive_client_id', ''],
    ['drive_client_secret', ''],
    ['drive_tokens', ''],
    ['drive_auto', '0']
  ]
  const set = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)')
  for (const [k, v] of defaults) set.run(k, v)
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `s1$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [, salt, hash] = stored.split('$')
    const calc = scryptSync(password, salt, 32).toString('hex')
    const a = Buffer.from(hash, 'hex')
    const b = Buffer.from(calc, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as { key: string; value: string }[]
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return {
    clinic_name: out.clinic_name ?? '',
    clinic_phone: out.clinic_phone ?? '',
    clinic_address: out.clinic_address ?? '',
    receipt_header: out.receipt_header ?? '',
    receipt_footer: out.receipt_footer ?? '',
    usd_rate: Number(out.usd_rate ?? 130),
    printer_name: out.printer_name ?? '',
    currency_scale: out.currency_scale ?? '100',
    currency_converted: out.currency_converted ?? '0',
    drive_client_id: out.drive_client_id ?? '',
    drive_client_secret: out.drive_client_secret ?? '',
    drive_tokens: out.drive_tokens ?? '',
    drive_auto: out.drive_auto ?? '0',
    mysql_host: out.mysql_host ?? '',
    mysql_port: out.mysql_port ?? '3306',
    mysql_db: out.mysql_db ?? '',
    mysql_user: out.mysql_user ?? '',
    mysql_secret: out.mysql_secret ?? '',
    mysql_auto: out.mysql_auto ?? '0',
    feasibility_seed: out.feasibility_seed ?? '0',
    feasibility_plan: out.feasibility_plan ?? '',
    feasibility_seed2: out.feasibility_seed2 ?? '0'
  }
}

export function saveSettings(partial: Partial<Settings>): Settings {
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  const entries = Object.entries(partial) as [string, string | number][]
  const tx = db.prepare('BEGIN')
  tx.run()
  try {
    for (const [k, v] of entries) set.run(k, String(v))
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
  return getSettings()
}

// ---- Users ----
function parsePermissions(raw: string): PermissionOverride | undefined {
  if (!raw) return undefined
  try {
    const o = JSON.parse(raw) as PermissionOverride
    return o && typeof o === 'object' ? o : undefined
  } catch {
    return undefined
  }
}

export function listUsers(): User[] {
  const rows = db.prepare('SELECT id, username, role, full_name, created_at, permissions FROM users ORDER BY id').all() as unknown as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    username: String(r.username),
    role: r.role as Role,
    full_name: String(r.full_name),
    created_at: String(r.created_at ?? ''),
    permissions: parsePermissions(String(r.permissions ?? ''))
  }))
}

export function createUser(username: string, password: string, role: Role, full_name: string, permissions?: PermissionOverride): User {
  const hash = hashPassword(password)
  const permsJson = permissions ? JSON.stringify(permissions) : ''
  const r = db
    .prepare('INSERT INTO users (username, password_hash, role, full_name, permissions) VALUES (?,?,?,?,?)')
    .run(username, hash, role as string, full_name, permsJson)
  return { id: Number(r.lastInsertRowid), username, role, full_name, created_at: new Date().toISOString(), permissions }
}

export function updateUser(id: number, username: string, role: string, full_name: string, password?: string, permissions?: PermissionOverride): void {
  const permsJson = permissions !== undefined ? JSON.stringify(permissions) : undefined
  if (password) {
    const hash = hashPassword(password)
    if (permsJson !== undefined) {
      db.prepare('UPDATE users SET username=?, role=?, full_name=?, password_hash=?, permissions=? WHERE id=?').run(
        username,
        role,
        full_name,
        hash,
        permsJson,
        id
      )
    } else {
      db.prepare('UPDATE users SET username=?, role=?, full_name=?, password_hash=? WHERE id=?').run(username, role, full_name, hash, id)
    }
  } else {
    if (permsJson !== undefined) {
      db.prepare('UPDATE users SET username=?, role=?, full_name=?, permissions=? WHERE id=?').run(username, role, full_name, permsJson, id)
    } else {
      db.prepare('UPDATE users SET username=?, role=?, full_name=? WHERE id=?').run(username, role, full_name, id)
    }
  }
}

export function deleteUser(id: number): void {
  db.prepare('DELETE FROM users WHERE id=?').run(id)
}

export function findLogin(username: string): { id: number; username: string; password_hash: string; role: string; full_name: string; permissions?: PermissionOverride } | undefined {
  const row = db.prepare('SELECT * FROM users WHERE username=?').get(username) as unknown as
    | { id: number; username: string; password_hash: string; role: string; full_name: string; permissions: string }
    | undefined
  if (!row) return undefined
  return {
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    role: row.role,
    full_name: row.full_name,
    permissions: parsePermissions(row.permissions ?? '')
  }
}

// ---- Patients ----
export function listPatients(search?: string): Patient[] {
  if (search) {
    return db
      .prepare(
        "SELECT * FROM patients WHERE name LIKE ? OR phone LIKE ? ORDER BY updated_at DESC LIMIT 500"
      )
      .all(`%${search}%`, `%${search}%`) as unknown as Patient[]
  }
  return db.prepare('SELECT * FROM patients ORDER BY updated_at DESC LIMIT 500').all() as unknown as Patient[]
}

export function createPatient(p: Omit<Patient, 'id' | 'created_at'>): Patient {
  const r = db
    .prepare('INSERT INTO patients (name, phone, birth_date, gender, address, notes) VALUES (?,?,?,?,?,?)')
    .run(latinDigits(p.name), latinDigits(p.phone), p.birth_date, latinDigits(p.gender), latinDigits(p.address), latinDigits(p.notes))
  return { ...p, id: Number(r.lastInsertRowid), created_at: new Date().toISOString() }
}

export function updatePatient(id: number, p: Omit<Patient, 'id' | 'created_at'>): void {
  db.prepare(
    "UPDATE patients SET name=?, phone=?, birth_date=?, gender=?, address=?, notes=?, updated_at=datetime('now','localtime') WHERE id=?"
  ).run(latinDigits(p.name), latinDigits(p.phone), p.birth_date, latinDigits(p.gender), latinDigits(p.address), latinDigits(p.notes), id)
}

export function deletePatient(id: number): void {
  db.prepare('BEGIN').run()
  try {
    db.prepare('DELETE FROM invoice_materials WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id=?)').run(id)
    db.prepare('DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id=?)').run(id)
    db.prepare('DELETE FROM invoices WHERE patient_id=?').run(id)
    db.prepare('DELETE FROM appointments WHERE patient_id=?').run(id)
    db.prepare('DELETE FROM patients WHERE id=?').run(id)
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
}

// ---- Appointments ----
export function listAppointments(date?: string, status?: string): Appointment[] {
  let sql =
    "SELECT a.*, p.name AS patient_name, p.phone AS patient_phone FROM appointments a JOIN patients p ON p.id=a.patient_id"
  const conds: string[] = []
  const args: string[] = []
  if (date) {
    conds.push('a.date=?')
    args.push(date)
  }
  if (status) {
    conds.push('a.status=?')
    args.push(status)
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
  sql += ' ORDER BY a.date DESC, a.time ASC LIMIT 500'
  return db.prepare(sql).all(...args) as unknown as Appointment[]
}

export function createAppointment(a: Omit<Appointment, 'id' | 'created_at'>): Appointment {
  const r = db
    .prepare('INSERT INTO appointments (patient_id, date, time, reason, notes, status) VALUES (?,?,?,?,?,?)')
    .run(a.patient_id, a.date, a.time, a.reason, a.notes, a.status)
  return { ...a, id: Number(r.lastInsertRowid), created_at: new Date().toISOString() }
}

export function updateAppointment(id: number, a: Omit<Appointment, 'id' | 'created_at'>): void {
  db.prepare('UPDATE appointments SET patient_id=?, date=?, time=?, reason=?, notes=?, status=? WHERE id=?').run(
    a.patient_id,
    a.date,
    a.time,
    a.reason,
    a.notes,
    a.status,
    id
  )
}

export function deleteAppointment(id: number): void {
  db.prepare('DELETE FROM appointments WHERE id=?').run(id)
}

// ---- Catalog ----
function catalogRow(row: Record<string, unknown>): CatalogItem {
  const id = Number(row.id)
  const mats = db
    .prepare(
      'SELECT cm.material_id, m.name, cm.qty, m.unit, m.cost FROM catalog_materials cm JOIN materials m ON m.id=cm.material_id WHERE cm.catalog_id=?'
    )
    .all(id) as unknown as { material_id: number; name: string; qty: number; unit: string; cost: number }[]
  const cost = mats.reduce((s, m) => s + Math.round(m.cost * m.qty), 0)
  const price = Number(row.price) || 0
  const margin = price - cost
  return {
    id,
    name: String(row.name),
    price,
    cost,
    margin,
    price_usd: Number(row.price_usd) || 0,
    cost_usd: Number(row.cost_usd) || 0,
    description: String(row.description ?? ''),
    created_at: String(row.created_at ?? ''),
    materials: mats
  }
}

export function listCatalog(): CatalogItem[] {
  const rows = db.prepare('SELECT * FROM catalog ORDER BY name').all() as unknown as Record<string, unknown>[]
  return rows.map(catalogRow)
}

export function getCatalogItem(id: number): CatalogItem | undefined {
  const row = db.prepare('SELECT * FROM catalog WHERE id=?').get(id) as unknown as Record<string, unknown> | undefined
  return row ? catalogRow(row) : undefined
}

function syncBom(catalogId: number, resources: CatalogBomInput[]): void {
  db.prepare('DELETE FROM catalog_materials WHERE catalog_id=?').run(catalogId)
  const ins = db.prepare('INSERT INTO catalog_materials (catalog_id, material_id, qty) VALUES (?,?,?)')
  for (const m of resources) ins.run(catalogId, m.material_id, m.qty)
}

function recalcCatalogUsd(id: number): void {
  const rate = getSettings().usd_rate
  if (!(rate > 0)) return
  db.prepare(
    `UPDATE catalog SET price_usd=ROUND(CAST(price AS REAL)/${rate}, 2),
     cost_usd=(SELECT ROUND(CAST(COALESCE(SUM(m.cost*cm.qty),0) AS REAL)/${rate}, 2) FROM catalog_materials cm JOIN materials m ON m.id=cm.material_id WHERE cm.catalog_id=?)
     WHERE id=?`
  ).run(id, id)
}

export function createCatalogItem(
  c: Omit<CatalogItem, 'id' | 'created_at' | 'cost' | 'margin' | 'materials'> & { materials?: CatalogBomInput[] }
): CatalogItem {
  const name = latinDigits(c.name)
  const priceN = numAny(c.price)
  const price = Number.isNaN(priceN) ? 0 : priceN
  db.prepare('BEGIN').run()
  try {
    const r = db.prepare('INSERT INTO catalog (name, price, description) VALUES (?,?,?)').run(name, price, latinDigits(c.description ?? ''))
    const id = Number(r.lastInsertRowid)
    syncBom(id, c.materials ?? [])
    recalcCatalogUsd(id)
    db.prepare('COMMIT').run()
    return getCatalogItem(id)!
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
}

export function updateCatalogItem(
  id: number,
  c: Omit<CatalogItem, 'id' | 'created_at' | 'cost' | 'margin' | 'materials'> & { materials?: CatalogBomInput[] }
): void {
  const name = latinDigits(c.name)
  const priceN = numAny(c.price)
  const price = Number.isNaN(priceN) ? 0 : priceN
  db.prepare('BEGIN').run()
  try {
    db.prepare('UPDATE catalog SET name=?, price=?, description=? WHERE id=?').run(name, price, latinDigits(c.description ?? ''), id)
    syncBom(id, c.materials ?? [])
    recalcCatalogUsd(id)
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
}

export function deleteCatalogItem(id: number): void {
  db.prepare('BEGIN').run()
  try {
    db.prepare('DELETE FROM catalog_materials WHERE catalog_id=?').run(id)
    db.prepare('DELETE FROM catalog WHERE id=?').run(id)
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
}

// ---- Materials / Inventory ----
export function listMaterials(search?: string): Material[] {
  if (search) {
    return db
      .prepare('SELECT * FROM materials WHERE name LIKE ? OR category LIKE ? OR supplier LIKE ? ORDER BY name LIMIT 500')
      .all(`%${search}%`, `%${search}%`, `%${search}%`) as unknown as Material[]
  }
  return db.prepare('SELECT * FROM materials ORDER BY name LIMIT 500').all() as unknown as Material[]
}

export function createMaterial(m: Omit<Material, 'id' | 'created_at'>): Material {
  const rate = getSettings().usd_rate
  const clean = { ...m, name: latinDigits(m.name), category: latinDigits(m.category ?? ''), unit: latinDigits(m.unit ?? ''), supplier: latinDigits(m.supplier ?? ''), notes: latinDigits(m.notes ?? '') }
  const costN = numAny(clean.cost)
  const cost = Number.isNaN(costN) ? 0 : costN
  const qtyN = numAny(clean.quantity)
  const quantity = Number.isNaN(qtyN) ? 0 : qtyN
  const minN = numAny(clean.min_qty)
  const minQty = Number.isNaN(minN) ? 0 : minN
  const costUsd = rate > 0 ? Math.round((cost / rate) * 100) / 100 : 0
  const r = db
    .prepare('INSERT INTO materials (name, category, unit, quantity, min_qty, cost, cost_usd, supplier, notes) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(clean.name, clean.category, clean.unit, quantity, minQty, cost, costUsd, clean.supplier, clean.notes)
  return { ...clean, cost, quantity, min_qty: minQty, cost_usd: costUsd, id: Number(r.lastInsertRowid), created_at: new Date().toISOString() }
}

export function updateMaterial(id: number, m: Omit<Material, 'id' | 'created_at'>): void {
  const rate = getSettings().usd_rate
  const clean = { ...m, name: latinDigits(m.name), category: latinDigits(m.category ?? ''), unit: latinDigits(m.unit ?? ''), supplier: latinDigits(m.supplier ?? ''), notes: latinDigits(m.notes ?? '') }
  const costN = numAny(clean.cost)
  const cost = Number.isNaN(costN) ? 0 : costN
  const minN = numAny(clean.min_qty)
  const minQty = Number.isNaN(minN) ? 0 : minN
  const costUsd = rate > 0 ? Math.round((cost / rate) * 100) / 100 : 0
  db.prepare(
    'UPDATE materials SET name=?, category=?, unit=?, min_qty=?, cost=?, cost_usd=?, supplier=?, notes=? WHERE id=?'
  ).run(clean.name, clean.category, clean.unit, minQty, cost, costUsd, clean.supplier, clean.notes, id)
}

export function deleteMaterial(id: number): void {
  db.prepare('BEGIN').run()
  try {
    db.prepare('DELETE FROM catalog_materials WHERE material_id=?').run(id)
    db.prepare('DELETE FROM materials WHERE id=?').run(id)
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
}

export function adjustStock(id: number, qtyDelta: number, operation: string, reference: string, user_name: string, note: string): void {
  db.prepare('UPDATE materials SET quantity = quantity + ? WHERE id=?').run(qtyDelta, id)
  db.prepare('INSERT INTO stock_movements (material_id, qty, operation, reference, user_name, note) VALUES (?,?,?,?,?,?)').run(
    id,
    qtyDelta,
    operation,
    reference,
    user_name,
    note
  )
}

export function listStockMovements(limit = 300): StockMovement[] {
  return db
    .prepare(
      'SELECT m.*, mat.name AS material_name FROM stock_movements m JOIN materials mat ON mat.id=m.material_id ORDER BY m.id DESC LIMIT ?'
    )
    .all(limit) as unknown as StockMovement[]
}

// ---- استيراد Excel مع تحديث الصنف الموجود (نفس الاسم) ----
export interface ImportResult {
  ok: number
  updated: number
  skip: number
}

export function importMaterials(rows: Record<string, string>[]): ImportResult {
  let ok = 0
  let updated = 0
  let skip = 0
  db.prepare('BEGIN').run()
  try {
    for (const r of rows) {
      const name = (r.name ?? '').trim()
      if (!name) {
        skip++
        continue
      }
      const existing = db.prepare('SELECT * FROM materials WHERE name=?').get(name) as unknown as
        | (Material & { quantity: number })
        | undefined
      const rawQty = String(r.quantity ?? '').trim()
      const qty = rawQty === '' ? NaN : numAny(rawQty)
      if (existing) {
        const cost = numAny(r.cost)
        const minQty = numAny(r.min_qty)
        updateMaterial(existing.id, {
          name,
          category: (r.category ?? '').trim() || existing.category,
          unit: (r.unit ?? '').trim() || existing.unit,
          quantity: existing.quantity,
          min_qty: Number.isFinite(minQty) ? minQty : existing.min_qty,
          cost: Number.isFinite(cost) ? cost : existing.cost,
          supplier: (r.supplier ?? '').trim() || existing.supplier,
          notes: (r.notes ?? '').trim() || existing.notes
        })
        if (Number.isFinite(qty) && qty !== existing.quantity) {
          adjustStock(existing.id, qty - existing.quantity, 'import', 'استيراد Excel', '', 'تحديث كمية من الاستيراد')
        }
        updated++
      } else {
        createMaterial({
          name,
          category: (r.category ?? '').trim(),
          unit: (r.unit ?? '').trim(),
          quantity: Number.isFinite(qty) ? qty : 0,
          min_qty: numAny(r.min_qty) || 0,
          cost: numAny(r.cost) || 0,
          supplier: (r.supplier ?? '').trim(),
          notes: (r.notes ?? '').trim()
        })
        ok++
      }
    }
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
  return { ok, updated, skip }
}

export function importCatalogRows(rows: Record<string, string>[]): ImportResult {
  let ok = 0
  let updated = 0
  let skip = 0
  for (const r of rows) {
    const name = (r.name ?? '').trim()
    if (!name) {
      skip++
      continue
    }
    const rawPrice = String(r.price ?? '').trim()
    const price = rawPrice === '' ? NaN : numAny(rawPrice)
    const existing = db.prepare('SELECT * FROM catalog WHERE name=?').get(name) as unknown as
      | { id: number; name: string; price: number; description: string }
      | undefined
    if (existing) {
      updateCatalogItem(existing.id, {
        name,
        price: Number.isFinite(price) ? price : existing.price,
        description: (r.description ?? '').trim() || existing.description,
        materials: []
      })
      updated++
    } else {
      createCatalogItem({
        name,
        price: Number.isFinite(price) ? price : 0,
        description: (r.description ?? '').trim(),
        materials: []
      })
      ok++
    }
  }
  return { ok, updated, skip }
}

export function importPatients(rows: Record<string, string>[]): ImportResult {
  let ok = 0
  let updated = 0
  let skip = 0
  db.prepare('BEGIN').run()
  try {
    for (const r of rows) {
      const name = (r.name ?? '').trim()
      if (!name) {
        skip++
        continue
      }
      const phone = (r.phone ?? '').trim()
      const existing = phone
        ? (db.prepare('SELECT * FROM patients WHERE phone=?').get(phone) as unknown as Patient | undefined)
        : (db.prepare('SELECT * FROM patients WHERE name=?').get(name) as unknown as Patient | undefined)
      if (existing) {
        updatePatient(existing.id, {
          name,
          phone: phone || existing.phone,
          birth_date: (r.birth_date ?? '').trim() || existing.birth_date,
          gender: (r.gender ?? '').trim() || existing.gender,
          address: (r.address ?? '').trim() || existing.address,
          notes: (r.notes ?? '').trim() || existing.notes
        })
        updated++
      } else {
        createPatient({
          name,
          phone,
          birth_date: (r.birth_date ?? '').trim(),
          gender: (r.gender ?? '').trim(),
          address: (r.address ?? '').trim(),
          notes: (r.notes ?? '').trim()
        })
        ok++
      }
    }
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
  return { ok, updated, skip }
}

// ---- Invoices ----
export interface InvoiceWithItems extends Omit<Invoice, 'items'> {
  items: {
    id: number
    invoice_id?: number
    name: string
    cost: number
    qty: number
    catalog_id: number | null
    materials: { material_id: number; qty: number }[]
  }[]
}

export function listInvoices(search?: string): Invoice[] {
  let sql =
    "SELECT i.*, p.name AS patient_name, p.phone AS patient_phone FROM invoices i JOIN patients p ON p.id=i.patient_id"
  const conds: string[] = []
  const args: string[] = []
  if (search) {
    conds.push('(i.invoice_no LIKE ? OR p.name LIKE ? OR p.phone LIKE ?)')
    args.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
  sql += ' ORDER BY i.id DESC LIMIT 500'
  return db.prepare(sql).all(...args) as unknown as Invoice[]
}

export function listInvoicesSince(sinceDate: string): Invoice[] {
  return db
    .prepare(
      `SELECT i.*, p.name AS patient_name, p.phone AS patient_phone,
       (SELECT COALESCE(ROUND(SUM(it.cost*it.qty),2),0) FROM invoice_items it WHERE it.invoice_id=i.id) AS items_cost
       FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.date >= ? ORDER BY i.date, i.id`
    )
    .all(sinceDate) as unknown as Invoice[]
}

export function getInvoice(id: number): InvoiceWithItems | undefined {
  const inv = db.prepare('SELECT i.*, p.name AS patient_name, p.phone AS patient_phone FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.id=?').get(id) as unknown as Invoice | undefined
  if (!inv) return undefined
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(id) as {
    id: number
    name: string
    cost: number
    qty: number
    catalog_id: number | null
  }[]
  const withMaterials = items.map((it) => {
    const materials = db.prepare('SELECT material_id, qty FROM invoice_materials WHERE item_id=?').all(it.id) as unknown as {
      material_id: number
      qty: number
    }[]
    return { ...it, materials }
  })
  return { ...inv, items: withMaterials } as unknown as InvoiceWithItems
}

export function nextInvoiceNo(): string {
  const row = db.prepare('SELECT invoice_no FROM invoices ORDER BY id DESC LIMIT 1').get() as unknown as { invoice_no: string } | undefined
  const n = row ? parseInt(row.invoice_no, 10) + 1 : 1
  return String(n).padStart(4, '0')
}

export function createInvoice(input: {
  patient_id: number
  date: string
  usd_rate: number
  discount: number
  notes: string
  items: InvoiceItemInput[]
  user_name: string
}): InvoiceWithItems {
  const invoice_no = nextInvoiceNo()
  const subtotal = input.items.reduce((s, it) => s + it.cost * it.qty, 0)
  const total = Math.max(0, subtotal - input.discount)
  const R = (n: number): number => (input.usd_rate > 0 ? Math.round((n / input.usd_rate) * 100) / 100 : 0)

  db.prepare('BEGIN').run()
  try {
    const r = db
      .prepare(
        'INSERT INTO invoices (invoice_no, patient_id, date, usd_rate, subtotal, discount, total, paid, subtotal_usd, discount_usd, total_usd, paid_usd, notes, created_by) VALUES (?,?,?,?,?,?,?,0,?,?,?,0,?,?)'
      )
      .run(
        invoice_no,
        input.patient_id,
        input.date,
        input.usd_rate,
        subtotal,
        input.discount,
        total,
        R(subtotal),
        R(input.discount),
        R(total),
        input.notes,
        input.user_name
      )
    const invoiceId = Number(r.lastInsertRowid)
    const insItem = db.prepare('INSERT INTO invoice_items (invoice_id, name, cost, qty, catalog_id, cost_usd) VALUES (?,?,?,?,?,?)')
    const insMat = db.prepare('INSERT INTO invoice_materials (invoice_id, item_id, material_id, qty) VALUES (?,?,?,?)')
    for (const it of input.items) {
      const ir = insItem.run(invoiceId, it.name, it.cost, it.qty, it.catalog_id, R(it.cost))
      const itemId = Number(ir.lastInsertRowid)
      let mats = it.materials
      if (it.catalog_id && (!mats || mats.length === 0)) {
        mats = db
          .prepare('SELECT material_id, qty FROM catalog_materials WHERE catalog_id=?')
          .all(it.catalog_id) as unknown as { material_id: number; qty: number }[]
        if (mats.length > 0) {
          const cur = db.prepare('UPDATE invoice_items SET name=? WHERE id=?')
          cur.run(`${it.name} (${(db.prepare('SELECT name FROM catalog WHERE id=?').get(it.catalog_id) as unknown as { name: string }).name})`, itemId)
        }
      }
      for (const m of mats ?? []) {
        insMat.run(invoiceId, itemId, m.material_id, m.qty)
        adjustStock(m.material_id, -m.qty, 'sale', invoice_no, input.user_name, it.name)
      }
    }
    db.prepare('COMMIT').run()
    return getInvoice(invoiceId)!
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
}

export function addPayment(id: number, amount: number): Invoice {
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id) as unknown as Invoice
  const paid = inv.paid + amount
  const newStatus = paid >= inv.total ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
  const paidUsd = inv.usd_rate > 0 ? Math.round((paid / inv.usd_rate) * 100) / 100 : 0
  db.prepare('UPDATE invoices SET paid=?, status=?, paid_usd=? WHERE id=?').run(paid, newStatus, paidUsd, id)
  return db.prepare('SELECT * FROM invoices WHERE id=?').get(id) as unknown as Invoice
}

export function deleteInvoice(id: number): void {
  db.prepare('BEGIN').run()
  try {
    db.prepare('DELETE FROM invoice_materials WHERE invoice_id=?').run(id)
    db.prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(id)
    db.prepare('DELETE FROM invoices WHERE id=?').run(id)
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
}

// ---- Expenses ----
export function listExpenses(from?: string, to?: string): Expense[] {
  let sql = 'SELECT * FROM expenses'
  const conds: string[] = []
  const args: string[] = []
  if (from) {
    conds.push('date>=?')
    args.push(from)
  }
  if (to) {
    conds.push('date<=?')
    args.push(to)
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
  sql += ' ORDER BY date DESC, id DESC LIMIT 500'
  return db.prepare(sql).all(...args) as unknown as Expense[]
}

export function createExpense(e: Omit<Expense, 'id' | 'created_at'>): Expense {
  const rate = getSettings().usd_rate
  const clean = { ...e, category: latinDigits(e.category ?? ''), note: latinDigits(e.note ?? '') }
  const amountN = numAny(clean.amount)
  const amount = Number.isNaN(amountN) ? 0 : amountN
  const amountUsd = rate > 0 ? Math.round((amount / rate) * 100) / 100 : 0
  const r = db
    .prepare('INSERT INTO expenses (category, amount, amount_usd, note, date, created_by) VALUES (?,?,?,?,?,?)')
    .run(clean.category, amount, amountUsd, clean.note, clean.date, clean.created_by)
  return { ...clean, amount, amount_usd: amountUsd, id: Number(r.lastInsertRowid), created_at: new Date().toISOString() }
}

export function updateExpense(id: number, e: Omit<Expense, 'id' | 'created_at'>): void {
  const rate = getSettings().usd_rate
  const clean = { ...e, category: latinDigits(e.category ?? ''), note: latinDigits(e.note ?? '') }
  const amountN = numAny(clean.amount)
  const amount = Number.isNaN(amountN) ? 0 : amountN
  const amountUsd = rate > 0 ? Math.round((amount / rate) * 100) / 100 : 0
  db.prepare('UPDATE expenses SET category=?, amount=?, amount_usd=?, note=?, date=? WHERE id=?').run(
    clean.category,
    amount,
    amountUsd,
    clean.note,
    clean.date,
    id
  )
}

export function deleteExpense(id: number): void {
  db.prepare('DELETE FROM expenses WHERE id=?').run(id)
}

// ---- Dashboard ----
export function dashboardStats(period: string): DashboardStats {
  const today = new Date().toISOString().slice(0, 10)
  const patients_count = (db.prepare('SELECT COUNT(*) c FROM patients').get() as unknown as { c: number }).c
  const today_appointments = (
    db.prepare('SELECT COUNT(*) c FROM appointments WHERE date=?').get(today) as unknown as { c: number }
  ).c
  const upcoming_appointments = (
    db.prepare("SELECT COUNT(*) c FROM appointments WHERE date>=? AND status='scheduled'").get(today) as unknown as { c: number }
  ).c

  let fromDate = today
  const days = period === '7' ? 7 : period === '30' ? 30 : 365
  const d = new Date()
  d.setDate(d.getDate() - (days - 1))
  fromDate = d.toISOString().slice(0, 10)

  const income = (
    db.prepare('SELECT COALESCE(SUM(paid),0) s FROM invoices WHERE date>=?').get(fromDate) as { s: number }
  ).s
  const expenses = (
    db.prepare('SELECT COALESCE(SUM(amount),0) s FROM expenses WHERE date>=?').get(fromDate) as { s: number }
  ).s
  const soldCost = (
    db.prepare(
      'SELECT COALESCE(SUM(ii.cost * ii.qty),0) s FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.date>=?'
    ).get(fromDate) as { s: number }
  ).s
  const margin = income - soldCost - expenses
  const materials_low = (
    db.prepare('SELECT COUNT(*) c FROM materials WHERE quantity<=min_qty AND min_qty>0').get() as unknown as { c: number }
  ).c
  const unpaid_total = (
    db.prepare("SELECT COALESCE(SUM(total-paid),0) s FROM invoices WHERE status!='paid'").get() as { s: number }
  ).s

  const byIncome = db
    .prepare('SELECT date, SUM(paid) s FROM invoices WHERE date>=? GROUP BY date')
    .all(fromDate) as { date: string; s: number }[]
  const byExp = db
    .prepare('SELECT date, SUM(amount) s FROM expenses WHERE date>=? GROUP BY date')
    .all(fromDate) as { date: string; s: number }[]
  const map = new Map<string, { date: string; income: number; expenses: number }>()
  for (let i = 0; i < days; i++) {
    const dt = new Date(d)
    dt.setDate(dt.getDate() + i)
    const key = dt.toISOString().slice(0, 10)
    map.set(key, { date: key, income: 0, expenses: 0 })
  }
  for (const r of byIncome) {
    const cur = map.get(r.date)
    if (cur) cur.income = r.s
  }
  for (const r of byExp) {
    const cur = map.get(r.date)
    if (cur) cur.expenses = r.s
  }
  const by_status = [...map.values()]

  const recent_invoices = listInvoices().slice(0, 8)

  return {
    period,
    patients_count,
    today_appointments,
    upcoming_appointments,
    income,
    expenses,
    margin,
    materials_low,
    unpaid_total,
    by_status,
    recent_invoices
  }
}

// ---- Maintenance ----
export function backupDatabase(dest: string): void {
  const q = dest.replace(/'/g, "''")
  db.exec("VACUUM INTO '" + q + "'")
}

export function reopenDb(): void {
  db.close()
  dbPath = dbFilePath()
  const dir = join(dbPath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
}

export function replaceDbFrom(src: string): void {
  db.close()
  dbPath = dbFilePath()
  const dir = join(dbPath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  copyFileSync(src, dbPath)
  db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate()
}