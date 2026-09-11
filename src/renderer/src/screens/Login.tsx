import { useState } from 'react'
import { useToast } from '../ui'
import type { User } from '../lib'

export default function Login({ onLogin }: { onLogin: (u: User) => void }): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    setBusy(true)
    setError('')
    window.clinic.auth
      .login(username, password)
      .then((u) => {
        onLogin(u)
        toast('تم تسجيل الدخول', 'success')
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="logo-big">🦷</div>
        <h1>نظام إدارة عيادة الأسنان</h1>
        <p>تسجيل الدخول للمتابعة</p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={submit}>
          <input
            type="text"
            placeholder="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy || !username || !password}>
            {busy ? 'جاري الدخول...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  )
}