import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { queryWithRetry } from '../lib/dbRetry'
import { useAuth, useIsAdmin } from '../hooks/useAuth'
import MaterialsTab, { type SmartMaterials, emptySmartMaterials, normalizeSmartMaterials } from './MaterialsTab'

// ══════════════════════════════════════════════════════════════
// חג בגג — דף ביצוע v3 · טופס 3 לשוניות
// ══════════════════════════════════════════════════════════════
const RED = '#CC0000'
const GREY = '#8696A0'
const BG = '#F2EDE9'
const BORDER = '#E5E0DB'
const AUTOSAVE_MS = 2000

// ── רשימות בחירה ───────────────────────────────────────────────
const FILLERS = ['עמאד', 'סמיר', 'עלי', 'אסף', 'דליה', 'מוטי', 'איציק', 'סים', 'אוריה', 'קלוד']
const ROOF_TYPES = ['חד שיפועי', 'דו שיפועי', 'רב שיפועי', 'אחר']
const CONSTRUCTIONS = ['עץ', 'מתכת', 'אחר']
const GENERAL_CHIPS = ['דוד שמש', 'קולטים', 'פאנלים סולריים', 'מזגנים', 'ארובה', 'פטרית איזור', 'חלון תאורה', 'אנטנות', 'אחר']
const CRANE_OPTS = ['לא נדרש', 'קצר', 'ארוך', 'אחר']
const CONTAINER_OPTS = ['לא נדרש', '10m³', '20m³', '30m³']
const LIFT_OPTS = ['לא נדרש', 'דיזל', 'חשמלית']
const ARM_OPTS = ['לא נדרש', 'מספריים', 'זרוע']
const ACCESS_OPTS = ['קלה', 'מוגבלת', 'קשה', 'ללא גישה']
const LOGISTICS_CHIPS = ['פנויה', 'עצים', 'חשמל', 'דרך צרה', 'אחר']
const ALUM_SHADES = ['חום', 'פולי סנדר', 'מהגוני', 'לבן', 'קרם', 'אפור', 'ירוק', 'אחר']
const GUTTER_TYPES = ['חיצוני', 'פנימי', 'חיצוני ופנימי', 'אחר']
const ROOF_HEIGHT_OPTS = ['נמוך עד 3מ׳', 'בינוני 3-6מ׳', 'גבוה 6מ׳+']
const EXISTING_ROOF_OPTS = ['איסכורית', 'אסבסט', 'רעפים', 'פנלים', 'שינגלס', 'אחר']
const NEW_ROOF_OPTS = ['איסכורית', 'פנל מבודד', 'רעפים', 'שינגלס', 'אחר']
const SHEET_THICKNESS_OPTS = ['0.4', '0.5', '0.55', '0.6', '0.75']
const FILL_TYPE_OPTS = ['פוליסטירן', 'צמר סלעים', 'פוליסטירן מחוזק', 'אחר']
const TILE_TYPE_OPTS = ['חרס', 'אקרשטיין', 'אחר']
const ROOF_COLOR_OPTS = ['לבן', 'שנהב', 'אדום רעפים', 'חום', 'אפור בהיר', 'אפור כהה', 'ירוק', 'כחול', 'גלוון', 'אחר']
const INSULATION_TYPE_OPTS = ['רדיד אלומיניום', 'צמר סלעים', 'צמר זכוכית', 'אחר']
const INSULATION_THICKNESS_OPTS = ['5 סמ', '8 סמ', '10 סמ', '12 סמ', 'אחר']

// ── רשימות "סוג" בלשונית חומרים ────────────────────────────────
const ROOFING_MAT_OPTS  = ['איסכורית', 'פנל מבודד', 'רעפים', 'אחר']
const FLASHING_MAT_OPTS  = ['רוכב', 'סוגר חזית', 'סוגר צד', 'כובע', 'פלשונג עליון פתוח', 'פלשונג צד 90°', 'אחר']
const GUTTER_MAT_OPTS    = ['פנימי', 'חיצוני', 'ירידות מרזב', 'אחר']
const ALUM_MAT_OPTS      = ['4 לוחות', '3 לוחות', '2 לוחות', 'פח פרוס', 'יו', 'אחר']
const WOOD_MAT_OPTS      = ['לטות', '5×5', '5×10', '5×15', 'אחר']
const MAT_TYPE_OPTS: Record<string, string[]> = {
  flashing: FLASHING_MAT_OPTS, gutters: GUTTER_MAT_OPTS, aluminum: ALUM_MAT_OPTS, wood: WOOD_MAT_OPTS,
}
const RIDER_TYPE_OPTS   = ['שטוח', 'טרפזי']          // "רוכב" בפחחות → סוג רוכב

// ── החלפת אסבסט (בלוק רב-מבנים) ────────────────────────────────
const ASB_RED = '#c0392b'
const ASB_STRUCTURE_OPTS    = ['סככה פתוחה', 'סככה סגורה', 'מגורים', 'מחסן', 'אחר']
const ASB_CONSTRUCTION_OPTS = ['בטון', 'מתכת', 'עץ', 'אחר']
const ASB_CEILING_TYPE_OPTS = ['בטון', 'רביץ', 'גבס', 'צפה', 'אחר']
const ASB_SUB_OPTS          = ['קנלטות', 'מוקצף', 'אחר']
const ASB_CONS_STATE_OPTS   = ['תקינה', 'חלשה']
const ASB_YESNO             = ['אין', 'יש']
const ASB_INFRA_OPTS        = ['קיימת', 'חדשה']
const ASB_KIND_OPTS         = ['רגיל', 'אחר']
const ASB_NEWROOF_OPTS      = ['ללא', 'איסכורית', 'פנל מבודד', 'אחר']

// ── לשונית התקדמות ─────────────────────────────────────────────
const PERMIT_SUPERVISORS = ['עמאד', 'סמיר', 'עלי', 'אסף', 'איציק']
const ROOFING_SUPPLIERS = ['הגן הנדסה', 'אופק', 'פוליפח', 'א.ד פלדות', 'מבנה דרום', 'אחר']
const ALL_SUPPLIERS = ['הגן הנדסה', 'אופק', 'פוליפח', 'א.ד פלדות', 'מבנה דרום', 'אחים שחם', 'כראדי', 'פסקל', 'מטלום', 'עץ ועצה', 'אלי לבן', 'נוימן', 'אחר']
const TEAM_LEADS = ['עמאד', 'סמיר', 'עלי']
const SUBCONTRACTORS = ['זכי', 'מאלק', 'חאזם', 'וויסאם', 'מחמוד', 'האני', 'גל', 'אחר']

// ── טאב עסקה (deals) — שכבה ניהולית/כספית ──────────────────────
// שמות 7 שלבי העסקה (stage 1-7 ב-DB). index 0 = שלב 1.
const DEAL_STAGES = ['טיוטא', 'מאושרת זמני', 'מאושרת לביצוע', 'בביצוע', 'בוצעה', 'מוסדי לגביה', 'סגורה']
// רשומת deal — מקביל 1:1 לעמודות טבלת deals (מפתח order_number, קשר 1-לרבים לדפי ביצוע)
interface DealRow {
  id: string
  order_number: string
  customer_name: string | null
  total_price: number | null
  price_before_vat: number | null
  materials_cost: number | null; labor_cost: number | null; logistics_cost: number | null
  materials_pct: number | null; labor_pct: number | null; logistics_pct: number | null
  stage: number
  stage_updated_at: string | null; stage_updated_by: string | null
  paid_amount: number | null; balance_due: number | null; balance_note: string | null
  updated_at: string
}
// ₪ עם מפריד אלפים; null/לא-מספר → מוחזר ריק (הקורא מחליט אם להסתיר שורה)
function ils(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return ''
  return '₪' + Number(n).toLocaleString('he-IL')
}
function fmtDateTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

interface WorkTypeMeta { key: string; label: string }
const WORK_TYPES: WorkTypeMeta[] = [
  { key: 'asbestos',    label: '🟠 החלפת אסבסט' },
  { key: 'roofReplace', label: '🏠 החלפת גג' },
  { key: 'aluminum',    label: '🔩 ציפוי אלומיניום' },
  { key: 'gutters',     label: '🌧️ מרזבים' },
  { key: 'insulation',  label: '🧊 בידוד' },
  { key: 'other',       label: '📝 אחר' },
]
const WORK_TYPE_LABEL: Record<string, string> = Object.fromEntries(WORK_TYPES.map(w => [w.key, w.label]))

// ── מטא־דאטה קטגוריות חומרים ───────────────────────────────────
interface CatMeta { label: string; color: string; head: string; hasShade: boolean; roofSub: boolean; unit: string }
const CATEGORY_META: Record<string, CatMeta> = {
  aluminum:   { label: 'חיפוי אלומיניום', color: '#1A5FAD', head: '#EBF2FC', hasShade: true,  roofSub: false, unit: 'מ׳' },
  flashing:   { label: 'פחחות',           color: '#B8540A', head: '#FDF0E8', hasShade: false, roofSub: false, unit: 'מ"א' },
  roofing:    { label: 'קירוי',           color: '#1A7A3A', head: '#E8F5EC', hasShade: false, roofSub: true,  unit: 'מ"א' },
  wood:       { label: 'עץ',              color: '#7A4F1A', head: '#F5EFE6', hasShade: false, roofSub: false, unit: 'מ"א' },
  gutters:    { label: 'מרזבים',          color: '#2C6B8A', head: '#E8F2F5', hasShade: false, roofSub: false, unit: 'מ׳' },
  insulation: { label: 'בידוד',           color: '#7A4CA0', head: '#F0EBF5', hasShade: false, roofSub: false, unit: 'מ"ר' },
}
const CATEGORY_ORDER = ['aluminum', 'roofing', 'flashing', 'wood', 'gutters', 'insulation']

// ══════════════════════════════════════════════════════════════
// טיפוסים (TypeScript interfaces לכל ה-state)
// ══════════════════════════════════════════════════════════════
interface DetailsTab {
  date: string
  fillerName: string
  orderNumber: string
  customerName: string
  address: string
  phones: string[]
  solarPrep: boolean
}
interface GeneralProps {
  roofHeight: string
  area: string
  roofType: string
  construction: string
  chips: string[]
}
interface Logistics {
  crane: string
  container: string
  lift: string
  arm: string
  access: string
  workHeight: string
  chips: string[]
}
// כרטיס מבנה בודד בבלוק החלפת אסבסט (buildings[] מאוחסן ב-work_content jsonb)
interface AsbestosBuilding {
  coordX: string; coordY: string
  roofSize: string                                     // גודל גג (מ"ר)
  structureType: string; structureTypeOther: string    // סוג מבנה
  construction: string; constructionOther: string      // קונסטרוקציה
  height: string                                       // גובה (מ')
  grandpaStick: string                                 // מקל סבא: אין/יש
  consState: string                                    // מצב קונס': תקינה/חלשה
  ceiling: string                                      // תקרה קשיחה: אין/יש
  ceilingType: string; ceilingTypeOther: string        // סוג תקרה (רק כש-יש)
  infra: string                                        // תשתית: קיימת/חדשה
  asbestosKind: string                                 // סוג אסבסט: רגיל/אחר
  asbestosSub: string; asbestosSubOther: string        // סוג (רק כש-אחר)
  newRoof: string; newRoofNote: string                 // קירוי חדש + פירוט
  note: string; noteOpen: boolean                      // הערה למבנה
}
interface AsbestosBlock {
  buildings: AsbestosBuilding[]
  generalNote: string; generalNoteOpen: boolean        // הערה כללית לפרויקט
  sensitive: string; sensitiveOpen: boolean            // מבנים רגישים
}
interface RoofReplaceBlock {
  existingRoof: string; newRoof: string
  construction: string; slope: string
  overhang: string; overhangNote: string
  sheetThickness: string                         // איסכורית: עובי פח
  color: string                                  // איסכורית / פנל מבודד: צבע
  topThickness: string; bottomThickness: string  // פנל מבודד
  fillType: string                               // פנל מבודד: סוג מילוי
  tileType: string                               // רעפים: סוג רעף
  supplier: string                               // ספק חומר הקירוי — עצמאי, לא תלוי בתאריך הספקים הגלובלי
  orderDate: string                              // תאריך הזמנת חומר הקירוי — עצמאי
}
interface AluminumBlock { shade: string; meters: string; coating: string[] }
interface GuttersBlock {
  type: string; guttersM: string; guttersSegments: string
  downUnits: string; downSegments: string
}
interface InsulationBlock { type: string; area: string; thickness: string }
interface OtherBlock { note: string }
interface WorkBlocks {
  asbestos: AsbestosBlock
  roofReplace: RoofReplaceBlock
  aluminum: AluminumBlock
  gutters: GuttersBlock
  insulation: InsulationBlock
  other: OtherBlock
}
interface MaterialRow { type: string; typeOther: string; shade: string; qty: string; measure: string; catalog_number: string; riderType: string; riderAngle: string }
interface MaterialCategory {
  rows: MaterialRow[]; thickness: string; color: string
  // כותרת קירוי (roofing) — "סוג" יחיד לכל הסקשן + שדות תלויי-סוג
  roofingType: string; sheetThickness: string; roofColor: string
  topThickness: string; bottomThickness: string; fillType: string; tileType: string
}
interface MaterialsState { active: string[]; data: Record<string, MaterialCategory> }
interface DocItem { path: string; url: string; name: string; note: string; noteOpen: boolean }
interface Documentation { photos: DocItem[]; sketch: DocItem[]; documents: DocItem[] }

