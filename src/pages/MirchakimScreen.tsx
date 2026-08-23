import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SketchOverlay, { type Measure, type Proj, type GeoPt } from '../components/SketchOverlay'
import LocationPicker, { type PickedPoint } from '../components/LocationPicker'
import {
  PERMIT_TYPES, PERMIT_INFO, DEFAULT_PERMIT_TYPE, permitDef, permitTiming,
  classifyBuilding, classColors, labTestsLabel, toNum, ASB_FORM_OPTS,
  type PermitTypeKey, type LabTests,
} from '../lib/asbestosPermit'

// ── מרחקים למבנים סמוכים ─────────────────────────────────────────
// שתי נקודות כניסה, והתנהגות שונה בכל אחת:
//   ?sheetId=<uuid>  → התוצאה נשמרת אוטומטית ומקושרת לאותו דף ביצוע.
//   בלי sheetId      → בדיקה חד-פעמית שלא נשמרת, עם כפתור "קשר לעבודה"
//                      שמאפשר לשמור בדיעבד לדף שהמשתמש יבחר.
// כל החישוב בצד שרת (/mirchakim-api) — Overpass ו-Esri לא שולחים CORS,
// והרכבת פסיפס האריחים לא אפשרית בדפדפן בכל מקרה.

const RED = '#CC0000'
const CREAM = '#F2EDE9'
const GREY = '#8696A0'
const BORDER = '#E5DDD5'
const API = '/mirchakim-api'

interface Building {
  osm_id: string
  distance_m: number
  name: string | null
  needs_completion: boolean
  drawn?: boolean
  draw_reason?: string | null
  // מגיעים מהשרת מאז ומתמיד (asdict של ה-dataclass); poly_px נוסף עבור
  // שכבת הסימון — המתאר כבר מומר לפיקסלים ע"י אותו P שמצייר את הסקיצה.
  lat?: number
  lon?: number
  poly_px?: number[][]
}
interface PublicPlace { name: string; kind: string; distance_m: number; settlement: string | null }
interface Result {
  input: { source: string; itm: number[]; wgs84: number[]; label: string | null }
  buildings: Building[]
  public: PublicPlace[]
  image_meta: { zoom: number; meters_per_px: number; tiles: number; span_m: number; size_px: number[]; projection?: Proj }
  warnings: string[]
  image_url: string
  image_id: string
  resolved_address: string | null
  radius_m?: number
  public_radius_m?: number
  drawn_count?: number
  empty_directions?: string[]
  subject?: { osm_id: string; name: string | null } | null
}
interface SheetOpt { id: string; project_name: string; order_number: string | null }

// מועמד גיאוקודינג. הכלי לא בוחר לבד: Nominatim מחזיר לכתובת עם מספר בית
// את הרחוב בלבד (addresstype=road, בלי house_number), ולשם יישוב הוא מחזיר
// גם רחובות באותו שם בערים אחרות. בחירה עיוורת ב-hits[0] הניחה סקיצה
// בנקודה שרירותית — ובמקרה הגרוע בעיר אחרת לגמרי.
interface GeoCand {
  display_name: string
  lat: number; lon: number
  itm: number[]
  precision: string
  precision_note: string
  exact: boolean
  city: string | null
  house_number: string | null
}

// רשימת סוגי המבנה — זהה לרשימה הסגורה ב-NewExecutionSheet. מכוון: הערך
// 'סככה פתוחה' הוא תנאי בשתי תבניות סיווג, ולכן חייב להישאר ערך מוכר
// ולא טקסט חופשי.
const ASB_STRUCTURE_OPTS = ['סככה פתוחה', 'סככה סגורה', 'מגורים', 'מחסן', 'אחר']

// שורה בטבלת "מבנים עם אסבסט". _rest שומר את יתר שדות המבנה שנערכים
// במסכים אחרים (קונסטרוקציה, גובה, מקל סבא…) כדי ששמירה מכאן לא תמחק אותם.
interface AsbRow {
  id: string
  asbestosForm: string
  structureType: string
  roofSize: string
  ceiling: string            // 'יש' | 'אין' — ברירת המחדל השמרנית היא 'אין'
  demolition: boolean
  labTests: LabTests
  weightKg: string
  lengthM: string
  coordX: string
  coordY: string
  _rest: Record<string, unknown>
}
interface DistRow { id: string; name: string; distance_m: string }

let _rowSeq = 0
const rowId = () => `r${++_rowSeq}`

function emptyAsbRow(): AsbRow {
  return {
    id: rowId(), asbestosForm: '', structureType: '', roofSize: '', ceiling: 'אין',
    demolition: false, labTests: null, weightKg: '', lengthM: '', coordX: '', coordY: '', _rest: {},
  }
}

/** מבנה כפי שנשמר ב-work_content → שורת טבלה, בלי לאבד שדות לא-מוכרים. */
function toRow(b: Record<string, unknown>): AsbRow {
  const known = new Set(['asbestosForm', 'structureType', 'roofSize', 'ceiling',
                         'demolition', 'labTests', 'weightKg', 'lengthM', 'coordX', 'coordY'])
  const rest: Record<string, unknown> = {}
  for (const k of Object.keys(b)) if (!known.has(k)) rest[k] = b[k]
  const lt = b.labTests
  return {
    id: rowId(),
    asbestosForm: String(b.asbestosForm ?? ''),
    structureType: String(b.structureType ?? ''),
    roofSize: String(b.roofSize ?? ''),
    ceiling: b.ceiling === 'יש' ? 'יש' : 'אין',
    demolition: b.demolition === true,
    labTests: (typeof lt === 'number' || (lt && typeof lt === 'object')) ? (lt as LabTests) : null,
    weightKg: String(b.weightKg ?? ''),
    lengthM: String(b.lengthM ?? ''),
    coordX: String(b.coordX ?? ''),
    coordY: String(b.coordY ?? ''),
    _rest: rest,
  }
}

/** שורת טבלה → מבנה לשמירה, עם יתר השדות שנשמרו ב-_rest. */
function fromRow(r: AsbRow): Record<string, unknown> {
  const { id: _id, _rest, ...fields } = r
  void _id
  return { ..._rest, ...fields }
}

/** מרכז כובד של כל השורות שיש להן X/Y — נקודת העיגון לסקיצה. */
function centroidOf(rows: AsbRow[]): { x: number; y: number; n: number } | null {
  const pts = rows.map(r => [toNum(r.coordX), toNum(r.coordY)] as const)
                  .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null)
  if (!pts.length) return null
  const x = pts.reduce((a, p) => a + p[0], 0) / pts.length
  const y = pts.reduce((a, p) => a + p[1], 0) / pts.length
  return { x: Math.round(x), y: Math.round(y), n: pts.length }
}

const fmtNum = (n: number) => n.toLocaleString('he-IL')

type Method = 'itm' | 'address' | 'shot'

