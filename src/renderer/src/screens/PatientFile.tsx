import { useEffect, useMemo, useState } from 'react'
import { Modal, Field, Empty, CurrencyCell, Confirm, useToast } from '../ui'
import type { PatientFileResult, PatientAttachment, Medication, MedicationInput, Medicine } from '../lib'
import AttachmentViewer from '../AttachmentViewer'

function fmtSize(n: number): string {
  if (n < 1024) return `${n} بايت`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`
  return `${(n / 1024 / 1024).toFixed(2)} م.ب`
}

function ageFrom(birth: string): string {
  if (!birth) return ''
  const b = new Date(birth)
  if (isNaN(b.getTime())) return ''
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  const md = now.getMonth() - b.getMonth()
  if (md < 0 || (md === 0 && now.getDate() < b.getDate())) a--
  return a >= 0 ? `${a} سنة` : ''
}

const MED_CATEGORIES: { value: MedicationInput['category']; label: string }[] = [
  { value: 'prescription', label: 'موصوف من طبيب' },
  { value: 'otc', label: 'بدون وصفة (OTC)' },
  { value: 'supplement', label: 'مكمل غذائي' },
  { value: 'herbal', label: 'أعشاب / طبيعي' }
]

function catLabel(c: MedicationInput['category']): string {
  return MED_CATEGORIES.find((x) => x.value === c)?.label ?? c
}

const emptyMed = (patientId: number): MedicationInput & { id?: number } => ({
  id: undefined,
  patient_id: patientId,
  scientific_name: '',
  trade_name: '',
  dose: '',
  form: '',
  route: '',
  frequency: '',
  start_date: '',
  end_date: '',
  category: 'prescription',
  prescriber: '',
  prescriber_specialty: '',
  pharmacist: '',
  dispense_date: '',
  dispense_place: '',
  next_review: '',
  notes: '',
  active: 1
})

function AttachmentThumb({ attachment }: { attachment: PatientAttachment }): React.JSX.Element {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (attachment.ftype !== 'image') return
    let alive = true
    window.clinic.attachments
      .read(attachment.id)
      .then((r) => {
        if (alive) setUrl(r.dataUrl)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [attachment.id, attachment.ftype])
  if (attachment.ftype === 'image' && url) return <img src={url} alt={attachment.filename} />
  return <span className="attach-icon">{attachment.ftype === 'dicom' ? '🦴' : attachment.ftype === 'image' ? '🖼️' : '📄'}</span>
}

export default function PatientFile({
  id,
  rate,
  onClose
}: {
  id: number
  rate: number
  onClose: () => void
}): React.JSX.Element {
  const [data, setData] = useState<PatientFileResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<PatientForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [attachments, setAttachments] = useState<PatientAttachment[]>([])
  const [viewing, setViewing] = useState<PatientAttachment | null>(null)
  const [deletingFile, setDeletingFile] = useState<PatientAttachment | null>(null)
  const [meds, setMeds] = useState<Medication[]>([])
  const [medEdit, setMedEdit] = useState<(MedicationInput & { id?: number }) | null>(null)
  const [savingMed, setSavingMed] = useState(false)
  const [deletingMed, setDeletingMed] = useState<Medication | null>(null)
  const [catalog, setCatalog] = useState<Medicine[]>([])
  const [rx, setRx] = useState<{ ids: number[]; diagnosis: string; note: string } | null>(null)
  const [printingRx, setPrintingRx] = useState(false)
  const [printing, setPrinting] = useState<'brief' | 'full' | null>(null)
  const toast = useToast()

  useEffect(() => {
    window.clinic.medCatalog
      .list()
      .then(setCatalog)
      .catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setData(null)
    setForm(null)
    setAttachments([])
    setMeds([])
    window.clinic.patients
      .get(id)
      .then((d) => {
        if (!alive) return
        setData(d)
        setAttachments(d.attachments ?? [])
        setMeds(d.medications ?? [])
        const p = d.patient
        setForm({
          name: p.name,
          phone: p.phone,
          birth_date: p.birth_date,
          gender: p.gender,
          address: p.address,
          notes: p.notes,
          national_id: p.national_id ?? '',
          allergies: p.allergies ?? '',
          chronic_diseases: p.chronic_diseases ?? '',
          physiological_status: p.physiological_status ?? '',
          medical_notes: p.medical_notes ?? ''
        })
      })
      .catch(() => {
        if (alive) setData(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  const reloadAttachments = (): void => {
    window.clinic.attachments
      .list(id)
      .then(setAttachments)
      .catch((e) => toast(e.message, 'error'))
  }

  const addFiles = (): void => {
    window.clinic.attachments
      .add(id)
      .then((added) => {
        if (added.length) {
          toast(`تمت إضافة ${added.length} ملف`, 'success')
          reloadAttachments()
        }
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const removeFile = (): void => {
    if (!deletingFile) return
    window.clinic.attachments
      .delete(deletingFile.id)
      .then(() => {
        toast('تم حذف الملف', 'success')
        reloadAttachments()
      })
      .catch((e) => toast(e.message, 'error'))
    setDeletingFile(null)
  }

  const reloadMeds = (): void => {
    window.clinic.medications
      .list(id)
      .then(setMeds)
      .catch((e) => toast(e.message, 'error'))
  }

  const savePatient = (): void => {
    if (!form) return
    if (!form.name.trim()) {
      toast('الاسم مطلوب', 'error')
      return
    }
    setSaving(true)
    window.clinic.patients
      .update(id, form)
      .then(() => {
        toast('تم حفظ بيانات المريض', 'success')
        setData((d) => (d ? { ...d, patient: { ...d.patient, ...form } } : d))
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setSaving(false))
  }

  const saveMed = (): void => {
    if (!medEdit) return
    if (!medEdit.trade_name.trim() && !medEdit.scientific_name.trim()) {
      toast('أدخل الاسم العلمي أو التجاري على الأقل', 'error')
      return
    }
    setSavingMed(true)
    window.clinic.medications
      .save(medEdit)
      .then(() => {
        toast('تم حفظ الدواء', 'success')
        setMedEdit(null)
        reloadMeds()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setSavingMed(false))
  }

  const removeMed = (): void => {
    if (!deletingMed) return
    window.clinic.medications
      .delete(deletingMed.id)
      .then(() => {
        toast('تم حذف الدواء', 'success')
        reloadMeds()
      })
      .catch((e) => toast(e.message, 'error'))
    setDeletingMed(null)
  }

  const applyCatalog = (value: string): void => {
    const med = catalog.find((c) => c.id === Number(value))
    if (!med) return
    setMedEdit((m) =>
      m
        ? {
            ...m,
            trade_name: med.trade_name,
            scientific_name: med.scientific_name,
            dose: med.dose,
            form: med.form,
            route: med.route,
            frequency: med.frequency,
            category: med.category
          }
        : m
    )
  }

  const reloadCatalog = (): void => {
    window.clinic.medCatalog
      .list()
      .then(setCatalog)
      .catch(() => {})
  }

  const saveToCatalog = (): void => {
    if (!medEdit) return
    if (!medEdit.trade_name.trim() && !medEdit.scientific_name.trim()) {
      toast('أدخل اسم الدواء أولاً', 'error')
      return
    }
    if (catalog.some((c) => c.trade_name === medEdit.trade_name.trim() && c.scientific_name === medEdit.scientific_name.trim())) {
      toast('الدواء موجود في القائمة مسبقاً', 'error')
      return
    }
    window.clinic.medCatalog
      .create({
        trade_name: medEdit.trade_name.trim(),
        scientific_name: medEdit.scientific_name.trim(),
        dose: medEdit.dose,
        form: medEdit.form,
        route: medEdit.route,
        frequency: medEdit.frequency,
        category: medEdit.category
      })
      .then(() => {
        toast('تمت إضافة الدواء إلى القائمة المرجعية', 'success')
        reloadCatalog()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const openRx = (): void => {
    const activeIds = meds.filter((m) => m.active).map((m) => m.id)
    setRx({ ids: activeIds.length ? activeIds : meds.map((m) => m.id), diagnosis: '', note: '' })
  }

  const toggleRx = (medId: number): void =>
    setRx((r) => (r ? { ...r, ids: r.ids.includes(medId) ? r.ids.filter((x) => x !== medId) : [...r.ids, medId] } : r))

  const printRx = (): void => {
    if (!rx) return
    if (rx.ids.length === 0) {
      toast('اختر دواءً واحداً على الأقل لطباعة الوصفة', 'error')
      return
    }
    setPrintingRx(true)
    window.clinic.printing
      .prescription({ patientId: id, medicationIds: rx.ids, diagnosis: rx.diagnosis, note: rx.note })
      .then((r) => {
        if (r.ok) {
          toast('تم إرسال الوصفة الطبية للطباعة', 'success')
          setRx(null)
        } else toast(r.error || 'تعذّرت الطباعة', 'error')
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setPrintingRx(false))
  }

  const print = (mode: 'brief' | 'full'): void => {
    setPrinting(mode)
    window.clinic.printing
      .patientReport(id, mode)
      .then((r) => {
        if (r.ok) toast(mode === 'brief' ? 'تم إرسال الكشف المختصر للطباعة' : 'تم إرسال السجل الكامل للطباعة', 'success')
        else toast(r.error || 'تعذّرت الطباعة', 'error')
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setPrinting(null))
  }

  const totals = useMemo(() => {
    const inv = data?.invoices ?? []
    return {
      count: inv.length,
      total: inv.reduce((s, i) => s + i.total, 0),
      paid: inv.reduce((s, i) => s + i.paid, 0),
      remaining: inv.reduce((s, i) => s + (i.total - i.paid), 0)
    }
  }, [data])

  const activeMeds = meds.filter((m) => m.active).length

  const setF = (patch: Partial<PatientForm>): void => setForm((f) => (f ? { ...f, ...patch } : f))
  const setM = (patch: Partial<MedicationInput & { id?: number }>): void =>
    setMedEdit((m) => (m ? { ...m, ...patch } : m))

  return (
    <>
      <Modal
        title={data ? `ملف المريض: ${data.patient.name}` : 'ملف المريض'}
        onClose={onClose}
        wide
        footer={
          data ? (
            <div className="flex between" style={{ width: '100%' }}>
              <span className="muted">
                {totals.count} فاتورة — المدفوع <CurrencyCell lbp={totals.paid} rate={rate} /> — المتبقي{' '}
                <CurrencyCell lbp={totals.remaining} rate={rate} />
              </span>
              <div className="flex">
                <button className="soft" disabled={printing !== null} onClick={() => print('brief')}>
                  {printing === 'brief' ? '...' : '🖨 كشف مختصر'}
                </button>
                <button className="soft" disabled={printing !== null} onClick={() => print('full')}>
                  {printing === 'full' ? '...' : '🖨 السجل الكامل'}
                </button>
                <button className="soft" disabled={meds.length === 0} onClick={openRx}>
                  🖨 وصفة طبية
                </button>
                <button onClick={onClose}>إغلاق</button>
              </div>
            </div>
          ) : undefined
        }
      >
        {loading ? (
          <div className="muted">جاري التحميل...</div>
        ) : !data || !form ? (
          <Empty text="لم يتم العثور على المريض" />
        ) : (
          <div className="form-grid">
            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-head">
                <h2>1. البيانات الشخصية والأساسية</h2>
                <span className="muted">
                  {form.birth_date ? `العمر: ${ageFrom(form.birth_date)}` : ''}
                </span>
              </div>
              <div className="panel-body">
                <div className="form-grid">
                  <Field label="الاسم الكامل">
                    <input value={form.name} onChange={(e) => setF({ name: e.target.value })} />
                  </Field>
                  <Field label="رقم الملف الطبي / الوطني">
                    <input value={form.national_id} onChange={(e) => setF({ national_id: e.target.value })} />
                  </Field>
                  <Field label="تاريخ الميلاد">
                    <input type="date" dir="ltr" value={form.birth_date} onChange={(e) => setF({ birth_date: e.target.value })} />
                  </Field>
                  <Field label="الجنس">
                    <select value={form.gender} onChange={(e) => setF({ gender: e.target.value })}>
                      <option value="">—</option>
                      <option value="ذكر">ذكر</option>
                      <option value="أنثى">أنثى</option>
                    </select>
                  </Field>
                  <Field label="رقم الهاتف">
                    <input dir="ltr" value={form.phone} onChange={(e) => setF({ phone: e.target.value })} />
                  </Field>
                  <Field label="العنوان">
                    <input value={form.address} onChange={(e) => setF({ address: e.target.value })} />
                  </Field>
                </div>
              </div>
            </div>

            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-head">
                <h2>2. التاريخ المرضي والمحاذير الطبية</h2>
              </div>
              <div className="panel-body">
                <div className="form-grid">
                  <Field label="الحساسية الدوائية والغذائية">
                    <textarea
                      rows={2}
                      value={form.allergies}
                      onChange={(e) => setF({ allergies: e.target.value })}
                      placeholder="مثال: البنسلين (طفح جلدي)، الفول السوداني (ضيق تنفس)"
                    />
                  </Field>
                  <Field label="الأمراض المزمنة">
                    <textarea
                      rows={2}
                      value={form.chronic_diseases}
                      onChange={(e) => setF({ chronic_diseases: e.target.value })}
                      placeholder="مثال: سكري، ضغط، فشل كلوي"
                    />
                  </Field>
                  <Field label="الحالة الفسيولوجية الخاصة">
                    <textarea
                      rows={2}
                      value={form.physiological_status}
                      onChange={(e) => setF({ physiological_status: e.target.value })}
                      placeholder="مثال: حمل، رضاعة"
                    />
                  </Field>
                  <Field label="ملاحظات / تاريخ مرضي إضافي">
                    <textarea rows={2} value={form.medical_notes} onChange={(e) => setF({ medical_notes: e.target.value })} />
                  </Field>
                  <div className="field full">
                    <Field label="ملاحظات عامة">
                      <textarea rows={2} value={form.notes} onChange={(e) => setF({ notes: e.target.value })} />
                    </Field>
                  </div>
                </div>
                <div className="flex end" style={{ marginTop: 10 }}>
                  <button className="soft" disabled={saving} onClick={savePatient}>
                    {saving ? '...' : 'حفظ بيانات المريض'}
                  </button>
                </div>
              </div>
            </div>

            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-head">
                <h2>3. سجل الأدوية والمكملات ({meds.length}) — الفعّالة: {activeMeds}</h2>
                <div className="toolbar">
                  <button className="soft" onClick={() => setMedEdit(emptyMed(id))}>
                    ＋ إضافة دواء
                  </button>
                  <button className="soft" onClick={openRx} disabled={meds.length === 0}>
                    🖨 وصفة طبية
                  </button>
                </div>
              </div>
              <div className="panel-body" style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>الاسم التجاري / العلمي</th>
                      <th>الجرعة</th>
                      <th>الشكل</th>
                      <th>الطريقة</th>
                      <th>عدد المرات والتوقيت</th>
                      <th>البدء ← الانتهاء</th>
                      <th>التصنيف</th>
                      <th>الحالة</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {meds.map((m) => (
                      <tr key={m.id} className={m.active ? '' : 'muted'}>
                        <td>
                          {m.trade_name || m.scientific_name || '—'}
                          {m.trade_name && m.scientific_name && <div className="sub">{m.scientific_name}</div>}
                        </td>
                        <td>{m.dose}</td>
                        <td>{m.form}</td>
                        <td>{m.route}</td>
                        <td>{m.frequency}</td>
                        <td dir="ltr">{[m.start_date, m.end_date].filter(Boolean).join(' ← ')}</td>
                        <td>{catLabel(m.category)}</td>
                        <td>{m.active ? 'فعّال' : 'متوقف'}</td>
                        <td className="row-actions">
                          <button className="soft small" onClick={() => setMedEdit({ ...m })}>
                            تعديل
                          </button>
                          <button className="ghost small" onClick={() => setDeletingMed(m)}>
                            حذف
                          </button>
                        </td>
                      </tr>
                    ))}
                    {meds.length === 0 && (
                      <tr>
                        <td colSpan={9} className="muted center">
                          لا توجد أدوية مسجّلة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-head">
                <h2>4. سجل المواعيد</h2>
              </div>
              <div className="panel-body" style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>الوقت</th>
                      <th>السبب</th>
                      <th>الحالة</th>
                      <th>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.appointments.map((a) => (
                      <tr key={a.id}>
                        <td>{a.date}</td>
                        <td>{a.time}</td>
                        <td>{a.reason}</td>
                        <td>{a.status}</td>
                        <td>{a.notes}</td>
                      </tr>
                    ))}
                    {data.appointments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted center">
                          لا توجد مواعيد
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-head">
                <h2>5. سجل الفواتير</h2>
              </div>
              <div className="panel-body" style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>رقم الفاتورة</th>
                      <th>التاريخ</th>
                      <th>الإجمالي</th>
                      <th>المدفوع</th>
                      <th>المتبقي</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.invoice_no}</td>
                        <td>{inv.date}</td>
                        <td dir="ltr">
                          <CurrencyCell lbp={inv.total} rate={rate} />
                        </td>
                        <td dir="ltr">
                          <CurrencyCell lbp={inv.paid} rate={rate} />
                        </td>
                        <td dir="ltr">
                          <CurrencyCell lbp={inv.total - inv.paid} rate={rate} />
                        </td>
                        <td>{inv.status}</td>
                      </tr>
                    ))}
                    {data.invoices.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted center">
                          لا توجد فواتير
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-head">
                <h2>6. الصور والأشعة والملفات</h2>
                <div className="toolbar">
                  <button className="soft" onClick={addFiles}>
                    ＋ إضافة صور / أشعة / ملفات
                  </button>
                </div>
              </div>
              <div className="panel-body">
                {attachments.length === 0 ? (
                  <Empty text="لا توجد مرفقات — أضف صور أشعة (DICOM) أو صوراً أو ملفات" />
                ) : (
                  <div className="attach-grid">
                    {attachments.map((a) => (
                      <div key={a.id} className="attach-card" onDoubleClick={() => setViewing(a)} title="نقر مزدوج للعرض">
                        <div className="attach-thumb">
                          <AttachmentThumb attachment={a} />
                        </div>
                        <div className="attach-name">{a.filename}</div>
                        <div className="attach-meta">
                          {a.ftype === 'dicom' ? 'أشعة' : a.ftype === 'image' ? 'صورة' : 'ملف'} · {fmtSize(a.size)}
                        </div>
                        <div className="attach-actions">
                          <button className="soft small" onClick={() => setViewing(a)}>
                            عرض
                          </button>
                          <button className="ghost small" onClick={() => setDeletingFile(a)}>
                            حذف
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {medEdit && (
        <Modal
          title={medEdit.id ? 'تعديل دواء' : 'إضافة دواء'}
          onClose={() => setMedEdit(null)}
          wide
          footer={
            <>
              <button className="ghost" onClick={() => setMedEdit(null)}>
                إلغاء
              </button>
              <button disabled={savingMed} onClick={saveMed}>
                {savingMed ? '...' : 'حفظ'}
              </button>
            </>
          }
        >
          <div className="flex" style={{ gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <Field label="اختر من قائمة الأدوية الجاهزة (تعبئة تلقائية)">
                <select value="" onChange={(e) => applyCatalog(e.target.value)}>
                  <option value="">— اختر دواءً لتعبئة الحقول —</option>
                  {MED_CATEGORIES.map((cat) => {
                    const items = catalog.filter((c) => c.category === cat.value)
                    return items.length ? (
                      <optgroup key={cat.value} label={cat.label}>
                        {items.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.trade_name || c.scientific_name}
                            {c.dose ? ` — ${c.dose}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ) : null
                  })}
                </select>
              </Field>
            </div>
            <button type="button" className="soft" onClick={saveToCatalog}>
              ＋ حفظ الحقول في القائمة
            </button>
          </div>
          <div className="form-grid">
            <Field label="الاسم العلمي (المادة الفعالة)">
              <input value={medEdit.scientific_name} onChange={(e) => setM({ scientific_name: e.target.value })} />
            </Field>
            <Field label="الاسم التجاري">
              <input value={medEdit.trade_name} onChange={(e) => setM({ trade_name: e.target.value })} />
            </Field>
            <Field label="الجرعة / التركيز">
              <input value={medEdit.dose} onChange={(e) => setM({ dose: e.target.value })} placeholder="مثال: 500 ملغ" />
            </Field>
            <Field label="الشكل الصيدلاني">
              <input value={medEdit.form} onChange={(e) => setM({ form: e.target.value })} placeholder="أقراص، كبسولات، شراب، حقن، مرهم..." />
            </Field>
            <Field label="طريقة الاستخدام">
              <input value={medEdit.route} onChange={(e) => setM({ route: e.target.value })} placeholder="فموي، تحت اللسان، استنشاق، موضعي..." />
            </Field>
            <Field label="عدد المرات والتوقيت">
              <input value={medEdit.frequency} onChange={(e) => setM({ frequency: e.target.value })} placeholder="ثلاث مرات يومياً بعد الأكل..." />
            </Field>
            <Field label="تاريخ البدء">
              <input type="date" dir="ltr" value={medEdit.start_date} onChange={(e) => setM({ start_date: e.target.value })} />
            </Field>
            <Field label="تاريخ الانتهاء">
              <input type="date" dir="ltr" value={medEdit.end_date} onChange={(e) => setM({ end_date: e.target.value })} />
            </Field>
            <Field label="التصنيف">
              <select value={medEdit.category} onChange={(e) => setM({ category: e.target.value as MedicationInput['category'] })}>
                {MED_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الحالة">
              <select value={medEdit.active ? '1' : '0'} onChange={(e) => setM({ active: Number(e.target.value) })}>
                <option value="1">فعّال (يتناوله حالياً)</option>
                <option value="0">متوقف</option>
              </select>
            </Field>
            <Field label="اسم الطبيب المعالج">
              <input value={medEdit.prescriber} onChange={(e) => setM({ prescriber: e.target.value })} />
            </Field>
            <Field label="تخصص الطبيب">
              <input value={medEdit.prescriber_specialty} onChange={(e) => setM({ prescriber_specialty: e.target.value })} />
            </Field>
            <Field label="اسم الصيدلي">
              <input value={medEdit.pharmacist} onChange={(e) => setM({ pharmacist: e.target.value })} />
            </Field>
            <Field label="تاريخ صرف الوصفة">
              <input type="date" dir="ltr" value={medEdit.dispense_date} onChange={(e) => setM({ dispense_date: e.target.value })} />
            </Field>
            <Field label="مكان الصرف">
              <input value={medEdit.dispense_place} onChange={(e) => setM({ dispense_place: e.target.value })} placeholder="مستشفى / صيدلية" />
            </Field>
            <Field label="تاريخ المراجعة القادمة">
              <input type="date" dir="ltr" value={medEdit.next_review} onChange={(e) => setM({ next_review: e.target.value })} />
            </Field>
            <div className="field full">
              <Field label="ملاحظات">
                <textarea rows={2} value={medEdit.notes} onChange={(e) => setM({ notes: e.target.value })} />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {rx && (
        <Modal
          title="وصفة طبية جديدة"
          onClose={() => setRx(null)}
          wide
          footer={
            <>
              <button className="ghost" onClick={() => setRx(null)}>
                إلغاء
              </button>
              <button className="soft" disabled={printingRx} onClick={printRx}>
                {printingRx ? '...' : '🖨 طباعة الوصفة'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="التشخيص (اختياري)">
              <input
                value={rx.diagnosis}
                onChange={(e) => setRx((r) => (r ? { ...r, diagnosis: e.target.value } : r))}
                placeholder="مثال: خراج سنّي، التهاب لبّ السن، التهاب حوائط السن"
              />
            </Field>
            <div className="field full">
              <Field label={`الأدوية المدرجة في الوصفة (${rx.ids.length})`}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  ضع علامة على الأدوية التي ستُطبع في الوصفة. تُحدَّد الأدوية الفعّالة تلقائياً.
                </div>
              </Field>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>الدواء</th>
                  <th>الجرعة</th>
                  <th>عدد المرات والتوقيت</th>
                </tr>
              </thead>
              <tbody>
                {meds.map((m) => (
                  <tr key={m.id} className={m.active ? '' : 'muted'}>
                    <td>
                      <input type="checkbox" checked={rx.ids.includes(m.id)} onChange={() => toggleRx(m.id)} />
                    </td>
                    <td>
                      {m.trade_name || m.scientific_name || '—'}
                      {m.trade_name && m.scientific_name && <div className="sub">{m.scientific_name}</div>}
                    </td>
                    <td>{m.dose}</td>
                    <td>{m.frequency}</td>
                  </tr>
                ))}
                {meds.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted center">
                      لا توجد أدوية مسجّلة — أضف دواءً أولاً من سجل الأدوية
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex" style={{ marginTop: 12, gap: 8 }}>
            <button className="ghost small" onClick={() => setRx((r) => (r ? { ...r, ids: meds.filter((m) => m.active).map((m) => m.id) } : r))}>
              تحديد الفعّالة فقط
            </button>
            <button className="ghost small" onClick={() => setRx((r) => (r ? { ...r, ids: meds.map((m) => m.id) } : r))}>
              تحديد الكل
            </button>
            <button className="ghost small" onClick={() => setRx((r) => (r ? { ...r, ids: [] } : r))}>
              مسح التحديد
            </button>
          </div>
          <div className="field full" style={{ marginTop: 12 }}>
            <Field label="تعليمات عامة للمريض (تظهر أسفل الوصفة)">
              <textarea
                rows={2}
                value={rx.note}
                onChange={(e) => setRx((r) => (r ? { ...r, note: e.target.value } : r))}
                placeholder="مثال: الالتزام بالمضاد الحيوي كاملاً، المضمضة بالماء والملح، العودة عند استمرار الألم"
              />
            </Field>
          </div>
        </Modal>
      )}

      {viewing && <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />}
      {deletingFile && (
        <Confirm
          title="حذف الملف"
          message={`هل تريد حذف "${deletingFile.filename}"؟ لا يمكن التراجع عن هذه العملية.`}
          onConfirm={removeFile}
          onClose={() => setDeletingFile(null)}
        />
      )}
      {deletingMed && (
        <Confirm
          title="حذف الدواء"
          message={`هل تريد حذف "${deletingMed.trade_name || deletingMed.scientific_name}" من سجل الأدوية؟`}
          onConfirm={removeMed}
          onClose={() => setDeletingMed(null)}
        />
      )}
    </>
  )
}

interface PatientForm {
  name: string
  phone: string
  birth_date: string
  gender: string
  address: string
  notes: string
  national_id: string
  allergies: string
  chronic_diseases: string
  physiological_status: string
  medical_notes: string
}