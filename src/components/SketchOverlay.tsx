// ── שכבת סימון מעל סקיצת המרחקים ─────────────────────────────────
// אותה שכבה משמשת פעמיים:
//   • בתוך ה-Lightbox — אינטראקטיבית (בחירת מבנים / מדידה)
//   • מעל התמונה הקטנה בדף — סטטית, בלי מאזינים, ונכנסת להדפסה
// ה-Lightbox עצמו הוא .no-print, ולכן בלי הגרסה הסטטית הסימונים לא היו
// מגיעים ל-PDF של ההיתר — והם כל הפואנטה.
//
// ה-viewBox הוא גודל התמונה המקורית (1900×1900), ולכן אין כאן שום חישוב
// קנה מידה: הדפדפן מתאים את אותם pixel coordinates גם למסך מלא וגם
// לתמונה ברוחב 430px.
import { useRef, useState } from 'react'

export interface GeoPt { lat: number; lon: number }
export interface Measure { id: string; a: GeoPt; b: GeoPt; name?: string }

/** מתאר שהמשתמש שרטט. נשמר ב-lat/lon ולא בפיקסלים — שינוי רדיוס מרנדר
 *  בזום ופריסה אחרים, ופיקסלים שמורים היו הופכים לשקר. אותו שיעור כמו
 *  בקווי המדידה. */
export interface Outline { id: string; pts: GeoPt[]; name?: string }

/** שטח הפוליגון במ״ר — נוסחת השרוך על היטל מקומי במטרים.
 *  תצוגה בלבד: זה ההיטל האופקי מהתצלום, וגג משופע פרוש על יותר
 *  (15° ≈ +3.5%). למלא בו שדה רגולטורי היה מנמיך שיטתית. */
export function outlineArea(pts: GeoPt[]): number {
  if (pts.length < 3) return 0
  const rad = Math.PI / 180
  const lat0 = pts.reduce((s2, p) => s2 + p.lat, 0) / pts.length
  const mx = 111320 * Math.cos(lat0 * rad), my = 110540
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lon * mx, yi = pts[i].lat * my
    const xj = pts[j].lon * mx, yj = pts[j].lat * my
    a += xj * yi - xi * yj
  }
  return Math.abs(a / 2)
}

/** מרחק קרקע אמיתי בין שתי נקודות. משמש גם לתצוגה חיה וגם בטבלה,
 *  כדי ששני המקומות יראו בדיוק את אותו מספר. גיאודזי ולא פיקסלים×קנה-מידה:
 *  מדויק יותר, ולא תלוי ברינדור הנוכחי. */
export function measureMeters(a: GeoPt, b: GeoPt): number {
  const R = 6371000, rad = Math.PI / 180
  const la1 = a.lat * rad, la2 = b.lat * rad
  const dla = (b.lat - a.lat) * rad, dlo = (b.lon - a.lon) * rad
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export interface Proj {
  center_px: [number, number]
  center_lat: number; center_lon: number
  deg_per_px_lat: number; deg_per_px_lon: number
}
export interface OverlayBuilding {
  osm_id: string
  name: string | null
  distance_m: number
  poly_px?: number[][]
}

export const OUT_FILL = 'rgba(220, 38, 38, 0.30)'
export const SEL_FILL = 'rgba(220, 38, 38, 0.28)'
export const SEL_STROKE = '#B91C1C'
export const CAND = '#F59E0B'
export const MEAS = '#2563EB'

/** פיקסלים (מסך) שהנקודה המוצגת "מורמת" מעל האצבע בזמן מיקום — אצבע
 *  אמיתית מכסה כ-40-50 פיקסל סביב נקודת המגע, ומסתירה בדיוק את מה
 *  שצריך לדייק שם. התזוזה נשמרת קבועה במרחב המסך (לא ה-viewBox), כדי
 *  שתיראה זהה בכל רמת זום — ב-at() היא מופחתת לפני חלוקת קנה-המידה. */
const LIFT_PX = 46

/** היטל דו-כיווני מהמתאר שהשרת מחזיר. שתי כפולות לכל כיוון — לא מימוש
 *  Web Mercator שני. השרת הוא מקור האמת (ראו compose() ב-engine.py). */
export function makeProj(p: Proj) {
  const [cx, cy] = p.center_px
  return {
    toPx: (g: GeoPt): [number, number] => [
      cx + (g.lon - p.center_lon) / p.deg_per_px_lon,
      cy + (g.lat - p.center_lat) / p.deg_per_px_lat,
    ],
    toGeo: (x: number, y: number): GeoPt => ({
      lat: p.center_lat + (y - cy) * p.deg_per_px_lat,
      lon: p.center_lon + (x - cx) * p.deg_per_px_lon,
    }),
  }
}

function drawBtn(primary: boolean): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 12.5, fontWeight: 800, border: '1px solid ' + (primary ? '#1A5A2A' : 'rgba(255,255,255,0.35)'),
    background: primary ? '#1A5A2A' : 'rgba(0,0,0,0.7)', color: '#fff',
  }
}