interface AsbestosPermit { submission_date: string; approval_date: string; permit_number: string; supervisor: string }
interface ProgressData {
  asbestos_permit: AsbestosPermit
  suppliers: string[]
  materials_order_date: string
  materials_arrival_date: string
  execution_date: string
  estimated_days: string
  team_lead: string
  subcontractor: string
}

interface SheetForm {
  details: DetailsTab
  general: GeneralProps
  logistics: Logistics
  workTypes: string[]
  blocks: WorkBlocks
  materials: MaterialsState
  smartMaterials: SmartMaterials   // לשונית חומרים חכמה (מבוססת קטלוג DB)
  documentation: Documentation
  progress: ProgressData
  notes: Record<string, string>
  others: Record<string, string>   // טקסט חופשי לכל בחירת "אחר", לפי מפתח יציב
}

// ── ברירות מחדל ────────────────────────────────────────────────
function todayISO(): string { return new Date().toISOString().slice(0, 10) }
function emptyAsbBuilding(): AsbestosBuilding {
  return {
    coordX: '', coordY: '', roofSize: '', structureType: '', structureTypeOther: '',
    construction: '', constructionOther: '', height: '', grandpaStick: '', consState: '',
    ceiling: '', ceilingType: '', ceilingTypeOther: '', infra: '', asbestosKind: '', asbestosSub: '', asbestosSubOther: '',
    newRoof: '', newRoofNote: '', note: '', noteOpen: false,
  }
}
function emptyAsbestos(): AsbestosBlock {
  return { buildings: [emptyAsbBuilding()], generalNote: '', generalNoteOpen: false, sensitive: '', sensitiveOpen: false }
}
// המרת נתוני אסבסט מ-DB לצורת הבלוק הרב-מבנים (כולל הגירת מבנה ישן בעל שדה בודד)
function normalizeAsbestos(raw: unknown): AsbestosBlock {
  if (!raw || typeof raw !== 'object') return emptyAsbestos()
  const r = raw as Record<string, unknown>
  if (Array.isArray(r.buildings)) {
    const buildings = (r.buildings as unknown[]).map(b => ({ ...emptyAsbBuilding(), ...(b as object), noteOpen: !!(b as AsbestosBuilding).note }))
    return {
      buildings: buildings.length ? buildings : [emptyAsbBuilding()],
      generalNote: String(r.generalNote ?? ''), generalNoteOpen: !!r.generalNote,
      sensitive: String(r.sensitive ?? ''), sensitiveOpen: !!r.sensitive,
    }
  }
  // מבנה ישן (הסרת אסבסט — שדות בודדים) → כרטיס מבנה אחד, best-effort
  const has = (v: unknown) => v != null && String(v).trim() !== ''
  if (!has(r.coordX) && !has(r.coordY) && !has(r.usedFor) && !has(r.ceiling) && !has(r.ceilingConstruction) && !has(r.asbestosType)) {
    return { ...emptyAsbestos(), sensitive: String(r.sensitive ?? ''), sensitiveOpen: !!r.sensitive }
  }
  const b = emptyAsbBuilding()
  b.coordX = String(r.coordX ?? ''); b.coordY = String(r.coordY ?? '')
  const usedFor = String(r.usedFor ?? '')
  if (ASB_STRUCTURE_OPTS.includes(usedFor)) b.structureType = usedFor
  else if (usedFor) { b.structureType = 'אחר'; b.structureTypeOther = usedFor }
  const cons = String(r.ceilingConstruction ?? '')
  if (ASB_CONSTRUCTION_OPTS.includes(cons)) b.construction = cons
  else if (cons) { b.construction = 'אחר'; b.constructionOther = cons }
  b.grandpaStick = ASB_YESNO.includes(String(r.grandpaStick)) ? String(r.grandpaStick) : ''
  const ceil = String(r.ceiling ?? '')
  if (ceil === 'אין') b.ceiling = 'אין'
  else if (ceil) { b.ceiling = 'יש'; b.ceilingType = ASB_CEILING_TYPE_OPTS.includes(ceil) ? ceil : (ASB_CEILING_TYPE_OPTS.includes(String(r.ceilingType)) ? String(r.ceilingType) : '') }
  return { buildings: [b], generalNote: '', generalNoteOpen: false, sensitive: String(r.sensitive ?? ''), sensitiveOpen: !!r.sensitive }
}
function emptyBlocks(): WorkBlocks {
  return {
    asbestos:    emptyAsbestos(),
    roofReplace: { existingRoof: '', newRoof: '', construction: '', slope: '', overhang: '', overhangNote: '', sheetThickness: '', color: '', topThickness: '', bottomThickness: '', fillType: '', tileType: '', supplier: '', orderDate: '' },
    aluminum:    { shade: '', meters: '', coating: [] },
    gutters:     { type: '', guttersM: '', guttersSegments: '', downUnits: '', downSegments: '' },
    insulation:  { type: '', area: '', thickness: '' },
    other:       { note: '' },
  }
}
function emptyRow(): MaterialRow { return { type: '', typeOther: '', shade: '', qty: '', measure: '', catalog_number: '', riderType: '', riderAngle: '' } }
function emptyCategory(): MaterialCategory {
  return {
    rows: [emptyRow()], thickness: '', color: '',
    roofingType: '', sheetThickness: '', roofColor: '',
    topThickness: '', bottomThickness: '', fillType: '', tileType: '',
  }
}
function emptyProgress(): ProgressData {
  return {
    asbestos_permit: { submission_date: '', approval_date: '', permit_number: '', supervisor: '' },
    suppliers: ['', '', ''],
    materials_order_date: '', materials_arrival_date: '',
    execution_date: '', estimated_days: '', team_lead: '', subcontractor: '',
  }
}
function emptyForm(): SheetForm {
  return {
    details: { date: todayISO(), fillerName: '', orderNumber: '', customerName: '', address: '', phones: [''], solarPrep: false },
    general: { roofHeight: '', area: '', roofType: '', construction: '', chips: [] },
    logistics: { crane: '', container: '', lift: '', arm: '', access: '', workHeight: '', chips: [] },
    workTypes: [],
    blocks: emptyBlocks(),
    materials: { active: ['flashing'], data: { flashing: emptyCategory() } },
    smartMaterials: emptySmartMaterials(),
    documentation: { photos: [], sketch: [], documents: [] },
    progress: emptyProgress(),
    notes: {},
    others: {},
  }
}
// השלמת שדות חדשים על נתוני חומרים ישנים (catalog_number, typeOther, כותרת קירוי)
function normalizeMaterials(raw: unknown, fallback: MaterialsState): MaterialsState {
  const m = raw as MaterialsState | undefined
  if (!m || !m.active) return fallback
  const data: Record<string, MaterialCategory> = {}
  for (const k of m.active) {
    const c = m.data?.[k] ?? emptyCategory()
    data[k] = { ...emptyCategory(), ...c, rows: (c.rows ?? []).map(r => ({ ...emptyRow(), ...r })) }
  }
  return { active: m.active, data }
}
function daysSince(iso: string): number {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}

function num(s: string): number { const n = parseFloat(s); return isNaN(n) ? 0 : n }
function fmt(n: number): string {
  if (!n) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}
function derivedCategories(workTypes: string[]): string[] {
  const s = new Set<string>(['flashing'])
  if (workTypes.includes('roofReplace')) { s.add('roofing'); s.add('flashing') }
  if (workTypes.includes('aluminum'))    { s.add('aluminum'); s.add('flashing') }
  if (workTypes.includes('gutters'))      s.add('gutters')
  if (workTypes.includes('insulation'))   s.add('insulation')
  return CATEGORY_ORDER.filter(k => s.has(k))
}

// ══════════════════════════════════════════════════════════════
// סגנונות
// ══════════════════════════════════════════════════════════════
const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, boxSizing: 'border-box', border: `1px solid ${BORDER}`,
  borderRadius: 8, padding: '0 10px', fontSize: 13, fontWeight: 600, color: '#111',
  direction: 'rtl', outline: 'none', background: '#fff', fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 3, direction: 'rtl' }
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '48% 52%', gap: 8, marginBottom: 8 }

// ── פקדים בסיסיים ──────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ minWidth: 0 }}><div style={labelStyle}>{label}</div>{children}</div>
}
function TextInput({ value, onChange, placeholder, type = 'text', maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; maxLength?: number
}) {
  return <input dir="rtl" type={type} style={inputStyle} value={value} placeholder={placeholder} maxLength={maxLength}
    inputMode={type === 'number' ? 'decimal' : undefined}
    onChange={e => onChange(e.target.value)} />
}
function SelectBox({ value, onChange, options, placeholder = '— בחר —' }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
  return (
    <select dir="rtl" value={value} onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, color: value ? '#111' : '#555', appearance: 'none', cursor: 'pointer' }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
// שדה טקסט קצר שמופיע כשנבחר "אחר" (מפתח יציב במפת others)
function OtherText({ okey, others, setOther, maxLen = 20 }: {
  okey: string; others: Record<string, string>; setOther: (k: string, v: string) => void; maxLen?: number
}) {
  return (
    <input dir="rtl" maxLength={maxLen} value={others[okey] ?? ''} placeholder="פירוט…"
      onChange={e => setOther(okey, e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
  )
}
// dropdown שמראה אוטומטית שדה טקסט קצר כשנבחר "אחר" — הדפוס הגלובלי בטופס
function SelectOther({ value, onChange, options, okey, others, setOther, placeholder = '— בחר —', maxLen = 20 }: {
  value: string; onChange: (v: string) => void; options: string[]
  okey: string; others: Record<string, string>; setOther: (k: string, v: string) => void
  placeholder?: string; maxLen?: number
}) {
  return (
    <>
      <SelectBox value={value} onChange={onChange} options={options} placeholder={placeholder} />
      {value === 'אחר' && <OtherText okey={okey} others={others} setOther={setOther} maxLen={maxLen} />}
    </>
  )
}
// textarea עם גובה שמתרחב אוטומטית עם התוכן (מתחיל בשורה אחת)
function AutoTextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  }, [value])
  return (
    <textarea ref={ref} dir="rtl" rows={1} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, height: 'auto', minHeight: 36, padding: '8px 10px', resize: 'none', overflow: 'hidden', lineHeight: 1.4 }} />
  )
}
function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea dir="rtl" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
    style={{ ...inputStyle, height: 'auto', minHeight: 60, padding: 10, resize: 'vertical', lineHeight: 1.4 }} />
}
function Chip({ label, active, onClick, tone = 'red' }: { label: string; active: boolean; onClick: () => void; tone?: 'red' | 'orange' }) {
  const on = tone === 'orange' ? { bg: '#FFF0F0', color: '#CC0000', border: '#FFBBBB' } : { bg: '#FFF0F0', color: '#CC0000', border: '#FFBBBB' }
  return (
    <button type="button" onClick={onClick} style={{
      border: active ? `1px solid ${on.border}` : `1px solid ${BORDER}`,
      background: active ? on.bg : '#fff', color: active ? on.color : '#444',
      borderRadius: 16, padding: '6px 12px', fontSize: 12, fontWeight: 700,
      cursor: 'pointer', direction: 'rtl', fontFamily: 'inherit',
    }}>{label}</button>
  )
}
function ChipGroup({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, direction: 'rtl' }}>
      {options.map(o => (
        <Chip key={o} label={o} active={value.includes(o)}
          onClick={() => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o])} />
      ))}
    </div>
  )
}
function YesNoChip({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, direction: 'rtl' }}>
      <Chip label="לא" active={!value} onClick={() => onChange(false)} />
      <Chip label="✓ כן" active={value} onClick={() => onChange(true)} />
    </div>
  )
}

