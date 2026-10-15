import { createHash } from 'node:crypto'
import { getDb } from './db'

// جدول محلي فقط يحفظ بصمة آخر صف تم رفعه/سحبه لكل ناقل — لا يُزامَن أبداً
const META = '_sync_delta'

const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

// مفاتيح إعدادات خاصّة بالمزامنة/الناقل — يجب ألا تنتقل إلى السحابة أبداً،
// وإلّا تصادمت حالة المزامنة بين الأجهزة (ويندوز/ماك/الجوال) وأوقف بعضها عمل الآخر.
const META_SETTING_KEY = /^sync_state_/
export function isMetaSettingKey(key: string): boolean {
  return META_SETTING_KEY.test(key) || key === 'sync_transport'
}
/** يُخفي صفوف الإعدادات الخاصّة بالمزامنة من الرفع/الدمج (جدول settings فقط) */
function visibleRows(tbl: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (tbl !== 'settings') return rows
  return rows.filter((r) => !isMetaSettingKey(String((r as { key?: unknown }).key ?? '')))
}

export interface MergeCounts {
  inserted: number
  updated: number
  deleted: number
}

function assertSafeName(name: string): void {
  if (!SAFE_NAME.test(name)) throw new Error('اسم جدول/عمود غير آمن: ' + name)
}

export function ensureDeltaTable(): void {
  getDb().exec(
    `CREATE TABLE IF NOT EXISTS ${META} (transport TEXT NOT NULL, tbl TEXT NOT NULL, id TEXT NOT NULL, sig TEXT NOT NULL, PRIMARY KEY (transport, tbl, id))`
  )
}

/**
 * يمحو كل بصمات المزامنة (baselines). يُستدعى بعد استعادة نسخة احتياطية حتى تُعتبر
 * كل الصفوف المستعادة «مغيّرة» فتُرفع كاملة إلى السحابة (المستعاد هو المرجع) بدل أن
 * تتجاوزها المزامنة باعتبارها مُزامَنة سابقاً.
 */
export function clearAllBaselines(): void {
  ensureDeltaTable()
  try {
    getDb().prepare(`DELETE FROM \`${META}\``).run()
  } catch {
    /* ignore */
  }
}

/** اسم عمود المفتاح الأساسي للجدول (id تقريباً للكل، key لجدول الإعدادات) */
export function pkColumn(tbl: string): string {
  assertSafeName(tbl)
  const cols = getDb().prepare(`PRAGMA table_info(\`${tbl}\`)`).all() as unknown as { name: string; pk: number }[]
  const pk = cols.find((c) => c.pk === 1)
  if (!pk) throw new Error('لا يوجد مفتاح أساسي في الجدول ' + tbl)
  return pk.name
}

/** بصمة صف مستقلة عن ترتيب الأعمدة والقيم الفارغة */
export function rowSig(row: Record<string, unknown>): string {
  const o: Record<string, unknown> = {}
  for (const k of Object.keys(row).sort()) {
    let v = row[k]
    if (v === null || v === undefined) v = ''
    else if (typeof v === 'boolean') v = v ? 1 : 0
    else if (typeof v === 'object') v = JSON.stringify(v)
    o[k] = v
  }
  return createHash('sha1').update(JSON.stringify(o)).digest('hex')
}

export function readBaseline(transport: string, tbl: string): Map<string, string> {
  ensureDeltaTable()
  const rows = getDb()
    .prepare(`SELECT id, sig FROM \`${META}\` WHERE transport=? AND tbl=?`)
    .all(transport, tbl) as unknown as { id: string; sig: string }[]
  const m = new Map<string, string>()
  for (const r of rows) m.set(String(r.id), String(r.sig))
  return m
}

