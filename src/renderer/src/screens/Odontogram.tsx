import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../ui'
import type { PatientAttachment, ToothCondition, DentalChartEntry, PeriodontalChartEntry } from '../lib'

const CONDITIONS: { value: ToothCondition; label: string; color: string; short: string }[] = [
  { value: 'healthy', label: 'سليم', color: '#e2e8f0', short: 'سليم' },
  { value: 'caries', label: 'تسوس', color: '#ef4444', short: 'تسوس' },
  { value: 'filling', label: 'حشوة', color: '#3b82f6', short: 'حشوة' },
  { value: 'crown', label: 'تاج', color: '#f59e0b', short: 'تاج' },
  { value: 'root_canal', label: 'علاج عصب', color: '#14b8a6', short: 'عصب' },
  { value: 'implant', label: 'زراعة', color: '#8b5cf6', short: 'زراعة' },
  { value: 'fracture', label: 'كسر', color: '#f97316', short: 'كسر' },
  { value: 'sealant', label: 'حشوة وقائية', color: '#22c55e', short: 'وقائي' },
  { value: 'missing', label: 'مفقود', color: '#94a3b8', short: 'مفقود' },
  { value: 'extracted', label: 'مقلوع', color: '#64748b', short: 'مقلوع' }
]

const SURFACE_LABEL: Record<string, string> = { M: 'أنسي', D: 'وحشي', O: 'إطباقي', B: 'دهليزي', L: 'لساني' }

const UPPER_RIGHT = ['18', '17', '16', '15', '14', '13', '12', '11']
const UPPER_LEFT = ['21', '22', '23', '24', '25', '26', '27', '28']
const LOWER_RIGHT = ['48', '47', '46', '45', '44', '43', '42', '41']
const LOWER_LEFT = ['31', '32', '33', '34', '35', '36', '37', '38']

function conditionColor(condition: string | undefined): string {
  return CONDITIONS.find((c) => c.value === condition)?.color ?? '#e2e8f0'
}

