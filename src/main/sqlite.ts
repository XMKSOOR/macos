import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import * as ns from 'node-sqlite3-wasm'

type SqliteModule = typeof ns
const resolved = ((ns as { default?: SqliteModule }).default ?? ns) as SqliteModule
const WasmDatabase = resolved.Database

export type SqlValue = number | bigint | string | Uint8Array | null

export interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export type Row = Record<string, unknown>

export interface StatementSync {
  run(...params: SqlValue[]): RunResult
  get(...params: SqlValue[]): Row | undefined
  all(...params: SqlValue[]): Row[]
}

type Bindable = number | bigint | string | Uint8Array | null

const WAL_VERSION = 2
const LEGACY_VERSION = 1
const FORMAT_VERSION_OFFSET = 18

function normalize(params: SqlValue[]): Bindable[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null
    if (typeof p === 'boolean') return p ? 1 : 0
    return p as Bindable
  })
}

function readFormatVersion(dbPath: string): number {
  let fd: number | null = null
  try {
    fd = openSync(dbPath, 'r')
    const buf = Buffer.alloc(FORMAT_VERSION_OFFSET + 2)
    if (readSync(fd, buf, 0, buf.length, 0) < buf.length) return LEGACY_VERSION
    return Math.max(buf[FORMAT_VERSION_OFFSET], buf[FORMAT_VERSION_OFFSET + 1])
  } catch {
    return LEGACY_VERSION
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

function sidecarSize(dbPath: string, suffix: string): number {
  try {
    return statSync(dbPath + suffix).size
  } catch {
    return 0
  }
}

/**
 * محرك SQLite المُصرَّف إلى WebAssembly يفتقر دعم الذاكرة المشتركة (-shm)،
 * لذلك لا يستطيع فتح أي قاعدة بيانات في وضع WAL إطلاقاً.
 * نحوّلها إلى وضع journal التقليدي عبر ترويسة الملف، وهو تحويل بلا أي خسارة
 * ما دام ملف -wal فارغاً (لا توجد إطارات مُعتمدة لم تُدمج بعد في الملف الرئيسي).
 */
function convertWalToLegacy(dbPath: string): void {
  if (sidecarSize(dbPath, '-wal') > 0) {
    const stranded = dbPath + '-wal.unrecovered'
    try {
      unlinkSync(stranded)
    } catch {
      /* ignore */
    }
    try {
      renameSync(dbPath + '-wal', stranded)
    } catch {
      /* ignore */
    }
    throw new Error(
      'تعذّر فتح قاعدة البيانات: ملف WAL يحتوي على بيانات لم تُدمج بعد. ' +
        'تم حفظه باسم ' + stranded + '. ' +
        'افتح الإصدار القديم من البرنامج مرة واحدة حتى يتم دمج البيانات، ثم أعد تشغيل هذا الإصدار.'
    )
  }

  const fd = openSync(dbPath, 'r+')
  try {
    writeSync(fd, Buffer.from([LEGACY_VERSION, LEGACY_VERSION]), 0, 2, FORMAT_VERSION_OFFSET)
  } finally {
    closeSync(fd)
  }

  for (const suffix of ['-wal', '-shm']) {
    try {
      unlinkSync(dbPath + suffix)
    } catch {
      /* ignore */
    }
  }
}

export class DatabaseSync {
  private readonly d: ns.Database

  constructor(path: string) {
    if (existsSync(path) && readFormatVersion(path) === WAL_VERSION) convertWalToLegacy(path)
    this.d = new WasmDatabase(path)
  }

  exec(sql: string): void {
    this.d.exec(sql)
  }

  close(): void {
    if (this.d.isOpen) this.d.close()
  }

  prepare(sql: string): StatementSync {
    const d = this.d
    return {
      run(...params: SqlValue[]): RunResult {
        const info = d.run(sql, normalize(params))
        return { changes: info.changes, lastInsertRowid: info.lastInsertRowid }
      },
      get(...params: SqlValue[]): Row | undefined {
        const row = d.get(sql, normalize(params))
        return (row ?? undefined) as Row | undefined
      },
      all(...params: SqlValue[]): Row[] {
        return d.all(sql, normalize(params)) as Row[]
      }
    }
  }

  setJournalMode(mode: 'WAL' | 'DELETE'): void {
    try {
      this.d.exec(`PRAGMA journal_mode = ${mode}`)
    } catch {
      this.d.exec('PRAGMA journal_mode = DELETE')
    }
  }

  enableForeignKeys(): void {
    this.d.exec('PRAGMA foreign_keys = ON')
  }
}
