import { app } from 'electron'
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'

/**
 * حراسة نسخة واحدة موثوقة لا تعتمد على قفل Electron:
 * إنشاء ذرّي (exclusive 'wx') لملف الحارس + نبضة دورية + التحقق من حياة العملية (PID).
 *
 * الغرض: بجوار تنظيف قفل قاعدة البيانات القديم `<db>.lock`، نضمن أنّه لا توجد نسخة
 * أخرى حيّة تكتب على القاعدة، حتى لا نزيل قفلاً فعّالاً لنسخة قيد التشغيل.
 */

const HEARTBEAT_MS = 5000
const STALE_MS = 60000

let timer: ReturnType<typeof setInterval> | null = null
let guardPath = ''

function isAlive(pid: number): boolean {
  if (!pid || pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readGuard(): { pid: number; ts: number } | null {
  try {
    const raw = readFileSync(guardPath, 'utf8')
    const g = JSON.parse(raw)
    if (typeof g?.pid === 'number' && typeof g?.ts === 'number') return g
  } catch {
    /* لا يوجد ملف حارس صالح */
  }
  return null
}

/** يعيد true إذا كانت هذه هي النسخة الوحيدة المسموح لها بالإقلاع. */
export function acquireSingleInstance(): boolean {
  guardPath = join(app.getPath('userData'), 'app-instance.lock')
  const payload = (): string => JSON.stringify({ pid: process.pid, ts: Date.now() })

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(guardPath, 'wx')
      writeSync(fd, payload())
      closeSync(fd)
      timer = setInterval(() => {
        try {
          writeFileSync(guardPath, payload())
        } catch {
          /* تجاهل */
        }
      }, HEARTBEAT_MS)
      timer.unref?.()
      return true
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return true
      const g = readGuard()
      const live = g !== null && isAlive(g.pid) && Date.now() - g.ts < STALE_MS
      if (live) return false
      try {
        unlinkSync(guardPath)
      } catch {
        return false
      }
    }
  }
  return false
}

export function releaseSingleInstance(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  try {
    unlinkSync(guardPath)
  } catch {
    /* لا يوجد ملف */
  }
}
