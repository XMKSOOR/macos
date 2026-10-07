import { contextBridge, ipcRenderer } from 'electron'
import type {
  Appointment,
  CatalogItem,
  DashboardStats,
  DueRecurringExpense,
  Expense,
  Invoice,
  Material,
  Medication,
  MedicationInput,
  Medicine,
  MedicineInput,
  Patient,
  PatientAttachment,
  PatientFileResult,
  PatientReportMode,
  PrinterInfo,
  Settings,
  SheetExportRequest,
  SheetSchemaKey,
  StockMovement,
  User,
  DentalChartEntry,
  ToothCondition,
  TreatmentPlan,
  TreatmentPlanItem,
  TreatmentPlanStatus,
  PeriodontalChartEntry,
  ProcedureTemplate,
  RecallReminder,
  RecallType
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
    get: (id: number): Promise<PatientFileResult> => invoke('patients:get', { id }),
    create: (p: object): Promise<Patient> => invoke('patients:create', p),
    update: (id: number, data: object): Promise<boolean> => invoke('patients:update', { id, data }),
    delete: (id: number): Promise<boolean> => invoke('patients:delete', { id }),
    importRows: (rows: Record<string, string>[]): Promise<{ ok: number; updated: number; skip: number }> =>
      invoke('patients:import', { rows })
  },
  attachments: {
    list: (patientId: number): Promise<PatientAttachment[]> => invoke('attachments:list', { patientId }),
    add: (patientId: number): Promise<PatientAttachment[]> => invoke('attachments:add', { patientId }),
    read: (id: number): Promise<{ attachment: PatientAttachment; dataUrl: string }> =>
      invoke('attachments:read', { id }),
    delete: (id: number): Promise<boolean> => invoke('attachments:delete', { id }),
    openExternal: (id: number): Promise<boolean> => invoke('attachments:openExternal', { id }),
    setTooth: (id: number, toothNumber: string): Promise<boolean> => invoke('attachments:setTooth', { id, toothNumber })
  },
  medications: {
    list: (patientId: number): Promise<Medication[]> => invoke('medications:list', { patientId }),
    save: (m: MedicationInput & { id?: number }): Promise<Medication> => invoke('medications:save', m),
    delete: (id: number): Promise<boolean> => invoke('medications:delete', { id })
  },
  medCatalog: {
    list: (): Promise<Medicine[]> => invoke('medCatalog:list'),
    create: (m: MedicineInput): Promise<Medicine> => invoke('medCatalog:create', m),
    update: (id: number, data: MedicineInput): Promise<Medicine> => invoke('medCatalog:update', { id, data }),
    delete: (id: number): Promise<boolean> => invoke('medCatalog:delete', { id })
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
    delete: (id: number): Promise<boolean> => invoke('expenses:delete', { id }),
    due: (withinDays?: number): Promise<DueRecurringExpense[]> => invoke('expenses:due', { withinDays }),
    runDue: (): Promise<number> => invoke('expenses:runDue')
  },
  dashboard: {
    stats: (period: string): Promise<DashboardStats> => invoke('dashboard:stats', { period })
  },
  dental: {
    listChart: (patientId: number): Promise<DentalChartEntry[]> => invoke('dental:listChart', { patientId }),
    saveTooth: (patientId: number, toothNumber: string, condition: ToothCondition, surfaces: string, notes: string): Promise<void> =>
      invoke('dental:saveTooth', { patientId, toothNumber, condition, surfaces, notes }),
    deleteTooth: (patientId: number, toothNumber: string): Promise<void> => invoke('dental:deleteTooth', { patientId, toothNumber })
  },
  plans: {
    list: (patientId: number): Promise<TreatmentPlan[]> => invoke('plans:list', { patientId }),
    create: (patientId: number, title: string, notes: string): Promise<TreatmentPlan> => invoke('plans:create', { patientId, title, notes }),
    update: (id: number, title: string, status: TreatmentPlanStatus, notes: string): Promise<boolean> =>
      invoke('plans:update', { id, title, status, notes }),
    delete: (id: number): Promise<boolean> => invoke('plans:delete', { id }),
    addItem: (planId: number, toothNumber: string, procedureName: string, cost: number, notes: string): Promise<void> =>
      invoke('plans:addItem', { planId, toothNumber, procedureName, cost, notes }),
    updateItem: (id: number, status: TreatmentPlanItem['status'], cost: number): Promise<void> =>
      invoke('plans:updateItem', { id, status, cost }),
    deleteItem: (id: number): Promise<void> => invoke('plans:deleteItem', { id })
  },
  periodontal: {
    list: (patientId: number): Promise<PeriodontalChartEntry[]> => invoke('periodontal:list', { patientId }),
    save: (patientId: number, toothNumber: string, pocketDepth: number, bleeding: number, mobility: number, recession: number, notes: string): Promise<void> =>
      invoke('periodontal:save', { patientId, toothNumber, pocketDepth, bleeding, mobility, recession, notes }),
    delete: (patientId: number, toothNumber: string): Promise<void> => invoke('periodontal:delete', { patientId, toothNumber })
  },
  procedureTemplates: {
    list: (): Promise<ProcedureTemplate[]> => invoke('procedureTemplates:list'),
    create: (t: Omit<ProcedureTemplate, 'id' | 'created_at'>): Promise<ProcedureTemplate> => invoke('procedureTemplates:create', t),
    update: (id: number, data: Omit<ProcedureTemplate, 'id' | 'created_at'>): Promise<boolean> => invoke('procedureTemplates:update', { id, data }),
    delete: (id: number): Promise<boolean> => invoke('procedureTemplates:delete', { id })
  },
  recall: {
    list: (): Promise<RecallReminder[]> => invoke('recall:list'),
    create: (patientId: number, recallType: RecallType, dueDate: string, notes: string): Promise<RecallReminder> =>
      invoke('recall:create', { patientId, recallType, dueDate, notes }),
    complete: (id: number): Promise<boolean> => invoke('recall:complete', { id }),
    delete: (id: number): Promise<boolean> => invoke('recall:delete', { id })
  },
