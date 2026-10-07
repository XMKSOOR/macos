import { useCallback, useEffect, useState } from 'react'
import { Empty, useToast } from '../ui'
import { RecordsTab, Tabs } from './Records'
import type { RecCol } from './Records'
import type { RecallReminder, RecallType } from '../lib'

const TEMPLATE_COLS: RecCol[] = [
  { key: 'name', label: 'الإجراء', type: 'text', required: true },
  { key: 'category', label: 'الفئة', type: 'text' },
  { key: 'default_cost', label: 'الكلفة الافتراضية', type: 'money' },
  { key: 'materials', label: 'المواد', type: 'textarea', showInTable: false },
  { key: 'description', label: 'الوصف', type: 'textarea', showInTable: false }
]

const INSURANCE_COLS: RecCol[] = [
  { key: 'code', label: 'الرمز', type: 'text', required: true },
  { key: 'procedure_name', label: 'الإجراء', type: 'text', required: true },
  { key: 'category', label: 'الفئة', type: 'text' },
  { key: 'fee', label: 'الرسم', type: 'money' },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', showInTable: false }
]

const STERILIZATION_COLS: RecCol[] = [
  { key: 'date', label: 'التاريخ', type: 'date' },
  { key: 'cycle_no', label: 'رقم الدورة', type: 'text' },
  { key: 'device', label: 'الجهاز', type: 'text' },
  {
    key: 'method',
    label: 'الطريقة',
    type: 'select',
    options: [
      { value: 'autoclave', label: 'أوتوكلاف (بخار)' },
      { value: 'dry_heat', label: 'حرارة جافة' },
      { value: 'chemical', label: 'مواد كيميائية' }
    ]
  },
  { key: 'temperature', label: 'الحرارة', type: 'text', showInTable: false },
  { key: 'pressure', label: 'الضغط', type: 'text', showInTable: false },
  { key: 'duration', label: 'المدة', type: 'text', showInTable: false },
  {
    key: 'result',
    label: 'النتيجة',
    type: 'select',
    options: [
      { value: 'pass', label: 'ناجحة' },
      { value: 'fail', label: 'فاشلة' }
    ]
  },
  { key: 'operator', label: 'المشغّل', type: 'text' },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', showInTable: false }
]

const EDUCATION_COLS: RecCol[] = [
  { key: 'title', label: 'العنوان', type: 'text', required: true },
  { key: 'category', label: 'الفئة', type: 'text' },
  { key: 'content', label: 'المحتوى', type: 'textarea' }
]

const NOTES_COLS: RecCol[] = [
  { key: 'title', label: 'العنوان', type: 'text', required: true },
  { key: 'category', label: 'الفئة', type: 'text' },
  { key: 'content', label: 'المحتوى', type: 'textarea' }
]

const POSTOP_COLS: RecCol[] = [
  { key: 'procedure_name', label: 'الإجراء', type: 'text', required: true },
  { key: 'title', label: 'العنوان', type: 'text' },
  { key: 'content', label: 'التعليمات', type: 'textarea' }
]

const RECALL_LABEL: Record<RecallType, string> = { checkup: 'فحص دوري', cleaning: 'تنظيف', followup: 'متابعة' }

function RecallCenter(): React.JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<RecallReminder[]>([])
  const load = useCallback(() => {
    window.clinic.recall
      .list()
      .then(setRows)
      .catch((e) => toast(e.message, 'error'))
  }, [toast])
  useEffect(() => {
    load()
  }, [load])

  if (rows.length === 0) return <Empty text="لا توجد تذكيرات مستحقة" />
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>المريض</th>
            <th>النوع</th>
            <th>تاريخ الاستحقاق</th>
            <th>ملاحظات</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.patient_name ?? r.patient_id}</td>
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
                <button className="danger-ghost small" onClick={() => window.clinic.recall.delete(r.id).then(() => load())}>
                  حذف
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const TABS = [
  { key: 'templates', label: 'قوالب الإجراءات' },
  { key: 'insurance', label: 'جدول رسوم التأمين' },
  { key: 'sterilization', label: 'سجل التعقيم' },
  { key: 'education', label: 'تعليم المرضى' },
  { key: 'notes', label: 'قوالب الملاحظات السريرية' },
  { key: 'postop', label: 'تعليمات ما بعد العملية' },
  { key: 'recall', label: 'مركز التذكيرات' }
]

export default function Dental(): React.JSX.Element {
  const [tab, setTab] = useState('templates')
  return (
    <div className="panel">
      <div className="panel-body">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="dtab-content">
          {tab === 'templates' && <RecordsTab kind="procedure_templates" columns={TEMPLATE_COLS} emptyText="لا توجد قوالب إجراءات" />}
          {tab === 'insurance' && <RecordsTab kind="insurance_fees" columns={INSURANCE_COLS} emptyText="لا يوجد جدول رسوم تأمين" />}
          {tab === 'sterilization' && <RecordsTab kind="sterilization" columns={STERILIZATION_COLS} emptyText="لا يوجد سجل تعقيم" />}
          {tab === 'education' && <RecordsTab kind="education" columns={EDUCATION_COLS} emptyText="لا توجد مواد تعليم" />}
          {tab === 'notes' && <RecordsTab kind="clinical_notes" columns={NOTES_COLS} emptyText="لا توجد قوالب ملاحظات" />}
          {tab === 'postop' && <RecordsTab kind="postop" columns={POSTOP_COLS} emptyText="لا توجد تعليمات ما بعد العملية" />}
          {tab === 'recall' && <RecallCenter />}
        </div>
      </div>
    </div>
  )
}