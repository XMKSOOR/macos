import { useState } from 'react'
import type { ReactNode } from 'react'
import { Empty } from './ui'
import { fmt, toLatinDigits } from './lib'

export interface Col<T> {
  key: string
  label: string
  type?: 'text' | 'number' | 'money' | 'date' | 'select' | 'display'
  options?: { value: string | number; label: string }[]
  render?: (row: T) => ReactNode
  width?: number
}

interface DataGridProps<T> {
  rows: T[]
  cols: Col<T>[]
  rowKey: (r: T) => number | string
  canEdit: boolean
  onSave: (key: number | string, patch: Record<string, unknown>) => Promise<void>
  actions?: (row: T, editing: boolean, start: () => void) => ReactNode
  toolbar?: ReactNode
  emptyText?: string
  className?: string
  /** سعر الصرف (ل.س لكل $) لتفعيل التعديل المباشر المزدوج في الخانات المالية ل.س/$ */
  moneyRate?: number
  /** عند تزويده، يتجاوز النقر المزدوج الافتراضي (التعديل المباشر) ويستدعي هذا الإجراء */
  onRowDoubleClick?: (row: T) => void
}

function parseCellValue(col: Col<unknown>, v: unknown): unknown {
  if (v === null || v === undefined) return ''
  if (col.type === 'number' || col.type === 'money') return Number.isFinite(Number(v)) ? Number(v) : v
  return String(v)
}

