import { useEffect, useRef, useState } from 'react'
import { Modal, useToast } from './ui'
import type { SheetSchemaKey } from './lib'

/** تصدير صفوف محدَّدة إلى Excel مباشرة (يُستخدم للأعمال الجماعية). */
export function exportNow(
  title: string,
  schema: SheetSchemaKey,
  rows: Record<string, string | number>[]
): Promise<string | null> {
  return window.clinic.files.export({ defaultName: title, sheets: [{ name: title, schemaKey: schema, rows }] })
}

interface ExcelBarProps {
  schema: SheetSchemaKey
  title: string
  buildRows: () => Record<string, string | number>[]
  onImportRows?: (rows: Record<string, string>[]) => Promise<{ ok: number; updated?: number; skip: number }>
}

/** دمج الصفوف ذات الاسم نفسه في الملف الوارد حتى لا يُكرَّر الصنف الواحد مرتين. */
function dedupeRows(rows: Record<string, string>[]): Record<string, string>[] {
  const order: string[] = []
  const map = new Map<string, Record<string, string>>()
  let anon = 0
  for (const r of rows) {
    const name = String(r.name ?? '').trim()
    const key = name === '' ? `\u0000${anon++}` : name
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...r })
      order.push(key)
      continue
    }
    for (const [k, v] of Object.entries(r)) {
      if (v !== '' && v != null) prev[k] = v
    }
  }
  return order.map((k) => map.get(k) as Record<string, string>)
}

export default function ExcelBar({ schema, title, buildRows, onImportRows }: ExcelBarProps): React.JSX.Element {
  const toast = useToast()
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [importing, setImporting] = useState(false)
  const dragRef = useRef<{ start: number; mode: boolean } | null>(null)

  useEffect(() => {
    const onUp = (): void => {
      dragRef.current = null
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [])

  const closePreview = (): void => {
    setPreview([])
    setSelected(new Set())
    setConfirming(false)
    dragRef.current = null
  }

  const doExport = (): void => {
    window.clinic.files
      .export({ defaultName: title, sheets: [{ name: title, schemaKey: schema, rows: buildRows() }] })
      .then((p) => {
        if (p) toast('تم التصدير: ' + p, 'success')
      })
      .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
  }

  const doTemplate = (): void => {
    window.clinic.files
      .template(schema)
      .then((p) => {
        if (p) toast('تم حفظ النموذج: ' + p, 'success')
      })
      .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
  }

  const doPick = async (): Promise<void> => {
    try {
      const rows = await window.clinic.files.import(schema)
      if (rows) {
        const clean = dedupeRows(rows)
        setPreview(clean)
        setSelected(new Set(clean.map((_, i) => i)))
        setConfirming(false)
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const allSelected = preview.length > 0 && selected.size === preview.length

  const toggleAll = (): void => {
    setSelected(allSelected ? new Set() : new Set(preview.map((_, i) => i)))
  }

  const toggleRow = (i: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const applyRange = (a: number, b: number, mode: boolean): void => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    setSelected((prev) => {
      const next = new Set(prev)
      for (let k = lo; k <= hi; k++) {
        if (mode) next.add(k)
        else next.delete(k)
      }
      return next
    })
  }

  const onRowDown = (i: number): void => {
    const mode = !selected.has(i)
    dragRef.current = { start: i, mode }
    applyRange(i, i, mode)
  }

  const onRowEnter = (i: number): void => {
    const d = dragRef.current
    if (!d) return
    applyRange(d.start, i, d.mode)
  }

  const selectedRows = preview.filter((_, i) => selected.has(i))

  const confirmImport = (): void => {
    if (!onImportRows) return
    setImporting(true)
    onImportRows(selectedRows)
      .then((res) => {
        const parts = [`${res.ok} إضافة`]
        if (res.updated) parts.push(`${res.updated} تحديث`)
        if (res.skip) parts.push(`${res.skip} تخطّي`)
        toast(`تم الاستيراد: ${parts.join('، ')}`, 'success')
        closePreview()
      })
      .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
      .finally(() => setImporting(false))
  }

  const columns = Object.keys(preview[0] ?? {})

  return (
    <>
      <button className="ghost small" title="تصدير البيانات إلى Excel" onClick={doExport}>
        ⬆ تصدير Excel
      </button>
      {onImportRows && (
        <button className="ghost small" title="استيراد من ملف Excel" onClick={() => void doPick()}>
          ⬇ استيراد
        </button>
      )}
      {onImportRows && (
        <button className="ghost small" title="نموذج للتعبئة خارجياً ثم استيراده" onClick={doTemplate}>
          📄 نموذج
        </button>
      )}

      {preview.length > 0 && (
        <Modal
          title={`معاينة الاستيراد (${title}) — ${selected.size} من ${preview.length} محدَّد`}
          onClose={closePreview}
          wide
          footer={
            confirming ? (
              <>
                <span className="muted" style={{ marginInlineEnd: 'auto', fontSize: 13 }}>
                  سيتم استيراد {selectedRows.length} صف؛ المطابق بالأسماء يُحدَّث ولا يُكرَّر.
                </span>
                <button onClick={confirmImport} disabled={importing || selectedRows.length === 0}>
                  {importing ? 'جاري الاستيراد...' : 'تأكيد الاستيراد'}
                </button>
                <button className="ghost" onClick={() => setConfirming(false)} disabled={importing}>
                  رجوع
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setConfirming(true)} disabled={selectedRows.length === 0}>
                  استيراد المحدَّد ({selectedRows.length})
                </button>
                <button className="ghost" onClick={closePreview}>
                  إلغاء
                </button>
              </>
            )
          }
        >
          <div className="import-preview table-wrap" onDragStart={(e) => e.preventDefault()}>
            <table className="data selectable">
              <thead>
                <tr>
                  <th className="sel-col" onClick={toggleAll} title="تحديد الكل / إلغاء الكل">
                    <input type="checkbox" checked={allSelected} readOnly tabIndex={-1} style={{ pointerEvents: 'none' }} />
                  </th>
                  {columns.map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => {
                  const on = selected.has(i)
                  return (
                    <tr
                      key={i}
                      className={on ? 'row-on' : ''}
                      onMouseDown={() => onRowDown(i)}
                      onMouseEnter={() => onRowEnter(i)}
                    >
                      <td className="sel-col">
                        <input type="checkbox" checked={on} readOnly tabIndex={-1} style={{ pointerEvents: 'none' }} />
                      </td>
                      {columns.map((k) => (
                        <td key={k}>{r[k] === '' || r[k] == null ? '—' : r[k]}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            انقر صفاً لتحديده/إلغائه، أو اسحب بالماوس لتحديد مجموعة. تحديد الكل مُفعَّل افتراضياً.
          </p>
        </Modal>
      )}
    </>
  )
}
