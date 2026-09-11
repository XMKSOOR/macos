import { contextBridge, ipcRenderer } from 'electron'
import type {
  Appointment,
  CatalogItem,
  DashboardStats,
  Expense,
  Invoice,
  Material,
  Patient,
  PrinterInfo,
  Settings,
  SheetExportRequest,
  SheetSchemaKey,
  StockMovement,
  User
} from '../shared/types'

function invoke<T>(channel: string, args?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, args).then((res: { ok: boolean; data?: unknown; error?: string }) => {
    if (!res?.ok) throw new Error(res?.error ?? 'خطأ غير معروف')
    return res.data as T
  })
}

const api = {
  auth: {
    login: (username: string, password: string): Promise<User> => invoke('auth:login', { username, password }),
    logout: (): Promise<boolean> => invoke('auth:logout'),
    me: (): Promise<User | null> => invoke('auth:me'),
    changePassword: (oldPassword: string, newPassword: string): Promise<boolean> =>
      invoke('auth:changePassword', { oldPassword, newPassword })
  },
  settings: {
    get: (): Promise<Settings> => invoke('settings:get'),
    save: (partial: object): Promise<Settings> => invoke('settings:save', partial),
    convertCurrency: (): Promise<string> => invoke('currency:convert')
  },
  users: {
    list: (): Promise<User[]> => invoke('users:list'),
    create: (u: object): Promise<User> => invoke('users:create', u),
    update: (id: number, data: object): Promise<boolean> => invoke('users:update', { id, data }),
    delete: (id: number): Promise<boolean> => invoke('users:delete', { id })
  },
  patients: {
    list: (search?: string): Promise<Patient[]> => invoke('patients:list', { search }),
    create: (p: object): Promise<Patient> => invoke('patients:create', p),
    update: (id: number, data: object): Promise<boolean> => invoke('patients:update', { id, data }),
    delete: (id: number): Promise<boolean> => invoke('patients:delete', { id }),
    importRows: (rows: Record<string, string>[]): Promise<{ ok: number; updated: number; skip: number }> =>
      invoke('patients:import', { rows })
  },
  appointments: {
    list: (filter?: object): Promise<Appointment[]> => invoke('appointments:list', filter ?? {}),
    create: (a: object): Promise<Appointment> => invoke('appointments:create', a),
    update: (id: number, data: object): Promise<boolean> => invoke('appointments:update', { id, data }),
    delete: (id: number): Promise<boolean> => invoke('appointments:delete', { id })
  },
  catalog: {
    list: (): Promise<CatalogItem[]> => invoke('catalog:list'),
    create: (c: object): Promise<CatalogItem> => invoke('catalog:create', c),
    update: (id: number, data: object): Promise<boolean> => invoke('catalog:update', { id, data }),
    delete: (id: number): Promise<boolean> => invoke('catalog:delete', { id }),
    importRows: (rows: Record<string, string>[]): Promise<{ ok: number; updated: number; skip: number }> =>
      invoke('catalog:importRows', { rows })
  },
  inventory: {
    list: (search?: string): Promise<Material[]> => invoke('inventory:list', { search }),
    create: (m: object): Promise<Material> => invoke('inventory:create', m),
    update: (id: number, data: object): Promise<boolean> => invoke('inventory:update', { id, data }),
    delete: (id: number): Promise<boolean> => invoke('inventory:delete', { id }),
    adjust: (id: number, qtyDelta: number, operation: string, note: string): Promise<boolean> =>
      invoke('inventory:adjust', { id, qtyDelta, operation, note }),
    movements: (): Promise<StockMovement[]> => invoke('inventory:movements'),
    importRows: (rows: Record<string, string>[]): Promise<{ ok: number; updated: number; skip: number }> =>
      invoke('inventory:importRows', { rows })
  },
  invoices: {
    nextNo: (): Promise<string> => invoke('invoices:nextNo'),
    list: (search?: string): Promise<Invoice[]> => invoke('invoices:list', { search }),
    since: (since: string): Promise<Invoice[]> => invoke('invoices:since', { since }),
    get: (id: number): Promise<Invoice> => invoke('invoices:get', { id }),
    create: (input: object): Promise<Invoice> => invoke('invoices:create', input),
    pay: (id: number, amount: number): Promise<Invoice> => invoke('invoices:pay', { id, amount }),
    delete: (id: number): Promise<boolean> => invoke('invoices:delete', { id })
  },
  expenses: {
    list: (filter?: object): Promise<Expense[]> => invoke('expenses:list', filter ?? {}),
    create: (e: object): Promise<Expense> => invoke('expenses:create', e),
    update: (id: number, data: object): Promise<boolean> => invoke('expenses:update', { id, data }),
    delete: (id: number): Promise<boolean> => invoke('expenses:delete', { id })
  },
  dashboard: {
    stats: (period: string): Promise<DashboardStats> => invoke('dashboard:stats', { period })
  },
  printing: {
    list: (): Promise<PrinterInfo[]> => invoke('printing:list'),
    receipt: (invoiceId: number): Promise<{ ok: boolean; error?: string }> => invoke('printing:receipt', { invoiceId })
  },
  files: {
    export: (req: SheetExportRequest): Promise<string | null> => invoke('files:export', req),
    template: (schema: SheetSchemaKey): Promise<string | null> => invoke('files:template', { schema }),
    import: (schema: SheetSchemaKey): Promise<Record<string, string>[] | null> => invoke('files:import', { schema })
  },
  db: {
    info: (): Promise<{ path: string; dir: string }> => invoke('db:info'),
    chooseFolder: (): Promise<string | null> => invoke('db:chooseFolder'),
    changeLocation: (folder: string): Promise<boolean> => invoke('db:changeLocation', { folder }),
    useLocal: (): Promise<boolean> => invoke('db:useLocal'),
    openFolder: (): Promise<boolean> => invoke('db:openFolder'),
    backup: (): Promise<string | null> => invoke('db:backup'),
    restore: (): Promise<string | null> => invoke('db:restore')
  },
  sync: {
    driveAuth: (): Promise<string> => invoke('sync:driveAuth'),
    driveUpload: (): Promise<string> => invoke('sync:driveUpload'),
    driveDownload: (): Promise<string> => invoke('sync:driveDownload'),
    driveStatus: (): Promise<{ connected: boolean; config: boolean }> => invoke('sync:driveStatus'),
    driveClear: (): Promise<boolean> => invoke('sync:driveClear')
  },
  mysql: {
    test: (): Promise<string> => invoke('mysql:test'),
    push: (): Promise<string> => invoke('mysql:push'),
    pull: (): Promise<string> => invoke('mysql:pull'),
    config: (): Promise<boolean> => invoke('mysql:config')
  }
}

export type ClinicApi = typeof api

contextBridge.exposeInMainWorld('clinic', api)