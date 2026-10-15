import { useCallback, useEffect, useState } from 'react'
import { Confirm, CurrencyCell, DrillHead, Empty, Field, KV, Modal, StatusBadge, useToast } from '../ui'
import type { Invoice, Role } from '../lib'
import { can, fmt } from '../lib'
import { CurrencyInput } from '../CurrencyInput'

export default function InvoiceFile({
  id,
  defaultRate,
  role,
  onClose,
  onOpenPatient,
  onChanged
}: {
  id: string
  defaultRate: number
  role: Role
  onClose: () => void
  onOpenPatient?: (id: string) => void
  onChanged: () => void
}): React.JSX.Element {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [payAmount, setPayAmount] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [printBusy, setPrintBusy] = useState(false)
  const [matNames, setMatNames] = useState<Record<string, string>>({})
  const toast = useToast()
  const canDelete = can(role, 'delete')

  const load = useCallback(() => {
    setLoading(true)
    window.clinic.invoices
      .get(id)
      .then(setInvoice)
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [id, toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    window.clinic.inventory
      .list()
      .then((ms) => {
        const map: Record<string, string> = {}
        for (const m of ms) map[m.id] = m.name
        setMatNames(map)
      })
      .catch(() => {})
  }, [])

  const rate = invoice?.usd_rate || defaultRate

  const print = (): void => {
    setPrintBusy(true)
    window.clinic.printing
      .receipt(id)
      .then((r) => toast(r.ok ? 'تم الإرسال للطابعة' : `فشلت الطباعة: ${r.error ?? ''}`, r.ok ? 'success' : 'error'))
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setPrintBusy(false))
  }

  const submitPay = (): void => {
    if (!invoice) return
    if (payAmount <= 0) {
      toast('أدخل مبلغاً صحيحاً', 'error')
      return
    }
    const remaining = invoice.total - invoice.paid
    if (payAmount > remaining) {
      toast('المبلغ أكبر من المتبقي', 'error')
      return
    }
    window.clinic.invoices
      .pay(invoice.id, payAmount)
      .then(() => {
        toast('تم تسجيل الدفعة', 'success')
        setPaying(false)
        load()
        onChanged()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const remove = (): void => {
    window.clinic.invoices
      .delete(id)
      .then(() => {
        toast('تم حذف الفاتورة', 'success')
        onChanged()
        onClose()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const remaining = invoice ? invoice.total - invoice.paid : 0

  return (
    <>
      <div className="drill-page">
        <DrillHead crumb="الفواتير" current={invoice ? `فاتورة #${invoice.invoice_no}` : 'فاتورة'} onBack={onClose}>
          <button className="soft small" disabled={printBusy || !invoice} onClick={print}>
            🖨 {printBusy ? '...' : 'طباعة الإيصال'}
          </button>
          <button
            className="soft small"
            disabled={!invoice || invoice.status === 'paid'}
            onClick={() => {
              setPayAmount(Math.max(0, remaining))
              setPaying(true)
            }}
          >
            تسجيل دفعة
          </button>
          {canDelete && (
            <button className="danger-ghost small" disabled={!invoice} onClick={() => setDeleting(true)}>
              حذف
            </button>
          )}
        </DrillHead>

        {invoice && (
          <div className="drill-summary">
            <span className="muted">
              <StatusBadge status={invoice.status} /> — الإجمالي <CurrencyCell lbp={invoice.total} rate={rate} /> — المتبقي{' '}
              <CurrencyCell lbp={remaining} rate={rate} />
            </span>
          </div>
        )}

        <div className="drill-body">
          {loading ? (
            <div className="muted">جاري التحميل...</div>
          ) : !invoice ? (
            <Empty text="لم يتم العثور على الفاتورة" />
          ) : (
            <>
              <div className="panel">
                <div className="panel-head">
                  <h2>بيانات الفاتورة</h2>
                </div>
                <div className="panel-body">
                  <div className="meta-grid">
                    <KV label="المريض">
                      {invoice.patient_id && onOpenPatient ? (
                        <button className="link" onClick={() => onOpenPatient(invoice.patient_id)}>
                          {invoice.patient_name}
                        </button>
                      ) : (
                        invoice.patient_name || '—'
                      )}
                    </KV>
                    <KV label="الهاتف">
                      <span dir="ltr">{invoice.patient_phone || '—'}</span>
                    </KV>
                    <KV label="التاريخ">{invoice.date}</KV>
                    <KV label="سعر الصرف">{invoice.usd_rate} ل.س/$</KV>
                    <KV label="سجّلها">{invoice.created_by || '—'}</KV>
                    <KV label="الحالة">
                      <StatusBadge status={invoice.status} />
                    </KV>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>بنود الفاتورة ({(invoice.items ?? []).length})</h2>
                </div>
                <div className="panel-body">
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>البيان</th>
                          <th>الكمية</th>
                          <th>السعر</th>
                          <th>المجموع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(invoice.items ?? []).map((it) => (
                          <tr key={it.id}>
                            <td>
                              {it.name}
                              {it.materials.length > 0 && (
                                <div className="muted" style={{ fontSize: 11 }}>
                                  المستهلك: {it.materials.map((m) => `${matNames[m.material_id] ?? 'صنف محذوف'} ×${m.qty}`).join('، ')}
                                </div>
                              )}
                            </td>
                            <td>{it.qty}</td>
                            <td>{fmt(it.cost)}</td>
                            <td>
                              <CurrencyCell lbp={it.cost * it.qty} rate={rate} />
                            </td>
                          </tr>
                        ))}
                        {(invoice.items ?? []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="muted center">
                              لا توجد بنود
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} style={{ fontWeight: 700 }}>
                            المجموع قبل الخصم
                          </td>
                          <td>
                            <CurrencyCell lbp={invoice.subtotal} rate={rate} />
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} style={{ fontWeight: 700 }}>
                            الخصم
                          </td>
                          <td>
                            <CurrencyCell lbp={invoice.discount} rate={rate} />
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} style={{ fontWeight: 800 }}>
                            الإجمالي
                          </td>
                          <td style={{ fontWeight: 800 }}>
                            <CurrencyCell lbp={invoice.total} rate={rate} />
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} style={{ fontWeight: 700, color: 'var(--success)' }}>
                            المدفوع
                          </td>
                          <td>
                            <CurrencyCell lbp={invoice.paid} rate={rate} />
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} style={{ fontWeight: 700, color: 'var(--danger)' }}>
                            المتبقي
                          </td>
                          <td>
                            <CurrencyCell lbp={remaining} rate={rate} />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {invoice.notes && <p className="muted mt-8">{invoice.notes}</p>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {paying && invoice && (
        <Modal
          title={`تسجيل دفعة — فاتورة #${invoice.invoice_no}`}
          onClose={() => setPaying(false)}
          footer={
            <>
              <button onClick={submitPay}>تسجيل</button>
              <button className="ghost" onClick={() => setPaying(false)}>
                إلغاء
              </button>
            </>
          }
        >
          <div className="form-grid">
            <KV label="المريض">{invoice.patient_name}</KV>
            <KV label="الإجمالي">
              <CurrencyCell lbp={invoice.total} rate={rate} />
            </KV>
            <KV label="المدفوع سابقاً">
              <CurrencyCell lbp={invoice.paid} rate={rate} />
            </KV>
            <KV label="المتبقي">
              <CurrencyCell lbp={remaining} rate={rate} />
            </KV>
          </div>
          <Field label="مبلغ الدفعة (ل.س أو $)">
            <CurrencyInput dual valueLbp={payAmount} rate={rate} onChange={setPayAmount} />
          </Field>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            بعد الدفعة يبقى: {(remaining - payAmount).toLocaleString('en-US')} ل.س = {((remaining - payAmount) / rate).toFixed(2)} $
          </p>
        </Modal>
      )}

      {deleting && invoice && (
        <Confirm
          title="حذف فاتورة"
          message={`حذف الفاتورة #${invoice.invoice_no}؟ (يتطلب صلاحية مدير)`}
          onConfirm={remove}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  )
}
