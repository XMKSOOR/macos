import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { CurrencyCell, Empty, StatusBadge } from '../ui'
import type { DashboardStats, Settings } from '../lib'
import { fmt } from '../lib'

export default function Dashboard({ settings }: { settings: Settings | null }): React.JSX.Element {
  const [period, setPeriod] = useState('7')
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    window.clinic.dashboard.stats(period).then(setStats).catch(() => {})
  }, [period])

  const rate = settings?.usd_rate ?? 130
  const incomeUsd = (stats?.income ?? 0) / rate
  const expensesUsd = (stats?.expenses ?? 0) / rate
  const unpaidUsd = (stats?.unpaid_total ?? 0) / rate
  const confTotal = (stats?.income ?? 0) + (stats?.expenses ?? 0)
  const conf = confTotal > 0 ? Math.round(((stats?.income ?? 0) / confTotal) * 100) : 0

  const low = stats?.materials_low ?? 0
  const net = (stats?.income ?? 0) - (stats?.expenses ?? 0)

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <span className="muted">الفترة:</span>
        {[
          ['7', 'آخر 7 أيام'],
          ['30', 'آخر 30 يوماً'],
          ['365', 'العام']
        ].map(([k, l]) => (
          <button key={k} className={`soft ${period === k ? '' : 'ghost'}`} onClick={() => setPeriod(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">إجمالي المرضى</div>
          <div className="value">{stats ? fmt(stats.patients_count) : '—'}</div>
          <div className="sub">مريض مسجل</div>
        </div>
        <div className="card">
          <div className="label">مواعيد اليوم</div>
          <div className="value">{stats ? fmt(stats.today_appointments) : '—'}</div>
          <div className="sub">منها {stats ? fmt(stats.upcoming_appointments) : '—'} موعد قادم</div>
        </div>
        <div className="card">
          <div className="label">الدخل المحصَّل</div>
          <div className="value">{stats ? `$${incomeUsd.toFixed(2)}` : '—'}</div>
          <div className="sub">{(stats?.income ?? 0).toLocaleString('en-US')} ل.ل</div>
        </div>
        <div className="card">
          <div className="label">المصاريف</div>
          <div className="value">{stats ? `$${expensesUsd.toFixed(2)}` : '—'}</div>
          <div className="sub">{(stats?.expenses ?? 0).toLocaleString('en-US')} ل.ل</div>
        </div>
        <div className="card">
          <div className="label">صافي الربح</div>
          <div className="value" style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {stats ? `${((net) / rate).toFixed(2)} $` : '—'}
          </div>
          <div className="sub">{fmt(net)} ل.ل</div>
        </div>
        <div className="card">
          <div className="label">الربح الأصيل (بعد كلفة البيع والمصاريف)</div>
          <div className="value" style={{ color: (stats?.margin ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {stats ? `${((stats.margin) / rate).toFixed(2)} $` : '—'}
          </div>
          <div className="sub">{fmt(stats?.margin ?? 0)} ل.ل</div>
        </div>
        <div className="card">
          <div className="label">الذمم غير المحصلة</div>
          <div className="value" style={{ color: 'var(--danger)' }}>
            {stats ? `$${unpaidUsd.toFixed(0)}` : '—'}
          </div>
          <div className="sub">{fmt(stats?.unpaid_total ?? 0)} ل.ل</div>
        </div>
        <div className="card">
          <div className="label">مواد تحت الحد الأدنى</div>
          <div className="value" style={{ color: low > 0 ? 'var(--warn)' : 'var(--success)' }}>
            {stats ? low : '—'}
          </div>
          <div className="sub">مادة بكمية حرجة</div>
        </div>
        <div className="card">
          <div className="label">نسبة التحصيل</div>
          <div className="value">{stats ? `${conf}%` : '—'}</div>
          <div className="sub">من الدخل الإجمالي</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>الدخل والمصاريف يومياً</h2>
        </div>
        <div className="panel-body">
          <div className="chart-box">
            {stats && stats.by_status.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.by_status}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="income" name="الدخل" fill="#0e7c66" />
                  <Bar dataKey="expenses" name="المصاريف" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty text="لا توجد بيانات في هذه الفترة" />
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>أحدث الفواتير</h2>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>المريض</th>
                  <th>التاريخ</th>
                  <th>المبلغ</th>
                  <th>المدفوع</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {stats && stats.recent_invoices.length > 0 ? (
                  stats.recent_invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>#{inv.invoice_no}</td>
                      <td>{inv.patient_name}</td>
                      <td>{inv.date}</td>
                      <td>
                        <CurrencyCell lbp={inv.total} rate={rate} />
                      </td>
                      <td>
                        <CurrencyCell lbp={inv.paid} rate={rate} />
                      </td>
                      <td>
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <Empty text="لا توجد فواتير بعد" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}