records: {
    list: (kind: string, patientId?: number): Promise<Record<string, unknown>[]> =>
      invoke('rec:list', { kind, patientId }),
    save: (kind: string, data: Record<string, unknown>): Promise<Record<string, unknown>> =>
      invoke('rec:save', { kind, data }),
    delete: (kind: string, id: number): Promise<boolean> => invoke('rec:delete', { kind, id })
  },
  printing: {
    list: (): Promise<PrinterInfo[]> => invoke('printing:list'),
    receipt: (invoiceId: number): Promise<{ ok: boolean; error?: string }> => invoke('printing:receipt', { invoiceId }),
    patientReport: (patientId: number, mode: PatientReportMode): Promise<{ ok: boolean; error?: string }> =>
      invoke('printing:patientReport', { patientId, mode }),
    prescription: (req: { patientId: number; medicationIds: number[]; diagnosis?: string; note?: string }): Promise<{ ok: boolean; error?: string }> =>
      invoke('printing:prescription', req),
    document: (req: { title: string; subtitle?: string; content: string; patientName?: string }): Promise<{ ok: boolean; error?: string }> =>
      invoke('printing:document', req)
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
  },
  supabase: {
    test: (): Promise<string> => invoke('supabase:test'),
    push: (): Promise<string> => invoke('supabase:push'),
    pull: (): Promise<string> => invoke('supabase:pull'),
    config: (): Promise<boolean> => invoke('supabase:config')
  },
  cloud: {
    test: (): Promise<string> => invoke('cloud:test'),
    push: (): Promise<string> => invoke('cloud:push'),
    pull: (): Promise<string> => invoke('cloud:pull'),
    config: (): Promise<boolean> => invoke('cloud:config')
  }
}

export type ClinicApi = typeof api

contextBridge.exposeInMainWorld('clinic', api)