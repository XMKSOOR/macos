export interface User {
  id: number
  username: string
  role: Role
  full_name: string
  created_at: string
  permissions?: PermissionOverride
}

export interface LoginResult {
  user: User
}

export interface Patient {
  id: number
  name: string
  phone: string
  birth_date: string
  gender: string
  address: string
  notes: string
  /** رقم الملف الطبي أو الرقم الوطني الموحد */
  national_id?: string
  /** الحساسية الدوائية والغذائية */
  allergies?: string
  /** الأمراض المزمنة */
  chronic_diseases?: string
  /** الحالة الفسيولوجية الخاصة (حمل، رضاعة...) */
  physiological_status?: string
  /** ملاحظات وتاريخ مرضي إضافي */
  medical_notes?: string
  created_at: string
}

export type MedicationCategory = 'prescription' | 'otc' | 'supplement' | 'herbal'

/** سجل أدوية المريض: الأدوية الحرة والموصوفة والمكملات */
export interface Medication {
  id: number
  patient_id: number
  /** الاسم العلمي (المادة الفعالة) */
  scientific_name: string
  /** الاسم التجاري (المطبوع على العلبة) */
  trade_name: string
  /** الجرعة/التركيز (مثال: 500 ملغ) */
  dose: string
  /** الشكل الصيدلاني (أقراص، شراب، حقن...) */
  form: string
  /** طريقة الاستخدام (فموي، تحت اللسان...) */
  route: string
  /** عدد المرات والتوقيت (ثلاث مرات يومياً...) */
  frequency: string
  start_date: string
  end_date: string
  /** التصنيف: موصوف، بدون وصفة OTC، مكمل غذائي، أعشاب */
  category: MedicationCategory
  /** اسم الطبيب المعالج وتخصصه */
  prescriber: string
  prescriber_specialty: string
  /** اسم الصيدلي */
  pharmacist: string
  /** تاريخ الصرف ومكان الصرف */
  dispense_date: string
  dispense_place: string
  /** تاريخ المراجعة القادمة */
  next_review: string
  notes: string
  /** 1 إن كان الدواء الحالي فعّالاً */
  active: number
  created_at: string
}

export type MedicationInput = Omit<Medication, 'id' | 'created_at'>

/** دواء في القائمة المرجعية (تعبئة سريعة للوصفة) */
export interface Medicine {
  id: number
  trade_name: string
  scientific_name: string
  dose: string
  form: string
  route: string
  frequency: string
  category: MedicationCategory
  created_at: string
}

export type MedicineInput = Omit<Medicine, 'id' | 'created_at'>

/** وصفة طبية جاهزة للطباعة */
export interface PrescriptionRequest {
  patientId: number
  medicationIds: number[]
  diagnosis?: string
  note?: string
}

export type PatientReportMode = 'brief' | 'full'

export interface Appointment {
  id: number
  patient_id: number
  date: string
  time: string
  reason: string
  notes: string
  status: 'scheduled' | 'done' | 'cancelled'
  created_at: string
  patient_name?: string
  patient_phone?: string
}

export interface CatalogItem {
  id: number
  name: string
  price: number
  cost: number
  margin: number
  price_usd?: number
  cost_usd?: number
  description: string
  created_at: string
  materials: { material_id: number; name: string; qty: number; unit: string; cost: number }[]
}

export interface CatalogBomInput {
  material_id: number
  qty: number
}

export interface Material {
  id: number
  name: string
  category: string
  unit: string
  quantity: number
  min_qty: number
  cost: number
  cost_usd?: number
  supplier: string
  notes: string
  created_at: string
}

export interface StockMovement {
  id: number
  material_id: number
  qty: number
  operation: 'add' | 'adjust' | 'sale' | 'waste'
  reference: string
  user_name: string
  note: string
  created_at: string
  material_name?: string
}

export interface InvoiceItemInput {
  name: string
  cost: number
  qty: number
  catalog_id: number | null
  materials: { material_id: number; qty: number }[]
}