export default function DataGrid<T>({
  rows,
  cols,
  rowKey,
  canEdit,
  onSave,
  actions,
  toolbar,
  emptyText,
  className,
  moneyRate,
  onRowDoubleClick
}: DataGridProps<T>): React.JSX.Element {
  const [editKey, setEditKey] = useState<number | string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const editableKey = (c: Col<T>): boolean => c.type !== 'display'

  const editableCols = cols.filter(editableKey)
  const editableKeys = editableCols.map((c) => c.key)

  const startEdit = (row: T): void => {
    if (!canEdit || editKey !== null) return
    setErr('')
    const d: Record<string, string> = {}
    for (const c of editableCols) {
      const v = (row as Record<string, unknown>)[c.key]
      d[c.key] = v === null || v === undefined ? '' : String(v)
    }
    setDraft(d)
    setEditKey(rowKey(row))
  }

  const commit = async (): Promise<void> => {
    if (editKey === null) return
    setSaving(true)
    setErr('')
    const patch: Record<string, unknown> = {}
    for (const c of editableCols) {
      patch[c.key] = parseCellValue(c as Col<unknown>, draft[c.key])
    }
    try {
      await onSave(editKey, patch)
      setEditKey(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const cancel = (): void => {
    setEditKey(null)
    setErr('')
  }

  const cellContent = (row: T, col: Col<T>): ReactNode => {
    if (editKey !== rowKey(row) && col.render) return col.render(row)
    const raw = (row as Record<string, unknown>)[col.key]
    const value = raw === null || raw === undefined ? '' : String(raw)
    if (editKey !== rowKey(row)) {
      const n = Number(raw)
      if (col.type === 'money') {
        if (!Number.isFinite(n)) return <span className="amount-lbp">—</span>
        const r = moneyRate ?? 0
        return (
          <div className="money-cell">
            <div className="amount-lbp">{fmt(n)} ل.س</div>
            {r > 0 && <div className="amount-usd">{(n / r).toFixed(2)} $</div>}
          </div>
        )
      }
      if (col.type === 'number') return <span>{Number.isFinite(n) ? fmt(n) : '—'}</span>
      return value || '—'
    }

    switch (col.type) {
      case 'number':
      case 'money': {
        if (col.type === 'money' && (moneyRate ?? 0) > 0) {
          const dv = draft[col.key] ?? ''
          const usdKey = `${col.key}__usd`
          const usdDraft = draft[usdKey] ?? (dv !== '' && Number.isFinite(Number(dv)) ? Number((Number(dv) / moneyRate!).toFixed(2)).toString() : '')
          return (
            <div className="inline-dual">
              <input
                type="number"
                step="1"
                min={0}
                className="inline-input"
                dir="ltr"
                value={dv}
                onChange={(e) => {
                  const next = { ...draft, [col.key]: e.target.value }
                  if (draft[usdKey] !== undefined) delete next[usdKey]
                  setDraft(next)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commit()
                  if (e.key === 'Escape') cancel()
                }}
                autoFocus
              />
              <span className="dual-unit">ل.س</span>
              <span className="dual-arrow">{'⟷'}</span>
              <input
                type="number"
                step="0.01"
                min={0}
                className="inline-input"
                dir="ltr"
                value={usdDraft}
                onChange={(e) => {
                  const u = toLatinDigits(e.target.value.trim())
                  setDraft({ ...draft, [col.key]: u !== '' && Number.isFinite(Number(u)) ? String(Math.round(Number(u) * moneyRate!)) : '', [usdKey]: u })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commit()
                  if (e.key === 'Escape') cancel()
                }}
              />
              <span className="dual-unit">$</span>
            </div>
          )
        }
        return (
          <input
            type="number" dir="ltr" inputMode="decimal"
            className="inline-input"
            value={draft[col.key] ?? ''}
            onChange={(e) => setDraft({ ...draft, [col.key]: toLatinDigits(e.target.value) })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit()
              if (e.key === 'Escape') cancel()
            }}
            autoFocus
          />
        )
      }
      case 'date':
        return (
          <input
            type="date"
            className="inline-input"
            value={draft[col.key] ?? ''}
            onChange={(e) => setDraft({ ...draft, [col.key]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit()
              if (e.key === 'Escape') cancel()
            }}
          />
        )
      case 'select':
        return (
          <select
            className="inline-input"
            value={draft[col.key] ?? ''}
            onChange={(e) => setDraft({ ...draft, [col.key]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit()
              if (e.key === 'Escape') cancel()
            }}
          >
            {col.options?.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        )
      default:
        return (
          <input
            type="text"
            className="inline-input"
            value={draft[col.key] ?? ''}
            onChange={(e) => setDraft({ ...draft, [col.key]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit()
              if (e.key === 'Escape') cancel()
            }}
            autoFocus
          />
        )
    }
  }

  return (
    <div className={`table-wrap ${className ?? ''}`}>
      {toolbar && <div className="table-toolbar">{toolbar}</div>}
      {err && <div className="inline-err">{err}</div>}
      <table className="data">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
            {actions && <th style={{ width: 150 }}>إجراءات</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length + (actions ? 1 : 0)}>
                <Empty text={emptyText ?? 'لا توجد بيانات'} />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const editing = editKey === rowKey(row)
              const handleDoubleClick = (row: T): void => {
                if (onRowDoubleClick) onRowDoubleClick(row)
                else startEdit(row)
              }
              const rowTitle = onRowDoubleClick
                ? 'انقر نقراً مزدوجاً لفتح الملف'
                : canEdit
                  ? 'انقر نقراً مزدوجاً للتعديل المباشر'
                  : undefined
              return (
                <tr key={String(rowKey(row))} className={editing ? 'editable-row' : ''} onDoubleClick={() => handleDoubleClick(row)} title={rowTitle}>
                  {cols.map((c) => (
                    <td key={c.key}>
                      {editing && editableKeys.includes(c.key) ? cellContent(row, c) : cellContent(row, c)}
                    </td>
                  ))}
                  {actions && (
                    <td>
                      <div className="row-actions">
                        {!editing && (
                          <button className="soft small" onClick={() => startEdit(row)} title="تعديل مباشر">
                            ✏️
                          </button>
                        )}
                        {actions(row, editing, () => startEdit(row))}
                        {editing && (
                          <>
                            <button className="soft small" onClick={() => void commit()} disabled={saving}>
                              {saving ? 'جاري...' : 'حفظ'}
                            </button>
                            <button className="ghost small" onClick={cancel}>
                              إلغاء
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}