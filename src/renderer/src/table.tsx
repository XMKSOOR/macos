import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Confirm, Empty } from './ui'
import { SearchSelect } from './SearchSelect'
import { fmt, sanitizeNumberInput } from './lib'

/** يركّز الحقل دون أن يقوم المتصفح بالتمرير إليه (تفادي حركة الجدول). */
function focusNoScroll(el: HTMLInputElement | null): void {
  if (el && !el.dataset.focused) {
    el.dataset.focused = '1'
    el.focus({ preventScroll: true })
  }
}

export interface Col<T> {
  key: string
  label: string
  type?: 'text' | 'number' | 'money' | 'date' | 'select' | 'display'
  options?: { value: string | number; label: string }[]
  render?: (row: T) => ReactNode
  width?: number
  /** فتح التعديل المباشر بنقرة واحدة على هذه الخانة */
  editOnClick?: boolean
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
  /** تثبيت عرض الأعمدة ومنع تحرّك الجدول عند الدخول في وضع التعديل */
  fixed?: boolean
  /** عند تزويده، يتجاوز النقر المزدوج الافتراضي (التعديل المباشر) ويستدعي هذا الإجراء */
  onRowDoubleClick?: (row: T) => void
  /** فترة الانتظار قبل الحفظ التلقائي أثناء الكتابة (بالملي ثانية). الافتراضي 700؛ 0 لتعطيل الحفظ التلقائي */
  autoSaveMs?: number
  /** إظهار عمود تحديد الصفوف مع «تحديد الكل» وإجراءات جماعية */
  selectable?: boolean
  /** حذف الصفوف المحدَّدة (يعرض زر «حذف المحدَّد» عند تزويده) */
  onBulkDelete?: (rows: T[]) => void | Promise<void>
  /** تصدير الصفوف المحدَّدة (يعرض زر «تصدير المحدَّد» عند تزويده) */
  onBulkExport?: (rows: T[]) => void
}

function parseCellValue(col: Col<unknown>, v: unknown): unknown {
  if (v === null || v === undefined) return ''
  if (col.type === 'number' || col.type === 'money') return Number.isFinite(Number(v)) ? Number(v) : v
  return String(v)
}

