import { DatabaseSync } from './sqlite'
import { existsSync, mkdirSync, copyFileSync, readFileSync, unlinkSync, rmSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
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
  Medication,
  MedicationInput,
  Medicine,
  MedicineInput,
  Patient,
  PatientAttachment,
  PatientFileResult,
  Recurrence,
  DueRecurringExpense,
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
  db.setJournalMode('WAL')
  db.enableForeignKeys()
  migrate()
  upgradeSeedsToStudy()
  try {
    seedDefaultData()
  } catch (e) {
    console.error('بذر بيانات العيادة الافتراضية فشل:', e)
  }
  enableCloudDefaults()
  upgradePricesToStudy()
}

/** يملأ عنوان Supabase الافتراضي ويفعّل مزامنة Postgres تلقائياً (مرة واحدة) */
function enableCloudDefaults(): void {
  try {
    db.prepare("UPDATE settings SET value=? WHERE key='supabase_url' AND (value IS NULL OR value='')").run(
      'https://mroziduublsrcogojvcp.supabase.co'
    )
    const seeded = db.prepare("SELECT value FROM settings WHERE key='supabase_pg_seeded'").get()
    if (!seeded) {
      db.prepare("UPDATE settings SET value='1' WHERE key='supabase_pg_auto'").run()
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('supabase_pg_seeded','1')").run()
    }
  } catch (e) {
    console.error('تهيئة إعدادات المزامنة السحابية فشلت:', e)
  }
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
CREATE TABLE IF NOT EXISTS patient_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  ftype TEXT NOT NULL DEFAULT 'other',
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS patient_medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  scientific_name TEXT NOT NULL DEFAULT '',
  trade_name TEXT NOT NULL DEFAULT '',
  dose TEXT NOT NULL DEFAULT '',
  form TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'prescription',
  prescriber TEXT NOT NULL DEFAULT '',
  prescriber_specialty TEXT NOT NULL DEFAULT '',
  pharmacist TEXT NOT NULL DEFAULT '',
  dispense_date TEXT NOT NULL DEFAULT '',
  dispense_place TEXT NOT NULL DEFAULT '',
  next_review TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_name TEXT NOT NULL DEFAULT '',
  scientific_name TEXT NOT NULL DEFAULT '',
  dose TEXT NOT NULL DEFAULT '',
  form TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'prescription',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`)
  ensureCurrencyColumns()
  ensurePatientColumns()
  seed()
  seedMedicines()
  recalcUsd()
}

/** أعمدة السجل الطبي للمريض (تُضاف للقواعد القديمة عند الترقية) */
function ensurePatientColumns(): void {
  const add = (col: string, def: string): void => {
    const exists = db
      .prepare(`SELECT name FROM pragma_table_info('patients') WHERE name=?`)
      .get(col) as unknown as { name: string } | undefined
    if (!exists) db.exec(`ALTER TABLE patients ADD COLUMN ${col} ${def}`)
  }
  add('national_id', "TEXT NOT NULL DEFAULT ''")
  add('allergies', "TEXT NOT NULL DEFAULT ''")
  add('chronic_diseases', "TEXT NOT NULL DEFAULT ''")
  add('physiological_status', "TEXT NOT NULL DEFAULT ''")
  add('medical_notes', "TEXT NOT NULL DEFAULT ''")
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
  add('expenses', 'is_recurring', 'INTEGER NOT NULL DEFAULT 0')
  add('expenses', 'recurrence', "TEXT NOT NULL DEFAULT 'monthly'")
  add('expenses', 'next_due', "TEXT NOT NULL DEFAULT ''")
  add('expenses', 'last_generated', "TEXT NOT NULL DEFAULT ''")
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
    ['drive_auto', '0'],
    ['mysql_host', ''],
    ['mysql_port', '3306'],
    ['mysql_db', ''],
    ['mysql_user', ''],
    ['mysql_secret', ''],
    ['mysql_auto', '0'],
    ['supabase_url', ''],
    ['supabase_key', ''],
    ['supabase_auto', '0'],
    ['supabase_pg_auto', '0']
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
    supabase_url: out.supabase_url ?? '',
    supabase_key: out.supabase_key ?? '',
    supabase_auto: out.supabase_auto ?? '0',
    supabase_pg_auto: out.supabase_pg_auto ?? '0',
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
    .prepare(
      'INSERT INTO patients (name, phone, birth_date, gender, address, notes, national_id, allergies, chronic_diseases, physiological_status, medical_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    )
    .run(
      latinDigits(p.name),
      latinDigits(p.phone),
      p.birth_date,
      latinDigits(p.gender),
      latinDigits(p.address),
      latinDigits(p.notes),
      latinDigits(p.national_id ?? ''),
      latinDigits(p.allergies ?? ''),
      latinDigits(p.chronic_diseases ?? ''),
      latinDigits(p.physiological_status ?? ''),
      latinDigits(p.medical_notes ?? '')
    )
  return { ...p, id: Number(r.lastInsertRowid), created_at: new Date().toISOString() }
}

// ---- سجل أدوية المريض ----
const MED_COLS = [
  'patient_id',
  'scientific_name',
  'trade_name',
  'dose',
  'form',
  'route',
  'frequency',
  'start_date',
  'end_date',
  'category',
  'prescriber',
  'prescriber_specialty',
  'pharmacist',
  'dispense_date',
  'dispense_place',
  'next_review',
  'notes',
  'active'
] as const

function medValues(m: MedicationInput): (string | number)[] {
  return [
    m.patient_id,
    latinDigits(m.scientific_name),
    latinDigits(m.trade_name),
    latinDigits(m.dose),
    latinDigits(m.form),
    latinDigits(m.route),
    latinDigits(m.frequency),
    m.start_date,
    m.end_date,
    m.category,
    latinDigits(m.prescriber),
    latinDigits(m.prescriber_specialty),
    latinDigits(m.pharmacist),
    m.dispense_date,
    latinDigits(m.dispense_place),
    m.next_review,
    latinDigits(m.notes),
    m.active ? 1 : 0
  ]
}

export function listMedications(patientId: number): Medication[] {
  return db
    .prepare('SELECT * FROM patient_medications WHERE patient_id=? ORDER BY active DESC, id DESC')
    .all(patientId) as unknown as Medication[]
}

export function saveMedication(m: MedicationInput & { id?: number }): Medication {
  if (m.id) {
    const sets = MED_COLS.map((c) => `${c}=?`).join(', ')
    db.prepare(`UPDATE patient_medications SET ${sets} WHERE id=?`).run(...medValues(m), m.id)
    return db.prepare('SELECT * FROM patient_medications WHERE id=?').get(m.id) as unknown as Medication
  }
  const placeholders = MED_COLS.map(() => '?').join(', ')
  const r = db
    .prepare(`INSERT INTO patient_medications (${MED_COLS.join(', ')}) VALUES (${placeholders})`)
    .run(...medValues(m))
  return db
    .prepare('SELECT * FROM patient_medications WHERE id=?')
    .get(Number(r.lastInsertRowid)) as unknown as Medication
}

export function deleteMedication(id: number): void {
  db.prepare('DELETE FROM patient_medications WHERE id=?').run(id)
}

// ---- القائمة المرجعية للأدوية (وصفات طب الأسنان الشائعة) ----
const MEDICINE_COLS = [
  'trade_name',
  'scientific_name',
  'dose',
  'form',
  'route',
  'frequency',
  'category'
] as const

const SEED_MEDICINES: MedicineInput[] = [
  // مضادات حيوية
  { trade_name: 'أموكسيل 500', scientific_name: 'Amoxicillin 500mg', dose: '500 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'كل 8 ساعات لمدة 5–7 أيام', category: 'prescription' },
  { trade_name: 'أموكسيل شراب 250/5مل', scientific_name: 'Amoxicillin suspension', dose: '250 ملغ/5مل', form: 'شراب', route: 'فموي', frequency: 'حسب الوزن كل 8 ساعات', category: 'prescription' },
  { trade_name: 'أوجمنتين 625', scientific_name: 'Amoxicillin + Clavulanic acid 625mg', dose: '625 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات لمدة 5–7 أيام', category: 'prescription' },
  { trade_name: 'أوجمنتين 1غم', scientific_name: 'Amoxicillin + Clavulanic acid 1g', dose: '1 غم', form: 'أقراص', route: 'فموي', frequency: 'كل 12 ساعة لمدة 5–7 أيام', category: 'prescription' },
  { trade_name: 'أوجمنتين شراب', scientific_name: 'Amoxicillin + Clavulanic acid suspension', dose: '457 ملغ/5مل', form: 'شراب', route: 'فموي', frequency: 'حسب الوزن كل 12 ساعة', category: 'prescription' },
  { trade_name: 'فلاجيل 500', scientific_name: 'Metronidazole 500mg', dose: '500 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات لمدة 5 أيام', category: 'prescription' },
  { trade_name: 'رودوجيل', scientific_name: 'Spiramycin + Metronidazole', dose: '1.5 مليون وحدة', form: 'أقراص', route: 'فموي', frequency: 'كل 12 ساعة لمدة 6 أيام', category: 'prescription' },
  { trade_name: 'روفامايسين', scientific_name: 'Spiramycin 3MIU', dose: '3 مليون وحدة', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات لمدة 6 أيام', category: 'prescription' },
  { trade_name: 'زينات 500', scientific_name: 'Cefuroxime axetil 500mg', dose: '500 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 12 ساعة لمدة 5 أيام', category: 'prescription' },
  { trade_name: 'كيمايسين 400', scientific_name: 'Cefixime 400mg', dose: '400 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'مرة يومياً لمدة 5 أيام', category: 'prescription' },
  { trade_name: 'دالاسين سي 300', scientific_name: 'Clindamycin 300mg', dose: '300 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'كل 8 ساعات لمدة 5–7 أيام', category: 'prescription' },
  { trade_name: 'زيثروماكس 500', scientific_name: 'Azithromycin 500mg', dose: '500 ملغ', form: 'أقراص', route: 'فموي', frequency: 'مرة يومياً لمدة 3 أيام', category: 'prescription' },
  { trade_name: 'أزومكس 250', scientific_name: 'Azithromycin 250mg', dose: '250 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'مرة يومياً لمدة 3 أيام', category: 'prescription' },
  { trade_name: 'كلاسيد 250', scientific_name: 'Clarithromycin 250mg', dose: '250 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 12 ساعة لمدة 7 أيام', category: 'prescription' },
  { trade_name: 'سيبرو 500', scientific_name: 'Ciprofloxacin 500mg', dose: '500 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 12 ساعة لمدة 5 أيام', category: 'prescription' },
  { trade_name: 'دوكسي 100', scientific_name: 'Doxycycline 100mg', dose: '100 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'مرة يومياً لمدة 7 أيام', category: 'prescription' },
  { trade_name: 'سيفوتاكس حقن', scientific_name: 'Cefotaxime 1g', dose: '1 غم', form: 'حقن', route: 'عضلي/وريدي', frequency: 'كل 12 ساعة حسب الحالة', category: 'prescription' },
  { trade_name: 'بنسلين حقن', scientific_name: 'Benzathine penicillin', dose: '1.2 مليون وحدة', form: 'حقن', route: 'عضلي', frequency: 'جرعة واحدة', category: 'prescription' },

  // مسكنات ومضادات التهاب
  { trade_name: 'بانادول 500', scientific_name: 'Paracetamol 500mg', dose: '500 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 6 ساعات عند الألم', category: 'otc' },
  { trade_name: 'بانادول أدفانس', scientific_name: 'Paracetamol 1000mg', dose: '1 غم', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات عند الألم', category: 'otc' },
  { trade_name: 'أدول شراب', scientific_name: 'Paracetamol suspension', dose: '120 ملغ/5مل', form: 'شراب', route: 'فموي', frequency: 'حسب الوزن كل 6 ساعات', category: 'otc' },
  { trade_name: 'بروفين 400', scientific_name: 'Ibuprofen 400mg', dose: '400 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات بعد الأكل', category: 'prescription' },
  { trade_name: 'بروفين 600', scientific_name: 'Ibuprofen 600mg', dose: '600 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات بعد الأكل', category: 'prescription' },
  { trade_name: 'بروفين شراب', scientific_name: 'Ibuprofen suspension', dose: '100 ملغ/5مل', form: 'شراب', route: 'فموي', frequency: 'حسب الوزن كل 8 ساعات', category: 'otc' },
  { trade_name: 'فولتارين 50', scientific_name: 'Diclofenac sodium 50mg', dose: '50 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات بعد الأكل', category: 'prescription' },
  { trade_name: 'فولتارين SR 100', scientific_name: 'Diclofenac sodium 100mg SR', dose: '100 ملغ', form: 'أقراص ممتدة', route: 'فموي', frequency: 'مرة يومياً', category: 'prescription' },
  { trade_name: 'كاتافلام 50', scientific_name: 'Diclofenac potassium 50mg', dose: '50 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات بعد الأكل', category: 'prescription' },
  { trade_name: 'فولتارين حقن', scientific_name: 'Diclofenac 75mg injection', dose: '75 ملغ', form: 'حقن', route: 'عضلي', frequency: 'عند الألم الشديد مرة أو مرتين', category: 'prescription' },
  { trade_name: 'نوفالجين 500', scientific_name: 'Metamizole (Dipyrone) 500mg', dose: '500 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات عند الألم', category: 'prescription' },
  { trade_name: 'بونستان 250', scientific_name: 'Mefenamic acid 250mg', dose: '250 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'كل 8 ساعات بعد الأكل', category: 'prescription' },
  { trade_name: 'موبيك 15', scientific_name: 'Meloxicam 15mg', dose: '15 ملغ', form: 'أقراص', route: 'فموي', frequency: 'مرة يومياً', category: 'prescription' },
  { trade_name: 'سيليبريكس 200', scientific_name: 'Celecoxib 200mg', dose: '200 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'مرة أو مرتين يومياً', category: 'prescription' },
  { trade_name: 'نابروكسين 500', scientific_name: 'Naproxen 500mg', dose: '500 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 12 ساعة بعد الأكل', category: 'prescription' },
  { trade_name: 'ترامادول 50', scientific_name: 'Tramadol 50mg', dose: '50 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'كل 8 ساعات عند الألم الشديد', category: 'prescription' },

  // كورتيزون
  { trade_name: 'ديكساميتازون حقن', scientific_name: 'Dexamethasone injection', dose: '4–8 ملغ', form: 'حقن', route: 'عضلي/وريدي', frequency: 'مرة يومياً 1–3 أيام', category: 'prescription' },
  { trade_name: 'بريدنيزولون 5', scientific_name: 'Prednisolone 5mg', dose: '5 ملغ', form: 'أقراص', route: 'فموي', frequency: 'حسب الحالة مع الفطور', category: 'prescription' },
  { trade_name: 'ميدرول 4', scientific_name: 'Methylprednisolone 4mg', dose: '4 ملغ', form: 'أقراص', route: 'فموي', frequency: 'حسب الحالة مع الفطور', category: 'prescription' },

  // غسول وجل فموي
  { trade_name: 'غسول كلورهيكسيدين 0.12%', scientific_name: 'Chlorhexidine mouthwash 0.12%', dose: '15 مل', form: 'غسول فموي', route: 'مضمضة', frequency: 'مرتين يومياً لمدة دقيقة', category: 'otc' },
  { trade_name: 'غسول كلورهيكسيدين 0.2%', scientific_name: 'Chlorhexidine mouthwash 0.2%', dose: '10 مل', form: 'غسول فموي', route: 'مضمضة', frequency: 'مرتين يومياً لمدة دقيقة', category: 'otc' },
  { trade_name: 'بيتادين غرغرة', scientific_name: 'Povidone-iodine gargle', dose: '10 مل ممدد', form: 'غرغرة', route: 'مضمضة', frequency: '3 مرات يومياً', category: 'otc' },
  { trade_name: 'تانتوم فيردي بخاخ', scientific_name: 'Benzydamine spray', dose: 'بخة', form: 'بخاخ فموي', route: 'موضعي', frequency: '3–4 مرات يومياً', category: 'otc' },
  { trade_name: 'جل كاميستاد', scientific_name: 'Lidocaine + Chamomile gel', dose: 'طبقة رقيقة', form: 'جل', route: 'موضعي', frequency: '2–3 مرات يومياً', category: 'otc' },
  { trade_name: 'جل أوراجيل', scientific_name: 'Benzocaine oral gel', dose: 'طبقة رقيقة', form: 'جل', route: 'موضعي', frequency: 'عند اللزوم', category: 'otc' },
  { trade_name: 'زيلوكايين جل 2%', scientific_name: 'Lidocaine gel 2%', dose: 'طبقة رقيقة', form: 'جل', route: 'موضعي', frequency: 'قبل الإجراء عن اللزوم', category: 'prescription' },
  { trade_name: 'يوجينول (زيت القرنفل)', scientific_name: 'Eugenol (clove oil)', dose: 'قطعة قطن صغيرة', form: 'سائل', route: 'موضعي', frequency: 'عند ألم السن', category: 'otc' },
  { trade_name: 'ألوجيل', scientific_name: 'Alvogyl dressing', dose: 'كمية صغيرة', form: 'معجون', route: 'موضعي في السنخ', frequency: 'مرة واحدة عند الطبيب', category: 'prescription' },

  // مضادات فطريات
  { trade_name: 'نستاتين شراب', scientific_name: 'Nystatin oral suspension', dose: '4–6 مل', form: 'شراب', route: 'فموي/موضعي', frequency: '4 مرات يومياً لمدة 7–14 يوم', category: 'prescription' },
  { trade_name: 'داكترين جل فموي', scientific_name: 'Miconazole oral gel', dose: 'طبقة رقيقة', form: 'جل فموي', route: 'موضعي', frequency: '2–4 مرات يومياً', category: 'prescription' },
  { trade_name: 'ديفلوكان 150', scientific_name: 'Fluconazole 150mg', dose: '150 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'جرعة واحدة ثم تكرر بعد أسبوع', category: 'prescription' },
  { trade_name: 'كلوتريمازول فموي', scientific_name: 'Clotrimazole troche', dose: '10 ملغ', form: 'أقراص مص', route: 'موضعي', frequency: 'كل 8 ساعات لمدة 14 يوم', category: 'prescription' },

  // مضادات فيروس (هربس)
  { trade_name: 'زوفيراكس 400', scientific_name: 'Acyclovir 400mg', dose: '400 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات لمدة 5 أيام', category: 'prescription' },
  { trade_name: 'زوفيراكس كريم', scientific_name: 'Acyclovir cream 5%', dose: 'طبقة رقيقة', form: 'كريم', route: 'موضعي', frequency: 'كل 4 ساعات لمدة 5 أيام', category: 'prescription' },
  { trade_name: 'فالتريكس 500', scientific_name: 'Valacyclovir 500mg', dose: '500 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 12 ساعة لمدة 5 أيام', category: 'prescription' },

  // مضادات هيستامين
  { trade_name: 'زيرتك 10', scientific_name: 'Cetirizine 10mg', dose: '10 ملغ', form: 'أقراص', route: 'فموي', frequency: 'مرة يومياً مساءً', category: 'otc' },
  { trade_name: 'كلاريتين 10', scientific_name: 'Loratadine 10mg', dose: '10 ملغ', form: 'أقراص', route: 'فموي', frequency: 'مرة يومياً', category: 'otc' },
  { trade_name: 'كلورفينيرامين 4', scientific_name: 'Chlorpheniramine 4mg', dose: '4 ملغ', form: 'أقراص', route: 'فموي', frequency: 'كل 8 ساعات', category: 'prescription' },

  // حماية المعدة
  { trade_name: 'لوسيك 20', scientific_name: 'Omeprazole 20mg', dose: '20 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'مرة يومياً قبل الفطور', category: 'prescription' },
  { trade_name: 'نيكسيوم 40', scientific_name: 'Esomeprazole 40mg', dose: '40 ملغ', form: 'أقراص', route: 'فموي', frequency: 'مرة يومياً قبل الفطور', category: 'prescription' },
  { trade_name: 'كونترولوك 40', scientific_name: 'Pantoprazole 40mg', dose: '40 ملغ', form: 'أقراص', route: 'فموي', frequency: 'مرة يومياً قبل الفطور', category: 'prescription' },
  { trade_name: 'بريمبران 10', scientific_name: 'Metoclopramide 10mg', dose: '10 ملغ', form: 'أقراص', route: 'فموي', frequency: 'قبل الأكل 3 مرات يومياً', category: 'prescription' },

  // واقٍ للنزف
  { trade_name: 'سيكلوكابرون 500', scientific_name: 'Tranexamic acid 500mg', dose: '500 ملغ', form: 'كبسولات', route: 'فموي', frequency: 'كل 8 ساعات لمدة 2–5 أيام', category: 'prescription' },
  { trade_name: 'غسول حمض الترانيكساميك', scientific_name: 'Tranexamic acid mouthwash', dose: '10 مل', form: 'غسول فموي', route: 'مضمضة', frequency: '4 مرات يومياً لمدة 2–5 أيام', category: 'prescription' }
]

function medicineValues(m: MedicineInput): (string | number)[] {
  return [
    latinDigits(m.trade_name),
    latinDigits(m.scientific_name),
    latinDigits(m.dose),
    latinDigits(m.form),
    latinDigits(m.route),
    latinDigits(m.frequency),
    m.category
  ]
}

function seedMedicines(): void {
  const row = db.prepare('SELECT COUNT(*) AS c FROM medicines').get() as { c: number }
  if (Number(row?.c ?? 0) > 0) return
  const stmt = db.prepare(
    `INSERT INTO medicines (${MEDICINE_COLS.join(', ')}) VALUES (${MEDICINE_COLS.map(() => '?').join(', ')})`
  )
  const tx = db.prepare('BEGIN')
  tx.run()
  try {
    for (const m of SEED_MEDICINES) stmt.run(...medicineValues(m))
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
}

export function listMedicines(): Medicine[] {
  return db.prepare('SELECT * FROM medicines ORDER BY category, trade_name').all() as unknown as Medicine[]
}

export function createMedicine(m: MedicineInput): Medicine {
  const r = db
    .prepare(`INSERT INTO medicines (${MEDICINE_COLS.join(', ')}) VALUES (${MEDICINE_COLS.map(() => '?').join(', ')})`)
    .run(...medicineValues(m))
  return db.prepare('SELECT * FROM medicines WHERE id=?').get(Number(r.lastInsertRowid)) as unknown as Medicine
}

export function updateMedicine(id: number, m: MedicineInput): Medicine {
  const sets = MEDICINE_COLS.map((c) => `${c}=?`).join(', ')
  db.prepare(`UPDATE medicines SET ${sets} WHERE id=?`).run(...medicineValues(m), id)
  return db.prepare('SELECT * FROM medicines WHERE id=?').get(id) as unknown as Medicine
}

export function deleteMedicine(id: number): void {
  db.prepare('DELETE FROM medicines WHERE id=?').run(id)
}

// ---- مرفقات المريض (صور، صور أشعة DICOM، ملفات) — تُحفَظ محلياً فقط ----
const DICOM_EXT = new Set(['.dcm', '.dicom', '.dcmdir', '.ima', '.dcm30'])
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff'
}

function classifyAttachment(ext: string): { ftype: PatientAttachment['ftype']; mime: string } {
  const e = ext.toLowerCase()
  if (DICOM_EXT.has(e)) return { ftype: 'dicom', mime: 'application/dicom' }
  if (IMAGE_MIME[e]) return { ftype: 'image', mime: IMAGE_MIME[e] }
  return { ftype: 'other', mime: e === '.pdf' ? 'application/pdf' : 'application/octet-stream' }
}

function patientFilesDir(patientId: number): string {
  const dir = join(dataDir(), 'patient_files', String(patientId))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function attachmentPath(row: PatientAttachment): string {
  return join(dataDir(), 'patient_files', String(row.patient_id), row.stored_name)
}

export function listPatientFiles(patientId: number): PatientAttachment[] {
  return db
    .prepare('SELECT * FROM patient_files WHERE patient_id=? ORDER BY id DESC')
    .all(patientId) as unknown as PatientAttachment[]
}

export function getPatientFileRecord(id: number): PatientAttachment {
  const row = db.prepare('SELECT * FROM patient_files WHERE id=?').get(id) as unknown as
    | PatientAttachment
    | undefined
  if (!row) throw new Error('المرفق غير موجود')
  return row
}

export function addPatientFile(patientId: number, srcPath: string): PatientAttachment {
  const patient = db.prepare('SELECT id FROM patients WHERE id=?').get(patientId)
  if (!patient) throw new Error('المريض غير موجود')
  if (!existsSync(srcPath)) throw new Error('الملف غير موجود: ' + srcPath)
  const original = basename(srcPath)
  const ext = extname(original)
  const { ftype, mime } = classifyAttachment(ext)
  const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext.toLowerCase()}`
  const dest = join(patientFilesDir(patientId), storedName)
  copyFileSync(srcPath, dest)
  const size = statSync(dest).size
  const r = db
    .prepare('INSERT INTO patient_files (patient_id, filename, stored_name, ftype, mime, size) VALUES (?,?,?,?,?,?)')
    .run(patientId, original, storedName, ftype, mime, size)
  return {
    id: Number(r.lastInsertRowid),
    patient_id: patientId,
    filename: original,
    stored_name: storedName,
    ftype,
    mime,
    size,
    created_at: new Date().toISOString()
  }
}

