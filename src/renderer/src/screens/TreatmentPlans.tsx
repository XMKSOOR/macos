import { useCallback, useEffect, useState } from 'react'
import { Modal, Field, Empty, CurrencyCell, Confirm, useToast } from '../ui'
import type { TreatmentPlan, TreatmentPlanItem, TreatmentPlanStatus, ProcedureTemplate } from '../lib'

const PLAN_STATUSES: { value: TreatmentPlanStatus; label: string }[] = [
  { value: 'proposed', label: 'مقترحة' },
  { value: 'accepted', label: 'مقبولة' },
  { value: 'in_progress', label: 'قيد التنفيذ' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'cancelled', label: 'ملغاة' }
]

const ITEM_STATUSES: { value: TreatmentPlanItem['status']; label: string }[] = [
  { value: 'pending', label: 'قيد الانتظار' },
  { value: 'done', label: 'منجز' },
  { value: 'cancelled', label: 'ملغى' }
]

const planStatusLabel = (s: TreatmentPlanStatus): string => PLAN_STATUSES.find((x) => x.value === s)?.label ?? s
const itemStatusLabel = (s: TreatmentPlanItem['status']): string => ITEM_STATUSES.find((x) => x.value === s)?.label ?? s

const FDI_TEETH = [
  '18', '17', '16', '15', '14', '13', '12', '11',
  '21', '22', '23', '24', '25', '26', '27', '28',
  '31', '32', '33', '34', '35', '36', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48'
]

interface ItemDraft {
  id?: number
  tooth_number: string
  procedure_name: string
  cost: number
  notes: string
}

const emptyItem = (): ItemDraft => ({ tooth_number: '', procedure_name: '', cost: 0, notes: '' })

