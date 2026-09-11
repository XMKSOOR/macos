import { useState } from 'react'
import { toLatinDigits } from './lib'

interface CurrencyInputProps {
  valueLbp: number
  onChange: (lbp: number) => void
  rate: number
  placeholder?: string
  disabled?: boolean
  compact?: boolean
  /** وضع مزدوج: حقلا ل.ل و $ جنباً إلى جنب يتفاعلان معاً */
  dual?: boolean
}

function fmtUsd(v: number): string {
  return Number(v.toFixed(2)).toString()
}

function fmtLbp(v: number): string {
  return Math.round(v).toString()
}

/** حقل سعر مرن: يُدخل المستخدم القيمة بالدولار أو بالليرة ويُخزَّن دائماً بالليرة.
 *  الوضع المزدوج (dual) يعرض الحقلين معاً ويجعل كل الأرقام المشتقة تتجاوب حيّاً. */
export function CurrencyInput({ valueLbp, onChange, rate, placeholder = '0', disabled, compact, dual }: CurrencyInputProps): React.JSX.Element {
  const [unit, setUnit] = useState<'lbp' | 'usd'>('lbp')
  const [draft, setDraft] = useState<string | null>(null)
  const [draftL, setDraftL] = useState<string | null>(null)
  const [draftU, setDraftU] = useState<string | null>(null)
  const [focus, setFocus] = useState<'lbp' | 'usd' | null>(null)
  const r = rate > 0 ? rate : 1
  const lbp = Math.round(valueLbp)

  if (!dual) {
    const shown = draft !== null ? draft : lbp ? (unit === 'usd' ? fmtUsd(lbp / r) : fmtLbp(lbp)) : ''
    const hint = lbp
      ? unit === 'usd'
        ? `≈ ${fmtLbp(lbp)} ل.ل`
        : `≈ ${fmtUsd(lbp / r)} $`
      : ''

    const handle = (raw: string): void => {
      const clean = toLatinDigits(raw.trim())
      setDraft(clean)
      if (clean === '' || Number.isNaN(Number(clean))) {
        onChange(0)
        return
      }
      onChange(unit === 'usd' ? Math.round(Number(clean) * r) : Math.round(Number(clean)))
    }

    const switchUnit = (u: 'lbp' | 'usd'): void => {
      setUnit(u)
      setDraft(null)
    }

    return (
      <div className={compact ? 'currency-input compact' : 'currency-input'}>
        <div className="currency-row">
          <input
            type="number"
            step={unit === 'usd' ? '0.01' : '1'}
            min={0}
            dir="ltr"
            inputMode="decimal"
            value={shown}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => handle(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
          <div className="unit-toggle" role="group">
            <button type="button" className={unit === 'lbp' ? 'on' : ''} onClick={() => switchUnit('lbp')} disabled={disabled} title="بالليرة">
              ل.ل
            </button>
            <button type="button" className={unit === 'usd' ? 'on' : ''} onClick={() => switchUnit('usd')} disabled={disabled} title="بالدولار">
              $
            </button>
          </div>
        </div>
        {!compact && hint ? <div className="minor-hint">{hint}</div> : null}
      </div>
    )
  }

  // ---- الوضع المزدوج: حقلان حيّان ----
  const shownLbp = focus !== 'usd' && draftL !== null ? draftL : lbp ? fmtLbp(lbp) : ''
  const shownUsd = focus !== 'lbp' && draftU !== null ? draftU : lbp ? fmtUsd(lbp / r) : ''

  const handleLbp = (raw: string): void => {
    const clean = toLatinDigits(raw.trim())
    setDraftL(clean)
    if (clean === '' || Number.isNaN(Number(clean))) {
      onChange(0)
      return
    }
    onChange(Math.round(Number(clean)))
  }

  const handleUsd = (raw: string): void => {
    const clean = toLatinDigits(raw.trim())
    setDraftU(clean)
    if (clean === '' || Number.isNaN(Number(clean))) {
      onChange(0)
      return
    }
    onChange(Math.round(Number(clean) * r))
  }

  return (
    <div className={compact ? 'currency-input dual compact' : 'currency-input dual'}>
      <div className="dual-row">
        <label className="dual-field">
          <input
            type="number"
            step="1"
            min={0}
            dir="ltr"
            inputMode="decimal"
            value={shownLbp}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => handleLbp(e.target.value)}
            onFocus={(e) => {
              setFocus('lbp')
              e.target.select()
            }}
            onBlur={() => {
              setFocus(null)
              setDraftL(null)
            }}
          />
          <span className="dual-unit">ل.ل</span>
        </label>
        <span className="dual-arrow">{'⟷'}</span>
        <label className="dual-field">
          <input
            type="number"
            step="0.01"
            min={0}
            dir="ltr"
            inputMode="decimal"
            value={shownUsd}
            placeholder={lbp ? fmtUsd(lbp / r) : '0'}
            disabled={disabled}
            onChange={(e) => handleUsd(e.target.value)}
            onFocus={(e) => {
              setFocus('usd')
              e.target.select()
            }}
            onBlur={() => {
              setFocus(null)
              setDraftU(null)
            }}
          />
          <span className="dual-unit">$</span>
        </label>
      </div>
      {!compact ? (
        <div className="minor-hint">
          {lbp > 0 ? `التحويل الحي: ${fmtLbp(lbp)} ل.ل = ${fmtUsd(lbp / r)} $` : `سعر الصرف المستخدم: 1$ = ${fmtLbp(r)} ل.ل — أكتب في أي حقل ويتحدّث الآخر`}
        </div>
      ) : null}
    </div>
  )
}