import { useCallback, useEffect, useMemo, useState } from 'react'
import { Confirm, Field, Modal, SearchBox, useToast } from '../ui'
import DataGrid from '../table'
import type { Col } from '../table'
import ExcelBar from '../excel'
import type { CatalogItem, Material, Role, Settings } from '../lib'
import { can, fmt, parseNumber } from '../lib'
import { CurrencyInput } from '../CurrencyInput'

interface BomLine {
  material_id: number
  qty: number
}

interface CatalogForm {
  name: string
  price: string
  description: string
  lines: BomLine[]
}

const makeCols = (rate: number): Col<CatalogItem>[] => [
  { key: 'name', label: 'الاسم' },
  { key: 'price', label: 'السعر', type: 'money' },
  {
    key: 'cost',
    label: 'الكلفة (من المكونات)',
    type: 'display',
    render: (c) => (
      <div className="money-cell">
        <div className="amount-lbp">{fmt(c.cost)} ل.س</div>
        {rate > 0 && <div className="amount-usd">{(c.cost / rate).toFixed(2)} $</div>}
      </div>
    )
  },
  {
    key: 'margin',
    label: 'الهامش',
    type: 'display',
    render: (c) => {
      const m = c.price - c.cost
      const color = m >= 0 ? 'var(--success)' : 'var(--danger)'
      return (
        <div className="money-cell">
          <div style={{ color, fontWeight: 700 }}>{fmt(m)} ل.س</div>
          {rate > 0 && (
            <div className="amount-usd" style={{ color }}>
              {(m / rate).toFixed(2)} $
            </div>
          )}
        </div>
      )
    }
  },
  {
    key: 'bom',
    label: 'المكونات',
    type: 'display',
    render: (c) => (c.materials.length > 0 ? `${c.materials.length} مواد` : '—')
  },
  { key: 'description', label: 'الوصف' }
]

