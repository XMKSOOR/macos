import { useEffect, useMemo, useRef, useState } from 'react'

export interface SelectOption {
  value: string | number
  label: string
}

interface Props {
  value: string | number
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  title?: string
  searchPlaceholder?: string
  emptyText?: string
}

/**
 * قائمة منسدلة قابلة للبحث: تعرض الزر المحدَّد، وعند فتحها تظهر خانة بحث
 * وتُرشّح الخيارات فورياً (بالنص أو القيمة). تدعم لوحة المفاتيح (الأسهم/Enter/Esc).
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  id,
  title,
  searchPlaceholder = 'بحث...',
  emptyText = 'لا نتائج'
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const sv = String(value ?? '')
  const selected = options.find((o) => String(o.value) === sv)
  const display = selected ? selected.label : ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q)
    )
  }, [query, options])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    const idx = options.findIndex((o) => String(o.value) === sv)
    setActive(idx >= 0 ? idx : 0)
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const choose = (v: string): void => {
    onChange(v)
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const o = filtered[active]
      if (o) choose(String(o.value))
      else setOpen(false)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className={`searchselect ${className ?? ''}`} ref={rootRef} title={title}>
      <button
        type="button"
        id={id}
        className="ss-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={display ? 'ss-label' : 'ss-label ss-placeholder'}>
          {display || placeholder || 'اختر...'}
        </span>
        <span className="ss-caret">▾</span>
      </button>
      {open && (
        <div className="ss-pop">
          <input
            ref={inputRef}
            type="text"
            className="ss-search"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <ul className="ss-list" role="listbox" ref={listRef}>
            {filtered.length === 0 && <li className="ss-empty">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li
                key={String(o.value)}
                role="option"
                aria-selected={String(o.value) === sv}
                className={
                  'ss-opt' +
                  (i === active ? ' active' : '') +
                  (String(o.value) === sv ? ' selected' : '')
                }
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(String(o.value))
                }}
              >
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
