import { useState } from 'react'
import { Confirm, DrillHead, Field, KV, StatusBadge, useToast } from '../ui'
import { SearchSelect } from '../SearchSelect'
import type { Appointment, Patient, Role } from '../lib'
import { can } from '../lib'

export default function AppointmentFile({
  appt,
  patients,
  role,
  onClose,
  onSaved,
  onOpenPatient
}: {
  appt: Appointment
  patients: Patient[]
  role: Role
  onClose: () => void
  onSaved: () => void
  onOpenPatient?: (id: string) => void
}): React.JSX.Element {
  const [form, setForm] = useState({
    patient_id: appt.patient_id,
    date: appt.date,
    time: appt.time,
    reason: appt.reason,
    notes: appt.notes,
    status: appt.status
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const toast = useToast()
  const canEdit = can(role, 'edit')
  const canDelete = can(role, 'delete')
  const patient = patients.find((p) => p.id === appt.patient_id)

  const save = (): void => {
    if (!form.patient_id) {
      toast('اختر المريض', 'error')
      return
    }
    setSaving(true)
    window.clinic.appointments
      .update(appt.id, form)
      .then(() => {
        toast('تم حفظ الموعد', 'success')
        onSaved()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setSaving(false))
  }

  const remove = (): void => {
    window.clinic.appointments
      .delete(appt.id)
      .then(() => {
        toast('تم حذف الموعد', 'success')
        onSaved()
        onClose()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  return (
    <>
      <div className="drill-page">
        <DrillHead crumb="المواعيد" current={appt.patient_name || 'موعد'} onBack={onClose}>
          {onOpenPatient && appt.patient_id ? (
            <button className="soft small" onClick={() => onOpenPatient(appt.patient_id)}>
              ملف المريض
            </button>
          ) : null}
          {canDelete && (
            <button className="danger-ghost small" onClick={() => setDeleting(true)}>
              حذف الموعد
            </button>
          )}
        </DrillHead>

        <div className="drill-summary">
          <span className="muted">
            الحالة: <StatusBadge status={appt.status} /> — التاريخ: {appt.date} {appt.time}
          </span>
        </div>

        <div className="drill-body">
          <div className="panel">
            <div className="panel-head">
              <h2>بيانات المريض</h2>
            </div>
            <div className="panel-body">
              <div className="meta-grid">
                <KV label="المريض">{patient?.name ?? appt.patient_name ?? '—'}</KV>
                <KV label="الهاتف">
                  <span dir="ltr">{patient?.phone || appt.patient_phone || '—'}</span>
                </KV>
                <KV label="الجنس">{patient?.gender || '—'}</KV>
                <KV label="العنوان">{patient?.address || '—'}</KV>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>تفاصيل الموعد</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label="المريض *">
                  <SearchSelect
                    value={form.patient_id}
                    onChange={(v) => setForm({ ...form, patient_id: v })}
                    options={[
                      { value: '', label: 'اختر المريض...' },
                      ...patients.map((p) => ({ value: p.id, label: `${p.name}${p.phone ? ` (${p.phone})` : ''}` }))
                    ]}
                  />
                </Field>
                <Field label="التاريخ *">
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </Field>
                <Field label="الوقت">
                  <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </Field>
                <Field label="الحالة">
                  <SearchSelect
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v as Appointment['status'] })}
                    options={[
                      { value: 'scheduled', label: 'مجدول' },
                      { value: 'done', label: 'منجز' },
                      { value: 'cancelled', label: 'ملغي' }
                    ]}
                  />
                </Field>
                <Field label="السبب">
                  <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                </Field>
                <Field label="ملاحظات">
                  <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </Field>
                <div className="field full">
                  <KV label="أنشئ في">{appt.created_at || '—'}</KV>
                </div>
              </div>
              {canEdit && (
                <div className="flex end" style={{ marginTop: 12 }}>
                  <button disabled={saving} onClick={save}>
                    {saving ? '...' : 'حفظ التعديلات'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {deleting && (
        <Confirm
          title="حذف موعد"
          message={`حذف موعد "${appt.patient_name}" في ${appt.date}؟`}
          onConfirm={remove}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  )
}
