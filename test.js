/*
 * test.js — اختبار آلي (headless) لوظائف البرنامج الأساسية:
 *   1) الفواتير (إنشاء، بنود، مبالغ، USD، الدفع) وخصم المخزون.
 *   2) المخزون (إنشاء/تعديل صنف، حركة الكمية، فاتورة مشتريات وتقسيم الكلفة).
 *   3) المصاريف (إنشاء/حذف، تحويل USD، مصروف مشتريات).
 *   4) المزامنة بين عدة نسخ (نسختان من نفس الأصل: رفع/سحب، انتشار الحذف،
 *      قاعدة «المحلي يفوز»، واستبعاد مفاتيح حالة المزامنة).
 *
 * يعمل عبر تجميع كود العملية الرئيسية (src/main) بـ esbuild مع بديل لـ electron،
 * ثم تشغيل الاختبار في نفس العملية على مجلدات بيانات مؤقتة منفصلة.
 *
 * التشغيل:  node test.js
 * ملاحظة: يحتاج node_modules فقط (esbuild و node-sqlite3-wasm).
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const esbuild = require('esbuild')

const ROOT = __dirname
const SMOKE = path.join(ROOT, '.smoke')
const STUB = path.join(SMOKE, '_electron_stub.ts')
const ENTRY = path.join(SMOKE, '_test_entry.ts')
const BUNDLE = path.join(SMOKE, '_test_bundle.mjs')

let pass = 0
let fail = 0
function check(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  PASS  ' + name)
  } else {
    fail++
    console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))
  }
}
function section(t) {
  console.log('\n=== ' + t + ' ===')
}

async function buildApi() {
  fs.mkdirSync(SMOKE, { recursive: true })
  fs.writeFileSync(
    STUB,
    "export const app = { getPath: (name: string) => process.env.SMOKE_USER_DATA || '.' }\n",
    'utf-8'
  )
  fs.writeFileSync(
    ENTRY,
    "export * from '../src/main/db'\n" + "export * from '../src/main/syncDelta'\n" + "export * from '../src/main/syncCore'\n",
    'utf-8'
  )
  await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: BUNDLE,
    alias: { electron: STUB },
    external: ['node-sqlite3-wasm'],
    logLevel: 'error'
  })
  return import(pathToFileURL(BUNDLE).href)
}

function makeDirs(base) {
  const a = path.join(base, 'A')
  const b = path.join(base, 'B')
  fs.mkdirSync(path.join(a, 'data'), { recursive: true })
  fs.mkdirSync(path.join(b, 'data'), { recursive: true })
  return { a, b }
}

async function main() {
  const api = await buildApi()
  const base = path.join(os.tmpdir(), 'clinic-test-' + Date.now())
  const { a: dirA, b: dirB } = makeDirs(base)
  console.log('work dir: ' + base)

  const rows = (t) => {
    try {
      return api.getDb().prepare('SELECT * FROM "' + t + '"').all()
    } catch {
      return []
    }
  }
  const count = (t, where) => {
    try {
      const r = api
        .getDb()
        .prepare('SELECT COUNT(*) AS c FROM "' + t + '"' + (where ? ' WHERE ' + where : ''))
        .get()
      return Number(r && r.c)
    } catch {
      return 0
    }
  }
  const one = (t, where) => {
    try {
      return api.getDb().prepare('SELECT * FROM "' + t + '" WHERE ' + where).get()
    } catch {
      return undefined
    }
  }
  let booted = false
  const useA = () => {
    process.env.SMOKE_USER_DATA = dirA
    if (!booted) {
      api.initDb()
      booted = true
    } else api.reopenDb()
  }
  const useB = () => {
    process.env.SMOKE_USER_DATA = dirB
    if (!booted) {
      api.initDb()
      booted = true
    } else api.reopenDb()
  }

  const INSERT_ORDER = [
    'users',
    'patients',
    'patient_medications',
    'medicines',
    'materials',
    'catalog',
    'catalog_materials',
    'appointments',
    'invoices',
    'invoice_items',
    'invoice_materials',
    'stock_movements',
    'expenses',
    'settings'
  ]
  const DELETE_ORDER = [
    'invoice_materials',
    'invoice_items',
    'invoices',
    'appointments',
    'catalog_materials',
    'stock_movements',
    'catalog',
    'materials',
    'expenses',
    'patient_medications',
    'medicines',
    'patients',
    'users',
    'settings'
  ]

  // ===================================================================
  section('تهيئة القاعدة + زرع البيانات الافتراضية')
  useA()
  check('initDb يفتح clinic.db', api.getDbPath().endsWith('clinic.db'), api.getDbPath())
  check('getDb يعرّض prepare()', typeof api.getDb().prepare === 'function')
  const mat0 = api.listMaterials()[0]
  check('المواد الافتراضية مزروعة', !!mat0, api.listMaterials().length)

  // نسخة ثانية مطابقة تماماً (نفس الأصل) لمحاكاة جهاز آخر
  api.backupDatabase(path.join(dirB, 'data', 'clinic.db'))
  check('أُنشئت النسخة الثانية', fs.existsSync(path.join(dirB, 'data', 'clinic.db')))

  // ===================================================================
  section('الفواتير: المبالغ و USD وخصم المخزون')
  const rate = Number(api.getSettings().usd_rate) || 141
  const patient = api.createPatient({
    name: 'Test Patient',
    phone: '0700000000',
    birth_date: '',
    gender: 'male',
    address: '',
    notes: ''
  })
  check('إنشاء مريض', Number(patient.id) > 0, patient.id)

  const q0 = Number(api.listMaterials().find((m) => m.id === mat0.id).quantity)
  const inv = api.createInvoice({
    patient_id: patient.id,
    date: new Date().toISOString().slice(0, 10),
    usd_rate: rate,
    discount: 50,
    notes: '',
    user_name: 'Tester',
    items: [{ name: 'Filling', cost: 100, qty: 3, catalog_id: null, materials: [{ material_id: mat0.id, qty: 2 }] }]
  })
  check('إنشاء فاتورة', Number(inv.id) > 0, inv.id)
  check('subtotal = cost*qty', Number(inv.subtotal) === 300, inv.subtotal)
  check('total = subtotal - discount', Number(inv.total) === 250, inv.total)
  check('total_usd = round(total/rate,2)', Number(inv.total_usd) === Math.round((250 / rate) * 100) / 100, inv.total_usd)
  check('بند الفاتورة محفوظ', (inv.items || []).length === 1, inv.items && inv.items.length)
  check('مواد البند محفوظة', (inv.items[0].materials || []).length === 1)

  const qAfter = Number(api.listMaterials().find((m) => m.id === mat0.id).quantity)
  check('الفاتورة خصمت المخزون (sale)', qAfter === q0 - 2, { before: q0, after: qAfter })
  check('سجل حركة بيع مسجّل', count('stock_movements', "operation='sale'") >= 1)

  const paidInv = api.addPayment(inv.id, 250)
  check('الدفع = الإجمالي → مدفوعة', paidInv.status === 'paid', paidInv.status)
  api.addPayment(inv.id, -250)
  check('دفعة سالبة تعيد الحالة', api.getInvoice(inv.id).paid === 0)

  const since = new Date(Date.now() - 86400000).toISOString()
  check('listInvoicesSince يجد الفاتورة', api.listInvoicesSince(since).length >= 1)

  // ===================================================================
  section('المخزون: الكلفة والكمية والحركة وفاتورة المشتريات')
  const made = api.createMaterial({
    name: 'Test Material',
    category: 'cat',
    unit: 'pc',
    quantity: 7,
    min_qty: 1,
    cost: 1000,
    supplier: 'sup',
    notes: ''
  })
  check('إنشاء صنف', Number(made.id) > 0, made.id)
  check('total المحسوب = cost*quantity', Number(made.total) === 7000, made.total)
  check('cost_usd = round(cost/rate,2)', Number(made.cost_usd) === Math.round((1000 / rate) * 100) / 100, made.cost_usd)

  // ===================================================================
  section('المخزون: الاجمالي لا يأتي فارغاً إطلاقاً (إصلاح الأصناف القديمة)')
  const emptyTotal = api.createMaterial({
    name: 'Empty Total Item',
    category: '',
    unit: 'pc',
    quantity: 8,
    min_qty: 1,
    cost: 250,
    supplier: '',
    notes: '',
    total: 0
  })
  check('إنشاء صنف بإجمالٍ صريح 0', Number(emptyTotal.id) > 0, emptyTotal.id)
  check('قاعدة: التخزين احتفظ بـ 0 كما أدخل المستخدم', Number(one('materials', 'id=' + emptyTotal.id).total) === 0)
  const listedTotal = Number(api.listMaterials().find((m) => m.id === emptyTotal.id).total)
  check('listMaterials لا يُرجع إجمالياً فارغاً — يشتق = cost*quantity', listedTotal === 2000, listedTotal)
  const noEmpty = api.listMaterials().filter((m) => m.quantity > 0 && m.cost > 0).filter((m) => !m.total || Number(m.total) <= 0)
  check('لا صف واحد بإجمالٍ فارغ بين أصناف الكلفة والكمية', noEmpty.length === 0, noEmpty.map((m) => m.name))
  api.repairZeroMaterialTotals()
  check('إصلاح الإقلاع يكتب الإجمالي في القاعدة', Number(one('materials', 'id=' + emptyTotal.id).total) === 2000)

  const dashInv = Number(api.dashboardStats('365').inventory_value)
  const sumTotals = api.listMaterials().reduce((s, m) => s + (Number(m.total) || 0), 0)
  check('لوحة التحكم: الرصيد المجمّد = مجموع الإجمالي (لا التكلفة×الكمية)', dashInv === sumTotals, { dashboard: dashInv, sum: sumTotals })

  const zeroQty = api.createMaterial({
    name: 'Zero Qty Item',
    category: '',
    unit: 'pc',
    quantity: 0,
    min_qty: 0,
    cost: 25,
    supplier: '',
    notes: '',
    total: 0
  })
  const zListed = Number(api.listMaterials().find((m) => m.id === zeroQty.id).total)
  check('صنف بكمية 0: الإجمالي = الكلفة (الكمية تُعامَل كـ 1)', zListed === 25, zListed)
  const negQty = api.createMaterial({
    name: 'Neg Qty Item',
    category: '',
    unit: 'pc',
    quantity: -3,
    min_qty: 0,
    cost: 776,
    supplier: '',
    notes: '',
    total: 0
  })
  const nListed = Number(api.listMaterials().find((m) => m.id === negQty.id).total)
  check('صنف بكمية سالبة: الإجمالي = الكلفة (لا سالب/صفر)', nListed === 776, nListed)

  api.adjustStock(made.id, -3, 'adjust', '', 'Tester', 'test')
  check('adjustStock يغيّر الكمية', Number(one('materials', 'id=' + made.id).quantity) === 4)

  const beforePur = Number(one('materials', 'id=' + made.id).quantity)
  const expPur = api.receiveMaterialInvoice({
    category: 'purchases',
    amount: 6000,
    note: 'stock purchase',
    date: new Date().toISOString().slice(0, 10),
    material_id: made.id,
    quantity: 3,
    created_by: 'Tester'
  })
  const mAfterPur = one('materials', 'id=' + made.id)
  check('مصروف المشتريات أُنشئ', Number(expPur.id) > 0, expPur.id)
  check('quantity زادت بالوحدات المشتراة', Number(mAfterPur.quantity) === beforePur + 3, mAfterPur.quantity)
  check('cost = round(amount/quantity)', Number(mAfterPur.cost) === Math.round(6000 / 3), mAfterPur.cost)
  check('total = quantity*cost بعد الشراء', Number(mAfterPur.total) === Number(mAfterPur.quantity) * Number(mAfterPur.cost), mAfterPur.total)
  check('حركة مخزون add مسجّلة', count('stock_movements', "operation='add'") >= 1)

  // ===================================================================
  section('المصاريف: الإنشاء و USD')
  const exp = api.createExpense({
    category: 'supplies',
    amount: 2500,
    note: 'tools',
    date: new Date().toISOString().slice(0, 10),
    created_by: 'Tester'
  })
  check('إنشاء مصروف', Number(exp.id) > 0, exp.id)
  check('amount_usd = round(amount/rate,2)', Number(exp.amount_usd) === Math.round((2500 / rate) * 100) / 100, exp.amount_usd)
  check('listExpenses يجد المصروف', api.listExpenses().some((e) => e.id === exp.id))

  // ===================================================================
  section('المزامنة: رفع/سحب بين نسختين من نفس الأصل')
  // اجعل النسختين تشتركان في خط أساس = الحالة المزروعة (كما لو زامنتا سابقاً)
  const cloud = {}
  for (const t of INSERT_ORDER) {
    cloud[t] = rows(t)
    api.saveBaseline('cloud', t, cloud[t])
  }
  useB()
  for (const t of INSERT_ORDER) api.saveBaseline('cloud', t, rows(t))
  useA()

  // عدّل المحلي (A) ثم ابنِ خطة الرفع وطبّقها على «السحابة»
  api.createExpense({
    category: 'rent',
    amount: 1000,
    note: 'move',
    date: new Date().toISOString().slice(0, 10),
    created_by: 'Tester'
  })
  const pkCol = (t) => api.pkColumn(t)
  const applyPlan = (t, plan) => {
    const pk = pkCol(t)
    const map = new Map((cloud[t] || []).map((r) => [String(r[pk]), r]))
    for (const r of plan.upsert) map.set(String(r[pk]), r)
    for (const id of plan.deletes) map.delete(String(id))
    cloud[t] = [...map.values()]
  }
  let plan
  for (const t of INSERT_ORDER) {
    plan = api.planPush('cloud', t, rows(t))
    applyPlan(t, plan)
    api.saveBaseline('cloud', t, rows(t))
  }
  const fpAfterPush = api.fingerprintDb().hash
  const invRow = cloud.invoices.find((r) => Number(r.id) === Number(inv.id))
  check('خطة الرفع تحمل الفاتورة الجديدة', !!invRow)
  check('السحابة تحمل الكمية المخفّضة من الفاتورة', Number(cloud.materials.find((m) => m.id === mat0.id).quantity) === q0 - 2)

  // B يسحب ويدمج
  useB()
  const counts = api.mergeIntoLocal('cloud', cloud, DELETE_ORDER, INSERT_ORDER)
  check('الدمج أدرج صفوفاً جديدة', counts.inserted > 0, counts)
  check('B استلم المريض', count('patients', "name='Test Patient'") === 1)
  check('B استلم الفاتورة', count('invoices', 'id=' + inv.id) === 1)
  check('B استلم مصروف الإيجار', count('expenses', "category='rent'") === 1)
  const mB = one('materials', 'id=' + mat0.id)
  check('B حصل على نفس كمية المخزون', Number(mB.quantity) === q0 - 2, mB.quantity)
  check('B حصل على كلفة/إجمالي الصنف المشترى', Number(one('materials', 'id=' + made.id).total) === Number(mAfterPur.total))
  check(
    'النسختان متطابقتان بعد المزامنة (بصمة واحدة)',
    api.fingerprintDb().hash === fpAfterPush,
    { A: fpAfterPush, B: api.fingerprintDb().hash }
  )

  // انتشار الحذف: A يحذف مصروف الإيجار ثم يُرفع الحذف إلى B
  useA()
  const rentId = cloud.expenses.find((e) => e.category === 'rent').id
  api.deleteExpense(rentId)
  let expenseDeletePlan
  for (const t of INSERT_ORDER) {
    plan = api.planPush('cloud', t, rows(t))
    if (t === 'expenses') expenseDeletePlan = plan
    applyPlan(t, plan)
    api.saveBaseline('cloud', t, rows(t))
  }
  check('خطة الرفع تحمل حذف المصروف', (expenseDeletePlan.deletes || []).map(String).includes(String(rentId)), expenseDeletePlan.deletes)
  useB()
  api.mergeIntoLocal('cloud', cloud, DELETE_ORDER, INSERT_ORDER)
  check('الحذف انتشر إلى B', count('expenses', "category='rent'") === 0)

  // قاعدة «المحلي يفوز»: إن عدّل B الصف ولم يعدّل A نفس الصف فسابقاً، يبقى تعديل B
  useB()
  api.updatePatient(patient.id, { name: 'B Local Edit' })
  useA()
  api.updatePatient(patient.id, { name: 'A Remote Edit' })
  for (const t of INSERT_ORDER) applyPlan(t, api.planPush('cloud', t, rows(t)))
  useB()
  api.mergeIntoLocal('cloud', cloud, DELETE_ORDER, INSERT_ORDER)
  check('المحلي يفوز عند التعارض', one('patients', 'id=' + patient.id).name === 'B Local Edit', one('patients', 'id=' + patient.id).name)

  // ===================================================================
  section('استبعاد مفاتيح حالة المزامنة من الرفع')
  useA()
  api.saveSettings({ sync_state_cloud: '{"x":1}' })
  api.saveSettings({ sync_transport: 'cloud' })
  const settingsPlan = api.planPush('cloud', 'settings', rows('settings'))
  const pushedKeys = settingsPlan.upsert.map((r) => String(r.key)).filter((k) => api.isMetaSettingKey(k))
  check('مفاتيح sync_state_*/sync_transport لا تُرفع', pushedKeys.length === 0, pushedKeys)
  check('isMetaSettingKey يميّز المفاتيح', api.isMetaSettingKey('sync_state_cloud') && api.isMetaSettingKey('sync_transport'))

  // ===================================================================
  console.log('\n---------------------------------------')
  console.log('  RESULT: ' + pass + ' passed, ' + fail + ' failed')
  console.log('  work dir: ' + base)
  console.log('---------------------------------------')
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('\nHARNESS ERROR: ' + (e && e.message ? e.message : e))
  if (e && e.stack) console.error(e.stack)
  process.exit(1)
})
