import { useCallback, useEffect, useState } from 'react'
import { Empty, Field, Modal, useToast } from '../ui'
import type { PatientAttachment, PeriodontalChartEntry, RecallReminder, RecallType } from '../lib'
import Odontogram from './Odontogram'
import TreatmentPlans from './TreatmentPlans'
import { RecordsTab, Tabs } from './Records'
import type { RecCol } from './Records'

const HISTORY_COLS: RecCol[] = [
  { key: 'date', label: 'التاريخ', type: 'date' },
  { key: 'tooth_number', label: 'السن', type: 'text' },
  { key: 'procedure_name', label: 'الإجراء', type: 'text', required: true },
  { key: 'doctor', label: 'الطبيب', type: 'text' },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', showInTable: false }
]

const ANESTHESIA_COLS: RecCol[] = [
  { key: 'date', label: 'التاريخ', type: 'date' },
  { key: 'tooth_number', label: 'السن', type: 'text' },
  { key: 'anesthesia_type', label: 'نوع التخدير', type: 'text', placeholder: 'ليدوكايين 2%...' },
  { key: 'dose', label: 'الجرعة', type: 'text', placeholder: '1.8 مل' },
  { key: 'batch_no', label: 'رقم الدفعة', type: 'text' },
  { key: 'expiry_date', label: 'تاريخ الانتهاء', type: 'date' },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', showInTable: false }
]

const LAB_COLS: RecCol[] = [
  { key: 'date', label: 'تاريخ الإرسال', type: 'date' },
  { key: 'lab_name', label: 'المختبر', type: 'text' },
  { key: 'case_type', label: 'نوع الحالة', type: 'text', placeholder: 'تاج / طقم / تقويم' },
  { key: 'tooth_number', label: 'السن', type: 'text' },
  { key: 'shade', label: 'اللون', type: 'text' },
  { key: 'material', label: 'المادة', type: 'text' },
  {
    key: 'status',
    label: 'الحالة',
    type: 'select',
    options: [
      { value: 'sent', label: 'مُرسل' },
      { value: 'in_progress', label: 'قيد التنفيذ' },
      { value: 'received', label: 'مُستلم' },
      { value: 'delivered', label: 'مُسلَّم للمريض' }
    ]
  },
  { key: 'due_date', label: 'تاريخ التسليم المتوقع', type: 'date', showInTable: false },
  { key: 'received_date', label: 'تاريخ الاستلام', type: 'date', showInTable: false },
  { key: 'cost', label: 'الكلفة', type: 'money' },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', showInTable: false }
]

const IMPLANT_COLS: RecCol[] = [
  { key: 'tooth_number', label: 'السن', type: 'text' },
  { key: 'date', label: 'تاريخ التركيب', type: 'date' },
  { key: 'brand', label: 'الماركة', type: 'text' },
  { key: 'size', label: 'الحجم', type: 'text', placeholder: '4.0 × 10mm' },
  { key: 'position', label: 'الموضع', type: 'text' },
  {
    key: 'healing_status',
    label: 'حالة الالتئام',
    type: 'select',
    options: [
      { value: 'healing', label: 'قيد الالتئام' },
      { value: 'healed', label: 'مكتمل' },
      { value: 'failed', label: 'فشل' }
    ]
  },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', showInTable: false }
]

const CONSENT_COLS: RecCol[] = [
  { key: 'date', label: 'التاريخ', type: 'date' },
  { key: 'procedure_name', label: 'الإجراء', type: 'text', required: true },
  { key: 'signed_by', label: 'الموقّع', type: 'text' },
  { key: 'content', label: 'نص الموافقة', type: 'textarea', showInTable: false },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', showInTable: false }
]

const RISK_COLS: RecCol[] = [
  { key: 'date', label: 'التاريخ', type: 'date' },
  {
    key: 'caries_risk',
    label: 'خطر التسوس',
    type: 'select',
    options: [
      { value: 'low', label: 'منخفض' },
      { value: 'medium', label: 'متوسط' },
      { value: 'high', label: 'مرتفع' }
    ]
  },
  {
    key: 'perio_risk',
    label: 'خطر اللثة',
    type: 'select',
    options: [
      { value: 'low', label: 'منخفض' },
      { value: 'medium', label: 'متوسط' },
      { value: 'high', label: 'مرتفع' }
    ]
  },
  { key: 'recommendations', label: 'التوصيات الوقائية', type: 'textarea', showInTable: false },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', showInTable: false }
]

const REFERRAL_COLS: RecCol[] = [
  { key: 'date', label: 'التاريخ', type: 'date' },
  {
    key: 'direction',
    label: 'الاتجاه',
    type: 'select',
    options: [
      { value: 'out', label: 'إحالة صادرة' },
      { value: 'in', label: 'إحالة واردة' }
    ]
  },
  { key: 'specialist', label: 'الأخصائي', type: 'text' },
  { key: 'specialty', label: 'الاختصاص', type: 'text' },
  { key: 'reason', label: 'السبب', type: 'textarea', showInTable: false },
  {
    key: 'status',
    label: 'الحالة',
    type: 'select',
    options: [
      { value: 'pending', label: 'قيد الانتظار' },
      { value: 'done', label: 'منجزة' },
      { value: 'cancelled', label: 'ملغاة' }
    ]
  },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', showInTable: false }
]

