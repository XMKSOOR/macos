import { app, shell } from 'electron'
import { createServer } from 'node:http'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { backupDatabase, getDb, replaceDbFrom } from './db'
import { getSettings, saveSettings } from './db'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const UPLOAD_HOST = 'https://www.googleapis.com/upload/drive/v3/files'
const DRIVE_HOST = 'https://www.googleapis.com/drive/v3'
const FOLDER_NAME = 'DentalClinic-DB'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

interface Tokens {
  access_token?: string
  refresh_token?: string
  expiry?: number
}

function getTokensRaw(s = getSettings()): Tokens {
  try {
    return (JSON.parse(s.drive_tokens ?? '{}') as Tokens) ?? {}
  } catch {
    return {}
  }
}

async function saveTokens(t: Tokens): Promise<void> {
  await saveSettings({ drive_tokens: JSON.stringify(t) })
}

function configured(): { client_id: string; client_secret: string } | null {
  const s = getSettings()
  return s.drive_client_id && s.drive_client_secret
    ? { client_id: s.drive_client_id.trim(), client_secret: s.drive_client_secret.trim() }
    : null
}

async function refreshAccessToken(cfg: { client_id: string; client_secret: string }, tokens: Tokens): Promise<string> {
  if (tokens.access_token && tokens.expiry && tokens.expiry > Date.now() + 60000) return tokens.access_token
  if (!tokens.refresh_token) throw new Error('لا يوجد رمز تحديث — أعد ربط الحساب')
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    })
  })
  const data = (await resp.json()) as { access_token?: string; expires_in?: number; error?: string }
  if (!data.access_token) throw new Error('فشل تحديث الرمز: ' + (data.error ?? 'خطأ'))
  const next: Tokens = { ...tokens, access_token: data.access_token, expiry: Date.now() + (data.expires_in ?? 3600) * 1000 }
  await saveTokens(next)
  return data.access_token
}

async function authHeaders(): Promise<Record<string, string>> {
  const cfg = configured()
  if (!cfg) throw new Error('أدخل بيانات التطبيق (Client ID / Secret) أولاً')
  const token = await refreshAccessToken(cfg, getTokensRaw())
  return { Authorization: `Bearer ${token}` }
}

export async function driveStartAuth(): Promise<string> {
  const cfg = configured()
  if (!cfg) throw new Error('أدخل بيانات التطبيق أولاً')
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as { port: number }).port
  const redirectUri = `http://localhost:${port}/`
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: cfg.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent'
  })}`

  const code = await new Promise<string>((resolve, reject) => {
    server.once('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      const c = url.searchParams.get('code')
      const err = url.searchParams.get('error')
      if (c) {
        res.end('<h2 style="font-family:sans-serif;direction:rtl">تم الربط بنجاح! يمكنك إغلاق هذه النافذة.</h2>')
        resolve(c)
      } else {
        res.end('<h2 style="font-family:sans-serif;direction:rtl">فشل الربط</h2>')
        reject(new Error('لم يتم الحصول على رمز التفويض: ' + (err ?? '')))
      }
    })
    void shell.openExternal(authUrl)
  })
  await new Promise<void>((r) => server.close(() => r()))

  const body = new URLSearchParams({ code, client_id: cfg.client_id, client_secret: cfg.client_secret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  const resp = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const data = (await resp.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }
  if (!data.access_token) throw new Error('فشل التبادل: ' + (data.error ?? 'خطأ'))
  await saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000
  })
  return 'تم ربط Google Drive بنجاح'
}

async function findFolder(headers: Record<string, string>): Promise<string | undefined> {
  const resp = await fetch(
    `${DRIVE_HOST}/files?q=${encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)&spaces=drive`,
    { headers }
  )
  const data = (await resp.json()) as { files?: { id: string }[] }
  return data.files?.[0]?.id
}

async function createFolder(headers: Record<string, string>): Promise<string> {
  const resp = await fetch(`${DRIVE_HOST}/files?fields=id`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  })
  const data = (await resp.json()) as { id?: string; error?: { message?: string } }
  if (!data.id) throw new Error(data.error?.message ?? 'فشل إنشاء المجلد')
  return data.id
}

async function findFile(folderId: string, name: string, headers: Record<string, string>): Promise<string | undefined> {
  const resp = await fetch(`${DRIVE_HOST}/files?q=${encodeURIComponent(`'${folderId}' in parents and name='${name}' and trashed=false`)}&fields=files(id)`, {
    headers
  })
  const data = (await resp.json()) as { files?: { id: string }[] }
  return data.files?.[0]?.id
}

async function ensureFile(headers: Record<string, string>, folderId: string, fileName: string, mime: string): Promise<string> {
  const existing = await findFile(folderId, fileName, headers)
  if (existing) return existing
  const resp = await fetch(`${DRIVE_HOST}/files?fields=id`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: fileName, mimeType: mime, parents: [folderId] })
  })
  const d = (await resp.json()) as { id?: string }
  if (!d.id) throw new Error('فشل إنشاء ملف في درايف')
  return d.id
}

async function uploadBytes(headers: Record<string, string>, fileId: string, buf: Buffer): Promise<void> {
  const resp = await fetch(`${UPLOAD_HOST}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    body: buf
  })
  if (!resp.ok) throw new Error('فشل الرفع: ' + resp.status)
}

