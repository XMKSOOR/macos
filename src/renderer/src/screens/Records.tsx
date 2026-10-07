import { useCallback, useEffect, useState } from 'react'
import { Confirm, Empty, Field, Modal, useToast } from '../ui'

export function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (key: string) => void
}): React.JSX.Element {
  return (
    <div className="dtab-bar">
      {tabs.map((t) => (
        <button key={t.key} className={`dtab ${active === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export interface RecCol {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'money'
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  showInTable?: boolean
  full?: boolean
}

function today(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function cellText(col: RecCol, val: unknown): string {
  if (val === undefined || val === null || val === '') return '—'
  if (col.type === 'select' && col.options) {
    return col.options.find((o) => o.value === String(val))?.label ?? String(val)
  }
  if (col.type === 'date') return String(val)
  if (col.type === 'money' || col.type === 'number') return String(val)
  return String(val)
}

export function RecordsTab({
  kind,
  patientId,
  columns,
  emptyText = 'لا توجد بيانات'
}: {
  kind: string
  patientId?: number
  columns: RecCol[]
  emptyText?: string
}): React.JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [deleting, setDeleting] = useState<Record<string, unknown> | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback((): void => {
    window.clinic.records
      .list(kind, patientId)
      .then(setRows)
      .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
  }, [kind, patientId, toast])

  useEffect(() => {
    load()
  }, [load])

  const newRow = (): Record<string, unknown> => {
    const base: Record<string, unknown> = {}
    if (patientId) base.patient_id = patientId
    columns.forEach((c) => {
      if (c.type === 'date') base[c.key] = today()
      else if (c.type === 'number' || c.type === 'money') base[c.key] = 0
      else base[c.key] = ''
    })
    return base
  }

  const save = (): void => {
    if (!editing) return
    const missing = columns.find((c) => c.required && !String(editing[c.key] ?? '').trim())
    if (missing) {
      toast(`الحقل «${missing.label}» مطلوب`, 'error')
      return
    }
    setBusy(true)
    window.clinic.records
      .save(kind, editing)
      .then(() => {
        toast('تم الحفظ', 'success')
        setEditing(null)
        load()
      })
      .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
      .finally(() => setBusy(false))
  }

  const remove = (): void => {
    if (!deleting) return
    window.clinic.records
      .delete(kind, Number(deleting.id))
      .then(() => {
        toast('تم الحذف', 'success')
        setDeleting(null)
        load()
      })
      .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
  }

  const tableCols = columns.filter((c) => c.showInTable !== false)
  const filtered = q.trim()
    ? rows.filter((r) => tableCols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q.trim().toLowerCase())))
    : rows

  return (
    <div className="rec-tab">
      <div className="rec-toolbar">
        <input placeholder="بحث..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="small" onClick={() => setEditing(newRow())}>
          ＋ إضافة
        </button>
      </div>
      {filtered.length === 0 ? (
        <Empty text={emptyText} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {tableCols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={String(r.id)}>
                  {tableCols.map((c) => (
                    <td key={c.key}>{cellText(c, r[c.key])}</td>
                  ))}
                  <td className="rec-actions">
                    <button className="soft small" onClick={() => setEditing({ ...r })}>
                      تعديل
                    </button>
                    <button className="danger-ghost small" onClick={() => setDeleting(r)}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          title="تعديل السجل"
          onClose={() => setEditing(null)}
          wide
          footer={
            <>
              <button className="ghost" onClick={() => setEditing(null)}>
                إلغاء
              </button>
              <button disabled={busy} onClick={save}>
                {busy ? '...' : 'حفظ'}
              </button>
            </>
          }
        >
          <div className="rec-form">
            {columns.map((c) => (
              <div key={c.key} className={c.full || c.type === 'textarea' ? 'rec-full' : ''}>
                <Field label={c.label}>
                  {c.type === 'textarea' ? (
                    <textarea
                      rows={5}
                      value={String(editing[c.key] ?? '')}
                      onChange={(e) => setEditing({ ...editing, [c.key]: e.target.value })}
                    />
                  ) : c.type === 'select' ? (
                    <select
                      value={String(editing[c.key] ?? '')}
                      onChange={(e) => setEditing({ ...editing, [c.key]: e.target.value })}
                    >
                      <option value="">— اختر —</option>
                      {c.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={c.type === 'date' ? 'date' : c.type === 'number' || c.type === 'money' ? 'number' : 'text'}
                      dir={c.type === 'number' || c.type === 'money' || c.type === 'date' ? 'ltr' : undefined}
                      placeholder={c.placeholder}
                      value={String(editing[c.key] ?? '')}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          [c.key]:
                            c.type === 'number' || c.type === 'money' ? Number(e.target.value || 0) : e.target.value
                        })
                      }
                    />
                  )}
                </Field>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {deleting && (
        <Confirm
          title="تأكيد الحذف"
          message="هل تريد حذف هذا السجل نهائياً؟"
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}