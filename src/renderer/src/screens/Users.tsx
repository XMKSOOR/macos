import { useCallback, useEffect, useState } from 'react'
import { Confirm, Empty, Field, Modal, useToast } from '../ui'
import ExcelBar from '../excel'
import type { PermissionKey, PermissionOverride, Role, User } from '../lib'
import { PERMISSION_LABELS } from '../lib'

type Tri = 'allow' | 'deny' | undefined
type PermForm = Record<string, Tri>

interface UserForm {
  username: string
  password: string
  role: Role
  full_name: string
  perms: PermForm
}

const PERM_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[]

function toTri(perms?: PermissionOverride): PermForm {
  const out: PermForm = {}
  for (const k of PERM_KEYS) {
    if (perms && k in perms) out[k] = perms[k] ? 'allow' : 'deny'
  }
  return out
}

function triToOverride(perms: PermForm): PermissionOverride {
  const o: PermissionOverride = {}
  for (const [k, v] of Object.entries(perms)) {
    if (v) o[k as PermissionKey] = v === 'allow'
  }
  return o
}

const empty: UserForm = { username: '', password: '', role: 'cashier', full_name: '', perms: {} }

export default function UsersScreen({ currentUser, onSaved }: { currentUser: User; onSaved?: () => void }): React.JSX.Element {
  const [list, setList] = useState<User[]>([])
  const [modal, setModal] = useState<'new' | User | null>(null)
  const [form, setForm] = useState<UserForm>(empty)
  const [deleting, setDeleting] = useState<User | null>(null)
  const toast = useToast()

  const load = useCallback(() => {
    window.clinic.users.list().then(setList).catch((e) => toast(e.message, 'error'))
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const roleLabel = (r: string): string => (r === 'admin' ? 'مدير' : r === 'doctor' ? 'طبيب' : 'صراف')

  const openNew = (): void => {
    setForm(empty)
    setModal('new')
  }
  const openEdit = (u: User): void => {
    setModal(u)
    setForm({ username: u.username, password: '', role: u.role, full_name: u.full_name, perms: toTri(u.permissions) })
  }

  const cycle = (key: string): void => {
    setForm((f) => {
      const cur = f.perms[key]
      const next: Tri = cur === 'allow' ? 'deny' : cur === 'deny' ? undefined : 'allow'
      return { ...f, perms: { ...f.perms, [key]: next } }
    })
  }

  const save = (): void => {
    if (!form.username.trim()) {
      toast('اسم المستخدم مطلوب', 'error')
      return
    }
    const username = form.username.trim()
    const permissions = triToOverride(form.perms)
    if (modal === 'new') {
      if (!form.password) {
        toast('كلمة المرور مطلوبة لمستخدم جديد', 'error')
        return
      }
      window.clinic.users
        .create({ username, password: form.password, role: form.role, full_name: form.full_name, permissions })
        .then(() => {
          toast('تمت الإضافة', 'success')
          setModal(null)
          load()
        })
        .catch((e) => toast(e.message, 'error'))
    } else {
      const editing = modal
      if (!editing) return
      const payload: { username: string; role: string; full_name: string; password?: string; permissions?: PermissionOverride } = {
        username,
        role: form.role,
        full_name: form.full_name,
        permissions
      }
      if (form.password) payload.password = form.password
      window.clinic.users
        .update(editing.id, payload)
        .then(() => {
          toast('تم الحفظ', 'success')
          setModal(null)
          load()
          if (editing.id === currentUser.id && onSaved) onSaved()
        })
        .catch((e) => toast(e.message, 'error'))
    }
  }

  const remove = (): void => {
    if (!deleting) return
    if (deleting.id === currentUser.id) {
      toast('لا يمكنك حذف حسابك الحالي', 'error')
      setDeleting(null)
      return
    }
    window.clinic.users
      .delete(deleting.id)
      .then(() => {
        toast('تم الحذف', 'success')
        load()
      })
      .catch((e) => toast(e.message, 'error'))
    setDeleting(null)
  }

  const exportRows = (): Record<string, string | number>[] =>
    list.map((u) => ({ username: u.username, full_name: u.full_name, role: u.role }))

  const hasCustom = (u: User): boolean => !!u.permissions && Object.keys(u.permissions).length > 0

  return (
    <div>
      <div className="panel">
        <div className="panel-head">
          <h2>المستخدمون والأدوار</h2>
          <div className="toolbar">
            <ExcelBar schema="users" title="المستخدمون" buildRows={exportRows} />
            <button onClick={openNew}>+ مستخدم جديد</button>
          </div>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم المستخدم</th>
                  <th>الاسم الكامل</th>
                  <th>الدور</th>
                  <th>الصلاحيات</th>
                  <th>تاريخ الإنشاء</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <Empty text="لا يوجد مستخدمون" />
                    </td>
                  </tr>
                ) : (
                  list.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td style={{ fontWeight: 600 }}>{u.username}</td>
                      <td>{u.full_name || '—'}</td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'blue' : u.role === 'doctor' ? 'green' : 'gray'}`}>
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td>{hasCustom(u) ? <span className="badge warn">صلاحيات مخصصة</span> : <span className="muted">افتراضية</span>}</td>
                      <td>{u.created_at}</td>
                      <td>
                        <div className="row-actions">
                          <button className="soft small" onClick={() => openEdit(u)}>
                            تعديل
                          </button>
                          <button className="danger-ghost small" onClick={() => setDeleting(u)}>
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            الصلاحية المخصصة (✓ تسمح / ✗ تمنع): عند اختيار أي صلاحية لاستخدام معيّن تُطغى على قاعدة الدور. اختر الدور بحكمة: لا تمنح صلاحية
            «إدارة المستخدمين» لغير المدير.
          </p>
        </div>
      </div>

      {modal && (
        <Modal
          title={modal === 'new' ? 'مستخدم جديد' : 'تعديل مستخدم'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button onClick={save}>{modal === 'new' ? 'إضافة' : 'حفظ'}</button>
              <button className="ghost" onClick={() => setModal(null)}>
                إلغاء
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="اسم المستخدم *">
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus />
            </Field>
            <Field label={modal === 'new' ? 'كلمة المرور *' : 'كلمة المرور (اتركها فارغة للإبقاء)'}>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="الاسم الكامل">
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="الدور">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="admin">مدير</option>
                <option value="doctor">طبيب</option>
                <option value="cashier">صراف</option>
              </select>
            </Field>
          </div>

          <div className="mt-8">
            <div className="muted mb-8" style={{ fontSize: 12, fontWeight: 700 }}>
              الصلاحيات المخصصة (انقر للتبديل: ✓ تسمح ← ✗ تمنع ← افتراضي):
            </div>
            <div className="perm-grid">
              {PERM_KEYS.map((k) => {
                const v = form.perms[k]
                return (
                  <button
                    key={k}
                    type="button"
                    className={`perm-toggle ${v === 'allow' ? 'on' : v === 'deny' ? 'off' : ''}`}
                    onClick={() => cycle(k)}
                    title={v === 'allow' ? 'يُسمح' : v === 'deny' ? 'يُمنع' : 'بحسب الدور'}
                  >
                    <span className="perm-state">{v === 'allow' ? '✓' : v === 'deny' ? '✗' : '—'}</span>
                    <span>{PERMISSION_LABELS[k]}</span>
                  </button>
                )
              })}
            </div>
            <div className="muted mt-8" style={{ fontSize: 12 }}>
              الدور الحالي: {roleLabel(form.role)} — الصلاحيات غير المحددة تبقى بحسب الدور.
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Confirm
          title="حذف مستخدم"
          message={`حذف المستخدم "${deleting.username}"؟`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}