// ── כרטיסייה עם כותרת + כפתור הערה ─────────────────────────────
function Card({ id, title, tone = 'default', notes, setNotes, notesOpen, toggleNote, children }: {
  id?: string; title: string; tone?: 'default' | 'orange' | 'red' | 'blue' | 'green'
  notes?: Record<string, string>; setNotes?: (k: string, v: string) => void
  notesOpen?: Set<string>; toggleNote?: (k: string) => void
  children: React.ReactNode
}) {
  const head = tone === 'orange' ? { bg: '#FFF5E6', color: '#D14900' }
    : tone === 'red' ? { bg: '#FFF0F0', color: '#CC0000' }
    : tone === 'blue' ? { bg: '#EBF4FF', color: '#1A5FAD' }
    : tone === 'green' ? { bg: '#E8F5E9', color: '#1A5A2A' }
    : { bg: '#F8F8F8', color: '#666' }
  const noteEnabled = !!(id && notes && setNotes && notesOpen && toggleNote)
  const hasNote = noteEnabled && !!(notes![id!] && notes![id!].trim())
  // מוצג כשנפתח ידנית (📝) או כשכבר קיימת הערה שמורה — כדי שלא תיעלם בטעינת דף קיים.
  const open = noteEnabled && (notesOpen!.has(id!) || hasNote)
  return (
    <div style={{
      background: '#fff', margin: '6px 8px', borderRadius: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden',
      ...(tone === 'orange' ? { borderRight: '3px solid #FFB300' } : {}),
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3,
        background: head.bg, color: head.color, padding: '5px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl',
      }}>
        <span>{title}</span>
        {noteEnabled && (
          <button type="button" onClick={() => toggleNote!(id!)}
            title="הערה" style={{
              width: 22, height: 22, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: open ? RED : 'rgba(0,0,0,0.12)', cursor: 'pointer', fontSize: 12, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
            }}>📝</button>
        )}
      </div>
      <div style={{ padding: 12 }}>
        {open && (
          <textarea dir="rtl" rows={2} placeholder="הערה…" value={notes![id!] ?? ''}
            onChange={e => setNotes!(id!, e.target.value)}
            ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
            style={{ ...inputStyle, minHeight: 52, padding: 8, resize: 'none', overflow: 'hidden', marginBottom: 10, lineHeight: 1.4, width: '100%', boxSizing: 'border-box' }} />
        )}
        {children}
      </div>
    </div>
  )
}

// ── פקדים קומפקטיים לבלוק החלפת אסבסט ─────────────────────────
const miniLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#777', marginBottom: 3, direction: 'rtl' }
const asbNoteBtn: React.CSSProperties = {
  border: `1px solid ${ASB_RED}`, background: '#fff', color: ASB_RED, borderRadius: 13,
  padding: '3px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const asbRemoveBtn: React.CSSProperties = {
  width: 22, height: 22, flexShrink: 0, borderRadius: '50%', border: `1px solid ${ASB_RED}`,
  background: '#fff', color: ASB_RED, cursor: 'pointer', fontSize: 12, lineHeight: 1, fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
function MiniChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '3px 9px', borderRadius: 13, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      fontFamily: 'inherit', direction: 'rtl', whiteSpace: 'nowrap',
      border: active ? `1px solid ${ASB_RED}` : `1px solid ${BORDER}`,
      background: active ? '#FBECEA' : '#fff', color: active ? ASB_RED : '#555',
    }}>{label}</button>
  )
}
// עמודה של צ'יפים בבחירה יחידה (לחיצה חוזרת מבטלת)
function MiniChipCol({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={miniLabel}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {options.map(o => <MiniChip key={o} label={o} active={value === o} onClick={() => onChange(value === o ? '' : o)} />)}
      </div>
    </div>
  )
}
// MiniSelect קומפקטי — כש-"אחר" נבחר, שדה הפירוט מופיע לצד ה-select באותה שורה (לא דוחף למטה)
function MiniSelect({ label, options, value, onChange, otherValue, onOther, placeholder = 'בחר' }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
  otherValue?: string; onOther?: (v: string) => void; placeholder?: string
}) {
  const showOther = value === 'אחר' && !!onOther
  const selStyle: React.CSSProperties = {
    ...inputStyle, height: 30, fontSize: 11, fontWeight: 600, padding: '0 6px',
    appearance: 'none', cursor: 'pointer', color: value ? '#111' : '#999',
    width: 'auto', minWidth: 0, flex: showOther ? '0 0 46%' : 1,
  }
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={miniLabel}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <select dir="rtl" value={value} onChange={e => onChange(e.target.value)} style={selStyle}>
          <option value="" disabled hidden>{placeholder}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {showOther && (
          <input dir="rtl" maxLength={20} value={otherValue ?? ''} placeholder="פירוט…"
            onChange={e => onOther!(e.target.value)}
            style={{ ...inputStyle, height: 30, fontSize: 11, padding: '0 6px', flex: 1, minWidth: 0 }} />
        )}
      </div>
    </div>
  )
}
// dropdown שמראה שדה טקסט ל"אחר" באותה שורה (side-by-side) — הטקסט נשמר inline באובייקט המבנה
function InlineSelectOther({ value, otherValue, options, onChange, onOther }: {
  value: string; otherValue: string; options: string[]; onChange: (v: string) => void; onOther: (v: string) => void
}) {
  if (value === 'אחר') {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: '0 0 44%', minWidth: 0 }}>
          <SelectBox value={value} onChange={onChange} options={options} />
        </div>
        <input dir="rtl" maxLength={20} value={otherValue} placeholder="פירוט…"
          onChange={e => onOther(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
      </div>
    )
  }
  return <SelectBox value={value} onChange={onChange} options={options} />
}

// ── כרטיס מבנה בבלוק החלפת אסבסט ───────────────────────────────
function AsbestosBuildingCard({ idx, b, canRemove, onChange, onRemove }: {
  idx: number; b: AsbestosBuilding; canRemove: boolean
  onChange: (p: Partial<AsbestosBuilding>) => void; onRemove: () => void
}) {
  const set = onChange
  return (
    <div style={{ border: '1.5px solid #ebebeb', borderRadius: 9, padding: 8, marginBottom: 8, background: '#fff', direction: 'rtl' }}>
      {/* כותרת — שורה אחת */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'nowrap' }}>
        <span style={{ color: ASB_RED, fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>מבנה {idx + 1}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#777' }}>מקל סבא</span>
          {ASB_YESNO.map(o => <MiniChip key={o} label={o} active={b.grandpaStick === o} onClick={() => set({ grandpaStick: b.grandpaStick === o ? '' : o })} />)}
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => set({ noteOpen: !b.noteOpen })} style={asbNoteBtn}>{b.noteOpen ? '✕ הערה' : '＋ הערה'}</button>
        {canRemove && <button type="button" onClick={onRemove} title="הסר מבנה" style={asbRemoveBtn}>✕</button>}
      </div>
      {b.noteOpen && <div style={{ marginBottom: 8 }}><AutoTextArea value={b.note} onChange={v => set({ note: v })} placeholder="הערה למבנה…" /></div>}

      <div style={grid2}>
        <Field label="נ.צ. X"><TextInput value={b.coordX} onChange={v => set({ coordX: v })} placeholder="X" /></Field>
        <Field label="נ.צ. Y"><TextInput value={b.coordY} onChange={v => set({ coordY: v })} placeholder="Y" /></Field>
      </div>
      <div style={grid2}>
        <Field label={'גודל גג (מ"ר)'}><TextInput type="number" value={b.roofSize} onChange={v => set({ roofSize: v })} placeholder={'מ"ר'} /></Field>
        <Field label="סוג מבנה"><InlineSelectOther value={b.structureType} otherValue={b.structureTypeOther} options={ASB_STRUCTURE_OPTS} onChange={v => set({ structureType: v })} onOther={v => set({ structureTypeOther: v })} /></Field>
      </div>
      <div style={grid2}>
        <Field label="קונסטרוקציה"><InlineSelectOther value={b.construction} otherValue={b.constructionOther} options={ASB_CONSTRUCTION_OPTS} onChange={v => set({ construction: v })} onOther={v => set({ constructionOther: v })} /></Field>
        <Field label="גובה (מ')"><TextInput type="number" value={b.height} onChange={v => set({ height: v })} placeholder="מ'" /></Field>
      </div>

      {/* שורת צ'יפים 1 — שלוש עמודות שוות */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, marginTop: 2 }}>
        <MiniChipCol label="מצב קונס'" options={ASB_CONS_STATE_OPTS} value={b.consState} onChange={v => set({ consState: v })} />
        <MiniChipCol label="תקרה קשיחה" options={ASB_YESNO} value={b.ceiling} onChange={v => set({ ceiling: v, ceilingType: v === 'יש' ? b.ceilingType : '', ceilingTypeOther: v === 'יש' ? b.ceilingTypeOther : '' })} />
        {b.ceiling === 'יש'
          ? <MiniSelect label="סוג תקרה" options={ASB_CEILING_TYPE_OPTS} value={b.ceilingType}
              onChange={v => set({ ceilingType: v, ceilingTypeOther: v === 'אחר' ? b.ceilingTypeOther : '' })}
              otherValue={b.ceilingTypeOther} onOther={v => set({ ceilingTypeOther: v })} />
          : <div style={{ flex: 1 }} />}
      </div>

      {/* שורת צ'יפים 2 — שלוש עמודות שוות */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <MiniChipCol label="תשתית" options={ASB_INFRA_OPTS} value={b.infra} onChange={v => set({ infra: v })} />
        <MiniChipCol label="סוג אסבסט" options={ASB_KIND_OPTS} value={b.asbestosKind} onChange={v => set({ asbestosKind: v, asbestosSub: v === 'אחר' ? b.asbestosSub : '', asbestosSubOther: v === 'אחר' ? b.asbestosSubOther : '' })} />
        {b.asbestosKind === 'אחר'
          ? <MiniSelect label="סוג אסבסט" options={ASB_SUB_OPTS} value={b.asbestosSub}
              onChange={v => set({ asbestosSub: v, asbestosSubOther: v === 'אחר' ? b.asbestosSubOther : '' })}
              otherValue={b.asbestosSubOther} onOther={v => set({ asbestosSubOther: v })} />
          : <div style={{ flex: 1 }} />}
      </div>

      {/* קירוי חדש */}
      <div>
        <div style={miniLabel}>קירוי חדש</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {ASB_NEWROOF_OPTS.map(o => (
            <MiniChip key={o} label={o} active={b.newRoof === o}
              onClick={() => set({ newRoof: b.newRoof === o ? '' : o, newRoofNote: (b.newRoof === o || o === 'ללא') ? '' : b.newRoofNote })} />
          ))}
        </div>
        {b.newRoof !== '' && b.newRoof !== 'ללא' && (
          <div style={{ marginTop: 6 }}><TextInput value={b.newRoofNote} onChange={v => set({ newRoofNote: v })} placeholder="פירוט קירוי…" /></div>
        )}
      </div>
    </div>
  )
}

