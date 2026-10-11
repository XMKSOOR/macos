import { useCallback, useEffect, useState } from 'react'
import { Confirm, CurrencyCell, Empty, Field, Modal, useToast } from '../ui'
import { SearchSelect } from '../SearchSelect'
import DataGrid from '../table'
import type { Col } from '../table'
import ExcelBar, { exportNow } from '../excel'
import type { DueRecurringExpense, Expense, Material, Recurrence, Role, Settings } from '../lib'
import { can, today } from '../lib'
import { CurrencyInput } from '../CurrencyInput'
import { NumberInput } from '../NumberInput'

const CATEGORIES = ['رواتب وأجور', 'إيجار', 'كهرباء ومحروقات', 'أجهزة ومعدات', 'نظافة وتعقيم', 'أدوية ومواد', 'صيانة', 'أخرى']

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'monthly', label: 'شهري' },
  { value: 'quarterly', label: 'كل 3 أشهر' },
  { value: 'yearly', label: 'سنوي' },
  { value: 'weekly', label: 'أسبوعي' }
]

const cols: Col<Expense>[] = [
  { key: 'date', label: 'التاريخ', type: 'date' },
  {
    key: 'category',
    label: 'التصنيف',
    type: 'select',
    options: CATEGORIES.map((c) => ({ value: c, label: c }))
  },
  { key: 'amount', label: 'المبلغ', type: 'money' },
  { key: 'note', label: 'اسم الصنف' },
  {
    key: 'next_due',
    label: 'الاستحقاق التالي',
    type: 'display',
    render: (e) =>
      e.is_recurring && e.next_due ? (
        <span>
          {e.next_due}
          <span className="muted">
            {' '}
            ({RECURRENCE_OPTIONS.find((r) => r.value === (e.recurrence ?? 'monthly'))?.label ?? 'شهري'})
          </span>
        </span>
      ) : (
        <span className="muted">—</span>
      )
  },
  { key: 'created_by', label: 'سجّله', type: 'display' }
]

