import type {
  Appointment,
  CatalogItem,
  DashboardStats,
  DueRecurringExpense,
  Expense,
  Invoice,
InvoiceItem,
  Material,
  Medication,
  MedicationInput,
  Medicine,
  MedicineInput,
  Patient,
  PatientAttachment,
  PatientFileResult,
  PrinterInfo,
  Recurrence,
  Settings,
  StockMovement,
  User,
  DentalChartEntry,
  ToothCondition,
  ToothSurface,
  TreatmentPlan,
  TreatmentPlanItem,
  TreatmentPlanStatus,
  PeriodontalChartEntry,
  ProcedureTemplate,
  RecallReminder,
  RecallType
} from '@shared/types'
import type { PermissionKey, PermissionOverride, Role, SheetSchemaKey } from '@shared/types'
import { can as baseCan } from '@shared/types'

export type {
  Appointment,
  CatalogItem,
  DashboardStats,
  DueRecurringExpense,
  Expense,
  Invoice,
  InvoiceItem,
  Material,
  Medication,
  MedicationInput,
  Medicine,
  MedicineInput,
  Patient,
  PatientAttachment,
  PatientFileResult,
  PermissionKey,
  PermissionOverride,
  PrinterInfo,
  Recurrence,
  Role,
  Settings,
  SheetSchemaKey,
  StockMovement,
  User,
  DentalChartEntry,
  ToothCondition,
  TreatmentPlan,
  TreatmentPlanItem,
  TreatmentPlanStatus,
  PeriodontalChartEntry,
  ProcedureTemplate,
  RecallReminder,
  RecallType
}

let permOverride: PermissionOverride = {}

export function setCurrentPerms(p: PermissionOverride): void {
  permOverride = p
}

export function can(role: Role, perm: PermissionKey): boolean {
  return baseCan(role, perm, permOverride)
}

export { SHEET_SCHEMAS } from '@shared/types'
export { PERMISSION_LABELS, PERMISSIONS } from '@shared/types'

export type ScreenKey =
  | 'dashboard'
  | 'patients'
  | 'appointments'
  | 'billing'
  | 'catalog'
  | 'inventory'
  | 'expenses'
  | 'users'
  | 'settings'
  | 'finances'
  | 'dental'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

const AR_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'
const FA_DIGITS = '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9'
const DIGIT_MAP: Record<string, string> = {}
for (let i = 0; i < 10; i++) {
  DIGIT_MAP[AR_DIGITS[i]] = String(i)
  DIGIT_MAP[FA_DIGITS[i]] = String(i)
}

/** تحويل أي أرقام عربية/فارسية (٠١٢٣٤٥٦٧٨٩ أو ۰۱۲۳...) إلى أرقام إنجليزية 1234567890 */
export function toLatinDigits(s: string): string {
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => DIGIT_MAP[d] ?? d)
}

/**
 * تنقية إدخال رقمي: تحوّل الأرقام العربية/الفارسية إلى إنجليزية،
 * وتحذف كل ما ليس رقماً أو فاصلة عشرية، وتسمح بعلامة سالب واحدة في البداية.
 */
export function sanitizeNumberInput(s: string, allowNegative = false): string {
  let t = toLatinDigits(s)
  t = t.replace(allowNegative ? /[^0-9.-]/g : /[^0-9.]/g, '')
  if (allowNegative) {
    const neg = t.startsWith('-')
    t = t.replace(/-/g, '')
    if (neg) t = '-' + t
  }
  const i = t.indexOf('.')
  if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '')
  return t
}

/** تحويل نص إلى رقم بأمان (يتقبّل الأرقام العربية، الفارغ = 0). */
export function parseNumber(s: string): number {
  const t = sanitizeNumberInput(s, true)
  if (t === '' || t === '-' || t === '.' || t === '-.') return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

export function useToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}