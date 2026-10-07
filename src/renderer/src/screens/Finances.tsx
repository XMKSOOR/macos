import { useCallback, useEffect, useMemo, useState } from 'react'
import { Field } from '../ui'
import type { Appointment, CatalogItem, Expense, Invoice, Material, Settings } from '../lib'
import { fmt, toLatinDigits, sanitizeNumberInput, parseNumber } from '../lib'

/** المدخلات الوحيدة التي يكتبها المستخدم */
interface PlanState {
  startDate: string
  numMonths: number
  capital: string
}

/** صف شهر واحد في التتبع التلقائي */
interface MonthRow {
  month: number
  key: string
  target: number
  gross: number
  general: number
  materials: number
  actual: number
  variance: number
  cum: number
  elapsed: boolean
  pct: number
}

type Tone = 'ok' | 'warn' | 'bad' | 'muted'
interface Advice {
  tone: Tone
  text: string
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** إضافة n شهر لتاريخ YYYY-MM */
function addMonths(date: string, n: number): string {
  const [y, m] = date.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

function monthShift(date: string, from: string): number {
  const [y1, m1] = from.split('-').map(Number)
  const [y2, m2] = date.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

function defaultPlan(): PlanState {
  return { startDate: todayStr(), numMonths: 6, capital: '1040000' }
}

function num(s: string | number | null | undefined): number {
  const n = Number(s ?? 0)
  return Number.isFinite(n) ? n : 0
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

export default function Finances({ settings }: { settings: Settings | null }): React.JSX.Element {
  const rate = settings?.usd_rate ?? 130

  const [plan, setPlan] = useState<PlanState>(defaultPlan)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [materials, setMaterials] = useState<Material[]>([])

  const savePlan = useCallback((p: PlanState): void => {
    window.clinic.settings
      .save({ feasibility_plan: JSON.stringify(p) })
      .catch(() => {})
  }, [])

  const debouncedSave = useMemo(() => {
    let t = 0
    return (p: PlanState): void => {
      window.clearTimeout(t)
      t = window.setTimeout(() => savePlan(p), 600)
    }
  }, [savePlan])

  useEffect(() => {
    const stored = settings?.feasibility_plan
    if (stored) {
      try {
        const o = JSON.parse(stored) as Partial<PlanState>
        const p = defaultPlan()
        const nm = o.numMonths && o.numMonths > 0 ? Math.min(36, Math.max(1, o.numMonths)) : 6
        setPlan({ startDate: o.startDate || p.startDate, numMonths: nm, capital: o.capital ?? p.capital })
        return
      } catch {
        /* fallthrough to defaults */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    debouncedSave(plan)
  }, [plan, debouncedSave])

  // ---- كل البيانات تُلتقط تلقائياً من مُدخلات البرنامج ----
  useEffect(() => {
    window.clinic.invoices
      .since(plan.startDate)
      .then(setInvoices)
      .catch(() => {})
  }, [plan.startDate])

  useEffect(() => {
    window.clinic.expenses
      .list({ from: plan.startDate, to: todayStr() })
      .then(setExpenses)
      .catch(() => {})
  }, [plan.startDate])

  useEffect(() => {
    window.clinic.appointments
      .list({})
      .then(setAppointments)
      .catch(() => {})
  }, [])

  useEffect(() => {
    window.clinic.catalog
      .list()
      .then(setCatalog)
      .catch(() => {})
  }, [])

  useEffect(() => {
    window.clinic.inventory
      .list()
      .then(setMaterials)
      .catch(() => {})
  }, [])

  const applyPlan = (patch: Partial<PlanState>): void => setPlan((p) => ({ ...p, ...patch }))

  // ---- المتغيرات التلقائية + الموتر الحسابي ----
  const src = useMemo(() => {
    const cap = num(plan.capital)
    const monthsN = Math.max(1, plan.numMonths)
    const start = plan.startDate

    // (أ) متوسط الفاتورة ومتوسط المواد من الفواتير الفعلية
    const invTotals = invoices.map((i) => num(i.total))
    const invMatCosts = invoices.map((i) => num(i.items_cost)).filter((x) => x > 0)
    // (ب) بدائل من الكتالوج إن لم توجد فواتير بعد
    const catPrices = catalog.map((c) => num(c.price)).filter((x) => x > 0)
    const catCosts = catalog.map((c) => num(c.cost)).filter((x) => x > 0)
    const matCosts = materials.map((m) => num(m.cost)).filter((x) => x > 0)

    const ticket = invTotals.length ? avg(invTotals) : avg(catPrices)
    const material = invMatCosts.length ? avg(invMatCosts) : catCosts.length ? avg(catCosts) : avg(matCosts)
    const patientNet = Math.max(0, ticket - material)

    // (ج) أيام العمل = الأيام المنقضية فعلياً من الشهر الحالي (لتوزيع اليومي على المتاح)
    const activeDays = new Set<string>([
      ...invoices.map((i) => i.date),
      ...appointments.filter((a) => a.status !== 'cancelled').map((a) => a.date)
    ]).size
    const daysElapsedThisMonth = Number(todayStr().slice(8, 10)) || 1
    const inPeriod = monthShift(todayStr(), start) >= 0
    const workDays = inPeriod ? Math.min(31, Math.max(1, daysElapsedThisMonth)) : 26

    const monthlyTarget = cap / monthsN
    const dailyTarget = monthlyTarget / workDays
    const totalPatients = patientNet > 0 ? Math.ceil(cap / patientNet) : 0
    const monthlyPatients = totalPatients / monthsN

    // ---- التتبع الشهري ----
    const months: MonthRow[] = Array.from({ length: monthsN }, (_, i) => ({
      month: i + 1,
      key: addMonths(start, i).slice(0, 7),
      target: monthlyTarget,
      gross: 0,
      general: 0,
      materials: 0,
      actual: 0,
      variance: 0,
      cum: 0,
      elapsed: monthShift(todayStr(), start) >= i,
      pct: 0
    }))
    for (const inv of invoices) {
      const mi = months.findIndex((m) => m.key === inv.date.slice(0, 7))
      if (mi >= 0) {
        months[mi].gross += num(inv.paid)
        months[mi].materials += num(inv.items_cost)
      }
    }
    for (const ex of expenses) {
      const mi = months.findIndex((m) => m.key === ex.date.slice(0, 7))
      if (mi >= 0) months[mi].general += num(ex.amount)
    }
    let cum = 0
    for (const m of months) {
      m.actual = m.gross - m.general - m.materials
      m.variance = m.actual - m.target
      m.cum = cum + m.actual
      cum = m.cum
      m.pct = m.elapsed && m.target > 0 ? Math.min(100, Math.max(0, (m.actual / m.target) * 100)) : 0
    }

    const totalActual = cum
    const totalGross = invoices.reduce((s, inv) => s + num(inv.paid), 0)
    const totalGeneral = expenses.reduce((s, ex) => s + num(ex.amount), 0)
    const totalMaterials = invoices.reduce((s, inv) => s + num(inv.items_cost), 0)

    const progress = cap > 0 ? Math.min(100, Math.max(0, (totalActual / cap) * 100)) : 0
    const remaining = Math.max(0, cap - totalActual)

    const started = !start || start > todayStr() ? 0 : Math.max(1, monthShift(todayStr(), start) + 1)
    const elapsedMonths = months.filter((m) => m.elapsed)
    const lastElapsed = elapsedMonths[elapsedMonths.length - 1]

    // ---- مؤشرات الإدارة المالية ----
    // معدل الحرق (run-rate): متوسط الصافي لكل شهر منقضي
    const runRate = started > 0 ? totalActual / started : 0
    const burn = started > 0 ? totalGeneral / started : 0
    const gapToTarget = monthlyTarget - runRate
    const forecastMonths = runRate > 0 ? remaining / runRate : 0
    const forecastKey = forecastMonths > 0 ? addMonths(start, started - 1 + Math.ceil(forecastMonths)).slice(0, 7) : ''
    const scheduleSlip = forecastMonths > 0 ? Math.max(0, Math.ceil(forecastMonths) - (monthsN - (started - 1))) : 0
    const breakEvenMonths = patientNet > 0 ? cap / patientNet : 0
    const extraCasesNeeded = patientNet > 0 && gapToTarget > 0 ? Math.ceil(gapToTarget / patientNet) : 0

    // رأس المال المجمّد في المخزون
    const inventoryValue = materials.reduce((s, m) => s + num(m.cost) * num(m.quantity), 0)
    const inventoryPct = cap > 0 ? (inventoryValue / cap) * 100 : 0
    const lowStock = materials.filter((m) => num(m.min_qty) > 0 && num(m.quantity) <= num(m.min_qty))
    const slowStock = materials.filter((m) => num(m.quantity) > 0 && num(m.cost) > 0 && num(m.quantity) * num(m.cost) > inventoryValue * 0.15)

    // أثر سعر الصرف: قيمة الفواتير المُصدَرة اليوم مقابل السعر المسجَّل وقت الإصدار
    const billedTotal = invoices.reduce((s, inv) => s + num(inv.total), 0)
    const bookedUsd = invoices.reduce((s, inv) => s + (num(inv.usd_rate) > 0 ? num(inv.total) / num(inv.usd_rate) : 0), 0)
    const fxImpact = bookedUsd * rate - billedTotal
    const avgBookedRate = bookedUsd > 0 ? billedTotal / bookedUsd : rate
    const fxDeviation = rate > 0 ? Math.abs(avgBookedRate - rate) / rate : 0
    const fxStale = billedTotal > 0 && fxDeviation > 0.5

    const thisMonth = todayStr().slice(0, 7)
    const patientsThisMonth = new Set(invoices.filter((inv) => inv.date.slice(0, 7) === thisMonth).map((inv) => inv.patient_id)).size
    const scheduledThisMonth = appointments.filter((a) => a.status === 'scheduled' && a.date.startsWith(thisMonth)).length
    const patientsNeededMonthly = monthlyPatients
    const patientsMissing = Math.max(0, Math.ceil(patientsNeededMonthly) - patientsThisMonth)

    let status: string
    let statusKind: Tone = 'muted'
    if (started === 0) status = 'لم تبدأ فترة المتابعة بعد'
    else if (cap > 0 && totalActual >= cap) {
      statusKind = 'ok'
      status = 'تم استرداد رأس المال ✓'
    } else if (lastElapsed) {
      if (lastElapsed.actual >= lastElapsed.target) {
        statusKind = 'ok'
        status = `الشهر الأخير تجاوز الهدف (+${fmt(Math.round(lastElapsed.variance))} ل.س)`
      } else {
        statusKind = 'warn'
        status = `عجز الشهر الأخير ${fmt(Math.round(Math.abs(lastElapsed.variance)))} ل.س`
      }
    } else status = 'بانتظار أول فاتورة'

    const patientsPerMonthObserved = started > 0 ? new Set(invoices.map((i) => i.patient_id)).size / started : 0
    const expenseRatio = totalGross > 0 ? totalGeneral / totalGross : 0

    return {
      cap,
      monthsN,
      start,
      workDays,
      activeDays,
      ticket,
      material,
      patientNet,
      monthlyTarget,
      dailyTarget,
      totalPatients,
      monthlyPatients,
      patientsPerMonthObserved,
      months,
      totalActual,
      totalGross,
      totalGeneral,
      totalMaterials,
      progress,
      remaining,
      started,
      thisMonth,
      patientsThisMonth,
      scheduledThisMonth,
      patientsMissing,
      patientsNeededMonthly,
      status,
      statusKind,
      runRate,
      burn,
      gapToTarget,
      forecastMonths,
      forecastKey,
      scheduleSlip,
      breakEvenMonths,
      extraCasesNeeded,
      inventoryValue,
      inventoryPct,
      lowStockCount: lowStock.length,
      slowStockCount: slowStock.length,
      fxImpact,
      avgBookedRate,
      fxDeviation,
      fxStale,
      billedTotal,
      expenseRatio
    }
  }, [plan, invoices, expenses, appointments, catalog, materials])

  /** توصيات محاسبية تلقائية مبنية على الأرقام المسجَّلة */
  const advice = useMemo<Advice[]>(() => {
    const a: Advice[] = []
    const s = src
    if (s.started === 0) {
      a.push({ tone: 'muted', text: 'تاريخ البداية في المستقبل — لم تبدأ المتابعة بعد.' })
    } else {
      a.push({
        tone: s.cap > 0 && s.totalActual >= s.cap ? 'ok' : s.runRate >= s.monthlyTarget ? 'ok' : 'warn',
        text:
          s.cap > 0 && s.totalActual >= s.cap
            ? `اكتمل استرداد رأس المال (${s.progress.toFixed(1)}%).`
            : s.runRate >= s.monthlyTarget
              ? `على المسار الصحيح: معدل الشهر ${fmt(Math.round(s.runRate))} ل.س ≥ الهدف ${fmt(Math.round(s.monthlyTarget))} ل.س.`
              : `معدل الشهر ${fmt(Math.round(s.runRate))} ل.س أقل من الهدف ${fmt(Math.round(s.monthlyTarget))} ل.س — العجز ${fmt(Math.round(s.gapToTarget))} ل.س شهرياً.`
      })
      if (s.gapToTarget > 0 && s.extraCasesNeeded > 0) {
        a.push({
          tone: 'warn',
          text: `لإغلاق الفجوة: زيادة ≈ ${s.extraCasesNeeded} حالة شهرياً، أو رفع متوسط الفاتورة من ${fmt(Math.round(s.ticket))} إلى ${fmt(Math.round(s.ticket + s.gapToTarget))} ل.س.`
        })
      }
      if (s.patientNet <= 0 && invoices.length > 0) {
        a.push({
          tone: 'bad',
          text: 'صافي الحالة ≈ 0: كلفة المواد تعادل قيمة الفاتورة — راجع التسعير أو المواد المستهلكة المسجَّلة.'
        })
      }
      if (s.forecastMonths > 0) {
        a.push({
          tone: s.scheduleSlip > 0 ? 'warn' : 'ok',
          text:
            s.scheduleSlip > 0
              ? `التعافي متوقع خلال ≈ ${Math.ceil(s.forecastMonths)} شهر — تأخير ${s.scheduleSlip} شهر عن الخطة.`
              : `التعافي متوقع خلال ≈ ${Math.ceil(s.forecastMonths)} شهر — في الموعد أو أبكر.`
        })
      }
      if (s.expenseRatio > 0.4) {
        a.push({
          tone: 'warn',
          text: `المصاريف العامة تبتلع ${(s.expenseRatio * 100).toFixed(0)}% من الإيراد — راجع البنود أو ارفع الأسعار.`
        })
      }
    }
    if (s.inventoryPct > 30) {
      a.push({
        tone: 'warn',
        text: `المخزون يستهلك ${s.inventoryPct.toFixed(0)}% من رأس المال (${fmt(Math.round(s.inventoryValue))} ل.س) — رأس مال مجمّد.`
      })
    }
    if (s.lowStockCount > 0) {
      a.push({ tone: 'bad', text: `${s.lowStockCount} مادة وصلت أو نزلت تحت الحد الأدنى — إعادة طلب ضرورية لتفادي توقف الخدمة.` })
    }
    if (s.slowStockCount > 0) {
      a.push({ tone: 'muted', text: `${s.slowStockCount} بند يستهلك أكثر من 15% من قيمة المخزون — راجع الكميات المسجَّلة.` })
    }
    if (s.fxStale) {
      a.push({
        tone: 'muted',
        text: `سعر الصرف المسجَّل في الفواتير (${fmt(Math.round(s.avgBookedRate))}) يختلف كثيراً عن الحالي (${fmt(Math.round(rate))}) — قد تكون فواتير قديمة أو بسعر خاطئ؛ تحقّق قبل الاعتماد على أرقام الفترة.`
      })
    } else if (Math.abs(s.fxImpact) > 1 && s.billedTotal > 0) {
      const pct = (s.fxImpact / s.billedTotal) * 100
      a.push({
        tone: pct >= 0 ? 'ok' : 'warn',
        text: `سعر الصرف المسجَّل (${fmt(Math.round(s.avgBookedRate))}) مقابل الحالي (${fmt(Math.round(rate))}) — أثره ${pct >= 0 ? '+' : ''}${fmt(Math.round(s.fxImpact))} ل.س على قيمة الفواتير (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%).`
      })
    }
    if (s.patientsMissing > 0) {
      a.push({ tone: 'warn', text: `ينقص ≈ ${s.patientsMissing} مريض هذا الشهر للوصول إلى هدف الحالات.` })
    }
    if (invoices.length === 0) {
      a.push({ tone: 'muted', text: 'لا فواتير منذ تاريخ البداية — سجّل فاتورة واحدة على الأقل لبدء التتبّع التلقائي.' })
    }
    return a
  }, [src, rate, invoices.length])

  const dateStrFor = (key: string): string => `${key}-15`
  const monthName = (key: string): string => {
    if (!key) return '—'
    try {
      return toLatinDigits(new Date(`${dateStrFor(key)}T00:00:00`).toLocaleDateString('ar-LB', { month: 'long', year: 'numeric' }))
    } catch {
      return key
    }
  }

  const usd = (lbp: number): string => (lbp / (rate || 130)).toFixed(2)
  const [monthsDraft, setMonthsDraft] = useState<string | null>(null)

  const maxBar = Math.max(...src.months.map((m) => Math.max(m.target, m.actual, 1)), 1)
  const toneColor = (t: Tone): string =>
    t === 'ok' ? 'var(--success)' : t === 'warn' ? 'var(--danger)' : t === 'bad' ? 'var(--danger)' : 'var(--muted)'

  return (
    <div>
      {/* ---- المدخلات: ثلاثة فقط ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>إعدادات الخطة — المدخلات</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            تكتب هنا فقط: <b>رأس المال</b> و<b>المدة</b> و<b>تاريخ البداية</b> — كل ما عداه يُحتسب تلقائياً من فواتيرك ومخزونك ومواعيدك.
          </div>
        </div>
        <div className="panel-body">
          <div className="form-grid three">
            <Field label="رأس المال المطلوب استرداده (Capital)">
              <div className="currency-row">
                <input
                  type="text"
                  dir="ltr"
                  inputMode="decimal"
                  value={plan.capital}
                  onChange={(e) => applyPlan({ capital: sanitizeNumberInput(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                  placeholder="1040000"
                />
                <span className="dual-unit">ل.س</span>
              </div>
              <div className="minor-hint" dir="ltr">
                ≈ {usd(num(plan.capital))}$
              </div>
            </Field>
            <Field label="المدة الزمنية (Months)">
              <input
                type="text"
                dir="ltr"
                inputMode="decimal"
                value={monthsDraft !== null ? monthsDraft : plan.numMonths ? String(plan.numMonths) : ''}
                onChange={(e) => {
                  const clean = sanitizeNumberInput(e.target.value)
                  setMonthsDraft(clean)
                  const n = Math.floor(parseNumber(clean))
                  if (Number.isFinite(n) && n >= 1) applyPlan({ numMonths: Math.min(36, n) })
                }}
                onBlur={() => setMonthsDraft(null)}
              />
            </Field>
            <Field label="تاريخ بداية الخطة (Start_Date)">
              <input
                type="date"
                value={plan.startDate}
                onChange={(e) => {
                  if (e.target.value) applyPlan({ startDate: e.target.value })
                }}
              />
            </Field>
          </div>
        </div>
      </div>

      {/* ---- لوحة القيادة ---- */}
      <div className="cards">
        <div className="card">
          <div className="label">الهدف المالي الشهري — رأس المال ÷ المدة</div>
          <div className="value">{fmt(Math.round(src.monthlyTarget))}</div>
          <div className="sub" dir="ltr">
            ≈ {usd(src.monthlyTarget)}$
          </div>
          <div className="sub">يومياً ≈ {fmt(Math.round(src.dailyTarget))} ل.س / {src.workDays} يوم عمل (مقدَّر تلقائياً)</div>
        </div>
        <div className="card">
          <div className="label">صافي ربح العيادة من المريض الواحد</div>
          <div className="value" style={{ color: src.patientNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {src.patientNet >= 0 ? '+' : ''}
            {fmt(Math.round(src.patientNet))}
          </div>
          <div className="sub" dir="ltr">
            {src.patientNet >= 0 ? '+' : ''}
            {usd(src.patientNet)}$
          </div>
          <div className="sub">
            فاتورة {fmt(Math.round(src.ticket))} − مواد {fmt(Math.round(src.material))} — محسوب من فواتيرك
          </div>
        </div>
        <div className="card">
          <div className="label">معدل الاسترداد الشهري (Run-rate)</div>
          <div className="value" style={{ color: src.runRate >= src.monthlyTarget ? 'var(--success)' : src.started ? 'var(--danger)' : 'var(--muted)' }}>
            {fmt(Math.round(src.runRate))}
          </div>
          <div className="sub">
            محسوب على {src.started} شهر منقضٍ · حرق المصاريف ≈ {fmt(Math.round(src.burn))} ل.س/شهر
          </div>
        </div>
        <div className="card">
          <div className="label">التعافي المتوقع — شهر استرداد رأس المال</div>
          <div className="value" style={{ fontSize: 17, color: src.scheduleSlip > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {src.forecastKey ? monthName(src.forecastKey) : '—'}
          </div>
          <div className="sub">
            {src.forecastMonths > 0
              ? src.scheduleSlip > 0
                ? `≈ ${Math.ceil(src.forecastMonths)} شهر · تأخير ${src.scheduleSlip} شهر`
                : `≈ ${Math.ceil(src.forecastMonths)} شهر · ضمن الخطة`
              : 'يحتاج بيانات فعلية'}
          </div>
        </div>
        <div className="card">
          <div className="label">نسبة الإنجاز (استرداد رأس المال)</div>
          <div className="value">{src.progress.toFixed(1)}%</div>
          <div className="goal-bar mt-8">
            <div className="goal-fill" style={{ width: `${src.progress}%`, background: src.progress >= 100 ? 'var(--success)' : 'var(--primary)' }} />
            <span>{src.progress.toFixed(1)}%</span>
          </div>
          <div className="sub">
            الربح الفعلي {fmt(Math.round(src.totalActual))} من {fmt(Math.round(src.cap))} ل.س
          </div>
        </div>
        <div className="card">
          <div className="label">المتبقي لاسترداد رأس المال</div>
          <div className="value" style={{ color: src.remaining > 0 ? 'var(--primary)' : 'var(--success)' }}>
            {fmt(Math.round(src.remaining))}
          </div>
          <div className="sub">{src.cap > 0 ? `شهر التعادل ≈ ${src.breakEvenMonths.toFixed(1)} شهر` : 'أدخل رأس المال'}</div>
        </div>
        <div className="card">
          <div className="label">رأس المال المجمّد في المخزون</div>
          <div className="value">{fmt(Math.round(src.inventoryValue))}</div>
          <div className="sub">{src.cap > 0 ? `${src.inventoryPct.toFixed(0)}% من رأس المال` : '—'} · {materials.length} بند</div>
        </div>
        <div className="card">
          <div className="label">وضع الشهر الحالي ({monthName(src.thisMonth)})</div>
          <div className="value" style={{ fontSize: 15, color: toneColor(src.statusKind) }}>
            {src.status}
          </div>
          <div className="sub">
            {src.patientsMissing > 0
              ? `تحتاج ≈ ${src.patientsMissing} مريضاً إضافياً (${src.patientsThisMonth} الآن)`
              : src.patientsThisMonth > 0
                ? `استقبلت ${src.patientsThisMonth} مريضاً — ضمن الهدف`
                : 'لا يوجد مرضى هذا الشهر بعد'}
          </div>
        </div>
      </div>

      {/* ---- المتغيرات التلقائية ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>المتغيّرات المحسوبة تلقائياً من بيانات البرنامج</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            لا تحتاج لتعبئتها — تتحدث مع كل فاتورة أو مصروف أو تعديل مخزون.
          </div>
        </div>
        <div className="panel-body">
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="card">
              <div className="label">متوسط الفاتورة (Ticket)</div>
              <div className="value" style={{ fontSize: 17 }}>{fmt(Math.round(src.ticket))}</div>
              <div className="sub">من {invoices.length} فاتورة منذ {src.start}</div>
            </div>
            <div className="card">
              <div className="label">متوسط المواد للحالة</div>
              <div className="value" style={{ fontSize: 17 }}>{fmt(Math.round(src.material))}</div>
              <div className="sub">قيمة المواد المنقوصة تلقائياً من المخزون</div>
            </div>
            <div className="card">
              <div className="label">أيام العمل في الشهر</div>
              <div className="value" style={{ fontSize: 17 }}>{src.workDays}</div>
              <div className="sub">{src.activeDays > 0 ? `${src.activeDays} يوماً فيه حركة فعلية` : 'افتراضي 26 (إجازة الجمعة)'}</div>
            </div>
            <div className="card">
              <div className="label">الحالات الفعلية الشهرية</div>
              <div className="value" style={{ fontSize: 17 }}>{src.patientsPerMonthObserved.toFixed(1)}</div>
              <div className="sub">المطلوب ≈ {src.patientsNeededMonthly.toFixed(1)} شهرياً</div>
            </div>
            <div className="card">
              <div className="label">عمولة الطبيب</div>
              <div className="value" style={{ fontSize: 17 }}>0%</div>
              <div className="sub">محسوبة على أساس أن رأس المال يُدار من صاحب العيادة</div>
            </div>
            <div className="card">
              <div className="label">أثر تغيّر سعر الصرف</div>
              {src.fxStale ? (
                <>
                  <div className="value" style={{ fontSize: 17, color: 'var(--danger)' }}>سعر قديم</div>
                  <div className="sub">
                    الفواتير سجّلت بسعر {fmt(Math.round(src.avgBookedRate))} · الحالي {fmt(Math.round(rate))} — راجع الفواتير القديمة
                  </div>
                </>
              ) : (
                <>
                  <div className="value" style={{ fontSize: 17, color: src.fxImpact >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {src.fxImpact >= 0 ? '+' : ''}
                    {fmt(Math.round(src.fxImpact))}
                  </div>
                  <div className="sub">
                    الفواتير سجّلت بسعر {fmt(Math.round(src.avgBookedRate))} · الحالي {fmt(Math.round(rate))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- التوصيات ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>قراءة إدارية وتوصيات</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            استنتاج مباشر من أرقامك — للتحديث التلقائي مع كل إدخال جديد.
          </div>
        </div>
        <div className="panel-body">
          <ul style={{ margin: 0, paddingRight: 18, lineHeight: 1.9 }}>
            {advice.map((a, i) => (
              <li key={i} style={{ color: toneColor(a.tone) }}>
                {a.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ---- رسم شهري: الفعلي مقابل الهدف ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>المقارنة الشهرية — الفعلي مقابل الهدف الثابت</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            العمود الفاتح = الهدف الثابت، العمود الداكن = الصافي الفعلي.
          </div>
        </div>
        <div className="panel-body">
          <div className="mini-chart">
            {src.months.map((m) => (
              <div key={m.month} className="mini-col" title={`${m.key} — هدف ${Math.round(m.target)} / فعلي ${Math.round(m.actual)}`}>
                <div className="mini-bars">
                  <div className="mini-bar target" style={{ height: `${(m.target / maxBar) * 100}%` }} />
                  <div
                    className={`mini-bar actual ${m.actual < 0 ? 'neg' : ''}`}
                    style={{ height: `${(Math.abs(m.actual) / maxBar) * 100}%`, opacity: m.elapsed ? 1 : 0.35 }}
                  />
                </div>
                <div className="mini-label">{m.month}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- التتبع الشهري التلقائي ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>التتبع الشهري التلقائي — مقابل الهدف الثابت</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            الإيراد = المدفوع فعلياً، المصاريف من شاشة المصاريف، والمواد = قيمة ما انقص من المخزون عند البيع.
          </div>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>الشهر</th>
                  <th>الفترة</th>
                  <th>الهدف (صافي)</th>
                  <th>الإيراد المدفوع</th>
                  <th>مصاريف عامة</th>
                  <th>مواد منقوصة</th>
                  <th>الصافي الفعلي</th>
                  <th>التباين</th>
                  <th style={{ width: 150 }}>الإنجاز</th>
                </tr>
              </thead>
              <tbody>
                {src.months.map((m) => (
                  <tr key={m.month} className={m.elapsed ? '' : 'future-row'}>
                    <td>شهر {m.month}</td>
                    <td className="muted">
                      <span dir="ltr">{m.key}</span> — {monthName(m.key)}
                    </td>
                    <td className="amount-lbp">{fmt(Math.round(m.target))}</td>
                    <td className="amount-lbp">{fmt(Math.round(m.gross))}</td>
                    <td className="amount-lbp">{fmt(Math.round(m.general))}</td>
                    <td className="amount-lbp">{fmt(Math.round(m.materials))}</td>
                    <td className="amount-lbp" style={{ fontWeight: 700, color: m.actual >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {m.actual >= 0 ? '+' : ''}
                      {fmt(Math.round(m.actual))}
                    </td>
                    <td className="amount-lbp" style={{ color: m.variance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {m.variance >= 0 ? '+' : ''}
                      {fmt(Math.round(m.variance))}
                    </td>
                    <td>
                      {m.elapsed ? (
                        <div className="goal-bar">
                          <div className="goal-fill" style={{ width: `${m.pct}%`, background: m.pct >= 100 ? 'var(--success)' : 'var(--primary)' }} />
                          <span>{Math.round(m.pct)}%</span>
                        </div>
                      ) : (
                        <span className="muted">قادم</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="muted">
                    الإجمالي
                  </td>
                  <td className="amount-lbp">{fmt(Math.round(src.monthlyTarget * src.monthsN))}</td>
                  <td className="amount-lbp">{fmt(Math.round(src.totalGross))}</td>
                  <td className="amount-lbp">{fmt(Math.round(src.totalGeneral))}</td>
                  <td className="amount-lbp">{fmt(Math.round(src.totalMaterials))}</td>
                  <td className="amount-lbp" style={{ fontWeight: 800 }}>
                    {fmt(Math.round(src.totalActual))}
                  </td>
                  <td className="amount-lbp" style={{ fontWeight: 800, color: src.totalActual >= src.cap ? 'var(--success)' : 'var(--primary)' }}>
                    {fmt(Math.round(src.totalActual - src.monthlyTarget * src.monthsN))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="muted mt-8" style={{ fontSize: 12 }}>
            الصافي الفعلي = الإيراد المدفوع − المصاريف العامة − المواد المنقوصة. التباين = الصافي الفعلي − الهدف (موجب = أسرع من الخطة، سالب = عجز).
          </div>
        </div>
      </div>

      {/* ---- مرضى ومواعيد الشهر الحالي ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>مرضى ومواعيد شهر {monthName(src.thisMonth)}</h2>
        </div>
        <div className="panel-body">
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <div className="card">
              <div className="label">مرضى زاروا العيادة هذا الشهر</div>
              <div className="value">{fmt(src.patientsThisMonth)}</div>
              <div className="sub">المطلوب شهرياً: {src.patientsNeededMonthly > 0 ? src.patientsNeededMonthly.toFixed(1) : '0'} مريض</div>
            </div>
            <div className="card">
              <div className="label">مواعيد مجدولة لهذا الشهر</div>
              <div className="value">{fmt(src.scheduledThisMonth)}</div>
              <div className="sub">من جدول المواعيد (حالة مجدول)</div>
            </div>
            <div className="card">
              <div className="label">الحالات المطلوبة لاسترداد رأس المال</div>
              <div className="value">{fmt(src.totalPatients)}</div>
              <div className="sub">عند صافي {fmt(Math.round(src.patientNet))} ل.س للحالة</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- المصروفات التفصيلية ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>المصاريف العامة الفعلية للفترة ({expenses.length})</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            من شاشة المصاريف للفترة من {src.start} حتى اليوم — تُخصم تلقائياً من الصافي.
          </div>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>التصنيف</th>
                  <th>المبلغ (ل.س)</th>
                  <th style={{ width: 140 }}>الدولار ($)</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      لا توجد مصاريف في الفترة — أضفها من شاشة المصاريف.
                    </td>
                  </tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id}>
                      <td dir="ltr">{e.date}</td>
                      <td>{e.category}</td>
                      <td className="amount-lbp">{fmt(Math.round(num(e.amount)))}</td>
                      <td dir="ltr">{(num(e.amount) / (rate || 130)).toFixed(2)}</td>
                      <td className="muted">{e.note || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {expenses.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={2} className="muted">
                      الإجمالي
                    </td>
                    <td className="amount-lbp" style={{ fontWeight: 800 }}>
                      {fmt(Math.round(src.totalGeneral))}
                    </td>
                    <td dir="ltr">{usd(src.totalGeneral)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* ---- فواتير فترة المتابعة ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>فواتير فترة المتابعة ({invoices.length})</h2>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الرقم</th>
                  <th>المريض</th>
                  <th>الإجمالي</th>
                  <th>المدفوع</th>
                  <th>مواد منقوصة</th>
                  <th>سعر الصرف</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      لا توجد فواتير منذ {src.start} — أنشئ فواتير لتتبع التقدم.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td dir="ltr">{inv.date}</td>
                      <td>#{inv.invoice_no}</td>
                      <td>{inv.patient_name}</td>
                      <td className="amount-lbp">{fmt(inv.total)}</td>
                      <td className="amount-lbp">{fmt(inv.paid)}</td>
                      <td className="amount-lbp">{fmt(Math.round(num(inv.items_cost)))}</td>
                      <td className="muted" dir="ltr">{fmt(Math.round(num(inv.usd_rate)))}</td>
                      <td>
                        {inv.status === 'paid' ? (
                          <span className="badge green">مدفوعة</span>
                        ) : inv.status === 'partial' ? (
                          <span className="badge warn">جزئية</span>
                        ) : (
                          <span className="badge red">غير مدفوعة</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {invoices.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} className="muted">
                      الإجمالي
                    </td>
                    <td className="amount-lbp" style={{ fontWeight: 800 }}>
                      {fmt(invoices.reduce((s, inv) => s + num(inv.total), 0))}
                    </td>
                    <td className="amount-lbp" style={{ fontWeight: 800 }}>
                      {fmt(Math.round(src.totalGross))}
                    </td>
                    <td className="amount-lbp">{fmt(Math.round(src.totalMaterials))}</td>
                    <td className="muted" dir="ltr">{fmt(Math.round(src.avgBookedRate))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}