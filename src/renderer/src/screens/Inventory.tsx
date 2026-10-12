import { useCallback, useEffect, useState } from 'react'
import { Confirm, CurrencyCell, Empty, Field, Modal, SearchBox, useToast } from '../ui'
import DataGrid from '../table'
import type { Col } from '../table'
import ExcelBar, { exportNow } from '../excel'
import type { Material, Role, Settings, StockMovement } from '../lib'
import { can, fmt } from '../lib'
import { CurrencyInput } from '../CurrencyInput'
import { NumberInput } from '../NumberInput'

const cols: Col<Material>[] = [
  { key: 'name', label: 'الاسم', width: 180 },
  { key: 'category', label: 'التصنيف', width: 120 },
  {
    key: 'quantity',
    label: 'الكمية',
    type: 'number',
    width: 110,
    editOnClick: true,
    render: (m) => <span className={m.quantity <= m.min_qty && m.min_qty > 0 ? 'badge amber' : ''}>{`${fmt(m.quantity)} ${m.unit}`}</span>
  },
  { key: 'min_qty', label: 'الحد الأدنى', type: 'number', width: 100 },
  { key: 'unit', label: 'الوحدة', width: 90 },
  { key: 'cost', label: 'الكلفة', type: 'money', width: 180 },
  { key: 'total', label: 'الاجمالي', type: 'money', width: 180 },
  { key: 'supplier', label: 'المورد', width: 140 },
  { key: 'notes', label: 'ملاحظات', width: 160 }
]

