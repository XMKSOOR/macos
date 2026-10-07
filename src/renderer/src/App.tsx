import { useCallback, useEffect, useState } from 'react'
import { ToastHost, useToast } from './ui'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import Patients from './screens/Patients'
import Appointments from './screens/Appointments'
import Billing from './screens/Billing'
import Catalog from './screens/Catalog'
import Inventory from './screens/Inventory'
import Expenses from './screens/Expenses'
import UsersScreen from './screens/Users'
import SettingsScreen from './screens/Settings'
import Finances from './screens/Finances'
import Dental from './screens/Dental'
import type { ScreenKey, Settings, User } from './lib'
import { setCurrentPerms, toLatinDigits } from './lib'

const NAV: { key: ScreenKey; label: string; icon: string; adminOnly?: boolean }[] = [
  { key: 'dashboard', label: 'لوحة التحكم', icon: '📊' },
  { key: 'patients', label: 'المرضى', icon: '👥' },
  { key: 'appointments', label: 'المواعيد', icon: '📅' },
  { key: 'billing', label: 'الفواتير', icon: '🧾' },
  { key: 'catalog', label: 'كتالوج الأصناف', icon: '📋' },
  { key: 'inventory', label: 'المخزون', icon: '📦' },
  { key: 'expenses', label: 'المصاريف', icon: '💸' },
  { key: 'finances', label: 'الجِدوى المالية', icon: '📈' },
  { key: 'dental', label: 'طب الأسنان', icon: '🦷' },
  { key: 'users', label: 'المستخدمون', icon: '🔐', adminOnly: true },
  { key: 'settings', label: 'الإعدادات', icon: '⚙️', adminOnly: true }
]

const TITLES: Record<ScreenKey, string> = {
  dashboard: 'لوحة التحكم',
  patients: 'المرضى',
  appointments: 'المواعيد',
  billing: 'الفواتير والدفعات',
  catalog: 'كتالوج الأصناف',
  inventory: 'المخزون والمواد',
  expenses: 'المصاريف',
  finances: 'الجِدوى المالية (استرداد رأس المال)',
  dental: 'طب الأسنان — القوالب والرسوم والتعقيم والتذكيرات',
  users: 'المستخدمون والأدوار',
  settings: 'الإعدادات'
}

export default function App(): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [screen, setScreen] = useState<ScreenKey>('dashboard')
  const [patientFileId, setPatientFileId] = useState<number | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const toast = useToast()

  useEffect(() => {
    window.clinic.auth
      .me()
      .then((u) => {
        setUser(u ?? null)
        if (u) setCurrentPerms(u.permissions ?? {})
      })
      .catch(() => setUser(null))
  }, [])

  const openPatient = useCallback((id: number): void => {
    setPatientFileId(id)
    setScreen('patients')
  }, [])

  const refreshUser = useCallback(() => {
    window.clinic.auth
      .me()
      .then((u) => {
        setUser(u ?? null)
        if (u) setCurrentPerms(u.permissions ?? {})
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (user) {
      window.clinic.settings
        .get()
        .then(setSettings)
        .catch(() => {})
    }
  }, [user])

  const refreshSettings = useCallback(() => {
    window.clinic.settings.get().then(setSettings).catch(() => {})
  }, [])

  const handleLogout = useCallback(() => {
    window.clinic.auth
      .logout()
      .then(() => {
        setUser(null)
        setCurrentPerms({})
      })
      .catch(() => {
        setUser(null)
        setCurrentPerms({})
      })
  }, [])

  const handleLogin = useCallback((u: User) => {
    setUser(u)
    setCurrentPerms(u.permissions ?? {})
  }, [])

  if (!user) return <Login onLogin={handleLogin} />

  const visibleNav = NAV.filter((n) => !n.adminOnly || user.role === 'admin')

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">🦷</span>
          <span>{settings?.clinic_name || 'نظام العيادة'}</span>
        </div>
        <nav>
          {visibleNav.map((n) => (
            <button
              key={n.key}
              className={`nav-item ${screen === n.key ? 'active' : ''}`}
              onClick={() => setScreen(n.key)}
            >
              <span className="mini-icon">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="foot">
          <div className="user">
            <span className="mini-icon">👤</span>
            <div>
              <div>{user.full_name || user.username}</div>
              <div className="role">{user.role === 'admin' ? 'مدير' : user.role === 'doctor' ? 'طبيب' : 'صراف'}</div>
            </div>
          </div>
          <button className="danger-ghost small" onClick={handleLogout}>
            ⏻ خروج
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <h1>{TITLES[screen]}</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            {toLatinDigits(new Date().toLocaleDateString('ar-LB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}
          </div>
        </div>
        <div className="content">
          {screen === 'dashboard' && <Dashboard settings={settings} onOpenPatient={openPatient} />}
          {screen === 'patients' && (
            <Patients
              settings={settings}
              role={user.role}
              fileId={patientFileId}
              onCloseFile={() => setPatientFileId(null)}
            />
          )}
          {screen === 'appointments' && <Appointments role={user.role} onOpenPatient={openPatient} />}
          {screen === 'billing' && <Billing settings={settings} role={user.role} onOpenPatient={openPatient} />}
          {screen === 'catalog' && <Catalog settings={settings} role={user.role} />}
          {screen === 'inventory' && <Inventory settings={settings} role={user.role} />}
          {screen === 'expenses' && <Expenses settings={settings} role={user.role} />}
          {screen === 'finances' && <Finances settings={settings} />}
          {screen === 'dental' && <Dental />}
          {screen === 'users' && <UsersScreen currentUser={user} onSaved={refreshUser} />}
          {screen === 'settings' && <SettingsScreen settings={settings} onSaved={refreshSettings} onLogout={handleLogout} />}
        </div>
      </main>
    </div>
  )
}