function Thumb({ id }: { id: number }): React.JSX.Element {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    window.clinic.attachments
      .read(id)
      .then((r) => {
        if (alive) setUrl(r.dataUrl)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [id])
  return url ? <img src={url} alt="" /> : <span className="odo-loading">…</span>
}

function ToothCell({
  tooth,
  entry,
  selected,
  onSelect
}: {
  tooth: string
  entry?: DentalChartEntry
  selected: boolean
  onSelect: (tooth: string) => void
}): React.JSX.Element {
  const cond = entry?.condition ?? 'healthy'
  const hasCond = !!entry && cond !== 'healthy'
  const surf = (entry?.surfaces ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const color = conditionColor(cond)
  const region = (key: string): string => {
    if (!hasCond) return '#eef2f6'
    if (surf.length === 0) return color
    return surf.includes(key) ? color : '#eef2f6'
  }
  const short = CONDITIONS.find((c) => c.value === cond)?.short ?? ''
  const label = CONDITIONS.find((c) => c.value === cond)?.label ?? 'سليم'
  return (
    <button
      type="button"
      className={`odo-tooth ${selected ? 'sel' : ''}`}
      onClick={() => onSelect(tooth)}
      title={`السن ${tooth} — ${label}`}
      style={hasCond ? { outlineColor: color } : undefined}
    >
      <span className="odo-num">{tooth}</span>
      <span className="odo-grid">
        <i className="odo-region rg-b" style={{ background: region('B') }} title={SURFACE_LABEL.B} />
        <i className="odo-region rg-m" style={{ background: region('M') }} title={SURFACE_LABEL.M} />
        <i className="odo-region rg-o" style={{ background: region('O') }} title={SURFACE_LABEL.O}>
          {hasCond && <span className="odo-center">{short}</span>}
        </i>
        <i className="odo-region rg-d" style={{ background: region('D') }} title={SURFACE_LABEL.D} />
        <i className="odo-region rg-l" style={{ background: region('L') }} title={SURFACE_LABEL.L} />
      </span>
      {hasCond && (cond === 'missing' || cond === 'extracted') && <span className="odo-x">✕</span>}
    </button>
  )
}

export default function Odontogram({
  patientId,
  attachments,
  onAttachmentsChanged
}: {
  patientId: number
  attachments: PatientAttachment[]
  onAttachmentsChanged: () => void
}): React.JSX.Element {
  const toast = useToast()
  const [entries, setEntries] = useState<DentalChartEntry[]>([])
  const [perio, setPerio] = useState<PeriodontalChartEntry[]>([])
  const [selected, setSelected] = useState('')
  const [condition, setCondition] = useState<ToothCondition>('healthy')
  const [surfaces, setSurfaces] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [pd, setPd] = useState(0)
  const [bleeding, setBleeding] = useState(0)
  const [mobility, setMobility] = useState(0)
  const [recession, setRecession] = useState(0)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    window.clinic.dental
      .listChart(patientId)
      .then(setEntries)
      .catch((e) => toast(e.message, 'error'))
    window.clinic.periodontal
      .list(patientId)
      .then(setPerio)
      .catch(() => {})
  }, [patientId, toast])

  useEffect(() => {
    load()
  }, [load])

  const selectTooth = (tooth: string): void => {
    setSelected(tooth)
    const e = entries.find((x) => x.tooth_number === tooth)
    setCondition(e?.condition ?? 'healthy')
    setSurfaces((e?.surfaces ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    setNotes(e?.notes ?? '')
    const p = perio.find((x) => x.tooth_number === tooth)
    setPd(p?.pocket_depth ?? 0)
    setBleeding(p?.bleeding ?? 0)
    setMobility(p?.mobility ?? 0)
    setRecession(p?.recession ?? 0)
  }

  const toggleSurface = (s: string): void =>
    setSurfaces((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  const save = (): void => {
    if (!selected) return
    setSaving(true)
    window.clinic.dental
      .saveTooth(patientId, selected, condition, surfaces.join(','), notes)
      .then(() => {
        toast('تم حفظ حالة السن', 'success')
        load()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setSaving(false))
  }

  const clearTooth = (): void => {
    if (!selected) return
    window.clinic.dental
      .deleteTooth(patientId, selected)
      .then(() => {
        toast('تم مسح بيانات السن', 'success')
        setCondition('healthy')
        setSurfaces([])
        setNotes('')
        load()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const savePerio = (): void => {
    if (!selected) return
    window.clinic.periodontal
      .save(patientId, selected, pd, bleeding, mobility, recession, '')
      .then(() => {
        toast('تم حفظ قياسات اللثة', 'success')
        load()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const linked = useMemo(() => attachments.filter((a) => a.tooth_number === selected), [attachments, selected])
  const unlinked = attachments.filter((a) => !a.tooth_number && (a.ftype === 'image' || a.ftype === 'dicom'))

  const linkAttachment = (id: number): void => {
    if (!selected || !id) return
    window.clinic.attachments
      .setTooth(id, selected)
      .then(() => {
        toast('تم ربط الصورة بالسن', 'success')
        onAttachmentsChanged()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const unlinkAttachment = (id: number): void => {
    window.clinic.attachments
      .setTooth(id, '')
      .then(() => onAttachmentsChanged())
      .catch((e) => toast(e.message, 'error'))
  }

  const captureForTooth = (): void => {
    if (!selected) return
    window.clinic.attachments
      .add(patientId)
      .then((added) => {
        Promise.all(added.map((a) => window.clinic.attachments.setTooth(a.id, selected))).then(() => {
          toast('تمت إضافة الصورة وربطها بالسن', 'success')
          onAttachmentsChanged()
        })
      })
      .catch((e) => toast(e.message, 'error'))
  }

  return (
    <div className="odontogram">
      <div className="odo-legend">
        {CONDITIONS.map((c) => (
          <span key={c.value} className="odo-legend-item">
            <i style={{ background: c.color }} /> {c.label}
          </span>
        ))}
      </div>

      <div className="odo-chart" dir="ltr">
        <div className="odo-row">
          {UPPER_RIGHT.map((t) => (
            <ToothCell key={t} tooth={t} entry={entries.find((e) => e.tooth_number === t)} selected={selected === t} onSelect={selectTooth} />
          ))}
          <span className="odo-gap" />
          {UPPER_LEFT.map((t) => (
            <ToothCell key={t} tooth={t} entry={entries.find((e) => e.tooth_number === t)} selected={selected === t} onSelect={selectTooth} />
          ))}
        </div>
        <div className="odo-midline" />
        <div className="odo-row">
          {LOWER_RIGHT.map((t) => (
            <ToothCell key={t} tooth={t} entry={entries.find((e) => e.tooth_number === t)} selected={selected === t} onSelect={selectTooth} />
          ))}
          <span className="odo-gap" />
          {LOWER_LEFT.map((t) => (
            <ToothCell key={t} tooth={t} entry={entries.find((e) => e.tooth_number === t)} selected={selected === t} onSelect={selectTooth} />
          ))}
        </div>
      </div>

      {!selected ? (
        <div className="muted center" style={{ marginTop: 10 }}>
          اختر سناً من المخطط لتعديل حالته وربط صور الأشعة
        </div>
      ) : (
        <div className="odo-editor">
          <div className="odo-editor-head">
            <h3>السن المحدد: {selected}</h3>
            <div className="flex">
              <button className="soft small" onClick={clearTooth}>
                مسح البيانات
              </button>
              <button className="small" disabled={saving} onClick={save}>
                {saving ? '...' : 'حفظ الحالة'}
              </button>
            </div>
          </div>

          <div className="odo-section">
            <div className="odo-section-title">حالة السن</div>
            <div className="odo-conditions">
              {CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`odo-cond ${condition === c.value ? 'active' : ''}`}
                  style={{ background: c.color }}
                  onClick={() => setCondition(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="odo-section">
            <div className="odo-section-title">
              الأسطح المصابة {surfaces.length === 0 ? '(عند تركها فارغة تُلوَّن كافة الأسطح)' : ''}
            </div>
            <div className="odo-surfaces">
              {(['M', 'D', 'O', 'B', 'L'] as string[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`odo-surface ${surfaces.includes(s) ? 'active' : ''}`}
                  onClick={() => toggleSurface(s)}
                  title={SURFACE_LABEL[s]}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="odo-section">
            <div className="odo-section-title">ملاحظات</div>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="odo-section">
            <div className="odo-section-title">قياسات اللثة</div>
            <div className="odo-perio">
              <label>
                عمق الجيب
                <input type="number" dir="ltr" value={pd} onChange={(e) => setPd(Number(e.target.value))} />
              </label>
              <label>
                النزيف (0/1)
                <select value={bleeding} onChange={(e) => setBleeding(Number(e.target.value))}>
                  <option value={0}>لا</option>
                  <option value={1}>نعم</option>
                </select>
              </label>
              <label>
                الحركة (0-3)
                <input type="number" dir="ltr" min={0} max={3} value={mobility} onChange={(e) => setMobility(Number(e.target.value))} />
              </label>
              <label>
                انحسار اللثة
                <input type="number" dir="ltr" value={recession} onChange={(e) => setRecession(Number(e.target.value))} />
              </label>
              <button className="soft small" onClick={savePerio}>
                حفظ اللثة
              </button>
            </div>
          </div>

          <div className="odo-section">
            <div className="odo-section-title">صور الأشعة المرتبطة بهذا السن ({linked.length})</div>
            <div className="odo-links">
              {linked.map((a) => (
                <div key={a.id} className="odo-link-card">
                  <div className="odo-link-thumb">
                    {a.ftype === 'image' ? <Thumb id={a.id} /> : <span>{a.ftype === 'dicom' ? '🦴 DICOM' : '📄'}</span>}
                  </div>
                  <div className="odo-link-name">{a.filename}</div>
                  <div className="odo-link-actions">
                    <button className="ghost small" onClick={() => window.clinic.attachments.openExternal(a.id)}>
                      فتح
                    </button>
                    <button className="ghost small" onClick={() => unlinkAttachment(a.id)}>
                      فصل
                    </button>
                  </div>
                </div>
              ))}
              {linked.length === 0 && <span className="muted">لا توجد صور مرتبطة</span>}
            </div>
            <div className="flex" style={{ marginTop: 8, gap: 8 }}>
              <button className="soft small" onClick={captureForTooth}>
                ＋ إضافة صورة وربطها
              </button>
              <select
                value=""
                onChange={(e) => {
                  linkAttachment(Number(e.target.value))
                  e.target.value = ''
                }}
              >
                <option value="">ربط صورة موجودة...</option>
                {unlinked.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.filename}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}