// ── בלוק דינמי לפי סוג עבודה ───────────────────────────────────
function WorkBlock({ typeKey, blocks, patch, others, setOther }: {
  typeKey: string; blocks: WorkBlocks; patch: (p: Partial<WorkBlocks>) => void
  others: Record<string, string>; setOther: (k: string, v: string) => void
}) {
  const oProps = { others, setOther }
  if (typeKey === 'asbestos') {
    const blk = blocks.asbestos
    const buildings = blk.buildings ?? []
    const setBlk = (p: Partial<AsbestosBlock>) => patch({ asbestos: { ...blk, ...p } })
    const setB = (i: number, p: Partial<AsbestosBuilding>) =>
      setBlk({ buildings: buildings.map((bb, j) => (j === i ? { ...bb, ...p } : bb)) })
    const addBuilding = () => setBlk({ buildings: [...buildings, emptyAsbBuilding()] })
    const removeBuilding = (i: number) => setBlk({ buildings: buildings.filter((_, j) => j !== i) })
    const totalArea = buildings.reduce((s, bb) => s + num(bb.roofSize), 0)
    return (
      <div style={{ direction: 'rtl' }}>
        {buildings.map((bb, i) => (
          <AsbestosBuildingCard key={i} idx={i} b={bb} canRemove={buildings.length > 1}
            onChange={p => setB(i, p)} onRemove={() => removeBuilding(i)} />
        ))}

        <button type="button" onClick={addBuilding} style={{
          width: '100%', background: 'transparent', border: `1.5px dashed ${ASB_RED}`, color: ASB_RED,
          borderRadius: 9, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          direction: 'rtl', marginBottom: 8,
        }}>＋ הוסף מבנה</button>

        {/* סיכום + הערות פרויקט */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>{fmt(totalArea)} מ"ר · {buildings.length} מבנים</span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => setBlk({ generalNoteOpen: !blk.generalNoteOpen })} style={asbNoteBtn}>{blk.generalNoteOpen ? '✕ הערה' : '＋ הערה'}</button>
          <button type="button" onClick={() => setBlk({ sensitiveOpen: !blk.sensitiveOpen })} style={asbNoteBtn}>{blk.sensitiveOpen ? '✕ מבנים רגישים' : '＋ מבנים רגישים'}</button>
        </div>
        {blk.generalNoteOpen && <div style={{ marginTop: 8 }}><AutoTextArea value={blk.generalNote} onChange={v => setBlk({ generalNote: v })} placeholder="הערה כללית לפרויקט…" /></div>}
        {blk.sensitiveOpen && <div style={{ marginTop: 8 }}><AutoTextArea value={blk.sensitive} onChange={v => setBlk({ sensitive: v })} placeholder="מבנים רגישים בסביבה…" /></div>}
      </div>
    )
  }
  if (typeKey === 'roofReplace') {
    const b = blocks.roofReplace
    const set = (p: Partial<RoofReplaceBlock>) => patch({ roofReplace: { ...b, ...p } })
    return (
      <>
        <div style={grid2}>
          <Field label="גג קיים"><SelectOther value={b.existingRoof} onChange={v => set({ existingRoof: v })} options={EXISTING_ROOF_OPTS} okey="rr.existingRoof" {...oProps} /></Field>
          <Field label="גג חדש"><SelectOther value={b.newRoof} onChange={v => set({ newRoof: v })} options={NEW_ROOF_OPTS} okey="rr.newRoof" {...oProps} /></Field>
        </div>
        <div style={grid2}>
          <Field label="קונסטרוקציה"><SelectOther value={b.construction} onChange={v => set({ construction: v })} options={CONSTRUCTIONS} okey="rr.construction" {...oProps} /></Field>
          <Field label="שיפוע"><TextInput value={b.slope} onChange={v => set({ slope: v })} placeholder="שיפוע" /></Field>
        </div>
        {/* בליטה מהפתות: מספר מימין + הערה קצרה לשדה זה בלבד משמאל */}
        <div style={grid2}>
          <Field label="בליטה מהפתות"><TextInput type="number" value={b.overhang} onChange={v => set({ overhang: v })} placeholder="מ׳" /></Field>
          <Field label="הערה"><TextInput value={b.overhangNote} onChange={v => set({ overhangNote: v })} placeholder="הערה…" /></Field>
        </div>
        {b.newRoof === 'איסכורית' && (
          <div style={grid2}>
            <Field label="עובי פח"><SelectBox value={b.sheetThickness} onChange={v => set({ sheetThickness: v })} options={SHEET_THICKNESS_OPTS} /></Field>
            <Field label="צבע"><SelectOther value={b.color} onChange={v => set({ color: v })} options={ROOF_COLOR_OPTS} okey="rr.color" {...oProps} /></Field>
          </div>
        )}
        {b.newRoof === 'פנל מבודד' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <Field label="עובי פח עליון"><SelectBox value={b.topThickness} onChange={v => set({ topThickness: v })} options={SHEET_THICKNESS_OPTS} /></Field>
              <Field label="עובי פח תחתון"><SelectBox value={b.bottomThickness} onChange={v => set({ bottomThickness: v })} options={SHEET_THICKNESS_OPTS} /></Field>
              <Field label="סוג מילוי"><SelectOther value={b.fillType} onChange={v => set({ fillType: v })} options={FILL_TYPE_OPTS} okey="rr.fillType" {...oProps} /></Field>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Field label="צבע"><SelectOther value={b.color} onChange={v => set({ color: v })} options={ROOF_COLOR_OPTS} okey="rr.color" {...oProps} /></Field>
            </div>
          </>
        )}
        {b.newRoof === 'רעפים' && (
          <div style={{ marginBottom: 8 }}>
            <Field label="סוג רעף"><SelectOther value={b.tileType} onChange={v => set({ tileType: v })} options={TILE_TYPE_OPTS} okey="rr.tileType" {...oProps} /></Field>
          </div>
        )}
      </>
    )
  }
  if (typeKey === 'aluminum') {
    const b = blocks.aluminum
    const set = (p: Partial<AluminumBlock>) => patch({ aluminum: { ...b, ...p } })
    return (
      <>
        <div style={grid2}>
          <Field label="גוון"><SelectOther value={b.shade} onChange={v => set({ shade: v })} options={ALUM_SHADES} okey="alum.shade" {...oProps} /></Field>
          <Field label="מטרים"><TextInput type="number" value={b.meters} onChange={v => set({ meters: v })} placeholder="מ׳" /></Field>
        </div>
        <Field label="מיקום"><ChipGroup options={['פנים', 'תקרה']} value={b.coating} onChange={v => set({ coating: v })} /></Field>
      </>
    )
  }
  if (typeKey === 'gutters') {
    const b = blocks.gutters
    const set = (p: Partial<GuttersBlock>) => patch({ gutters: { ...b, ...p } })
    return (
      <>
        <div style={{ marginBottom: 8 }}>
          <Field label="סוג"><SelectOther value={b.type} onChange={v => set({ type: v })} options={GUTTER_TYPES} okey="gut.type" {...oProps} /></Field>
        </div>
        <div style={grid2}>
          <Field label="מרזבים (מ׳)"><TextInput type="number" value={b.guttersM} onChange={v => set({ guttersM: v })} placeholder="מ׳" /></Field>
          <Field label="מקטעים"><TextInput type="number" value={b.guttersSegments} onChange={v => set({ guttersSegments: v })} placeholder="מקטעים" /></Field>
        </div>
        <div style={grid2}>
          <Field label="ירידות (יח׳)"><TextInput type="number" value={b.downUnits} onChange={v => set({ downUnits: v })} placeholder="יח׳" /></Field>
          <Field label="מקטעים"><TextInput type="number" value={b.downSegments} onChange={v => set({ downSegments: v })} placeholder="מקטעים" /></Field>
        </div>
      </>
    )
  }
  if (typeKey === 'insulation') {
    const b = blocks.insulation
    const set = (p: Partial<InsulationBlock>) => patch({ insulation: { ...b, ...p } })
    return (
      <>
        <div style={{ marginBottom: 8 }}>
          <Field label="סוג"><SelectOther value={b.type} onChange={v => set({ type: v })} options={INSULATION_TYPE_OPTS} okey="ins.type" {...oProps} /></Field>
        </div>
        <div style={grid2}>
          <Field label="שטח (מ״ר)"><TextInput type="number" value={b.area} onChange={v => set({ area: v })} placeholder="מ״ר" /></Field>
          <Field label="עובי"><SelectOther value={b.thickness} onChange={v => set({ thickness: v })} options={INSULATION_THICKNESS_OPTS} okey="ins.thickness" {...oProps} /></Field>
        </div>
      </>
    )
  }
  // other
  const b = blocks.other
  return <Field label="פירוט"><TextArea value={b.note} onChange={v => patch({ other: { note: v } })} placeholder="פירוט העבודה" /></Field>
}

// ── כרטיסיית קטגוריית חומרים ───────────────────────────────────
function MaterialCategoryCard({ catKey, cat, onChange, onRemove, others, setOther }: {
  catKey: string; cat: MaterialCategory; onChange: (c: MaterialCategory) => void; onRemove: () => void
  others: Record<string, string>; setOther: (k: string, v: string) => void
}) {
  const meta = CATEGORY_META[catKey]
  const isRoofing = catKey === 'roofing'
  const typeOpts = MAT_TYPE_OPTS[catKey]           // "סוג" כ-dropdown לכל שורה (undefined לקירוי/בידוד)
  const otherLen = catKey === 'wood' ? 25 : 20
  const total = cat.rows.reduce((s, r) => s + num(r.qty) * num(r.measure), 0)
  function setRow(i: number, p: Partial<MaterialRow>) {
    onChange({ ...cat, rows: cat.rows.map((r, j) => j === i ? { ...r, ...p } : r) })
  }
  const ok = (k: string) => `mat.${catKey}.${k}`
  return (
    <div style={{ background: '#fff', margin: '6px 8px', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <div style={{
        background: meta.head, color: meta.color, padding: '6px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl',
      }}>
        <span style={{ width: 20 }} />
        <span style={{ fontSize: 13, fontWeight: 800 }}>{meta.label}</span>
        <button type="button" onClick={onRemove} title="הסר קטגוריה" style={{
          width: 20, height: 20, borderRadius: '50%', border: `1px solid ${meta.color}`,
          background: 'transparent', color: meta.color, cursor: 'pointer', fontSize: 15, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
        }}>−</button>
      </div>
      <div style={{ padding: 10 }}>
        {/* קירוי — "סוג" יחיד בראש הסקשן + שדות תלויי-סוג */}
        {isRoofing && (
          <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ marginBottom: 8 }}>
              <Field label="סוג"><SelectOther value={cat.roofingType} onChange={v => onChange({ ...cat, roofingType: v })} options={ROOFING_MAT_OPTS} okey={ok('roofingType')} others={others} setOther={setOther} /></Field>
            </div>
            {cat.roofingType === 'איסכורית' && (
              <div style={grid2}>
                <Field label="עובי"><SelectBox value={cat.sheetThickness} onChange={v => onChange({ ...cat, sheetThickness: v })} options={SHEET_THICKNESS_OPTS} /></Field>
                <Field label="צבע"><SelectOther value={cat.roofColor} onChange={v => onChange({ ...cat, roofColor: v })} options={ROOF_COLOR_OPTS} okey={ok('roofColor')} others={others} setOther={setOther} /></Field>
              </div>
            )}
            {cat.roofingType === 'פנל מבודד' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <Field label="עובי פח עליון"><SelectBox value={cat.topThickness} onChange={v => onChange({ ...cat, topThickness: v })} options={SHEET_THICKNESS_OPTS} /></Field>
                  <Field label="עובי פח תחתון"><SelectBox value={cat.bottomThickness} onChange={v => onChange({ ...cat, bottomThickness: v })} options={SHEET_THICKNESS_OPTS} /></Field>
                </div>
                <Field label="צבע"><SelectOther value={cat.roofColor} onChange={v => onChange({ ...cat, roofColor: v })} options={ROOF_COLOR_OPTS} okey={ok('roofColor')} others={others} setOther={setOther} /></Field>
              </>
            )}
            {cat.roofingType === 'רעפים' && (
              <Field label="סוג רעף"><SelectOther value={cat.tileType} onChange={v => onChange({ ...cat, tileType: v })} options={TILE_TYPE_OPTS} okey={ok('tileType')} others={others} setOther={setOther} /></Field>
            )}
          </div>
        )}
        {cat.rows.map((r, i) => (
          <div key={i} style={{ marginBottom: 8, direction: 'rtl' }}>
            {typeOpts && (
              <div style={{ marginBottom: 6 }}>
                <select dir="rtl" value={r.type} onChange={e => setRow(i, { type: e.target.value })}
                  style={{ ...inputStyle, color: r.type ? '#111' : '#555', appearance: 'none', cursor: 'pointer' }}>
                  <option value="" disabled hidden>סוג</option>
                  {typeOpts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {r.type === 'אחר' && (
                  <input dir="rtl" maxLength={otherLen} value={r.typeOther} placeholder="פירוט…"
                    onChange={e => setRow(i, { typeOther: e.target.value })} style={{ ...inputStyle, marginTop: 6 }} />
                )}
                {r.type === 'רוכב' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                    <select dir="rtl" value={r.riderType} onChange={e => setRow(i, { riderType: e.target.value })}
                      style={{ ...inputStyle, color: r.riderType ? '#111' : '#555', appearance: 'none', cursor: 'pointer' }}>
                      <option value="" disabled hidden>סוג רוכב</option>
                      {RIDER_TYPE_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input dir="rtl" maxLength={15} value={r.riderAngle} placeholder="זווית"
                      onChange={e => setRow(i, { riderAngle: e.target.value })} style={inputStyle} />
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, direction: 'rtl' }}>
              {!typeOpts && !isRoofing && (
                <input dir="rtl" style={{ ...inputStyle, flex: meta.hasShade ? 1.3 : 2 }} placeholder="סוג"
                  value={r.type} onChange={e => setRow(i, { type: e.target.value })} />
              )}
              {meta.hasShade && (
                <input dir="rtl" style={{ ...inputStyle, flex: 1.1 }} placeholder="גוון"
                  value={r.shade} onChange={e => setRow(i, { shade: e.target.value })} />
              )}
              <input dir="rtl" type="number" inputMode="numeric" style={{ ...inputStyle, flex: 0.8, padding: '0 6px' }} placeholder="יח׳"
                value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} />
              <span style={{ color: GREY, fontWeight: 800, fontSize: 12 }}>×</span>
              <input dir="rtl" type="number" inputMode="decimal" style={{ ...inputStyle, flex: 0.8, padding: '0 6px' }} placeholder={meta.unit}
                value={r.measure} onChange={e => setRow(i, { measure: e.target.value })} />
              <span style={{ color: GREY, fontWeight: 800, fontSize: 12 }}>=</span>
              <span style={{ flex: 0.8, textAlign: 'center', fontSize: 13, fontWeight: 800, color: meta.color }}>{fmt(num(r.qty) * num(r.measure))}</span>
              <button type="button" onClick={() => onChange({ ...cat, rows: cat.rows.filter((_, j) => j !== i) })}
                disabled={cat.rows.length <= 1} style={{
                  background: 'none', border: 'none', color: cat.rows.length <= 1 ? '#DDD' : GREY,
                  cursor: cat.rows.length <= 1 ? 'default' : 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit',
                }}>×</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => onChange({ ...cat, rows: [...cat.rows, emptyRow()] })}
          style={{ background: 'none', border: 'none', color: meta.color, fontSize: 13, fontWeight: 800, cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}>
          ＋ הוסף שורה
        </button>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6,
          padding: '7px 10px', border: `1.5px solid ${meta.color}`, borderRadius: 8, direction: 'rtl',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>סה״כ {meta.label}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: meta.color }}>{fmt(total)} {meta.unit}</span>
        </div>
      </div>
    </div>
  )
}

// ── סקשן תיעוד ─────────────────────────────────────────────────
function DocSection({ icon, title, subtitle, items, onAdd, onRemove, onNote, uploading }: {
  icon: string; title: string; subtitle: string; items: DocItem[]
  onAdd: (files: FileList) => void; onRemove: (i: number) => void
  onNote: (i: number, note: string, open: boolean) => void; uploading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [viewerPos, setViewerPos] = useState<number | null>(null)
  const images = items.filter(it => it.url)
  return (
    <div style={{ background: '#fff', margin: '6px 8px', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <div style={{ background: '#F8F8F8', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, direction: 'rtl' }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#333' }}>{title}</div>
          <div style={{ fontSize: 10, color: '#777' }}>{subtitle}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: GREY }}>{items.length}</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8, direction: 'rtl' }}>
        {items.map((it, i) => (
          <div key={i} style={{ width: 64 }}>
            <div style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: `1px solid ${BORDER}`, background: '#F5F5F5' }}>
              {it.url
                ? <img src={it.url} alt={it.name} onClick={() => setViewerPos(images.indexOf(it))} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />
                : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 22 }}>📄</div>}
              <button type="button" onClick={() => onRemove(i)} style={{
                position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1, fontFamily: 'inherit',
              }}>×</button>
              <button type="button" onClick={() => onNote(i, it.note, !it.noteOpen)} title="הערה" style={{
                position: 'absolute', bottom: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
                background: it.note ? RED : 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, lineHeight: 1, fontFamily: 'inherit',
              }}>💬</button>
            </div>
            {it.noteOpen && (
              <input dir="rtl" autoFocus value={it.note} placeholder="הערה" onChange={e => onNote(i, e.target.value, true)}
                style={{ ...inputStyle, height: 28, fontSize: 11, marginTop: 4, padding: '0 6px' }} />
            )}
          </div>
        ))}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} style={{
          width: 64, height: 64, borderRadius: 8, border: `1.5px dashed ${RED}`, background: '#fff',
          color: RED, cursor: uploading ? 'default' : 'pointer', fontSize: 26, lineHeight: 1, fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{uploading ? '…' : '＋'}</button>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = '' }} />
      </div>
      {viewerPos !== null && images[viewerPos] && (
        <ImageViewer images={images} pos={viewerPos} onPos={setViewerPos} onClose={() => setViewerPos(null)} />
      )}
    </div>
  )
}

