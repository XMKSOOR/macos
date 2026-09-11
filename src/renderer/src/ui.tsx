import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { fmt } from './lib'
import type { Toast } from './lib'

// ---- Toasts ----
const ToastCtx = createContext<(message: string, kind?: Toast['kind']) => void>(() => {})

export function useToast(): (message: string, kind?: Toast['kind']) => void {
  return useContext(ToastCtx)
}

export function ToastHost({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const id = useRef(0)
  const push = useCallback((message: string, kind?: Toast['kind']) => {
    const nid = ++id.current
    setToasts((t) => [...t, { id: nid, kind: kind ?? 'info', message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== nid)), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function toastAction(toast: (m: string, k?: Toast['kind']) => void, fn: () => Promise<unknown>, okMsg: string): void {
  fn()
    .then(() => toast(okMsg, 'success'))
    .catch((e) => toast(e instanceof Error ? e.message : String(e), 'error'))
}

// ---- Field ----
export function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <label>
      {label}
      {children}
    </label>
  )
}

// ---- Modal ----
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="close-x" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

// ---- Confirm ----
export function Confirm({
  title,
  message,
  onConfirm,
  onClose
}: {
  title: string
  message: string
  onConfirm: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="ghost">
            إلغاء
          </button>
          <button
            className="danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            تأكيد
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  )
}

// ---- Currency cell ----
export function CurrencyCell({ lbp, rate }: { lbp: number; rate: number }): React.JSX.Element {
  const usd = rate > 0 ? (lbp / rate).toFixed(2) : '0.00'
  return (
    <div>
      <div className="amount-lbp">{fmt(lbp)} ل.ل</div>
      <div className="amount-usd">{usd} $</div>
    </div>
  )
}

// ---- Status badge ----
export function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const map: Record<string, { cls: string; label: string }> = {
    paid: { cls: 'green', label: 'مدفوعة' },
    partial: { cls: 'amber', label: 'مدفوعة جزئياً' },
    unpaid: { cls: 'red', label: 'غير مدفوعة' },
    scheduled: { cls: 'blue', label: 'مجدول' },
    done: { cls: 'green', label: 'منجز' },
    cancelled: { cls: 'gray', label: 'ملغي' }
  }
  const m = map[status] ?? { cls: 'gray', label: status }
  return <span className={`badge ${m.cls}`}>{m.label}</span>
}

// ---- Empty state ----
export function Empty({ text = 'لا توجد بيانات' }: { text?: string }): React.JSX.Element {
  return <div className="empty">{text}</div>
}

// ---- Search input ----
export function SearchBox({
  value,
  onChange,
  placeholder = 'بحث...'
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): React.JSX.Element {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
}