export interface InvoiceItem extends InvoiceItemInput {
  id: number
  invoice_id: number
  cost_usd?: number
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid'

/** مرفق محلي (صورة، صورة أشعة/DICOM، أو ملف) يخصّ مريضاً */
export interface PatientAttachment {
  id: number
  patient_id: number
  /** الاسم الأصلي للملف كما اختاره المستخدم */
  filename: string
  /** اسم الملف على القرص داخل مجلد بيانات التطبيق */
  stored_name: string
  /** نوع المحتوى: صورة أشعة DICOM، صورة عادية، أو ملف آخر */
  ftype: 'dicom' | 'image' | 'other'
  mime: string
  size: number
  created_at: string
}

export interface PatientFileResult {
  patient: Patient
  appointments: Appointment[]
  invoices: Invoice[]
  attachments: PatientAttachment[]
  medications: Medication[]
}

export interface Invoice {
  id: number
  invoice_no: string
  patient_id: number
  date: string
  usd_rate: number
  subtotal: number
  discount: number
  total: number
  paid: number
  subtotal_usd?: number
  discount_usd?: number
  total_usd?: number
  paid_usd?: number
  status: InvoiceStatus
  notes: string
  created_by: string
  created_at: string
  patient_name?: string
  patient_phone?: string
  items?: InvoiceItem[]
  /** إجمالي كلفة المواد المنقوصة (المستهلكة) من المخزون لهذه الفاتورة */
  items_cost?: number
}

export type Recurrence = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Expense {
  id: number
  category: string
  amount: number
  amount_usd?: number
  note: string
  date: string
  created_by: string
  created_at: string
  is_recurring?: number
  recurrence?: Recurrence
  next_due?: string
  last_generated?: string
}

/** مصروف متكرر يستحق خلال الأيام القادمة */
export interface DueRecurringExpense {
  id: number
  category: string
  amount: number
  note: string
  recurrence: Recurrence
  next_due: string
  days_left: number
}

export interface Settings {
  clinic_name: string
  clinic_phone: string
  clinic_address: string
  receipt_header: string
  receipt_footer: string
  usd_rate: number
  printer_name: string
  currency_scale: string
  currency_converted: string
  drive_client_id: string
  drive_client_secret: string
  drive_tokens: string
  drive_auto: string
  mysql_host: string
  mysql_port: string
  mysql_db: string
  mysql_user: string
  mysql_secret: string
  mysql_auto: string
  supabase_url: string
  supabase_key: string
  supabase_auto: string
  supabase_pg_auto: string
  feasibility_seed: string
  feasibility_plan?: string
  feasibility_seed2?: string
}

export interface DashboardStats {
  period: string
  patients_count: number
  today_appointments: number
  upcoming_appointments: number
  income: number
  expenses: number
  margin: number
  materials_low: number
  unpaid_total: number
  by_status: { date: string; income: number; expenses: number }[]
  recent_invoices: Invoice[]
}

export interface PrinterInfo {
  name: string
  description: string
}

export type Role = 'admin' | 'doctor' | 'cashier'

export const PERMISSIONS: Record<string, Role[]> = {
  edit: ['admin', 'doctor'],
  editPrices: ['admin', 'doctor'],
  delete: ['admin'],
  adjustStock: ['admin', 'doctor'],
  import: ['admin', 'doctor'],
  manageUsers: ['admin'],
  manageSettings: ['admin']
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export type PermissionOverride = Partial<Record<PermissionKey, boolean>>

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  edit: 'تعديل السجلات والبيانات',
  editPrices: 'تغيير الأسعار والتسعير',
  delete: 'حذف السجلات',
  adjustStock: 'ضبط المخزون (جرد)',
  import: 'استيراد/تصدير Excel',
  manageUsers: 'إدارة المستخدمين والصلاحيات',
  manageSettings: 'إدارة الإعدادات'
}

export function can(role: Role, perm: PermissionKey, override?: PermissionOverride): boolean {
  if (override && perm in override) return override[perm] === true
  return (PERMISSIONS[perm] as readonly Role[]).includes(role)
}

export type SheetSchemaKey =
  | 'patients'
  | 'appointments'
  | 'catalog'
  | 'materials'
  | 'expenses'
  | 'users'
  | 'invoices'
  | 'movements'

export interface SheetCol {
  key: string
  header: string
  sample?: string
  aliases?: string[]
  usd?: boolean
}

export interface SheetSchema {
  key: SheetSchemaKey
  label: string
  cols: SheetCol[]
  importable: boolean
}

export const SHEET_SCHEMAS: SheetSchema[] = [
  {
    key: 'patients',
    label: 'المرضى',
    importable: true,
    cols: [
      { key: 'name', header: 'الاسم', sample: 'مثال مريض', aliases: ['name', 'اسم المريض', 'الاسم الكامل', 'patient'] },
      { key: 'phone', header: 'الهاتف', sample: '03 123456', aliases: ['phone', 'رقم الهاتف', 'جوال', 'موبايل', 'tel'] },
      { key: 'gender', header: 'الجنس', sample: 'ذكر', aliases: ['gender', 'النوع', 'sex'] },
      { key: 'birth_date', header: 'تاريخ الميلاد', sample: '1990-01-01', aliases: ['birth_date', 'الميلاد', 'dob'] },
      { key: 'address', header: 'العنوان', sample: '', aliases: ['address', 'عنوان'] },
      { key: 'notes', header: 'ملاحظات', sample: '', aliases: ['notes', 'ملاحظة', 'note'] }
    ]
  },
  {
    key: 'appointments',
    label: 'المواعيد',
    importable: true,
    cols: [
      { key: 'patient_name', header: 'اسم المريض', sample: 'مثال مريض', aliases: ['patient_name', 'الاسم', 'patient'] },
      { key: 'date', header: 'التاريخ', sample: '2026-09-20', aliases: ['date', 'اليوم'] },
      { key: 'time', header: 'الوقت', sample: '10:30', aliases: ['time', 'الساعة', 'ساعة'] },
      { key: 'reason', header: 'السبب', sample: '', aliases: ['reason', 'سبب'] },
      { key: 'status', header: 'الحالة', sample: 'scheduled', aliases: ['status', 'status_ar'] },
      { key: 'notes', header: 'ملاحظات', sample: '', aliases: ['notes', 'ملاحظة'] }
    ]
  },
  {
    key: 'catalog',
    label: 'كتالوج الأصناف',
    importable: true,
    cols: [
      { key: 'name', header: 'الاسم', sample: 'حشوة تجميلية', aliases: ['name', 'اسم الصنف', 'اسم الخدمة', 'اسم البند'] },
      { key: 'price', header: 'السعر (ل.س)', sample: '2000000', aliases: ['price', 'price_lbp', 'السعر', 'سعر', 'سعر الخدمة ب الليرة'] },
      { key: 'price', header: 'السعر ($)', sample: '200', usd: true, aliases: ['price_usd', 'price_$', 'price ($)', 'سعر الدولار', 'السعر بالدولار'] },
      { key: 'description', header: 'الوصف', sample: '', aliases: ['description', 'وصف', 'عن'] }
    ]
  },
  {
    key: 'materials',
    label: 'مواد المخزون',
    importable: true,
    cols: [
      { key: 'name', header: 'الاسم', sample: 'قفازات', aliases: ['name', 'اسم المادة', 'المادة', 'materiel'] },
      { key: 'category', header: 'التصنيف', sample: 'مستهلكات', aliases: ['category', 'الصنف', 'النوع'] },
      { key: 'unit', header: 'الوحدة', sample: 'علبة', aliases: ['unit', 'وحدة'] },
      { key: 'quantity', header: 'الكمية', sample: '100', aliases: ['quantity', 'qty', 'الكمية الفعلية'] },
      { key: 'min_qty', header: 'الحد الأدنى', sample: '20', aliases: ['min_qty', 'min', 'الحد الادنى'] },
      { key: 'cost', header: 'الكلفة (ل.س)', sample: '150000', aliases: ['cost', 'cost_lbp', 'الكلفة', 'التكلفة', 'سعر الشراء'] },
      { key: 'cost', header: 'الكلفة ($)', sample: '150', usd: true, aliases: ['cost_usd', 'cost_$', 'cost ($)', 'كلفة الدولار', 'سعر الشراء بالدولار'] },
      { key: 'supplier', header: 'المورد', sample: '', aliases: ['supplier', 'المورد', 'مورد'] },
      { key: 'notes', header: 'ملاحظات', sample: '', aliases: ['notes', 'ملاحظة'] }
    ]
  },
  {
    key: 'expenses',
    label: 'المصاريف',
    importable: true,
    cols: [
      { key: 'category', header: 'التصنيف', sample: 'إيجار', aliases: ['category', 'نوع المصروف', 'النوع'] },
      { key: 'amount', header: 'المبلغ (ل.س)', sample: '5000000', aliases: ['amount', 'amount_lbp', 'المبلغ', 'القيمة'] },
      { key: 'amount', header: 'المبلغ ($)', sample: '5000', usd: true, aliases: ['amount_usd', 'amount_$', 'amount ($)', 'المبلغ بالدولار'] },
      { key: 'date', header: 'التاريخ', sample: '2026-09-11', aliases: ['date', 'اليوم'] },
      { key: 'note', header: 'الملاحظة', sample: '', aliases: ['note', 'notes', 'ملاحظات'] }
    ]
  },
  {
    key: 'users',
    label: 'المستخدمون',
    importable: false,
    cols: [
      { key: 'username', header: 'اسم المستخدم', sample: 'doctor1' },
      { key: 'full_name', header: 'الاسم الكامل', sample: 'طبيب العيادة' },
      { key: 'role', header: 'الدور', sample: 'doctor' },
      { key: 'password', header: 'كلمة المرور', sample: '1234' }
    ]
  },
  {
    key: 'invoices',
    label: 'الفواتير',
    importable: false,
    cols: [
      { key: 'invoice_no', header: 'الرقم' },
      { key: 'patient_name', header: 'المريض' },
      { key: 'date', header: 'التاريخ' },
      { key: 'usd_rate', header: 'سعر الصرف' },
      { key: 'subtotal', header: 'المجموع' },
      { key: 'discount', header: 'الخصم' },
      { key: 'total', header: 'الإجمالي' },
      { key: 'paid', header: 'المدفوع' },
      { key: 'status', header: 'الحالة' }
    ]
  },
  {
    key: 'movements',
    label: 'سجل الحركات',
    importable: false,
    cols: [
      { key: 'created_at', header: 'التاريخ والوقت' },
      { key: 'material_name', header: 'المادة' },
      { key: 'qty', header: 'الكمية' },
      { key: 'operation', header: 'النوع' },
      { key: 'reference', header: 'المرجع' },
      { key: 'user_name', header: 'المستخدم' },
      { key: 'note', header: 'ملاحظة' }
    ]
  }
]

export type SheetExportRequest = {
  defaultName: string
  sheets: { name: string; rows: Record<string, string | number>[]; schemaKey?: SheetSchemaKey }[]
}

export type IpcResult<T> = T

export interface FeasibilityPlan {
  startDate: string
  numMonths: number
  planTargets: number[]
  ratios: number[]
}