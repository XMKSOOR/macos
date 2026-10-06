import { useCallback, useEffect, useState } from 'react'
import { Confirm, CurrencyCell, Empty, Field, Modal, useToast } from '../ui'
import DataGrid from '../table'
import type { Col } from '../table'
import ExcelBar from '../excel'
import type { DueRecurringExpense, Expense, Recurrence, Role, Settings } from '../lib'
import { can, today } from '../lib'
import { CurrencyInput } from '../CurrencyInput'

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
  { key: 'note', label: 'الملاحظة' },
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
  const toast = useToast()
  const rate = settings?.usd_rate ?? 130

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
      .then(() => {
        toast('تم الحفظ', 'success')
        setModal(false)
        load(from, to)
        window.clinic.expenses.due(7).then(setDue).catch(() => {})
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
      const row = list.find((e) => e.id === Number(key))
      if (!row) return
      const merged = {
        category: (patch.category as string) ?? row.category,
        amount: Math.round(Number(patch.amount ?? row.amount)),
        note: (patch.note as string) ?? row.note,
        date: (patch.date as string) ?? row.date
      }
      await window.clinic.expenses.update(row.id, merged)
      load(from, to)
    },
    [list, load, from, to]
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

  const exportRows = (): Record<string, string | number>[] =>
    list.map((e) => ({
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
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">اختر التصنيف...</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
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
                  <select
                    value={form.recurrence}
                    onChange={(e) => setForm({ ...form, recurrence: e.target.value as Recurrence })}
                  >
                    {RECURRENCE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
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
            <Field label="الملاحظة">
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