function createSnapshot(): Buffer {
  const tmp = join(app.getPath('temp'), `clinic-snapshot-${Date.now()}.db`)
  backupDatabase(tmp)
  const buf = readFileSync(tmp)
  try {
    unlinkSync(tmp)
  } catch {
    /* ignore */
  }
  return buf
}

export async function driveUpload(): Promise<string> {
  const headers = await authHeaders()
  const folderId = (await findFolder(headers)) ?? (await createFolder(headers))
  const buf = createSnapshot()
  await uploadBytes(headers, await ensureFile(headers, folderId, 'clinic.db', 'application/vnd.sqlite3'), buf)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await uploadBytes(headers, await ensureFile(headers, folderId, `backup-${stamp}.db`, 'application/vnd.sqlite3'), buf)
  return 'تم رفع النسخة إلى Google Drive'
}

export async function driveDownload(): Promise<string> {
  const headers = await authHeaders()
  const folderId = await findFolder(headers)
  if (!folderId) throw new Error('لا يوجد مجلد بيانات في الحساب')
  const id = await findFile(folderId, 'clinic.db', headers)
  if (!id) throw new Error('لا توجد نسخة مرفوعة على الحساب')
  const resp = await fetch(`${DRIVE_HOST}/files/${id}?alt=media`, { headers })
  if (!resp.ok) throw new Error('فشل التنزيل: ' + resp.status)
  const tmp = join(app.getPath('temp'), `clinic-download-${Date.now()}.db`)
  writeFileSync(tmp, Buffer.from(await resp.arrayBuffer()))
  replaceDbFrom(tmp)
  try {
    unlinkSync(tmp)
  } catch {
    /* ignore */
  }
  return 'تم تنزيل آخر نسخة من Google Drive واستبدال قاعدة البيانات'
}

export async function driveStatus(): Promise<{ connected: boolean; config: boolean }> {
  const cfg = configured()
  return { connected: !!getTokensRaw().access_token, config: !!cfg }
}

export async function driveClear(): Promise<void> {
  await saveTokens({})
  return undefined
}

export async function driveSyncOnQuit(): Promise<void> {
  const s = getSettings()
  if ((s.drive_auto ?? '0') === '1' && configured() && getTokensRaw().access_token) {
    try {
      await driveUpload()
    } catch {
      /* best effort */
    }
  }
}

export async function drivePullOnStart(): Promise<void> {
  const s = getSettings()
  if ((s.drive_auto ?? '0') !== '1' || !configured() || !getTokensRaw().access_token) return
  if (process.env['SKIP_SYNC'] === '1') return
  let empty = false
  try {
    const r = getDb().prepare('SELECT COUNT(*) AS c FROM settings').get() as { c: number }
    empty = Number(r?.c ?? 0) === 0
  } catch {
    empty = true
  }
  if (!empty) return
  try {
    const headers = await authHeaders()
    const folderId = await findFolder(headers)
    if (!folderId) return
    const id = await findFile(folderId, 'clinic.db', headers)
    if (!id) return
    const resp = await fetch(`${DRIVE_HOST}/files/${id}?alt=media`, { headers })
    if (!resp.ok) return
    const tmp = join(app.getPath('temp'), `clinic-auto-${Date.now()}.db`)
    writeFileSync(tmp, Buffer.from(await resp.arrayBuffer()))
    replaceDbFrom(tmp)
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  } catch {
    /* keep local on failure */
  }
}