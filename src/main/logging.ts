import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * تسجيل دائم إلى ملف داخل مجلد بيانات المستخدم، لأن النسخ المثبّتة (خصوصاً على ماك)
 * لا تُظهر مخرجات الطرفية. يفيد في تشخيص مشاكل المزامنة والاتصال بقاعدة البيانات.
 */

const MAX_BYTES = 2 * 1024 * 1024

let logFile = ''

function file(): string {
  if (logFile) return logFile
  try {
    const dir = join(app.getPath('userData'), 'logs')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    logFile = join(dir, 'app.log')
    try {
      if (existsSync(logFile) && statSync(logFile).size > MAX_BYTES) {
        renameSync(logFile, join(dir, 'app.old.log'))
      }
    } catch {
      /* تجاهل */
    }
  } catch {
    logFile = ''
  }
  return logFile
}

export function logPath(): string {
  return file()
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Error) return v.stack || v.message
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function write(tag: string, args: unknown[]): void {
  const p = file()
  if (!p) return
  const text = `[${new Date().toISOString()}] [${tag}] ${args.map(fmt).join(' ')}\n`
  try {
    appendFileSync(p, text)
  } catch {
    /* تجاهل */
  }
}

/** ينسخ مخرجات الطرفية إلى ملف السجل حتى نرى سجل المزامنة في النسخ المثبّتة. */
export function installFileLogging(): void {
  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = (...a: unknown[]): void => {
    write('log', a)
    orig.log(...a)
  }
  console.warn = (...a: unknown[]): void => {
    write('warn', a)
    orig.warn(...a)
  }
  console.error = (...a: unknown[]): void => {
    write('error', a)
    orig.error(...a)
  }
}

export function logEnvDiagnostics(resourcesPath: string): void {
  const envFile = join(resourcesPath, 'app.env')
  const has = existsSync(envFile)
  const url = (process.env['SUPABASE_URL'] ?? '').trim()
  const key = (process.env['SUPABASE_SECRET_KEY'] ?? process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '').trim()
  write('env', [
    `resourcesPath=${resourcesPath}`,
    `app.env=${has ? 'موجود' : 'مفقود'}`,
    has ? `app.env.size=${(() => { try { return statSync(envFile).size } catch { return -1 } })()}` : '',
    `SUPABASE_URL=${url ? url : '(غير مضبوط)'}`,
    `SUPABASE_SECRET_KEY=${key ? 'مضبوط(len=' + key.length + ')' : '(غير مضبوط)'}`
  ])
}
