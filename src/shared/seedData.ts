export interface SeedMaterial {
  name: string
  category: string
  unit: string
  quantity: number
  min_qty: number
  cost: number
  supplier: string
  notes: string
}

export interface SeedCatalogBom {
  material: string
  qty: number
}

export interface SeedCatalog {
  name: string
  price: number
  description: string
  materials: SeedCatalogBom[]
}

// بيانات هجين (دراسة الجدوى — إصدار v2 المصحّح)
// الأسعار بالليرة الجديدة (حُذف صفران من الليرة): القيمة = ليرة الدراسة ÷ 100
// نسبة التحويل: 1$ = 13,000 ل.س قديمة = 130 ل.س جديدة

export const SEED_MATERIALS: SeedMaterial[] = [
  // مستهلكات يومية (تكلفة التشخيص لكل حالة 0.83$ = 108 ل.س جديدة)
  { name: 'قفاز فحص نترايل (زوج)', category: 'مستهلكات', unit: 'زوج', quantity: 600, min_qty: 150, cost: 30, supplier: 'هجين (محلي)', notes: 'زوج واحد لكل حالة' },
  { name: 'قناع وجهي (كمامة)', category: 'مستهلكات', unit: 'حبة', quantity: 400, min_qty: 100, cost: 30, supplier: 'هجين (محلي)', notes: '' },
  { name: 'شفاطة بلع (Suction)', category: 'مستهلكات', unit: 'حبة', quantity: 200, min_qty: 50, cost: 18, supplier: 'هجين (محلي)', notes: '' },
  { name: 'قطن وشاش معقم', category: 'مستهلكات', unit: 'قطعة', quantity: 600, min_qty: 150, cost: 15, supplier: 'هجين (محلي)', notes: '' },
  // تخدير موضعي (0.39$ = 51 ل.س جديدة لكل حالة)
  { name: 'بنج موضعي (كاربولة)', category: 'تخدير', unit: 'كاربولة', quantity: 300, min_qty: 60, cost: 25, supplier: 'هجين (محلي)', notes: '' },
  { name: 'إبرة تخدير', category: 'تخدير', unit: 'حبة', quantity: 300, min_qty: 60, cost: 18, supplier: 'هجين (محلي)', notes: '' },
  { name: 'جل تخدير موضعي', category: 'تخدير', unit: 'حبة', quantity: 150, min_qty: 30, cost: 8, supplier: 'هجين (محلي)', notes: '' },
  // حشوات (كومبوزيت 0.47$ = 61 ل.س / GIC 0.94$ = 122 ل.س لكل حالة)
  { name: 'حشوة كومبوزيت (جرعة)', category: 'حشوات', unit: 'جرعة', quantity: 200, min_qty: 40, cost: 41, supplier: 'دمشق', notes: 'مادة + سنّيّة' },
  { name: 'بوند وحمض إتش (جرعة)', category: 'حشوات', unit: 'جرعة', quantity: 200, min_qty: 40, cost: 20, supplier: 'دمشق', notes: '' },
  { name: 'حشوة زجاجية GIC (جرعة)', category: 'حشوات', unit: 'جرعة', quantity: 100, min_qty: 20, cost: 122, supplier: 'دمشق', notes: '' },
  { name: 'حشوة مؤقتة (جرعة)', category: 'حشوات', unit: 'جرعة', quantity: 80, min_qty: 20, cost: 12, supplier: 'هجين (محلي)', notes: '' },
  // علاج العصب (ملفات 1.60$ / جوتا+سيلر 0.62$)
  { name: 'ملف روتاري لعصب (حبة)', category: 'علاج عصب', unit: 'حبة', quantity: 40, min_qty: 8, cost: 70, supplier: 'دمشق', notes: '3 ملفات لكل حالة عصب' },
  { name: 'جوتا بيركا + سيلر + نقاط ورق (حالة)', category: 'علاج عصب', unit: 'حالة', quantity: 60, min_qty: 12, cost: 81, supplier: 'دمشق', notes: '' },
  // تعويضات ومختبرة (نشرة مخبر الشام — كلفة المختبر فقط)
  { name: 'تعويض زيركون (مختبر دمشق)', category: 'مختبر', unit: 'سن', quantity: 30, min_qty: 5, cost: 1430, supplier: 'مختبر الشام (دمشق)', notes: 'كلفة مختبر 11$' },
  { name: 'تعويض بورسلين/خزف (مختبر دمشق)', category: 'مختبر', unit: 'سن', quantity: 25, min_qty: 5, cost: 715, supplier: 'مختبر الشام (دمشق)', notes: 'كلفة مختبر 5.5$' },
  { name: 'طقم أسنان كامل (مختبر دمشق)', category: 'مختبر', unit: 'فك', quantity: 8, min_qty: 2, cost: 5850, supplier: 'مختبر الشام (دمشق)', notes: 'كلفة مختبر 45$' },
  { name: 'طقم جزئي (مختبر دمشق)', category: 'مختبر', unit: 'فك', quantity: 8, min_qty: 2, cost: 5200, supplier: 'مختبر الشام (دمشق)', notes: 'كلفة مختبر 40$' },
  { name: 'قلب ووتد + دعامة (مختبر دمشق)', category: 'مختبر', unit: 'سن', quantity: 20, min_qty: 4, cost: 390, supplier: 'مختبر الشام (دمشق)', notes: 'كلفة مختبر 3$' },
  { name: 'فينير إيماكس (مختبر دمشق)', category: 'مختبر', unit: 'سن', quantity: 12, min_qty: 3, cost: 2210, supplier: 'مختبر الشام (دمشق)', notes: 'كلفة مختبر 17$' },
  { name: 'تعويض فوق زرعة خزف (مختبر دمشق)', category: 'زراعة', unit: 'سن', quantity: 15, min_qty: 3, cost: 1040, supplier: 'مختبر الشام (دمشق)', notes: 'كلفة مختبر 8$' },
  { name: 'تعويض فوق زرعة زيركون (مختبر دمشق)', category: 'زراعة', unit: 'سن', quantity: 15, min_qty: 3, cost: 1950, supplier: 'مختبر الشام (دمشق)', notes: 'كلفة مختبر 15$' },
  { name: 'غرسة زراعية (مختبر دمشق)', category: 'زراعة', unit: 'غرسة', quantity: 10, min_qty: 2, cost: 26000, supplier: 'مختبر الشام (دمشق)', notes: 'الغرسة الجراحية فقط 200$' },
  { name: 'صفائح تبييض منزلية (مختبر دمشق)', category: 'تجميل', unit: 'علبة', quantity: 15, min_qty: 3, cost: 650, supplier: 'مختبر الشام (دمشق)', notes: 'كلفة مختبر 5$' },
  // وقاية وجراحة
  { name: 'سيلانت وقائي (سد وعر)', category: 'وقاية', unit: 'جرعة', quantity: 40, min_qty: 10, cost: 40, supplier: 'هجين (محلي)', notes: '' },
  { name: 'فلورايد وقائي (جرعة)', category: 'وقاية', unit: 'جرعة', quantity: 30, min_qty: 8, cost: 30, supplier: 'هجين (محلي)', notes: '' },
  { name: 'معجون تلميع وقائي (جرعة)', category: 'وقاية', unit: 'جرعة', quantity: 40, min_qty: 10, cost: 30, supplier: 'هجين (محلي)', notes: '' },
  { name: 'خيط خياطة جراحي', category: 'جراحة', unit: 'حبة', quantity: 20, min_qty: 5, cost: 30, supplier: 'هجين (محلي)', notes: '' },
  { name: 'تاج مؤقت (كلاون)', category: 'تعويضات', unit: 'سن', quantity: 30, min_qty: 8, cost: 200, supplier: 'هجين (محلي)', notes: '' },
  { name: 'أسمنت تثبيت دائم (جرعة)', category: 'تعويضات', unit: 'جرعة', quantity: 100, min_qty: 20, cost: 20, supplier: 'هجين (محلي)', notes: 'تثبيت التيجان والتركيبات' },
  { name: 'مادة طبعة سيلاكون (جرعة)', category: 'تعويضات', unit: 'جرعة', quantity: 40, min_qty: 10, cost: 60, supplier: 'دمشق', notes: 'لطبعة التيجان والتركيبات' }
]