/** يقارن قيمة المُدخَل بالقيمة الأصلية لمعرفة إن كان الحقل قد تغيّر فعلاً */
function cellChanged(col: Col<unknown>, next: unknown, orig: unknown): boolean {
  if (col.type === 'number' || col.type === 'money') {
    const a = next === '' || next === null || next === undefined ? NaN : Number(next)
    const b = orig === '' || orig === null || orig === undefined ? NaN : Number(orig)
    if (Number.isNaN(a) && Number.isNaN(b)) return false
    return a !== b
  }
  const a = next === null || next === undefined ? '' : String(next)
  const b = orig === null || orig === undefined ? '' : String(orig)
  return a !== b
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
  fixed,
  onRowDoubleClick,
  autoSaveMs = 700,
  selectable,
  onBulkDelete,
  onBulkExport
}: DataGridProps<T>): React.JSX.Element {
  const [editKey, setEditKey] = useState<number | string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // تحديد الصفوف
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const headRef = useRef<HTMLInputElement>(null)

  // أحدث الحالات المطلوبة للحفظ التلقائي دون التعامل مع إغلاقات قديمة
  const latestRef = useRef({ editKey, draft, rows })
  latestRef.current = { editKey, draft, rows }
  const pendingRef = useRef<Set<string>>(new Set())
  const timerRef = useRef<number | null>(null)

  const keyOf = (r: T): string => String(rowKey(r))
  const selectedRows = rows.filter((r) => selected.has(keyOf(r)))
  const allSelected = rows.length > 0 && selectedRows.length === rows.length
  const someSelected = selectedRows.length > 0 && !allSelected

  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = someSelected
  }, [someSelected, allSelected, rows])

  const toggleRow = (r: T): void => {
    setSelected((s) => {
      const n = new Set(s)
      const k = keyOf(r)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }
  const toggleAll = (): void => {
    setSelected((s) => {
      if (rows.length > 0 && rows.every((r) => s.has(keyOf(r)))) return new Set()
      return new Set(rows.map(keyOf))
    })
  }
  const clearSel = (): void => setSelected(new Set())

  const doBulkDelete = async (): Promise<void> => {
    if (!onBulkDelete) return
    setBulkBusy(true)
    try {
      await onBulkDelete(selectedRows)
      clearSel()
    } finally {
      setBulkBusy(false)
      setBulkConfirm(false)
    }
  }

  const editableKey = (c: Col<T>): boolean => c.type !== 'display'

  const editableCols = cols.filter(editableKey)
  const editableKeys = editableCols.map((c) => c.key)

  const startEdit = (row: T): void => {
    if (!canEdit || editKey !== null) return
    setErr('')
    pendingRef.current.clear()
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const d: Record<string, string> = {}
    for (const c of editableCols) {
      const v = (row as Record<string, unknown>)[c.key]
      d[c.key] = v === null || v === undefined ? '' : String(v)
    }
    setDraft(d)
    setEditKey(rowKey(row))
  }

  /**
   * يحفظ في القاعدة فقط الحقول التي تغيّرت فعلاً (وليس الصف كاملاً) حتى لا
   * تُكتب فوق حقول أخرى. closeNow=false: الحفظ التلقائي دون إغلاق المحرر.
   */
  const commit = async (closeNow: boolean): Promise<void> => {
    const { editKey: ek, draft: d, rows: rs } = latestRef.current
    if (ek === null) return
    const row = rs.find((r) => rowKey(r) === ek)
    setSaving(true)
    setErr('')
    const patch: Record<string, unknown> = {}
    if (row) {
      for (const c of editableCols) {
        const next = parseCellValue(c as Col<unknown>, d[c.key])
        const orig = (row as Record<string, unknown>)[c.key]
        if (cellChanged(c as Col<unknown>, next, orig)) patch[c.key] = next
      }
    }
    if (Object.keys(patch).length === 0) {
      pendingRef.current.clear()
      if (closeNow || !row) setEditKey(null)
      setSaving(false)
      return
    }
    try {
      await onSave(ek, patch)
      pendingRef.current.clear()
      if (closeNow) setEditKey(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  const commitRef = useRef(commit)
  commitRef.current = commit

  // عند مغادرة الشاشة (أو إعادة تركيبها) نحفظ أي تعديل معلّق لم يُحفظ بعد
  // (وإلا يضيع ما كُتب خلال مدة الانتظار 700ms قبل الحفظ التلقائي).
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (pendingRef.current.size > 0) void commitRef.current(true)
    },
    []
  )

  /** جدولة الحفظ التلقائي لحقل تغيّر */
  const markChanged = (key: string): void => {
    if (!canEdit) return
    pendingRef.current.add(key)
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (autoSaveMs <= 0) return
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void commitRef.current(false)
    }, autoSaveMs)
  }

  /** حفظ فوري عند مغادرة الحقل إذا بقي تغيير غير محفوظ */
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const t = e.relatedTarget
    if (t instanceof Element && t.closest('tr.editable-row') && t !== e.currentTarget) return
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingRef.current.size > 0) void commitRef.current(false)
  }

  const cancel = (): void => {
    pendingRef.current.clear()
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
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
                type="text"
                inputMode="decimal"
                className="inline-input"
                dir="ltr"
                value={dv}
                ref={focusNoScroll}
                onChange={(e) => {
                  const clean = sanitizeNumberInput(e.target.value)
                  const next = { ...draft, [col.key]: clean }
                  if (draft[usdKey] !== undefined) delete next[usdKey]
                  setDraft(next)
                  markChanged(col.key)
                }}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRef.current(true)
                  if (e.key === 'Escape') cancel()
                }}
              />
              <span className="dual-unit">ل.س</span>
              <span className="dual-arrow">{'⟷'}</span>
              <input
                type="text"
                inputMode="decimal"
                className="inline-input"
                dir="ltr"
                value={usdDraft}
                onChange={(e) => {
                  const u = sanitizeNumberInput(e.target.value)
                  setDraft({ ...draft, [col.key]: u !== '' && Number.isFinite(Number(u)) ? String(Math.round(Number(u) * moneyRate!)) : '', [usdKey]: u })
                  markChanged(col.key)
                }}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRef.current(true)
                  if (e.key === 'Escape') cancel()
                }}
              />
              <span className="dual-unit">$</span>
            </div>
          )
        }
        return (
          <input
            type="text" dir="ltr" inputMode="decimal"
            className="inline-input"
            value={draft[col.key] ?? ''}
            ref={focusNoScroll}
            onChange={(e) => {
              setDraft({ ...draft, [col.key]: sanitizeNumberInput(e.target.value) })
              markChanged(col.key)
            }}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRef.current(true)
              if (e.key === 'Escape') cancel()
            }}
          />
        )
      }
      case 'date':
        return (
          <input
            type="date"
            className="inline-input"
            value={draft[col.key] ?? ''}
            onChange={(e) => {
              setDraft({ ...draft, [col.key]: e.target.value })
              markChanged(col.key)
            }}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRef.current(true)
              if (e.key === 'Escape') cancel()
            }}
          />
        )
      case 'select':
        return (
          <SearchSelect
            className="ss-grid"
            value={draft[col.key] ?? ''}
            onChange={(v) => {
              setDraft({ ...draft, [col.key]: v })
              markChanged(col.key)
            }}
            options={col.options ?? []}
          />
        )
      default:
        return (
          <input
            type="text"
            className="inline-input"
            value={draft[col.key] ?? ''}
            ref={focusNoScroll}
            onChange={(e) => {
              setDraft({ ...draft, [col.key]: e.target.value })
              markChanged(col.key)
            }}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRef.current(true)
              if (e.key === 'Escape') cancel()
            }}
          />
        )
    }
  }

  const showBulk = !!selectable && selected.size > 0

  return (
    <>
      <div className={`table-wrap ${className ?? ''}`}>
        {toolbar && <div className="table-toolbar">{toolbar}</div>}
        {err && <div className="inline-err">{err}</div>}
        <table className={`data ${fixed ? 'fixed-cols' : ''}`}>
          <thead>
            <tr>
              {selectable && (
                <th className="sel-col">
                  <input ref={headRef} type="checkbox" checked={allSelected} onChange={toggleAll} title="تحديد الكل" aria-label="تحديد الكل" />
                </th>
              )}
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
                <td colSpan={cols.length + (actions ? 1 : 0) + (selectable ? 1 : 0)}>
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
                  <tr key={keyOf(row)} className={editing ? 'editable-row' : ''} onDoubleClick={() => handleDoubleClick(row)} title={rowTitle}>
                    {selectable && (
                      <td
                        className="sel-col"
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(keyOf(row))}
                          onChange={() => toggleRow(row)}
                          aria-label="تحديد الصف"
                        />
                      </td>
                    )}
                    {cols.map((c) => (
                      <td key={c.key}>
                        {editing && editableKeys.includes(c.key) ? (
                          cellContent(row, c)
                        ) : c.editOnClick ? (
                          <div className="cell-click" onClick={() => startEdit(row)} title="انقر للتعديل">
                            {cellContent(row, c)}
                          </div>
                        ) : (
                          cellContent(row, c)
                        )}
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
                              <button className="soft small" onClick={() => void commitRef.current(true)} disabled={saving}>
                                {saving ? 'جاري...' : 'إنهاء'}
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

      {showBulk && (
        <div className="bulk-bar">
          <span className="bulk-count">المحدَّد: {selected.size}</span>
          {onBulkExport && (
            <button type="button" className="soft small" onClick={() => onBulkExport(selectedRows)}>
              ⬇ تصدير المحدَّد
            </button>
          )}
          {onBulkDelete && (
            <button type="button" className="danger small" onClick={() => setBulkConfirm(true)}>
              حذف المحدَّد
            </button>
          )}
          <button type="button" className="ghost small" onClick={clearSel}>
            إلغاء التحديد
          </button>
        </div>
      )}

      {bulkConfirm && onBulkDelete && (
        <Confirm
          title="حذف المحدَّد"
          message={bulkBusy ? 'جارٍ الحذف...' : `هل تريد حذف ${selected.size} صف من الصفوف المحدَّدة؟ لا يمكن التراجع.`}
          onConfirm={() => void doBulkDelete()}
          onClose={() => setBulkConfirm(false)}
        />
      )}
    </>
  )
}
