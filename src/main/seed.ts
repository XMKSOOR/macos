import { createCatalogItem, createMaterial, getDb, getSettings, listCatalog, listMaterials, recalcUsd, saveSettings } from './db'
import { SEED_CATALOG, SEED_MATERIALS, OLD_SEED_MATERIAL_NAMES, OLD_SEED_CATALOG_NAMES } from '../shared/seedData'

export function seedDefaultData(): void {
  const materialRows = listMaterials()
  const materialIds = new Map(materialRows.map((m) => [m.name, m.id]))

  for (const m of SEED_MATERIALS) {
    if (materialIds.has(m.name)) continue
    const created = createMaterial({
      name: m.name,
      category: m.category,
      unit: m.unit,
      quantity: m.quantity,
      min_qty: m.min_qty,
      cost: m.cost,
      supplier: m.supplier,
      notes: m.notes
    })
    materialIds.set(m.name, created.id)
  }

  const known = new Set(listCatalog().map((c) => c.name))
  for (const c of SEED_CATALOG) {
    if (known.has(c.name)) continue
    createCatalogItem({
      name: c.name,
      price: c.price,
      description: c.description,
      materials: c.materials.map((x) => {
        const id = materialIds.get(x.material)
        if (id === undefined) throw new Error('مادة غير موجودة في بيانات الأساس: ' + x.material)
        return { material_id: id, qty: x.qty }
      })
    })
  }
}

/** ترقية بيانات الأساس إلى أسعار دراسة الجدوى (هجين v2) — تُنفّذ مرة واحدة */
export function upgradeSeedsToStudy(): void {
  try {
    if (getSettings().feasibility_seed === '1') return
  } catch {
    return
  }
  const db = getDb()
  try {
    db.prepare('BEGIN').run()
    try {
      if (OLD_SEED_CATALOG_NAMES.length > 0 || OLD_SEED_MATERIAL_NAMES.length > 0) {
        if (OLD_SEED_MATERIAL_NAMES.length > 0) {
          db.prepare(`DELETE FROM catalog_materials WHERE material_id IN (SELECT id FROM materials WHERE name IN (${OLD_SEED_MATERIAL_NAMES.map(() => '?').join(',')}))`).run(...OLD_SEED_MATERIAL_NAMES)
        }
        if (OLD_SEED_CATALOG_NAMES.length > 0) {
          db.prepare(`DELETE FROM catalog WHERE name IN (${OLD_SEED_CATALOG_NAMES.map(() => '?').join(',')})`).run(...OLD_SEED_CATALOG_NAMES)
        }
        if (OLD_SEED_MATERIAL_NAMES.length > 0) {
          db.prepare(`DELETE FROM materials WHERE name IN (${OLD_SEED_MATERIAL_NAMES.map(() => '?').join(',')})`).run(...OLD_SEED_MATERIAL_NAMES)
        }
      }
      db.prepare('COMMIT').run()
    } catch (e) {
      db.prepare('ROLLBACK').run()
      throw e
    }
    saveSettings({ feasibility_seed: '1' })
  } catch (e) {
    console.error('ترقية بيانات الأساس إلى دراسة الجدوى فشلت:', e)
  }
}

/** حذف الأسعار القديمة وإعادة وضع أسعار دراسة الجدوى (v2) في المخزون والكتالوج — تُنفّذ مرة واحدة.
 *  تُحدِّث كل مادة/صنف مطابق للبيانات القياسية بسعر الدراسة، وتُضيف المفقود، مع إبقاء الأصناف المخصصة. */
