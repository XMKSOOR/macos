import { useCallback, useEffect, useMemo, useState } from 'react'
import { Confirm, CurrencyCell, Empty, Field, Modal, SearchBox, StatusBadge, useToast } from '../ui'
import { SearchSelect } from '../SearchSelect'
import ExcelBar from '../excel'
import type { CatalogItem, Invoice, Material, Patient, Role, Settings } from '../lib'
import { can, fmt, today, parseNumber } from '../lib'
import { CurrencyInput } from '../CurrencyInput'
import InvoiceFile from './InvoiceFile'

interface Line {
  key: number
  name: string
  cost: number
  qty: number
  catalog_id: string | null
  materials: { material_id: string; qty: number }[]
}

let lineKey = 1

export default function Billing({
  settings,
  role,
  onOpenPatient
}: {
  settings: Settings | null
  role: Role
  onOpenPatient?: (id: string) => void
}): React.JSX.Element {
  const [list, setList] = useState<Invoice[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [fileId, setFileId] = useState<string | null>(null)
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [deleting, setDeleting] = useState<Invoice | null>(null)
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
      .then(() => {
        toast('تم تسجيل الدفعة', 'success')
        setPaying(null)
        load(search, statusFilter)
      })
      .catch((e) => toast(e.message, 'error'))
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

  if (fileId !== null) {
    return (
      <InvoiceFile
        id={fileId}
        defaultRate={rate}
        role={role}
        onClose={() => setFileId(null)}
        onOpenPatient={onOpenPatient}
        onChanged={() => load(search, statusFilter)}
      />
    )
  }

  return (
    <div>
      <div className="panel">
        <div className="panel-head">
          <h2>الفواتير والدفعات</h2>
          <div className="toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="رقم / مريض / هاتف..." />
            <SearchSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'كل الحالات' },
                { value: 'unpaid', label: 'غير مدفوعة' },
                { value: 'partial', label: 'مدفوعة جزئياً' },
                { value: 'paid', label: 'مدفوعة' }
              ]}
            />
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
                  <th>#</th>
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
                    <td colSpan={9}>
                      <Empty text="لا توجد فواتير" />
                    </td>
                  </tr>
                ) : (
                  list.map((inv, i) => {
                    const remaining = inv.total - inv.paid
                    return (
                      <tr key={inv.id}>
                        <td className="id-col">{i + 1}</td>
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
                              onClick={() => setFileId(inv.id)}
                            >
                              فتح
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
          onSaved={() => {
            setShowEditor(false)
            load(search, statusFilter)
          }}
        />
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
      <Field label="مبلغ الدفعة (ل.س أو $)">
        <CurrencyInput dual valueLbp={amount} rate={rate} onChange={setAmount} />
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
  const [patientId, setPatientId] = useState('')
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
    (catalogId: string) => {
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

  const lineMatCost = (l: Line): number =>
    l.materials.reduce(
      (s, x) => s + (materials.find((mm) => mm.id === x.material_id)?.cost ?? 0) * x.qty,
      0
    )

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
          <SearchSelect
            value={patientId}
            onChange={(v) => setPatientId(v)}
            options={[
              { value: '', label: 'اختر المريض...' },
              ...patients.map((p) => ({ value: p.id, label: `${p.name}${p.phone ? ` (${p.phone})` : ''}` }))
            ]}
          />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="سعر الصرف ($ → ل.س)">
          <input type="text" dir="ltr" inputMode="decimal" value={usdRate} onChange={(e) => setUsdRate(parseNumber(e.target.value))} />
        </Field>
        <Field label="الخصم (ل.س)">
          <input type="text" dir="ltr" inputMode="decimal" value={discount} onChange={(e) => setDiscount(parseNumber(e.target.value))} />
        </Field>
      </div>

      <div className="toolbar" style={{ marginBottom: 10 }}>
        <SearchSelect
          value=""
          placeholder="+ إضافة من الكتالوج..."
          onChange={(v) => {
            if (v) addCatalog(v)
          }}
          options={[
            { value: '', label: '+ إضافة من الكتالوج...' },
            ...catalog.map((c) => ({ value: c.id, label: `${c.name} — ${c.price.toLocaleString('en-US')} ل.س` }))
          ]}
        />
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
            <input className="qty-input" type="text" dir="ltr" inputMode="decimal" value={l.qty} onChange={(e) => updateLine(l.key, { qty: Math.max(1, parseNumber(e.target.value) || 1) })} />
            <CurrencyInput compact valueLbp={l.cost} rate={usdRate} onChange={(lbp) => updateLine(l.key, { cost: lbp })} placeholder="0" />
            <div className="amount-lbp">{fmt(l.cost * l.qty)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
              <button className="soft small" onClick={() => setMatFor(l.key)}>
                {l.materials.length > 0 ? `${l.materials.length} مواد` : 'اختيار'}
              </button>
              {l.materials.length > 0 && (
                <span className="muted" style={{ fontSize: 11 }}>
                  كلفة المواد: {fmt(lineMatCost(l))} ل.س
                </span>
              )}
            </div>
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
  current: { material_id: string; qty: number }[]
  onDone: (mats: { material_id: string; qty: number }[]) => void
}): React.JSX.Element {
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState(1)
  const [sel, setSel] = useState<{ material_id: string; qty: number }[]>(current)

  const matTotal = useMemo(
    () =>
      sel.reduce((s, x) => {
        const m = materials.find((mm) => mm.id === x.material_id)
        return s + (m ? m.cost * x.qty : 0)
      }, 0),
    [sel, materials]
  )

  const add = (): void => {
    if (!pick) return
    setSel((s) => {
      const existing = s.find((x) => x.material_id === pick)
      if (existing) return s.map((x) => (x.material_id === pick ? { ...x, qty: x.qty + qty } : x))
      return [...s, { material_id: pick, qty }]
    })
    setPick('')
    setQty(1)
  }

  const remove = (id: string): void => setSel((s) => s.filter((x) => x.material_id !== id))

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <h3>المواد المستهلكة للبند</h3>
        </div>
        <div className="modal-body">
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <SearchSelect
              value={pick}
              onChange={(v) => setPick(v)}
              options={[
                { value: '', label: 'اختر المادة...' },
                ...materials.map((m) => ({ value: m.id, label: `${m.name} — ${fmt(m.cost)} ل.س (متوفر ${m.quantity})` }))
              ]}
            />
            <input type="text" dir="ltr" inputMode="decimal" value={qty} onChange={(e) => setQty(Math.max(1, parseNumber(e.target.value) || 1))} style={{ width: 80 }} />
            <button className="ghost" onClick={add}>
              إضافة
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>السعر (ل.س)</th>
                  <th>الكمية</th>
                  <th>المجموع (ل.س)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sel.map((s) => {
                  const m = materials.find((x) => x.id === s.material_id)
                  return (
                    <tr key={s.material_id}>
                      <td>{m?.name ?? 'صنف محذوف'}</td>
                      <td>{m ? fmt(m.cost) : '—'}</td>
                      <td>{s.qty}</td>
                      <td>{m ? fmt(m.cost * s.qty) : '—'}</td>
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
                    <td colSpan={5}>
                      <Empty text="لا مواد مستهلكة" />
                    </td>
                  </tr>
                )}
              </tbody>
              {sel.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ fontWeight: 700 }}>
                      مجموع كلفة المواد
                    </td>
                    <td style={{ fontWeight: 700 }}>{fmt(matTotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
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