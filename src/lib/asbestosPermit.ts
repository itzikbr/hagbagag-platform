// ── סוגי היתר אסבסט + סיווג מוצע לכל מבנה ────────────────────────
// מודול משותף: NewExecutionSheet מחזיק את מודל הנתונים (AsbestosBuilding
// ב-work_content), ו-/mirchakim הוא המסך שעורך אותו. הלוגיקה כאן כדי
// ששניהם יסווגו זהה, ושלא ייווצרו שתי גרסאות של הכללים הרגולטוריים.
//
// עיקרון: הסיווג הוא *הצעה* להארת עין בלבד. הקביעה בפועל היא שדה
// permit_type היחיד ברמת ההגשה כולה (progress.asbestos_permit).

export type PermitTypeKey = 'regular' | 'limited' | 'lowrisk' | 'kind' | 'incident'

export interface PermitTypeDef {
  key: PermitTypeKey
  label: string
  /** טרם הוגדר — נבחר ונשמר כפי שהוא, אך מתנהג לוגית כמו "היתר רגיל" */
  undefinedYet?: boolean
}

export const PERMIT_TYPES: PermitTypeDef[] = [
  { key: 'regular',  label: 'היתר רגיל' },
  { key: 'limited',  label: 'עבודה מצומצמת' },
  { key: 'lowrisk',  label: 'עבודה בסיכון נמוך' },
  { key: 'kind',     label: 'היתר סוג', undefinedYet: true },
  { key: 'incident', label: 'היתר לתקרית (דחוף)', undefinedYet: true },
]

export const DEFAULT_PERMIT_TYPE: PermitTypeKey = 'regular'

export function permitDef(key: string | undefined | null): PermitTypeDef {
  return PERMIT_TYPES.find(p => p.key === key) ?? PERMIT_TYPES[0]
}

/** מה שקובע לוגית: שני הסוגים שטרם הוגדרו מתנהגים כמו "היתר רגיל". */
export function effectivePermit(key: string | undefined | null): PermitTypeKey {
  const d = permitDef(key)
  return d.undefinedYet ? 'regular' : d.key
}

/** תיבת התזמון מתחת לבחירה. */
export function permitTiming(key: string | undefined | null): string {
  return effectivePermit(key) === 'regular'
    ? 'לאחר אישור — כ-6 חודשים לביצוע (בכפוף להתראה מראש בפועל)'
    : 'תאריך ביצוע מדויק חובה בעת ההגשה'
}

// ── תוכן "ℹ️ מה כולל הסוג הזה?" — טקסט מאושר, לא לנסח מחדש ────────
export interface PermitInfo { title: string; items: string[]; note?: string }

export const PERMIT_INFO: Record<PermitTypeKey, PermitInfo> = {
  limited: {
    title: 'עבודה מצומצמת — שלושת תתי-המקרים (כל אחד עומד בפני עצמו):',
    items: [
      'פינוי מוצר שלם ותקין — עד 700 ק"ג (למשל: מיכל מים)',
      'צנרת אסבסט — עד 10 מ\' אורך',
      'לוחות אסבסט — עד 50 מ"ר',
    ],
  },
  lowrisk: {
    title: 'עבודה בסיכון נמוך — ארבעת תתי-המקרים:',
    items: [
      'מערום — עד 500 מ"ר',
      'פירוק אסבסט (מתחת לתקרה) — עד 100 מ\', בתנאי שיש תקרת ביניים קשיחה, שלמה ותקינה',
      'פירוק לוחות — עד 500 מ"ר, סככה פתוחה או מבנה להריסה',
      'פירוק צנרת — עד 100 מ\' אורך, מבנה להריסה או סככה פתוחה',
    ],
  },
  regular: {
    title: 'היתר רגיל — ברירת מחדל:',
    items: ['כל עבודה שלא נכנסת במדויק לאחת הקטגוריות האחרות.'],
    note: 'חריג "פרויקט צפוני": כל מבנה, גם קטן מ-50 מ"ר, כי הגורם המשלם הוא המדינה.',
  },
  kind: {
    title: 'היתר סוג — ⚠️ טרם הוגדר:',
    items: ['תנאי הסוג טרם הוגדרו במערכת. עד להגדרתם ההיתר מתנהג כמו "היתר רגיל".'],
  },
  incident: {
    title: 'היתר לתקרית (דחוף) — ⚠️ טרם הוגדר:',
    items: ['תנאי הסוג טרם הוגדרו במערכת. עד להגדרתם ההיתר מתנהג כמו "היתר רגיל".'],
  },
}

// ── צורת האסבסט במבנה ────────────────────────────────────────────
// שדה חדש ונפרד מ-structureType (סוג המבנה) ומ-asbestosKind (רגיל/אחר).
// נקרא asbestosForm ולא asbestosType בכוונה: asbestosType הוא שם של שדה
// בסכימה הישנה (נקרא ב-normalizeAsbestos), ושימוש חוזר בו היה גורם
// לדפים ישנים להיקרא עם ערך שגוי בשקט.
export const ASB_FORM_OPTS = ['גג', 'קירות', 'מערום', 'צנרת'] as const
export type AsbestosForm = typeof ASB_FORM_OPTS[number] | ''

