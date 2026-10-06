import { useCallback, useEffect, useMemo, useState } from 'react'
import { Confirm, CurrencyCell, Empty, Field, Modal, SearchBox, StatusBadge, useToast } from '../ui'
import ExcelBar from '../excel'
import type { CatalogItem, Invoice, Material, Patient, Role, Settings } from '../lib'
import { can, fmt, today, toLatinDigits } from '../lib'
import { CurrencyInput } from '../CurrencyInput'

interface Line {
  key: number
  name: string
  cost: number
  qty: number
  catalog_id: number | null
  materials: { material_id: number; qty: number }[]
}

let lineKey = 1

export default function Billing({
  settings,
  role,
  onOpenPatient
}: {
  settings: Settings | null
  role: Role
  onOpenPatient?: (id: number) => void
}): React.JSX.Element {
  const [list, setList] = useState<Invoice[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [detailFull, setDetailFull] = useState<Invoice | null>(null)
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [deleting, setDeleting] = useState<Invoice | null>(null)
  const [printBusy, setPrintBusy] = useState(false)
  const toast = useToast()
  const rate = settings?.usd_rate ?? 130
  const canDelete = can(role, 'delete')

  const load = useCallback(
    (term?: string, status?: string) => {
      window.clinic.invoices
        .list(term)
        .then((rows) => {
          const s = (status ?? statusFilter).trim()
          setList(s ? rows.filter((r: Invoice) => r.status === s) : rows)
        })
        .catch((e) => toast(e.message, 'error'))
    },
    [statusFilter, toast]
  )

  useEffect(() => {
    load(search, statusFilter)
  }, [load, search, statusFilter])

  const loadDetail = useCallback((id: number) => {
    window.clinic.invoices.get(id).then(setDetailFull).catch(() => {})
  }, [])

  const submitPay = (): void => {
    if (!paying) return
    if (payAmount <= 0) {
      toast('أدخل مبلغاً صحيحاً', 'error')
      return
    }
    const remaining = paying.total - paying.paid
    if (payAmount > remaining) {
      toast('المبلغ أكبر من المتبقي', 'error')
      return
    }
    window.clinic.invoices
      .pay(paying.id, payAmount)
      .then((inv) => {
        toast('تم تسجيل الدفعة', 'success')
        setPaying(null)
        load(search, statusFilter)
        setDetail(inv)
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const print = (): void => {
    if (!detail) return
    setPrintBusy(true)
    window.clinic.printing
      .receipt(detail.id)
      .then((res) => {
        const r = res as { ok: boolean; error?: string }
        toast(r.ok ? 'تم الإرسال للطابعة' : `فشلت الطباعة: ${r.error ?? ''}`, r.ok ? 'success' : 'error')
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setPrintBusy(false))
  }

  const remove = (): void => {
    if (!deleting) return
    window.clinic.invoices
      .delete(deleting.id)
      .then(() => {
        toast('تم الحذف', 'success')
        load(search, statusFilter)
      })
      .catch((e) => toast(e.message, 'error'))
    setDeleting(null)
  }

  return (
    <div>
      <div className="panel">
        <div className="panel-head">
          <h2>الفواتير والدفعات</h2>
          <div className="toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="رقم / مريض / هاتف..." />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">كل الحالات</option>
              <option value="unpaid">غير مدفوعة</option>
              <option value="partial">مدفوعة جزئياً</option>
              <option value="paid">مدفوعة</option>
            </select>
            <ExcelBar
              schema="invoices"
              title="الفواتير"
              buildRows={() =>
                list.map((inv) => ({
                  invoice_no: inv.invoice_no,
                  patient_name: inv.patient_name ?? '',
                  date: inv.date,
                  usd_rate: inv.usd_rate,
                  subtotal: inv.subtotal,
                  discount: inv.discount,
                  total: inv.total,
                  paid: inv.paid,
                  status: inv.status
                }))
              }
            />
            <button onClick={() => setShowEditor(true)}>+ فاتورة جديدة</button>
          </div>
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
                  <th>المتبقي</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <Empty text="لا توجد فواتير" />
                    </td>
                  </tr>
                ) : (
                  list.map((inv) => {
                    const remaining = inv.total - inv.paid
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 700 }}>#{inv.invoice_no}</td>
                        <td>
                          {inv.patient_id && onOpenPatient ? (
                            <button className="link" onClick={() => onOpenPatient(inv.patient_id)}>
                              {inv.patient_name}
                            </button>
                          ) : (
                            inv.patient_name
                          )}
                        </td>
                        <td>{inv.date}</td>
                        <td>
                          <CurrencyCell lbp={inv.total} rate={inv.usd_rate || rate} />
                        </td>
                        <td>
                          <CurrencyCell lbp={inv.paid} rate={inv.usd_rate || rate} />
                        </td>
                        <td>
                          <CurrencyCell lbp={remaining} rate={inv.usd_rate || rate} />
                        </td>
                        <td>
                          <StatusBadge status={inv.status} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="soft small"
                              onClick={() => {
                                setDetail(inv)
                                loadDetail(inv.id)
                              }}
                            >
                              عرض
                            </button>
                            <button
                              className="ghost small"
                              onClick={() => {
                                setPaying(inv)
                                setPayAmount(inv.total - inv.paid)
                              }}
                              disabled={inv.status === 'paid'}
                            >
                              دفعة
                            </button>
                            {canDelete && (
                              <button className="danger-ghost small" onClick={() => setDeleting(inv)}>
                                حذف
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showEditor && (
        <InvoiceEditor
          defaultRate={rate}
          onClose={() => setShowEditor(false)}
          onSaved={(inv) => {
            setShowEditor(false)
            setDetail(inv)
            loadDetail(inv.id)
            load(search, statusFilter)
          }}
        />
      )}

      {detail && (
        <Modal
          title={`فاتورة #${detail.invoice_no}`}
          onClose={() => setDetail(null)}
          wide
          footer={
            <>
              <button onClick={print} disabled={printBusy}>
                🖨 {printBusy ? 'جاري الطباعة...' : 'طباعة الإيصال'}
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setPaying(detail)
                  setPayAmount(detail.total - detail.paid)
                }}
                disabled={detail.status === 'paid'}
              >
                تسجيل دفعة
              </button>
              <button className="danger-ghost" onClick={() => setDetail(null)}>
                إغلاق
              </button>
            </>
          }
        >
          <DetailBody invoice={detailFull ?? detail} rate={detail.usd_rate || rate} />
        </Modal>
      )}

      {paying && <PayModal invoice={paying} amount={payAmount} setAmount={setPayAmount} onSave={submitPay} onClose={() => setPaying(null)} />}

      {deleting && (
        <Confirm
          title="حذف فاتورة"
          message={`حذف الفاتورة #${deleting.invoice_no}؟ (يتطلب صلاحية مدير)`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function DetailBody({ invoice, rate }: { invoice: Invoice; rate: number }): React.JSX.Element {
  const remaining = invoice.total - invoice.paid
  return (
    <div>
      <div className="form-grid" style={{ marginBottom: 14 }}>
        <div>
          <div className="muted">المريض</div>
          <div style={{ fontWeight: 700 }}>{invoice.patient_name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{invoice.patient_phone}</div>
        </div>
        <div>
          <div className="muted">التاريخ</div>
          <div>{invoice.date}</div>
        </div>
        <div>
          <div className="muted">سعر الصرف</div>
          <div>{invoice.usd_rate} ل.س/$</div>
        </div>
        <div>
          <div className="muted">أجرها</div>
          <div>{invoice.created_by}</div>
        </div>
      </div>
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
                      المستهلك: {it.materials.map((m) => `#${m.material_id} ×${m.qty}`).join('، ')}
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
  )
}

function PayModal({
  invoice,
  amount,
  setAmount,
  onSave,
  onClose
}: {
  invoice: Invoice
  amount: number
  setAmount: (n: number) => void
  onSave: () => void
  onClose: () => void
}): React.JSX.Element {
  const rate = invoice.usd_rate || 130
  const remaining = invoice.total - invoice.paid
  return (
    <Modal
      title={`تسجيل دفعة — فاتورة #${invoice.invoice_no}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onSave}>تسجيل</button>
          <button className="ghost" onClick={onClose}>
            إلغاء
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div>
          <div className="muted">المريض</div>
          <div style={{ fontWeight: 700 }}>{invoice.patient_name}</div>
        </div>
        <div>
          <div className="muted">الإجمالي</div>
          <div>
            <CurrencyCell lbp={invoice.total} rate={rate} />
          </div>
        </div>
        <div>
          <div className="muted">المدفوع سابقاً</div>
          <div>
            <CurrencyCell lbp={invoice.paid} rate={rate} />
          </div>
        </div>
        <div>
          <div className="muted">المتبقي</div>
          <div style={{ fontWeight: 700 }}>
            <CurrencyCell lbp={remaining} rate={rate} />
          </div>
        </div>
      </div>
      <Field label="مبلغ الدفعة (ل.س)">
        <input type="number" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(Number(toLatinDigits(e.target.value)))} autoFocus />
      </Field>
      <p className="muted mt-8" style={{ fontSize: 12 }}>
        بعد الدفعة يبقى: {(remaining - amount).toLocaleString('en-US')} ل.س = {(((remaining - amount) / rate)).toFixed(2)} $
      </p>
    </Modal>
  )
}

function InvoiceEditor({
  defaultRate,
  onClose,
  onSaved
}: {
  defaultRate: number
  onClose: () => void
  onSaved: (inv: Invoice) => void
}): React.JSX.Element {
  const [patients, setPatients] = useState<Patient[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [patientId, setPatientId] = useState(0)
  const [date, setDate] = useState(today())
  const [usdRate, setUsdRate] = useState(defaultRate)
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [matFor, setMatFor] = useState<number | null>(null)
  const toast = useToast()

  useEffect(() => {
    window.clinic.patients.list().then(setPatients).catch(() => {})
    window.clinic.catalog.list().then(setCatalog).catch(() => {})
    window.clinic.inventory.list().then(setMaterials).catch(() => {})
  }, [])

  const addBlank = useCallback(() => {
    setLines((ls) => [...ls, { key: lineKey++, name: '', cost: 0, qty: 1, catalog_id: null, materials: [] }])
  }, [])

  const addCatalog = useCallback(
    (catalogId: number) => {
      const item = catalog.find((c) => c.id === catalogId)
      if (!item) return
      setLines((ls) => [
        ...ls,
        {
          key: lineKey++,
          name: item.name,
          cost: item.price,
          qty: 1,
          catalog_id: item.id,
          materials: item.materials.map((m) => ({ material_id: m.material_id, qty: m.qty }))
        }
      ])
    },
    [catalog]
  )

  const updateLine = (key: number, patch: Partial<Line>): void => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const removeLine = (key: number): void => {
    setLines((ls) => ls.filter((l) => l.key !== key))
  }

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.cost * l.qty, 0), [lines])
  const total = Math.max(0, subtotal - discount)

  const save = (): void => {
    if (!patientId) {
      toast('اختر المريض', 'error')
      return
    }
    const validLines = lines.filter((l) => l.name.trim() && l.qty > 0)
    if (validLines.length === 0) {
      toast('أضف بنداً واحداً على الأقل', 'error')
      return
    }
    const payload = {
      patient_id: patientId,
      date,
      usd_rate: usdRate,
      discount: discount || 0,
      notes,
      items: validLines.map((l) => ({
        name: l.name.trim(),
        cost: l.cost,
        qty: l.qty,
        catalog_id: l.catalog_id,
        materials: l.materials
      }))
    }
    window.clinic.invoices
      .create(payload)
      .then((inv) => {
        toast('تم إنشاء الفاتورة', 'success')
        onSaved(inv)
      })
      .catch((e) => toast(e.message, 'error'))
  }

  return (
    <Modal
      title="فاتورة جديدة"
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={save} disabled={lines.length === 0}>
            حفظ الفاتورة
          </button>
          <button
            className="ghost"
            onClick={() => setLines([])}
            disabled={lines.length === 0}
          >
            تفريغ
          </button>
          <button className="danger-ghost" onClick={onClose}>
            إلغاء
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <Field label="المريض *">
          <select value={patientId} onChange={(e) => setPatientId(Number(e.target.value))}>
            <option value={0}>اختر المريض...</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.phone ? `(${p.phone})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="سعر الصرف ($ → ل.س)">
          <input type="number" dir="ltr" inputMode="decimal" value={usdRate} onChange={(e) => setUsdRate(Number(toLatinDigits(e.target.value)))} />
        </Field>
        <Field label="الخصم (ل.س)">
          <input type="number" dir="ltr" inputMode="decimal" value={discount} onChange={(e) => setDiscount(Number(toLatinDigits(e.target.value)))} />
        </Field>
      </div>

      <div className="toolbar" style={{ marginBottom: 10 }}>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addCatalog(Number(e.target.value))
            e.target.selectedIndex = 0
          }}
        >
          <option value="">+ إضافة من الكتالوج...</option>
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.price.toLocaleString('en-US')} ل.س
            </option>
          ))}
        </select>
        <button className="ghost" onClick={addBlank}>
          + بند يدوي
        </button>
      </div>

      <div className="line-series">
        <div className="series-title">
          <span>البيان</span>
          <span>الكمية</span>
          <span>السعر (ل.س أو $)</span>
          <span>المجموع</span>
          <span>المواد المستهلكة</span>
          <span></span>
        </div>
        {lines.map((l) => (
          <div className="series-item" key={l.key}>
            <input value={l.name} onChange={(e) => updateLine(l.key, { name: e.target.value })} placeholder="اسم البند" />
            <input className="qty-input" type="number" dir="ltr" inputMode="decimal" min={1} value={l.qty} onChange={(e) => updateLine(l.key, { qty: Math.max(1, Number(toLatinDigits(e.target.value)) || 1) })} />
            <CurrencyInput compact valueLbp={l.cost} rate={usdRate} onChange={(lbp) => updateLine(l.key, { cost: lbp })} placeholder="0" />
            <div className="amount-lbp">{fmt(l.cost * l.qty)}</div>
            <button className="soft small" onClick={() => setMatFor(l.key)}>
              {l.materials.length > 0 ? `${l.materials.length} مواد` : 'اختيار'}
            </button>
            <button className="danger-ghost small" onClick={() => removeLine(l.key)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex between mt-16" style={{ fontWeight: 800 }}>
        <span>المجموع قبل الخصم:</span>
        <span>{fmt(subtotal)} ل.س = {(subtotal / (usdRate || 1)).toFixed(2)} $</span>
      </div>
      <div className="flex between mt-8" style={{ fontWeight: 800, fontSize: 17 }}>
        <span>الإجمالي:</span>
        <span>
          {fmt(total)} ل.س = {(total / (usdRate || 1)).toFixed(2)} $
        </span>
      </div>

      {matFor !== null && (
        <MaterialPicker
          materials={materials}
          current={lines.find((l) => l.key === matFor)?.materials ?? []}
          onDone={(mats) => {
            updateLine(matFor, { materials: mats })
            setMatFor(null)
          }}
        />
      )}
    </Modal>
  )
}

function MaterialPicker({
  materials,
  current,
  onDone
}: {
  materials: Material[]
  current: { material_id: number; qty: number }[]
  onDone: (mats: { material_id: number; qty: number }[]) => void
}): React.JSX.Element {
  const [sel, setSel] = useState<{ material_id: number; qty: number }[]>(current)
  const [pick, setPick] = useState(0)
  const [qty, setQty] = useState(1)

  const add = (): void => {
    if (!pick) return
    setSel((s) => {
      const existing = s.find((x) => x.material_id === pick)
      if (existing) return s.map((x) => (x.material_id === pick ? { ...x, qty: x.qty + qty } : x))
      return [...s, { material_id: pick, qty }]
    })
    setPick(0)
    setQty(1)
  }

  const remove = (id: number): void => setSel((s) => s.filter((x) => x.material_id !== id))

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <h3>المواد المستهلكة للبند</h3>
        </div>
        <div className="modal-body">
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <select value={pick} onChange={(e) => setPick(Number(e.target.value))}>
              <option value={0}>اختر المادة...</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (متوفر {m.quantity})
                </option>
              ))}
            </select>
            <input type="number" dir="ltr" inputMode="decimal" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(toLatinDigits(e.target.value)) || 1))} style={{ width: 80 }} />
            <button className="ghost" onClick={add}>
              إضافة
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>الكمية</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sel.map((s) => {
                  const m = materials.find((x) => x.id === s.material_id)
                  return (
                    <tr key={s.material_id}>
                      <td>{m?.name ?? `#${s.material_id}`}</td>
                      <td>{s.qty}</td>
                      <td>
                        <button className="danger-ghost small" onClick={() => remove(s.material_id)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {sel.length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      <Empty text="لا مواد مستهلكة" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-foot">
          <button onClick={() => onDone(sel)}>تم</button>
        </div>
      </div>
    </div>
  )
}