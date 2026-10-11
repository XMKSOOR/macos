import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastHost } from './ui'
import { toLatinDigits } from './lib'
import './styles.css'

/**
 * توحيد الأرقام: يحوّل أي رقم عربي/فارسي (٠١٢٣...) يكتبه المستخدم إلى رقم إنجليزي (0-9)
 * في كل حقول الإدخال والنصوص في البرنامج، حتى لو كانت لوحة المفاتيح عربية.
 */
const SKIP_INPUT_TYPES = ['date', 'time', 'month', 'week', 'datetime-local', 'number', 'range', 'color', 'file', 'password']
document.addEventListener(
  'input',
  (e) => {
    const el = e.target
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return
    if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.includes(el.type)) return
    const v = el.value
    const conv = toLatinDigits(v)
    if (conv === v) return
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
    if (desc && desc.set) desc.set.call(el, conv)
    else el.value = conv
    el.dispatchEvent(new Event('input', { bubbles: true }))
  },
  true
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastHost>
      <App />
    </ToastHost>
  </React.StrictMode>
)