export default function Inventory({ settings, role }: { settings: Settings | null; role: Role }): React.JSX.Element {
  const [list, setList] = useState<Material[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [tab, setTab] = useState<'items' | 'movements'>('items')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Omit<Material, 'id' | 'created_at'>>({
    name: '',
    category: '',
    unit: '',
    quantity: 0,
    min_qty: 0,
    cost: 0,
    total: 0,
    supplier: '',
    notes: ''
  })
  const [deleting, setDeleting] = useState<Material | null>(null)
  const [adjusting, setAdjusting] = useState<Material | null>(null)
  const [adjQty, setAdjQty] = useState(0)
  const [adjNote, setAdjNote] = useState('')
  const toast = useToast()
  const rate = settings?.usd_rate ?? 130

  const canEdit = can(role, 'edit')
  const canDelete = can(role, 'delete')
  const canImport = can(role, 'import')
  const canAdjust = can(role, 'adjustStock')

  const load = useCallback(
    (term?: string) => {
      window.clinic.inventory
        .list(term)
        .then(setList)
        .catch((e) => toast(e.message, 'error'))
    },
    [toast]
  )

  const loadMovements = useCallback(() => {
    window.clinic.inventory
      .movements()
      .then(setMovements)
      .catch((e) => toast(e.message, 'error'))
  }, [toast])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  useEffect(() => {
    loadMovements()
  }, [loadMovements])

  const openNew = (): void => {
    setForm({ name: '', category: '', unit: '', quantity: 0, min_qty: 0, cost: 0, total: 0, supplier: '', notes: '' })
    setModal(true)
  }

  /** عند تغيير الكمية: نحافظ على الإجمالي ونعيد حساب الكلفة = الاجمالي ÷ الكمية، أو نحسب الإجمالي = الكلفة × الكمية */
  const setQuantity = (v: number): void => {
    setForm((f) => {
      const q = Number(v) || 0
      const t = Number(f.total) || 0
      const c = Number(f.cost) || 0
      if (t > 0 && q > 0) return { ...f, quantity: q, cost: Math.round(t / q) }
      if (c > 0) return { ...f, quantity: q, total: c * q }
      return { ...f, quantity: q }
    })
  }

  /** عند إدخال الاجمالي: نقسمه على الكمية ونعطي الكلفة تلقائياً */
  const setTotal = (lbp: number): void => {
    setForm((f) => {
      const q = Number(f.quantity) || 0
      return { ...f, total: lbp || 0, cost: lbp > 0 && q > 0 ? Math.round(lbp / q) : f.cost }
    })
  }

  /** عند إدخال الكلفة: نحسب الاجمالي تلقائياً = الكلفة × الكمية */
  const setCost = (lbp: number): void => {
    setForm((f) => {
      const q = Number(f.quantity) || 0
      return { ...f, cost: lbp || 0, total: lbp > 0 && q > 0 ? lbp * q : f.total }
    })
  }

  const save = (): void => {
    if (!form.name.trim()) {
      toast('الاسم مطلوب', 'error')
      return
    }
    const total = Number(form.total) || 0
    const data = {
      ...form,
      name: form.name.trim(),
      cost: Number(form.cost) || 0,
      min_qty: Number(form.min_qty) || 0,
      total: total > 0 ? total : (Number(form.cost) || 0) * (Number(form.quantity) || 0)
    }
    window.clinic.inventory
      .create(data)
      .then(() => {
        toast('تمت الإضافة', 'success')
        setModal(false)
        load(search)
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const remove = (): void => {
    if (!deleting) return
    window.clinic.inventory
      .delete(deleting.id)
      .then(() => {
        toast('تم الحذف', 'success')
        load(search)
      })
      .catch((e) => toast(e.message, 'error'))
    setDeleting(null)
  }

  const onRowSave = useCallback(
    async (key: number | string, patch: Record<string, unknown>): Promise<void> => {
      const row = list.find((m) => m.id === Number(key))
      if (!row) return
      const targetQty = patch.quantity !== undefined ? Number(patch.quantity) : row.quantity
      const effQty = targetQty > 0 ? targetQty : 1
      const cost = patch.cost !== undefined ? Number(patch.cost) : row.cost
      const next: Record<string, unknown> = { ...patch }
      if (patch.total !== undefined) {
        next.cost = Math.round(Number(patch.total) / effQty)
      } else if (patch.cost !== undefined || patch.quantity !== undefined) {
        next.total = cost * effQty
      }
      await window.clinic.inventory.update(row.id, next)
      const delta = targetQty - row.quantity
      if (delta) {
        await window.clinic.inventory.adjust(row.id, delta, 'adjust', 'تعديل مباشر من الجدول')
      }
      load(search)
    },
    [list, load, search]
  )

  /** حساب حيّ داخل الجدول: الاجمالي = الكلفة × الكمية، وبالعكس الكلفة = الاجمالي ÷ الكمية.
   *  إذا كانت الكمية 0 أو أقل تُعامَل كـ 1 حتى لا يصبح الاجمالي صفراً ولا يفشل القسمة. */
  const deriveDraft = useCallback((d: Record<string, string>, key: string): Record<string, string> => {
    const qRaw = Number(d.quantity) || 0
    const q = qRaw > 0 ? qRaw : 1
    if (key === 'quantity' || key === 'cost') {
      const c = Number(d.cost) || 0
      return { ...d, total: String(Math.round(c * q)) }
    }
    if (key === 'total') {
      const t = Number(d.total) || 0
      return { ...d, cost: String(Math.round(t / q)) }
    }
    return d
  }, [])

  const onImportRows = useCallback(
    async (rows: Record<string, string>[]) => {
      const res = await window.clinic.inventory.importRows(rows)
      load(search)
      loadMovements()
      return res
    },
    [load, search, loadMovements]
  )

  const submitAdjust = (): void => {
    if (!adjusting) return
    const delta = adjQty
    if (!delta) {
      toast('أدخل كمية', 'error')
      return
    }
    window.clinic.inventory
      .adjust(adjusting.id, delta, delta > 0 ? 'add' : 'adjust', adjNote)
      .then(() => {
        toast('تم التسجيل', 'success')
        setAdjusting(null)
        load(search)
        loadMovements()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const exportItems = (rows: Material[] = list): Record<string, string | number>[] =>
    rows.map((m) => ({
      name: m.name,
      category: m.category,
      unit: m.unit,
      quantity: m.quantity,
      min_qty: m.min_qty,
      cost: m.cost,
      cost_usd: m.cost_usd ?? 0,
      total: m.total ?? 0,
      total_usd: m.total_usd ?? 0,
      supplier: m.supplier,
      notes: m.notes
    }))

  const exportMovements = (): Record<string, string | number>[] =>
    movements.map((mv) => ({
      created_at: mv.created_at,
      material_name: mv.material_name ?? '',
      qty: mv.qty,
      operation: mv.operation,
      reference: mv.reference,
      user_name: mv.user_name,
      note: mv.note
    }))

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <button className={tab === 'items' ? 'soft' : 'ghost'} onClick={() => setTab('items')}>
          المواد والأصناف
        </button>
        <button className={tab === 'movements' ? 'soft' : 'ghost'} onClick={() => setTab('movements')}>
          سجل الحركات
        </button>
      </div>

      {tab === 'items' ? (
        <div className="panel">
          <div className="panel-head">
            <h2>مواد العيادة</h2>
            <div className="toolbar">
              <SearchBox value={search} onChange={setSearch} placeholder="بحث..." />
              <ExcelBar schema="materials" title="مواد المخزون" buildRows={exportItems} onImportRows={canImport ? onImportRows : undefined} />
              <button onClick={openNew}>+ مادة جديدة</button>
            </div>
          </div>
          <div className="panel-body">
            <DataGrid
              rows={list}
              cols={cols}
              rowKey={(m) => m.id}
              canEdit={canEdit}
              onSave={onRowSave}
              onDraftChange={deriveDraft}
              moneyRate={rate}
              fixed
              selectable
              onBulkDelete={
                canDelete
                  ? async (rows) => {
                      for (const m of rows) await window.clinic.inventory.delete(m.id)
                      toast(`تم حذف ${rows.length} مادة`, 'success')
                      load(search)
                    }
                  : undefined
              }
              onBulkExport={(rows) => {
                void exportNow('مواد المخزون', 'materials', exportItems(rows))
                  .then((p) => {
                    if (p) toast('تم التصدير: ' + p, 'success')
                  })
                  .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
              }}
              emptyText="لا توجد مواد"
              actions={(m) => (
                <>
                  {canAdjust && (
                    <button
                      className="soft small"
                      onClick={() => {
                        setAdjusting(m)
                        setAdjQty(0)
                        setAdjNote('')
                      }}
                    >
                      كمية
                    </button>
                  )}
                  {canDelete && (
                    <button className="danger-ghost small" onClick={() => setDeleting(m)}>
                      حذف
                    </button>
                  )}
                </>
              )}
            />
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h2>سجل حركات المخزون</h2>
            <ExcelBar schema="movements" title="سجل الحركات" buildRows={exportMovements} />
          </div>
          <div className="panel-body">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>المادة</th>
                    <th>الكمية</th>
                    <th>النوع</th>
                    <th>المرجع</th>
                    <th>المستخدم</th>
                    <th>ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <Empty text="لا توجد حركات" />
                      </td>
                    </tr>
                  ) : (
                    movements.map((mv) => (
                      <tr key={mv.id}>
                        <td>{mv.created_at}</td>
                        <td style={{ fontWeight: 600 }}>{mv.material_name}</td>
                        <td>
                          <span className={mv.qty > 0 ? 'badge green' : 'badge red'}>
                            {mv.qty > 0 ? `+${mv.qty}` : mv.qty}
                          </span>
                        </td>
                        <td>{mv.operation === 'sale' ? 'مباع' : mv.operation === 'add' ? 'إضافة' : mv.operation === 'waste' ? 'تالف' : 'تسوية'}</td>
                        <td>{mv.reference || '—'}</td>
                        <td>{mv.user_name || '—'}</td>
                        <td className="muted">{mv.note || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <Modal
          title="مادة جديدة"
          onClose={() => setModal(false)}
          wide
          footer={
            <>
              <button onClick={save}>إضافة</button>
              <button className="ghost" onClick={() => setModal(false)}>
                إلغاء
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="الاسم *">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="التصنيف">
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="الكمية الافتتاحية">
              <NumberInput value={Number(form.quantity) || 0} onChange={setQuantity} />
            </Field>
            <Field label="الحد الأدنى">
              <NumberInput value={Number(form.min_qty) || 0} onChange={(v) => setForm({ ...form, min_qty: v })} />
            </Field>
            <Field label="الوحدة">
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="علبة / حبة / ملم..." />
            </Field>
<Field label="الكلفة (ل.س أو $)">
                <CurrencyInput
                  dual
                  valueLbp={Number(form.cost) || 0}
                  rate={rate}
                  onChange={setCost}
                  disabled={!can(role, 'editPrices')}
                  placeholder="0"
                />
              </Field>
              <Field label="الاجمالي (تكلفة الصنف — ل.س أو $) — تُحسب الكلفة تلقائياً = الاجمالي ÷ الكمية">
                <CurrencyInput
                  dual
                  valueLbp={Number(form.total) || 0}
                  rate={rate}
                  onChange={setTotal}
                  placeholder="0"
                />
              </Field>
              {Number(form.total) > 0 && (Number(form.quantity) || 0) > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="flex between" style={{ fontWeight: 800, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                    <span>الكلفة = الاجمالي ÷ الكمية</span>
                    <span>
                      {fmt(Number(form.total) || 0)} ل.س ÷ {Number(form.quantity) || 0} = <b>{fmt(Math.round((Number(form.total) || 0) / (Number(form.quantity) || 1)))}</b> ل.س ={' '}
                      <b>{((Number(form.total) || 0) / (Number(form.quantity) || 1) / rate).toFixed(2)} $</b>
                    </span>
                  </div>
                </div>
              )}
            <Field label="المورد">
              <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </Field>
            <Field label="ملاحظات">
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {adjusting && (
        <Modal
          title={`تعديل كمية: ${adjusting.name}`}
          onClose={() => setAdjusting(null)}
          footer={
            <>
              <button onClick={submitAdjust}>تسجيل</button>
              <button className="ghost" onClick={() => setAdjusting(null)}>
                إلغاء
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="الكمية الحالية">
              <input value={adjusting.quantity} disabled />
            </Field>
            <Field label="التغيير (+ للزيادة / - للنقصان)">
              <NumberInput value={adjQty} onChange={setAdjQty} allowNegative autoFocus />
            </Field>
            <Field label="ملاحظة">
              <input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
            </Field>
          </div>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            النتيجة: {adjusting.quantity + adjQty} {adjusting.unit}
          </p>
        </Modal>
      )}

      {deleting && (
        <Confirm
          title="حذف مادة"
          message={`حذف المادة "${deleting.name}"؟ سيتم حذف سجل حركاتها أيضاً.`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}