export function upgradePricesToStudy(): void {
  try {
    if (getSettings().feasibility_seed2 === '1') return
  } catch {
    return
  }
  const db = getDb()
  try {
    db.prepare('BEGIN').run()
    try {
      const selMat = db.prepare('SELECT id FROM materials WHERE name=?')
      const updMat = db.prepare('UPDATE materials SET category=?, unit=?, min_qty=?, cost=?, supplier=?, notes=?, total = ? * quantity WHERE id=?')
      const insMat = db.prepare(
        "INSERT INTO materials (name, category, unit, quantity, min_qty, cost, total, supplier, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?, datetime('now','localtime'))"
      )
      for (const m of SEED_MATERIALS) {
        const row = selMat.get(m.name) as { id: string } | undefined
        if (row) updMat.run(m.category, m.unit, m.min_qty, m.cost, m.supplier, m.notes, m.cost, row.id)
        else insMat.run(m.name, m.category, m.unit, m.quantity, m.min_qty, m.cost, m.cost * m.quantity, m.supplier, m.notes)
      }

      const ids = new Map<string, string>()
      for (const r of db.prepare('SELECT id, name FROM materials').all() as unknown as { id: string; name: string }[]) {
        ids.set(r.name, r.id)
      }

      const selCat = db.prepare('SELECT id FROM catalog WHERE name=?')
      const updCat = db.prepare('UPDATE catalog SET price=?, description=? WHERE id=?')
      const insCat = db.prepare(
        "INSERT INTO catalog (name, price, description, created_at) VALUES (?,?,?, datetime('now','localtime')) RETURNING id"
      )
      const delBom = db.prepare('DELETE FROM catalog_materials WHERE catalog_id=?')
      const insBom = db.prepare('INSERT INTO catalog_materials (catalog_id, material_id, qty) VALUES (?,?,?)')
      for (const c of SEED_CATALOG) {
        const row = selCat.get(c.name) as { id: string } | undefined
        let cid: string
        if (row) {
          updCat.run(c.price, c.description, row.id)
          cid = row.id
        } else {
          cid = (insCat.get(c.name, c.price, c.description) as unknown as { id: string }).id
        }
        delBom.run(cid)
        for (const b of c.materials) {
          const mid = ids.get(b.material)
          if (mid === undefined) throw new Error('مادة غير موجودة في بيانات الأساس: ' + b.material)
          insBom.run(cid, mid, b.qty)
        }
      }
      db.prepare('COMMIT').run()
    } catch (e) {
      db.prepare('ROLLBACK').run()
      throw e
    }
    recalcUsd()
    saveSettings({ feasibility_seed2: '1' })
  } catch (e) {
    console.error('إعادة وضع أسعار دراسة الجدوى فشلت:', e)
  }
}

/** حذف تكرار المواد في المخزون: دمج الصفوف المتشابهة بالاسم (بعد trim ودون حساسية لحالة الأحرف)،
 *  جمع الكميات، إعادة توجيه مراجع الكتالوج وحركات المخزون ومواد الفواتير، ثم حذف الصفوف المكرّرة.
 *  عملية آمنة وقابلة للتكرار. الحذف المحلي ينتشر إلى السحابة عبر خطة الرفع التفرقي. */
interface MatDupRow {
  id: string
  name: string
  quantity: number | null
  min_qty: number | null
  cost: number | null
  unit: string | null
  category: string | null
  supplier: string | null
  notes: string | null
}