/** לוחות אסבסט = גג או קירות (להבדיל ממערום ומצנרת). */
const isPanels = (f: string) => f === 'גג' || f === 'קירות'

/** מספר דגימות מעבדה: מספר 1-10, "אחר" עם טקסט, או null = טרם הוגדר. */
export type LabTests = number | { other: string } | null

export interface ClassifiableBuilding {
  asbestosForm?: string
  roofSize?: string          // שטח במ"ר (נשמר כמחרוזת, כמו שאר הטופס)
  lengthM?: string           // אורך במ'
  weightKg?: string          // משקל בק"ג
  ceiling?: string           // תקרה קשיחה: 'יש' | 'אין' | ''
  demolition?: boolean       // להריסה
  structureType?: string     // מרשימה סגורה; 'סככה פתוחה' רלוונטי לכללים
}

export interface Classification {
  key: PermitTypeKey
  label: string
  /** התבנית שהתאימה — מוצג כהסבר קצר על התג */
  reason: string
  /** שדות שחסרים ולכן תבניות מסוימות לא נבדקו כלל */
  missing: string[]
}

/** המרה סלחנית של מחרוזת למספר; ריק/לא-מספרי → null (ולא 0). */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/,/g, '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** תקרת ביניים קשיחה — ברירת המחדל השמרנית היא "לא". רק 'יש'/'כן' מזכה. */
export const hasHardCeiling = (v: unknown) => v === 'יש' || v === 'כן' || v === true

/**
 * סיווג מוצע לפי התאמה לתבניות המדויקות (לא לפי סף כללי), פר-מבנה.
 * סדר הבדיקה: עבודה מצומצמת → עבודה בסיכון נמוך → היתר רגיל.
 */
export function classifyBuilding(b: ClassifiableBuilding): Classification {
  const form = String(b.asbestosForm ?? '')
  const area = toNum(b.roofSize)
  const len = toNum(b.lengthM)
  const kg = toNum(b.weightKg)
  const ceil = hasHardCeiling(b.ceiling)
  const demo = !!b.demolition
  const openShed = b.structureType === 'סככה פתוחה'

  // ── עבודה מצומצמת ──
  if (kg !== null && kg <= 700) {
    return mk('limited', 'פינוי מוצר שלם ותקין — עד 700 ק"ג', b)
  }
  if (form === 'צנרת' && len !== null && len <= 10) {
    return mk('limited', 'צנרת אסבסט — עד 10 מ\' אורך', b)
  }
  if (isPanels(form) && area !== null && area <= 50) {
    return mk('limited', 'לוחות אסבסט — עד 50 מ"ר', b)
  }

  // ── עבודה בסיכון נמוך ──
  if (form === 'מערום' && area !== null && area <= 500) {
    return mk('lowrisk', 'מערום — עד 500 מ"ר', b)
  }
  if (ceil && len !== null && len <= 100) {
    return mk('lowrisk', 'פירוק מתחת לתקרה — עד 100 מ\', תקרת ביניים קשיחה', b)
  }
  if (isPanels(form) && area !== null && area <= 500 && (openShed || demo)) {
    return mk('lowrisk', `פירוק לוחות — עד 500 מ"ר, ${openShed ? 'סככה פתוחה' : 'מבנה להריסה'}`, b)
  }
  if (form === 'צנרת' && len !== null && len <= 100 && (demo || openShed)) {
    return mk('lowrisk', `פירוק צנרת — עד 100 מ', ${demo ? 'מבנה להריסה' : 'סככה פתוחה'}`, b)
  }

  return mk('regular', 'לא נכנס במדויק לאף קטגוריה אחרת', b)
}

/**
 * אילו שדות חסרים ולכן חסמו בדיקה של תבנית כלשהי. לא משנה את הסיווג —
 * רק מאפשר להציג "מבוסס על נתונים חלקיים" במקום להציג ודאות שאין.
 */
function missingFor(b: ClassifiableBuilding): string[] {
  const form = String(b.asbestosForm ?? '')
  const out: string[] = []
  if (!form) out.push('סוג אסבסט')
  if (toNum(b.weightKg) === null) out.push('משקל (ק"ג)')
  if (toNum(b.lengthM) === null && (form === 'צנרת' || !form || hasHardCeiling(b.ceiling))) out.push('אורך (מ׳)')
  if (toNum(b.roofSize) === null && (isPanels(form) || form === 'מערום' || !form)) out.push('שטח (מ"ר)')
  return out
}

function mk(key: PermitTypeKey, reason: string, b: ClassifiableBuilding): Classification {
  return { key, label: permitDef(key).label, reason, missing: key === 'regular' ? missingFor(b) : [] }
}

/** צבעי התג — ירוק להקלה, כתום לבינוני, אפור לברירת המחדל. */
export function classColors(key: PermitTypeKey): { bg: string; fg: string } {
  if (key === 'limited') return { bg: '#E8F5E9', fg: '#1A5A2A' }
  if (key === 'lowrisk') return { bg: '#FFF4E0', fg: '#8A4B00' }
  return { bg: '#EEF0F3', fg: '#41505E' }
}

/** תצוגת מספר דגימות. */
export function labTestsLabel(v: LabTests): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return String(v)
  return v.other?.trim() ? v.other : 'אחר'
}