// ── מציג תמונות במסך מלא ────────────────────────────────────────
function ImageViewer({ images, pos, onPos, onClose }: {
  images: DocItem[]; pos: number; onPos: (p: number) => void; onClose: () => void
}) {
  const count = images.length
  const go = useCallback((delta: number) => onPos((pos + delta + count) % count), [pos, count, onPos])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(1)   // RTL: שמאלה = הבא
      else if (e.key === 'ArrowRight') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const cur = images[pos]
  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <button type="button" onClick={onClose} style={{
        position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 16, width: 40, height: 40,
        borderRadius: '50%', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none',
        fontSize: 24, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
      }}>×</button>

      <img src={cur.url} alt={cur.name} onClick={e => e.stopPropagation()} style={{
        maxWidth: '92vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 6,
      }} />

      {(cur.note || count > 1) && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 14, textAlign: 'center', direction: 'rtl', maxWidth: '92vw' }}>
          {cur.note && <div style={{ fontSize: 15, color: '#fff', marginBottom: 6, whiteSpace: 'pre-wrap' }}>{cur.note}</div>}
          {count > 1 && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{pos + 1} / {count}</div>}
        </div>
      )}

      {count > 1 && (
        <>
          <button type="button" onClick={e => { e.stopPropagation(); go(1) }} style={viewerNavBtn('left')}>‹</button>
          <button type="button" onClick={e => { e.stopPropagation(); go(-1) }} style={viewerNavBtn('right')}>›</button>
        </>
      )}
    </div>,
    document.body,
  )
}

function viewerNavBtn(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: 12,
    width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', color: '#fff',
    border: 'none', fontSize: 30, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}

// ── לשונית התקדמות ─────────────────────────────────────────────
function PSelect({ value, onChange, options, emptyLabel = '— בחר —', accent, okey, others, setOther }: {
  value: string; onChange: (v: string) => void; options: string[]; emptyLabel?: string; accent?: string
  okey?: string; others?: Record<string, string>; setOther?: (k: string, v: string) => void
}) {
  return (
    <>
      <select dir="rtl" value={value} onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, color: value ? '#111' : '#555', appearance: 'none', cursor: 'pointer', ...(accent ? { borderColor: accent } : {}) }}>
        <option value="">{emptyLabel}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {value === 'אחר' && okey && others && setOther && <OtherText okey={okey} others={others} setOther={setOther} />}
    </>
  )
}

function PermitStatus({ submission, approval }: { submission: string; approval: string }) {
  let badge: { bg: string; color: string; text: string }
  if (approval) badge = { bg: '#E8F5E9', color: '#1A5A2A', text: '✓ התקבל' }
  else if (submission) badge = { bg: '#FFF0E0', color: '#B26A00', text: `⏳ ממתין · ${daysSince(submission)} ימים` }
  else badge = { bg: '#EEE', color: '#777', text: 'טרם הוגש' }
  return (
    <div style={{ background: '#FFF8F0', borderRadius: 8, padding: '8px 10px', marginTop: 4, display: 'flex', justifyContent: 'center', direction: 'rtl' }}>
      <span style={{ background: badge.bg, color: badge.color, borderRadius: 14, padding: '4px 12px', fontSize: 13, fontWeight: 800 }}>{badge.text}</span>
    </div>
  )
}

function SummaryLine({ icon, text, bg }: { icon: string; text: string; bg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: bg, borderRadius: 8, padding: '9px 12px', direction: 'rtl' }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{text}</span>
    </div>
  )
}

