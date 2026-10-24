import { Pool } from '@neondatabase/serverless'

let pool: Pool | null = null
let poolUrl = ''

export function getNeonPool(): Pool {
  const url = process.env['DATABASE_URL'] ?? process.env['NEON_DATABASE_URL'] ?? ''
  if (!url) throw new Error('DATABASE_URL غير مُهيأ لـ Neon')
  if (!pool || poolUrl !== url) {
    pool?.end()
    pool = new Pool({ connectionString: url })
    poolUrl = url
  }
  return pool
}

export async function testNeonDb(): Promise<string> {
  const p = getNeonPool()
  const res = await p.query('SELECT 1 as ok')
  return `تم الاتصال بـ Neon Postgres بنجاح (result: ${JSON.stringify(res.rows[0])})`
}