export default function MirchakimScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sheetId = params.get('sheetId')
  const linkedMode = !!sheetId

  const [method, setMethod] = useState<Method>('itm')
  const [itmX, setItmX] = useState('')
  const [itmY, setItmY] = useState('')
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<{ stage?: string; message: string } | null>(null)
  const [res, setRes] = useState<Result | null>(null)
  const [notes, setNotes] = useState('')
  // השלמות ידניות למבנים בלי שם ב-OSM, לפי osm_id
  const [completions, setCompletions] = useState<Record<string, string>>({})

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveMsg, setSaveMsg] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [sheets, setSheets] = useState<SheetOpt[]>([])
  const printRef = useRef<HTMLDivElement>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [radiusM, setRadiusM] = useState('')

  // ── שכבת סימון: מבנים נבחרים + קווי מדידה ──
  // מבנים לפי osm_id (יציב) ולא לפי אינדקס, וקווים ב-lat/lon ולא בפיקסלים —
  // שינוי רדיוס מרנדר בזום ופריסה אחרים, ופיקסלים שמורים היו הופכים לשקר.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [measures, setMeasures] = useState<Measure[]>([])
  const toggleBuilding = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
    setFormDirty(true)
  }
  const addMeasure = (m: { a: GeoPt; b: GeoPt }) => {
    setMeasures(prev => [...prev, { ...m, id: rowId() }])
    setFormDirty(true)
  }

  // ── קלט שלישי: קואורדינטות מצילום מסך של Govmap ──
  // התמונה משמשת לחילוץ X/Y בלבד — היא לא נשמרת ולא הופכת לרקע הסקיצה.
  const [geoCands, setGeoCands] = useState<GeoCand[] | null>(null)
  // המפה היא שלב אישור בין הקלט לחישוב. כל שלוש הלשוניות מייצרות נקודת
  // פתיחה, והמשתמש מכייל אותה ויזואלית לפני שמשלמים 40-200 שניות רינדור.
  const [pickAt, setPickAt] = useState<{ lat: number; lon: number; label: string | null } | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrMsg, setOcrMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const shotInput = useRef<HTMLInputElement>(null)

  async function readShot(file: File) {
    setOcrBusy(true); setOcrMsg(null)
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => reject(new Error('קריאת הקובץ נכשלה במכשיר'))
        fr.readAsDataURL(file)
      })
      const r = await fetch(`${API}/ocr-coords`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `השרת החזיר שגיאה ${r.status}`)
      setItmX(String(d.itm_x)); setItmY(String(d.itm_y))
      setMethod('itm')   // מעבר ללשונית ITM כדי שהמספרים שנקראו יהיו גלויים לבדיקה
      setOcrMsg({ ok: true, text: `זוהה X ${d.itm_x} · Y ${d.itm_y} — בדוק שהמספרים נכונים ולחץ חשב.` })
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setOcrMsg({ ok: false, text: m.includes('Failed to fetch')
        ? 'לא הצלחנו להגיע לשרת. ודא חיבור אינטרנט ונסה שוב.' : m })
    } finally { setOcrBusy(false) }
  }

  // ── טופס האסבסט ──
  const [permitType, setPermitType] = useState<PermitTypeKey>(DEFAULT_PERMIT_TYPE)
  const [infoOpen, setInfoOpen] = useState(false)
  const [asbRows, setAsbRows] = useState<AsbRow[]>([])
  const [editAsb, setEditAsb] = useState(false)
  const [distRows, setDistRows] = useState<DistRow[]>([])
  const [editDist, setEditDist] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  const [formState, setFormState] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [formMsg, setFormMsg] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [sheetOrder, setSheetOrder] = useState('')

  const patchRow = (id: string, p: Partial<AsbRow>) => {
    setAsbRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
    setFormDirty(true)
  }
  const patchDist = (id: string, p: Partial<DistRow>) => {
    setDistRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
    setFormDirty(true)
  }

  const totalArea = asbRows.reduce((sum, r) => sum + (toNum(r.roofSize) ?? 0), 0)
  // עמודות אורך/משקל מוצגות רק כשיש בהן ערך או במצב עריכה — כדי שדף
  // הדפסה של פרויקט גגות רגיל לא יסחב שתי עמודות ריקות.
  const showLen = editAsb || asbRows.some(r => toNum(r.lengthM) !== null)
  const showKg = editAsb || asbRows.some(r => toNum(r.weightKg) !== null)

  // מדרג ההרחבה. כל הכפלה מרבעת את מספר האריחים, לכן צעדים ולא רציף.
  const RADIUS_STEPS = [100, 150, 250, 400, 600, 900, 1200]

  function openPicker(la: number, lo: number) {
    setPickAt({ lat: la, lon: lo, label: label.trim() || address.trim() || null })
  }

  /** ITM → lat/lon בשרת. ההיטל נשאר במקום אחד. */
  async function startFromItm() {
    setBusy(true); setErr(null)
    try {
      if (!itmX.trim() || !itmY.trim()) throw new Error('הזן גם X וגם Y מתחתית Govmap.')
      const r = await fetch(`${API}/to-latlon`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itm_x: itmX.trim(), itm_y: itmY.trim() }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `השרת החזיר שגיאה ${r.status}`)
      openPicker(d.lat, d.lon)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErr({ message: m.includes('Failed to fetch')
        ? 'לא הצלחנו להגיע לשרת. ודא חיבור אינטרנט ונסה שוב.' : m })
    } finally { setBusy(false) }
  }

  /** מסלול הכתובת: קודם מועמדים, בחירה מפורשת, ורק אז מפה. */
  async function findAddress() {
    setBusy(true); setErr(null); setGeoCands(null)
    try {
      if (!address.trim()) throw new Error('הזן כתובת.')
      const r = await fetch(`${API}/geocode`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `השרת החזיר שגיאה ${r.status}`)
      const cands: GeoCand[] = d.candidates ?? []
      // רק התאמה מדויקת ויחידה ממשיכה לבד. כל השאר — המשתמש מכריע.
      if (cands.length === 1 && cands[0].exact) { openPicker(cands[0].lat, cands[0].lon); return }
      setGeoCands(cands)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErr({ message: m.includes('Failed to fetch')
        ? 'לא הצלחנו להגיע לשרת. ודא חיבור אינטרנט ונסה שוב.' : m })
    } finally { setBusy(false) }
  }

  async function run(overrideRadius?: number, point?: { lat: number; lon: number }) {
    // שינוי רדיוס (overrideRadius) שומר סימונים — אותו מיקום.
    // חישוב חדש מהכפתור = מיקום אחר בפועל, ולכן מאפס.
    if (overrideRadius === undefined) { setSelectedIds(new Set()); setMeasures([]) }
    setBusy(true); setErr(null); setRes(null); setSaveState('idle'); setSaveMsg('')
    try {
      const body: Record<string, string> = { label }
      const rad = overrideRadius ?? (radiusM.trim() ? Number(radiusM.trim()) : null)
      if (rad && Number.isFinite(rad)) body.radius_m = String(Math.round(rad))
      if (point) {
        body.lat = String(point.lat); body.lon = String(point.lon)
      } else if (method === 'itm') {
        if (!itmX.trim() || !itmY.trim()) throw new Error('הזן גם X וגם Y מתחתית Govmap.')
        body.itm_x = itmX.trim(); body.itm_y = itmY.trim()
      } else {
        if (!address.trim()) throw new Error('הזן כתובת.')
        body.address = address.trim()
      }
      const r = await fetch(`${API}/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await r.json().catch(() => null)
      if (!r.ok) {
        // השרת מחזיר stage+error מפורשים — מציגים אותם כמו שהם, בלי לעגל פינות
        throw new Error(data?.error || `השרת החזיר שגיאה ${r.status}`)
        }
      setRes(data as Result)
      if (data?.stage) setErr({ stage: data.stage, message: data.error })
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErr({ message: m.includes('Failed to fetch')
        ? 'לא הצלחנו להגיע לשרת החישוב. ודא חיבור אינטרנט ונסה שוב.' : m })
    } finally { setBusy(false) }
  }

  // שמירה אוטומטית כשנכנסנו מדף ביצוע
  useEffect(() => {
    if (res && linkedMode && saveState === 'idle') {
      void saveTo(sheetId!)          // הסקיצה (PNG) → storage + sheet_images
      void saveForm(sheetId!)        // סוג ההיתר + שתי הטבלאות → work_content
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res])

  // טעינת מבנים + סוג היתר מדף הביצוע. המקור הקנוני הוא
  // buildings.work_content.blocks.asbestos.buildings[]; העמודה
  // execution_sheets.asbestos_buildings היא שכפול לדיווח בלבד.
  useEffect(() => {
    if (!sheetId) return
    let cancelled = false
    ;(async () => {
      setFormState('loading'); setFormMsg('')
      const [sheetRes, bRes] = await Promise.all([
        supabase.from('execution_sheets').select('progress_data, asbestos_buildings, project_name, order_number').eq('id', sheetId).single(),
        supabase.from('buildings').select('work_content').eq('sheet_id', sheetId).order('building_number').limit(1),
      ])
      if (cancelled) return
      if (sheetRes.error) {
        setFormState('error')
        setFormMsg(`טעינת דף הביצוע נכשלה: ${sheetRes.error.message}`)
        return
      }
      if (bRes.error) {
        setFormState('error')
        setFormMsg(`טעינת תוכן הדף נכשלה: ${bRes.error.message}`)
        return
      }
      setSheetName(String(sheetRes.data?.project_name ?? ''))
      setSheetOrder(String(sheetRes.data?.order_number ?? ''))
      const wc = (bRes.data?.[0]?.work_content ?? {}) as Record<string, any>
      const fromWc = wc?.blocks?.asbestos?.buildings
      const fromCol = sheetRes.data?.asbestos_buildings
      const raw: unknown[] = Array.isArray(fromWc) && fromWc.length ? fromWc
                           : Array.isArray(fromCol) ? fromCol : []
      // מבנה ריק לגמרי (כל השדות ריקים) נחשב "אין נתונים" ולא שורה מיותרת
      const rows = raw.map(b => toRow((b ?? {}) as Record<string, unknown>))
                      .filter(r => r.roofSize || r.coordX || r.coordY || r.structureType || r.asbestosForm)
      setAsbRows(rows)
      const savedDist = wc?.mirchakim?.distances
      if (Array.isArray(savedDist) && savedDist.length) {
        setDistRows(savedDist.map((d: Record<string, unknown>) => ({
          id: rowId(), name: String(d.name ?? ''), distance_m: String(d.distance_m ?? ''),
        })))
      }
      const savedSel = wc?.mirchakim?.selected_buildings
      if (Array.isArray(savedSel)) setSelectedIds(new Set(savedSel.map(String)))
      const savedMeas = wc?.mirchakim?.measures
      if (Array.isArray(savedMeas)) {
        setMeasures(savedMeas
          .filter((m: Record<string, GeoPt>) => m?.a?.lat != null && m?.b?.lat != null)
          .map((m: Record<string, GeoPt>) => ({ id: rowId(), a: m.a, b: m.b })))
      }
      const pt = sheetRes.data?.progress_data?.asbestos_permit?.permit_type
      setPermitType(PERMIT_TYPES.some(t => t.key === pt) ? pt : DEFAULT_PERMIT_TYPE)
      setFormDirty(false)
      setFormState('idle')
      if (!rows.length) setFormMsg('לדף הביצוע הזה עדיין אין מבנים — הוסף אותם בטבלה למטה.')
    })().catch(e => {
      if (cancelled) return
      setFormState('error')
      setFormMsg(`טעינת הטופס נכשלה: ${e instanceof Error ? e.message : String(e)}`)
    })
    return () => { cancelled = true }
  }, [sheetId])

  // טבלת המרחקים נזרעת מתוצאת המנוע, ומכאן והלאה ניתנת לעריכה ידנית.
  useEffect(() => {
    if (!res) return
    setDistRows(res.buildings.map((b, i) => ({
      id: rowId(),
      name: b.name?.trim() || `מבנה ללא שם ב-OSM #${i + 1}`,
      distance_m: String(b.distance_m),
    })))
  }, [res])

  /** שמירת סוג ההיתר + טבלת המבנים לדף ביצוע. read-modify-write על
   *  work_content כדי לא לדרוס לשוניות אחרות של אותו דף. */
  async function saveForm(targetSheetId: string) {
    setFormState('saving'); setFormMsg('')
    try {
      const buildings = asbRows.map(fromRow)
      const total = asbRows.reduce((sum, r) => sum + (toNum(r.roofSize) ?? 0), 0)

      const { data: bs, error: bErr } = await supabase.from('buildings')
        .select('id, work_content, work_types').eq('sheet_id', targetSheetId)
        .order('building_number').limit(1)
      if (bErr) throw new Error(`קריאת תוכן הדף נכשלה: ${bErr.message}`)

      const row = bs?.[0]
      const wc = (row?.work_content ?? {}) as Record<string, any>
      const blocks = { ...(wc.blocks ?? {}) }
      blocks.asbestos = { ...(blocks.asbestos ?? {}), buildings }
      // בלי 'asbestos' ב-workTypes, שמירה עתידית מ-NewExecutionSheet מאפסת
      // את asbestos_buildings — לכן מוודאים שהסוג מסומן.
      const prevTypes: string[] = Array.isArray(wc.workTypes) ? wc.workTypes
                                : Array.isArray(row?.work_types) ? row!.work_types : []
      const workTypes = prevTypes.includes('asbestos') ? prevTypes : [...prevTypes, 'asbestos']
      const mirchakim = {
        ...(wc.mirchakim ?? {}),
        distances: distRows.map(d => ({ name: d.name, distance_m: d.distance_m })),
        selected_buildings: [...selectedIds],
        measures: measures.map(m => ({ a: m.a, b: m.b })),
        image_id: res?.image_id ?? (wc.mirchakim?.image_id ?? null),
        radius_m: res ? radiusOf(res) : (wc.mirchakim?.radius_m ?? null),
        updated_at: new Date().toISOString(),
      }
      const newWc = { ...wc, blocks, workTypes, mirchakim }

      if (row?.id) {
        const { error } = await supabase.from('buildings')
          .update({ work_content: newWc, work_types: workTypes }).eq('id', row.id)
        if (error) throw new Error(`שמירת המבנים נכשלה: ${error.message}`)
      } else {
        const { error } = await supabase.from('buildings').insert({
          sheet_id: targetSheetId, building_number: 1, building_name: 'מבנה 1',
          work_types: workTypes, work_content: newWc,
        })
        if (error) throw new Error(`יצירת רשומת המבנים נכשלה: ${error.message}`)
      }

      const { data: sh, error: shErr } = await supabase.from('execution_sheets')
        .select('progress_data').eq('id', targetSheetId).single()
      if (shErr) throw new Error(`קריאת ההתקדמות נכשלה: ${shErr.message}`)
      const pd = (sh?.progress_data ?? {}) as Record<string, any>
      const progress_data = {
        ...pd,
        asbestos_permit: { ...(pd.asbestos_permit ?? {}), permit_type: permitType },
      }
      const { error: upErr } = await supabase.from('execution_sheets').update({
        asbestos_buildings: buildings,
        asbestos_total_area: total,
        num_buildings: Math.max(1, buildings.length),
        progress_data,
        updated_at: new Date().toISOString(),
      }).eq('id', targetSheetId)
      if (upErr) throw new Error(`עדכון דף הביצוע נכשל: ${upErr.message}`)

      setFormDirty(false)
      setFormState('saved')
      setFormMsg(`נשמרו ${buildings.length} מבנים · ${fmtNum(Math.round(total))} מ"ר · ${permitDef(permitType).label}`)
    } catch (e) {
      setFormState('error')
      setFormMsg(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveTo(targetSheetId: string) {
    if (!res) return
    setSaveState('saving'); setSaveMsg('')
    try {
      const blob = await (await fetch(res.image_url)).blob()
      if (!blob.size) throw new Error('התמונה שהתקבלה ריקה')
      const path = `${targetSheetId}/mirchakim/${res.image_id}.png`
      const { error: upErr } = await supabase.storage.from('sheet-images')
        .upload(path, blob, { contentType: 'image/png', upsert: true })
      if (upErr) throw new Error(`העלאת התמונה נכשלה: ${upErr.message}`)
      const desc = [
        `מרחקים למבנים סמוכים — ${res.buildings.length} מבנים ברדיוס ${radiusOf(res)} מ׳`,
        res.input.label || null,
        `ITM ${res.input.itm[0]}/${res.input.itm[1]}`,
        notes.trim() || null,
      ].filter(Boolean).join(' | ')
      const { error: insErr } = await supabase.from('sheet_images')
        .insert({ sheet_id: targetSheetId, storage_path: path, image_type: 'sketch', description: desc })
      if (insErr) throw new Error(`שמירת הרשומה נכשלה: ${insErr.message}`)
      setSaveState('saved')
      setSaveMsg('נשמר וקושר לדף הביצוע')
    } catch (e) {
      setSaveState('error')
      setSaveMsg(e instanceof Error ? e.message : String(e))
    }
  }

  async function openLinkPicker() {
    setLinkOpen(true)
    const { data, error } = await supabase.from('execution_sheets')
      .select('id, project_name, order_number').eq('is_archived', false)
      .order('created_at', { ascending: false }).limit(200)
    if (error) { setSaveState('error'); setSaveMsg(`טעינת רשימת הדפים נכשלה: ${error.message}`); return }
    setSheets((data ?? []) as SheetOpt[])
  }

  const named = res?.buildings.filter(b => !b.needs_completion) ?? []
  const unnamed = res?.buildings.filter(b => b.needs_completion) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: RED, padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }} className="no-print">
        <button onClick={() => navigate(-1)} title="חזרה"
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 22, fontFamily: 'inherit' }}>←</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
          <span style={{ color: '#fff', fontSize: 19, fontWeight: 700 }}>מרחקים למבנים סמוכים</span>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
            {linkedMode ? 'התוצאה תישמר בדף הביצוע' : 'בדיקה חד-פעמית — לא נשמרת'}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: CREAM, direction: 'rtl' }} className="no-scrollbar">
        {/* ── קלט ── */}
        <div style={{ background: '#fff', padding: 14, borderBottom: `1px solid ${BORDER}` }} className="no-print">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {([['itm', 'ITM'], ['address', 'כתובת'], ['shot', '📷 צילום מסך']] as [Method, string][]).map(([m, t]) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                style={{ flex: 1, padding: '9px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 700, border: `1px solid ${method === m ? RED : BORDER}`,
                  background: method === m ? RED : '#fff', color: method === m ? '#fff' : '#555' }}>{t}</button>
            ))}
          </div>

          {method === 'itm' ? (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <Field label="X (מזרח)"><Inp value={itmX} onChange={setItmX} placeholder="לדוגמה 181157" dir="ltr"
                  invalid={!!err && !itmX.trim()} /></Field>
                <Field label="Y (צפון)"><Inp value={itmY} onChange={setItmY} placeholder="לדוגמה 672380" dir="ltr"
                  invalid={!!err && !itmY.trim()} /></Field>
              </div>
              <div style={{ fontSize: 11.5, color: GREY, marginTop: 4 }}>
                העתק מתחתית מסך Govmap — X ואחריו Y.
              </div>
            </>
          ) : method === 'address' ? (
            <Field label="כתובת"><Inp value={address} onChange={setAddress} placeholder="לדוגמה: הרצל 1 תל אביב" /></Field>
          ) : (
            <>
              <input ref={shotInput} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) void readShot(f); e.target.value = '' }} />
              <button type="button" disabled={ocrBusy} onClick={() => shotInput.current?.click()}
                style={{ width: '100%', padding: '14px 0', borderRadius: 10, cursor: ocrBusy ? 'default' : 'pointer',
                  border: `1px dashed ${ocrBusy ? '#bbb' : GREY}`, background: '#fff',
                  color: ocrBusy ? '#888' : '#1A5FAD', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>
                {ocrBusy ? 'קורא את התמונה…' : '📷 בחר צילום מסך של Govmap'}
              </button>
              <div style={{ fontSize: 11.5, color: GREY, marginTop: 6, lineHeight: 1.5 }}>
                צלם את מסך Govmap כך שהשורה התחתונה עם X ו-Y נכללת בתמונה.
                המספרים ימולאו אוטומטית ותוכל לבדוק אותם לפני החישוב.
                התמונה משמשת לקריאת הקואורדינטות בלבד — היא אינה נשמרת ואינה הרקע של הסקיצה.
              </div>
            </>
          )}

          {ocrMsg && (
            <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.5,
              background: ocrMsg.ok ? '#E8F5E9' : '#FDECEC',
              border: `1px solid ${ocrMsg.ok ? '#A5D6A7' : '#F0A9B2'}`,
              color: ocrMsg.ok ? '#1A5A2A' : '#8E1B27' }}>
              {ocrMsg.ok ? '✓ ' : '⚠️ '}{ocrMsg.text}
            </div>
          )}

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <div style={{ flex: 2 }}>
              <Field label="שם / תיאור (לא חובה)"><Inp value={label} onChange={setLabel} placeholder="למשל: מחסן אסבסט מזרחי" /></Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="רדיוס (מ׳)"><Inp value={radiusM} onChange={setRadiusM} placeholder="ברירת מחדל 100" dir="ltr" /></Field>
            </div>
          </div>

          {/* אתר עם כמה מבנים לא נכנס ברדיוס ברירת המחדל מאף נקודה בודדת —
              מרכז הכובד של המבנים שהוזנו הוא נקודת העיגון הנכונה לסקיצה. */}
          {(() => {
            const c = centroidOf(asbRows)
            if (!c || c.n < 2) return null
            return (
              <button type="button"
                onClick={() => { setMethod('itm'); setItmX(String(c.x)); setItmY(String(c.y)); if (!radiusM.trim()) setRadiusM('150') }}
                style={{ width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${BORDER}`, background: '#fff', color: '#1A5FAD', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                📍 מרכז הכובד של {c.n} המבנים ({c.x}/{c.y}) · רדיוס 150 מ׳
              </button>
            )
          })()}

          <button type="button" onClick={() => void (method === 'address' ? findAddress() : startFromItm())} disabled={busy}
            style={{ width: '100%', marginTop: 12, padding: '12px 0', borderRadius: 24, border: 'none',
              background: busy ? '#bbb' : RED, color: '#fff', fontSize: 15.5, fontWeight: 700,
              cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {busy ? 'מחשב… (עד דקה)' : method === 'address' ? 'אתר כתובת' : 'המשך למפה'}
          </button>
        </div>

        {/* ── מועמדי כתובת ──
            הגרסה הראשונה הובילה ב"⚠️ מספר הבית לא נמצא" על רקע כתום,
            והמועמדים למטה נראו כטקסט. משתמש קרא את זה כשגיאה שלוש פעמים.
            זה לא כשל אלא שלב: מאז שיש מפה, מספר בית חסר כמעט לא משנה —
            בוחרים גס ומכווננים. הכותרת היא הוראה, והשורות הן כפתורים. */}
        {geoCands && (
          <div style={{ background: '#fff', margin: '10px 0', borderTop: `1px solid ${BORDER}`,
                        borderBottom: `1px solid ${BORDER}` }} className="no-print">
            <div style={{ padding: '10px 12px', background: '#EEF2FF', borderBottom: '1px solid #C7D2FE' }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1A3E7A' }}>
                {geoCands.length === 0 ? 'לא נמצאה התאמה' : 'בחר נקודת פתיחה'}
              </div>
              {geoCands.length > 0 && (
                <div style={{ fontSize: 12.5, color: '#1A3E7A', marginTop: 3, lineHeight: 1.5 }}>
                  {geoCands.some(c => c.exact)
                    ? 'לחץ על אחת מהאפשרויות, ותוכל לכוון את הנקודה במפה.'
                    : 'מספר הבית לא קיים במאגר הכתובות, אז אלה נקודות על הרחוב. לחץ על אחת — במפה תגרור לבניין המדויק.'}
                </div>
              )}
            </div>
            {geoCands.map((c, i) => (
              <button key={i} type="button"
                onClick={() => { setGeoCands(null); openPicker(c.lat, c.lon) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'right',
                  padding: '12px', border: 'none', borderBottom: '1px solid #F0F2F5', background: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', direction: 'rtl' }}>
                <span style={{ fontSize: 20, color: '#1A5FAD', flexShrink: 0 }}>🗺</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 10,
                      background: c.exact ? '#E8F5E9' : '#EFEBE7', color: c.exact ? '#1A5A2A' : '#4A4A4A' }}>
                      {c.precision}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.display_name}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: GREY, marginTop: 3 }} dir="ltr">
                    ITM {Math.round(c.itm[0])} / {Math.round(c.itm[1])}
                  </span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1A5FAD', flexShrink: 0,
                  whiteSpace: 'nowrap' }}>כוון במפה ‹</span>
              </button>
            ))}
            <button type="button" onClick={() => setGeoCands(null)}
              style={{ display: 'block', width: '100%', padding: '9px 12px', border: 'none',
                background: '#FAFAF8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: '#666' }}>
              ביטול
            </button>
          </div>
        )}

        {/* ── שגיאה — מפורשת, אף פעם לא ריק שקט ── */}
        {err && (
          <div style={{ margin: 14, padding: '12px 14px', background: '#FDECEC', border: '1px solid #F0A9B2', borderRadius: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#8E1B27' }}>
              ⚠️ {err.stage ? `כשל בשלב: ${err.stage}` : 'החישוב נכשל'}
            </div>
            <div style={{ fontSize: 13, color: '#6B1520', marginTop: 4, lineHeight: 1.5 }}>{err.message}</div>
          </div>
        )}

        <div ref={printRef}>
            {/* ── כותרת הדפסה (מוצגת רק בהדפסה) ── */}
            <div className="print-only" style={{ padding: '0 12px 6px', direction: 'rtl' }}>
              <div style={{ fontSize: 19, fontWeight: 800 }}>
                טופס אסבסט — {sheetName || res?.input.label || label || 'ללא שם'}
              </div>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                סוג היתר: <b>{permitDef(permitType).label}</b>
                {permitDef(permitType).undefinedYet && ' (טרם הוגדר — מתנהג כהיתר רגיל)'}
                {sheetOrder ? ` · הזמנה ${sheetOrder}` : ''}
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{permitTiming(permitType)}</div>
            </div>

            {/* ── התמונה ── */}
            {res && (<>
            <div style={{ background: '#fff', padding: 12, marginTop: 10 }}>
              {/* התמונה הקטנה + שכבה סטטית. ה-Lightbox הוא no-print, ולכן זו
                  השכבה היחידה שמגיעה ל-PDF — היא קוראת בדיוק את אותו מצב
                  שמור, ואינה ניתנת ללחיצה (כל העריכה ב-Lightbox). */}
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setZoomOpen(true)}
                  style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                  title="הגדל">
                  <img src={res.image_url} alt="תצלום אווירי עם מרחקים"
                    style={{ width: '100%', borderRadius: 8, display: 'block' }} />
                </button>
                {res.image_meta.projection && (selectedIds.size > 0 || measures.length > 0) && (
                  <SketchOverlay width={res.image_meta.size_px[0]} height={res.image_meta.size_px[1]}
                    metersPerPx={res.image_meta.meters_per_px} proj={res.image_meta.projection}
                    buildings={res.buildings} selected={selectedIds} measures={measures} />
                )}
              </div>
              <div style={{ fontSize: 11.5, color: GREY, marginTop: 4, textAlign: 'center' }} className="no-print">
                לחץ על התמונה להגדלה — שם אפשר גם לסמן מבנים ולמדוד מרחקים
              </div>
              {(selectedIds.size > 0 || measures.length > 0) && (
                <div style={{ fontSize: 12, color: '#1A3E7A', background: '#EEF2FF', borderRadius: 8,
                  padding: '6px 10px', marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }} className="no-print">
                  {selectedIds.size > 0 && <span>🏠 {selectedIds.size} מבנים מסומנים</span>}
                  {measures.length > 0 && <span>📏 {measures.length} קווי מדידה</span>}
                  {!linkedMode && <span style={{ color: '#8A4B00' }}>· לא יישמר — קשר לעבודה כדי לשמור</span>}
                </div>
              )}

              {/* הרחבת התצוגה — בדיקה עינית שלא הוחמצו מבנים מחוץ לרדיוס.
                  מריץ מחדש את כל השליפה (Overpass + תצלום), לכן זו פעולה
                  יקרה ולא סליידר רציף. */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }} className="no-print">
                <span style={{ fontSize: 12.5, color: '#555', fontWeight: 700 }}>
                  רדיוס נוכחי: {radiusOf(res)} מ׳
                </span>
                {(() => {
                  const cur = radiusOf(res)
                  const next = RADIUS_STEPS.find(v => v > cur)
                  const prev = [...RADIUS_STEPS].reverse().find(v => v < cur)
                  return (
                    <>
                      {next && (
                        <button type="button" disabled={busy}
                          onClick={() => { setRadiusM(String(next)); void run(next) }}
                          style={stepBtn(busy)}>🔍 הרחב ל-{next} מ׳</button>
                      )}
                      {prev && (
                        <button type="button" disabled={busy}
                          onClick={() => { setRadiusM(String(prev)); void run(prev) }}
                          style={stepBtn(busy)}>צמצם ל-{prev} מ׳</button>
                      )}
                      {!next && (
                        <span style={{ fontSize: 11.5, color: GREY }}>זה הרדיוס המרבי</span>
                      )}
                    </>
                  )
                })()}
              </div>
              <div style={{ fontSize: 11.5, color: GREY, marginTop: 6, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span>קנה מידה: {res.image_meta.meters_per_px} מ׳/פיקסל · זום {res.image_meta.zoom}</span>
                <span dir="ltr">ITM {res.input.itm[0]} / {res.input.itm[1]}</span>
              </div>
              {res.resolved_address && (
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>כתובת שזוהתה: {res.resolved_address}</div>
              )}
            </div>

            {res.warnings?.length > 0 && (
              <div className="no-print" style={{ margin: '10px 14px', padding: '8px 10px', background: '#FFF8E6', border: '1px solid #F0D98C', borderRadius: 8, fontSize: 12, color: '#7a5b00' }}>
                {res.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
              </div>
            )}
            </>)}

            {/* ── סוג היתר (לא נכנס להדפסה — הסוג מופיע בכותרת) ── */}
            <div className="no-print">
              <PermitSection value={permitType}
                onChange={v => { setPermitType(v); setFormDirty(true) }}
                infoOpen={infoOpen} setInfoOpen={setInfoOpen} />
            </div>

            {/* ── טבלה 1: מבנים עם אסבסט ── */}
            <Section title="מבנים עם אסבסט" badge={String(asbRows.length)}
              action={<EditToggle on={editAsb} onClick={() => setEditAsb(!editAsb)} />}>
              {asbRows.length > 0 && (() => {
                const counts = asbRows.reduce<Record<string, number>>((a, r) => {
                  const c = classifyBuilding(r); a[c.label] = (a[c.label] ?? 0) + 1; return a }, {})
                return (
                  <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
                    padding: '8px 12px', borderBottom: '1px solid #F6F4F2' }}>
                    <span style={{ fontSize: 12, color: GREY, fontWeight: 700 }}>סיווג מוצע:</span>
                    {Object.entries(counts).map(([labelText, n]) => {
                      const key = PERMIT_TYPES.find(t => t.label === labelText)?.key ?? 'regular'
                      const col = classColors(key)
                      return (
                        <span key={labelText} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11.5,
                          fontWeight: 800, background: col.bg, color: col.fg }}>{labelText} × {n}</span>
                      )
                    })}
                  </div>
                )
              })()}
              {asbRows.length === 0 ? (
                <Empty text={linkedMode
                  ? 'אין עדיין מבנים בדף הביצוע הזה. לחץ "✏️ ערוך" ואז "+ הוסף מבנה".'
                  : 'לא הוזנו מבנים. לחץ "✏️ ערוך" ואז "+ הוסף מבנה".'} />
              ) : (
                <div className="tbl-scroll" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl' }}>
                    <thead>
                      <tr>
                        <th style={th}>מס׳</th>
                        <th style={th}>סוג אסבסט</th>
                        <th style={th}>סוג מבנה</th>
                        <th style={th}>שטח (מ"ר)</th>
                        {showLen && <th style={th}>אורך (מ׳)</th>}
                        {showKg && <th style={th}>משקל (ק"ג)</th>}
                        <th style={th}>תקרה קשיחה</th>
                        <th style={th}>להריסה</th>
                        <th style={th}>דגימות</th>
                        <th style={th}>X</th>
                        <th style={th}>Y</th>
                        <th style={{ ...th }} className="no-print">סיווג מוצע</th>
                        {editAsb && <th style={th} className="no-print" />}
                      </tr>
                    </thead>
                    <tbody>
                      {asbRows.map((r, i) => (
                        <tr key={r.id}>
                          <td style={{ ...td, fontWeight: 800 }}>{i + 1}</td>
                          <td style={td}>{editAsb
                            ? <CellSel value={r.asbestosForm} options={ASB_FORM_OPTS} onChange={v => patchRow(r.id, { asbestosForm: v })} />
                            : (r.asbestosForm || <span style={{ color: GREY }}>—</span>)}</td>
                          <td style={td}>{editAsb
                            ? <CellSel value={r.structureType} options={ASB_STRUCTURE_OPTS} onChange={v => patchRow(r.id, { structureType: v })} />
                            : (r.structureType || <span style={{ color: GREY }}>—</span>)}</td>
                          <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{editAsb
                            ? <CellInp value={r.roofSize} dir="ltr" onChange={v => patchRow(r.id, { roofSize: v })} />
                            : (toNum(r.roofSize) !== null ? fmtNum(toNum(r.roofSize)!) : <span style={{ color: GREY }}>—</span>)}</td>
                          {showLen && <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{editAsb
                            ? <CellInp value={r.lengthM} dir="ltr" onChange={v => patchRow(r.id, { lengthM: v })} />
                            : (r.lengthM || <span style={{ color: GREY }}>—</span>)}</td>}
                          {showKg && <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{editAsb
                            ? <CellInp value={r.weightKg} dir="ltr" onChange={v => patchRow(r.id, { weightKg: v })} />
                            : (r.weightKg || <span style={{ color: GREY }}>—</span>)}</td>}
                          <td style={td}><YesNo edit={editAsb} value={r.ceiling === 'יש'}
                            onChange={v => patchRow(r.id, { ceiling: v ? 'יש' : 'אין' })} /></td>
                          <td style={td}><YesNo edit={editAsb} value={r.demolition}
                            onChange={v => patchRow(r.id, { demolition: v })} /></td>
                          <td style={td}><LabTestsCell edit={editAsb} value={r.labTests}
                            onChange={v => patchRow(r.id, { labTests: v })} /></td>
                          <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }} dir="ltr">{editAsb
                            ? <CellInp value={r.coordX} dir="ltr" onChange={v => patchRow(r.id, { coordX: v })} />
                            : (r.coordX || <span style={{ color: GREY }}>—</span>)}</td>
                          <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }} dir="ltr">{editAsb
                            ? <CellInp value={r.coordY} dir="ltr" onChange={v => patchRow(r.id, { coordY: v })} />
                            : (r.coordY || <span style={{ color: GREY }}>—</span>)}</td>
                          <td style={td} className="no-print"><ClassTag row={r} /></td>
                          {editAsb && (
                            <td style={td} className="no-print">
                              <DelBtn title={`מחק מבנה ${i + 1}`}
                                onClick={() => { setAsbRows(rs => rs.filter(x => x.id !== r.id)); setFormDirty(true) }} />
                            </td>
                          )}
                        </tr>
                      ))}
                      {/* שורת סה"כ — נכנסת גם להדפסה */}
                      <tr>
                        <td style={{ ...td, fontWeight: 800, borderTop: `2px solid ${BORDER}` }} colSpan={3}>סה"כ</td>
                        <td style={{ ...td, fontWeight: 800, borderTop: `2px solid ${BORDER}`, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtNum(Math.round(totalArea))} מ"ר
                        </td>
                        <td style={{ ...td, borderTop: `2px solid ${BORDER}`, color: GREY }}
                          colSpan={5 + (showLen ? 1 : 0) + (showKg ? 1 : 0) + (editAsb ? 1 : 0)}>
                          {asbRows.length} מבנים
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {editAsb && (
                <div style={{ padding: '0 12px 12px' }}>
                  <AddBtn text="+ הוסף מבנה" onClick={() => { setAsbRows(rs => [...rs, emptyAsbRow()]); setFormDirty(true) }} />
                </div>
              )}
              <div style={{ padding: '6px 12px 10px', fontSize: 11.5, color: GREY, lineHeight: 1.5 }} className="no-print">
                תג "סיווג מוצע" מחושב לכל מבנה בנפרד לפי תבניות התקנות, והוא מידע בלבד —
                הקביעה בפועל היא סוג ההיתר היחיד שנבחר למעלה. סימן <b>?</b> על התג = חסרים נתונים
                שחוסמים בדיקה של חלק מהתבניות.
              </div>
            </Section>

            {/* ── טבלה 2: מרחקים ממבנים אחרים (מוסתרת כשאין) ── */}
            {distRows.length > 0 && (
              <Section title="מרחקים ממבנים אחרים" badge={String(distRows.length)}
                action={<EditToggle on={editDist} onClick={() => setEditDist(!editDist)} />}>
                {res && (
                  <div style={{ padding: '8px 12px', fontSize: 12.5, color: '#555', lineHeight: 1.6, borderBottom: '1px solid #F6F4F2' }} className="no-print">
                    <div>
                      <span style={{ display: 'inline-block', width: 11, height: 11, background: '#FFBE00',
                                     border: '2px solid #FFAA00', borderRadius: 2, marginLeft: 5 }} />
                      {res.subject ? 'המבנה המדובר מסומן בענבר בתמונה' : 'המבנה המדובר לא זוהה — ראה אזהרה'}
                    </div>
                    <div><b>{res.drawn_count ?? 0}</b> מבנים מסומנים בקו מרחק בתמונה (הקרוב ביותר, הקרוב בכל כיוון, הקרוב בכל טווח).</div>
                    {res.empty_directions && res.empty_directions.length > 0 && (
                      <div style={{ color: '#1A5A2A', fontWeight: 700 }}>
                        אין מבנים כלל בכיוון: {res.empty_directions.join(', ')}
                      </div>
                    )}
                  </div>
                )}
                <div className="tbl-scroll" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl' }}>
                    <thead>
                      <tr>
                        <th style={th}>מס׳</th>
                        <th style={{ ...th, width: '100%' }}>מבנה</th>
                        <th style={th}>מרחק (מ׳)</th>
                        {editDist && <th style={th} className="no-print" />}
                      </tr>
                    </thead>
                    <tbody>
                      {distRows.map((d, i) => (
                        <tr key={d.id}>
                          <td style={{ ...td, fontWeight: 800 }}>{i + 1}</td>
                          <td style={{ ...td, whiteSpace: 'normal' }}>{editDist
                            ? <CellInp value={d.name} onChange={v => patchDist(d.id, { name: v })} />
                            : (d.name || <span style={{ color: GREY }}>—</span>)}</td>
                          <td style={{ ...td, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{editDist
                            ? <CellInp value={d.distance_m} dir="ltr" onChange={v => patchDist(d.id, { distance_m: v })} />
                            : d.distance_m}</td>
                          {editDist && (
                            <td style={td} className="no-print">
                              <DelBtn title={`מחק שורה ${i + 1}`}
                                onClick={() => { setDistRows(rs => rs.filter(x => x.id !== d.id)); setFormDirty(true) }} />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {editDist && (
                  <div style={{ padding: '0 12px 12px' }}>
                    <AddBtn text="+ הוסף מבנה סמוך"
                      onClick={() => { setDistRows(rs => [...rs, { id: rowId(), name: '', distance_m: '' }]); setFormDirty(true) }} />
                  </div>
                )}
              </Section>
            )}

            {/* אין מבנים סמוכים — נאמר במפורש, לא נעלם בשקט */}
            {res && distRows.length === 0 && (
              <div style={{ margin: '10px 14px', padding: '9px 11px', background: '#EEF2FF',
                border: '1px solid #C7D2FE', borderRadius: 8, fontSize: 12.5, color: '#1A3E7A', lineHeight: 1.5 }} className="no-print">
                לא נמצאו מבנים סמוכים ברדיוס {radiusOf(res)} מ׳ — טבלת המרחקים אינה מוצגת ולא תודפס.
                באזורים כפריים מאגר OSM לעיתים ריק; ניתן להוסיף שורות ידנית דרך "✏️ ערוך" אחרי הוספת מבנה ראשון.
              </div>
            )}

            {/* ── מבני ציבור (לא נכנס להדפסה לפי המפרט) ── */}
            {res && (
            <div className="no-print">
            <Section title={`מבני ציבור (גני ילדים / בתי ספר) — ${res.public_radius_m ?? 200} מ׳`} badge={String(res.public.length)}>
              {/* הניסוח כאן נזהר בכוונה. השכבה היא נתוני 2013–2014 ומכסה 298
                  יישובים בגני ילדים ו-174 בבתי ספר — בעיקר ערים. בקיבוצים
                  ובמושבים היא כמעט ריקה (עין החורש: 0 ברדיוס 2 ק״מ). "אין גן
                  ברדיוס 200 מ׳" הייתה קביעה שאין לה בסיס, ועל סף רגולטורי
                  שכזה טעות כזו נכנסת להגשה. */}
              <div style={{ padding: '8px 12px', fontSize: 11.5, color: '#7a5b00', background: '#FFF8E6',
                borderBottom: '1px solid #F0D98C', lineHeight: 1.55 }}>
                ⚠️ המאגר הוא נתוני 2013–2014 בכיסוי חלקי — טוב בערים, דל ביישובים כפריים.
                אין להסתמך עליו לבדו; <b>אימות בשטח נדרש</b>.
              </div>
              {res.public.length === 0
                ? <Empty text={`לא נמצא גן ילדים או בית ספר ברדיוס ${res.public_radius_m ?? 200} מ׳ במאגר. זה אינו אישור שאין כאלה בשטח.`} />
                : res.public.map((p, i) => (
                  <Row key={i}>
                    <span><b>{p.name}</b> <span style={{ color: GREY, fontSize: 12 }}>· {p.kind}</span></span>
                    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{p.distance_m} מ׳</b>
                  </Row>
                ))}
            </Section>
            </div>
            )}

            {/* ── טקסט חופשי — עד 3 שורות ── */}
            <div className="no-print">
            <Section title="הערות">
              <div style={{ padding: '4px 12px 12px' }}>
                <textarea rows={3} value={notes} maxLength={400}
                  onChange={e => setNotes(e.target.value.split('\n').slice(0, 3).join('\n'))}
                  placeholder="עד 3 שורות"
                  style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: `1px solid ${BORDER}`,
                    borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', direction: 'rtl', resize: 'none' }} />
              </div>
            </Section>
            </div>

            {/* ── פעולות ── */}
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }} className="no-print">
              {linkedMode && (
                <div style={{ fontSize: 13, fontWeight: 700, padding: '9px 12px', borderRadius: 8,
                  background: saveState === 'saved' ? '#E8F5E9' : saveState === 'error' ? '#FDECEC' : '#EEF2FF',
                  color: saveState === 'saved' ? '#1A5A2A' : saveState === 'error' ? '#8E1B27' : '#1A3E7A' }}>
                  {saveState === 'saving' && 'שומר ומקשר לדף הביצוע…'}
                  {saveState === 'saved' && `✓ ${saveMsg}`}
                  {saveState === 'error' && `⚠️ השמירה נכשלה: ${saveMsg}`}
                  {saveState === 'idle' && 'ממתין לשמירה…'}
                </div>
              )}

              {!linkedMode && saveState !== 'saved' && (
                <button type="button" onClick={openLinkPicker}
                  style={btn('#1A5FAD')}>קשר לעבודה (שמור בדף ביצוע)</button>
              )}
              {!linkedMode && saveState === 'saved' && (
                <div style={{ fontSize: 13, fontWeight: 700, padding: '9px 12px', borderRadius: 8, background: '#E8F5E9', color: '#1A5A2A' }}>✓ {saveMsg}</div>
              )}
              {!linkedMode && saveState === 'error' && (
                <div style={{ fontSize: 13, fontWeight: 700, padding: '9px 12px', borderRadius: 8, background: '#FDECEC', color: '#8E1B27' }}>⚠️ {saveMsg}</div>
              )}

              {formState !== 'idle' || formMsg ? (
                <div style={{ fontSize: 13, fontWeight: 700, padding: '9px 12px', borderRadius: 8,
                  background: formState === 'error' ? '#FDECEC' : formState === 'saved' ? '#E8F5E9' : '#EEF2FF',
                  color: formState === 'error' ? '#8E1B27' : formState === 'saved' ? '#1A5A2A' : '#1A3E7A' }}>
                  {formState === 'loading' && 'טוען את טופס האסבסט מדף הביצוע…'}
                  {formState === 'saving' && 'שומר את הטופס…'}
                  {formState === 'saved' && `✓ ${formMsg}`}
                  {formState === 'error' && `⚠️ ${formMsg}`}
                  {formState === 'idle' && formMsg}
                </div>
              ) : null}

              {linkedMode ? (
                <button type="button" disabled={!formDirty || formState === 'saving'}
                  onClick={() => void saveForm(sheetId!)}
                  style={{ ...btn(formDirty ? '#1A5FAD' : '#BBB'), cursor: formDirty ? 'pointer' : 'default' }}>
                  {formDirty ? 'שמור שינויים בטופס' : 'הטופס שמור'}
                </button>
              ) : asbRows.length > 0 && (
                <div style={{ fontSize: 12, color: '#7a5b00', background: '#FFF8E6', border: '1px solid #F0D98C',
                  borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
                  ⚠️ בדיקה חד-פעמית — הטופס אינו נשמר. לחץ "קשר לעבודה" כדי לשמור אותו בדף ביצוע.
                </div>
              )}

              <button type="button" onClick={() => window.print()} style={btn(RED)}>ייצוא ל-PDF</button>
              <div style={{ fontSize: 11.5, color: GREY, textAlign: 'center' }}>
                בתיבת ההדפסה בחר "שמור כ-PDF"
              </div>
            </div>

            {/* בורר דף ביצוע לקישור בדיעבד */}
            {linkOpen && (
              <div onClick={() => setLinkOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 50 }} className="no-print">
                <div onClick={e => e.stopPropagation()}
                  style={{ background: '#fff', width: '100%', maxHeight: '70vh', overflowY: 'auto', borderRadius: '14px 14px 0 0', direction: 'rtl' }}>
                  <div style={{ padding: '12px 14px', fontWeight: 800, borderBottom: `1px solid ${BORDER}` }}>בחר דף ביצוע</div>
                  {sheets.length === 0 && <div style={{ padding: 14, color: GREY, fontSize: 13 }}>טוען…</div>}
                  {sheets.map(s => (
                    <button key={s.id} type="button"
                      onClick={() => { setLinkOpen(false); void saveTo(s.id); void saveForm(s.id) }}
                      style={{ display: 'block', width: '100%', textAlign: 'right', padding: '11px 14px',
                        border: 'none', borderBottom: '1px solid #F0F2F5', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                      {s.project_name} {s.order_number && <span style={{ color: GREY, fontSize: 12 }} dir="ltr">· {s.order_number}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        <div style={{ height: 24 }} />
      </div>

      {pickAt && (
        <LocationPicker lat={pickAt.lat} lon={pickAt.lon} label={pickAt.label}
          radiusM={radiusM.trim() ? Number(radiusM.trim()) || 100 : 100}
          onCancel={() => setPickAt(null)}
          onConfirm={(p: PickedPoint) => { setPickAt(null); void run(undefined, p) }} />
      )}
      {zoomOpen && res && (
        <Lightbox src={res.image_url} onClose={() => setZoomOpen(false)} res={res}
          selected={selectedIds} measures={measures}
          onToggle={toggleBuilding} onAddMeasure={addMeasure}
          onUndo={() => { setMeasures(m => m.slice(0, -1)); setFormDirty(true) }}
          onClearMeasures={() => { setMeasures([]); setFormDirty(true) }}
          onClearSelection={() => { setSelectedIds(new Set()); setFormDirty(true) }} />
      )}
    </div>
  )
}

// ── בורר סוג היתר ─────────────────────────────────────────────────
// סוג ההיתר הוא שדה יחיד לכל ההגשה כולה. ריבוי מבנים נכנס תחת אותו סוג;
// הסיווג שמוצג לכל שורה בטבלה הוא הצעה מיידעת בלבד ואינו קובע.
function PermitSection({ value, onChange, infoOpen, setInfoOpen }: {
  value: PermitTypeKey; onChange: (v: PermitTypeKey) => void
  infoOpen: boolean; setInfoOpen: (v: boolean) => void
}) {
  const def = permitDef(value)
  const info = PERMIT_INFO[value]
  return (
    <Section title="סוג היתר">
      <div style={{ padding: '10px 12px 12px' }}>
        <select value={value} onChange={e => onChange(e.target.value as PermitTypeKey)}
          style={{ width: '100%', padding: '10px 8px', borderRadius: 8, border: `1px solid ${BORDER}`,
            fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', background: '#fff', direction: 'rtl' }}>
          {PERMIT_TYPES.map(t => (
            <option key={t.key} value={t.key}>{t.undefinedYet ? `${t.label} — ⚠️ טרם הוגדר` : t.label}</option>
          ))}
        </select>

        {def.undefinedYet && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#FFF8E6', border: '1px solid #F0D98C',
            borderRadius: 8, fontSize: 12.5, color: '#7a5b00', lineHeight: 1.5 }}>
            ⚠️ תנאי הסוג הזה טרם הוגדרו במערכת. עד להגדרתם הוא מתנהג לוגית כמו "היתר רגיל".
          </div>
        )}

        <div style={{ marginTop: 8, padding: '9px 11px', background: '#EEF2FF', borderRadius: 8,
          fontSize: 13, color: '#1A3E7A', fontWeight: 700, lineHeight: 1.5 }}>
          🗓️ {permitTiming(value)}
        </div>

        <button type="button" onClick={() => setInfoOpen(!infoOpen)}
          style={{ marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${BORDER}`, background: '#fff', color: '#41505E',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
          ℹ️ מה כולל הסוג הזה? {infoOpen ? '▲' : '▼'}
        </button>
        {infoOpen && (
          <div style={{ marginTop: 8, padding: '10px 12px', background: '#FAFAF8',
            border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: '#333' }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{info.title}</div>
            <ul style={{ margin: 0, paddingInlineStart: 18, listStyle: 'disc' }}>
              {info.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
            {info.note && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`, color: '#8A4B00' }}>
                {info.note}
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}

// ── תאי טבלה ──────────────────────────────────────────────────────
const th: React.CSSProperties = {
  padding: '7px 6px', fontSize: 11.5, fontWeight: 800, color: '#41505E',
  background: '#F6F4F2', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', textAlign: 'right',
}
const td: React.CSSProperties = {
  padding: '6px', fontSize: 12.5, borderBottom: '1px solid #F0EEEC',
  verticalAlign: 'middle', whiteSpace: 'nowrap',
}
const cellInpStyle: React.CSSProperties = {
  width: '100%', minWidth: 54, boxSizing: 'border-box', padding: '4px 5px',
  border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: '#fff',
}

function CellInp({ value, onChange, dir, w }: { value: string; onChange: (v: string) => void; dir?: string; w?: number }) {
  return <input value={value} dir={dir} onChange={e => onChange(e.target.value)}
    style={{ ...cellInpStyle, ...(w ? { minWidth: w } : {}), direction: dir === 'ltr' ? 'ltr' : 'rtl' }} />
}
function CellSel({ value, onChange, options, blank }: {
  value: string; onChange: (v: string) => void; options: readonly string[]; blank?: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...cellInpStyle, minWidth: 76 }}>
      <option value="">{blank ?? '—'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
/** כן/לא — בעריכה בורר, בתצוגה טקסט. ברירת המחדל תמיד "לא" (השמרנית). */
function YesNo({ edit, value, onChange }: { edit: boolean; value: boolean; onChange: (v: boolean) => void }) {
  if (!edit) return <span style={{ fontWeight: value ? 800 : 400, color: value ? '#1A5A2A' : '#8696A0' }}>{value ? 'כן' : 'לא'}</span>
  return (
    <select value={value ? 'כן' : 'לא'} onChange={e => onChange(e.target.value === 'כן')} style={{ ...cellInpStyle, minWidth: 58 }}>
      <option value="לא">לא</option>
      <option value="כן">כן</option>
    </select>
  )
}
/** דגימות מעבדה: 1-10, "אחר" + טקסט, או ריק = טרם הוגדר. */
function LabTestsCell({ edit, value, onChange }: { edit: boolean; value: LabTests; onChange: (v: LabTests) => void }) {
  if (!edit) return <span style={{ color: value === null ? '#8696A0' : '#333' }}>{labTestsLabel(value)}</span>
  const isOther = value !== null && typeof value === 'object'
  const sel = value === null ? '' : isOther ? 'אחר' : String(value)
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <select value={sel}
        onChange={e => {
          const v = e.target.value
          onChange(v === '' ? null : v === 'אחר' ? { other: '' } : Number(v))
        }}
        style={{ ...cellInpStyle, minWidth: 62 }}>
        <option value="">—</option>
        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(n => <option key={n} value={n}>{n}</option>)}
        <option value="אחר">אחר</option>
      </select>
      {isOther && (
        <input value={(value as { other: string }).other} placeholder="פרט"
          onChange={e => onChange({ other: e.target.value })}
          style={{ ...cellInpStyle, minWidth: 70, direction: 'rtl' }} />
      )}
    </div>
  )
}

/** תג "סיווג מוצע" — תצוגה בלבד, לא נשמר ולא ניתן לדריסה פר-שורה. */
function ClassTag({ row }: { row: AsbRow }) {
  const c = classifyBuilding(row)
  const col = classColors(c.key)
  const partial = c.missing.length > 0
  return (
    <span title={partial ? `${c.reason} · חסר: ${c.missing.join(', ')}` : c.reason}
      style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 20, fontSize: 11.5,
        fontWeight: 800, background: col.bg, color: col.fg, whiteSpace: 'nowrap' }}>
      {c.label}{partial ? ' ?' : ''}
    </span>
  )
}

/** כפתור "ערוך"/"סיום" בראש טבלה. */
function EditToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="no-print"
      style={{ padding: '5px 11px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 800, border: `1px solid ${on ? '#1A5A2A' : BORDER}`,
        background: on ? '#E8F5E9' : '#fff', color: on ? '#1A5A2A' : '#41505E' }}>
      {on ? '✓ סיום עריכה' : '✏️ ערוך'}
    </button>
  )
}
function DelBtn({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} title={title} className="no-print"
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}>🗑️</button>
  )
}
function AddBtn({ onClick, text }: { onClick: () => void; text: string }) {
  return (
    <button type="button" onClick={onClick} className="no-print"
      style={{ width: '100%', padding: '9px 0', borderRadius: 8, cursor: 'pointer', marginTop: 6,
        border: `1px dashed ${GREY}`, background: '#fff', color: '#1A5FAD', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
      {text}
    </button>
  )
}

// ── Lightbox: מסך מלא, זום וגרירה ─────────────────────────────────
// מימוש עם transform מבוקר ולא בהסתמכות על pinch-zoom נייטיב: בתוך PWA
// ב-iOS ההתנהגות הנייטיבית בתוך div אינה עקבית. כאן pinch מחושב ידנית
// ממרחק שתי האצבעות, ובנוסף יש גרירה, לחיצה כפולה, גלגלת וכפתורים —
// כך שההתנהגות זהה בכל מכשיר.
type LbMode = 'pan' | 'select' | 'measure'

function Lightbox({ src, onClose, res, selected, measures, onToggle, onAddMeasure, onUndo, onClearMeasures, onClearSelection }: {
  src: string; onClose: () => void
  res: Result
  selected: Set<string>
  measures: Measure[]
  onToggle: (id: string) => void
  onAddMeasure: (m: { a: GeoPt; b: GeoPt }) => void
  onUndo: () => void
  onClearMeasures: () => void
  onClearSelection: () => void
}) {
  // שלושה מצבים בלעדיים. 'pan' הוא ברירת המחדל ומשמר את ההתנהגות הקיימת
  // במדויק — גרירה מזיזה, Escape סוגר — ולכן אין רגרסיה למי שלא נכנס
  // לסימון בכלל.
  const [mode, setMode] = useState<LbMode>('pan')
  const [pending, setPending] = useState(false)
  const [cancelSeq, setCancelSeq] = useState(0)      // מאלץ איפוס מדידה תלויה
  const bumpCancel = () => setCancelSeq(n => n + 1)
  const modeRef = useRef<LbMode>('pan'); modeRef.current = mode
  const pendingRef = useRef(false); pendingRef.current = pending
  const proj = res.image_meta.projection
  const [iw, ih] = res.image_meta.size_px
  const [z, setZ] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const pinch = useRef<{ dist: number; z: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const zRef = useRef(1)
  zRef.current = z

  // MIN_Z קטן מ-1 בכוונה: 1.0 הוא "התאמה למסך", ולא הרצפה. בלי זה כפתור
  // ה-− נעצר בגודל המקורי ואי אפשר להתרחק כדי לראות את כל השטח בבת אחת.
  const MIN_Z = 0.25
  const MAX_Z = 8
  const clamp = (v: number) => Math.min(MAX_Z, Math.max(MIN_Z, v))
  function zoomTo(nz: number) {
    const c = clamp(nz)
    setZ(c)
    // ב-1 ומטה התמונה נכנסת במלואה למסך — אין מה להזיז, אז מאפסים הזזה
    // שנשארה מזום קודם (אחרת התמונה "נעלמת" בצד אחרי התרחקות).
    if (c <= 1) { setTx(0); setTy(0) }
  }
  // הרפרנס מונע closure מיושן בתוך מאזינים נייטיביים שנרשמים פעם אחת
  const zoomToRef = useRef(zoomTo)
  zoomToRef.current = zoomTo

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // מהפנימי לחיצוני: מדידה תלויה → יציאה ממצב → סגירה
        if (pendingRef.current) { setPending(false); bumpCancel(); return }
        if (modeRef.current !== 'pan') { setMode('pan'); return }
        onClose(); return
      }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomToRef.current(zRef.current * 1.5) }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomToRef.current(zRef.current / 1.5) }
      else if (e.key === '0') { e.preventDefault(); zoomToRef.current(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  // גלגלת וצביטה נרשמים כמאזינים נייטיביים ולא כ-props של React: React
  // רושם wheel/touchmove כ-passive בשורש, ואז preventDefault לא עובד —
  // הדף מאחורי הלייטבוקס היה נגלל במקום שהתמונה תזום.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const gap = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomToRef.current(zRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch.current = { dist: gap(e.touches), z: zRef.current }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return
      e.preventDefault()
      const d = gap(e.touches)
      if (pinch.current.dist > 0) zoomToRef.current(pinch.current.z * (d / pinch.current.dist))
    }
    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch.current = null }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  return (
    <div className="no-print"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 100,
               display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
               touchAction: 'none', overscrollBehavior: 'contain' }}
      ref={boxRef}
      onDoubleClick={() => { if (mode === 'pan') zoomTo(z !== 1 ? 1 : 3) }}
      onPointerDown={e => { if (mode === 'pan' && z > 1) drag.current = { x: e.clientX, y: e.clientY, tx, ty } }}
      onPointerMove={e => {
        if (!drag.current) return
        setTx(drag.current.tx + (e.clientX - drag.current.x))
        setTy(drag.current.ty + (e.clientY - drag.current.y))
      }}
      onPointerUp={() => { drag.current = null }}
    >
      {/* ה-transform עבר מהתמונה למכל, כדי שה-SVG יזוז ויתקרב יחד איתה
          ויישאר מיושר פיקסל-לפיקסל בכל זום. */}
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: '100%',
                    transform: `translate(${tx}px, ${ty}px) scale(${z})`, transformOrigin: 'center center',
                    transition: drag.current ? 'none' : 'transform 0.08s linear' }}>
        <img src={src} alt="תצלום אווירי — תצוגה מוגדלת" draggable={false}
          style={{ display: 'block', maxWidth: '100%', maxHeight: '100%',
                   cursor: mode === 'pan' ? (z > 1 ? 'grab' : 'zoom-in') : 'default', userSelect: 'none' }} />
        {proj && (
          <SketchOverlay key={cancelSeq} width={iw} height={ih}
            metersPerPx={res.image_meta.meters_per_px} proj={proj}
            buildings={res.buildings} selected={selected} measures={measures}
            mode={mode} onToggle={onToggle} onAddMeasure={onAddMeasure}
            onPendingChange={setPending} />
        )}
      </div>

      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: 8, direction: 'rtl' }}>
        <button type="button" onClick={onClose} style={lbBtn}>✕ סגור</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={() => zoomTo(z / 1.5)} disabled={z <= MIN_Z + 0.001}
            title="הקטן" style={lbBtn2(z <= MIN_Z + 0.001)}>−</button>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, minWidth: 52, textAlign: 'center',
                         fontVariantNumeric: 'tabular-nums' }}>{z.toFixed(z < 1 ? 2 : 1)}×</span>
          <button type="button" onClick={() => zoomTo(z * 1.5)} disabled={z >= MAX_Z - 0.001}
            title="הגדל" style={lbBtn2(z >= MAX_Z - 0.001)}>+</button>
          <button type="button" onClick={() => zoomTo(1)} style={lbBtn}>איפוס</button>
        </div>
      </div>
      {/* סרגל מצבים. רצועת רקע אטומה — המנוע צורב מקרא בתחתית התמונה,
          וכפתורים שקופים מעליו היו בלתי קריאים. */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 10,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.92) 62%, rgba(0,0,0,0))' }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap',
                    direction: 'rtl', padding: '0 12px 8px' }}>
        {!proj && (
          <span style={{ color: '#FCA5A5', fontSize: 12.5, fontWeight: 700 }}>
            ⚠️ הסקיצה חושבה לפני עדכון השרת — הרץ חישוב מחדש כדי לסמן מבנים
          </span>
        )}
        {proj && ([['pan', '🖐 ניווט'], ['select', '🏠 בחירת מבנים'], ['measure', '📏 מדוד מרחק']] as [LbMode, string][])
          .map(([m, t]) => (
          <button key={m} type="button" onClick={() => { setMode(m); setPending(false); bumpCancel() }}
            style={{ ...lbBtn, background: mode === m ? '#2563EB' : 'rgba(255,255,255,0.14)',
                     borderColor: mode === m ? '#2563EB' : 'rgba(255,255,255,0.3)', fontWeight: 800 }}>{t}</button>
        ))}
        {mode === 'select' && (
          <>
            <span style={{ color: '#fff', fontSize: 12.5, fontWeight: 700, alignSelf: 'center' }}>
              {selected.size} מבנים נבחרו
            </span>
            {selected.size > 0 && (
              <button type="button" onClick={onClearSelection} style={lbBtn}>נקה בחירה</button>
            )}
          </>
        )}
        {mode === 'measure' && measures.length > 0 && (
          <>
            <button type="button" onClick={onUndo} style={lbBtn}>↶ בטל קו אחרון</button>
            <button type="button" onClick={onClearMeasures} style={lbBtn}>נקה הכל</button>
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 12, padding: '0 12px 12px' }}>
        {mode === 'select' && 'לחץ על מבנה כדי לבחור · לחיצה נוספת מבטלת · Escape ליציאה'}
        {mode === 'measure' && 'לחץ, גרור ושחרר כדי למדוד · Escape מבטל מדידה בתהליך'}
        {mode === 'pan' && 'גלגלת או צביטה · + / − / 0 במקלדת · גרירה להזזה · לחיצה כפולה למעבר מהיר · טווח 0.25×–8×'}
      </div>
      </div>
    </div>
  )
}
// כפתור זום שמראה שהגיע לקצה הטווח במקום להיראות זהה ולא להגיב
function lbBtn2(atLimit: boolean): React.CSSProperties {
  return { ...lbBtn, opacity: atLimit ? 0.35 : 1, cursor: atLimit ? 'default' : 'pointer' }
}
const lbBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff',
  borderRadius: 18, padding: '7px 13px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit',
}

// השרת מחזיר radius_m מפורש; הנגזרת מ-span_m נשארת כגיבוי לתוצאות ישנות.
function radiusOf(r: Result): number {
  return r.radius_m ?? Math.round(r.image_meta.span_m / 2.4)
}
function stepBtn(busy: boolean): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 16, cursor: busy ? 'default' : 'pointer',
    border: `1px solid ${BORDER}`, background: '#fff', color: busy ? '#aaa' : '#1A5FAD',
    fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
  }
}
function btn(bg: string): React.CSSProperties {
  return { width: '100%', padding: '11px 0', borderRadius: 24, border: 'none', background: bg,
    color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  )
}
function Inp({ value, onChange, placeholder, dir, invalid }: {
  value: string; onChange: (v: string) => void; placeholder?: string; dir?: string; invalid?: boolean
}) {
  // ה-placeholder צבוע מפורשות בהיר מאוד: ברירת המחדל של iOS קרובה מדי
  // לטקסט אמיתי, ומשתמש חשב ששדות ה-ITM מלאים בזמן שהם היו ריקים.
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} dir={dir}
    className="ph-faint"
    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px',
      border: `1px solid ${invalid ? '#E0708A' : BORDER}`, background: invalid ? '#FDECEC' : '#fff',
      borderRadius: 8, fontSize: 14.5, fontFamily: 'inherit' }} />
}
function Section({ title, badge, children, action }: { title: string; badge?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: '#111' }}>{title}</span>
        {badge && <span style={{ fontSize: 12, fontWeight: 800, background: '#EFEBE7', color: '#4A4A4A', borderRadius: 8, padding: '1px 8px' }}>{badge}</span>}
        {action && <span style={{ marginInlineStart: 'auto' }}>{action}</span>}
      </div>
      {children}
    </div>
  )
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '7px 12px', fontSize: 13.5, borderBottom: '1px solid #F6F4F2' }}>{children}</div>
}
function Empty({ text }: { text: string }) {
  return <div style={{ padding: '10px 12px', fontSize: 13, color: GREY }}>{text}</div>
}
