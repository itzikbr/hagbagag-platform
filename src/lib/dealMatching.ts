// התאמת דף ביצוע לרשומת deal — לא רק לפי מספר הזמנה מדויק (כמו הבדיקה הישנה
// ב-NewExecutionSheet.tsx), אלא לפי כמה סימנים עם ציון ביטחון. לא מנחש: כל
// מקרה שאינו התאמה חד-משמעית מסווג 'ambiguous'/'none' והקוד הקורא מחליט מה
// לעשות (לא לכתוב, לסמן לבדיקה ידנית).

export interface SheetMatchInput {
  projectName: string
  address?: string | null
  customerName?: string | null
  rawOrderNumber?: string | null   // buildings.work_content->details->orderNumber, כפי שמוזן בטופס
}

export interface DealRow {
  id: string
  order_number: string
  customer_number: string | null
  customer_name: string | null
  raw_data: { site?: string; contact?: string } | null
}

export interface MatchCandidate {
  deal: DealRow
  score: number   // 0, 0.3, 0.7 או 1 — ראו matchDeals
  orderNumberMatch: boolean
  nameOrAddressMatch: boolean
  reasons: string[]
}

// "SO<YY><serial>" (פריוריטי) ↔ "<serial>/<YY>" (הטופס) → זוג (year, serial)
// מנורמל להשוואה. מחזיר null אם הפורמט לא מזוהה בכלל — לא מנחש.
export function normalizeOrderNumber(raw: string | null | undefined): { year: number; serial: number } | null {
  if (!raw) return null
  const s = raw.trim()
  const so = s.match(/^SO(\d{2})0*(\d+)$/i)
  if (so) return { year: Number(so[1]), serial: Number(so[2]) }
  const slash = s.match(/^(\d+)\s*\/\s*(\d{2})$/)
  if (slash) return { serial: Number(slash[1]), year: Number(slash[2]) }
  return null
}

function normText(s?: string | null): string {
  return (s ?? '').trim().toLowerCase().replace(/["'׳״]/g, '')
}

// substring דו-כיווני ("גל" בתוך "גל אולמן", "כברי" בתוך "קיבוץ כברי") —
// לא equality מדויק, כי שמות בטופס הם קיצור/כינוי ולא תמיד השם המלא מה-ERP.
function textOverlap(a?: string | null, b?: string | null): boolean {
  const na = normText(a), nb = normText(b)
  if (!na || !nb) return false
  return na.includes(nb) || nb.includes(na)
}

export function matchDeals(sheet: SheetMatchInput, deals: DealRow[]): MatchCandidate[] {
  const sheetOrder = normalizeOrderNumber(sheet.rawOrderNumber)
  return deals
    .map(deal => {
      const dealOrder = normalizeOrderNumber(deal.order_number)
      const orderNumberMatch = !!sheetOrder && !!dealOrder &&
        sheetOrder.year === dealOrder.year && sheetOrder.serial === dealOrder.serial

      const nameOrAddressMatch =
        textOverlap(sheet.projectName, deal.customer_name) ||
        textOverlap(sheet.projectName, deal.raw_data?.contact) ||
        textOverlap(sheet.customerName, deal.customer_name) ||
        textOverlap(sheet.address, deal.raw_data?.site) ||
        textOverlap(sheet.address, deal.customer_name)

      const reasons: string[] = []
      if (orderNumberMatch) reasons.push(`מספר הזמנה מנורמל תואם (${sheetOrder!.serial}/${sheetOrder!.year})`)
      if (nameOrAddressMatch) reasons.push('שם/כתובת חופפים')

      // מספר הזמנה = סימן חזק (0.7), שם/כתובת = סימן משני (0.3) — משלימים זה את זה.
      const score = (orderNumberMatch ? 0.7 : 0) + (nameOrAddressMatch ? 0.3 : 0)
      return { deal, score, orderNumberMatch, nameOrAddressMatch, reasons }
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
}

export type MatchDecision = 'confident' | 'ambiguous' | 'none'

// כתיבה אוטומטית מותרת רק כש-candidate יחיד תואם בשני הסימנים גם יחד
// (מספר הזמנה מנורמל + שם/כתובת). כל מקרה אחר — 0 מועמדים, כמה מועמדים,
// או מועמד יחיד עם סימן אחד בלבד — 'ambiguous': לא כותבים, לא מנחשים.
export function decide(candidates: MatchCandidate[]): MatchDecision {
  if (candidates.length === 0) return 'none'
  const strong = candidates.filter(c => c.orderNumberMatch && c.nameOrAddressMatch)
  return strong.length === 1 ? 'confident' : 'ambiguous'
}