/** يقرأ الملف من القرص ويعيده كـ data URL لعرضه داخل البرنامج */
export function readPatientFile(id: number): { attachment: PatientAttachment; dataUrl: string } {
  const row = getPatientFileRecord(id)
  const p = attachmentPath(row)
  if (!existsSync(p)) throw new Error('الملف غير موجود على القرص')
  const buf = readFileSync(p)
  const mime = row.mime || 'application/octet-stream'
  return { attachment: row, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
}

export function deletePatientFile(id: number): void {
  const row = getPatientFileRecord(id)
  db.prepare('DELETE FROM patient_files WHERE id=?').run(id)
  try {
    const p = attachmentPath(row)
    if (existsSync(p)) unlinkSync(p)
  } catch {
    /* ignore */
  }
}

export function getPatientFile(id: number): PatientFileResult {
  const patient = db.prepare('SELECT * FROM patients WHERE id=?').get(id) as unknown as Patient | undefined
  if (!patient) throw new Error('المريض غير موجود')
  const appointments = db
    .prepare('SELECT * FROM appointments WHERE patient_id=? ORDER BY date DESC, time DESC LIMIT 200')
    .all(id) as unknown as Appointment[]
  const invoices = db
    .prepare('SELECT * FROM invoices WHERE patient_id=? ORDER BY id DESC LIMIT 200')
    .all(id) as unknown as Invoice[]
  return {
    patient,
    appointments,
    invoices,
    attachments: listPatientFiles(id),
    medications: listMedications(id)
  }
}

export function updatePatient(id: number, p: Omit<Patient, 'id' | 'created_at'>): void {
  db.prepare(
    "UPDATE patients SET name=?, phone=?, birth_date=?, gender=?, address=?, notes=?, national_id=?, allergies=?, chronic_diseases=?, physiological_status=?, medical_notes=?, updated_at=datetime('now','localtime') WHERE id=?"
  ).run(
    latinDigits(p.name),
    latinDigits(p.phone),
    p.birth_date,
    latinDigits(p.gender),
    latinDigits(p.address),
    latinDigits(p.notes),
    latinDigits(p.national_id ?? ''),
    latinDigits(p.allergies ?? ''),
    latinDigits(p.chronic_diseases ?? ''),
    latinDigits(p.physiological_status ?? ''),
    latinDigits(p.medical_notes ?? ''),
    id
  )
}

export function deletePatient(id: number): void {
  db.prepare('BEGIN').run()
  try {
    db.prepare('DELETE FROM invoice_materials WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id=?)').run(id)
    db.prepare('DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id=?)').run(id)
    db.prepare('DELETE FROM invoices WHERE patient_id=?').run(id)
    db.prepare('DELETE FROM appointments WHERE patient_id=?').run(id)
    db.prepare('DELETE FROM patient_files WHERE patient_id=?').run(id)
    db.prepare('DELETE FROM patient_medications WHERE patient_id=?').run(id)
    db.prepare('DELETE FROM patients WHERE id=?').run(id)
    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }
  try {
    const dir = join(dataDir(), 'patient_files', String(id))
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
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
       (SELECT COALESCE(ROUND(SUM(im.qty*m.cost),2),0) FROM invoice_materials im JOIN materials m ON m.id=im.material_id WHERE im.invoice_id=i.id) AS items_cost
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

/** يحسب تاريخ الاستحقاق التالي لدورية محددة انطلاقاً من تاريخ مرجعي */
export function nextDueDate(from: string, recurrence: Recurrence): string {
  const d = new Date(`${from}T00:00:00`)
  if (Number.isNaN(d.getTime())) return from
  if (recurrence === 'weekly') d.setDate(d.getDate() + 7)
  else if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (recurrence === 'quarterly') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export function createExpense(e: Omit<Expense, 'id' | 'created_at'>): Expense {
  const rate = getSettings().usd_rate
  const clean = { ...e, category: latinDigits(e.category ?? ''), note: latinDigits(e.note ?? '') }
  const amountN = numAny(clean.amount)
  const amount = Number.isNaN(amountN) ? 0 : amountN
  const amountUsd = rate > 0 ? Math.round((amount / rate) * 100) / 100 : 0
  const recurring = clean.is_recurring ? 1 : 0
  const recurrence = (clean.recurrence ?? 'monthly') as Recurrence
  const nextDue = recurring ? clean.next_due || nextDueDate(clean.date, recurrence) : ''
  const r = db
    .prepare(
      'INSERT INTO expenses (category, amount, amount_usd, note, date, created_by, is_recurring, recurrence, next_due) VALUES (?,?,?,?,?,?,?,?,?)'
    )
    .run(clean.category, amount, amountUsd, clean.note, clean.date, clean.created_by, recurring, recurrence, nextDue)
  return {
    ...clean,
    amount,
    amount_usd: amountUsd,
    is_recurring: recurring,
    recurrence,
    next_due: nextDue,
    id: Number(r.lastInsertRowid),
    created_at: new Date().toISOString()
  }
}

export function updateExpense(id: number, e: Omit<Expense, 'id' | 'created_at'>): void {
  const rate = getSettings().usd_rate
  const clean = { ...e, category: latinDigits(e.category ?? ''), note: latinDigits(e.note ?? '') }
  const amountN = numAny(clean.amount)
  const amount = Number.isNaN(amountN) ? 0 : amountN
  const amountUsd = rate > 0 ? Math.round((amount / rate) * 100) / 100 : 0
  const recurring = clean.is_recurring ? 1 : 0
  const recurrence = (clean.recurrence ?? 'monthly') as Recurrence
  const nextDue = recurring ? clean.next_due || nextDueDate(clean.date, recurrence) : ''
  db.prepare(
    'UPDATE expenses SET category=?, amount=?, amount_usd=?, note=?, date=?, is_recurring=?, recurrence=?, next_due=? WHERE id=?'
  ).run(clean.category, amount, amountUsd, clean.note, clean.date, recurring, recurrence, nextDue, id)
}

export function deleteExpense(id: number): void {
  db.prepare('DELETE FROM expenses WHERE id=?').run(id)
}

/** المصاريف المتكررة المستحقة خلال الأيام القادمة (الافتراضي 7 أيام) */
export function listDueRecurringExpenses(withinDays = 7): DueRecurringExpense[] {
  const today = new Date().toISOString().slice(0, 10)
  const limit = new Date(`${today}T00:00:00`)
  limit.setDate(limit.getDate() + Math.max(0, withinDays))
  const limitStr = limit.toISOString().slice(0, 10)
  const rows = db
    .prepare(
      `SELECT id, category, amount, note, recurrence, next_due,
        CAST(julianday(next_due) - julianday(?) AS INTEGER) AS days_left
       FROM expenses
       WHERE is_recurring=1 AND next_due<>'' AND next_due<=?
       ORDER BY next_due ASC`
    )
    .all(today, limitStr) as unknown as DueRecurringExpense[]
  return rows
}

/**
 * يولّد الفواتير الدورية المستحقة اليوم ويسحب موعد الاستحقاق للفترة التالية.
 * آمن للتكرار: يعتمد على last_generated فلا يولّد مصروفاً لنفس الفترة مرتين.
 */
export function materializeDueRecurringExpenses(todayStr?: string): number {
  const today = todayStr ?? new Date().toISOString().slice(0, 10)
  const due = db
    .prepare(
      "SELECT * FROM expenses WHERE is_recurring=1 AND next_due<>'' AND next_due<=? AND (last_generated='' OR last_generated < next_due)"
    )
    .all(today) as unknown as Expense[]
  let made = 0
  for (const src of due) {
    const recurrence = (src.recurrence ?? 'monthly') as Recurrence
    const period = src.next_due ?? src.date
    let next = nextDueDate(period, recurrence)
    // إذا كان الاستحقاق متأخراً بأشهر، نلحق باليوم الحالي بدل تراكم فواتير قديمة
    let guard = 0
    while (next <= today && guard++ < 600) next = nextDueDate(next, recurrence)
    db.prepare(
      `INSERT INTO expenses (category, amount, amount_usd, note, date, created_by, is_recurring, recurrence, next_due)
       VALUES (?,?,?,?,?,?,0,'','')`
    ).run(
      src.category,
      src.amount,
      src.amount_usd ?? 0,
      src.note,
      today,
      src.created_by ?? '',
    )
    db.prepare('UPDATE expenses SET next_due=?, last_generated=? WHERE id=?').run(next, today, src.id)
    made++
  }
  return made
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
  db.setJournalMode('WAL')
  db.enableForeignKeys()
}

export function replaceDbFrom(src: string): void {
  db.close()
  dbPath = dbFilePath()
  const dir = join(dbPath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  copyFileSync(src, dbPath)
  db = new DatabaseSync(dbPath)
  db.setJournalMode('WAL')
  db.enableForeignKeys()
  migrate()
}