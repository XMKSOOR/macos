import { useCallback, useEffect, useState } from 'react'
import { Confirm, Field, Modal, SearchBox, useToast } from '../ui'
import DataGrid from '../table'
import type { Col } from '../table'
import ExcelBar from '../excel'
import type { Patient, Role, Settings } from '../lib'
import { can, toLatinDigits, today } from '../lib'
import PatientFile from './PatientFile'

const empty: Omit<Patient, 'id' | 'created_at'> = {
  name: '',
  phone: '',
  birth_date: '',
  gender: '',
  address: '',
  notes: ''
}

const cols: Col<Patient>[] = [
  { key: 'name', label: 'الاسم' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'gender', label: 'الجنس', type: 'select', options: [{ value: 'ذكر', label: 'ذكر' }, { value: 'أنثى', label: 'أنثى' }] },
  { key: 'birth_date', label: 'تاريخ الميلاد', type: 'date' },
  { key: 'address', label: 'العنوان' },
  { key: 'notes', label: 'ملاحظات' }
]

export default function Patients({
  settings,
  role,
  fileId,
  onCloseFile
}: {
  settings: Settings | null
  role: Role
  fileId?: number | null
  onCloseFile?: () => void
}): React.JSX.Element {
  const [list, setList] = useState<Patient[]>([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [deleting, setDeleting] = useState<Patient | null>(null)
  const [fileOf, setFileOf] = useState<number | null>(null)
  const toast = useToast()

  const canEdit = can(role, 'edit')
  const canDelete = can(role, 'delete')
  const canImport = can(role, 'import')

  const activeFile = fileId ?? fileOf ?? null

  const load = useCallback(
    (term?: string) => {
      window.clinic.patients
        .list(term)
        .then(setList)
        .catch((e) => toast(e.message, 'error'))
    },
    [toast]
  )

  useEffect(() => {
    load()
  }, [load])

  const openNew = (): void => {
    setForm(empty)
    setModal(true)
  }

  const save = (): void => {
    if (!form.name.trim()) {
      toast('الاسم مطلوب', 'error')
      return
    }
    window.clinic.patients
      .create({ ...form, name: form.name.trim() })
      .then(() => {
        toast('تمت الإضافة', 'success')
        setModal(false)
        load(search)
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const remove = (): void => {
    if (!deleting) return
    window.clinic.patients
      .delete(deleting.id)
      .then(() => {
        toast('تم الحذف', 'success')
        load(search)
      })
      .catch((e) => toast(e.message, 'error'))
    setDeleting(null)
  }

  const onRowSave = useCallback(
    async (key: number | string, patch: Record<string, unknown>): Promise<void> => {
      await window.clinic.patients.update(Number(key), patch)
      load(search)
    },
    [load, search]
  )

  const onImportRows = useCallback(
    async (rows: Record<string, string>[]) => {
      const res = await window.clinic.patients.importRows(rows)
      load(search)
      return res
    },
    [load, search]
  )

  const exportRows = (): Record<string, string | number>[] =>
    list.map((p) => ({
      name: p.name,
      phone: p.phone,
      gender: p.gender,
      birth_date: p.birth_date,
      address: p.address,
      notes: p.notes
    }))

  return (
    <div>
      <div className="panel">
        <div className="panel-head">
          <h2>قائمة المرضى</h2>
          <div className="toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="بحث بالاسم أو الهاتف..." />
            <ExcelBar schema="patients" title="المرضى" buildRows={exportRows} onImportRows={canImport ? onImportRows : undefined} />
            <button onClick={openNew}>+ مريض جديد</button>
          </div>
        </div>
        <div className="panel-body">
          <DataGrid
            rows={list}
            cols={cols}
            rowKey={(p) => p.id}
            canEdit={canEdit}
            onSave={onRowSave}
            onRowDoubleClick={(p) => setFileOf(p.id)}
            emptyText="لا يوجد مرضى"
            actions={(p) => (
              <div className="actions-cell">
                <button className="small" onClick={() => setFileOf(p.id)}>
                  الملف
                </button>
                {canDelete && (
                  <button className="danger-ghost small" onClick={() => setDeleting(p)}>
                    حذف
                  </button>
                )}
              </div>
            )}
          />
        </div>
      </div>

      {modal && (
        <Modal
          title="مريض جديد"
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
            <Field label="الاسم *">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="الهاتف">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: toLatinDigits(e.target.value) })} />
            </Field>
            <Field label="تاريخ الميلاد">
              <input type="date" max={today()} value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            </Field>
            <Field label="الجنس">
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">—</option>
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
            </Field>
            <Field label="العنوان">
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="ملاحظات">
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {activeFile !== null && (
        <PatientFile
          id={activeFile}
          rate={settings?.usd_rate ?? 130}
          onClose={() => {
            setFileOf(null)
            onCloseFile?.()
          }}
        />
      )}

      {deleting && (
        <Confirm
          title="حذف مريض"
          message={`هل تريد حذف المريض "${deleting.name}"؟ سيتم حذف مواعيده أيضاً.`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}