import { useCallback, useEffect, useState } from 'react'
import { Confirm, CurrencyCell, Empty, Field, Modal, useToast } from '../ui'
import DataGrid from '../table'
import type { Col } from '../table'
import ExcelBar from '../excel'
import type { Expense, Role, Settings } from '../lib'
import { can, fmt, today } from '../lib'
import { CurrencyInput } from '../CurrencyInput'

const CATEGORIES = ['رواتب وأجور', 'إيجار', 'كهرباء ومحروقات', 'أجهزة ومعدات', 'نظافة وتعقيم', 'أدوية ومواد', 'صيانة', 'أخرى']

const cols: Col<Expense>[] = [
  { key: 'date', label: 'التاريخ', type: 'date' },
  {
    key: 'category',
    label: 'التصنيف',
    type: 'select',
    options: CATEGORIES.map((c) => ({ value: c, label: c }))
  },
  { key: 'amount', label: 'المبلغ', type: 'money' },
  {
    key: 'amount_usd',
    label: 'المبلغ ($)',
    type: 'display',
    render: (e) => <span dir="ltr">{e.amount_usd ? `${fmt(e.amount_usd)} $` : '—'}</span>
  },
  { key: 'note', label: 'الملاحظة' },
  { key: 'created_by', label: 'سجّله', type: 'display' }
]

export default function Expenses({ settings, role }: { settings: Settings | null; role: Role }): React.JSX.Element {
  const [list, setList] = useState<Expense[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<{ category: string; amount: string; note: string; date: string }>({
    category: '',
    amount: '',
    note: '',
    date: today()
  })
  const [deleting, setDeleting] = useState<Expense | null>(null)
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
      .create({ category: form.category, amount: Math.round(Number(form.amount)), note: form.note, date: form.date })
      .then(() => {
        toast('تم الحفظ', 'success')
        setModal(false)
        load(from, to)
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
                setForm({ category: '', amount: '', note: '', date: today() })
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
            <Field label="المبلغ (ل.ل أو $) *">
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
            <Field label="الملاحظة">
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {deleting && (
        <Confirm
          title="حذف مصروف"
          message={`حذف المصروف "${deleting.category}" بمبلغ ${deleting.amount.toLocaleString('en-US')} ل.ل؟`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}