import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { sanitizeNumberInput } from './lib'

function display(v: number): string {
  if (!Number.isFinite(v)) return ''
  return String(v)
}

/**
 * حقل رقمي متوافق مع الأرقام العربية والإنجليزية معاً.
 * يحفظ النص كما يكتبه المستخدم (حتى الأرقام العربية) ويحوّله لرقم عند التغيير.
 */
export function NumberInput({
  value,
  onChange,
  className = 'inline-input',
  allowNegative = false,
  placeholder,
  disabled,
  autoFocus,
  onEnter,
  onEscape
}: {
  value: number
  onChange: (n: number) => void
  className?: string
  allowNegative?: boolean
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  onEnter?: () => void
  onEscape?: () => void
}): React.JSX.Element {
  const [raw, setRaw] = useState<string>(display(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setRaw(display(value))
  }, [value])

  const handle = (s: string): void => {
    const clean = sanitizeNumberInput(s, allowNegative)
    setRaw(clean)
    if (clean === '' || clean === '-' || clean === '.' || clean === '-.') {
      onChange(0)
      return
    }
    const n = Number(clean)
    if (Number.isFinite(n)) onChange(n)
  }

  return (
    <input
      type="text"
      inputMode={allowNegative ? 'text' : 'decimal'}
      dir="ltr"
      className={className}
      value={raw}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        setRaw(display(value))
      }}
      onChange={(e) => handle(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && onEnter) onEnter()
        if (e.key === 'Escape' && onEscape) onEscape()
      }}
    />
  )
}