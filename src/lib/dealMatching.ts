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
  score: number
  orderNumberMatch: boolean
  identityMatch: boolean    // שם/זהות המשלם — סימן חזק (ראו matchDeals)
  siteOnlyMatch: boolean    // כתובת/יישוב מול site בלבד — סימן חלש, לא מספיק לביטחון
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

      // זהות המשלם (סימן חזק): שם/כינוי בטופס מול שם הלקוח או איש הקשר של ה-deal,
      // וגם כתובת מול שם הלקוח — כי כשה-deal של יישוב/קיבוץ עצמו, customer_name
      // *הוא* שם היישוב (המשלם הוא היישוב עצמו). זה סימן ספציפי למשלם, לא רק למקום.
      const identityMatch =
        textOverlap(sheet.projectName, deal.customer_name) ||
        textOverlap(sheet.projectName, deal.raw_data?.contact) ||
        textOverlap(sheet.customerName, deal.customer_name) ||
        textOverlap(sheet.customerName, deal.raw_data?.contact) ||
        textOverlap(sheet.address, deal.customer_name)

      // כתובת/יישוב מול site *בלבד* — סימן חלש בכוונה: site הוא תיאור מיקום
      // עבודה, לא זהות משלם. באותו יישוב יכולות להתקיים כמה הזמנות שונות עם
      // משלמים שונים (הקיבוץ עצמו + כמה משפחות פרטיות בנפרד) — חפיפת site
      // לא מבחינה ביניהן, ולכן לא נחשבת ל"חזק" גם בשילוב עם מספר הזמנה תואם.
      const siteOnlyMatch = !identityMatch && textOverlap(sheet.address, deal.raw_data?.site)

      const reasons: string[] = []
      if (orderNumberMatch) reasons.push(`מספר הזמנה מנורמל תואם (${sheetOrder!.serial}/${sheetOrder!.year})`)
      if (identityMatch) reasons.push('שם/זהות משלם חופפים')
      if (siteOnlyMatch) reasons.push('כתובת/יישוב חופפים מול site בלבד (סימן חלש — לא מספיק לביטחון)')

      const score = (orderNumberMatch ? 0.7 : 0) + (identityMatch ? 0.3 : 0) + (siteOnlyMatch ? 0.15 : 0)
      return { deal, score, orderNumberMatch, identityMatch, siteOnlyMatch, reasons }
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
}

export type MatchDecision = 'confident' | 'ambiguous' | 'none'

// כתיבה אוטומטית מותרת רק כש-candidate יחיד תואם מספר הזמנה מנורמל + זהות
// משלם (identityMatch) גם יחד. חפיפת כתובת/יישוב מול site בלבד (siteOnlyMatch)
// לעולם לא מקדמת ל-'confident' — גם בשילוב עם מספר הזמנה תואם — כי שם יישוב
// משותף לכמה הזמנות/משלמים שונים ואינו סימן ייחודי מספיק. כל מקרה אחר —
// 0 מועמדים, כמה מועמדים, או מועמד יחיד עם רק siteOnlyMatch — 'ambiguous':
// לא כותבים, לא מנחשים.
export function decide(candidates: MatchCandidate[]): MatchDecision {
  if (candidates.length === 0) return 'none'
  const strong = candidates.filter(c => c.orderNumberMatch && c.identityMatch)
  return strong.length === 1 ? 'confident' : 'ambiguous'
}
