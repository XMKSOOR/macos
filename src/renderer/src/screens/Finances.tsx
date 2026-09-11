import { useCallback, useEffect, useMemo, useState } from 'react'
import { Field, useToast } from '../ui'
import type { Appointment, Expense, Invoice, Settings } from '../lib'
import { fmt, toLatinDigits } from '../lib'
import { CurrencyInput } from '../CurrencyInput'

interface PlanState {
  startDate: string
  numMonths: number
  capital: string
  sellingPrice: string
  unitCost: string
  doctorPct: string
  workDays: number
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
  return {
    startDate: todayStr(),
    numMonths: 6,
    capital: '1040000',
    sellingPrice: '65000',
    unitCost: '6500',
    doctorPct: '0',
    workDays: 26
  }
}

function num(s: string | number | null | undefined): number {
  const n = Number(s ?? 0)
  return Number.isFinite(n) ? n : 0
}

export default function Finances({ settings }: { settings: Settings | null }): React.JSX.Element {
  const toast = useToast()
  const rate = settings?.usd_rate ?? 130

  const [plan, setPlan] = useState<PlanState>(defaultPlan)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])

  const savePlan = useCallback((p: PlanState): void => {
    window.clinic.settings
      .save({ feasibility_plan: JSON.stringify(p) })
      .then(() => {})
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
        const wd = o.workDays && o.workDays > 0 ? o.workDays : 26
        setPlan({
          startDate: o.startDate || p.startDate,
          numMonths: nm,
          capital: o.capital ?? p.capital,
          sellingPrice: o.sellingPrice ?? p.sellingPrice,
          unitCost: o.unitCost ?? p.unitCost,
          doctorPct: o.doctorPct ?? p.doctorPct,
          workDays: wd
        })
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

  const applyPlan = (patch: Partial<PlanState>): void => setPlan((p) => ({ ...p, ...patch }))

  // ---- الموتر الحسابي (Logics & Formulas) ----
  const src = useMemo(() => {
    const cap = num(plan.capital)
    const monthsN = Math.max(1, plan.numMonths)
    const workDays = Math.max(1, plan.workDays)
    const ticket = num(plan.sellingPrice)
    const material = num(plan.unitCost)
    const doctorPct = Math.max(0, Math.min(100, num(plan.doctorPct)))
    const doctorPay = ticket * (doctorPct / 100)
    const patientNet = ticket - material - doctorPay

    // الأهداف المالية الثابتة
    const monthlyTarget = cap / monthsN
    const dailyTarget = monthlyTarget / workDays

    // الأهداف التشغيلية
    const totalPatients = patientNet > 0 ? Math.ceil(cap / patientNet) : 0
    const monthlyPatients = totalPatients > 0 ? totalPatients / monthsN : 0
    const dailyPatients = monthlyPatients > 0 ? monthlyPatients / workDays : 0

    // ---- الربط بالجداول: الدخل والمصاريف الفعلية ----
    const months: MonthRow[] = Array.from({ length: monthsN }, (_, i) => ({
      month: i + 1,
      key: addMonths(plan.startDate, i).slice(0, 7),
      target: monthlyTarget,
      gross: 0,
      general: 0,
      materials: 0,
      actual: 0,
      variance: 0,
      cum: 0,
      elapsed: monthShift(todayStr(), plan.startDate) >= i,
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
      if (m.elapsed && m.target > 0) m.pct = Math.min(100, Math.max(0, (m.actual / m.target) * 100))
      else m.pct = 0
    }

    const totalActual = cum
    const totalGross = invoices.reduce((s, inv) => s + num(inv.paid), 0)
    const totalGeneral = expenses.reduce((s, ex) => s + num(ex.amount), 0)
    const totalMaterials = invoices.reduce((s, inv) => s + num(inv.items_cost), 0)

    const progress = cap > 0 ? Math.min(100, Math.max(0, (totalActual / cap) * 100)) : 0
    const remaining = Math.max(0, cap - totalActual)

    const started = !plan.startDate || plan.startDate > todayStr() ? 0 : Math.max(1, monthShift(todayStr(), plan.startDate) + 1)
    const lastElapsed = months.filter((m) => m.elapsed).pop()

    // تحليل الشهر الحالي (مرضى/مواعيد)
    const thisMonth = todayStr().slice(0, 7)
    const patientsThisMonth = new Set(
      invoices.filter((inv) => inv.date.slice(0, 7) === thisMonth).map((inv) => inv.patient_id)
    ).size
    const scheduledThisMonth = appointments.filter((a) => a.status === 'scheduled' && a.date.startsWith(thisMonth)).length
    const patientsNeededMonthly = monthlyPatients
    const patientsMissing = Math.max(0, Math.ceil(patientsNeededMonthly) - patientsThisMonth)

    let status: string
    let statusKind: 'ok' | 'warn' | 'muted' = 'muted'
    if (started === 0) status = 'لم تبدأ فترة المتابعة بعد'
    else if (cap > 0 && totalActual >= cap) status = 'تم استرداد رأس المال ✓'
    else if (lastElapsed) {
      if (lastElapsed.actual >= lastElapsed.target) {
        statusKind = 'ok'
        status = `الشهر الأخير تجاوز الهدف (+${fmt(Math.round(lastElapsed.variance))} ل.ل)`
      } else {
        statusKind = 'warn'
        status = `عجز الشهر الأخير ${fmt(Math.round(Math.abs(lastElapsed.variance)))} ل.ل — زد المواعيد أو خفّض المصاريف`
      }
    } else status = 'بانتظار أول فاتورة'
    const pace = started > 0 && totalActual > 0 ? totalActual / started : 0
    const monthsLeft = pace > 0 ? Math.max(1, Math.ceil(remaining / pace)) : 0

    return {
      cap,
      monthsN,
      workDays,
      ticket,
      material,
      doctorPct,
      doctorPay,
      patientNet,
      monthlyTarget,
      dailyTarget,
      totalPatients,
      monthlyPatients,
      dailyPatients,
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
      monthsLeft
    }
  }, [plan, invoices, expenses, appointments])

  const dateStrFor = (key: string): string => `${key}-15`
  const monthName = (key: string): string => {
    try {
      return toLatinDigits(new Date(`${dateStrFor(key)}T00:00:00`).toLocaleDateString('ar-LB', { month: 'long', year: 'numeric' }))
    } catch {
      return key
    }
  }

  const usd = (lbp: number): string => (lbp / (rate || 130)).toFixed(2)
  const monthsDraftState = useState<string | null>(null)
  const [monthsDraft, setMonthsDraft] = monthsDraftState

  return (
    <div>
      {/* ---- مخرجات القيادة (Outputs Dashboard) ---- */}
      <div className="cards">
        <div className="card">
          <div className="label">الهدف المالي الشهري — رأس المال ÷ الأشهر</div>
          <div className="value">{fmt(Math.round(src.monthlyTarget))}</div>
          <div className="sub" dir="ltr">
            ≈ {usd(src.monthlyTarget)}$ — يُودع في حساب الاسترداد
          </div>
          <div className="sub">
            اليومي ≈ {fmt(Math.round(src.dailyTarget))} ل.ل / {src.workDays} يوم عمل (إجازة الجمعة)
          </div>
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
            تذكرة {fmt(Math.round(src.ticket))} − مواد {fmt(Math.round(src.material))} − عمولة طبيب {src.doctorPct}% (
            {fmt(Math.round(src.doctorPay))})
          </div>
        </div>
        <div className="card">
          <div className="label">المرضى المطلوبون خلال {src.monthsN} أشهر</div>
          <div className="value">{src.totalPatients > 0 ? fmt(src.totalPatients) : '—'}</div>
          <div className="sub">
            شهرياً ≈ {src.monthlyPatients > 0 ? src.monthlyPatients.toFixed(1) : '0'} — يومياً ≈{' '}
            {src.dailyPatients > 0 ? src.dailyPatients.toFixed(1) : '0'}
          </div>
          <div className="sub">بصافي ربح {fmt(Math.round(src.patientNet))} ل.ل للمريض</div>
        </div>
        <div className="card">
          <div className="label">نسبة الإنجاز (استرداد رأس المال)</div>
          <div className="value">{src.progress.toFixed(1)}%</div>
          <div className="goal-bar mt-8">
            <div className="goal-fill" style={{ width: `${src.progress}%`, background: src.progress >= 100 ? 'var(--success)' : 'var(--primary)' }} />
            <span>{src.progress.toFixed(1)}%</span>
          </div>
          <div className="sub">الربح الفعلي {fmt(Math.round(src.totalActual))} من {fmt(Math.round(src.cap))} ل.ل</div>
        </div>
        <div className="card">
          <div className="label">المتبقي لاسترداد رأس المال</div>
          <div className="value" style={{ color: src.remaining > 0 ? 'var(--primary)' : 'var(--success)' }}>
            {fmt(Math.round(src.remaining))}
          </div>
          <div className="sub">
            {src.monthsLeft > 0 ? `بمعدل الحالي ≈ ${src.monthsLeft} شهر متبقٍ` : 'اكتمل ✓'}
          </div>
        </div>
        <div className="card">
          <div className="label">وضع الشهر الحالي ({monthName(src.thisMonth)})</div>
          <div className="value" style={{ fontSize: 15, color: src.statusKind === 'ok' ? 'var(--success)' : src.statusKind === 'warn' ? 'var(--danger)' : 'var(--muted)' }}>
            {src.status}
          </div>
          <div className="sub">
            {src.patientsMissing > 0
              ? `تحتاج ≈ ${src.patientsMissing} مريضاً إضافياً هذا الشهر (${src.patientsThisMonth} زاروا حالياً)`
              : src.patientsThisMonth > 0
                ? `استقبلت ${src.patientsThisMonth} مريضاً — ضمن الهدف (${src.patientsNeededMonthly > 0 ? src.patientsNeededMonthly.toFixed(1) : '0'} شهرياً)`
                : 'لا يوجد مرضى هذا الشهر بعد'}
          </div>
        </div>
      </div>

      {/* ---- إعداد المدخلات ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>إعدادات الخطة — المدخلات</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            رأس المال، المدة، متوسط الفاتورة، تكلفة المواد، ونسبة الطبيب. تُحدَّث كل النتائج أعلاه تلقائياً.
          </div>
        </div>
        <div className="panel-body">
          <div className="form-grid four">
            <Field label="رأس المال المطلوب استرداده (Capital)">
              <CurrencyInput
                dual
                compact
                valueLbp={num(plan.capital)}
                rate={rate ?? 130}
                onChange={(lbp) => applyPlan({ capital: lbp ? String(lbp) : '0' })}
                placeholder="1040000"
              />
            </Field>
            <Field label="المدة الزمنية (Months)">
              <input
                type="number"
                min={1}
                max={36}
                value={monthsDraft !== null ? monthsDraft : String(plan.numMonths)}
                onChange={(e) => {
                  setMonthsDraft(e.target.value)
                  const n = Math.floor(Number(toLatinDigits(e.target.value)))
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
            <Field label="أيام العمل في الشهر (إجازة الجمعة)">
              <input
                type="number"
                min={1}
                max={31}
                value={plan.workDays}
                onChange={(e) => applyPlan({ workDays: Math.max(1, Math.min(31, Number(toLatinDigits(e.target.value)) || 26)) })}
              />
            </Field>
            <Field label="متوسط فاتورة المريض (Ticket_Price)">
              <CurrencyInput
                dual
                compact
                valueLbp={num(plan.sellingPrice)}
                rate={rate ?? 130}
                onChange={(lbp) => applyPlan({ sellingPrice: lbp ? String(lbp) : '0' })}
                placeholder="65000"
              />
            </Field>
            <Field label="تكلفة المواد للحالة (Material_Cost)">
              <CurrencyInput
                dual
                compact
                valueLbp={num(plan.unitCost)}
                rate={rate ?? 130}
                onChange={(lbp) => applyPlan({ unitCost: lbp ? String(lbp) : '0' })}
                placeholder="6500"
              />
            </Field>
            <Field label="نسبة الطبيب % (Doctor_Commission)">
              <input
                type="number"
                min={0}
                max={100}
                value={plan.doctorPct}
                onChange={(e) => applyPlan({ doctorPct: String(Math.max(0, Math.min(100, Number(toLatinDigits(e.target.value)) || 0))) })}
                placeholder="0"
              />
            </Field>
            <Field label="عمولة الطبيب لكل حالة">
              <div className="stat-box" style={{ fontWeight: 800, width: '100%' }}>
                {fmt(Math.round(src.doctorPay))} ل.ل
                {src.doctorPct > 0 ? ` — ${src.doctorPct}% من الفاتورة` : ' — أنت الطبيب'}
              </div>
            </Field>
          </div>
          <div className="muted mt-8" style={{ fontSize: 12 }}>
            صافي ربح العيادة من المريض = الفاتورة − المواد − عمولة الطبيب = {fmt(Math.round(src.patientNet))} ل.ل. الهدف اليومي ={' '}
            {fmt(Math.round(src.dailyTarget))} ل.ل لكل يوم عمل.
          </div>
        </div>
      </div>

      {/* ---- التتبع الشهري التلقائي ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>التتبع الشهري التلقائي — مقابل الهدف الثابت</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            الإيراد = المدفوع فعلياً من الفواتير (وليس الإجمالي). المصاريف العامة من شاشة المصاريف، والمواد = قيمة المواد المنقوصة تلقائياً من المخزون عند البيع.
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
              <div className="label">النقص المطلوب لتقفيل الهدف</div>
              <div className="value" style={{ color: src.patientsMissing > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {src.patientsMissing > 0 ? `${fmt(src.patientsMissing)} مريض` : 'ضمن الهدف'}
              </div>
              <div className="sub">≈ {src.dailyPatients > 0 ? src.dailyPatients.toFixed(1) : '0'} مريض لكل يوم عمل ({src.workDays} يوم)</div>
            </div>
          </div>
          <div className="muted mt-8" style={{ fontSize: 12 }}>
            تُحسب الأرقام تلقائياً: مرضى اليوم من عدد الفواتير (المدفوعة) هذا الشهر، والمواعيد المطلوبة من جدول المواعيد المجدولة. يؤدي ربط خدمة بموادها في الكتالوج إلى خصم قيمة المواد المنقوصة تلقائياً عند كل بيع.
          </div>
        </div>
      </div>

      {/* ---- المصروفات التفصيلية ---- */}
      <div className="panel">
        <div className="panel-head">
          <h2>المصاريف العامة الفعلية للفترة ({expenses.length})</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            من شاشة المصاريف للفترة من {plan.startDate} حتى اليوم — تُخصم تلقائياً من الصافي.
          </div>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>التصنيف</th>
                  <th>المبلغ (ل.ل)</th>
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
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      لا توجد فواتير منذ {plan.startDate} — أنشئ فواتير لتتبع التقدم.
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
                      <td>
                        {inv.status === 'paid' ? <span className="badge green">مدفوعة</span> : inv.status === 'partial' ? <span className="badge warn">جزئية</span> : <span className="badge red">غير مدفوعة</span>}
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