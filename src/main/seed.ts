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
      const updMat = db.prepare('UPDATE materials SET category=?, unit=?, min_qty=?, cost=?, supplier=?, notes=? WHERE id=?')
      const insMat = db.prepare(
        "INSERT INTO materials (name, category, unit, quantity, min_qty, cost, supplier, notes, created_at) VALUES (?,?,?,?,?,?,?,?, datetime('now','localtime'))"
      )
      for (const m of SEED_MATERIALS) {
        const row = selMat.get(m.name) as { id: number } | undefined
        if (row) updMat.run(m.category, m.unit, m.min_qty, m.cost, m.supplier, m.notes, row.id)
        else insMat.run(m.name, m.category, m.unit, m.quantity, m.min_qty, m.cost, m.supplier, m.notes)
      }

      const ids = new Map<string, number>()
      for (const r of db.prepare('SELECT id, name FROM materials').all() as unknown as { id: number; name: string }[]) {
        ids.set(r.name, r.id)
      }

      const selCat = db.prepare('SELECT id FROM catalog WHERE name=?')
      const updCat = db.prepare('UPDATE catalog SET price=?, description=? WHERE id=?')
      const insCat = db.prepare(
        "INSERT INTO catalog (name, price, description, created_at) VALUES (?,?,?, datetime('now','localtime'))"
      )
      const delBom = db.prepare('DELETE FROM catalog_materials WHERE catalog_id=?')
      const insBom = db.prepare('INSERT INTO catalog_materials (catalog_id, material_id, qty) VALUES (?,?,?)')
      for (const c of SEED_CATALOG) {
        const row = selCat.get(c.name) as { id: number } | undefined
        let cid: number
        if (row) {
          updCat.run(c.price, c.description, row.id)
          cid = row.id
        } else {
          cid = Number((insCat.run(c.name, c.price, c.description) as unknown as { lastInsertRowid: number | bigint }).lastInsertRowid)
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