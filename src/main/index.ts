import 'dotenv/config'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { initDb, listDueRecurringExpenses, materializeDueRecurringExpenses } from './db'
import { registerIpc } from './ipc'
import { drivePullOnStart, driveSyncOnQuit } from './sync'
import { mysqlPullOnStart, mysqlPushOnQuit } from './mysql'
import { supabasePullOnStart, supabasePushOnQuit } from './supabase'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

/**
 * طھظˆظ„ظٹط¯ ط§ظ„ظ…طµط§ط±ظٹظپ ط§ظ„ط¯ظˆط±ظٹط© ط§ظ„ظ…ط³طھط­ظ‚ط© ط¹ظ†ط¯ ط¨ط¯ط، ط§ظ„طھط·ط¨ظٹظ‚.
 * ظٹط³ط¬ظ‘ظ„ طھط­ط°ظٹط±ط§ظ‹ ط¹ظ†ط¯ ط§ظ„ظپط´ظ„ ط­طھظ‰ ظ„ط§ ظٹظ…ظ†ط¹ ط¥ظ‚ظ„ط§ط¹ ط§ظ„ط¨ط±ظ†ط§ظ…ط¬.
 */
async function runRecurringOnStart(): Promise<void> {
  try {
    const made = materializeDueRecurringExpenses()
    if (made > 0) console.log(`RECURRING_MADE ${made}`)
    const soon = listDueRecurringExpenses(7)
    if (soon.length > 0) {
      console.log(
        `RECURRING_DUE ${soon.map((e) => `${e.next_due}:${e.category}`).join(' | ')}`
      )
    }
  } catch (e) {
    console.error('RECURRING_FAIL ' + (e instanceof Error ? e.message : String(e)))
  }
}





function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (process.env['SMOKE_TEST']) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const script = `(async () => {

            const login = await window.clinic.auth.login('admin', 'admin123');

            const settings = await window.clinic.settings.get();
            const patients = await window.clinic.patients.list();
            const stats = await window.clinic.dashboard.stats('7');
            const printers = await window.clinic.printing.list();
            const mat = await window.clinic.inventory.create({ name: 'ظ…ط§ط¯ط© ط§ط®طھط¨ط§ط±', category: 'ط§ط®طھط¨ط§ط±', unit: 'ط­ط¨ط©', quantity: 10, min_qty: 2, cost: 5000, supplier: '', notes: '' });
            const cat = await window.clinic.catalog.create({ name: 'طµظ†ظپ ط§ط®طھط¨ط§ط±', price: 50000, description: '', cost: 10000, materials: [{ material_id: mat.id, qty: 2 }] });
            const catReload = await window.clinic.catalog.list();
            const catRow = catReload.find(c => c.id === cat.id);
            const p = await window.clinic.patients.create({ name: 'ط§ط®طھط¨ط§ط±', phone: '123', birth_date: '', gender: '', address: '', notes: '' });
            const inv = await window.clinic.invoices.create({ patient_id: p.id, date: '2026-09-11', usd_rate: 130, discount: 0, notes: '', items: [{ name: catRow.name, cost: catRow.price, qty: 1, catalog_id: cat.id, materials: [] }] });
            const matsAfter = await window.clinic.inventory.list();
            const qtyAfter = matsAfter.find(m => m.id === mat.id).quantity;
            const itemMats = inv.items[0].materials.length;
            const db = await window.clinic.db.info();
            const sync = await window.clinic.sync.driveStatus();
            const exp = await window.clinic.expenses.create({ category: '\u0623\u062e\u0631\u0649', amount: 1000, note: 'اختبار', date: '2026-09-11' });
            const recExp = await window.clinic.expenses.create({ category: '\u0625\u064a\u062c\u0627\u0631', amount: 2000, note: 'اختبار دوري', date: '2026-01-01', is_recurring: 1, recurrence: 'monthly', next_due: '2026-01-01' });
            const madeDue = await window.clinic.expenses.runDue();
            const dueList = await window.clinic.expenses.due(4000);
            const pf = await window.clinic.patients.get(p.id);
            const pfCount = pf.appointments.length + '/' + pf.invoices.length;
            await window.clinic.expenses.delete(recExp.id);
            for (const g of (await window.clinic.expenses.list()).filter(e => e.note === 'اختبار دوري')) await window.clinic.expenses.delete(g.id);
const leftover = (await window.clinic.expenses.list()).filter(e => e.note === 'اختبار دوري').length;
            if (inv.id) await window.clinic.invoices.delete(inv.id);
            if (cat.id) await window.clinic.catalog.delete(cat.id);
            if (mat.id) await window.clinic.inventory.delete(mat.id);
            await window.clinic.patients.delete(p.id);
            await window.clinic.expenses.delete(exp.id);
            const mSql = await window.clinic.mysql.test();
            const preMats = (await window.clinic.inventory.list()).length;
            const preCats = (await window.clinic.catalog.list()).length;
            const pushed = await window.clinic.mysql.push();
            const pulled = await window.clinic.mysql.pull();
            const mCats = (await window.clinic.catalog.list()).length;
            const mMats = (await window.clinic.inventory.list()).length;

            return JSON.stringify({ loginUser: login.username, rate: settings.usd_rate, patients: patients.length, statsPeriod: stats.period, printers: printers.length, catCost: catRow.cost, catMargin: catRow.margin, itemMats, qtyAfter, invTotal: inv.total, dbPath: !!db.path, driveConfig: sync.config, mysqlTest: mSql.length > 0, pushOk: !!pushed, pullOk: !!pulled, mMats, mCats, curScale: settings.currency_scale, conv: settings.currency_converted === '1', priceUsd: catRow.price_usd, preMats, preCats, madeDue, dueCount: dueList.length, pfCount, leftover });
          })()`
          const out = await win.webContents.executeJavaScript(script)
          console.log('SMOKE_OK ' + out)
        } catch (e) {
          console.log('SMOKE_FAIL ' + (e instanceof Error ? e.message : String(e)))
        }
        app.exit(0)
      }, 1500)
    })
  }



  return win
}

app.whenReady().then(() => {
  initDb()
  registerIpc(ipcMain)
  void runRecurringOnStart()
  createWindow()
  void drivePullOnStart()
  void mysqlPullOnStart()
  void supabasePullOnStart()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (e) => {
  if (!(process.env['SKIP_SYNC'] === '1')) {
    e.preventDefault()
    Promise.all([driveSyncOnQuit(), mysqlPushOnQuit(), supabasePushOnQuit()]).finally(() => app.exit(0))
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
