import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { drivePullOnStart, driveSyncOnQuit } from './sync'
import { mysqlPullOnStart, mysqlPushOnQuit } from './mysql'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

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

            const mat = await window.clinic.inventory.create({ name: 'مادة اختبار', category: 'اختبار', unit: 'حبة', quantity: 10, min_qty: 2, cost: 5000, supplier: '', notes: '' });
            const cat = await window.clinic.catalog.create({ name: 'صنف اختبار', price: 50000, description: '', cost: 10000, materials: [{ material_id: mat.id, qty: 2 }] });
            const catReload = await window.clinic.catalog.list();
            const catRow = catReload.find(c => c.id === cat.id);
            const p = await window.clinic.patients.create({ name: 'اختبار', phone: '123', birth_date: '', gender: '', address: '', notes: '' });
            const inv = await window.clinic.invoices.create({ patient_id: p.id, date: '2026-09-11', usd_rate: 130, discount: 0, notes: '', items: [{ name: catRow.name, cost: catRow.price, qty: 1, catalog_id: cat.id, materials: [] }] });
            const matsAfter = await window.clinic.inventory.list();
            const qtyAfter = matsAfter.find(m => m.id === mat.id).quantity;
            const itemMats = inv.items[0].materials.length;
            const db = await window.clinic.db.info();
            const sync = await window.clinic.sync.driveStatus();
            const exp = await window.clinic.expenses.create({ category: 'أخرى', amount: 1000, note: 'اختبار', date: '2026-09-11' });

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

            return JSON.stringify({ loginUser: login.username, rate: settings.usd_rate, patients: patients.length, statsPeriod: stats.period, printers: printers.length, catCost: catRow.cost, catMargin: catRow.margin, itemMats, qtyAfter, invTotal: inv.total, dbPath: !!db.path, driveConfig: sync.config, mysqlTest: mSql.length > 0, pushOk: !!pushed, pullOk: !!pulled, mMats, mCats, curScale: settings.currency_scale, conv: settings.currency_converted === '1', priceUsd: catRow.price_usd, preMats, preCats });
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
  createWindow()
  void drivePullOnStart()
  void mysqlPullOnStart()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (e) => {
  if (!(process.env['SKIP_SYNC'] === '1')) {
    e.preventDefault()
    Promise.all([driveSyncOnQuit(), mysqlPushOnQuit()]).finally(() => app.exit(0))
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})