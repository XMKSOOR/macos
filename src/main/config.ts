import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface AppConfig {
  db_path?: string
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function getConfig(): AppConfig {
  try {
    const p = configPath()
    if (!existsSync(p)) return {}
    return JSON.parse(readFileSync(p, 'utf-8')) as AppConfig
  } catch {
    return {}
  }
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const cfg = { ...getConfig(), ...patch }
  const p = configPath()
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf-8')
  return cfg
}

export function dataDir(): string {
  const cfg = getConfig()
  if (cfg.db_path) return cfg.db_path
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function dbFilePath(): string {
  return join(dataDir(), 'clinic.db')
}

export function listBackupFiles(): string[] {
  return []
}