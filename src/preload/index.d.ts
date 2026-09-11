import type { ClinicApi } from './index'

declare global {
  interface Window {
    clinic: ClinicApi
  }
}

export {}