export default function Catalog({ settings, role }: { settings: Settings | null; role: Role }): React.JSX.Element {
  const rate = settings && settings.usd_rate > 0 ? settings.usd_rate : 130
  const [list, setList] = useState<CatalogItem[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'new' | 'edit' | null>(null)
  const [editing, setEditing] = useState<CatalogItem | null>(null)
  const [form, setForm] = useState<CatalogForm>({ name: '', price: '', description: '', lines: [] })
  const [deleting, setDeleting] = useState<CatalogItem | null>(null)
  const toast = useToast()

  const canEdit = can(role, 'edit') && can(role, 'editPrices')
  const canDelete = can(role, 'delete')
  const canImport = can(role, 'import')
  const cols = useMemo(() => makeCols(rate), [rate])

  const load = useCallback(() => {
    window.clinic.catalog
      .list()
      .then(setList)
      .catch((e) => toast(e.message, 'error'))
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    window.clinic.inventory
      .list()
      .then(setMaterials)
      .catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list
  }, [list, search])

  const bomCost = useMemo(() => {
    let s = 0
    for (const l of form.lines) {
      const m = materials.find((x) => x.id === l.material_id)
      if (m) s += m.cost * (l.qty || 0)
    }
    return s
  }, [form.lines, materials])

  const priceNum = Number(form.price) || bomCost || 0
  const marginNum = priceNum - bomCost

  const openNew = (): void => {
    setEditing(null)
    setForm({ name: '', price: '', description: '', lines: [] })
    setModal('new')
  }

  const openEdit = (c: CatalogItem): void => {
    setEditing(c)
    setForm({
      name: c.name,
      price: String(c.price),
      description: c.description,
      lines: c.materials.map((m) => ({ material_id: m.material_id, qty: m.qty }))
    })
    setModal('edit')
  }

  const setLine = (i: number, patch: Partial<BomLine>): void => {
    setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  }

  const save = (): void => {
    if (!form.name.trim()) {
      toast('الاسم مطلوب', 'error')
      return
    }
    const payload = {
      name: form.name.trim(),
      price: Number(form.price) || bomCost,
      description: form.description,
      cost: bomCost,
      materials: form.lines.filter((l) => l.material_id).map((l) => ({ material_id: l.material_id, qty: l.qty || 1 }))
    }
    const p = modal === 'new' ? window.clinic.catalog.create(payload) : window.clinic.catalog.update(editing!.id, payload)
    p.then(() => {
      toast(modal === 'new' ? 'تمت الإضافة' : 'تم الحفظ', 'success')
      setModal(null)
      load()
    }).catch((e) => toast(e.message, 'error'))
  }

  const remove = (): void => {
    if (!deleting) return
    window.clinic.catalog
      .delete(deleting.id)
      .then(() => {
        toast('تم الحذف', 'success')
        load()
      })
      .catch((e) => toast(e.message, 'error'))
    setDeleting(null)
  }

  const onRowSave = useCallback(
    async (key: number | string, patch: Record<string, unknown>): Promise<void> => {
      const row = list.find((c) => c.id === Number(key))
      if (!row) return
      const merged = {
        name: (patch.name as string) ?? row.name,
        price: Number(patch.price ?? row.price),
        description: (patch.description as string) ?? row.description,
        materials: row.materials.map((m) => ({ material_id: m.material_id, qty: m.qty }))
      }
      await window.clinic.catalog.update(row.id, merged)
      load()
    },
    [list, load]
  )

  const onImportRows = useCallback(
    async (rows: Record<string, string>[]) => {
      const res = await window.clinic.catalog.importRows(rows)
      load()
      return res
    },
    [load]
  )

  const exportRows = (): Record<string, string | number>[] =>
    filtered.map((c) => ({
      name: c.name,
      price: c.price,
      price_usd: c.price_usd ?? 0,
      cost: c.cost,
      cost_usd: c.cost_usd ?? 0,
      margin: c.price - c.cost,
      bom: c.materials.map((m) => `${m.name} ×${m.qty}`).join('، '),
      description: c.description
    }))

  return (
    <div>
      <div className="panel">
        <div className="panel-head">
          <h2>كتالوج الأصناف والخدمات</h2>
          <div className="toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="بحث..." />
            <ExcelBar schema="catalog" title="كتالوج الأصناف" buildRows={exportRows} onImportRows={canImport ? onImportRows : undefined} />
            <button onClick={openNew}>+ صنف جديد</button>
          </div>
        </div>
        <div className="panel-body">
          <DataGrid
            rows={filtered}
            cols={cols}
            rowKey={(c) => c.id}
            canEdit={canEdit}
            onSave={onRowSave}
            moneyRate={rate}
            emptyText="لا توجد أصناف"
            actions={(c) => (
              <>
                {canEdit && (
                  <button className="soft small" onClick={() => openEdit(c)}>
                    مكونات
                  </button>
                )}
                {canDelete && (
                  <button className="danger-ghost small" onClick={() => setDeleting(c)}>
                    حذف
                  </button>
                )}
              </>
            )}
          />
        </div>
      </div>

      {modal && (
        <Modal
          title={modal === 'new' ? 'صنف جديد' : `مكونات: ${editing?.name ?? ''}`}
          onClose={() => setModal(null)}
          wide
          footer={
            <>
              <button onClick={save}>{modal === 'new' ? 'إضافة' : 'حفظ'}</button>
              <button className="ghost" onClick={() => setModal(null)}>
                إلغاء
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="الاسم *">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="سعر الخدمة (ل.س أو $)">
              <CurrencyInput
                dual
                valueLbp={Number(form.price) || 0}
                rate={rate}
                placeholder={bomCost ? String(bomCost) : '0'}
                onChange={(lbp) => setForm({ ...form, price: lbp ? String(lbp) : '' })}
              />
            </Field>
            <Field label="الوصف">
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>

          <div className="mt-16" style={{ fontWeight: 700 }}>
            المواد المكوّنة (تُخصم تلقائياً عند البيع)
          </div>
          <div className="line-series mt-8">
            {form.lines.map((l, i) => {
              const m = materials.find((x) => x.id === l.material_id)
              return (
                <div className="series-item" key={i}>
                  <select value={l.material_id} onChange={(e) => setLine(i, { material_id: Number(e.target.value) })}>
                    <option value={0}>اختر المادة...</option>
                    {materials.map((mm) => (
                      <option key={mm.id} value={mm.id}>
                        {mm.name} (متوفر {mm.quantity})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text" dir="ltr" inputMode="decimal"
                    value={l.qty}
                    onChange={(e) => setLine(i, { qty: Math.max(1, parseNumber(e.target.value) || 1) })}
                    placeholder="الكمية"
                  />
                  <div className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                    {m ? `${fmt(m.cost)} ل.س ×${l.qty} = ${fmt(m.cost * l.qty)}` : '—'}
                  </div>
                  <button className="danger-ghost small" onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}>
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-8">
            <button className="ghost small" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, { material_id: 0, qty: 1 }] }))}>
              + إضافة مادة
            </button>
          </div>
          <div className="flex between mt-16" style={{ fontWeight: 800 }}>
            <span>كلفة المكونات:</span>
            <span>{fmt(bomCost)} ل.س ({bomCost > 0 ? ((bomCost / (settings?.usd_rate || 130)).toFixed(2)) : '0.00'} $)</span>
          </div>
          <div className="flex between mt-4" style={{ fontWeight: 800 }}>
            <span>الهامش المتوقع (السعر − الكلفة):</span>
            <span style={{ color: marginNum >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {marginNum >= 0 ? '+' : ''}
              {fmt(marginNum)} ل.س ({(marginNum / rate).toFixed(2)} $) — {(priceNum > 0 ? (marginNum / priceNum) * 100 : 0).toFixed(0)}%
            </span>
          </div>
          <div className="flex between mt-4" style={{ fontWeight: 800 }}>
            <span>بالدولار:</span>
            <span dir="ltr">
              {((priceNum / rate).toFixed(2))} $ سعر — {((bomCost / rate).toFixed(2))} $ كلفة
            </span>
          </div>
        </Modal>
      )}

      {deleting && (
        <Confirm
          title="حذف صنف"
          message={`حذف الصنف "${deleting.name}"؟`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}