function pointInPoly(x: number, y: number, poly: number[][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** מרחק מנקודה למתאר — 0 אם בפנים. משמש לטווח האי-ודאות. */
export function distToPoly(x: number, y: number, poly: number[][]): number {
  if (poly.length < 3) return Infinity
  if (pointInPoly(x, y, poly)) return 0
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, distToSeg(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]))
  }
  return best
}

/** תג המבנה בקצה הקו — מ1, מ2. זה המזהה היחיד של מבנה שכן: הוא מונח
 *  עליו בתצלום, ומופיע כאותו ערך בעמודת "מס׳" בטבלה. אין סימון נפרד
 *  למבנים שכנים; הקו הוא גם המדידה וגם ההצבעה. בכוונה בלי מספר מ' עליו —
 *  זה חי רק בטבלה, כדי שהסקיצה לא תיטען בטקסט. */
function BuildingTag({ x, y, n, s }: { x: number; y: number; n: number; s: number }) {
  const r = 13 * s
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={MEAS} strokeWidth={2.2 * s} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fontSize={13 * s} fontWeight={800} fill="#1E3A8A"
        fontFamily="system-ui, -apple-system, sans-serif">{`מ${n}`}</text>
    </g>
  )
}

/** תג מתאר משורטט — אדום וממוספר 1,2,3. הפרדת צבע מכוונת: אדום = מבנה
 *  אסבסט (כמו בטבלה שלו), כחול מ1/מ2 = שכן. שתי מערכות מספור על אותה
 *  סקיצה מתבלבלות בלי הפרדה ויזואלית. */
function OutlineTag({ x, y, n, area, s }: { x: number; y: number; n: number; area: number; s: number }) {
  const txt = `${n} · ${Math.round(area).toLocaleString('he-IL')} מ״ר`
  const w = txt.length * 11 * s + 16 * s, h = 26 * s
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={5 * s}
        fill="rgba(255,255,255,0.93)" stroke={SEL_STROKE} strokeWidth={1.6 * s} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fontSize={15 * s} fontWeight={800} fill="#8E1B27"
        fontFamily="system-ui, -apple-system, sans-serif">{txt}</text>
    </g>
  )
}

export interface OverlayProps {
  width: number; height: number
  metersPerPx: number
  proj: Proj
  buildings: OverlayBuilding[]
  selected: Set<string>
  measures: Measure[]
  /** אינטראקטיבי רק ב-Lightbox; הגרסה בדף היא תצוגה בלבד */
  mode?: 'pan' | 'select' | 'measure' | 'draw'
  outlines?: Outline[]
  onToggle?: (osmId: string) => void
  onAddMeasure?: (m: Omit<Measure, 'id'>) => void
  onAddOutline?: (pts: GeoPt[]) => void
  /** מדווח כמה נקודות יש בשרטוט שכבר נקבעו, כדי שהסרגל יידע להציג
   *  "סגור פוליגון" ו-Escape יידע לבטל אותו לפני שהוא סוגר משהו אחר */
  onDraftChange?: (n: number) => void
  /** מדווח החוצה אם יש מיקום-נקודה בתהליך (לפני שחרור), כדי ש-Escape
   *  ידע לבטל רק אותו */
  onPendingChange?: (pending: boolean) => void
  /** אורך חי בזמן גרירת קו מדידה, או null כשאין גרירה פעילה. לא מוצג
   *  ליד הקו עצמו — ההורה מציג אותו במיקום קבוע על המסך, כי מספר שיושב
   *  צמוד לקו נופל בדיוק מתחת לאצבע שגוררת אותו. */
  onMeasureLive?: (text: string | null) => void
}

