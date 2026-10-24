import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { neonConfig } from './config'

let client: S3Client | null = null
let clientKey = ''

function getClient(): S3Client {
  const cfg = neonConfig()
  if (!cfg?.storageEndpoint || !cfg?.storageKeyId || !cfg?.storageSecret) {
    throw new Error('إعدادات Neon Object Storage غير مكتملة (AWS_* أو endpoint)')
  }
  const key = cfg.storageEndpoint + '|' + cfg.storageKeyId
  if (!client || clientKey !== key) {
    client = new S3Client({
      region: cfg.storageRegion || 'us-east-2',
      endpoint: cfg.storageEndpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.storageKeyId,
        secretAccessKey: cfg.storageSecret
      }
    })
    clientKey = key
  }
  return client
}

export async function testNeonStorage(): Promise<string> {
  const c = getClient()
  await c.send(new ListObjectsV2Command({ Bucket: 'assets', MaxKeys: 1 }))
  return 'تم الاتصال بـ Neon Object Storage بنجاح (bucket: assets)'
}

export async function getPresignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  const c = getClient()
  const cmd = new GetObjectCommand({ Bucket: 'assets', Key: key })
  return getSignedUrl(c, cmd, { expiresIn })
}

export async function uploadObject(key: string, body: Buffer | Uint8Array | string, contentType?: string): Promise<void> {
  const c = getClient()
  await c.send(new PutObjectCommand({ Bucket: 'assets', Key: key, Body: body, ContentType: contentType }))
}
