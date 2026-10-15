import { useState } from 'react'
import { Confirm, CurrencyCell, DrillHead, Field, KV, useToast } from '../ui'
import { SearchSelect } from '../SearchSelect'
import type { Expense, Recurrence, Role, Settings } from '../lib'
import { can } from '../lib'
import { CurrencyInput } from '../CurrencyInput'

const CATEGORIES = ['رواتب وأجور', 'إيجار', 'كهرباء ومحروقات', 'أجهزة ومعدات', 'نظافة وتعقيم', 'أدوية ومواد', 'صيانة', 'أخرى']

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'monthly', label: 'شهري' },
  { value: 'quarterly', label: 'كل 3 أشهر' },
  { value: 'yearly', label: 'سنوي' },
  { value: 'weekly', label: 'أسبوعي' }
]

export default function ExpenseFile({
  expense,
  settings,
  role,
  onClose,
  onSaved
}: {
  expense: Expense
  settings: Settings | null
  role: Role
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const rate = settings?.usd_rate ?? 130
  const [form, setForm] = useState({
    category: expense.category,
    amount: String(expense.amount || ''),
    note: expense.note,
    date: expense.date,
    is_recurring: !!expense.is_recurring,
    recurrence: (expense.recurrence ?? 'monthly') as Recurrence,
    next_due: expense.next_due ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const toast = useToast()
  const canEdit = can(role, 'edit') && can(role, 'editPrices')
  const canDelete = can(role, 'delete')

  const save = (): void => {
    if (!form.category) {
      toast('اختر التصنيف', 'error')
      return
    }
    if (!Number(form.amount) || Number(form.amount) <= 0) {
      toast('المبلغ غير صالح', 'error')
      return
    }
    setSaving(true)
    window.clinic.expenses
      .update(expense.id, {
        category: form.category,
        amount: Math.round(Number(form.amount)),
        note: form.note,
        date: form.date,
        is_recurring: form.is_recurring ? 1 : 0,
        recurrence: form.recurrence,
        next_due: form.is_recurring ? form.next_due : ''
      })
      .then(() => {
        toast('تم حفظ المصروف', 'success')
        onSaved()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setSaving(false))
  }

  const remove = (): void => {
    window.clinic.expenses
      .delete(expense.id)
      .then(() => {
        toast('تم حذف المصروف', 'success')
        onSaved()
        onClose()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  return (
    <>
      <div className="drill-page">
        <DrillHead crumb="المصاريف" current={expense.category} onBack={onClose}>
          {canDelete && (
            <button className="danger-ghost small" onClick={() => setDeleting(true)}>
              حذف المصروف
            </button>
          )}
        </DrillHead>

        <div className="drill-summary">
          <span className="muted">
            المبلغ: <CurrencyCell lbp={form.amount ? Number(form.amount) : expense.amount} rate={rate} /> — التاريخ: {expense.date}
            {form.is_recurring && (
              <>
                {' — '}
                متكرر: {RECURRENCE_OPTIONS.find((r) => r.value === form.recurrence)?.label}
              </>
            )}
          </span>
        </div>

        <div className="drill-body">
          <div className="panel">
            <div className="panel-head">
              <h2>بيانات المصروف</h2>
            </div>
            <div className="panel-body">
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
                <Field label="اسم الصنف / البيان">
                  <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </Field>
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
                    <Field label="الاستحقاق التالي (اتركه فارغاً ليُحسب)">
                      <input
                        type="date"
                        min={form.date}
                        value={form.next_due}
                        onChange={(e) => setForm({ ...form, next_due: e.target.value })}
                      />
                    </Field>
                  </>
                )}
              </div>
              <div className="meta-grid mt-16">
                <KV label="سجّله">{expense.created_by || '—'}</KV>
                <KV label="أُنشئ في">{expense.created_at || '—'}</KV>
                <KV label="آخر توليد">
                  {expense.is_recurring ? expense.last_generated || '—' : 'غير متكرر'}
                </KV>
                <KV label="بالدولار">{rate > 0 ? ((Number(form.amount) || expense.amount) / rate).toFixed(2) : '0.00'} $</KV>
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
        </div>
      </div>

      {deleting && (
        <Confirm
          title="حذف مصروف"
          message={`حذف المصروف "${expense.category}" بمبلغ ${expense.amount.toLocaleString('en-US')} ل.س؟`}
          onConfirm={remove}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  )
}