export default function SketchOverlay({
  width, height, metersPerPx, proj, buildings, selected, measures, outlines = [],
  mode = 'pan', onToggle, onAddMeasure, onAddOutline, onPendingChange, onDraftChange, onMeasureLive,
}: OverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const P = makeProj(proj)
  // s מנרמל עובי קו וגופן לגודל התמונה, כדי שסימון ייראה זהה בכל מקור
  const s = width / 950

  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null)
  const [cands, setCands] = useState<{ at: [number, number]; ids: string[] } | null>(null)
  const [draft, setDraft] = useState<[number, number][]>([])
  // נקודה "מורמת" בתהליך מיקום — עוד לא נכנסה ל-draft. נוצרת ב-pointerdown,
  // עוקבת אחרי האצבע ב-pointermove, ונכנסת ל-draft רק ב-pointerup. זה מה
  // שנותן את ה"נוגע, רואה X, זז מעט לדייק, משחרר" שביקשנו — לא לחיצה
  // מיידית שמתחייבת לפני שרואים איפה בכלל היא נוחתת.
  const [pendingVertex, setPendingVertex] = useState<[number, number] | null>(null)
  const interactive = mode === 'select' || mode === 'measure' || mode === 'draw'

  function addVertex(x: number, y: number) {
    setDraft(prev => {
      const next: [number, number][] = [...prev, [x, y]]
      onDraftChange?.(next.length)
      return next
    })
  }
  function closeDraft() {
    setDraft(prev => {
      if (prev.length >= 3) onAddOutline?.(prev.map(([x, y]) => P.toGeo(x, y)))
      onDraftChange?.(0)
      return []
    })
  }
  function undoVertex() {
    setDraft(prev => {
      const next = prev.slice(0, -1)
      onDraftChange?.(next.length)
      return next
    })
  }

  /** מיקום מצביע/מגע → קואורדינטות ה-viewBox.
   *  getScreenCTM().inverse() היה כאן קודם — תקין תיאורטית, אבל ל-Safari
   *  ב-iOS יש תקלות מתועדות בדיוק בתצורה הזו: SVG בתוך אב עם
   *  position:fixed ו-transform:scale() (הלייטבוקס שלנו). זה גרם לכך
   *  שנקודת המגע נרשמה במקום אחר מהמקום שבו המשתמש נגע — גם בשרטוט
   *  (לחיצות בודדות) וגם במדידה (press+drag+release), כי שניהם עוברים
   *  כאן. getBoundingClientRect + יחס סקאלה מפורש הן הטכניקה הנפוצה
   *  והעמידה יותר למיפוי מגע על אלמנט מותמר, ולא תלויות במימוש CTM.
   *  liftPx: ראו LIFT_PX למעלה — מוחסר מ-clientY לפני חלוקת קנה-המידה,
   *  כך שהוא מתורגם לאותה הזחה חזותית בכל רמת זום. */
  function at(e: React.PointerEvent, liftPx = 0): [number, number] {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return [0, 0]
    // ה-SVG ממשיך "meet" (ברירת המחדל של preserveAspectRatio): כשהקופסה
    // שלו לא זהה ביחס-הממדים ל-viewBox, הוא ממרכז ומצייר את התוכן בתת-
    // מלבן פנימי, לא בכל הקופסה — בדיוק כמו object-fit:contain של התמונה.
    const boxAspect = rect.width / rect.height
    const vbAspect = width / height
    let visW = rect.width, visH = rect.height, offX = 0, offY = 0
    if (boxAspect > vbAspect) {
      visW = rect.height * vbAspect
      offX = (rect.width - visW) / 2
    } else {
      visH = rect.width / vbAspect
      offY = (rect.height - visH) / 2
    }
    return [
      ((e.clientX - rect.left - offX) / visW) * width,
      ((e.clientY - liftPx - rect.top - offY) / visH) * height,
    ]
  }

  function pickAt(x: number, y: number): string | null {
    const near = buildings
      .filter(b => (b.poly_px?.length ?? 0) >= 3)
      .map(b => ({ b, d: distToPoly(x, y, b.poly_px!) }))
      .filter(o => o.d <= 8)
      .sort((a, b2) => a.d - b2.d)
    if (near.length === 0) { setCands(null); return null }
    // מועמד יחיד ברור, או פגיעה מלאה בתוך מבנה אחד בלבד
    const inside = near.filter(o => o.d === 0)
    if (near.length === 1 || inside.length === 1) {
      const id = (inside.length === 1 ? inside[0] : near[0]).b.osm_id
      onToggle?.(id)
      setCands(null)
      return id
    }
    setCands({ at: [x, y], ids: near.map(o => o.b.osm_id) })   // אי-ודאות → בחירה מפורשת
    return null
  }

  // מעקב אצבעות פעילות: Pointer Events מריצות onPointerDown בנפרד לכל
  // אצבע. בלי המעקב הזה, האצבע השנייה של צביטה-להתרחקות נספרה כלחיצה
  // עצמאית — מוסיפה קודקוד לשרטוט, מבטלת בחירת מבנה, או פותחת קו מדידה
  // שני — בדיוק בזמן שהמשתמש רק ניסה להתרחק כדי לראות את "סגור פוליגון".
  // הפתרון: ברגע שאצבע שנייה נוגעת, מבטלים את מה שהאצבע הראשונה הספיקה
  // לעשות (זו הופכת לצביטה, לא ללחיצה), ומתעלמים מכל האצבעות עד שכולן
  // עוזבות ומתחילה נגיעה חדשה ונקייה.
  const activePointers = useRef<Set<number>>(new Set())
  const gestureIsMulti = useRef(false)
  const lastToggledPointer = useRef<{ pointerId: number; osmId: string } | null>(null)

  function onDown(e: React.PointerEvent) {
    if (!interactive) return
    e.stopPropagation()
    activePointers.current.add(e.pointerId)

    if (activePointers.current.size >= 2) {
      // הופך לצביטה — מבטלים כל מיקום-נקודה שעדיין לא שוחרר, ולא נכנס
      // ל-state הסופי (draft / קו מדידה), כי הוא לא באמת "בוצע" עדיין
      gestureIsMulti.current = true
      if (mode === 'draw' && pendingVertex) { setPendingVertex(null); onPendingChange?.(false) }
      if (mode === 'measure' && drag) { setDrag(null); onPendingChange?.(false); onMeasureLive?.(null) }
      if (mode === 'select' && lastToggledPointer.current) { onToggle?.(lastToggledPointer.current.osmId); lastToggledPointer.current = null }
      return
    }
    if (gestureIsMulti.current) return         // אצבע שנשארה מצביטה קודמת

    if (mode === 'select') {
      const [x, y] = at(e)
      const id = pickAt(x, y)
      if (id) lastToggledPointer.current = { pointerId: e.pointerId, osmId: id }
      return
    }
    if (mode === 'draw') {
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      setPendingVertex(at(e, LIFT_PX))
      onPendingChange?.(true)
      return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = at(e, LIFT_PX)
    setDrag({ a: p, b: p })
    onPendingChange?.(true)
    onMeasureLive?.('0.0 מ׳')
  }
  function onMove(e: React.PointerEvent) {
    if (gestureIsMulti.current) return
    if (mode === 'draw' && pendingVertex) { e.stopPropagation(); setPendingVertex(at(e, LIFT_PX)); return }
    if (mode !== 'measure' || !drag) return
    e.stopPropagation()
    const b = at(e, LIFT_PX)
    setDrag({ a: drag.a, b })
    onMeasureLive?.(`${measureMeters(P.toGeo(drag.a[0], drag.a[1]), P.toGeo(b[0], b[1])).toFixed(1)} מ׳`)
  }
  function endPointer(id: number) {
    activePointers.current.delete(id)
    if (activePointers.current.size === 0) gestureIsMulti.current = false
  }
  function onUp(e: React.PointerEvent) {
    endPointer(e.pointerId)
    if (gestureIsMulti.current) return
    if (mode === 'draw' && pendingVertex) {
      e.stopPropagation()
      addVertex(pendingVertex[0], pendingVertex[1])
      setPendingVertex(null)
      onPendingChange?.(false)
      return
    }
    if (mode !== 'measure' || !drag) return
    e.stopPropagation()
    const b = at(e, LIFT_PX)
    const moved = Math.hypot(b[0] - drag.a[0], b[1] - drag.a[1])
    setDrag(null)
    onPendingChange?.(false)
    onMeasureLive?.(null)
    if (moved < 4) return                     // נגיעה בלי גרירה — לא קו
    onAddMeasure?.({ a: P.toGeo(drag.a[0], drag.a[1]), b: P.toGeo(b[0], b[1]) })
  }

  const candSet = new Set(cands?.ids ?? [])

  return (
    <>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          pointerEvents: interactive ? 'auto' : 'none',
          touchAction: interactive ? 'none' : undefined,
          cursor: mode === 'select' ? 'pointer' : mode === 'measure' ? 'crosshair' : undefined,
        }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={e => { endPointer(e.pointerId); setDrag(null); setPendingVertex(null); onPendingChange?.(false); onMeasureLive?.(null) }}
      >
        {buildings.map(b => {
          if ((b.poly_px?.length ?? 0) < 3) return null
          const isSel = selected.has(b.osm_id)
          const isCand = candSet.has(b.osm_id)
          if (!isSel && !isCand && !interactive) return null   // בתצוגה סטטית — רק נבחרים
          return (
            <polygon key={b.osm_id}
              points={b.poly_px!.map(p => `${p[0]},${p[1]}`).join(' ')}
              fill={isCand ? 'rgba(245,158,11,0.35)' : isSel ? SEL_FILL : 'rgba(255,255,255,0.001)'}
              stroke={isCand ? CAND : isSel ? SEL_STROKE : 'transparent'}
              strokeWidth={(isCand ? 3 : 2.2) * s} strokeLinejoin="round" />
          )
        })}

        {outlines.map((o, i) => {
          const pts = o.pts.map(g => P.toPx(g))
          const cx2 = pts.reduce((t, q) => t + q[0], 0) / pts.length
          const cy2 = pts.reduce((t, q) => t + q[1], 0) / pts.length
          return (
            <g key={o.id}>
              <polygon points={pts.map(q => `${q[0]},${q[1]}`).join(' ')}
                fill={OUT_FILL} stroke={SEL_STROKE} strokeWidth={2.6 * s} strokeLinejoin="round" />
              <OutlineTag x={cx2} y={cy2} n={i + 1} area={outlineArea(o.pts)} s={s} />
            </g>
          )
        })}

        {(draft.length > 0 || pendingVertex) && (
          <g>
            <polyline points={[...draft, ...(pendingVertex ? [pendingVertex] : [])].map(q => `${q[0]},${q[1]}`).join(' ')}
              fill={draft.length > 1 && pendingVertex ? OUT_FILL : draft.length > 2 ? OUT_FILL : 'none'}
              stroke={SEL_STROKE} strokeWidth={2.6 * s} strokeDasharray={`${7 * s} ${5 * s}`} strokeLinejoin="round" />
            {draft.map((q, i) => (
              <circle key={i} cx={q[0]} cy={q[1]} r={5 * s} fill="#fff"
                stroke={SEL_STROKE} strokeWidth={2 * s} />
            ))}
            {/* הנקודה המורמת — עדיין לא מוצבת, רק תצוגה של איפה שהיא תיפול
                אם משחררים עכשיו. חלולה/מקווקוות כדי שתיראה אחרת מהמוצבות. */}
            {pendingVertex && (
              <circle cx={pendingVertex[0]} cy={pendingVertex[1]} r={9 * s} fill="rgba(185,28,28,0.18)"
                stroke={SEL_STROKE} strokeWidth={2.4 * s} strokeDasharray={`${3 * s} ${3 * s}`} />
            )}
          </g>
        )}

        {measures.map((m, i) => {
          const [ax, ay] = P.toPx(m.a), [bx, by] = P.toPx(m.b)
          return (
            <g key={m.id}>
              <line x1={ax} y1={ay} x2={bx} y2={by} stroke={MEAS} strokeWidth={2.5 * s} strokeLinecap="round" />
              <circle cx={ax} cy={ay} r={4 * s} fill={MEAS} stroke="#fff" strokeWidth={1.4 * s} />
              <BuildingTag x={bx} y={by} n={i + 1} s={s} />
            </g>
          )
        })}

        {drag && (
          <g>
            <line x1={drag.a[0]} y1={drag.a[1]} x2={drag.b[0]} y2={drag.b[1]}
              stroke={MEAS} strokeWidth={2.5 * s} strokeDasharray={`${7 * s} ${5 * s}`} strokeLinecap="round" />
            <circle cx={drag.a[0]} cy={drag.a[1]} r={3.5 * s} fill={MEAS} stroke="#fff" strokeWidth={1.2 * s} />
            <circle cx={drag.b[0]} cy={drag.b[1]} r={9 * s} fill="rgba(37,99,235,0.18)"
              stroke={MEAS} strokeWidth={2.4 * s} strokeDasharray={`${3 * s} ${3 * s}`} />
          </g>
        )}
      </svg>

      {mode === 'draw' && (
        // top:58 ולא 10: בטלפון הרצועה הזו נחתה בדיוק על שורת ה-✕סגור/זום
        // של הלייטבוקס (שם top:12) — שתיהן position:absolute ברוחב מלא,
        // וכפתור ה-"+" של הזום (שמעל בסדר ה-DOM) בלע לחיצות שיועדו ל-
        // "✓ סגור פוליגון". זו הסיבה שהיה אפשר "ליצור" שרטוט חופשי בלי
        // באמת לסגור אותו — הלחיצה על סגירה בפועל הגדילה זום.
        <div style={{ position: 'absolute', top: 58, left: 0, right: 0, display: 'flex',
          gap: 8, justifyContent: 'center', flexWrap: 'wrap', direction: 'rtl', zIndex: 6 }}>
          <span style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 12.5,
            fontWeight: 700, padding: '6px 11px', borderRadius: 16 }}>
            {draft.length === 0 ? 'גע בכל פינה של המבנה'
              : `${draft.length} נקודות${draft.length < 3 ? ' — צריך לפחות 3' : ''}`}
          </span>
          {draft.length > 0 && (
            <button type="button" onClick={undoVertex} style={drawBtn(false)}>↶ בטל נקודה</button>
          )}
          {draft.length >= 3 && (
            <button type="button" onClick={closeDraft} style={drawBtn(true)}>✓ סגור פוליגון</button>
          )}
        </div>
      )}

      {/* תפריט אי-ודאות — HTML ולא SVG, כדי שיישאר קריא בכל זום */}
      {cands && (
        <div style={{ position: 'absolute', left: `${(cands.at[0] / width) * 100}%`,
          top: `${(cands.at[1] / height) * 100}%`, transform: 'translate(-50%, 8px)',
          background: '#fff', border: `1px solid ${CAND}`, borderRadius: 8, zIndex: 5,
          boxShadow: '0 4px 14px rgba(0,0,0,0.35)', direction: 'rtl', overflow: 'hidden', minWidth: 190 }}>
          <div style={{ padding: '6px 10px', fontSize: 11.5, fontWeight: 800, color: '#8A4B00', background: '#FFF8E6' }}>
            {cands.ids.length} מבנים חופפים — בחר
          </div>
          {cands.ids.map((id, i) => {
            const b = buildings.find(x => x.osm_id === id)
            return (
              <button key={id} type="button"
                onClick={() => { onToggle?.(id); setCands(null) }}
                style={{ display: 'block', width: '100%', textAlign: 'right', padding: '8px 10px',
                  border: 'none', borderTop: i ? '1px solid #F0F2F5' : 'none', background: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                {b?.name || `מבנה ללא שם`} <span style={{ color: '#8696A0', fontSize: 11.5 }}>· {b?.distance_m} מ׳</span>
              </button>
            )
          })}
          <button type="button" onClick={() => setCands(null)}
            style={{ display: 'block', width: '100%', padding: '7px 10px', border: 'none',
              borderTop: '1px solid #F0F2F5', background: '#FAFAF8', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12.5, color: '#666' }}>ביטול</button>
        </div>
      )}
    </>
  )
}
