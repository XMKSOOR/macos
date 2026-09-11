import type { IpcMain } from 'electron'
import { BrowserWindow } from 'electron'
import {
  addPayment,
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
  deleteUser,
  findLogin,
  getInvoice,
  getSettings,
  importCatalogRows,
  importMaterials,
  importPatients,
  listAppointments,
  listCatalog,
  listExpenses,
  listInvoices,
  listInvoicesSince,
  listMaterials,
  listPatients,
  listStockMovements,
  listUsers,
  nextInvoiceNo,
  saveSettings,
  updateAppointment,
  updateCatalogItem,
  updateExpense,
  updateMaterial,
  updatePatient,
  updateUser,
  verifyPassword
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
import type { PermissionKey, PrinterInfo, Settings, SheetExportRequest, SheetSchemaKey, User } from '../shared/types'
import { can } from '../shared/types'
import { applyCurrencyScale, backupDatabase, getDbPath, recalcUsd, replaceDbFrom } from './db'
import { mysqlConfig, mysqlPull, mysqlPush, mysqlTest } from './mysql'
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

function printHtml(html: string, printerName?: string): Promise<{ ok: boolean; error?: string }> {
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
        pageSize: 'A6',
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