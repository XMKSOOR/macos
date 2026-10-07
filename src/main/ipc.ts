import type { IpcMain } from 'electron'
import { BrowserWindow } from 'electron'
import {
  addPayment,
  addPatientFile,
  adjustStock,
  createAppointment,
  createCatalogItem,
  createExpense,
  createInvoice,
  createMaterial,
  createPatient,
  createUser,
  dashboardStats,
  deleteAppointment,
  deleteCatalogItem,
  deleteExpense,
  deleteInvoice,
  deleteMaterial,
  deletePatient,
  deletePatientFile,
  deleteUser,
  findLogin,
  getInvoice,
  getSettings,
  importCatalogRows,
  importMaterials,
  getPatientFile,
  getPatientFileRecord,
  attachmentPath,
  listPatientFiles,
  readPatientFile,
  importPatients,
  listDueRecurringExpenses,
  materializeDueRecurringExpenses,
  listAppointments,
  listCatalog,
  listExpenses,
  listInvoices,
  listInvoicesSince,
  listMaterials,
  listMedications,
  saveMedication,
  deleteMedication,
  listMedicines,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  listPatients,
  listStockMovements,
  listUsers,
  listDentalCharts,
  saveDentalChart,
  deleteDentalChart,
  listTreatmentPlans,
  createTreatmentPlan,
  updateTreatmentPlan,
  deleteTreatmentPlan,
  addTreatmentPlanItem,
  updateTreatmentPlanItem,
  deleteTreatmentPlanItem,
  listPeriodontalCharts,
  savePeriodontalChart,
  deletePeriodontalChart,
  listProcedureTemplates,
  createProcedureTemplate,
  updateProcedureTemplate,
  deleteProcedureTemplate,
  listRecallReminders,
  createRecallReminder,
  completeRecallReminder,
  deleteRecallReminder,
  setPatientFileTooth,
  nextInvoiceNo,
  saveSettings,
  updateAppointment,
  updateCatalogItem,
  updateExpense,
  updateMaterial,
  updatePatient,
  updateUser,
  verifyPassword,
  listRecords,
  saveRecord,
  deleteRecord,
  recordKindExists
} from './db'
import { exportTemplate, exportWorkbook, importFile } from './export'
import {
  driveClear,
  driveDownload,
  driveStartAuth,
  driveStatus,
  driveSyncOnQuit,
  driveUpload
} from './sync'
import type {
  Medication,
  MedicationInput,
  MedicineInput,
  PrescriptionRequest,
  PatientReportMode,
  PermissionKey,
  PrinterInfo,
  Settings,
  SheetExportRequest,
  SheetSchemaKey,
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
import { can } from '../shared/types'
import { applyCurrencyScale, backupDatabase, getDbPath, recalcUsd, replaceDbFrom } from './db'
import { mysqlConfig, mysqlPull, mysqlPush, mysqlTest } from './mysql'
import { supabaseConfig, supabasePull, supabasePush, supabaseTest } from './supabase'
import { cloudPull, cloudPush, cloudTest } from './cloud'
import { dataDir, setConfig } from './config'
import { app, dialog, shell } from 'electron'

let currentUser: User | null = null

function requireAuth(perm?: PermissionKey): User {
  if (!currentUser) throw new Error('غير مسجل الدخول')
  if (perm && !can(currentUser.role, perm, currentUser.permissions)) throw new Error('لا تملك صلاحية لهذه العملية')
  return currentUser
}

export function registerIpc(ipc: IpcMain): void {
  const handle = (channel: string, fn: (args?: unknown) => unknown): void => {
    ipc.handle(channel, async (_ev, args) => {
      try {
        return { ok: true, data: await fn(args) }
      } catch (e) {
        if (process.env['IPC_TRACE']) console.error('IPC_ERR ' + channel + ' :: ' + (e instanceof Error ? (e.stack ?? e.message) : String(e)))
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })
  }

  // ---- Auth ----
  handle('auth:login', (args) => {
    const { username, password } = args as { username: string; password: string }
    const row = findLogin(username.trim())
    if (!row || !verifyPassword(password, row.password_hash)) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
    currentUser = {
      id: row.id,
      username: row.username,
      role: row.role as User['role'],
      full_name: row.full_name,
      created_at: '',
      permissions: row.permissions
    }
    return currentUser
  })
  handle('auth:logout', () => {
    currentUser = null
    return true
  })
  handle('auth:me', () => {
    if (!currentUser) return null
    const fresh = findLogin(currentUser.username)
    if (!fresh) {
      currentUser = null
      return null
    }
    currentUser = {
      id: fresh.id,
      username: fresh.username,
      role: fresh.role as User['role'],
      full_name: fresh.full_name,
      created_at: '',
      permissions: fresh.permissions
    }
    return currentUser
  })
  handle('auth:changePassword', (args) => {
    const { oldPassword, newPassword } = args as { oldPassword: string; newPassword: string }
    const user = requireAuth()
    const row = findLogin(user.username)
    if (!row || !verifyPassword(oldPassword, row.password_hash)) throw new Error('كلمة المرور الحالية غير صحيحة')
    updateUser(user.id, user.username, user.role, user.full_name, newPassword, user.permissions)
    return true
  })

  // ---- Settings ----
  handle('settings:get', () => getSettings())
  handle('settings:save', (args) => {
    const s = saveSettings(args as Partial<Settings>)
    recalcUsd()
    return s
  })
  handle('currency:convert', () => {
    requireAuth('manageSettings')
    return applyCurrencyScale(true)
  })

  // ---- Users (admin) ----
  handle('users:list', () => {
    requireAuth('manageUsers')
    return listUsers()
  })
  handle('users:create', (args) => {
    requireAuth('manageUsers')
    const { username, password, role, full_name, permissions } = args as {
      username: string
      password: string
      role: User['role']
      full_name: string
      permissions?: Record<string, boolean>
    }
    return createUser(username, password, role, full_name, permissions)
  })
  handle('users:update', (args) => {
    requireAuth('manageUsers')
    const { id, username, role, full_name, password, permissions } = args as {
      id: number
      username: string
      role: User['role']
      full_name: string
      password?: string
      permissions?: Record<string, boolean>
    }
    updateUser(id, username, role, full_name, password, permissions)
    return true
  })
  handle('users:delete', (args) => {
    requireAuth('manageUsers')
    const { id } = args as { id: number }
    deleteUser(id)
    return true
  })

  // ---- Patients ----
  handle('patients:list', (args) => listPatients((args as { search?: string } | undefined)?.search))
  handle('patients:create', (args) => {
    requireAuth()
    return createPatient(args as never)
  })
  handle('patients:update', (args) => {
    requireAuth('edit')
    const { id, data } = args as { id: number; data: never }
    updatePatient(id, data)
    return true
  })
  handle('patients:delete', (args) => {
    requireAuth('delete')
    deletePatient((args as { id: number }).id)
    return true
  })
  handle('patients:import', (args) => {
    requireAuth('import')
    return importPatients((args as { rows: Record<string, string>[] }).rows)
  })
  handle('patients:get', (args) => {
    requireAuth()
    return getPatientFile((args as { id: number }).id)
  })

  // ---- سجل أدوية المريض ----
  handle('medications:list', (args) => {
    requireAuth()
    return listMedications((args as { patientId: number }).patientId)
  })
  handle('medications:save', (args) => {
    requireAuth('edit')
    return saveMedication(args as MedicationInput & { id?: number })
  })
  handle('medications:delete', (args) => {
    requireAuth('edit')
    deleteMedication((args as { id: number }).id)
    return true
  })

  // ---- القائمة المرجعية للأدوية ----
  handle('medCatalog:list', () => {
    requireAuth()
    return listMedicines()
  })
  handle('medCatalog:create', (args) => {
    requireAuth('edit')
    return createMedicine(args as MedicineInput)
  })
  handle('medCatalog:update', (args) => {
    requireAuth('edit')
    const { id, data } = args as { id: number; data: MedicineInput }
    return updateMedicine(id, data)
  })
  handle('medCatalog:delete', (args) => {
    requireAuth('edit')
    deleteMedicine((args as { id: number }).id)
    return true
  })

  // ---- مرفقات المريض: صور، صور أشعة DICOM، ملفات (تُحفَظ محلياً فقط) ----
  handle('attachments:list', (args) => {
    requireAuth()
    return listPatientFiles((args as { patientId: number }).patientId)
  })
  handle('attachments:add', async (args) => {
    requireAuth('edit')
    const { patientId } = args as { patientId: number }
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'اختر صور الأشعة أو الصور أو ملفات المريض',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'صور الأشعة والصور (DICOM / JPG / PNG)',
          extensions: ['dcm', 'dicom', 'dcmdir', 'ima', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'tif', 'tiff']
        },
        { name: 'كل الملفات', extensions: ['*'] }
      ]
    })
    if (canceled || filePaths.length === 0) return []
    return filePaths.map((p) => addPatientFile(patientId, p))
  })
  handle('attachments:read', (args) => {
    requireAuth()
    return readPatientFile((args as { id: number }).id)
  })
  handle('attachments:delete', (args) => {
    requireAuth('edit')
    deletePatientFile((args as { id: number }).id)
    return true
  })
  handle('attachments:openExternal', async (args) => {
    requireAuth()
    const row = getPatientFileRecord((args as { id: number }).id)
    const err = await shell.openPath(attachmentPath(row))
    if (err) throw new Error(err)
    return true
  })
  handle('attachments:setTooth', (args) => {
    requireAuth('edit')
    const { id, toothNumber } = args as { id: number; toothNumber: string }
    setPatientFileTooth(id, toothNumber ?? '')
    return true
  })

  // ---- مخطط الأسنان (Odontogram) ----
  handle('dental:listChart', (args) => {
    requireAuth()
    return listDentalCharts((args as { patientId: number }).patientId)
  })
  handle('dental:saveTooth', (args) => {
    requireAuth('edit')
    const { patientId, toothNumber, condition, surfaces, notes } = args as {
      patientId: number
      toothNumber: string
      condition: ToothCondition
      surfaces: string
      notes: string
    }
    saveDentalChart(patientId, toothNumber, condition, surfaces, notes)
    return true
  })
  handle('dental:deleteTooth', (args) => {
    requireAuth('edit')
    const { patientId, toothNumber } = args as { patientId: number; toothNumber: string }
    deleteDentalChart(patientId, toothNumber)
    return true
  })

  // ---- سجلات طب الأسنان العامة ----
  handle('rec:list', (args) => {
    requireAuth()
    const { kind, patientId } = args as { kind: string; patientId?: number }
    return listRecords(kind, patientId)
  })
  handle('rec:save', (args) => {
    requireAuth('edit')
    const { kind, data } = args as { kind: string; data: Record<string, unknown> }
    if (!recordKindExists(kind)) throw new Error('نوع سجل غير معروف')
    return saveRecord(kind, data)
  })
  handle('rec:delete', (args) => {
    requireAuth('edit')
    const { kind, id } = args as { kind: string; id: number }
    if (!recordKindExists(kind)) throw new Error('نوع سجل غير معروف')
    deleteRecord(kind, id)
    return true
  })

  // ---- خطط العلاج ----
  handle('plans:list', (args): TreatmentPlan[] => {
    requireAuth()
    return listTreatmentPlans((args as { patientId: number }).patientId)
  })
  handle('plans:create', (args) => {
    requireAuth('edit')
    const { patientId, title, notes } = args as { patientId: number; title: string; notes: string }
    return createTreatmentPlan(patientId, title, notes)
  })
  handle('plans:update', (args) => {
    requireAuth('edit')
    const { id, title, status, notes } = args as {
      id: number
      title: string
      status: TreatmentPlanStatus
      notes: string
    }
    updateTreatmentPlan(id, title, status, notes)
    return true
  })
  handle('plans:delete', (args) => {
    requireAuth('edit')
    deleteTreatmentPlan((args as { id: number }).id)
    return true
  })
  handle('plans:addItem', (args) => {
    requireAuth('edit')
    const { planId, toothNumber, procedureName, cost, notes } = args as {
      planId: number
      toothNumber: string
      procedureName: string
      cost: number
      notes: string
    }
    addTreatmentPlanItem(planId, toothNumber, procedureName, cost, notes)
    return true
  })
  handle('plans:updateItem', (args) => {
    requireAuth('edit')
    const { id, status, cost } = args as { id: number; status: TreatmentPlanItem['status']; cost: number }
    updateTreatmentPlanItem(id, status, cost)
    return true
  })
  handle('plans:deleteItem', (args) => {
    requireAuth('edit')
    deleteTreatmentPlanItem((args as { id: number }).id)
    return true
  })

  // ---- قياسات اللثة ----
  handle('periodontal:list', (args) => {
    requireAuth()
    return listPeriodontalCharts((args as { patientId: number }).patientId)
  })
  handle('periodontal:save', (args) => {
    requireAuth('edit')
    const { patientId, toothNumber, pocketDepth, bleeding, mobility, recession, notes } = args as {
      patientId: number
      toothNumber: string
      pocketDepth: number
      bleeding: number
      mobility: number
      recession: number
      notes: string
    }
    savePeriodontalChart(patientId, toothNumber, pocketDepth, bleeding, mobility, recession, notes)
    return true
  })
  handle('periodontal:delete', (args) => {
    requireAuth('edit')
    const { patientId, toothNumber } = args as { patientId: number; toothNumber: string }
    deletePeriodontalChart(patientId, toothNumber)
    return true
  })

  // ---- قوالب الإجراءات ----
  handle('procedureTemplates:list', (): ProcedureTemplate[] => {
    requireAuth()
    return listProcedureTemplates()
  })
  handle('procedureTemplates:create', (args) => {
    requireAuth('edit')
    return createProcedureTemplate(args as Omit<ProcedureTemplate, 'id' | 'created_at'>)
  })
  handle('procedureTemplates:update', (args) => {
    requireAuth('edit')
    const { id, data } = args as { id: number; data: Omit<ProcedureTemplate, 'id' | 'created_at'> }
    updateProcedureTemplate(id, data)
    return true
  })
  handle('procedureTemplates:delete', (args) => {
    requireAuth('edit')
    deleteProcedureTemplate((args as { id: number }).id)
    return true
  })

  // ---- تذكيرات المراجعة (Recall) ----
  handle('recall:list', (): RecallReminder[] => {
    requireAuth()
    return listRecallReminders()
  })
  handle('recall:create', (args) => {
    requireAuth('edit')
    const { patientId, recallType, dueDate, notes } = args as {
      patientId: number
      recallType: RecallType
      dueDate: string
      notes: string
    }
    return createRecallReminder(patientId, recallType, dueDate, notes)
  })
  handle('recall:complete', (args) => {
    requireAuth('edit')
    completeRecallReminder((args as { id: number }).id)
    return true
  })
  handle('recall:delete', (args) => {
    requireAuth('edit')
    deleteRecallReminder((args as { id: number }).id)
    return true
  })

  // ---- Appointments ----
  handle('appointments:list', (args) => {
    const { date, status } = (args ?? {}) as { date?: string; status?: string }
    return listAppointments(date, status)
  })
  handle('appointments:create', (args) => {
    requireAuth()
    return createAppointment(args as never)
  })
  handle('appointments:update', (args) => {
    requireAuth('edit')
    const { id, data } = args as { id: number; data: never }
    updateAppointment(id, data)
    return true
  })
  handle('appointments:delete', (args) => {
    requireAuth('delete')
    deleteAppointment((args as { id: number }).id)
    return true
  })

  // ---- Catalog ----
  handle('catalog:list', () => listCatalog())
  handle('catalog:create', (args) => {
    requireAuth()
    return createCatalogItem(args as never)
  })
  handle('catalog:update', (args) => {
    requireAuth('edit')
    const { id, data } = args as { id: number; data: never }
    updateCatalogItem(id, data)
    return true
  })
  handle('catalog:delete', (args) => {
    requireAuth('delete')
    deleteCatalogItem((args as { id: number }).id)
    return true
  })
  handle('catalog:importRows', (args) => {
    requireAuth('import')
    return importCatalogRows((args as { rows: Record<string, string>[] }).rows)
  })

  // ---- Inventory ----
  handle('inventory:list', (args) => listMaterials((args as { search?: string } | undefined)?.search))
  handle('inventory:create', (args) => {
    requireAuth()
    return createMaterial(args as never)
  })
  handle('inventory:update', (args) => {
    requireAuth('edit')
    const { id, data } = args as { id: number; data: never }
    updateMaterial(id, data)
    return true
  })
  handle('inventory:delete', (args) => {
    requireAuth('delete')
    deleteMaterial((args as { id: number }).id)
    return true
  })
  handle('inventory:adjust', (args) => {
    requireAuth('adjustStock')
    const { id, qtyDelta, operation, note } = args as { id: number; qtyDelta: number; operation: string; note: string }
    adjustStock(id, qtyDelta, operation, '', currentUser!.username, note)
    return true
  })
  handle('inventory:movements', () => listStockMovements())
  handle('inventory:importRows', (args) => {
    requireAuth('import')
    return importMaterials((args as { rows: Record<string, string>[] }).rows)
  })

  // ---- Invoices ----
  handle('invoices:nextNo', () => nextInvoiceNo())
  handle('invoices:list', (args) => listInvoices((args as { search?: string } | undefined)?.search))
  handle('invoices:since', (args) => listInvoicesSince((args as { since: string }).since))
  handle('invoices:get', (args) => getInvoice((args as { id: number }).id))
  handle('invoices:create', (args) => {
    requireAuth()
    const input = args as {
      patient_id: number
      date: string
      usd_rate: number
      discount: number
      notes: string
      items: never[]
    }
    return createInvoice({ ...input, user_name: currentUser!.full_name || currentUser!.username })
  })
  handle('invoices:pay', (args) => {
    requireAuth()
    const { id, amount } = args as { id: number; amount: number }
    return addPayment(id, amount)
  })
  handle('invoices:delete', (args) => {
    requireAuth('manageUsers')
    deleteInvoice((args as { id: number }).id)
    return true
  })

  // ---- Expenses ----
  handle('expenses:list', (args) => {
    const { from, to } = (args ?? {}) as { from?: string; to?: string }
    return listExpenses(from, to)
  })
  handle('expenses:create', (args) => {
    requireAuth()
    const data = args as { category: string; amount: number; note: string; date: string }
    return createExpense({ ...data, created_by: currentUser!.full_name || currentUser!.username })
  })
  handle('expenses:update', (args) => {
    requireAuth('edit')
    const { id, data } = args as { id: number; data: never }
    updateExpense(id, data)
    return true
  })
  handle('expenses:delete', (args) => {
    requireAuth('delete')
    deleteExpense((args as { id: number }).id)
    return true
  })
  handle('expenses:due', (args) => {
    requireAuth()
    return listDueRecurringExpenses((args as { withinDays?: number } | undefined)?.withinDays ?? 7)
  })
  handle('expenses:runDue', () => {
    requireAuth('edit')
    return materializeDueRecurringExpenses()
  })

  // ---- Dashboard ----
  handle('dashboard:stats', (args) => dashboardStats((args as { period: string } | undefined)?.period ?? '7'))

  // ---- Printers / printing ----
  handle('printing:list', async (): Promise<PrinterInfo[]> => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return []
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => ({
      name: p.name,
      description: p.description
    }))
  })

  handle('printing:receipt', async (args) => {
    const { invoiceId } = args as { invoiceId: number }
    const invoice = getInvoice(invoiceId)
    if (!invoice) throw new Error('الفاتورة غير موجودة')
    const settings = getSettings()
    const html = buildReceiptHtml(invoice, settings)
    return printHtml(html, settings.printer_name || undefined)
  })

  handle('printing:patientReport', async (args) => {
    const { patientId, mode } = args as { patientId: number; mode: PatientReportMode }
    const file = getPatientFile(patientId)
    const settings = getSettings()
    const html = buildPatientReportHtml(file, settings, mode === 'brief' ? 'brief' : 'full')
    return printHtml(html, settings.printer_name || undefined, 'A4')
  })

  handle('printing:prescription', async (args) => {
    const req = args as PrescriptionRequest
    const file = getPatientFile(req.patientId)
    if (!file) throw new Error('المريض غير موجود')
    const settings = getSettings()
    const ids = Array.isArray(req.medicationIds) ? req.medicationIds : []
    const meds = (file.medications ?? []).filter((m) => ids.includes(m.id))
    const html = buildPrescriptionHtml(file, settings, meds, req.diagnosis ?? '', req.note ?? '')
    return printHtml(html, settings.printer_name || undefined, 'A5')
  })

  // ---- طباعة مستند عام (تعليمات، تعليم مرضى، موافقة، تعقيم) ----
  handle('printing:document', async (args) => {
    const { title, subtitle, content, patientName } = args as {
      title: string
      subtitle?: string
      content: string
      patientName?: string
    }
    requireAuth()
    const settings = getSettings()
    const esc = escapeHtml
    const body = esc(content).replace(/\n/g, '<br/>')
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<style>
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;margin:24px}
  .head{text-align:center;border-bottom:2px solid #0f766e;padding-bottom:10px;margin-bottom:16px}
  .head h1{margin:0;font-size:20px}
  .head .sub{color:#555;font-size:13px;margin-top:4px}
  .title{font-size:18px;font-weight:700;margin:12px 0 4px;color:#0f766e}
  .patient{font-size:14px;margin-bottom:10px}
  .content{font-size:14px;line-height:1.9;white-space:normal}
  .foot{margin-top:32px;border-top:1px solid #ccc;padding-top:8px;font-size:12px;color:#666;text-align:center}
</style></head><body>
  <div class="head"><h1>${esc(settings.clinic_name || 'عيادة الأسنان')}</h1>
  ${settings.clinic_address ? `<div class="sub">${esc(settings.clinic_address)}</div>` : ''}
  ${settings.clinic_phone ? `<div class="sub">هاتف: ${esc(settings.clinic_phone)}</div>` : ''}</div>
  <div class="title">${esc(title)}</div>
  ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  ${patientName ? `<div class="patient">المريض: ${esc(patientName)} &nbsp; التاريخ: ${new Date().toLocaleDateString('en-GB')}</div>` : ''}
  <div class="content">${body}</div>
  ${settings.receipt_footer ? `<div class="foot">${esc(settings.receipt_footer)}</div>` : ''}
</body></html>`
    return printHtml(html, settings.printer_name || undefined, 'A4')
  })

  // ---- Excel export / import / template ----
  handle('files:export', async (args) => {
    requireAuth()
    return exportWorkbook(args as SheetExportRequest)
  })
  handle('files:template', async (args) => {
    requireAuth('import')
    return exportTemplate((args as { schema: SheetSchemaKey }).schema)
  })
  handle('files:import', async (args) => {
    requireAuth('import')
    return importFile((args as { schema: SheetSchemaKey }).schema)
  })

  // ---- Database location & maintenance ----
  handle('db:info', () => {
    requireAuth('manageSettings')
    return { path: getDbPath(), dir: dataDir() }
  })
  handle('db:changeLocation', async (args) => {
    requireAuth('manageSettings')
    const { folder } = args as { folder: string }
    const newPath = folder
    setConfig({ db_path: newPath })
    app.relaunch()
    app.exit(0)
    return true
  })
  handle('db:useLocal', () => {
    requireAuth('manageSettings')
    setConfig({ db_path: undefined })
    app.relaunch()
    app.exit(0)
    return true
  })
  handle('db:chooseFolder', async () => {
    requireAuth('manageSettings')
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'اختر مجلد قاعدة البيانات (سيكون داخل مجلد Google Drive للمزامنة مثلاً)',
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })
  handle('db:openFolder', () => {
    requireAuth('manageSettings')
    shell.openPath(dataDir())
    return true
  })
  handle('db:backup', async () => {
    requireAuth('manageSettings')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'نسخة احتياطية من قاعدة البيانات',
      defaultPath: `نسخة-احتياطية-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite', extensions: ['db'] }]
    })
    if (canceled || !filePath) return null
    backupDatabase(filePath)
    return filePath
  })
  handle('db:restore', async () => {
    requireAuth('manageSettings')
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'استعادة نسخة احتياطية',
      properties: ['openFile'],
      filters: [{ name: 'SQLite', extensions: ['db'] }]
    })
    if (canceled || filePaths.length === 0) return null
    replaceDbFrom(filePaths[0])
    return filePaths[0]
  })

  // ---- Google Drive sync ----
  handle('sync:driveAuth', async () => {
    requireAuth('manageSettings')
    return driveStartAuth()
  })
  handle('sync:driveUpload', async () => {
    requireAuth('manageSettings')
    return driveUpload()
  })
  handle('sync:driveDownload', async () => {
    requireAuth('manageSettings')
    return driveDownload()
  })
  handle('sync:driveStatus', async () => {
    requireAuth()
    return driveStatus()
  })
  handle('sync:driveClear', async () => {
    requireAuth('manageSettings')
    await driveClear()
    return true
  })
  handle('sync:quitUpload', async () => {
    requireAuth('manageSettings')
    await driveSyncOnQuit()
    return true
  })

  // ---- MySQL cloud sync ----
  handle('mysql:test', async () => {
    requireAuth('manageSettings')
    return mysqlTest()
  })
  handle('mysql:push', async () => {
    requireAuth('manageSettings')
    return mysqlPush()
  })
  handle('mysql:pull', async () => {
    requireAuth('manageSettings')
    return mysqlPull()
  })
  handle('mysql:config', () => !!mysqlConfig())

  // ---- Supabase Storage sync ----
  handle('supabase:test', async () => {
    requireAuth('manageSettings')
    return supabaseTest()
  })
  handle('supabase:push', async () => {
    requireAuth('manageSettings')
    return supabasePush()
  })
  handle('supabase:pull', async () => {
    requireAuth('manageSettings')
    return supabasePull()
  })
  handle('supabase:config', () => !!supabaseConfig())

  // ---- Supabase Postgres sync (لتطبيق الجوال) ----
  handle('cloud:test', async () => {
    requireAuth('manageSettings')
    return cloudTest()
  })
  handle('cloud:push', async () => {
    requireAuth('manageSettings')
    return cloudPush()
  })
  handle('cloud:pull', async () => {
    requireAuth('manageSettings')
    return cloudPull()
  })
  handle('cloud:config', () => !!supabaseConfig())
}