export default function TreatmentPlans({ patientId, rate }: { patientId: number; rate: number }): React.JSX.Element {
  const toast = useToast()
  const [plans, setPlans] = useState<TreatmentPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<ProcedureTemplate[]>([])
  const [planEdit, setPlanEdit] = useState<{ id?: number; title: string; status: TreatmentPlanStatus; notes: string } | null>(null)
  const [savingPlan, setSavingPlan] = useState(false)
  const [itemEdit, setItemEdit] = useState<{ planId: number; draft: ItemDraft } | null>(null)
  const [savingItem, setSavingItem] = useState(false)
  const [deletingPlan, setDeletingPlan] = useState<TreatmentPlan | null>(null)
  const [deletingItem, setDeletingItem] = useState<TreatmentPlanItem | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    window.clinic.plans
      .list(patientId)
      .then(setPlans)
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [patientId, toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    window.clinic.procedureTemplates
      .list()
      .then(setTemplates)
      .catch(() => {})
  }, [])

  const openNewPlan = (): void => setPlanEdit({ title: '', status: 'proposed', notes: '' })

  const openEditPlan = (p: TreatmentPlan): void =>
    setPlanEdit({ id: p.id, title: p.title, status: p.status, notes: p.notes })

  const savePlan = (): void => {
    if (!planEdit) return
    if (!planEdit.title.trim()) {
      toast('عنوان الخطة مطلوب', 'error')
      return
    }
    setSavingPlan(true)
    if (planEdit.id) {
      window.clinic.plans
        .update(planEdit.id, planEdit.title, planEdit.status, planEdit.notes)
        .then(load)
        .then(() => {
          toast('تم حفظ الخطة', 'success')
          setPlanEdit(null)
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => setSavingPlan(false))
    } else {
      window.clinic.plans
        .create(patientId, planEdit.title, planEdit.notes)
        .then(() => {
          toast('تم إنشاء خطة العلاج', 'success')
          setPlanEdit(null)
          load()
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => setSavingPlan(false))
    }
  }

  const removePlan = (): void => {
    if (!deletingPlan) return
    window.clinic.plans
      .delete(deletingPlan.id)
      .then(() => {
        toast('تم حذف الخطة', 'success')
        load()
      })
      .catch((e) => toast(e.message, 'error'))
    setDeletingPlan(null)
  }

  const saveItem = (): void => {
    if (!itemEdit) return
    const d = itemEdit.draft
    if (!d.procedure_name.trim()) {
      toast('أدخل اسم الإجراء', 'error')
      return
    }
    setSavingItem(true)
    if (d.id) {
      window.clinic.plans
        .updateItem(d.id, 'pending', d.cost)
        .then(() => {
          toast('تم تحديث البند', 'success')
          setItemEdit(null)
          load()
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => setSavingItem(false))
    } else {
      window.clinic.plans
        .addItem(itemEdit.planId, d.tooth_number, d.procedure_name.trim(), d.cost, d.notes)
        .then(() => {
          toast('تمت إضافة البند', 'success')
          setItemEdit(null)
          load()
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => setSavingItem(false))
    }
  }

  const removeItem = (): void => {
    if (!deletingItem) return
    window.clinic.plans
      .deleteItem(deletingItem.id)
      .then(() => {
        toast('تم حذف البند', 'success')
        load()
      })
      .catch((e) => toast(e.message, 'error'))
    setDeletingItem(null)
  }

  const cycleItem = (it: TreatmentPlanItem): void => {
    const next: TreatmentPlanItem['status'] = it.status === 'pending' ? 'done' : it.status === 'done' ? 'cancelled' : 'pending'
    window.clinic.plans
      .updateItem(it.id, next, it.cost)
      .then(() => load())
      .catch((e) => toast(e.message, 'error'))
  }

  const applyTemplate = (value: string): void => {
    const t = templates.find((x) => x.id === Number(value))
    if (!t) return
    setItemEdit((s) => (s ? { ...s, draft: { ...s.draft, procedure_name: t.name, cost: t.default_cost } } : s))
  }

  if (loading) return <div className="muted">جاري التحميل...</div>

  return (
    <div>
      <div className="flex between" style={{ marginBottom: 10 }}>
        <span className="muted">{plans.length} خطة علاج</span>
        <button className="soft small" onClick={() => setPlanEdit({ title: '', status: 'proposed', notes: '' })}>
          ＋ خطة علاج جديدة
        </button>
      </div>

      {plans.length === 0 ? (
        <Empty text="لا توجد خطط علاج — أنشئ خطة لتخطيط الإجراءات والتكلفة" />
      ) : (
        <div className="plan-list">
          {plans.map((p) => (
            <div key={p.id} className="plan-card">
              <div className="plan-head">
                <div>
                  <strong>{p.title}</strong>
                  <span className={`badge ${p.status === 'completed' ? 'green' : p.status === 'cancelled' ? 'gray' : p.status === 'in_progress' ? 'blue' : 'amber'}`}>
                    {planStatusLabel(p.status)}
                  </span>
                </div>
                <div className="flex" style={{ gap: 8 }}>
                  <span className="muted">
                    الإجمالي: <CurrencyCell lbp={p.total_cost} rate={rate} />
                  </span>
                  <button className="soft small" onClick={() => setItemEdit({ planId: p.id, draft: emptyItem() })}>
                    ＋ بند
                  </button>
                  <button
                    className="soft small"
                    onClick={() => setPlanEdit({ id: p.id, title: p.title, status: p.status, notes: p.notes })}
                  >
                    تعديل
                  </button>
                  <button className="ghost small" onClick={() => setDeletingPlan(p)}>
                    حذف
                  </button>
                </div>
              </div>
              {p.notes && <div className="muted sub">{p.notes}</div>}
              <table className="table">
                <thead>
                  <tr>
                    <th>السن</th>
                    <th>الإجراء</th>
                    <th>التكلفة</th>
                    <th>الحالة</th>
                    <th>ملاحظات</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((it) => (
                    <tr key={it.id} className={it.status === 'cancelled' ? 'muted' : ''}>
                      <td>{it.tooth_number || '—'}</td>
                      <td>{it.procedure_name}</td>
                      <td dir="ltr">
                        <CurrencyCell lbp={it.cost} rate={rate} />
                      </td>
                      <td>
                        <button className="ghost small" title="تبديل الحالة" onClick={() => cycleItem(it)}>
                          {itemStatusLabel(it.status)}
                        </button>
                      </td>
                      <td>{it.notes}</td>
                      <td className="row-actions">
                        <button className="ghost small" onClick={() => setItemEdit({ planId: p.id, draft: { id: it.id, tooth_number: it.tooth_number, procedure_name: it.procedure_name, cost: it.cost, notes: it.notes } })}>
                          تكلفة
                        </button>
                        <button className="ghost small" onClick={() => setDeletingItem(it)}>
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                  {p.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted center">
                        لا بنود في هذه الخطة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {planEdit && (
        <Modal
          title={planEdit.id ? 'تعديل خطة العلاج' : 'خطة علاج جديدة'}
          onClose={() => setPlanEdit(null)}
          footer={
            <>
              <button className="ghost" onClick={() => setPlanEdit(null)}>
                إلغاء
              </button>
              <button disabled={savingPlan} onClick={savePlan}>
                {savingPlan ? '...' : 'حفظ'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="عنوان الخطة">
              <input value={planEdit.title} onChange={(e) => setPlanEdit({ ...planEdit, title: e.target.value })} placeholder="مثال: خطة ترميم الفك العلوي" />
            </Field>
            <Field label="الحالة">
              <select value={planEdit.status} onChange={(e) => setPlanEdit({ ...planEdit, status: e.target.value as TreatmentPlanStatus })}>
                {PLAN_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field full">
              <Field label="ملاحظات وموافقة المريض">
                <textarea rows={3} value={planEdit.notes} onChange={(e) => setPlanEdit({ ...planEdit, notes: e.target.value })} />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {itemEdit && (
        <Modal
          title={itemEdit.draft.id ? 'تعديل بند' : 'إضافة بند للخطة'}
          onClose={() => setItemEdit(null)}
          footer={
            <>
              <button className="ghost" onClick={() => setItemEdit(null)}>
                إلغاء
              </button>
              <button disabled={savingItem} onClick={saveItem}>
                {savingItem ? '...' : 'حفظ'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="اختر قالب إجراء (تعبئة تلقائية)">
              <select value="" onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">— قالب —</option>
                {Array.from(new Set(templates.map((t) => t.category))).map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {templates
                      .filter((t) => t.category === cat)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="السن (FDI)">
              <select
                value={itemEdit.draft.tooth_number}
                onChange={(e) => setItemEdit({ ...itemEdit, draft: { ...itemEdit.draft, tooth_number: e.target.value } })}
              >
                <option value="">— عام / غير محدد —</option>
                {FDI_TEETH.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="اسم الإجراء">
              <input
                value={itemEdit.draft.procedure_name}
                onChange={(e) => setItemEdit({ ...itemEdit, draft: { ...itemEdit.draft, procedure_name: e.target.value } })}
              />
            </Field>
            <Field label="التكلفة (ل.س)">
              <input
                type="number"
                dir="ltr"
                value={itemEdit.draft.cost}
                onChange={(e) => setItemEdit({ ...itemEdit, draft: { ...itemEdit.draft, cost: Number(e.target.value) } })}
              />
            </Field>
            <div className="field full">
              <Field label="ملاحظات">
                <textarea
                  rows={2}
                  value={itemEdit.draft.notes}
                  onChange={(e) => setItemEdit({ ...itemEdit, draft: { ...itemEdit.draft, notes: e.target.value } })}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {deletingPlan && (
        <Confirm
          title="حذف خطة العلاج"
          message={`هل تريد حذف "${deletingPlan.title}" وكل بنودها؟`}
          onConfirm={removePlan}
          onClose={() => setDeletingPlan(null)}
        />
      )}
      {deletingItem && (
        <Confirm
          title="حذف البند"
          message={`هل تريد حذف "${deletingItem.procedure_name}"؟`}
          onConfirm={removeItem}
          onClose={() => setDeletingItem(null)}
        />
      )}
    </div>
  )
}