export default function Expenses({ settings, role }: { settings: Settings | null; role: Role }): React.JSX.Element {
  const [list, setList] = useState<Expense[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<{
    category: string
    amount: string
    note: string
    date: string
    is_recurring: boolean
    recurrence: Recurrence
    next_due: string
  }>({
    category: '',
    amount: '',
    note: '',
    date: today(),
    is_recurring: false,
    recurrence: 'monthly',
    next_due: ''
  })
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [due, setDue] = useState<DueRecurringExpense[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [materialId, setMaterialId] = useState(0)
  const [units, setUnits] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const toast = useToast()
  const rate = settings?.usd_rate ?? 130
  const unitsNum = Number(units) || 0
  const unitCost = unitsNum > 0 ? Math.round((Number(form.amount) || 0) / unitsNum) : 0

  const canEdit = can(role, 'edit')
  const canDelete = can(role, 'delete')
  const canImport = can(role, 'import')

  const load = useCallback(
    (f?: string, t?: string) => {
      const filter: { from?: string; to?: string } = {}
      if (f) filter.from = f
      if (t) filter.to = t
      window.clinic.expenses
        .list(filter)
        .then(setList)
        .catch((e) => toast(e.message, 'error'))
    },
    [toast]
  )

  useEffect(() => {
    load(from, to)
  }, [load, from, to])

  useEffect(() => {
    window.clinic.expenses
      .due(7)
      .then(setDue)
      .catch(() => setDue([]))
  }, [])

  useEffect(() => {
    window.clinic.inventory
      .list()
      .then(setMaterials)
      .catch(() => setMaterials([]))
  }, [])

  const total = list.reduce((s, e) => s + e.amount, 0)

  const save = (): void => {
    if (!form.category) {
      toast('اختر التصنيف', 'error')
      return
    }
    if (!Number(form.amount) || Number(form.amount) <= 0) {
      toast('المبلغ غير صالح', 'error')
      return
    }
    const done = (): void => {
      toast('تم الحفظ', 'success')
      setModal(false)
      load(from, to)
      window.clinic.expenses.due(7).then(setDue).catch(() => {})
    }
    if (materialId !== 0) {
      const qty = Number(units)
      if (!qty || qty <= 0) {
        toast('أدخل عدد الوحدات (حبات/عبوات)', 'error')
        return
      }
      window.clinic.expenses
        .purchase({
          category: form.category,
          amount: Math.round(Number(form.amount)),
          note: form.note,
          date: form.date,
          material_id: materialId,
          quantity: qty
        })
        .then(done)
        .catch((e) => toast(e.message, 'error'))
      return
    }
    window.clinic.expenses
      .create({
        category: form.category,
        amount: Math.round(Number(form.amount)),
        note: form.note,
        date: form.date,
        is_recurring: form.is_recurring ? 1 : 0,
        recurrence: form.recurrence,
        next_due: form.next_due
      })
      .then(done)
      .catch((e) => toast(e.message, 'error'))
  }

  const createItem = (): void => {
    const name = newName.trim()
    if (!name) {
      toast('أدخل اسم الصنف الجديد', 'error')
      return
    }
    window.clinic.inventory
      .create({ name, category: '', unit: newUnit.trim(), quantity: 0, min_qty: 0, cost: 0, supplier: '', notes: '' })
      .then((m) => {
        setMaterials((p) => [...p, m].sort((a, b) => a.name.localeCompare(b.name)))
        setMaterialId(m.id)
        setAddingItem(false)
        setNewName('')
        setNewUnit('')
        toast('تمت إضافة الصنف للمخزون', 'success')
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const remove = (): void => {
    if (!deleting) return
    window.clinic.expenses
      .delete(deleting.id)
      .then(() => {
        toast('تم الحذف', 'success')
        load(from, to)
      })
      .catch((e) => toast(e.message, 'error'))
    setDeleting(null)
  }

  const runDue = (): void => {
    window.clinic.expenses
      .runDue()
      .then((n) => {
        toast(n > 0 ? `تم توليد ${n} مصروف متكرر` : 'لا توجد مصاريف مستحقة الآن', 'success')
        load(from, to)
        window.clinic.expenses.due(7).then(setDue).catch(() => {})
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const onRowSave = useCallback(
    async (key: number | string, patch: Record<string, unknown>): Promise<void> => {
      await window.clinic.expenses.update(Number(key), patch)
      load(from, to)
    },
    [load, from, to]
  )

  const onImportRows = useCallback(
    async (rows: Record<string, string>[]) => {
      let ok = 0
      let skip = 0
      for (const r of rows) {
        if (!r.category || !Number(r.amount)) {
          skip++
          continue
        }
        try {
          await window.clinic.expenses.create({
            category: r.category,
            amount: Math.round(Number(r.amount)),
            note: r.note ?? '',
            date: r.date || today()
          })
          ok++
        } catch {
          skip++
        }
      }
      load(from, to)
      return { ok, skip }
    },
    [load, from, to]
  )

  const exportRows = (rows: Expense[] = list): Record<string, string | number>[] =>
    rows.map((e) => ({
      category: e.category,
      amount: e.amount,
      amount_usd: e.amount_usd ?? 0,
      date: e.date,
      note: e.note,
      created_by: e.created_by
    }))

  return (
    <div>
      {due.length > 0 && (
        <div className="panel" style={{ marginBottom: 16, borderRight: '3px solid var(--warn)' }}>
          <div className="panel-head">
            <h2>مصاريف متكررة تستحق قريباً</h2>
            <div className="toolbar">
              <span className="muted">{due.length} بند خلال 7 أيام</span>
              <button className="soft small" onClick={runDue}>
                تسجيل المصاريف المستحقة الآن
              </button>
            </div>
          </div>
          <div className="panel-body">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>التصنيف</th>
                    <th>الاستحقاق</th>
                    <th>المتبقي</th>
                    <th>المبلغ</th>
                    <th>الملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {due.map((d) => (
                    <tr key={d.id}>
                      <td>{d.category}</td>
                      <td>{d.next_due}</td>
                      <td>
                        {d.days_left <= 0 ? (
                          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>مستحق الآن</span>
                        ) : (
                          <span className="muted">بعد {d.days_left} يوم</span>
                        )}
                      </td>
                      <td>
                        <CurrencyCell lbp={d.amount} rate={rate} />
                      </td>
                      <td>{d.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>سجل المصاريف</h2>
          <div className="toolbar">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="muted">إلى</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <ExcelBar schema="expenses" title="المصاريف" buildRows={exportRows} onImportRows={canImport ? onImportRows : undefined} />
            <button
              onClick={() => {
                setForm({
                  category: '',
                  amount: '',
                  note: '',
                  date: today(),
                  is_recurring: false,
                  recurrence: 'monthly',
                  next_due: ''
                })
                setMaterialId(0)
                setUnits('')
                setAddingItem(false)
                setNewName('')
                setNewUnit('')
                setModal(true)
              }}
            >
              + مصروف جديد
            </button>
          </div>
        </div>
        <div className="panel-body">
          <DataGrid
            rows={list}
            cols={cols}
            rowKey={(e) => e.id}
            canEdit={canEdit}
            onSave={onRowSave}
            moneyRate={rate}
            selectable
            onBulkDelete={
              canDelete
                ? async (rows) => {
                    for (const e of rows) await window.clinic.expenses.delete(e.id)
                    toast(`تم حذف ${rows.length} مصروف`, 'success')
                    load(from, to)
                  }
                : undefined
            }
            onBulkExport={(rows) => {
              void exportNow('المصاريف', 'expenses', exportRows(rows))
                .then((p) => {
                  if (p) toast('تم التصدير: ' + p, 'success')
                })
                .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
            }}
            emptyText="لا توجد مصاريف"
            actions={(e) =>
              canDelete ? (
                <button className="danger-ghost small" onClick={() => setDeleting(e)}>
                  حذف
                </button>
              ) : (
                <span />
              )
            }
          />
          {list.length > 0 && (
            <div className="flex between mt-16" style={{ fontWeight: 800 }}>
              <span>الإجمالي:</span>
              <span>
                <CurrencyCell lbp={total} rate={rate} />
              </span>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal
          title="مصروف جديد"
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
            <Field label="التصنيف *">
              <SearchSelect
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={[{ value: '', label: 'اختر التصنيف...' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
              />
            </Field>
            <Field label="المبلغ (ل.س أو $) *">
                <CurrencyInput
                  dual
                  valueLbp={Number(form.amount) || 0}
                  rate={rate}
                  onChange={(lbp) => setForm({ ...form, amount: lbp ? String(lbp) : '' })}
                  disabled={!can(role, 'editPrices')}
                />
              </Field>
            <Field label="التاريخ">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="الصنف في المخزون (اختياري)">
              <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <SearchSelect
                    value={materialId}
                    onChange={(v) => setMaterialId(Number(v))}
                    options={[
                      { value: 0, label: '— لا شيء (مصروف عادي) —' },
                      ...materials.map((m) => ({ value: m.id, label: `${m.name}${m.unit ? ` (${m.unit})` : ''}` }))
                    ]}
                  />
                </div>
                <button type="button" className="soft small" onClick={() => setAddingItem(true)} title="إضافة صنف جديد للمخزون">
                  ＋ صنف جديد
                </button>
              </div>
            </Field>
            {addingItem && (
              <div
                className="field full"
                style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 8, padding: 10 }}
              >
                <div style={{ flex: 1, minWidth: 160 }}>
                  <Field label="اسم الصنف الجديد *">
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                  </Field>
                </div>
                <div style={{ width: 130 }}>
                  <Field label="الوحدة">
                    <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="حبة / علبة" />
                  </Field>
                </div>
                <button type="button" className="soft small" onClick={createItem}>
                  إضافة للقائمة
                </button>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    setAddingItem(false)
                    setNewName('')
                    setNewUnit('')
                  }}
                >
                  إلغاء
                </button>
              </div>
            )}
            {materialId !== 0 && (
              <>
                <Field label="عدد الوحدات المشتراة (حبات/عبوات) *">
                  <NumberInput value={Number(units) || 0} onChange={(v) => setUnits(String(v))} />
                </Field>
                <div className="field full" style={{ gridColumn: '1 / -1' }}>
                  <div
                    className="flex between"
                    style={{ fontWeight: 800, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}
                  >
                    <span>كلفة الوحدة (المبلغ ÷ عدد الوحدات) — تُضاف الكمية للصنف:</span>
                    <span>
                      {unitCost.toLocaleString('en-US')} ل.س
                      {rate > 0 && <span className="muted"> ({(unitCost / rate).toFixed(2)} $)</span>}
                    </span>
                  </div>
                </div>
              </>
            )}
            {materialId === 0 && (
              <>
                <Field label="مصروف متكرر">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={form.is_recurring}
                      onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                    />
                    يتكرر تلقائياً
                  </label>
                </Field>
                {form.is_recurring && (
                  <>
                    <Field label="الدورية">
                      <SearchSelect
                        value={form.recurrence}
                        onChange={(v) => setForm({ ...form, recurrence: v as Recurrence })}
                        options={RECURRENCE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
                      />
                    </Field>
                    <Field label="أول استحقاق (اتركه فارغاً ليُحسب من التاريخ)">
                      <input
                        type="date"
                        min={form.date}
                        value={form.next_due}
                        onChange={(e) => setForm({ ...form, next_due: e.target.value })}
                      />
                    </Field>
                  </>
                )}
              </>
            )}
            <Field label="اسم الصنف">
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {deleting && (
        <Confirm
          title="حذف مصروف"
          message={`حذف المصروف "${deleting.category}" بمبلغ ${deleting.amount.toLocaleString('en-US')} ل.س؟`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}