/** يحدّث baseline ليعكس الحالة المحلية الحالية (يُستدعى بعد نجاح رفع أو دمج) */
export function saveBaseline(transport: string, tbl: string, rows: Record<string, unknown>[]): void {
  ensureDeltaTable()
  assertSafeName(tbl)
  const db = getDb()
  const pk = pkColumn(tbl)
  db.prepare(`DELETE FROM \`${META}\` WHERE transport=? AND tbl=?`).run(transport, tbl)
  const ins = db.prepare(`INSERT OR REPLACE INTO \`${META}\` (transport, tbl, id, sig) VALUES (?,?,?,?)`)
  for (const r of visibleRows(tbl, rows)) {
    ins.run(transport, tbl, String((r as Record<string, unknown>)[pk] ?? ''), rowSig(r))
  }
}

/** يخطّط الرفع التفرقي: صفوف جديدة/معدلة للرفع، ومعرّفات محذوفة محلياً لحذفها من البعيد */
export function planPush(
  transport: string,
  tbl: string,
  localRows: Record<string, unknown>[]
): { upsert: Record<string, unknown>[]; deletes: (string | number)[] } {
  const baseline = readBaseline(transport, tbl)
  const rows = visibleRows(tbl, localRows)
  if (baseline.size === 0) {
    // أول رفع لهذا الجدول: نرفع كل الصفوف لتأسيس baseline
    return { upsert: rows, deletes: [] }
  }
  const pk = pkColumn(tbl)
  const upsert: Record<string, unknown>[] = []
  const present = new Set<string>()
  for (const r of rows) {
    const id = String((r as Record<string, unknown>)[pk] ?? '')
    present.add(id)
    if (baseline.get(id) !== rowSig(r)) upsert.push(r)
  }
  const deletes: (string | number)[] = []
  for (const id of baseline.keys()) {
    if (tbl === 'settings' && isMetaSettingKey(id)) continue
    if (!present.has(id)) deletes.push(id)
  }
  return { upsert, deletes }
}

/**
 * حذف محلي للصفوف التي كانت متزامنة سابقاً واختفت من البعيد (حُذفت هناك).
 * لا نحذف صفاً عدّله المستخدم محلياً بعد آخر مزامنة (المحلي يفوز — سيُرفع مجدداً).
 */
export function mergeDeletes(transport: string, tbl: string, remoteRows: Record<string, unknown>[]): number {
  assertSafeName(tbl)
  const baseline = readBaseline(transport, tbl)
  if (baseline.size === 0) return 0
  const pk = pkColumn(tbl)
  const db = getDb()
  const remote = new Set<string>()
  for (const r of remoteRows) {
    const id = String((r as Record<string, unknown>)[pk] ?? '')
    if (id !== '') remote.add(id)
  }
  const localSig = new Map<string, string>()
  for (const r of db.prepare(`SELECT * FROM \`${tbl}\``).all() as unknown as Record<string, unknown>[]) {
    localSig.set(String((r as Record<string, unknown>)[pk] ?? ''), rowSig(r))
  }
  const del = db.prepare(`DELETE FROM \`${tbl}\` WHERE \`${pk}\`=?`)
  let deleted = 0
  for (const [id, baseSig] of baseline) {
    if (tbl === 'settings' && isMetaSettingKey(id)) continue
    if (remote.has(id)) continue
    const localV = localSig.get(id)
    if (localV === undefined) continue // محذوف محلياً أصلاً
    if (localV !== baseSig) continue // المصدر عدّله محلياً بعد آخر مزامنة → المحلي يفوز
    del.run(id)
    deleted++
  }
  return deleted
}

/**
 * إدراج/تحديث الصفوف القادمة من البعيد فقط عند الحاجة، مع قاعدة «المحلي يفوز»:
 * - صف جديد على البعيد → يُدرج.
 * - صف عدّله البعيد ولم يُعدّله المحلي → يُحدّث.
 * - صف عدّله المحلي (متسخ) → يُترك (سيُرفع).
 * - صف حذفه المحلي (غير موجود محلياً لكنه في الأساس) → يُترك (سيُحذف من البعيد).
 */
