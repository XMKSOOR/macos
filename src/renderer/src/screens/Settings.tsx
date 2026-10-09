import { useEffect, useState } from 'react'
import { Field, useToast } from '../ui'
import type { PrinterInfo, Settings } from '../lib'
import { parseNumber } from '../lib'

export default function SettingsScreen({
  settings,
  onSaved,
  onLogout
}: {
  settings: Settings | null
  onSaved: () => void
  onLogout: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<Settings>({
    clinic_name: '',
    clinic_phone: '',
    clinic_address: '',
    receipt_header: '',
    receipt_footer: '',
    usd_rate: 130,
    printer_name: '',
    currency_scale: '100',
    currency_converted: '0',
    drive_client_id: '',
    drive_client_secret: '',
    drive_tokens: '',
    drive_auto: '0',
    mysql_host: '',
    mysql_port: '3306',
    mysql_db: '',
    mysql_user: '',
    mysql_secret: '',
    mysql_auto: '0',
    supabase_url: '',
    supabase_key: '',
    supabase_auto: '0',
    supabase_pg_auto: '0',
    feasibility_seed: '0'
  })
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [ob, setOb] = useState<{ oldPassword: string; newPassword: string; confirm: string }>({ oldPassword: '', newPassword: '', confirm: '' })
  const [dbInfo, setDbInfo] = useState<{ path: string; dir: string }>({ path: '', dir: '' })
  const [busy, setBusy] = useState('')
  const toast = useToast()

  const reload = (): void => {
    window.location.reload()
  }

  useEffect(() => {
    if (settings) setForm({ ...settings, usd_rate: settings.usd_rate })
    window.clinic.printing.list().then(setPrinters).catch(() => {})
    window.clinic.db.info().then(setDbInfo).catch(() => {})
  }, [settings])

  const saveGeneral = (): void => {
    setBusy('general')
    window.clinic.settings
      .save({ ...form, usd_rate: form.usd_rate })
      .then(() => {
        toast('تم حفظ الإعدادات', 'success')
        onSaved()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setBusy(''))
  }

  const changePassword = (): void => {
    if (!ob.oldPassword || !ob.newPassword) {
      toast('أدخل كلمة المرور الحالية والجديدة', 'error')
      return
    }
    if (ob.newPassword.length < 4) {
      toast('كلمة المرور الجديدة قصيرة جداً', 'error')
      return
    }
    if (ob.newPassword !== ob.confirm) {
      toast('كلمتا المرور غير متطابقتين', 'error')
      return
    }
    window.clinic.auth
      .changePassword(ob.oldPassword, ob.newPassword)
      .then(() => {
        toast('تم تغيير كلمة المرور', 'success')
        setOb({ oldPassword: '', newPassword: '', confirm: '' })
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const changeLocation = (): void => {
    window.clinic.db
      .chooseFolder()
      .then((folder) => {
        if (!folder) return
        setBusy('db')
        window.clinic.db
          .changeLocation(folder)
          .then(() => toast('تم تغيير الموقع، سيُعاد تشغيل البرنامج...', 'success'))
          .catch((e) => toast(e.message, 'error'))
          .finally(() => setBusy(''))
      })
      .catch((e) => toast(e.message, 'error'))
  }

  const convertCurrency = (): void => {
    if (
      !window.confirm(
        'سيتم قسمة جميع المبالغ المحفوظة (أصناف الكتالوج، كلف المواد، الفواتير، المصاريف) وسعر الصرف على المعامل المحدد. هذه العملية دائمة، ويمكنك إعادة التحويل مرة أخرى عند الحاجة. متابعة؟'
      )
    ) {
      return
    }
    setBusy('currency')
    window.clinic.settings
      .convertCurrency()
      .then((msg) => {
        toast(msg, 'success')
        onSaved()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setBusy(''))
  }

  return (
    <div>
      <div className="panel">
        <div className="panel-head">
          <h2>معلومات العيادة</h2>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <Field label="اسم العيادة">
              <input value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} />
            </Field>
            <Field label="الهاتف">
              <input value={form.clinic_phone} onChange={(e) => setForm({ ...form, clinic_phone: e.target.value })} />
            </Field>
            <Field label="العنوان">
              <input value={form.clinic_address} onChange={(e) => setForm({ ...form, clinic_address: e.target.value })} />
            </Field>
            <Field label="سطر الإيصال العلوي">
              <input value={form.receipt_header} onChange={(e) => setForm({ ...form, receipt_header: e.target.value })} placeholder="اختصاص العيادة / العنوان..." />
            </Field>
            <Field label="سطر الإيصال السفلي">
              <input value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} />
            </Field>
            <Field label="الطابعة الافتراضية (80mm)">
              <select value={form.printer_name} onChange={(e) => setForm({ ...form, printer_name: e.target.value })}>
                <option value="">— تلقائي —</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-16">
            <button onClick={saveGeneral} disabled={busy === 'general'}>
              حفظ الإعدادات
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>العملة (الليرة السورية والعملة المزدوجة)</h2>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <Field label="سعر الصرف (ل.س مقابل $)">
              <input
                type="text" dir="ltr" inputMode="decimal"
                value={form.usd_rate}
                onChange={(e) => setForm({ ...form, usd_rate: parseNumber(e.target.value) })}
              />
            </Field>
            <Field label="معامل حذف الأصفار من العملة">
              <select value={form.currency_scale} onChange={(e) => setForm({ ...form, currency_scale: e.target.value })}>
                <option value="1">بدون تغيير (القيم القديمة)</option>
                <option value="10">حذف صفر واحد</option>
                <option value="100">حذف صفرين (العملة السورية الجديدة)</option>
              </select>
            </Field>
          </div>
          <div className="flex mt-16" style={{ gap: 12 }}>
            <span className={`badge ${form.currency_converted === '1' ? 'green' : 'amber'}`}>
              {form.currency_converted === '1'
                ? 'تم التحويل مرة — يمكن إعادة التحويل عند الحاجة'
                : 'التحويل لم يُطبَّق بعد'}
            </span>
          </div>
          <div className="toolbar mt-16">
            <button className="soft" onClick={saveGeneral} disabled={busy === 'general' || busy === 'currency'}>
              حفظ سعر الصرف والمعامل
            </button>
            <button className="danger-ghost" onClick={convertCurrency} disabled={busy === 'currency'}>
              🔄 تحويل القيم إلى العملة الجديدة الآن
            </button>
          </div>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            العملة الأساسية في البرنامج هي الليرة السورية (ل.س)، ويُعرض ما يقابلها بالدولار أسفلها.
            عند الضغط تُقسَّم جميع المبالغ المحفوظة (أصناف الكتالوج، كلف المواد، الفواتير وبنودها، المصاريف) وسعر الصرف نفسه على المعامل (مثلاً 100):
            يصبح 1,000,000 ل.س القديمة = 10,000 ل.س الجديدة، ويُعاد حساب كل مبالغ الدولار تلقائياً.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>قاعدة البيانات (قابلة للنقل)</h2>
        </div>
        <div className="panel-body">
          {dbInfo.path && (
            <div className="muted" style={{ fontSize: 12, direction: 'ltr', textAlign: 'left', wordBreak: 'break-all', marginBottom: 12 }}>
              {dbInfo.path}
            </div>
          )}
          <div className="toolbar">
            <button className="ghost" onClick={() => void window.clinic.db.openFolder()}>
              فتح مجلد البيانات
            </button>
            <button className="ghost" onClick={changeLocation} disabled={busy === 'db'}>
              تغيير موقع قاعدة البيانات
            </button>
            <button
              className="ghost"
              onClick={() => {
                setBusy('local')
                window.clinic.db
                  .useLocal()
                  .then(() => toast('العودة إلى التخزين المحلي، سيُعاد التشغيل...', 'success'))
                  .catch((e) => toast(e.message, 'error'))
                  .finally(() => setBusy(''))
              }}
              disabled={busy === 'local'}
            >
              استخدام الموقع المحلي الافتراضي
            </button>
            <button
              className="soft"
              onClick={() => {
                setBusy('backup')
                window.clinic.db
                  .backup()
                  .then((p) => {
                    if (p) toast('تم إنشاء النسخة الاحتياطية', 'success')
                  })
                  .catch((e) => toast(e.message, 'error'))
                  .finally(() => setBusy(''))
              }}
              disabled={busy === 'backup'}
            >
              📦 نسخة احتياطية
            </button>
            <button
              className="soft"
              onClick={() => {
                setBusy('restore')
                window.clinic.db
                  .restore()
                  .then((p) => {
                    if (p) {
                      toast('تمت الاستعادة، إعادة تحميل البيانات...', 'success')
                      setTimeout(reload, 800)
                    }
                  })
                  .catch((e) => toast(e.message, 'error'))
                  .finally(() => setBusy(''))
              }}
              disabled={busy === 'restore'}
            >
              ♻ استعادة نسخة
            </button>
          </div>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            تُحفَظ قاعدة البيانات محلياً وتُزامَن تلقائياً مع السحابة في الخلفية بعد كل تعديل وكل بضع دقائق، دون الحاجة إلى أي إعداد من هنا.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>تغيير كلمة المرور</h2>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <Field label="كلمة المرور الحالية">
              <input type="password" value={ob.oldPassword} onChange={(e) => setOb({ ...ob, oldPassword: e.target.value })} />
            </Field>
            <Field label="كلمة المرور الجديدة">
              <input type="password" value={ob.newPassword} onChange={(e) => setOb({ ...ob, newPassword: e.target.value })} />
            </Field>
            <Field label="تأكيد كلمة المرور الجديدة">
              <input type="password" value={ob.confirm} onChange={(e) => setOb({ ...ob, confirm: e.target.value })} />
            </Field>
          </div>
          <div className="mt-16">
            <button onClick={changePassword}>تغيير كلمة المرور</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>إجراءات</h2>
        </div>
        <div className="panel-body">
          <button className="danger" onClick={onLogout}>
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  )
}
