import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../ui'
import type { PatientAttachment, ToothCondition, DentalChartEntry, PeriodontalChartEntry } from '../lib'

const CONDITIONS: { value: ToothCondition; label: string; color: string; short: string }[] = [
  { value: 'healthy', label: 'سليم', color: '#ffffff', short: 'سليم' },
  { value: 'caries', label: 'تسوس', color: '#fca5a5', short: 'تسوس' },
  { value: 'filling', label: 'حشوة', color: '#93c5fd', short: 'حشوة' },
  { value: 'crown', label: 'تاج', color: '#fcd34d', short: 'تاج' },
  { value: 'root_canal', label: 'علاج عصب', color: '#5eead4', short: 'عصب' },
  { value: 'implant', label: 'زراعة', color: '#c4b5fd', short: 'زراعة' },
  { value: 'fracture', label: 'كسر', color: '#fdba74', short: 'كسر' },
  { value: 'sealant', label: 'حشوة وقائية', color: '#86efac', short: 'وقائي' },
  { value: 'missing', label: 'مفقود', color: '#e2e8f0', short: 'مفقود' },
  { value: 'extracted', label: 'مقلوع', color: '#94a3b8', short: 'مقلوع' }
]

const UPPER_RIGHT = ['18', '17', '16', '15', '14', '13', '12', '11']
const UPPER_LEFT = ['21', '22', '23', '24', '25', '26', '27', '28']
const LOWER_RIGHT = ['48', '47', '46', '45', '44', '43', '42', '41']
const LOWER_LEFT = ['31', '32', '33', '34', '35', '36', '37', '38']

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
  const [selected, setSelected] = useState<string>('')
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

  const entryFor = (tooth: string): DentalChartEntry | undefined => entries.find((e) => e.tooth_number === tooth)
  const perioFor = (tooth: string): PeriodontalChartEntry | undefined => perio.find((e) => e.tooth_number === tooth)

  const selectTooth = (tooth: string): void => {
    setSelected(tooth)
    const e = entryFor(tooth)
    setCondition(e?.condition ?? 'healthy')
    setSurfaces((e?.surfaces ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    setNotes(e?.notes ?? '')
    const p = perioFor(tooth)
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

  const linked = useMemo(
    () => attachments.filter((a) => a.tooth_number === selected),
    [attachments, selected]
  )
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

  const renderTeeth = (teeth: string[]): React.JSX.Element[] =>
    teeth.map((t) => (
      <button
        key={t}
        type="button"
        className={`odo-tooth ${selected === t ? 'sel' : ''} ${isMissing(t) ? 'missing' : ''}`}
        style={{ background: colorFor(t) }}
        onClick={() => selectTooth(t)}
        title={labelFor(t)}
      >
        <span className="odo-num">{t}</span>
        <span className="odo-short">{shortFor(t)}</span>
        {surfaceMarks(t) && <span className="odo-surf">{surfaceMarks(t)}</span>}
      </button>
    ))

  const colorFor = (t: string): string => {
    const e = entryFor(t)
    if (!e) return '#ffffff'
    return CONDITIONS.find((c) => c.value === e.condition)?.color ?? '#ffffff'
  }
  const shortFor = (t: string): string => {
    const e = entryFor(t)
    if (!e || e.condition === 'healthy') return ''
    return CONDITIONS.find((c) => c.value === e.condition)?.short ?? ''
  }
  const surfaceMarks = (t: string): string => {
    const e = entryFor(t)
    if (!e || !e.surfaces) return ''
    return e.surfaces.split(',').filter(Boolean).join('')
  }
  const isMissing = (t: string): boolean => {
    const e = entryFor(t)
    return e?.condition === 'missing' || e?.condition === 'extracted'
  }
  const labelFor = (t: string): string => {
    const e = entryFor(t)
    const cond = e ? CONDITIONS.find((c) => c.value === e.condition)?.label : 'سليم'
    return `السن ${t} — ${cond ?? ''}`
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
          {renderTeeth(UPPER_RIGHT)}
          <span className="odo-gap" />
          {renderTeeth(UPPER_LEFT)}
        </div>
        <div className="odo-midline" />
        <div className="odo-row">
          {renderTeeth(LOWER_RIGHT)}
          <span className="odo-gap" />
          {renderTeeth(LOWER_LEFT)}
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
            <div className="odo-section-title">الأسطح المصابة</div>
            <div className="odo-surfaces">
              {['M', 'D', 'O', 'B', 'L'].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`odo-surface ${surfaces.includes(s) ? 'active' : ''}`}
                  onClick={() => toggleSurface(s)}
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
            <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
              {linked.map((a) => (
                <span key={a.id} className="odo-chip">
                  {a.ftype === 'dicom' ? '🦴' : '🖼️'} {a.filename}
                  <button className="ghost small" onClick={() => unlinkAttachment(a.id)}>
                    فصل
                  </button>
                </span>
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