export function mergeUpserts(
  transport: string,
  tbl: string,
  remoteRows: Record<string, unknown>[]
): { inserted: number; updated: number } {
  assertSafeName(tbl)
  const db = getDb()
  const pk = pkColumn(tbl)
  const baseline = readBaseline(transport, tbl)

  const localRows = db.prepare(`SELECT * FROM \`${tbl}\``).all() as unknown as Record<string, unknown>[]
  const localSig = new Map<string, string>()
  for (const r of localRows) localSig.set(String((r as Record<string, unknown>)[pk] ?? ''), rowSig(r))

  let inserted = 0
  let updated = 0
  let prepared = false
  let cols: string[] = []
  let fields: string[] = []
  let insStmt: ReturnType<typeof db.prepare> | null = null
  let updStmt: ReturnType<typeof db.prepare> | null = null
  for (const r of visibleRows(tbl, remoteRows)) {
    const id = String((r as Record<string, unknown>)[pk] ?? '')
    if (id === '' || id === 'undefined') continue
    if (!prepared) {
      prepared = true
      cols = Object.keys(r).filter((c) => SAFE_NAME.test(c))
      fields = cols.filter((c) => c !== pk)
      if (cols.length) {
        insStmt = db.prepare(`INSERT INTO \`${tbl}\` (\`${cols.join('`,`')}\`) VALUES (${cols.map(() => '?').join(',')})`)
      }
      if (fields.length) {
        updStmt = db.prepare(
          `UPDATE \`${tbl}\` SET ${fields.map((c) => `\`${c}\`=?`).join(',')} WHERE \`${pk}\`=?`
        )
      }
    }
    const remoteSig = rowSig(r)
    const localV = localSig.get(id)
    const baseSig = baseline.get(id)

    if (localV === undefined) {
      // غير موجود محلياً
      if (baseSig === undefined) {
        // صف جديد من البعيد
        if (insStmt) insStmt.run(...cols.map((c) => normalizeValue(r[c])))
        inserted++
      }
      // موجود في الأساس لكن غائب محلياً = حذفه المستخدم محلياً → لن نُعيده
      continue
    }

    const localDirty = localV !== baseSig
    const remoteDirty = remoteSig !== baseSig
    if (!localDirty && remoteDirty) {
      if (updStmt) updStmt.run(...fields.map((c) => normalizeValue(r[c])), id)
      updated++
    }
    // localDirty → المحلي يفوز، لا نلمسه
  }
  return { inserted, updated }
}

/**
 * دمج كامل في مكان واحد عبر صفقة واحدة: حذف الأبناء أولاً ثم إدراج/تحديث الآباء قبل الأبناء.
 * لا يمسح الجداول ولا يستبدل ملف القاعدة — فترتاح الواجهة ولا تتعطل.
 */
export function mergeIntoLocal(
  transport: string,
  data: Record<string, Record<string, unknown>[]>,
  deleteOrder: string[],
  insertOrder: string[],
  failed: string[] = []
): MergeCounts {
  const db = getDb()
  const counts: MergeCounts = { inserted: 0, updated: 0, deleted: 0 }
  const skip = new Set(failed)
  db.exec('BEGIN')
  try {
    for (const t of deleteOrder) {
      if (!data[t] || skip.has(t)) continue
      counts.deleted += mergeDeletes(transport, t, data[t])
    }
    for (const t of insertOrder) {
      if (!data[t] || skip.has(t)) continue
      const c = mergeUpserts(transport, t, data[t])
      counts.inserted += c.inserted
      counts.updated += c.updated
    }
    for (const t of insertOrder) {
      if (!data[t] || skip.has(t)) continue
      const rows = db.prepare(`SELECT * FROM \`${t}\``).all() as unknown as Record<string, unknown>[]
      saveBaseline(transport, t, rows)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return counts
}

function normalizeValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ')
  if (typeof v === 'object') return JSON.stringify(v)
  return v as string | number
}