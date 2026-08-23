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

/** מרחק קרקע אמיתי בין שתי נקודות. משמש גם בתווית על הסקיצה וגם בטבלה,
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

export const SEL_FILL = 'rgba(220, 38, 38, 0.28)'
export const SEL_STROKE = '#B91C1C'
export const CAND = '#F59E0B'
export const MEAS = '#2563EB'

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

/** תווית מרחק באמצע הקו, מסובבת בזווית הקו ובלי להתהפך. */
function MeasureLabel({ ax, ay, bx, by, text, s, n }: {
  ax: number; ay: number; bx: number; by: number; text: string; s: number; n?: number
}) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2
  let ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
  if (ang > 90) ang -= 180
  if (ang < -90) ang += 180
  // הוגדל: אלה התוויות היחידות שנשארו אחרי שקווי המרחק של המנוע כובו,
  // והן צריכות להיקרא גם בהקטנה ל-A4.
  const full = n ? `${n} · ${text}` : text
  const w = full.length * 12 * s + 18 * s
  const h = 28 * s
  return (
    <g transform={`translate(${mx} ${my}) rotate(${ang})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={5 * s}
        fill="rgba(255,255,255,0.93)" stroke={MEAS} strokeWidth={1.4 * s} />
      <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
        fontSize={18 * s} fontWeight={800} fill="#1E3A8A"
        fontFamily="system-ui, -apple-system, sans-serif">{full}</text>
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
  mode?: 'pan' | 'select' | 'measure'
  onToggle?: (osmId: string) => void
  onAddMeasure?: (m: Omit<Measure, 'id'>) => void
  /** מדווח החוצה אם יש מדידה תלויה, כדי ש-Escape ידע לבטל רק אותה */
  onPendingChange?: (pending: boolean) => void
}

export default function SketchOverlay({
  width, height, metersPerPx, proj, buildings, selected, measures,
  mode = 'pan', onToggle, onAddMeasure, onPendingChange,
}: OverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const P = makeProj(proj)
  // s מנרמל עובי קו וגופן לגודל התמונה, כדי שסימון ייראה זהה בכל מקור
  const s = width / 950

  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null)
  const [cands, setCands] = useState<{ at: [number, number]; ids: string[] } | null>(null)
  const interactive = mode === 'select' || mode === 'measure'

  /** מיקום מצביע → קואורדינטות ה-viewBox. getScreenCTM מטפל בזום/הזזה
   *  של ה-Lightbox ובכל scale של הדפדפן, ולכן אין כאן חשבון ידני. */
  function at(e: React.PointerEvent): [number, number] {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const ctm = svg.getScreenCTM()
    if (!ctm) return [0, 0]
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return [pt.x, pt.y]
  }

  function pickAt(x: number, y: number) {
    const near = buildings
      .filter(b => (b.poly_px?.length ?? 0) >= 3)
      .map(b => ({ b, d: distToPoly(x, y, b.poly_px!) }))
      .filter(o => o.d <= 8)
      .sort((a, b2) => a.d - b2.d)
    if (near.length === 0) { setCands(null); return }
    // מועמד יחיד ברור, או פגיעה מלאה בתוך מבנה אחד בלבד
    const inside = near.filter(o => o.d === 0)
    if (near.length === 1 || inside.length === 1) {
      onToggle?.((inside.length === 1 ? inside[0] : near[0]).b.osm_id)
      setCands(null)
      return
    }
    setCands({ at: [x, y], ids: near.map(o => o.b.osm_id) })   // אי-ודאות → בחירה מפורשת
  }

  function onDown(e: React.PointerEvent) {
    if (!interactive) return
    e.stopPropagation()
    const [x, y] = at(e)
    if (mode === 'select') { pickAt(x, y); return }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setDrag({ a: [x, y], b: [x, y] })
    onPendingChange?.(true)
  }
  function onMove(e: React.PointerEvent) {
    if (mode !== 'measure' || !drag) return
    e.stopPropagation()
    setDrag({ a: drag.a, b: at(e) })
  }
  function onUp(e: React.PointerEvent) {
    if (mode !== 'measure' || !drag) return
    e.stopPropagation()
    const b = at(e)
    const moved = Math.hypot(b[0] - drag.a[0], b[1] - drag.a[1])
    setDrag(null)
    onPendingChange?.(false)
    if (moved < 4) return                     // נגיעה בלי גרירה — לא קו
    onAddMeasure?.({ a: P.toGeo(drag.a[0], drag.a[1]), b: P.toGeo(b[0], b[1]) })
  }

  const candSet = new Set(cands?.ids ?? [])
  const geoLen = (g1: GeoPt, g2: GeoPt) => `${measureMeters(g1, g2).toFixed(1)} מ׳`

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
        onPointerCancel={() => { setDrag(null); onPendingChange?.(false) }}
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

        {measures.map((m, i) => {
          const [ax, ay] = P.toPx(m.a), [bx, by] = P.toPx(m.b)
          return (
            <g key={m.id}>
              <line x1={ax} y1={ay} x2={bx} y2={by} stroke={MEAS} strokeWidth={2.5 * s} strokeLinecap="round" />
              <circle cx={ax} cy={ay} r={3.5 * s} fill={MEAS} stroke="#fff" strokeWidth={1.2 * s} />
              <circle cx={bx} cy={by} r={3.5 * s} fill={MEAS} stroke="#fff" strokeWidth={1.2 * s} />
              <MeasureLabel ax={ax} ay={ay} bx={bx} by={by} s={s} n={i + 1} text={geoLen(m.a, m.b)} />
            </g>
          )
        })}

        {drag && (
          <g>
            <line x1={drag.a[0]} y1={drag.a[1]} x2={drag.b[0]} y2={drag.b[1]}
              stroke={MEAS} strokeWidth={2.5 * s} strokeDasharray={`${7 * s} ${5 * s}`} strokeLinecap="round" />
            <circle cx={drag.a[0]} cy={drag.a[1]} r={3.5 * s} fill={MEAS} stroke="#fff" strokeWidth={1.2 * s} />
            <MeasureLabel ax={drag.a[0]} ay={drag.a[1]} bx={drag.b[0]} by={drag.b[1]} s={s}
              n={measures.length + 1}
              text={geoLen(P.toGeo(drag.a[0], drag.a[1]), P.toGeo(drag.b[0], drag.b[1]))} />
          </g>
        )}
      </svg>

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
