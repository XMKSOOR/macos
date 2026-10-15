import { createHash, randomUUID } from 'node:crypto'

/** معرّف جديد عشوائي (UUIDv4) لكل صف يُنشأ محليًا. */
export function newId(): string {
  return randomUUID()
}

/** فضاء أسماء ثابت (UUIDv5) لتحويل المعرّفات القديمة بشكل حتمي على كل الأجهزة. */
const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const NS_BYTES = Buffer.from(NS.replace(/-/g, ''), 'hex')

/**
 * يحوّل معرّفًا رقميًا قديمًا إلى UUID ثابت: نفس (الجدول، المعرّف) ينتج نفس الـ UUID
 * على كل الأجهزة، لذا تتفق الأجهزة على المفاتيح بعد المزامنة بلا خريطة توزيع.
 */
export function stableId(table: string, oldId: number | string | null | undefined): string | null {
  if (oldId === null || oldId === undefined || oldId === '') return null
  const hash = createHash('sha1').update(NS_BYTES).update(`${table}:${oldId}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** هل القيمة معرّف UUID نصّي؟ */
export function isUuid(v: unknown): boolean {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}