// תאריך יום (YYYY-MM-DD) → d.m.yy
function fmtDay(iso?: string): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })
}
// שורת קריאה בלבד (לכרטיס השטח המצומצם)
function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '9px 4px', direction: 'rtl', borderTop: `1px solid #f3efe9` }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#555', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#111', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ── כרטיס "שלב העסקה" — שורה מכווצת + dropdown של 7 השלבים ──────
function StageCard({ deal, onStageChange }: { deal: DealRow; onStageChange: (stage: number) => void }) {
  const [open, setOpen] = useState(false)
  const idx = Math.min(Math.max(deal.stage, 1), 7) - 1
  return (
    <Card title="שלב העסקה" tone="blue">
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
        border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
        direction: 'rtl', fontFamily: 'inherit',
      }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: RED, color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{deal.stage}</span>
        <span style={{ flex: 1, textAlign: 'right', fontSize: 15, fontWeight: 800, color: '#111' }}>{DEAL_STAGES[idx]}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#888', fontVariantNumeric: 'tabular-nums' }}>{deal.stage}/7</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: '#888', fontSize: 13 }}>⌄</span>
      </button>
      {open && (
        <div style={{ marginTop: 6, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          {DEAL_STAGES.map((name, i) => {
            const st = i + 1
            const cur = st === deal.stage
            return (
              <button key={st} type="button" onClick={() => { setOpen(false); if (!cur) onStageChange(st) }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: cur ? '#FFF0F0' : '#fff',
                border: 'none', borderTop: i > 0 ? `1px solid #f3efe9` : 'none', padding: '9px 12px', cursor: 'pointer',
                direction: 'rtl', fontFamily: 'inherit',
              }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: cur ? RED : '#eee', color: cur ? '#fff' : '#777', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{st}</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: cur ? 800 : 600, color: cur ? RED : '#333' }}>{name}</span>
                {cur && <span style={{ color: RED, fontSize: 14 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: '#999', marginTop: 8, direction: 'rtl', lineHeight: 1.5 }}>
        ✏️ ניתן לעדכן ידנית, או אוטומטית ממקור מחובר (כשיתחבר)
        {deal.stage_updated_by ? <><br />עודכן ע״י {deal.stage_updated_by}{deal.stage_updated_at ? ` · ${fmtDateTime(deal.stage_updated_at)}` : ''}</> : null}
      </div>
    </Card>
  )
}

// ── כרטיס ניהולי (כספים/גביה) — badge 🔒 בכותרת + תג מקור בתחתית ──
function MgmtCard({ title, children, updatedAt }: { title: string; children: React.ReactNode; updatedAt: string }) {
  return (
    <div style={{ background: '#fff', margin: '6px 8px', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3, background: '#F0EBF5', color: '#7A4CA0', padding: '5px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' }}>
        <span>{title}</span>
        <span style={{ fontSize: 10, fontWeight: 800 }}>🔒 ניהול בלבד</span>
      </div>
      <div style={{ padding: 12 }}>
        {children}
        <div style={{ fontSize: 11, color: '#999', marginTop: 10, direction: 'rtl' }}>מקור: דוח פריוריטי · נכון ל־{fmtDateTime(updatedAt)}</div>
      </div>
    </div>
  )
}
function MoneyRow({ label, value, pct }: { label: string; value: string; pct?: number | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '8px 4px', direction: 'rtl', borderTop: `1px solid #f3efe9` }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>
        {value}
        {pct != null ? <span style={{ fontSize: 12, fontWeight: 600, color: '#999', marginRight: 6 }}> ({pct}%)</span> : null}
      </span>
    </div>
  )
}
function FinancesCard({ deal }: { deal: DealRow }) {
  return (
    <MgmtCard title="כספים" updatedAt={deal.updated_at}>
      {deal.total_price != null && <MoneyRow label="סה״כ (כולל מע״מ)" value={ils(deal.total_price)} />}
      {deal.price_before_vat != null && <MoneyRow label="לפני מע״מ" value={ils(deal.price_before_vat)} />}
      {/* עלויות + אחוזים — רק אם השדה קיים (לא null); null → לא מציגים שורה כלל */}
      {deal.materials_cost != null && <MoneyRow label="חומרים" value={ils(deal.materials_cost)} pct={deal.materials_pct} />}
      {deal.labor_cost != null && <MoneyRow label="עבודה" value={ils(deal.labor_cost)} pct={deal.labor_pct} />}
      {deal.logistics_cost != null && <MoneyRow label="לוגיסטיקה" value={ils(deal.logistics_cost)} pct={deal.logistics_pct} />}
    </MgmtCard>
  )
}
function CollectionCard({ deal }: { deal: DealRow }) {
  const note = (deal.balance_note ?? '').trim()
  return (
    <>
      {note && (
        <div style={{ margin: '6px 8px 0', background: '#FFF8E6', border: '1px solid #F0D98C', borderRadius: 10, padding: '8px 12px', direction: 'rtl', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#7a5b00', lineHeight: 1.4 }}>{note}</span>
        </div>
      )}
      <MgmtCard title="גביה" updatedAt={deal.updated_at}>
        {deal.paid_amount != null && <MoneyRow label="שולם" value={ils(deal.paid_amount)} />}
        {deal.balance_due != null && <MoneyRow label="יתרה לגביה" value={ils(deal.balance_due)} />}
      </MgmtCard>
    </>
  )
}

function ProgressTab({ progress, workTypes, onChange, others, setOther, isFull, address, deal, dealLoading, onStageChange, roofActive, roofSupplier, roofOrderDate, onRoofSupplier, onRoofOrderDate }: {
  progress: ProgressData; workTypes: string[]; onChange: (p: Partial<ProgressData>) => void
  others: Record<string, string>; setOther: (k: string, v: string) => void
  isFull: boolean; address: string
  deal: DealRow | null; dealLoading: boolean; onStageChange: (stage: number) => void
  roofActive: boolean; roofSupplier: string; roofOrderDate: string
  onRoofSupplier: (v: string) => void; onRoofOrderDate: (v: string) => void
}) {
  const p = progress

  // ── תצוגת שטח מצומצמת (field/external): 4 שדות בלבד, קריאה בלבד ──
  if (!isFull) {
    const permit = p.asbestos_permit.approval_date
      ? { text: '✓ התקבל', bg: '#E8F5E9', color: '#1A5A2A' }
      : workTypes.includes('asbestos')
        ? { text: '✗ אין היתר', bg: '#FDECEC', color: '#CC0000' }
        : { text: 'לא נדרש', bg: '#EEE', color: '#777' }
    return (
      <Card title="סטטוס לשטח" tone="green">
        <ReadRow label="תאריך ביצוע מתוכנן" value={p.execution_date ? fmtDay(p.execution_date) : '—'} />
        <ReadRow label="ראש צוות" value={p.team_lead || '—'} />
        <ReadRow label="כתובת" value={address || '—'} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 4px', direction: 'rtl', borderTop: `1px solid #f3efe9` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>סטטוס היתר</span>
          <span style={{ background: permit.bg, color: permit.color, borderRadius: 14, padding: '3px 12px', fontSize: 13, fontWeight: 800 }}>{permit.text}</span>
        </div>
      </Card>
    )
  }

  // ── תצוגה מלאה (admin/manager/office) ──
  const setPermit = (patch: Partial<AsbestosPermit>) => onChange({ asbestos_permit: { ...p.asbestos_permit, ...patch } })
  function setSupplier(i: number, val: string) {
    const next = p.suppliers.map((s, j) => j === i ? val : s)
    if (val && i === next.length - 1) next.push('', '', '')  // בחירה בתא האחרון → שורה חדשה
    onChange({ suppliers: next })
  }

  const permitBlocker = workTypes.includes('asbestos') && !p.asbestos_permit.approval_date
  const blockers: string[] = []
  if (permitBlocker) blockers.push('אין היתר')
  if (!p.execution_date) blockers.push('אין תאריך ביצוע')
  const materialsOrdered = p.suppliers.some(s => s.trim() !== '') && !!p.materials_order_date
  const teamAssigned = !!p.team_lead

  return (
    <>
      {/* כרטיס שלב העסקה — רק אם קיימת רשומת deal תואמת ל-order_number */}
      {deal && <StageCard deal={deal} onStageChange={onStageChange} />}
      {dealLoading && !deal && (
        <div style={{ margin: '6px 8px', padding: '8px 12px', fontSize: 12, color: '#999', direction: 'rtl' }}>טוען נתוני עסקה…</div>
      )}

      {workTypes.includes('asbestos') && (
        <Card title="היתר משרד הסביבה" tone="blue">
          <div style={grid2}>
            <Field label="תאריך הגשה"><TextInput type="date" value={p.asbestos_permit.submission_date} onChange={v => setPermit({ submission_date: v })} /></Field>
            <Field label="היתר התקבל"><TextInput type="date" value={p.asbestos_permit.approval_date} onChange={v => setPermit({ approval_date: v })} /></Field>
          </div>
          <div style={grid2}>
            <Field label="מפקח"><PSelect value={p.asbestos_permit.supervisor} options={PERMIT_SUPERVISORS} onChange={v => setPermit({ supervisor: v })} /></Field>
            <Field label="מס׳ היתר"><TextInput value={p.asbestos_permit.permit_number} onChange={v => setPermit({ permit_number: v })} placeholder="מספר היתר" /></Field>
          </div>
          <PermitStatus submission={p.asbestos_permit.submission_date} approval={p.asbestos_permit.approval_date} />
        </Card>
      )}

      <Card title="ספקים" tone="blue">
        {/* חומר קירוי — ספק + תאריך הזמנה עצמאיים (מבלוק roofReplace), לא תלויים בתאריך הגלובלי */}
        {roofActive && (
          <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#1A5A2A', marginBottom: 6, direction: 'rtl' }}>🏠 חומר קירוי — ספק ותאריך משלו</div>
            <div style={grid2}>
              <Field label="ספק קירוי"><PSelect value={roofSupplier} options={ROOFING_SUPPLIERS} emptyLabel="— ספק קירוי —" accent="#1A5A2A" onChange={onRoofSupplier} /></Field>
              <Field label="תאריך הזמנה"><TextInput type="date" value={roofOrderDate} onChange={onRoofOrderDate} /></Field>
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          {p.suppliers.map((s, i) => (
            <PSelect key={i} value={s} options={i % 3 === 0 ? ROOFING_SUPPLIERS : ALL_SUPPLIERS}
              emptyLabel={i % 3 === 0 ? '— קירוי —' : '— ספק —'} onChange={v => setSupplier(i, v)}
              okey={`prog.supplier.${i}`} others={others} setOther={setOther} />
          ))}
        </div>
        <div style={grid2}>
          <Field label="תאריך הזמנה"><TextInput type="date" value={p.materials_order_date} onChange={v => onChange({ materials_order_date: v })} /></Field>
          <Field label="הגעה לאתר"><TextInput type="date" value={p.materials_arrival_date} onChange={v => onChange({ materials_arrival_date: v })} /></Field>
        </div>
      </Card>

      <Card title="תכנון ביצוע" tone="green">
        <div style={grid2}>
          <Field label="תאריך ביצוע"><TextInput type="date" value={p.execution_date} onChange={v => onChange({ execution_date: v })} /></Field>
          <Field label="ימים משוערים"><TextInput type="number" value={p.estimated_days} onChange={v => onChange({ estimated_days: v })} placeholder="ימים" /></Field>
        </div>
        <div style={grid2}>
          <Field label="ראש צוות"><PSelect value={p.team_lead} options={TEAM_LEADS} accent="#1A5A2A" onChange={v => onChange({ team_lead: v })} /></Field>
          <Field label="קבלן משנה"><PSelect value={p.subcontractor} options={SUBCONTRACTORS} emptyLabel="— ללא —" accent="#1A5A2A" onChange={v => onChange({ subcontractor: v })} okey="prog.subcontractor" others={others} setOther={setOther} /></Field>
        </div>
      </Card>

      <Card title="סיכום" tone="green">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, direction: 'rtl' }}>
          {blockers.length > 0 && <SummaryLine icon="🟡" text={`חסמים פתוחים · ${blockers.join(' · ')}`} bg="#FFF8E6" />}
          <SummaryLine icon={materialsOrdered ? '✅' : '⬜'} text="חומרים הוזמנו" bg={materialsOrdered ? '#E8F5E9' : '#F5F5F5'} />
          <SummaryLine icon={teamAssigned ? '✅' : '⬜'} text="צוות שובץ" bg={teamAssigned ? '#E8F5E9' : '#F5F5F5'} />
          {blockers.length === 0 && <SummaryLine icon="🟢" text="מוכן לביצוע" bg="#E8F5E9" />}
        </div>
      </Card>

      {/* כרטיסי כספים + גביה — רק אם קיימת רשומת deal תואמת */}
      {deal && <FinancesCard deal={deal} />}
      {deal && <CollectionCard deal={deal} />}
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// הקומפוננטה הראשית
// ══════════════════════════════════════════════════════════════
type TabKey = 'details' | 'docs' | 'materials' | 'progress'

export default function NewExecutionSheet() {
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const { id: editId } = useParams<{ id: string }>()

  const [tab, setTab] = useState<TabKey>('details')
  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<SheetForm>(emptyForm())

  // ── טאב עסקה (deals) ──────────────────────────────────────────
  // תצוגה מלאה = admin/manager/office (איציק, אסף, מוטי, משרד). שטח/קבלן משנה
  // (field/field_worker/external) → תצוגת שטח מצומצמת בלבד.
  // ⚠️ זיהוי האדמין מבוסס-אימייל (useIsAdmin) ולא רק על profile.role — כי profile
  // עלול להיות null כששליפתו נכשלה/מתעכבה (ראה useAuth), ואז אדמין היה נופל בטעות
  // לתצוגת השטח. שאר התפקידים (manager/office) נקבעים לפי profile.role כרגיל.
  const isAdmin = useIsAdmin()
  const role = profile?.role
  const isFullView = isAdmin || role === 'admin' || role === 'manager' || role === 'office'
  const [deal, setDeal] = useState<DealRow | null>(null)
  const [dealLoading, setDealLoading] = useState(false)
  const dealFetchedFor = useRef<string | null>(null)

  const sheetIdRef = useRef<string | null>(null)
  const latest = useRef(form); latest.current = form
  const savingRef = useRef(false)
  const lastErrRef = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ── מעדכני state ──────────────────────────────────────────────
  const patch = useCallback((p: Partial<SheetForm>) => setForm(f => ({ ...f, ...p })), [])
  const patchDetails = (p: Partial<DetailsTab>) => setForm(f => ({ ...f, details: { ...f.details, ...p } }))
  const patchGeneral = (p: Partial<GeneralProps>) => setForm(f => ({ ...f, general: { ...f.general, ...p } }))
  const patchLogistics = (p: Partial<Logistics>) => setForm(f => ({ ...f, logistics: { ...f.logistics, ...p } }))
  const patchBlocks = (p: Partial<WorkBlocks>) => setForm(f => ({ ...f, blocks: { ...f.blocks, ...p } }))
  const patchProgress = (p: Partial<ProgressData>) => setForm(f => ({ ...f, progress: { ...f.progress, ...p } }))
  const setRoof = (p: Partial<RoofReplaceBlock>) => setForm(f => ({ ...f, blocks: { ...f.blocks, roofReplace: { ...f.blocks.roofReplace, ...p } } }))

  // שליפת רשומת deal לפי order_number — רק בתצוגה מלאה, רק כשטאב העסקה פתוח.
  // אין match = מצב תקין (עדיין לא הוזן ל-deals), לא שגיאה. קשר 1-לרבים: כמה
  // דפי ביצוע יכולים לחלוק order_number אחד, ולכן limit(1) על ההזמנה.
  useEffect(() => {
    if (!isFullView || tab !== 'progress') return
    const on = form.details.orderNumber.trim()
    if (!on) { setDeal(null); dealFetchedFor.current = null; return }
    if (dealFetchedFor.current === on) return
    dealFetchedFor.current = on
    let cancelled = false
    setDealLoading(true)
    ;(async () => {
      try {
        const rows = await queryWithRetry<DealRow[]>(() =>
          supabase.from('deals').select('*').eq('order_number', on).limit(1))
        if (!cancelled) setDeal((rows?.[0] as DealRow) ?? null)
      } catch (e) {
        console.error('[deal] load failed after retries:', e)
        if (!cancelled) setDeal(null)   // כשל שליפה → נופלים חזרה לכרטיסים הקיימים בלבד
      } finally {
        if (!cancelled) setDealLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isFullView, tab, form.details.orderNumber])

  // עדכון שלב העסקה — אופטימי מיידי + כתיבה ל-deals; חזרה אחורה על כשל.
  async function handleStageChange(newStage: number) {
    if (!deal) return
    const prev = deal
    const stamp = new Date().toISOString()
    const by = profile?.full_name ?? ''
    setDeal({ ...deal, stage: newStage, stage_updated_at: stamp, stage_updated_by: by })
    const { error } = await supabase.from('deals')
      .update({ stage: newStage, stage_updated_at: stamp, stage_updated_by: by })
      .eq('id', deal.id)
    if (error) {
      console.error('[deal] stage update failed:', error)
      setDeal(prev)
      setFlash('עדכון השלב נכשל — נסה שוב')
      setTimeout(() => setFlash(null), 2500)
    }
  }
  const setNote = (k: string, v: string) => setForm(f => ({ ...f, notes: { ...f.notes, [k]: v } }))
  const setOther = (k: string, v: string) => setForm(f => ({ ...f, others: { ...f.others, [k]: v } }))
  const toggleNote = (k: string) => setNotesOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  function toggleWorkType(key: string) {
    setForm(f => {
      const on = f.workTypes.includes(key)
      const workTypes = on ? f.workTypes.filter(k => k !== key) : [...f.workTypes, key]
      // סנכרון קטגוריות חומרים נגזרות (הוספה בלבד — הסרה ידנית)
      const derived = derivedCategories(workTypes)
      const active = [...f.materials.active]
      const data = { ...f.materials.data }
      derived.forEach(k => { if (!active.includes(k)) { active.push(k); data[k] = data[k] ?? emptyCategory() } })
      const ordered = CATEGORY_ORDER.filter(k => active.includes(k))
      return { ...f, workTypes, materials: { active: ordered, data } }
    })
  }

  // ── טעינת דף קיים ─────────────────────────────────────────────
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    // רשת תקועה או שגיאה לא-צפויה לא ישאירו את הספינר תלוי לנצח — כיבוי fallback אחרי 8ש׳
    const loadTimeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)
    ;(async () => {
      let sheet: any = null, bs: any = null
      try {
        // שתי השאילתות תלויות רק ב-editId, לא זו בזו — במקביל (סבב רשת אחד במקום שניים).
        ;[sheet, bs] = await Promise.all([
          queryWithRetry<any>(() => supabase.from('execution_sheets').select('*').eq('id', editId).single()),
          queryWithRetry<any[]>(() => supabase.from('buildings').select('*').eq('sheet_id', editId).order('building_number').limit(1)),
        ])
      } catch (e) {
        console.error('[sheet] טעינת הדף נכשלה אחרי ריטריי:', e)
      }
      if (cancelled) return
      if (sheet) { sheetIdRef.current = sheet.id }
      if (cancelled) return
      const b = bs?.[0]
      const wc = (b?.work_content ?? {}) as Partial<SheetForm>
      const base = emptyForm()
      const merged: SheetForm = {
        details: { ...base.details, ...(wc.details ?? {}), date: sheet?.sheet_date ?? wc.details?.date ?? todayISO(), fillerName: wc.details?.fillerName ?? sheet?.filled_by_name ?? '', customerName: wc.details?.customerName ?? sheet?.project_name ?? '' },
        general: { ...base.general, ...(wc.general ?? {}) },
        logistics: { ...base.logistics, ...(wc.logistics ?? {}) },
        workTypes: wc.workTypes ?? (b?.work_types ?? []),
        blocks: { ...emptyBlocks(), ...(wc.blocks ?? {}), asbestos: normalizeAsbestos(wc.blocks?.asbestos) },
        materials: normalizeMaterials(b?.materials, base.materials),
        smartMaterials: normalizeSmartMaterials((wc as { smartMaterials?: unknown }).smartMaterials),
        documentation: { ...base.documentation, ...(wc.documentation ?? {}) },
        progress: (() => {
          const bp = emptyProgress()
          const pd = (sheet?.progress_data ?? {}) as Partial<ProgressData> & { estimated_days?: number | string }
          return {
            ...bp, ...pd,
            asbestos_permit: { ...bp.asbestos_permit, ...(pd.asbestos_permit ?? {}) },
            suppliers: (pd.suppliers && pd.suppliers.length) ? pd.suppliers : bp.suppliers,
            estimated_days: pd.estimated_days ? String(pd.estimated_days) : '',
          }
        })(),
        notes: wc.notes ?? {},
        others: wc.others ?? {},
      }
      // חתימות URL מחדש לתמונות (bucket פרטי) — כל החתימות במקביל (במקום סבב סדרתי לכל תמונה).
      const toSign: DocItem[] = []
      for (const sec of ['photos', 'sketch', 'documents'] as const) {
        for (const it of merged.documentation[sec]) {
          it.noteOpen = false
          if (it.path) toSign.push(it)
        }
      }
      await Promise.all(toSign.map(async it => {
        const { data: signed } = await supabase.storage.from('sheet-images').createSignedUrl(it.path, 60 * 60 * 24 * 365)
        it.url = signed?.signedUrl ?? it.url
      }))
      if (!cancelled) { setForm(merged); setLoading(false) }
    })().catch(e => {
      console.error('[sheet] טעינת הדף נכשלה:', e)
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true; clearTimeout(loadTimeout) }
  }, [editId])

  // ── שמירה ל-Supabase ──────────────────────────────────────────
  // רשת תקועה / Supabase שלא מגיב יכולים להשאיר את ה-await תלוי לנצח,
  // וה-finally שמכבה את "שומר…" לא ירוץ. מרוץ מול timeout מבטיח שהבטחה תיסגר תמיד.
  function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('הבקשה לא הושלמה בזמן (ייתכן בעיית רשת). נסה שוב.')), ms)
      ),
    ])
  }

  async function persist(status: 'field' | 'submitted'): Promise<string | null> {
    lastErrRef.current = null
    const f = latest.current
    // מזהה המשתמש נשלף מה-store בזיכרון ולא מ-supabase.auth.getSession().
    // getSession נכנס למכונת ה-auth-lock/refresh של supabase-js, שב-PWA של iOS
    // (standalone) עלולה להיתקע ולתלות את כל השמירה עד ל-timeout של 15ש׳ —
    // גם כשהרשת תקינה והשרת מגיב. ה-access token מצורף אוטומטית לבקשות ה-REST,
    // אז כאן צריך רק את ה-uid, שכבר קיים ב-store מרגע ההתחברות.
    const uid = user?.id ?? null
    if (!uid) { lastErrRef.current = 'החיבור פג. התחבר מחדש ונסה שוב.'; return null }

    const projectName = f.details.customerName.trim() || f.details.address.trim() || 'דף ביצוע — ללא שם'
    // בלוק החלפת אסבסט — מבנים כמערך; ממושכפל לעמודות ייעודיות ל-execution_sheets (דיווח/רשימה)
    const asbActive = f.workTypes.includes('asbestos')
    const asbBuildings = asbActive ? (f.blocks.asbestos.buildings ?? []) : []
    const asbTotalArea = asbBuildings.reduce((s, b) => s + num(b.roofSize), 0)
    const payload = {
      project_name: projectName,
      sheet_date: f.details.date || todayISO(),
      num_buildings: asbActive ? Math.max(1, asbBuildings.length) : 1,
      asbestos_buildings: asbBuildings,
      asbestos_total_area: asbTotalArea,
      filled_by: uid,
      filled_by_name: f.details.fillerName || profile?.full_name || '',
      created_by: uid,
      status,
      progress_data: {
        asbestos_permit: f.progress.asbestos_permit,
        suppliers: f.progress.suppliers,
        materials_order_date: f.progress.materials_order_date,
        materials_arrival_date: f.progress.materials_arrival_date,
        execution_date: f.progress.execution_date,
        estimated_days: num(f.progress.estimated_days),
        team_lead: f.progress.team_lead,
        subcontractor: f.progress.subcontractor,
      },
      updated_at: new Date().toISOString(),
    }

    let sid = sheetIdRef.current
    if (sid) {
      const { error } = await supabase.from('execution_sheets').update(payload).eq('id', sid)
      if (error) { lastErrRef.current = `שמירה נכשלה: ${error.message}`; return null }
    } else {
      const { data, error } = await supabase.from('execution_sheets').insert(payload).select('id').single()
      if (error || !data) { lastErrRef.current = `שמירה נכשלה: ${error?.message ?? 'שגיאה'}`; return null }
      sid = data.id; sheetIdRef.current = sid
    }

    // work_content jsonb — כל הטופס; materials jsonb — לשונית חומרים (שמור לוגיקה קיימת)
    const buildingPayload = {
      sheet_id: sid,
      building_number: 1,
      building_name: f.details.customerName || 'מבנה 1',
      work_types: f.workTypes,
      structure_type: f.general.construction ? [f.general.construction] : [],
      needs_crane: f.logistics.crane !== '' && f.logistics.crane !== 'לא נדרש',
      needs_container: f.logistics.container !== '' && f.logistics.container !== 'לא נדרש',
      work_content: {
        details: f.details, general: f.general, logistics: f.logistics,
        workTypes: f.workTypes, blocks: f.blocks,
        documentation: {
          photos: f.documentation.photos.map(stripDoc),
          sketch: f.documentation.sketch.map(stripDoc),
          documents: f.documentation.documents.map(stripDoc),
        },
        notes: f.notes,
        others: f.others,
        smartMaterials: f.smartMaterials,
      },
      materials: f.materials,
    }
    const { data: existing } = await supabase.from('buildings').select('id').eq('sheet_id', sid).eq('building_number', 1).limit(1)
    const bRes = existing?.[0]?.id
      ? await supabase.from('buildings').update(buildingPayload).eq('id', existing[0].id)
      : await supabase.from('buildings').insert(buildingPayload)
    if (bRes.error) { lastErrRef.current = `שמירת התוכן נכשלה: ${bRes.error.message}`; return null }
    await supabase.from('buildings').delete().eq('sheet_id', sid).gt('building_number', 1)
    return sid
  }
  // לא שומרים signed-url (זמני) ב-DB — רק path/name/note
  function stripDoc(it: DocItem) { return { path: it.path, name: it.name, note: it.note, url: '', noteOpen: false } }

  async function ensureSheetId(): Promise<string | null> {
    if (sheetIdRef.current) return sheetIdRef.current
    return await persist('field')
  }

  async function saveDraft() {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try {
      const sid = await withTimeout(persist('field'))
      if (sid) { setFlash('נשמר ✓'); setTimeout(() => setFlash(null), 1600) }
      else alert(lastErrRef.current ?? 'השמירה נכשלה')
    } catch (e) {
      alert(`השמירה נכשלה: ${e instanceof Error ? e.message : String(e)}`)
    } finally { savingRef.current = false; setSaving(false) }
  }
  // צפייה: שומרים טיוטה קודם (כדי שהצפייה תשקף את המצב הנוכחי) ואז עוברים למסך הצפייה.
  async function viewSheet() {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try {
      const sid = await withTimeout(persist('field'))
      if (sid) navigate(`/sheets/${sid}/view`)
      else alert(lastErrRef.current ?? 'השמירה נכשלה')
    } catch (e) {
      alert(`השמירה נכשלה: ${e instanceof Error ? e.message : String(e)}`)
    } finally { savingRef.current = false; setSaving(false) }
  }
  async function submit() {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try {
      const sid = await withTimeout(persist('submitted'))
      if (sid) { alert('✓ הדף נשמר ואושר בהצלחה'); navigate('/sheets') }
      else alert(lastErrRef.current ?? 'השמירה נכשלה')
    } catch (e) {
      alert(`השמירה נכשלה: ${e instanceof Error ? e.message : String(e)}`)
    } finally { savingRef.current = false; setSaving(false) }
  }

  // ── שמירה אוטומטית debounce 2s ────────────────────────────────
  function meaningful(f: SheetForm): boolean {
    return f.details.customerName.trim().length > 0 || f.details.address.trim().length > 0 || f.workTypes.length > 0
  }
  useEffect(() => {
    if (loading) return
    if (!meaningful(form)) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (savingRef.current) return
      // מסמנים "בשמירה" גם באוטו-סייב כדי שלא ירוץ במקביל לשמירה ידנית (persist כפול
      // על אותו דף) — וגם כאן עוטפים ב-withTimeout כדי שבקשה תקועה ב-iOS PWA
      // תשוחרר ולא תשאיר את הדגל דלוק. כשל אוטו-סייב שקט; שמירה ידנית תיתן משוב.
      savingRef.current = true
      withTimeout(persist('field'))
        .then(sid => { if (sid) { setFlash('נשמר אוטומטית ✓'); setTimeout(() => setFlash(null), 1300) } })
        .catch(() => { /* אוטו-סייב שקט */ })
        .finally(() => { savingRef.current = false })
    }, AUTOSAVE_MS)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, loading])

  // ── העלאת קבצים ל-storage: sheet-images ───────────────────────
  async function uploadDocs(section: keyof Documentation, files: FileList) {
    // חובה להעתיק את הקבצים למערך לפני כל await: ה-onChange של ה-input מאפס
    // את value='' מיד אחרי הקריאה, מה שמרוקן את ה-FileList לפני שנגיע לולאה
    // (בגלל זה תמונות "לא נשמרו" והמונה נשאר 0).
    const fileArr = Array.from(files)
    setUploading(true)
    try {
      const sid = await ensureSheetId()
      if (!sid) { alert(lastErrRef.current ?? 'צריך לשמור את הדף לפני העלאה'); return }
      const added: DocItem[] = []
      for (const file of fileArr) {
        const safe = file.name.replace(/[^\w.\-]/g, '_')
        const path = `${sid}/${section}/${Date.now()}_${safe}`
        const { error } = await supabase.storage.from('sheet-images').upload(path, file, { upsert: true })
        if (error) { console.error('[sheet] upload נכשל:', error.message); continue }
        const { data: signed } = await supabase.storage.from('sheet-images').createSignedUrl(path, 60 * 60 * 24 * 365)
        added.push({ path, url: signed?.signedUrl ?? '', name: file.name, note: '', noteOpen: false })
      }
      if (added.length) {
        setForm(f => ({ ...f, documentation: { ...f.documentation, [section]: [...f.documentation[section], ...added] } }))
      }
    } finally { setUploading(false) }
  }
  function removeDoc(section: keyof Documentation, idx: number) {
    setForm(f => {
      const item = f.documentation[section][idx]
      if (item?.path) supabase.storage.from('sheet-images').remove([item.path])
      return { ...f, documentation: { ...f.documentation, [section]: f.documentation[section].filter((_, i) => i !== idx) } }
    })
  }
  function setDocNote(section: keyof Documentation, idx: number, note: string, open: boolean) {
    setForm(f => ({ ...f, documentation: { ...f.documentation, [section]: f.documentation[section].map((it, i) => i === idx ? { ...it, note, noteOpen: open } : it) } }))
  }

  // ── קטגוריות חומרים ───────────────────────────────────────────
  function setCategory(key: string, c: MaterialCategory) {
    setForm(f => ({ ...f, materials: { ...f.materials, data: { ...f.materials.data, [key]: c } } }))
  }
  function removeCategory(key: string) {
    setForm(f => ({ ...f, materials: { ...f.materials, active: f.materials.active.filter(k => k !== key) } }))
  }
  function addCategory(key: string) {
    setForm(f => {
      if (f.materials.active.includes(key)) return f
      const active = CATEGORY_ORDER.filter(k => f.materials.active.includes(k) || k === key)
      return { ...f, materials: { active, data: { ...f.materials.data, [key]: f.materials.data[key] ?? emptyCategory() } } }
    })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: BG }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: RED, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    )
  }

  const subtitle = form.details.address.trim() || form.details.customerName.trim() || 'דף חדש'
  const inactiveCats = CATEGORY_ORDER.filter(k => !form.materials.active.includes(k))
  const noteProps = { notes: form.notes, setNotes: setNote, notesOpen, toggleNote }

  return (
    <div dir="rtl" className="esheet" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, fontFamily: 'Heebo, sans-serif' }}>
      <style>{'.esheet input::placeholder,.esheet textarea::placeholder{color:#555;opacity:1}'}</style>

      {/* Header */}
      <div style={{ background: RED, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <button onClick={() => navigate('/sheets')} title="סגור" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <line x1="6" y1="6" x2="18" y2="18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="18" y1="6" x2="6" y2="18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>דף ביצוע</span>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
        </div>
        <span style={{ width: 30 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', width: '100%', background: '#fff', flexShrink: 0, minHeight: 42, borderBottom: `1px solid ${BORDER}` }}>
        {([['details', 'פרטים'], ['docs', 'תיעוד'], ['materials', 'חומרים'], ['progress', '🚦 התקדמות']] as [TabKey, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, minHeight: 42, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: tab === key ? 800 : 500, color: tab === key ? RED : '#888',
            borderBottom: tab === key ? `2px solid ${RED}` : '2px solid transparent',
            whiteSpace: 'nowrap',
          }}>{label}</button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }} className="no-scrollbar">

        {/* ══ לשונית פרטים ══ */}
        {tab === 'details' && (
          <>
            <Card id="details" title="פרטים" {...noteProps}>
              <div style={{ marginBottom: 8 }}><Field label="תאריך"><TextInput type="date" value={form.details.date} onChange={v => patchDetails({ date: v })} /></Field></div>
              <div style={grid2}>
                <Field label="ממלא הדף"><SelectBox value={form.details.fillerName} onChange={v => patchDetails({ fillerName: v })} options={FILLERS} /></Field>
                <Field label="הזמנה מס׳"><TextInput value={form.details.orderNumber} onChange={v => patchDetails({ orderNumber: v })} placeholder="מס׳ הזמנה" maxLength={12} /></Field>
              </div>
              <div style={{ marginBottom: 8 }}><Field label="שם לקוח"><TextInput value={form.details.customerName} onChange={v => patchDetails({ customerName: v })} placeholder="שם הלקוח" /></Field></div>
              <div style={{ marginBottom: 8 }}><Field label="כתובת"><TextInput value={form.details.address} onChange={v => patchDetails({ address: v })} placeholder="כתובת האתר" /></Field></div>
              <div style={{ marginBottom: 8 }}>
                <div style={labelStyle}>טלפון</div>
                {form.details.phones.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <input dir="rtl" type="tel" inputMode="tel" style={inputStyle} value={p} placeholder="מספר טלפון"
                      onChange={e => patchDetails({ phones: form.details.phones.map((x, j) => j === i ? e.target.value : x) })} />
                    {i === form.details.phones.length - 1 ? (
                      <button type="button" onClick={() => patchDetails({ phones: [...form.details.phones, ''] })} style={roundBtn(RED)}>＋</button>
                    ) : (
                      <button type="button" onClick={() => patchDetails({ phones: form.details.phones.filter((_, j) => j !== i) })} style={roundBtn(GREY)}>−</button>
                    )}
                  </div>
                ))}
              </div>
              <Field label="הכנה סולרי"><YesNoChip value={form.details.solarPrep} onChange={v => patchDetails({ solarPrep: v })} /></Field>
            </Card>

            <Card id="general" title="מאפיינים כלליים" {...noteProps}>
              <div style={grid2}>
                <Field label="גובה גג"><SelectBox value={form.general.roofHeight} onChange={v => patchGeneral({ roofHeight: v })} options={ROOF_HEIGHT_OPTS} /></Field>
                <Field label="שטח (מ״ר)"><TextInput type="number" value={form.general.area} onChange={v => patchGeneral({ area: v })} placeholder="מ״ר" /></Field>
              </div>
              <div style={grid2}>
                <Field label="סוג גג"><SelectOther value={form.general.roofType} onChange={v => patchGeneral({ roofType: v })} options={ROOF_TYPES} okey="gen.roofType" others={form.others} setOther={setOther} /></Field>
                <Field label="קונסטרוקציה"><SelectOther value={form.general.construction} onChange={v => patchGeneral({ construction: v })} options={CONSTRUCTIONS} okey="gen.construction" others={form.others} setOther={setOther} /></Field>
              </div>
              <ChipGroup options={GENERAL_CHIPS} value={form.general.chips} onChange={v => patchGeneral({ chips: v })} />
            </Card>

            <Card id="logistics" title="לוגיסטיקה" {...noteProps}>
              <div style={grid2}>
                <Field label="מנוף"><SelectOther value={form.logistics.crane} onChange={v => patchLogistics({ crane: v })} options={CRANE_OPTS} okey="log.crane" others={form.others} setOther={setOther} /></Field>
                <Field label="מכולה"><SelectBox value={form.logistics.container} onChange={v => patchLogistics({ container: v })} options={CONTAINER_OPTS} /></Field>
              </div>
              <div style={grid2}>
                <Field label="במת הרמה"><SelectBox value={form.logistics.lift} onChange={v => patchLogistics({ lift: v })} options={LIFT_OPTS} /></Field>
                <Field label="זרוע/מספריים"><SelectBox value={form.logistics.arm} onChange={v => patchLogistics({ arm: v })} options={ARM_OPTS} /></Field>
              </div>
              <div style={grid2}>
                <Field label="גישה לאתר"><SelectBox value={form.logistics.access} onChange={v => patchLogistics({ access: v })} options={ACCESS_OPTS} /></Field>
                <Field label="גובה עבודה (מ׳)"><TextInput type="number" value={form.logistics.workHeight} onChange={v => patchLogistics({ workHeight: v })} placeholder="מ׳" /></Field>
              </div>
              <ChipGroup options={LOGISTICS_CHIPS} value={form.logistics.chips} onChange={v => patchLogistics({ chips: v })} />
            </Card>

            <Card title="סוג עבודה" tone="red">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {WORK_TYPES.map(wt => {
                  const active = form.workTypes.includes(wt.key)
                  return (
                    <button key={wt.key} type="button" onClick={() => toggleWorkType(wt.key)} style={{
                      border: active ? '1px solid #FFBBBB' : `1px solid ${BORDER}`,
                      background: active ? '#FFF0F0' : '#fff', color: active ? '#CC0000' : '#444',
                      borderRadius: 8, padding: '10px 8px', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', direction: 'rtl', fontFamily: 'inherit', textAlign: 'center',
                    }}>{wt.label}</button>
                  )
                })}
              </div>
            </Card>

            {form.workTypes.map(key => (
              <Card key={key} id={`wt:${key}`} title={WORK_TYPE_LABEL[key]} tone="orange" {...noteProps}>
                <WorkBlock typeKey={key} blocks={form.blocks} patch={patchBlocks} others={form.others} setOther={setOther} />
              </Card>
            ))}

            <div style={{ margin: '10px 8px' }}>
              <button type="button" onClick={() => alert('בקרוב')} style={{
                width: '100%', background: 'transparent', border: `1.5px dashed ${GREY}`, color: '#666',
                borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', direction: 'rtl',
              }}>＋ הוסף מבנה נוסף</button>
            </div>
          </>
        )}

        {/* ══ לשונית תיעוד ══ */}
        {tab === 'docs' && (
          <>
            <DocSection icon="📷" title="תמונות שטח" subtitle="תיעוד ויזואלי של האתר" items={form.documentation.photos}
              uploading={uploading} onAdd={f => uploadDocs('photos', f)} onRemove={i => removeDoc('photos', i)} onNote={(i, n, o) => setDocNote('photos', i, n, o)} />
            <DocSection icon="✏️" title="סקיצה" subtitle="שרטוט / סקיצת גג" items={form.documentation.sketch}
              uploading={uploading} onAdd={f => uploadDocs('sketch', f)} onRemove={i => removeDoc('sketch', i)} onNote={(i, n, o) => setDocNote('sketch', i, n, o)} />
            <DocSection icon="📄" title="מסמכים" subtitle="הזמנות / אישורים / מסמכים" items={form.documentation.documents}
              uploading={uploading} onAdd={f => uploadDocs('documents', f)} onRemove={i => removeDoc('documents', i)} onNote={(i, n, o) => setDocNote('documents', i, n, o)} />
          </>
        )}

        {/* ══ לשונית חומרים (חכמה — מבוססת קטלוג DB) ══ */}
        {tab === 'materials' && (
          <MaterialsTab
            workTypes={form.workTypes}
            value={form.smartMaterials}
            onChange={v => setForm(f => ({ ...f, smartMaterials: v }))}
          />
        )}

        {/* ══ לשונית התקדמות ══ */}
        {tab === 'progress' && (
          <ProgressTab
            progress={form.progress} workTypes={form.workTypes} onChange={patchProgress}
            others={form.others} setOther={setOther}
            isFull={isFullView} address={form.details.address}
            deal={deal} dealLoading={dealLoading} onStageChange={handleStageChange}
            roofActive={form.workTypes.includes('roofReplace')}
            roofSupplier={form.blocks.roofReplace.supplier ?? ''}
            roofOrderDate={form.blocks.roofReplace.orderDate ?? ''}
            onRoofSupplier={v => setRoof({ supplier: v })}
            onRoofOrderDate={v => setRoof({ orderDate: v })}
          />
        )}
      </div>

      {/* Flash */}
      {flash && (
        <div style={{
          position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
          background: '#111', color: '#fff', padding: '8px 18px', borderRadius: 20,
          fontSize: 13, fontWeight: 600, zIndex: 300, direction: 'rtl',
        }}>{flash}</div>
      )}

      {/* Footer */}
      <div style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={viewSheet} disabled={saving} title="צפייה בדף" style={{
          flexShrink: 0, background: '#fff', color: '#444', border: `1.5px solid ${BORDER}`, borderRadius: 10,
          padding: '13px 12px', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>👁️ צפייה</button>
        <button onClick={saveDraft} disabled={saving} style={{
          flex: 1, background: '#fff', color: RED, border: `1.5px solid ${RED}`, borderRadius: 10,
          padding: 13, fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>שמור טיוטה</button>
        <button onClick={submit} disabled={saving} style={{
          flex: 1, background: RED, color: '#fff', border: 'none', borderRadius: 10,
          padding: 14, fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>{saving ? 'שומר…' : '✓ אישור ושמירה'}</button>
      </div>
    </div>
  )
}

function roundBtn(color: string): React.CSSProperties {
  return {
    width: 34, height: 34, flexShrink: 0, borderRadius: '50%', border: `1px solid ${color}`,
    background: color === GREY ? '#fff' : color, color: color === GREY ? GREY : '#fff',
    cursor: 'pointer', fontSize: 18, lineHeight: 1, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
