import * as XLSX from 'xlsx'
import { dialog } from 'electron'
import { readFileSync } from 'node:fs'
import { SHEET_SCHEMAS, type SheetExportRequest, type SheetSchema, type SheetSchemaKey } from '../shared/types'
import { getSettings } from './db'

const EXTRA_HEADERS: Record<string, string> = {
  price_usd: 'السعر ($)',
  cost_usd: 'الكلفة ($)',
  amount_usd: 'المبلغ ($)',
  margin: 'الهامش',
  bom: 'المكونات',
  patient_name: 'المريض',
  invoice_no: 'الرقم'
}

function schemaOf(key: SheetSchemaKey): SheetSchema {
  const s = SHEET_SCHEMAS.find((x) => x.key === key)
  if (!s) throw new Error('قالب غير معروف')
  return s
}

function iso(v: unknown): string {
  return String(v ?? '')
}

function toCell(v: unknown): unknown {
  if (Object.prototype.toString.call(v) === '[object Date]') return iso(v)
  return v
}

function headerFor(key: string, schemaKey?: SheetSchemaKey): string {
  if (schemaKey) {
    const s = schemaOf(schemaKey)
    const col = s.cols.find((c) => c.key === key && !c.usd)
    if (col) return col.header
    const extra = EXTRA_HEADERS[key]
    if (extra) return extra
  }
  return key
}

export async function exportWorkbook(req: SheetExportRequest): Promise<string | null> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'تصدير إلى Excel',
    defaultPath: req.defaultName.endsWith('.xlsx') ? req.defaultName : `${req.defaultName}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  if (canceled || !filePath) return null
  const book = XLSX.utils.book_new()
  for (const sheet of req.sheets) {
    const headers = Object.keys(sheet.rows[0] ?? {}).map((k) => headerFor(k, sheet.schemaKey))
    const rows: Record<string, unknown>[] = []
    for (const r of sheet.rows) {
      const o: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r)) o[headerFor(k, sheet.schemaKey)] = toCell(v)
      rows.push(o)
    }
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
    ws['!cols'] = headers.map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(book, ws, (sheet.name || 'Sheet1').slice(0, 31))
  }
  const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(filePath, buf)
  return filePath
}

export async function exportTemplate(key: SheetSchemaKey): Promise<string | null> {
  const s = schemaOf(key)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'حفظ نموذج الاستيراد',
    defaultPath: `نموذج-${s.label}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  if (canceled || !filePath) return null
  const book = XLSX.utils.book_new()
  const headers = s.cols.map((c) => c.header)
  const sampleRow: Record<string, string> = {}
  for (const c of s.cols) sampleRow[c.header] = c.sample ?? ''
  const ws = XLSX.utils.json_to_sheet([sampleRow], { header: headers })
  ws['!cols'] = headers.map(() => ({ wch: 24 }))
  XLSX.utils.book_append_sheet(book, ws, s.label)
  const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(filePath, buf)
  return filePath
}

function normHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .replace(/[،,;؛]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

type Matcher = { col: SheetSchema['cols'][number]; key: string; usd: boolean; norm: string[] }

function buildMatchers(s: SheetSchema): Matcher[] {
  const out: Matcher[] = []
  for (const col of s.cols) {
    const cands = [col.header, col.key, ...(col.aliases ?? [])]
    out.push({ col, key: col.key, usd: !!col.usd, norm: cands.map(normHeader) })
  }
  return out
}

export async function importFile(key: SheetSchemaKey): Promise<Record<string, string>[] | null> {
  const s = schemaOf(key)
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'استيراد من Excel',
    properties: ['openFile'],
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }]
  })
  if (canceled || filePaths.length === 0) return null
  const buf = readFileSync(filePaths[0])
  const book = XLSX.read(buf, { type: 'buffer' })
  const first = book.Sheets[book.SheetNames[0]]
  if (!first) throw new Error('الملف لا يحتوي على أوراق')
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(first, { defval: '' })
  const matchers = buildMatchers(s)
  const rate = getSettings().usd_rate || 0
  const out: Record<string, string>[] = []
  for (const row of raw) {
    const o: Record<string, string> = {}
    for (const [header, val] of Object.entries(row)) {
      const nh = normHeader(String(header))
      const m = matchers.find((x) => x.norm.includes(nh))
      if (!m) continue
      const rawVal = String(val).trim()
      const numeric = Number(rawVal)
      if (m.usd && Number.isFinite(numeric) && rate > 0) {
        o[m.key] = String(Math.round(numeric * rate))
      } else {
        o[m.key] = rawVal
      }
    }
    out.push(o)
  }
  return out
}