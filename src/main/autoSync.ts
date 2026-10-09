import { supabaseConfig, supabasePush } from './supabase'
import { cloudPush } from './cloud'

const DEBOUNCE_MS = 3000
const PERIOD_MS = 5 * 60 * 1000

let debounceTimer: NodeJS.Timeout | null = null
let periodTimer: NodeJS.Timeout | null = null
let running = false
let pending = false

export function markDirty(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runAutoSync()
  }, DEBOUNCE_MS)
}

async function runAutoSync(): Promise<void> {
  if (process.env['SKIP_SYNC'] === '1') return
  if (running) {
    pending = true
    return
  }
  if (!supabaseConfig()) return
  running = true
  try {
    await supabasePush().catch(() => {})
    await cloudPush().catch(() => {})
  } finally {
    running = false
  }
  if (pending) {
    pending = false
    markDirty()
  }
}

export function startAutoSync(): void {
  if (periodTimer) return
  periodTimer = setInterval(() => markDirty(), PERIOD_MS)
}