function buildReceiptHtml(
  invoice: NonNullable<ReturnType<typeof getInvoice>>,
  settings: Settings
): string {
  const fmt = (n: number): string => n.toLocaleString('en-US')
  const usd = (n: number): string => (settings.usd_rate > 0 ? (n / settings.usd_rate).toFixed(2) : '0.00')
  const items = invoice.items ?? []
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
@page { margin: 0; size: 80mm auto; }
body { font-family: 'Segoe UI', Tahoma, sans-serif; width: 72mm; margin: 0 auto; font-size: 12px; }
h1 { font-size: 15px; margin: 2px 0; text-align: center; }
.meta { white-space: pre-wrap; text-align: center; font-size: 11px; }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
td { padding: 1px 0; }
.amount { white-space: nowrap; }
hr { border: none; border-top: 1px dashed #000; margin: 3px 0; }
.center { text-align: center; }
.b { font-weight: bold; }
</style></head><body>
<h1>${escapeHtml(settings.clinic_name)}</h1>
<div class="meta">${escapeHtml(settings.receipt_header)}</div>
<div class="meta">${escapeHtml(settings.clinic_phone)}</div>
<hr>
<table><tr><td>المريض:</td><td class="amount">${escapeHtml(invoice.patient_name ?? '')}</td></tr>
<tr><td>رقم الفاتورة:</td><td class="amount">${invoice.invoice_no}</td></tr>
<tr><td>التاريخ:</td><td class="amount">${invoice.date}</td></tr></table>
<hr>
<table>
<tr class="b"><td>البيان</td><td class="amount">الكلفة</td></tr>
${items
  .map(
    (it) =>
      `<tr><td>${escapeHtml(it.name)} ×${it.qty}</td><td class="amount">${fmt(it.cost * it.qty)} (${usd(it.cost * it.qty)}$)</td></tr>`
  )
  .join('')}
</table>
<hr>
<table>
<tr><td>المجموع قبل الخصم</td><td class="amount">${fmt(invoice.subtotal)} (${usd(invoice.subtotal)}$)</td></tr>
<tr><td>الخصم</td><td class="amount">-${fmt(invoice.discount)}</td></tr>
<tr class="b"><td>الإجمالي</td><td class="amount">${fmt(invoice.total)} (${usd(invoice.total)}$)</td></tr>
</table>
<hr>
<table class="b">
<tr><td>المدفوع</td><td class="amount">${fmt(invoice.paid)} (${usd(invoice.paid)}$)</td></tr>
<tr><td>المتبقي</td><td class="amount">${fmt(invoice.total - invoice.paid)} (${usd(invoice.total - invoice.paid)}$)</td></tr>
</table>
<hr>
<div class="center meta">${escapeHtml(settings.receipt_footer)}</div>
</body></html>`
}

function buildPatientReportHtml(
  file: NonNullable<ReturnType<typeof getPatientFile>>,
  settings: Settings,
  mode: PatientReportMode
): string {
  const esc = escapeHtml
  const p = file.patient
  const fmt = (n: number): string => n.toLocaleString('en-US')
  const meds = file.medications ?? []
  const activeMeds = meds.filter((m) => m.active)
  const appts = file.appointments ?? []
  const invoices = file.invoices ?? []
  const full = mode === 'full'
  const today = new Date().toLocaleDateString('en-GB')

  const age = ((): string => {
    if (!p.birth_date) return ''
    const b = new Date(p.birth_date)
    if (isNaN(b.getTime())) return ''
    const now = new Date()
    let a = now.getFullYear() - b.getFullYear()
    const md = now.getMonth() - b.getMonth()
    if (md < 0 || (md === 0 && now.getDate() < b.getDate())) a--
    return a >= 0 ? `${a} سنة` : ''
  })()

  const infoRow = (k: string, v: string): string =>
    v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : ''

  const medRow = (m: (typeof meds)[number]): string => {
    const catLabel =
      m.category === 'otc'
        ? 'بدون وصفة (OTC)'
        : m.category === 'supplement'
          ? 'مكمل غذائي'
          : m.category === 'herbal'
            ? 'أعشاب/طبيعي'
            : 'موصوف'
    const period = [m.start_date, m.end_date].filter(Boolean).join(' ← ')
    return `<tr>
      <td>${esc(m.trade_name || m.scientific_name || '—')}${m.scientific_name && m.trade_name ? `<br><span class="sub">${esc(m.scientific_name)}</span>` : ''}</td>
      <td>${esc(m.dose)}</td>
      <td>${esc(m.form)}</td>
      <td>${esc(m.route)}</td>
      <td>${esc(m.frequency)}</td>
      <td>${esc(period)}</td>
      <td>${esc(catLabel)}</td>
      <td>${m.active ? 'فعّال' : 'متوقف'}</td>
    </tr>`
  }

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
@page { margin: 14mm; size: A4; }
body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 12px; color: #111; line-height: 1.5; }
h1 { font-size: 18px; margin: 0 0 2px; text-align: center; }
h2 { font-size: 14px; margin: 14px 0 6px; padding: 4px 8px; background: #eef2f7; border-right: 4px solid #0e7c66; }
.head { text-align: center; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
.meta { font-size: 11px; color: #444; white-space: pre-wrap; }
table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: right; vertical-align: top; }
th { background: #f1f5f9; width: 32%; }
table.data th { width: auto; background: #f1f5f9; }
.sub { color: #64748b; font-size: 10px; }
.box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; margin-bottom: 8px; }
.alert { border: 1px solid #fca5a5; background: #fef2f2; }
.alert b { color: #b91c1c; }
.sign { margin-top: 26px; display: flex; justify-content: space-between; font-size: 11px; }
.sign div { border-top: 1px solid #111; padding-top: 4px; width: 45%; text-align: center; }
.muted { color: #64748b; }
</style></head><body>
<div class="head">
  <h1>${esc(settings.clinic_name)}</h1>
  <div class="meta">${esc(settings.clinic_phone)}${settings.clinic_address ? ' — ' + esc(settings.clinic_address) : ''}</div>
  <div class="meta">${full ? 'السجل الطبي الكامل' : 'كشف مختصر'} — تاريخ الطباعة: ${today}</div>
</div>

<h2>1. البيانات الشخصية والأساسية</h2>
<table>
  ${infoRow('الاسم الكامل', p.name)}
  ${infoRow('تاريخ الميلاد', p.birth_date ? `${p.birth_date}${age ? ' (' + age + ')' : ''}` : '')}
  ${infoRow('رقم الملف الطبي / الوطني', p.national_id ?? '')}
  ${infoRow('الجنس', p.gender)}
  ${infoRow('رقم الهاتف', p.phone)}
  ${infoRow('العنوان', p.address)}
</table>

<h2>2. التاريخ المرضي والمحاذير الطبية</h2>
<div class="box alert"><b>الحساسية الدوائية والغذائية:</b> ${esc(p.allergies || 'لا يوجد')}</div>
<table>
  ${infoRow('الأمراض المزمنة', p.chronic_diseases ?? '')}
  ${infoRow('الحالة الفسيولوجية الخاصة', p.physiological_status ?? '')}
  ${full ? infoRow('ملاحظات وتاريخ مرضي إضافي', p.medical_notes ?? '') : ''}
  ${infoRow('ملاحظات عامة', p.notes)}
</table>

<h2>3. تفاصيل الأدوية الحالية${full ? ' والسجل الكامل' : ''}</h2>
${
  (full ? meds : activeMeds).length === 0
    ? `<div class="box muted">لا توجد أدوية مسجّلة</div>`
    : `<table class="data">
  <tr><th>الاسم التجاري / العلمي</th><th>الجرعة</th><th>الشكل</th><th>الطريقة</th><th>عدد المرات والتوقيت</th><th>تاريخ البدء ← الانتهاء</th><th>التصنيف</th><th>الحالة</th></tr>
  ${(full ? meds : activeMeds).map(medRow).join('')}
</table>`
}

${
  full
    ? `<h2>4. تفاصيل الوصفة والجهة المصدرة</h2>
${
  meds.length === 0
    ? `<div class="box muted">لا توجد وصفات مسجّلة</div>`
    : `<table class="data">
  <tr><th>الدواء</th><th>الطبيب المعالج</th><th>التخصص</th><th>الصيدلي</th><th>تاريخ الصرف</th><th>مكان الصرف</th><th>المراجعة القادمة</th></tr>
  ${meds
    .map(
      (m) => `<tr>
      <td>${esc(m.trade_name || m.scientific_name || '—')}</td>
      <td>${esc(m.prescriber)}</td>
      <td>${esc(m.prescriber_specialty)}</td>
      <td>${esc(m.pharmacist)}</td>
      <td>${esc(m.dispense_date)}</td>
      <td>${esc(m.dispense_place)}</td>
      <td>${esc(m.next_review)}</td>
    </tr>`
    )
    .join('')}
</table>`
}`
    : ''
}

<h2>${full ? '5' : '4'}. سجل المواعيد</h2>
${
  appts.length === 0
    ? `<div class="box muted">لا توجد مواعيد</div>`
    : `<table class="data">
  <tr><th>التاريخ</th><th>الوقت</th><th>السبب</th><th>الحالة</th><th>ملاحظات</th></tr>
  ${appts
    .slice(0, full ? 100 : 15)
    .map(
      (a) =>
        `<tr><td>${esc(a.date)}</td><td>${esc(a.time)}</td><td>${esc(a.reason)}</td><td>${esc(a.status)}</td><td>${esc(a.notes)}</td></tr>`
    )
    .join('')}
</table>`
}

${
  full
    ? `<h2>6. سجل الفواتير</h2>
${
  invoices.length === 0
    ? `<div class="box muted">لا توجد فواتير</div>`
    : `<table class="data">
  <tr><th>الرقم</th><th>التاريخ</th><th>الإجمالي (ل.س)</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr>
  ${invoices
    .map(
      (inv) =>
        `<tr><td>${esc(inv.invoice_no)}</td><td>${esc(inv.date)}</td><td>${fmt(inv.total)}</td><td>${fmt(inv.paid)}</td><td>${fmt(inv.total - inv.paid)}</td><td>${esc(inv.status)}</td></tr>`
    )
    .join('')}
</table>`
}`
    : ''
}

<div class="sign">
  <div>توقيع الطبيب المعالج</div>
  <div>توقيع المريض</div>
</div>
${settings.receipt_footer ? `<div class="meta" style="text-align:center;margin-top:10px">${esc(settings.receipt_footer)}</div>` : ''}
</body></html>`
}

function buildPrescriptionHtml(
  file: NonNullable<ReturnType<typeof getPatientFile>>,
  settings: Settings,
  meds: Medication[],
  diagnosis: string,
  note: string
): string {
  const esc = escapeHtml
  const p = file.patient
  const today = new Date().toLocaleDateString('en-GB')
  const age = ((): string => {
    if (!p.birth_date) return ''
    const b = new Date(p.birth_date)
    if (isNaN(b.getTime())) return ''
    const now = new Date()
    let a = now.getFullYear() - b.getFullYear()
    const md = now.getMonth() - b.getMonth()
    if (md < 0 || (md === 0 && now.getDate() < b.getDate())) a--
    return a >= 0 ? `${a} سنة` : ''
  })()

  const rows = meds
    .map((m, i) => {
      const name = esc(m.trade_name || m.scientific_name || '—')
      const sci = m.scientific_name && m.trade_name ? `<span class="sci">${esc(m.scientific_name)}</span>` : ''
      const line = [m.dose, m.form, m.route].filter(Boolean).map(esc).join(' — ')
      const dur = [m.start_date, m.end_date].filter(Boolean).join(' ← ')
      const freq = esc(m.frequency)
      return `<li>
        <div class="med-name"><span class="num">${i + 1}.</span> ${name} ${sci}</div>
        <div class="med-line">${line}</div>
        ${freq ? `<div class="med-line">${freq}${dur ? ' — ' + esc(dur) : ''}</div>` : dur ? `<div class="med-line">${esc(dur)}</div>` : ''}
        ${m.notes ? `<div class="med-note">${esc(m.notes)}</div>` : ''}
      </li>`
    })
    .join('')

  const allergy = (p.allergies ?? '').trim()

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
@page { margin: 10mm; size: A5; }
body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 12px; color: #111; line-height: 1.5; margin: 0; }
.head { text-align: center; border-bottom: 2px solid #0e7c66; padding-bottom: 6px; margin-bottom: 10px; }
.head h1 { font-size: 18px; margin: 0 0 2px; color: #0e7c66; }
.meta { font-size: 11px; color: #444; }
.patient { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; margin-bottom: 10px; background: #f8fafc; }
.patient b { color: #0f172a; }
.rx { font-size: 26px; font-weight: 700; color: #0e7c66; font-family: Georgia, serif; margin: 0 0 4px; }
ul.meds { list-style: none; padding: 0; margin: 0 0 10px; }
ul.meds li { border-bottom: 1px dashed #cbd5e1; padding: 6px 0; }
.med-name { font-weight: 700; font-size: 13px; }
.med-name .num { color: #0e7c66; }
.sci { color: #64748b; font-size: 10px; font-weight: 400; }
.med-line { color: #334155; font-size: 11.5px; }
.med-note { color: #64748b; font-size: 10.5px; font-style: italic; }
.box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; font-size: 11.5px; }
.alert { border-color: #fca5a5; background: #fef2f2; }
.alert b { color: #b91c1c; }
.sign { margin-top: 22px; display: flex; justify-content: space-between; font-size: 11px; }
.sign div { border-top: 1px solid #111; padding-top: 4px; width: 45%; text-align: center; }
.foot { margin-top: 8px; text-align: center; font-size: 10.5px; color: #64748b; }
</style></head><body>
<div class="head">
  <h1>${esc(settings.clinic_name)}</h1>
  <div class="meta">${esc(settings.clinic_phone)}${settings.clinic_address ? ' — ' + esc(settings.clinic_address) : ''}</div>
  <div class="meta">وصفة طبية — ${today}</div>
</div>

<div class="patient">
  <span><b>المريض:</b> ${esc(p.name)}</span>
  ${age ? `<span><b>العمر:</b> ${age}</span>` : ''}
  ${p.gender ? `<span><b>الجنس:</b> ${esc(p.gender)}</span>` : ''}
  ${p.national_id ? `<span><b>رقم الملف:</b> ${esc(p.national_id)}</span>` : ''}
</div>

${allergy ? `<div class="box alert"><b>تنبيه — حساسية معروفة:</b> ${esc(allergy)}</div>` : ''}
${diagnosis ? `<div class="box"><b>التشخيص:</b> ${esc(diagnosis)}</div>` : ''}

<div class="rx">℞</div>
${
  meds.length === 0
    ? `<div class="box">لم يتم اختيار أي دواء لهذه الوصفة.</div>`
    : `<ul class="meds">${rows}</ul>`
}

${note ? `<div class="box"><b>تعليمات عامة:</b> ${esc(note)}</div>` : ''}

<div class="sign">
  <div>توقيع الطبيب / الختم</div>
  <div>اسم الطبيب واختصاصه</div>
</div>
${settings.receipt_footer ? `<div class="foot">${esc(settings.receipt_footer)}</div>` : ''}
</body></html>`
}

function printHtml(
  html: string,
  printerName?: string,
  pageSize: Electron.WebContentsPrintOptions['pageSize'] = 'A6'
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: 400,
      height: 600,
      webPreferences: { sandbox: true }
    })
    win.webContents.on('did-finish-load', () => {
      const opts: Electron.WebContentsPrintOptions = {
        silent: true,
        margins: { marginType: 'none' },
        pageSize,
        copies: 1
      }
      if (printerName) opts.deviceName = printerName
      win.webContents.print(opts, (success, failureReason) => {
        resolve({ ok: success, error: failureReason })
        win.destroy()
      })
    })
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).catch(() => {
      resolve({ ok: false, error: 'failed to load print document' })
      win.destroy()
    })
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}