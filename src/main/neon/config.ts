import { getSettings } from '../db'

export interface NeonConfig {
  databaseUrl: string
  authBaseUrl?: string
  authJwksUrl?: string
  realtimeUrl?: string
  realtimeSecret?: string
  functionHelloUrl?: string
  storageEndpoint?: string
  storageKeyId?: string
  storageSecret?: string
  storageRegion?: string
}

export function neonConfig(): NeonConfig | null {
  const databaseUrl =
    (process.env['DATABASE_URL'] ?? '').trim() ||
    (process.env['NEON_DATABASE_URL'] ?? '').trim()
  if (!databaseUrl) return null
  return {
    databaseUrl,
    authBaseUrl: (process.env['NEON_AUTH_BASE_URL'] ?? '').trim() || undefined,
    authJwksUrl: (process.env['NEON_AUTH_JWKS_URL'] ?? '').trim() || undefined,
    realtimeUrl: (process.env['NEON_REALTIME_URL'] ?? '').trim() || undefined,
    realtimeSecret: (process.env['NEON_REALTIME_SECRET'] ?? '').trim() || undefined,
    functionHelloUrl: (process.env['NEON_FUNCTION_HELLO_BASE_URL'] ?? '').trim() || undefined,
    storageEndpoint: (process.env['AWS_ENDPOINT_URL_S3'] ?? '').trim() || undefined,
    storageKeyId: (process.env['AWS_ACCESS_KEY_ID'] ?? '').trim() || undefined,
    storageSecret: (process.env['AWS_SECRET_ACCESS_KEY'] ?? '').trim() || undefined,
    storageRegion: (process.env['AWS_REGION'] ?? '').trim() || undefined
  }
}
