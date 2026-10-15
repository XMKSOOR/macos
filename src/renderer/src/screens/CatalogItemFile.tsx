import { useEffect, useMemo, useState } from 'react'
import { Confirm, DrillHead, Field, KV, useToast } from '../ui'
import { SearchSelect } from '../SearchSelect'
import type { CatalogItem, Material, Role } from '../lib'
import { can, fmt, parseNumber } from '../lib'
import { CurrencyInput } from '../CurrencyInput'
import { NumberInput } from '../NumberInput'

interface BomLine {
  material_id: string
  qty: number
}

export default function CatalogItemFile({
  item,
  rate,
  role,
  onClose,
  onSaved
}: {
  item: CatalogItem
  rate: number
  role: Role
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [materials, setMaterials] = useState<Material[]>([])
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(String(item.price))
  const [qty, setQtyState] = useState(String(item.qty && item.qty > 0 ? item.qty : 1))
  const [total, setTotalState] = useState(item.total && item.total > 0 ? String(item.total) : '')
  const [description, setDescription] = useState(item.description)
  const [lines, setLines] = useState<BomLine[]>(item.materials.map((m) => ({ material_id: m.material_id, qty: m.qty })))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const toast = useToast()
  const canEdit = can(role, 'edit') && can(role, 'editPrices')
  const canDelete = can(role, 'delete')

  useEffect(() => {
    window.clinic.inventory
      .list()
      .then(setMaterials)
      .catch(() => setMaterials([]))
  }, [])

  const bomCost = useMemo(() => {
    let s = 0
    for (const l of lines) {
      const m = materials.find((x) => x.id === l.material_id)
      if (m) s += m.cost * (l.qty || 0)
    }
    return s
  }, [lines, materials])

  const priceNum = Number(price) || bomCost || 0
  const marginNum = priceNum - bomCost
  const qtyNum = Math.max(1, Math.floor(parseNumber(qty) || 1))
  const totalNum = Number(total) || 0

  const setQty = (n: number): void => {
    const q = Math.max(1, Math.floor(n) || 1)
    const t = Number(total) || 0
    const p = Number(price) || 0
    setQtyState(String(q))
    if (t > 0) setPrice(String(Math.round(t / q)))
    else if (p > 0) setTotalState(String(p * q))
  }

  const setTotal = (lbp: number): void => {
    const q = Math.max(1, Math.floor(parseNumber(qty)) || 1)
    setTotalState(lbp ? String(lbp) : '')
    if (lbp) setPrice(String(Math.round(lbp / q)))
  }

  const setPrice2 = (lbp: number): void => {
    const q = Math.max(1, Math.floor(parseNumber(qty)) || 1)
    setPrice(lbp ? String(lbp) : '')
    if (lbp > 0) setTotalState(String(lbp * q))
  }

  const setLine = (i: number, patch: Partial<BomLine>): void =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const save = (): void => {
    if (!name.trim()) {
      toast('الاسم مطلوب', 'error')
      return
    }
    const priceVal = Number(price) || bomCost
    setSaving(true)
    window.clinic.catalog
      .update(item.id, {
        name: name.trim(),
        price: priceVal,
        qty: qtyNum,
        total: totalNum > 0 ? totalNum : priceVal * qtyNum,
        description,
        cost: bomCost,
        materials: lines.filter((l) => l.material_id).map((l) => ({ material_id: l.material_id, qty: l.qty || 1 }))
      })
      .then(() => {
        toast('تم حفظ الصنف', 'success')
        onSaved()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setSaving(false))
  }

  const remove = (): void => {
    window.clinic.catalog
      .delete(item.id)
      .then(() => {
        toast('تم حذف الصنف', 'success')
        onSaved()
        onClose()
      })
      .catch((e) => toast(e.message, 'error'))
  }

  return (
    <>
      <div className="drill-page">
        <DrillHead crumb="كتالوج الأصناف" current={item.name} onBack={onClose}>
          {canDelete && (
            <button className="danger-ghost small" onClick={() => setDeleting(true)}>
              حذف الصنف
            </button>
          )}
        </DrillHead>

        <div className="drill-summary">
          <span className="muted">
            السعر: {fmt(priceNum)} ل.س — الكلفة: {fmt(bomCost)} ل.س — الهامش:{' '}
            <b style={{ color: marginNum >= 0 ? 'var(--success)' : 'var(--danger)' }}>{marginNum >= 0 ? '+' : ''}{fmt(marginNum)}</b> ل.س
            {rate > 0 && ` (${(marginNum / rate).toFixed(2)} $)`}
          </span>
        </div>

        <div className="drill-body">
          <div className="panel">
            <div className="panel-head">
              <h2>بيانات الصنف / الخدمة</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label="الاسم *">
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="الكمية">
                  <NumberInput value={qtyNum} onChange={setQty} placeholder="1" />
                </Field>
                <Field label="الاجمالي (تكلفة الصنف — ل.س أو $)">
                  <CurrencyInput dual valueLbp={totalNum} rate={rate} placeholder="0" onChange={setTotal} />
                </Field>
                <Field label="سعر الوحدة (ل.س أو $) — يُحسب الاجمالي تلقائياً">
                  <CurrencyInput dual valueLbp={Number(price) || 0} rate={rate} placeholder={bomCost ? String(bomCost) : '0'} onChange={setPrice2} />
                </Field>
                <div className="field full">
                  <Field label="الوصف">
                    <input value={description} onChange={(e) => setDescription(e.target.value)} />
                  </Field>
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>المكوّنات (تُخصم تلقائياً عند البيع)</h2>
              <div className="toolbar">
                <button className="ghost small" onClick={() => setLines((ls) => [...ls, { material_id: '', qty: 1 }])}>
                  + إضافة مادة
                </button>
              </div>
            </div>
            <div className="panel-body">
              <div className="line-series">
                {lines.map((l, i) => {
                  const m = materials.find((x) => x.id === l.material_id)
                  return (
                    <div className="series-item" key={i}>
                      <SearchSelect
                        value={l.material_id}
                        onChange={(v) => setLine(i, { material_id: v })}
                        options={[
                          { value: '', label: 'اختر المادة...' },
                          ...materials.map((mm) => ({ value: mm.id, label: `${mm.name} (متوفر ${mm.quantity})` }))
                        ]}
                      />
                      <input
                        type="text"
                        dir="ltr"
                        inputMode="decimal"
                        value={l.qty}
                        onChange={(e) => setLine(i, { qty: Math.max(1, parseNumber(e.target.value) || 1) })}
                        placeholder="الكمية"
                      />
                      <div className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                        {m ? `${fmt(m.cost)} ل.س ×${l.qty} = ${fmt(m.cost * l.qty)}` : '—'}
                      </div>
                      <button className="danger-ghost small" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </div>
                  )
                })}
                {lines.length === 0 && <div className="muted">لا مكوّنات — أضف مواداً ليُخصم استهلاكها عند البيع.</div>}
              </div>
              <div className="flex between mt-16" style={{ fontWeight: 800 }}>
                <span>كلفة المكونات:</span>
                <span>
                  {fmt(bomCost)} ل.س ({rate > 0 ? (bomCost / rate).toFixed(2) : '0.00'} $)
                </span>
              </div>
              <div className="flex between mt-4" style={{ fontWeight: 800 }}>
                <span>الهامش المتوقع (السعر − الكلفة):</span>
                <span style={{ color: marginNum >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {marginNum >= 0 ? '+' : ''}
                  {fmt(marginNum)} ل.س — {priceNum > 0 ? ((marginNum / priceNum) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="meta-grid mt-16">
                <KV label="بالدولار (السعر)">{rate > 0 ? (priceNum / rate).toFixed(2) : '0.00'} $</KV>
                <KV label="بالدولار (الكلفة)">{rate > 0 ? (bomCost / rate).toFixed(2) : '0.00'} $</KV>
                <KV label="أنشئ في">{item.created_at || '—'}</KV>
              </div>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex end" style={{ marginTop: 4 }}>
            <button disabled={saving} onClick={save}>
              {saving ? '...' : 'حفظ التعديلات'}
            </button>
          </div>
        )}
      </div>

      {deleting && (
        <Confirm
          title="حذف صنف"
          message={`حذف الصنف "${item.name}"؟`}
          onConfirm={remove}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  )
}