export function dedupeMaterials(): void {
  const db = getDb()
  try {
    const rows = db
      .prepare('SELECT id, name, quantity, min_qty, cost, unit, category, supplier, notes FROM materials')
      .all() as unknown as MatDupRow[]
    const groups = new Map<string, MatDupRow[]>()
    for (const r of rows) {
      const key = (r.name ?? '').trim().toLowerCase()
      if (!key) continue
      const arr = groups.get(key)
      if (arr) arr.push(r)
      else groups.set(key, [r])
    }
    const del: string[] = []
    const plan: {
      survivor: string
      dups: string[]
      name: string
      quantity: number
      minQty: number
      cost: number
      unit: string
      category: string
      supplier: string
      notes: string
    }[] = []
    for (const arr of groups.values()) {
      if (arr.length < 2) continue
      arr.sort((a, b) => String(a.id).localeCompare(String(b.id)))
      const survivor = arr[0]
      const dups = arr.slice(1).map((r) => r.id)
      const quantity = arr.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
      const costRow = arr.find((r) => (Number(r.cost) || 0) > 0)
      const cost = costRow ? Number(costRow.cost) : Number(survivor.cost) || 0
      const minQty = arr.reduce((m, r) => Math.max(m, Number(r.min_qty) || 0), 0)
      const pick = (f: 'unit' | 'category' | 'supplier' | 'notes'): string => {
        const own = String(survivor[f] ?? '').trim()
        if (own) return own
        const other = arr.find((r) => String(r[f] ?? '').trim())
        return other ? String(other[f] ?? '').trim() : ''
      }
      plan.push({
        survivor: survivor.id,
        dups,
        name: String(survivor.name ?? '').trim(),
        quantity,
        minQty,
        cost,
        unit: pick('unit'),
        category: pick('category'),
        supplier: pick('supplier'),
        notes: pick('notes')
      })
      del.push(...dups)
    }
    if (del.length === 0) return
    const rate = getSettings().usd_rate
    db.prepare('BEGIN').run()
    try {
      const repointCm = db.prepare('UPDATE catalog_materials SET material_id=? WHERE material_id=?')
      const repointSm = db.prepare('UPDATE stock_movements SET material_id=? WHERE material_id=?')
      const repointIm = db.prepare('UPDATE invoice_materials SET material_id=? WHERE material_id=?')
      const updMat = db.prepare(
        'UPDATE materials SET name=?, unit=?, category=?, quantity=?, min_qty=?, cost=?, cost_usd=?, total=?, total_usd=?, supplier=?, notes=? WHERE id=?'
      )
      const delMat = db.prepare('DELETE FROM materials WHERE id=?')
      for (const p of plan) {
        for (const d of p.dups) {
          repointCm.run(p.survivor, d)
          repointSm.run(p.survivor, d)
          repointIm.run(p.survivor, d)
        }
        const effQty = p.quantity > 0 ? p.quantity : 1
        const total = p.cost * effQty
        updMat.run(
          p.name,
          p.unit,
          p.category,
          p.quantity,
          p.minQty,
          p.cost,
          rate > 0 ? Math.round((p.cost / rate) * 100) / 100 : 0,
          total,
          rate > 0 ? Math.round((total / rate) * 100) / 100 : 0,
          p.supplier,
          p.notes,
          p.survivor
        )
      }
      db.prepare(
        'DELETE FROM catalog_materials WHERE rowid NOT IN (SELECT MIN(rowid) FROM catalog_materials GROUP BY catalog_id, material_id)'
      ).run()
      for (const d of del) delMat.run(d)
      db.prepare('COMMIT').run()
    } catch (e) {
      db.prepare('ROLLBACK').run()
      throw e
    }
  } catch (e) {
    console.error('تنظيف تكرار المواد فشل:', e)
  }
}

/** حذف التكرار في كتالوج الأصناف: إبقاء صف واحد لكل اسم (مع ترحيل مواد BOM إليه) وحذف صفوف الربط المكرّرة.
 *  يُفضّل الإبقاء على الصف الذي يملك مواد، ثم الأحدث (created_at ثم id). عملية آمنة وقابلة للتكرار. */
export function dedupeCatalog(): void {
  const db = getDb()
  try {
    const rows = db.prepare('SELECT id, name FROM catalog ORDER BY created_at DESC, id DESC').all() as unknown as {
      id: string
      name: string
    }[]
    const bomCount = new Map<string, number>()
    for (const b of db
      .prepare('SELECT catalog_id, COUNT(*) AS c FROM catalog_materials GROUP BY catalog_id')
      .all() as unknown as { catalog_id: string; c: number }[]) {
      bomCount.set(b.catalog_id, Number(b.c))
    }
    const groups = new Map<string, string[]>()
    for (const r of rows) {
      const key = (r.name ?? '').trim()
      const arr = groups.get(key)
      if (arr) arr.push(r.id)
      else groups.set(key, [r.id])
    }
    const drop: string[] = []
    const moves: { from: string; to: string }[] = []
    const rename: { id: string; name: string }[] = []
    for (const [name, ids] of groups) {
      if (ids.length === 1) continue
      const survivor = ids.find((id) => (bomCount.get(id) ?? 0) > 0) ?? ids[0]
      for (const id of ids) {
        if (id === survivor) continue
        drop.push(id)
        if ((bomCount.get(id) ?? 0) > 0) moves.push({ from: id, to: survivor })
      }
      rename.push({ id: survivor, name })
    }
    if (drop.length === 0) return
    db.prepare('BEGIN').run()
    try {
      const getBom = db.prepare('SELECT material_id, qty FROM catalog_materials WHERE catalog_id=?')
      const insBom = db.prepare('INSERT INTO catalog_materials (catalog_id, material_id, qty) VALUES (?,?,?)')
      const delBom = db.prepare('DELETE FROM catalog_materials WHERE catalog_id=?')
      const delCat = db.prepare('DELETE FROM catalog WHERE id=?')
      const setName = db.prepare('UPDATE catalog SET name=? WHERE id=?')
      for (const m of moves) {
        const links = getBom.all(m.from) as unknown as { material_id: string; qty: number }[]
        for (const l of links) insBom.run(m.to, l.material_id, l.qty)
      }
      for (const id of drop) {
        delBom.run(id)
        delCat.run(id)
      }
      for (const r of rename) setName.run(r.name, r.id)
      db.prepare(
        'DELETE FROM catalog_materials WHERE rowid NOT IN (SELECT MIN(rowid) FROM catalog_materials GROUP BY catalog_id, material_id)'
      ).run()
      db.prepare('COMMIT').run()
    } catch (e) {
      db.prepare('ROLLBACK').run()
      throw e
    }
  } catch (e) {
    console.error('تنظيف تكرار الكتالوج فشل:', e)
  }
}