const RECALL_LABEL: Record<RecallType, string> = { checkup: 'فحص دوري', cleaning: 'تنظيف', followup: 'متابعة' }

function PerioTab({ patientId }: { patientId: number }): React.JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<PeriodontalChartEntry[]>([])
  useEffect(() => {
    window.clinic.periodontal
      .list(patientId)
      .then(setRows)
      .catch((e) => toast(e.message, 'error'))
  }, [patientId, toast])
  if (rows.length === 0) return <Empty text="لا توجد قياسات لثة مسجّلة" />
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>السن</th>
            <th>عمق الجيب</th>
            <th>النزيف</th>
            <th>الحركة</th>
            <th>الانحسار</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tooth_number}>
              <td>{r.tooth_number}</td>
              <td>{r.pocket_depth}</td>
              <td>{r.bleeding ? 'نعم' : 'لا'}</td>
              <td>{r.mobility}</td>
              <td>{r.recession}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function XrayTab({
  attachments,
  onAttachmentsChanged
}: {
  attachments: PatientAttachment[]
  onAttachmentsChanged: () => void
}): React.JSX.Element {
  const toast = useToast()
  const rows = attachments.filter((a) => a.ftype === 'image' || a.ftype === 'dicom')
  const setTooth = (id: number, tooth: string): void => {
    window.clinic.attachments
      .setTooth(id, tooth)
      .then(() => {
        toast('تم تحديث ربط السن', 'success')
        onAttachmentsChanged()
      })
      .catch((e) => toast(e.message, 'error'))
  }
  if (rows.length === 0) return <Empty text="لا توجد صور أو أشعة" />
  return (
    <div className="xray-grid">
      {rows.map((a) => (
        <div key={a.id} className="xray-card">
          <div className="xray-thumb">
            {a.ftype === 'image' ? <XrayThumb id={a.id} /> : <span>🦴 DICOM</span>}
          </div>
          <div className="xray-name">{a.filename}</div>
          <div className="xray-row">
            <input
              className="inline-input"
              dir="ltr"
              placeholder="السن"
              defaultValue={a.tooth_number}
              onBlur={(e) => {
                if (e.target.value.trim() !== a.tooth_number) setTooth(a.id, e.target.value.trim())
              }}
            />
            <button className="ghost small" onClick={() => window.clinic.attachments.openExternal(a.id)}>
              فتح
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function XrayThumb({ id }: { id: number }): React.JSX.Element {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    window.clinic.attachments
      .read(id)
      .then((r) => {
        if (alive) setUrl(r.dataUrl)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [id])
  return url ? <img src={url} alt="" /> : <span>…</span>
}

function RecallTab({ patientId }: { patientId: number }): React.JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<RecallReminder[]>([])
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<RecallType>('checkup')
  const [due, setDue] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(() => {
    window.clinic.recall
      .list()
      .then((all) => setRows(all.filter((r) => r.patient_id === patientId)))
      .catch((e) => toast(e.message, 'error'))
  }, [patientId, toast])
  useEffect(() => {
    load()
  }, [load])

  const add = (): void => {
    if (!due) {
      toast('حدد تاريخ التذكير', 'error')
      return
    }
    window.clinic.recall
      .create(patientId, type, due, notes)
      .then(() => {
        toast('تمت إضافة التذكير', 'success')
        setOpen(false)
        setDue('')
        setNotes('')
        load()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  return (
    <div className="rec-tab">
      <div className="rec-toolbar">
        <button className="small" onClick={() => setOpen(true)}>
          ＋ تذكير جديد
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty text="لا توجد تذكيرات" />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>النوع</th>
                <th>تاريخ الاستحقاق</th>
                <th>ملاحظات</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{RECALL_LABEL[r.recall_type] ?? r.recall_type}</td>
                  <td>{r.due_date}</td>
                  <td>{r.notes || '—'}</td>
                  <td className="rec-actions">
                    <button
                      className="soft small"
                      onClick={() =>
                        window.clinic.recall.complete(r.id).then(() => {
                          toast('تم إنجاز التذكير', 'success')
                          load()
                        })
                      }
                    >
                      إنجاز
                    </button>
                    <button
                      className="danger-ghost small"
                      onClick={() =>
                        window.clinic.recall.delete(r.id).then(() => load())
                      }
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Modal
          title="تذكير جديد"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="ghost" onClick={() => setOpen(false)}>
                إلغاء
              </button>
              <button onClick={add}>حفظ</button>
            </>
          }
        >
          <Field label="النوع">
            <select value={type} onChange={(e) => setType(e.target.value as RecallType)}>
              <option value="checkup">فحص دوري (6 أشهر)</option>
              <option value="cleaning">تنظيف</option>
              <option value="followup">متابعة</option>
            </select>
          </Field>
          <Field label="تاريخ الاستحقاق">
            <input type="date" dir="ltr" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="ملاحظات">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  )
}

function PrintLibraryTab({ kind, patientName, title }: { kind: string; patientName: string; title: string }): React.JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  useEffect(() => {
    window.clinic.records
      .list(kind)
      .then(setRows)
      .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
  }, [kind, toast])

  const printOne = (r: Record<string, unknown>): void => {
    window.clinic.printing
      .document({
        title: String(r.title || r.procedure_name || title),
        content: String(r.content ?? ''),
        patientName
      })
      .then((res) => {
        if (!res.ok) toast(res.error || 'تعذّرت الطباعة', 'error')
      })
      .catch((e) => toast(e.message, 'error'))
  }

  if (rows.length === 0) return <Empty text="لا توجد عناصر. أضِفها من شاشة «طب الأسنان»." />
  return (
    <div className="print-lib">
      {rows.map((r) => (
        <div key={String(r.id)} className="print-item">
          <div>
            <div className="print-title">{String(r.title || r.procedure_name)}</div>
            <div className="muted rec-preview">{String(r.content ?? '').slice(0, 120)}</div>
          </div>
          <button className="soft small" onClick={() => printOne(r)}>
            طباعة
          </button>
        </div>
      ))}
    </div>
  )
}

const TABS = [
  { key: 'chart', label: 'المخطط' },
  { key: 'plans', label: 'خطط العلاج' },
  { key: 'history', label: 'سجل الأسنان' },
  { key: 'perio', label: 'قياسات اللثة' },
  { key: 'xray', label: 'الأشعة والصور' },
  { key: 'recall', label: 'التذكيرات' },
  { key: 'anesthesia', label: 'التخدير' },
  { key: 'lab', label: 'المختبر' },
  { key: 'implants', label: 'الزراعة' },
  { key: 'consents', label: 'الموافقات' },
  { key: 'risk', label: 'تقييم المخاطر' },
  { key: 'referrals', label: 'الإحالات' },
  { key: 'postop', label: 'تعليمات ما بعد العملية' },
  { key: 'education', label: 'تعليم المرضى' },
  { key: 'notes', label: 'ملاحظات سريرية' }
]

export default function DentalRecord({
  patientId,
  patientName,
  rate,
  attachments,
  onAttachmentsChanged
}: {
  patientId: number
  patientName: string
  rate: number
  attachments: PatientAttachment[]
  onAttachmentsChanged: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState('chart')
  return (
    <div className="dental-record">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="dtab-content">
        {tab === 'chart' && (
          <Odontogram patientId={patientId} attachments={attachments} onAttachmentsChanged={onAttachmentsChanged} />
        )}
        {tab === 'plans' && <TreatmentPlans patientId={patientId} rate={rate} />}
        {tab === 'history' && (
          <RecordsTab kind="tooth_history" patientId={patientId} columns={HISTORY_COLS} emptyText="لا يوجد سجل إجراءات" />
        )}
        {tab === 'perio' && <PerioTab patientId={patientId} />}
        {tab === 'xray' && <XrayTab attachments={attachments} onAttachmentsChanged={onAttachmentsChanged} />}
        {tab === 'recall' && <RecallTab patientId={patientId} />}
        {tab === 'anesthesia' && (
          <RecordsTab kind="anesthesia" patientId={patientId} columns={ANESTHESIA_COLS} emptyText="لا يوجد سجل تخدير" />
        )}
        {tab === 'lab' && (
          <RecordsTab kind="lab_cases" patientId={patientId} columns={LAB_COLS} emptyText="لا توجد حالات مختبر" />
        )}
        {tab === 'implants' && (
          <RecordsTab kind="implants" patientId={patientId} columns={IMPLANT_COLS} emptyText="لا يوجد سجل زراعة" />
        )}
        {tab === 'consents' && (
          <RecordsTab kind="consents" patientId={patientId} columns={CONSENT_COLS} emptyText="لا توجد موافقات" />
        )}
        {tab === 'risk' && (
          <RecordsTab kind="risk_assessments" patientId={patientId} columns={RISK_COLS} emptyText="لا يوجد تقييم مخاطر" />
        )}
        {tab === 'referrals' && (
          <RecordsTab kind="referrals" patientId={patientId} columns={REFERRAL_COLS} emptyText="لا توجد إحالات" />
        )}
        {tab === 'postop' && <PrintLibraryTab kind="postop" patientName={patientName} title="تعليمات ما بعد العملية" />}
        {tab === 'education' && <PrintLibraryTab kind="education" patientName={patientName} title="تعليم المرضى" />}
        {tab === 'notes' && <PrintLibraryTab kind="clinical_notes" patientName={patientName} title="ملاحظات سريرية" />}
      </div>
    </div>
  )
}