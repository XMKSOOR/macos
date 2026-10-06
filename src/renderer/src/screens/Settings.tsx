import { useEffect, useState } from 'react'
import { Field, useToast } from '../ui'
import type { PrinterInfo, Settings } from '../lib'
import { toLatinDigits } from '../lib'

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
  const [driveStatus, setDriveStatus] = useState<{ connected: boolean; config: boolean }>({ connected: false, config: false })
  const [busy, setBusy] = useState('')
  const toast = useToast()

  const reload = (): void => {
    window.location.reload()
  }

  useEffect(() => {
    if (settings) setForm({ ...settings, usd_rate: settings.usd_rate })
    window.clinic.printing.list().then(setPrinters).catch(() => {})
    window.clinic.db.info().then(setDbInfo).catch(() => {})
    window.clinic.sync
      .driveStatus()
      .then(setDriveStatus)
      .catch(() => {})
  }, [settings])

  const saveGeneral = (): void => {
    setBusy('general')
    window.clinic.settings
      .save({ ...form, usd_rate: Number(form.usd_rate) || 0 })
      .then(() => {
        toast('تم حفظ الإعدادات', 'success')
        onSaved()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setBusy(''))
  }

  const saveDrive = (): void => {
    setBusy('drive')
    window.clinic.settings
      .save({
        drive_client_id: form.drive_client_id.trim(),
        drive_client_secret: form.drive_client_secret.trim(),
        drive_auto: form.drive_auto
      })
      .then(() => {
        toast('تم حفظ إعدادات المحرك', 'success')
        onSaved()
        return window.clinic.sync.driveStatus()
      })
      .then(setDriveStatus)
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setBusy(''))
  }

  const saveMysql = (): void => {
    setBusy('mysql-save')
    window.clinic.settings
      .save({
        mysql_host: form.mysql_host.trim(),
        mysql_port: (form.mysql_port || '3306').trim(),
        mysql_db: form.mysql_db.trim(),
        mysql_user: form.mysql_user.trim(),
        mysql_secret: form.mysql_secret,
        mysql_auto: form.mysql_auto
      })
      .then(() => {
        toast('تم حفظ بيانات الخادم السحابي', 'success')
        onSaved()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setBusy(''))
  }

  const doMysql = (key: string, fn: () => Promise<unknown>): void => {
    setBusy(key)
    fn()
      .then((r) => r && toast(String(r), 'success'))
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setBusy(''))
  }

  const saveSupabase = (): void => {
    setBusy('supabase-save')
    window.clinic.settings
      .save({
        supabase_url: form.supabase_url.trim(),
        supabase_key: form.supabase_key.trim(),
        supabase_auto: form.supabase_auto,
        supabase_pg_auto: form.supabase_pg_auto
      })
      .then(() => {
        toast('تم حفظ إعدادات Supabase', 'success')
        onSaved()
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setBusy(''))
  }

  const doSupabase = (key: string, fn: () => Promise<unknown>): void => {
    setBusy(key)
    fn()
      .then((r) => r && toast(String(r), 'success'))
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

  const doRun = (key: string, fn: () => Promise<unknown>, ok: string): void => {
    setBusy(key)
    fn()
      .then((r) => {
        if (r) toast(`${ok}: ${String(r)}`, 'success')
        return window.clinic.sync.driveStatus()
      })
      .then(setDriveStatus)
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setBusy(''))
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
          <h2>العملة (حذف الأصفار والعملة المزدوجة)</h2>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <Field label="سعر الصرف (ل.س الجديدة مقابل $)">
              <input
                type="number" dir="ltr" inputMode="decimal"
                value={form.usd_rate}
                onChange={(e) => setForm({ ...form, usd_rate: Number(toLatinDigits(e.target.value)) })}
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
            عند الضغط تُقسَّم جميع المبالغ المحفوظة (أصناف الكتالوج، كلف المواد، الفواتير وبنودها، المصاريف) وسعر الصرف نفسه على المعامل (مثلاً 100):
            يصبح 1,000,000 ل.س القديمة = 10,000 ل.س الجديدة، ويُعاد حساب كل مبالغ الدولار تلقائياً. الزر يعمل في كل ضغطة، ولا يتم التحويل تلقائياً عند إقلاع البرنامج.
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
            ملاحظة: لتزامن النسخ بين الأجهزة، ضع الموقع داخل مجلد Google Drive أو Dropbox على الجهاز، ثم فعّل المزامنة أدناه.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>المزامنة السحابية (Google Drive)</h2>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <Field label="Client ID (من Google Cloud Console)">
              <input
                value={form.drive_client_id}
                onChange={(e) => setForm({ ...form, drive_client_id: e.target.value })}
                placeholder="xxxxx.apps.googleusercontent.com"
                dir="ltr"
              />
            </Field>
            <Field label="Client Secret">
              <input
                value={form.drive_client_secret}
                onChange={(e) => setForm({ ...form, drive_client_secret: e.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label="رفع تلقائي عند الإغلاق + سحب عند الفتح">
              <select value={form.drive_auto} onChange={(e) => setForm({ ...form, drive_auto: e.target.value })}>
                <option value="1">مفعّل</option>
                <option value="0">معطّل</option>
              </select>
            </Field>
          </div>
          <div className="mt-16">
            <button className="ghost" onClick={saveDrive} disabled={busy === 'drive'}>
              حفظ إعدادات المحرك
            </button>
          </div>
          <div className="flex mt-16" style={{ gap: 12 }}>
            <span className={`badge ${driveStatus.connected ? 'green' : 'gray'}`}>
              {driveStatus.connected ? 'الحساب مربوط' : 'غير مربوط'}
            </span>
            <span className={`badge ${driveStatus.config ? 'blue' : 'gray'}`}>{driveStatus.config ? 'الإعدادات مكتملة' : 'أدخل بيانات التطبيق'}</span>
          </div>
          <div className="toolbar mt-16">
            <button className="soft" onClick={() => doRun('auth', () => window.clinic.sync.driveAuth(), 'تم الربط')} disabled={busy !== ''}>
              🔗 ربط Google Drive
            </button>
            <button
              className="soft"
              onClick={() => doRun('up', () => window.clinic.sync.driveUpload(), 'الرفع')}
              disabled={busy !== '' || !driveStatus.config || !driveStatus.connected}
            >
              ⬆ رفع نسخة الآن
            </button>
            <button
              className="soft"
              onClick={() => doRun('down', () => window.clinic.sync.driveDownload(), 'السحب')}
              disabled={busy !== '' || !driveStatus.config || !driveStatus.connected}
            >
              ⬇ سحب آخر نسخة
            </button>
            <button
              className="danger-ghost"
              onClick={() => doRun('clear', () => window.clinic.sync.driveClear(), 'تم مسح الربط')}
              disabled={busy !== ''}
            >
              مسح الربط
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>قاعدة البيانات السحابية (MySQL — تنعكس على موقع phpMyAdmin)</h2>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <Field label="الاستضافة (Host)">
              <input
                value={form.mysql_host}
                onChange={(e) => setForm({ ...form, mysql_host: e.target.value })}
                placeholder="sql12.freesqldatabase.com"
                dir="ltr"
              />
            </Field>
            <Field label="المنفذ (Port)">
              <input
                type="number"
                value={form.mysql_port}
                onChange={(e) => setForm({ ...form, mysql_port: e.target.value })}
                dir="ltr"
                style={{ maxWidth: 120 }}
              />
            </Field>
            <Field label="اسم قاعدة البيانات">
              <input
                value={form.mysql_db}
                onChange={(e) => setForm({ ...form, mysql_db: e.target.value })}
                placeholder="sql12836904"
                dir="ltr"
              />
            </Field>
            <Field label="اسم المستخدم">
              <input
                value={form.mysql_user}
                onChange={(e) => setForm({ ...form, mysql_user: e.target.value })}
                placeholder="sql12836904"
                dir="ltr"
              />
            </Field>
            <Field label="كلمة المرور">
              <input
                type="password"
                value={form.mysql_secret}
                onChange={(e) => setForm({ ...form, mysql_secret: e.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label="رفع تلقائي عند الإغلاق + سحب عند الفتح">
              <select value={form.mysql_auto} onChange={(e) => setForm({ ...form, mysql_auto: e.target.value })}>
                <option value="1">مفعّل</option>
                <option value="0">معطّل</option>
              </select>
            </Field>
          </div>
          <div className="mt-16">
            <button className="ghost" onClick={saveMysql} disabled={busy === 'mysql-save'}>
              حفظ بيانات الخادم
            </button>
          </div>
          <div className="toolbar mt-16">
            <button className="soft" onClick={() => doMysql('mysql-test', () => window.clinic.mysql.test())} disabled={busy !== ''}>
              📡 اختبار الاتصال
            </button>
            <button
              className="soft"
              onClick={() => doMysql('mysql-up', () => window.clinic.mysql.push())}
              disabled={busy !== '' || !(form.mysql_host && form.mysql_db)}
            >
              ⬆ رفع نسخة كاملة الآن
            </button>
            <button
              className="soft"
              onClick={() => doMysql('mysql-down', () => window.clinic.mysql.pull())}
              disabled={busy !== '' || !(form.mysql_host && form.mysql_db)}
            >
              ⬇ سحب آخر نسخة من الخادم
            </button>
          </div>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            «رفع نسخة» تكتب كل بيانات العيادة إلى قاعدتك السحابية (تُرى من موقع phpMyAdmin)، و«سحب» يعيدها إلى هذا الجهاز.
            يمكنك تغيير هذه الخيارات في أي وقت من هنا.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>قاعدة البيانات السحابية (Supabase Storage)</h2>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <Field label="عنوان المشروع (Project URL)">
              <input
                value={form.supabase_url}
                onChange={(e) => setForm({ ...form, supabase_url: e.target.value })}
                placeholder="https://xxxxxxxx.supabase.co"
                dir="ltr"
              />
            </Field>
            <Field label="المفتاح السري (service_role / secret key)">
              <input
                type="password"
                value={form.supabase_key}
                onChange={(e) => setForm({ ...form, supabase_key: e.target.value })}
                placeholder="eyJhbGciOi..."
                dir="ltr"
              />
            </Field>
            <Field label="رفع تلقائي عند الإغلاق + سحب عند الفتح">
              <select value={form.supabase_auto} onChange={(e) => setForm({ ...form, supabase_auto: e.target.value })}>
                <option value="1">مفعّل</option>
                <option value="0">معطّل</option>
              </select>
            </Field>
          </div>
          <div className="mt-16">
            <button className="ghost" onClick={saveSupabase} disabled={busy === 'supabase-save'}>
              حفظ بيانات Supabase
            </button>
          </div>
          <div className="toolbar mt-16">
            <button className="soft" onClick={() => doSupabase('supabase-test', () => window.clinic.supabase.test())} disabled={busy !== ''}>
              📡 اختبار الاتصال
            </button>
            <button
              className="soft"
              onClick={() => doSupabase('supabase-up', () => window.clinic.supabase.push())}
              disabled={busy !== '' || !(form.supabase_url && form.supabase_key)}
            >
              ⬆ رفع نسخة كاملة الآن
            </button>
            <button
              className="soft"
              onClick={() => doSupabase('supabase-down', () => window.clinic.supabase.pull())}
              disabled={busy !== '' || !(form.supabase_url && form.supabase_key)}
            >
              ⬇ سحب آخر نسخة من الخادم
            </button>
          </div>
          <p className="muted mt-8" style={{ fontSize: 12 }}>
            «رفع نسخة» تخزّن نسخة كاملة من قاعدة بيانات العيادة في مساحة تخزين Supabase، و«سحب» يستبدل بيانات هذا الجهاز بآخر نسخة مرفوعة.
            استخدم المفتاح السري (service_role) من إعدادات المشروع في لوحة Supabase.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>تطبيق الجوال (Supabase Postgres)</h2>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            يزامن هذا الجهاز بيانات العيادة إلى جداول Postgres داخل مشروع Supabase نفسه، ليتصفّحها تطبيق الأندرويد.
            يستخدم عنوان المشروع والمفتاح السري أعلاه. نفّذ ملف <code dir="ltr">supabase/schema.sql</code> في محرر SQL مرة واحدة قبل أول رفع.
          </p>
          <div className="form-grid">
            <Field label="مزامنة تلقائية مع Postgres (عند الإغلاق + الفتح)">
              <select value={form.supabase_pg_auto} onChange={(e) => setForm({ ...form, supabase_pg_auto: e.target.value })}>
                <option value="1">مفعّل</option>
                <option value="0">معطّل</option>
              </select>
            </Field>
          </div>
          <div className="mt-16">
            <button className="ghost" onClick={saveSupabase} disabled={busy === 'supabase-save'}>
              حفظ إعدادات Postgres
            </button>
          </div>
          <div className="toolbar mt-16">
            <button className="soft" onClick={() => doSupabase('cloud-test', () => window.clinic.cloud.test())} disabled={busy !== ''}>
              📡 اختبار اتصال Postgres
            </button>
            <button
              className="soft"
              onClick={() => doSupabase('cloud-up', () => window.clinic.cloud.push())}
              disabled={busy !== '' || !(form.supabase_url && form.supabase_key)}
            >
              ⬆ رفع البيانات إلى Postgres
            </button>
            <button
              className="soft"
              onClick={() => doSupabase('cloud-down', () => window.clinic.cloud.pull())}
              disabled={busy !== '' || !(form.supabase_url && form.supabase_key)}
            >
              ⬇ سحب البيانات من Postgres
            </button>
          </div>
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