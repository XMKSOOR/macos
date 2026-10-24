import { neonConfig } from './config'

export async function testNeonRealtime(): Promise<string> {
  const cfg = neonConfig()
  if (!cfg?.realtimeUrl || !cfg?.realtimeSecret) {
    throw new Error('إعدادات Neon Realtime غير مكتملة')
  }
  return `تم تكوين Neon Realtime (url: ${cfg.realtimeUrl})`
}
