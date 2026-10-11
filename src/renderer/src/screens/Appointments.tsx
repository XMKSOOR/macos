import { useCallback, useEffect, useState } from 'react'
import { Confirm, Field, Modal, StatusBadge, useToast } from '../ui'
import { SearchSelect } from '../SearchSelect'
import DataGrid from '../table'
import type { Col } from '../table'
import ExcelBar, { exportNow } from '../excel'
import type { Appointment, Patient, Role } from '../lib'
import { can, today } from '../lib'

const cols = (onOpenPatient?: (id: number) => void): Col<Appointment>[] => [
  {
    key: 'patient_name',
    label: 'المريض',
    type: 'display',
    render: (a) =>
      a.patient_id && onOpenPatient ? (
        <button className="link" onClick={() => onOpenPatient(a.patient_id)}>
          {a.patient_name}
        </button>
      ) : (
        a.patient_name
      )
  },
  { key: 'date', label: 'التاريخ', type: 'date' },
  { key: 'time', label: 'الوقت' },
  { key: 'reason', label: 'السبب' },
  {
    key: 'status',
    label: 'الحالة',
    type: 'select',
    options: [
      { value: 'scheduled', label: 'مجدول' },
      { value: 'done', label: 'منجز' },
      { value: 'cancelled', label: 'ملغي' }
    ],
    render: (a) => <StatusBadge status={a.status} />
  },
  { key: 'notes', label: 'ملاحظات' }
]

export default function Appointments({
  role,
  onOpenPatient
}: {
  role: Role
  onOpenPatient?: (id: number) => void
}): React.JSX.Element {
  const [list, setList] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<{ patient_id: number; date: string; time: string; reason: string; status: Appointment['status']; notes: string }>({
    patient_id: 0,
    date: today(),
    time: '',
    reason: '',
    status: 'scheduled',
    notes: ''
  })
  const [deleting, setDeleting] = useState<Appointment | null>(null)
  const toast = useToast()

  const canEdit = can(role, 'edit')
  const canDelete = can(role, 'delete')
  const canImport = can(role, 'import')

  const load = useCallback(
    (date?: string, status?: string) => {
      const f: { date?: string; status?: string } = {}
      if (date) f.date = date
      if (status) f.status = status
      window.clinic.appointments.list(f).then(setList).catch((e) => toast(e.message, 'error'))
    },
    [toast]
  )

  useEffect(() => {
    load(dateFilter, statusFilter)
  }, [load, dateFilter, statusFilter])

  useEffect(() => {
    window.clinic.patients.list().then(setPatients).catch(() => {})
  }, [])

  const save = (): void => {
    if (!form.patient_id) {
      toast('اختر المريض', 'error')
      return
    }
    window.clinic.appointments
      .create(form)
      .then(() => {
        toast('تمت الإضافة', 'success')
        setModal(false)
        load(dateFilter, statusFilter)
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const remove = (): void => {
    if (!deleting) return
    window.clinic.appointments
      .delete(deleting.id)
      .then(() => {
        toast('تم الحذف', 'success')
        load(dateFilter, statusFilter)
      })
      .catch((e) => toast(e.message, 'error'))
    setDeleting(null)
  }

  const onRowSave = useCallback(
    async (key: number | string, patch: Record<string, unknown>): Promise<void> => {
      await window.clinic.appointments.update(Number(key), patch)
      load(dateFilter, statusFilter)
    },
    [load, dateFilter, statusFilter]
  )

  const onImportRows = useCallback(
    async (rows: Record<string, string>[]) => {
      let ok = 0
      let skip = 0
      for (const r of rows) {
        if (!r.patient_name || !r.date) {
          skip++
          continue
        }
        const f = patients.find((p) => p.name.trim().toLowerCase() === r.patient_name.trim().toLowerCase())
        if (!f) {
          skip++
          continue
        }
        try {
          await window.clinic.appointments.create({
            patient_id: f.id,
            date: r.date,
            time: r.time ?? '',
            reason: r.reason ?? '',
            status: (r.status === 'done' || r.status === 'cancelled' ? r.status : 'scheduled') as Appointment['status'],
            notes: r.notes ?? ''
          })
          ok++
        } catch {
          skip++
        }
      }
      load(dateFilter, statusFilter)
      return { ok, skip }
    },
    [patients, load, dateFilter, statusFilter]
  )

  const exportRows = (rows: Appointment[] = list): Record<string, string | number>[] =>
    rows.map((a) => ({
      patient_name: a.patient_name ?? '',
      date: a.date,
      time: a.time,
      reason: a.reason,
      status: a.status,
      notes: a.notes
    }))

  return (
    <div>
      <div className="panel">
        <div className="panel-head">
          <h2>المواعيد</h2>
          <div className="toolbar">
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            <SearchSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'كل الحالات' },
                { value: 'scheduled', label: 'مجدول' },
                { value: 'done', label: 'منجز' },
                { value: 'cancelled', label: 'ملغي' }
              ]}
            />
            <ExcelBar schema="appointments" title="المواعيد" buildRows={exportRows} onImportRows={canImport ? onImportRows : undefined} />
            <button onClick={() => { setForm({ patient_id: 0, date: today(), time: '', reason: '', status: 'scheduled', notes: '' }); setModal(true) }}>+ موعد جديد</button>
          </div>
        </div>
        <div className="panel-body">
          <DataGrid
            rows={list}
            cols={cols(onOpenPatient)}
            rowKey={(a) => a.id}
            canEdit={canEdit}
            onSave={onRowSave}
            selectable
            onBulkDelete={
              canDelete
                ? async (rows) => {
                    for (const a of rows) await window.clinic.appointments.delete(a.id)
                    toast(`تم حذف ${rows.length} موعد`, 'success')
                    load(dateFilter, statusFilter)
                  }
                : undefined
            }
            onBulkExport={(rows) => {
              void exportNow('المواعيد', 'appointments', exportRows(rows))
                .then((p) => {
                  if (p) toast('تم التصدير: ' + p, 'success')
                })
                .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
            }}
            emptyText="لا توجد مواعيد"
            actions={(a) => (
              <>
                {canDelete && (
                  <button className="danger-ghost small" onClick={() => setDeleting(a)}>
                    حذف
                  </button>
                )}
              </>
            )}
          />
        </div>
      </div>

      {modal && (
        <Modal
          title="موعد جديد"
          onClose={() => setModal(false)}
          footer={
            <>
              <button onClick={save}>إضافة</button>
              <button className="ghost" onClick={() => setModal(false)}>
                إلغاء
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="المريض *">
              <SearchSelect
                value={form.patient_id}
                onChange={(v) => setForm({ ...form, patient_id: Number(v) })}
                options={[
                  { value: 0, label: 'اختر المريض...' },
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
            <Field label="السبب">
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            <Field label="ملاحظات">
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {deleting && (
        <Confirm
          title="حذف موعد"
          message={`حذف موعد "${deleting.patient_name}" في ${deleting.date}?`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}