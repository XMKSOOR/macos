import { useCallback, useEffect, useState } from 'react'
import { Confirm, CurrencyCell, DrillHead, Empty, Field, KV, Modal, useToast } from '../ui'
import type { Material, Role, Settings, StockMovement } from '../lib'
import { can, fmt } from '../lib'
import { CurrencyInput } from '../CurrencyInput'
import { NumberInput } from '../NumberInput'

const OP_LABEL: Record<string, string> = {
  sale: 'مباع',
  add: 'إضافة',
  waste: 'تالف',
  adjust: 'تسوية',
  return: 'مرتجع'
}

/** تقريب بسيط إلى 4 منازل عشرية — يكفي دقة 0.001 للكمية ويمنع أخطاء الفاصلة العائمة */
const round4 = (n: number): number => Math.round(n * 10000) / 10000

export default function MaterialFile({
  material,
  settings,
  role,
  onClose,
  onSaved
}: {
  material: Material
  settings: Settings | null
  role: Role
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const rate = settings?.usd_rate ?? 130
  const [form, setForm] = useState({
    name: material.name,
    category: material.category,
    unit: material.unit,
    quantity: material.quantity,
    min_qty: material.min_qty,
    cost: material.cost,
    total: material.total,
    supplier: material.supplier,
    notes: material.notes
  })
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [adjQty, setAdjQty] = useState(0)
  const [adjNote, setAdjNote] = useState('')
  const toast = useToast()
  const canEdit = can(role, 'edit') && can(role, 'editPrices')
  const canDelete = can(role, 'delete')
  const canAdjust = can(role, 'adjustStock')

  const loadMovements = useCallback(() => {
    window.clinic.inventory
      .movements()
      .then((ms) => setMovements(ms.filter((m) => m.material_id === material.id)))
      .catch(() => setMovements([]))
  }, [material.id])

  useEffect(() => {
    loadMovements()
  }, [loadMovements])

  const setQuantity = (v: number): void =>
    setForm((f) => {
      const q = Number(v) || 0
      const t = Number(f.total) || 0
      const c = Number(f.cost) || 0
      if (t > 0 && q > 0) return { ...f, quantity: q, cost: round4(t / q) }
      if (c > 0) return { ...f, quantity: q, total: round4(c * q) }
      return { ...f, quantity: q }
    })

  const setTotal = (lbp: number): void =>
    setForm((f) => {
      const q = Number(f.quantity) || 0
      return { ...f, total: lbp || 0, cost: lbp > 0 && q > 0 ? round4(lbp / q) : f.cost }
    })

  const setCost = (lbp: number): void =>
    setForm((f) => {
      const q = Number(f.quantity) || 0
      return { ...f, cost: lbp || 0, total: lbp > 0 && q > 0 ? round4(lbp * q) : f.total }
    })

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
      total: total > 0 ? total : round4((Number(form.cost) || 0) * (Number(form.quantity) || 0))
    }
    setSaving(true)
    window.clinic.inventory
      .update(material.id, data)
      .then(async () => {
        const delta = (Number(form.quantity) || 0) - material.quantity
        if (delta) await window.clinic.inventory.adjust(material.id, delta, 'adjust', 'تعديل من صفحة المادة')
        toast('تم حفظ المادة', 'success')
        onSaved()
        onClose()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setSaving(false))
  }

  const submitAdjust = (): void => {
    if (!adjQty) {
      toast('أدخل كمية', 'error')
      return
    }
    window.clinic.inventory
      .adjust(material.id, adjQty, adjQty > 0 ? 'add' : 'adjust', adjNote)
      .then(() => {
        toast('تم تسجيل الحركة', 'success')
        setAdjusting(false)
        setAdjQty(0)
        setAdjNote('')
        setForm((f) => ({ ...f, quantity: f.quantity + adjQty }))
        loadMovements()
        onSaved()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const remove = (): void => {
    window.clinic.inventory
      .delete(material.id)
      .then(() => {
        toast('تم حذف المادة', 'success')
        onSaved()
        onClose()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  return (
    <>
      <div className="drill-page">
        <DrillHead crumb="المخزون" current={material.name} onBack={onClose}>
          {canAdjust && (
            <button
              className="soft small"
              onClick={() => {
                setAdjusting(true)
                setAdjQty(0)
                setAdjNote('')
              }}
            >
              تعديل الكمية
            </button>
          )}
          {canDelete && (
            <button className="danger-ghost small" onClick={() => setDeleting(true)}>
              حذف المادة
            </button>
          )}
        </DrillHead>

        <div className="drill-summary">
          <span className="muted">
            الكمية: <b>{fmt(form.quantity)} {form.unit}</b>
            {form.min_qty > 0 && form.quantity <= form.min_qty && <span className="badge amber" style={{ marginInlineStart: 8 }}>تحت الحد الأدنى</span>}
            {' — '}الكلفة: {fmt(form.cost)} ل.س — الإجمالي: <CurrencyCell lbp={form.total} rate={rate} />
          </span>
        </div>

        <div className="drill-body">
          <div className="panel">
            <div className="panel-head">
              <h2>بيانات المادة</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label="الاسم *">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="التصنيف">
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </Field>
                <Field label="الكمية">
                  <NumberInput value={Number(form.quantity) || 0} onChange={setQuantity} />
                </Field>
                <Field label="الحد الأدنى">
                  <NumberInput value={Number(form.min_qty) || 0} onChange={(v) => setForm({ ...form, min_qty: v })} />
                </Field>
                <Field label="الوحدة">
                  <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="علبة / حبة / ملم..." />
                </Field>
                <Field label="الكلفة (ل.س أو $)">
                  <CurrencyInput dual valueLbp={Number(form.cost) || 0} rate={rate} onChange={setCost} placeholder="0" />
                </Field>
                <Field label="الاجمالي (ل.س أو $)">
                  <CurrencyInput dual valueLbp={Number(form.total) || 0} rate={rate} onChange={setTotal} placeholder="0" />
                </Field>
                <Field label="المورد">
                  <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
                </Field>
                <Field label="ملاحظات">
                  <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </Field>
              </div>
              <div className="meta-grid mt-16">
                <KV label="بالدولار (الكلفة)">{rate > 0 ? (form.cost / rate).toFixed(2) : '0.00'} $</KV>
                <KV label="بالدولار (الإجمالي)">{rate > 0 ? (form.total / rate).toFixed(2) : '0.00'} $</KV>
                <KV label="أُضيفت في">{material.created_at || '—'}</KV>
              </div>
              {canEdit && (
                <div className="flex end" style={{ marginTop: 12 }}>
                  <button disabled={saving} onClick={save}>
                    {saving ? '...' : 'حفظ التعديلات'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>سجل حركات هذه المادة ({movements.length})</h2>
            </div>
            <div className="panel-body">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
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
                        <td colSpan={6}>
                          <Empty text="لا توجد حركات لهذه المادة" />
                        </td>
                      </tr>
                    ) : (
                      movements.map((mv) => (
                        <tr key={mv.id}>
                          <td>{mv.created_at}</td>
                          <td>
                            <span className={mv.qty > 0 ? 'badge green' : 'badge red'}>{mv.qty > 0 ? `+${mv.qty}` : mv.qty}</span>
                          </td>
                          <td>{OP_LABEL[mv.operation] ?? mv.operation}</td>
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
        </div>
      </div>

      {adjusting && (
        <Modal
          title={`تعديل كمية: ${material.name}`}
          onClose={() => setAdjusting(false)}
          footer={
            <>
              <button onClick={submitAdjust}>تسجيل</button>
              <button className="ghost" onClick={() => setAdjusting(false)}>
                إلغاء
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="الكمية الحالية">
              <input value={form.quantity} disabled />
            </Field>
            <Field label="التغيير (+ للزيادة / - للنقصان)">
              <NumberInput value={adjQty} onChange={setAdjQty} allowNegative autoFocus />
            </Field>
            <Field label="ملاحظة">
              <input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
            </Field>
          </div>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            النتيجة: {form.quantity + adjQty} {form.unit}
          </p>
        </Modal>
      )}

      {deleting && (
        <Confirm
          title="حذف مادة"
          message={`حذف المادة "${material.name}"؟ سيتم حذف سجل حركاتها أيضاً.`}
          onConfirm={remove}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  )
}