/** حذف تكرار المواعيد: يبقى صف واحد لكل مجموعة متطابقة تماماً (المريض، التاريخ، الوقت،
 *  السبب، الملاحظات، الحالة) — أي ما قد ينشأ من استيراد ملف مرتين. عملية آمنة وقابلة للتكرار. */
export function dedupeAppointments(): void {
  const db = getDb()
  try {
    const rows = db
      .prepare('SELECT id, patient_id, date, time, reason, notes, status FROM appointments')
      .all() as unknown as {
      id: string
      patient_id: string
      date: string
      time: string | null
      reason: string | null
      notes: string | null
      status: string | null
    }[]
    const groups = new Map<string, string[]>()
    for (const r of rows) {
      const key = [
        r.patient_id,
        r.date,
        (r.time ?? '').trim(),
        (r.reason ?? '').trim(),
        (r.notes ?? '').trim(),
        (r.status ?? '').trim()
      ].join('|')
      const arr = groups.get(key)
      if (arr) arr.push(r.id)
      else groups.set(key, [r.id])
    }
    const del: string[] = []
    for (const ids of groups.values()) {
      if (ids.length < 2) continue
      ids.sort((a, b) => String(a).localeCompare(String(b)))
      del.push(...ids.slice(1))
    }
    if (del.length === 0) return
    db.prepare('BEGIN').run()
    try {
      const delRow = db.prepare('DELETE FROM appointments WHERE id=?')
      for (const id of del) delRow.run(id)
      db.prepare('COMMIT').run()
      console.log(`DEDUPE_APPOINTMENTS ${del.length}`)
    } catch (e) {
      db.prepare('ROLLBACK').run()
      throw e
    }
  } catch (e) {
    console.error('تنظيف تكرار المواعيد فشل:', e)
  }
}

/** حذف تكرار المصاريف: يبقى صف واحد لكل مجموعة متطابقة تماماً (التاريخ، التصنيف، المبلغ، الصنف)
 *  — أي ما قد ينشأ من استيراد ملف مرتين. عملية آمنة وقابلة للتكرار. */
export function dedupeExpenses(): void {
  const db = getDb()
  try {
    const rows = db
      .prepare('SELECT id, date, category, amount, note FROM expenses')
      .all() as unknown as { id: string; date: string; category: string | null; amount: number | null; note: string | null }[]
    const groups = new Map<string, string[]>()
    for (const r of rows) {
      const key = [r.date, (r.category ?? '').trim(), Math.round(Number(r.amount) || 0), (r.note ?? '').trim()].join('|')
      const arr = groups.get(key)
      if (arr) arr.push(r.id)
      else groups.set(key, [r.id])
    }
    const del: string[] = []
    for (const ids of groups.values()) {
      if (ids.length < 2) continue
      ids.sort((a, b) => String(a).localeCompare(String(b)))
      del.push(...ids.slice(1))
    }
    if (del.length === 0) return
    db.prepare('BEGIN').run()
    try {
      const delRow = db.prepare('DELETE FROM expenses WHERE id=?')
      for (const id of del) delRow.run(id)
      db.prepare('COMMIT').run()
      console.log(`DEDUPE_EXPENSES ${del.length}`)
    } catch (e) {
      db.prepare('ROLLBACK').run()
      throw e
    }
  } catch (e) {
    console.error('تنظيف تكرار المصاريف فشل:', e)
  }
}