export const SEED_CATALOG: SeedCatalog[] = [
  {
    name: 'فحص وتشخيص',
    price: 900,
    description: 'فحص سريري وتشخيص ووضع خطة علاج — أجر طبيب دمشق (~7$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 1 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 1 }
    ]
  },
  {
    name: 'تنظيف وتلميع الأسنان',
    price: 1500,
    description: 'إزالة الجير والتلميع — سعر هجين المحلي 150,000 ل.س (~11$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 2 },
      { material: 'معجون تلميع وقائي (جرعة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'حشو كومبوزيت سطح واحد',
    price: 2500,
    description: 'حشوة تجميلية بلون السن — سطح واحد — أجر دمشق (~19$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 1 },
      { material: 'حشوة كومبوزيت (جرعة)', qty: 1 },
      { material: 'بوند وحمض إتش (جرعة)', qty: 1 },
      { material: 'بنج موضعي (كاربولة)', qty: 1 },
      { material: 'إبرة تخدير', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'حشو كومبوزيت متعدد الأسطح',
    price: 3250,
    description: 'حشوة تجميلية بلون السن — سطحان أو أكثر (~25$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 1 },
      { material: 'حشوة كومبوزيت (جرعة)', qty: 1.5 },
      { material: 'بوند وحمض إتش (جرعة)', qty: 1 },
      { material: 'بنج موضعي (كاربولة)', qty: 1 },
      { material: 'إبرة تخدير', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'حشوة زجاجية GIC',
    price: 1500,
    description: 'حشوة زجاجية للأطفال والبالغين (~12$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 1 },
      { material: 'حشوة زجاجية GIC (جرعة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'حشوة مؤقتة',
    price: 500,
    description: 'حشوة مؤقتة (~4$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 1 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'حشوة مؤقتة (جرعة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 1 }
    ]
  },
  {
    name: 'لب نشل (Pulpotomy)',
    price: 3250,
    description: 'علاج لب الأطفال: تخدير وآزالة اللب وحشوة زجاجية (~25$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 1 },
      { material: 'بنج موضعي (كاربولة)', qty: 1 },
      { material: 'إبرة تخدير', qty: 1 },
      { material: 'حشوة زجاجية GIC (جرعة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'علاج جذور سن أمامي',
    price: 4000,
    description: 'معالجة قنوات الجذر لسن أمامي (~30$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 3 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 2 },
      { material: 'بنج موضعي (كاربولة)', qty: 2 },
      { material: 'إبرة تخدير', qty: 2 },
      { material: 'ملف روتاري لعصب (حبة)', qty: 2 },
      { material: 'جوتا بيركا + سيلر + نقاط ورق (حالة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 3 }
    ]
  },
  {
    name: 'علاج جذور سن سفلي',
    price: 6000,
    description: 'معالجة قنوات الجذر لسن سفلي (ضاحك/رحى) — سعر هجين 600,000 ل.س (46$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 3 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 2 },
      { material: 'بنج موضعي (كاربولة)', qty: 2 },
      { material: 'إبرة تخدير', qty: 2 },
      { material: 'ملف روتاري لعصب (حبة)', qty: 3 },
      { material: 'جوتا بيركا + سيلر + نقاط ورق (حالة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 3 }
    ]
  },
  {
    name: 'علاج جذور سن علوي',
    price: 7000,
    description: 'معالجة قنوات الجذر لسن علوي — سعر هجين 700,000 ل.س (54$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 3 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 2 },
      { material: 'بنج موضعي (كاربولة)', qty: 2 },
      { material: 'إبرة تخدير', qty: 2 },
      { material: 'ملف روتاري لعصب (حبة)', qty: 3 },
      { material: 'جوتا بيركا + سيلر + نقاط ورق (حالة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 3 }
    ]
  },
  {
    name: 'خلع سن بسيط',
    price: 2500,
    description: 'خلع بسيط بدون جراحة — سعر هجين 250,000 ل.س (19$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 1 },
      { material: 'بنج موضعي (كاربولة)', qty: 1 },
      { material: 'إبرة تخدير', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'خلع جراحي',
    price: 5000,
    description: 'خلع جراحي لسن مدفون أو مكسور — سعر دمشق (38$)',
    materials: [
      { material: 'قفاز فحص نترايل (زوج)', qty: 3 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 2 },
      { material: 'بنج موضعي (كاربولة)', qty: 2 },
      { material: 'إبرة تخدير', qty: 2 },
      { material: 'قطن وشاش معقم', qty: 4 },
      { material: 'خيط خياطة جراحي', qty: 1 }
    ]
  },
  {
    name: 'تاج زيركون',
    price: 4300,
    description: 'تاج خزفي زيركون — كلفة المختبر ×3 (~33$/سن)',
    materials: [
      { material: 'تعويض زيركون (مختبر دمشق)', qty: 1 },
      { material: 'تاج مؤقت (كلاون)', qty: 1 },
      { material: 'أسمنت تثبيت دائم (جرعة)', qty: 1 },
      { material: 'مادة طبعة سيلاكون (جرعة)', qty: 1 },
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'تاج بورسلين (خزف)',
    price: 2150,
    description: 'تاج بورسلين خزفي — كلفة المختبر ×3 (16.5$/سن)',
    materials: [
      { material: 'تعويض بورسلين/خزف (مختبر دمشق)', qty: 1 },
      { material: 'تاج مؤقت (كلاون)', qty: 1 },
      { material: 'مادة طبعة سيلاكون (جرعة)', qty: 1 },
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'جسر / وحدة',
    price: 4300,
    description: 'جسر سنّي — السعر لكل وحدة — كلفة المختبر ×3',
    materials: [
      { material: 'تعويض زيركون (مختبر دمشق)', qty: 1 },
      { material: 'مادة طبعة سيلاكون (جرعة)', qty: 1 },
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'طقم أسنان كامل (فك)',
    price: 17550,
    description: 'طقم كامل لفك واحد — كلفة المختبر 45$ ×3 (135$) يبدأ من',
    materials: [
      { material: 'طقم أسنان كامل (مختبر دمشق)', qty: 1 },
      { material: 'مادة طبعة سيلاكون (جرعة)', qty: 1 },
      { material: 'قفاز فحص نترايل (زوج)', qty: 2 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 2 }
    ]
  },
  {
    name: 'زراعة سنية (الغرسة الجراحية)',
    price: 26000,
    description: 'الغرسة الجراحية فقط (200$). الدعامة والتلبيسة تُسعَّران منفصلة — يُفضّل عرض «باقة زرعة كاملة» بعد الفحص والصور',
    materials: [
      { material: 'غرسة زراعية (مختبر دمشق)', qty: 1 },
      { material: 'قفاز فحص نترايل (زوج)', qty: 3 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'شفاطة بلع (Suction)', qty: 2 },
      { material: 'بنج موضعي (كاربولة)', qty: 2 },
      { material: 'إبرة تخدير', qty: 2 },
      { material: 'قطن وشاش معقم', qty: 4 },
      { material: 'خيط خياطة جراحي', qty: 1 }
    ]
  },
  {
    name: 'سد وعر وقائي (سيلانت)',
    price: 800,
    description: 'سد شقوق وقائي للأسنان الدائمة — أطفال (6$)',
    materials: [
      { material: 'سيلانت وقائي (سد وعر)', qty: 1 },
      { material: 'قفاز فحص نترايل (زوج)', qty: 1 },
      { material: 'قناع وجهي (كمامة)', qty: 1 },
      { material: 'قطن وشاش معقم', qty: 1 }
    ]
  }
]

export const OLD_SEED_MATERIAL_NAMES: string[] = [
  'حشوة تجميلية (كومبوزيت)',
  'حشوة خلفية (أملغم)',
  'مخدر موضعي 2%',
  'إبرة تخدير',
  'قفاز جراحي (زوج)',
  'كمامة تنفسية',
  'قطن/شاش معقم',
  'خيط جفت (بليكاملي 000)',
  'خيط خياطة جراحي',
  'تاج مؤقت (كلاون)',
  'أسمنت مؤقت (تمبوند)',
  'مادة طبعة سيلاكون',
  'حشوة قنوات (جوتا-بوركا)',
  'معجون تلميع وقائي',
  'جل تبييض الأسنان',
  'فلورايد (جل/معجون)',
  'مطهر فموي (كلورهيكسيدين)',
  'أقراص تعقيم (سايدكس)',
  'سن اصطناعي زيركون',
  'سن اصطناعي معدني (كوبالت-كروم)'
]

export const OLD_SEED_CATALOG_NAMES: string[] = [
  'فحص واستشارة',
  'تنظيف وتلميع الأسنان',
  'إزالة الكلس بالموجات',
  'حماية الأسنان بالفلورايد',
  'حشوة تجميلية (سطح واحد)',
  'حشوة تجميلية (سطحان)',
  'حشوة تجميلية (ثلاثة أسطح)',
  'حشوة خلفية (أملغم)',
  'خلع سن (بسيط)',
  'خلع سن (جراحي)',
  'علاج عصب (سن أمامي)',
  'علاج عصب (سن خلفي)',
  'تلبيسة زيركون (سن)',
  'تلبيسة معدنية (كوبالت-كروم)',
  'جسر زيركون (3 وحدات)',
  'تبييض الأسنان'
]

// بيانات خطة استعادة رأس المال (دراسة الجدوى v2 — السيناريو المحافظ)
// القيم بالليرة الجديدة (÷100). رأس المال = 104,000,000 ل.س = 1,040,000
export const FEASIBILITY = {
  capital: 1040000,
  capexCash: 511810,
  workingCapital: 528190,
  fixedCostsMonthly: 214500,
  materialCostPct: 0.3,
  workDays: 22,
  usdRate: 130,
  scenarios: {
    المحافظ: { label: 'محافظ (50%)', ratios: [0.15, 0.3, 0.35, 0.45, 0.5, 0.5], recoveryMonth: 7 },
    الأساسي: { label: 'أساسي (85%)', ratios: [0.26, 0.51, 0.6, 0.77, 0.85, 0.85], recoveryMonth: 6 },
    بدونزرعات: { label: 'بدون زرعات (50%)', ratios: [0.15, 0.3, 0.35, 0.45, 0.5, 0.5], recoveryMonth: 11 }
  }
} as const