import { useState } from 'react'
import { Modal, useToast } from './ui'
import type { SheetSchemaKey } from './lib'

interface ExcelBarProps {
  schema: SheetSchemaKey
  title: string
  buildRows: () => Record<string, string | number>[]
  onImportRows?: (rows: Record<string, string>[]) => Promise<{ ok: number; updated?: number; skip: number }>
}

export default function ExcelBar({ schema, title, buildRows, onImportRows }: ExcelBarProps): React.JSX.Element {
  const toast = useToast()
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [importing, setImporting] = useState(false)

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
      if (rows) setPreview(rows)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const confirmImport = (): void => {
    if (!onImportRows) return
    setImporting(true)
    onImportRows(preview)
      .then((res) => {
        const parts = [`${res.ok} إضافة`]
        if (res.updated) parts.push(`${res.updated} تحديث`)
        if (res.skip) parts.push(`${res.skip} تخطّي`)
        toast(`تم الاستيراد: ${parts.join('، ')}`, 'success')
        setPreview([])
      })
      .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
      .finally(() => setImporting(false))
  }

  return (
    <>
      <button className="ghost small" title="تصدير البيانات إلى Excel" onClick={doExport}>
        ⬇ تصدير Excel
      </button>
      {onImportRows && (
        <button className="ghost small" title="استيراد من ملف Excel" onClick={() => void doPick()}>
          ⬆ استيراد
        </button>
      )}
      {onImportRows && (
        <button className="ghost small" title="نموذج للتعبئة خارجياً ثم استيراده" onClick={doTemplate}>
          📄 نموذج
        </button>
      )}

      {preview.length > 0 && (
        <Modal
          title={`معاينة الاستيراد (${title}) — ${preview.length} صف`}
          onClose={() => setPreview([])}
          wide
          footer={
            <>
              <button onClick={confirmImport} disabled={importing}>
                {importing ? 'جاري الاستيراد...' : 'استيراد الآن'}
              </button>
              <button className="ghost" onClick={() => setPreview([])}>
                إلغاء
              </button>
            </>
          }
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {Object.keys(preview[0] ?? {}).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    {Object.values(r).map((v, j) => (
                      <td key={j}>{v === '' ? '—' : v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 12 && (
            <p className="muted mt-8" style={{ fontSize: 12 }}>
              ... وعرض أول 12 صفاً فقط
            </p>
          )}
        </Modal>
      )}
    </>
  )
}