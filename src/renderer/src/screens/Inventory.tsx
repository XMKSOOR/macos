import { useCallback, useEffect, useState } from 'react'
import { Confirm, CurrencyCell, Empty, Field, Modal, SearchBox, useToast } from '../ui'
import DataGrid from '../table'
import type { Col } from '../table'
import ExcelBar from '../excel'
import type { Material, Role, Settings, StockMovement } from '../lib'
import { can, fmt, toLatinDigits } from '../lib'
import { CurrencyInput } from '../CurrencyInput'

const cols: Col<Material>[] = [
  { key: 'name', label: 'الاسم' },
  { key: 'category', label: 'التصنيف' },
  {
    key: 'quantity',
    label: 'الكمية',
    type: 'display',
    render: (m) => <span className={m.quantity <= m.min_qty && m.min_qty > 0 ? 'badge amber' : ''}>{`${m.quantity} ${m.unit}`}</span>
  },
  { key: 'min_qty', label: 'الحد الأدنى', type: 'number' },
  { key: 'unit', label: 'الوحدة' },
  { key: 'cost', label: 'الكلفة', type: 'money' },
  { key: 'supplier', label: 'المورد' },
  { key: 'notes', label: 'ملاحظات' }
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
    load()
    loadMovements()
  }, [load, loadMovements])

  const openNew = (): void => {
    setForm({ name: '', category: '', unit: '', quantity: 0, min_qty: 0, cost: 0, supplier: '', notes: '' })
    setModal(true)
  }

  const save = (): void => {
    if (!form.name.trim()) {
      toast('الاسم مطلوب', 'error')
      return
    }
    const data = { ...form, name: form.name.trim(), cost: Number(form.cost) || 0, min_qty: Number(form.min_qty) || 0 }
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
      const merged = {
        name: (patch.name as string) ?? row.name,
        category: (patch.category as string) ?? row.category,
        unit: (patch.unit as string) ?? row.unit,
        quantity: row.quantity,
        min_qty: Number(patch.min_qty ?? row.min_qty),
        cost: Number(patch.cost ?? row.cost),
        supplier: (patch.supplier as string) ?? row.supplier,
        notes: (patch.notes as string) ?? row.notes
      }
      await window.clinic.inventory.update(row.id, merged)
      load(search)
    },
    [list, load, search]
  )

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

  const exportItems = (): Record<string, string | number>[] =>
    list.map((m) => ({
      name: m.name,
      category: m.category,
      unit: m.unit,
      quantity: m.quantity,
      min_qty: m.min_qty,
      cost: m.cost,
      cost_usd: m.cost_usd ?? 0,
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
              moneyRate={rate}
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
              <input type="number" dir="ltr" inputMode="decimal" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(toLatinDigits(e.target.value)) })} />
            </Field>
            <Field label="الحد الأدنى">
              <input type="number" dir="ltr" inputMode="decimal" step="0.01" value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: Number(toLatinDigits(e.target.value)) })} />
            </Field>
            <Field label="الوحدة">
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="علبة / حبة / ملم..." />
            </Field>
<Field label="الكلفة (ل.س أو $)">
                <CurrencyInput
                  dual
                  valueLbp={Number(form.cost) || 0}
                  rate={rate}
                  onChange={(lbp) => setForm({ ...form, cost: lbp })}
                  disabled={!can(role, 'editPrices')}
                  placeholder="0"
                />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="flex between" style={{ fontWeight: 800, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                  <span>القيمة الإجمالية (الكلفة × الكمية {form.quantity ? `${form.quantity} ${form.unit || ''}` : ''}):</span>
                  <span>
                    {fmt(Math.round((Number(form.cost) || 0) * (Number(form.quantity) || 0)))} ل.س (
                    {(((Number(form.cost) || 0) * (Number(form.quantity) || 0)) / rate).toFixed(2)} $)
                  </span>
                </div>
              </div>
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
              <input type="number" dir="ltr" inputMode="decimal" step="0.01" value={adjQty} onChange={(e) => setAdjQty(Number(toLatinDigits(e.target.value)))} autoFocus />
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