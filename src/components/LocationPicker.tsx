// ── בורר מיקום על מפה חיה ────────────────────────────────────────
// הבעיה שזה פותר: הכתובת כמעט אף פעם לא מדויקת (מאגר הכתובות הפתוח מכיר
// 6.8% ממספרי הבית בשוהם, ואפס ברחוב שחם), ו-ITM דורש לצאת ל-Govmap
// ולהקליד. כאן הנקודה שהתקבלה היא רק *נקודת פתיחה* — המשתמש גורר, רואה
// בדיוק מה ייכנס לסקיצה, ורק אז מקבע.
//
// המפה היא בורר בלבד. ברגע ה"קבע כאן" מתחיל בדיוק אותו זרימה של היום:
// רינדור PNG בשרת, poly_px, שכבת הסימון, המדידה וההדפסה.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const RED = '#CC0000'
const BORDER = '#E5DDD5'
const GREY = '#8696A0'

// אותו מקור שהמנוע משתמש בו בשרת, כדי שמה שרואים במפה הוא מה שיתקבל
// בסקיצה. Esri מגיש עם Access-Control-Allow-Origin: * ו-max-age=86400,
// כך שגרירה חזרה לאזור שכבר נראה לא עולה בקשה נוספת.
const TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ATTRIB = 'Esri World Imagery'

export interface PickedPoint { lat: number; lon: number }

export default function LocationPicker({ lat, lon, radiusM, label, onConfirm, onCancel }: {
  lat: number; lon: number
  radiusM: number
  label?: string | null
  onConfirm: (p: PickedPoint) => void
  onCancel: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const [center, setCenter] = useState<PickedPoint>({ lat, lon })
  const [moved, setMoved] = useState(0)

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return
    const start = L.latLng(lat, lon)
    // תנועה חסומה לק״מ סביב נקודת הפתיחה: זה כיול, לא ניווט. חוסך גם
    // גלישה מקרית וגם משיכת אריחים מיותרת.
    const bounds = start.toBounds(2000)
    const map = L.map(boxRef.current, {
      center: start, zoom: 18, minZoom: 16, maxZoom: 19,
      maxBounds: bounds, maxBoundsViscosity: 1.0,
      zoomControl: true, attributionControl: true,
    })
    L.tileLayer(TILES, {
      maxZoom: 19, attribution: ATTRIB,
      keepBuffer: 1,              // ברירת המחדל 2 מכפילה את מספר האריחים
      updateWhenIdle: true,       // לא טוען תוך כדי גרירה, רק כשהאצבע עוזבת
      updateWhenZooming: false,
    }).addTo(map)

    circleRef.current = L.circle(start, {
      radius: radiusM, color: '#FFD600', weight: 2, fill: false, interactive: false,
    }).addTo(map)

    map.on('move', () => {
      const c = map.getCenter()
      setCenter({ lat: c.lat, lon: c.lng })
      circleRef.current?.setLatLng(c)
    })
    map.on('moveend', () => setMoved(m => m + 1))
    mapRef.current = map
    // Leaflet לא מודד נכון מכל שנפתח באותו טיק
    setTimeout(() => map.invalidateSize(), 60)
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { circleRef.current?.setRadius(radiusM) }, [radiusM])

  const shifted = Math.round(
    L.latLng(lat, lon).distanceTo(L.latLng(center.lat, center.lon)))

  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#000',
      display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
      <div style={{ background: RED, padding: '10px 14px', flexShrink: 0, textAlign: 'center' }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>מקם את הנקודה</div>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
          {label ? `${label} · ` : ''}גרור את המפה עד שהצלב על המבנה
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={boxRef} style={{ position: 'absolute', inset: 0 }} />
        {/* צלב קבוע במרכז — המפה זזה תחתיו, כמו בכל אפליקציית מפות */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          pointerEvents: 'none', zIndex: 500 }}>
          <div style={{ width: 2, height: 44, background: RED, position: 'absolute',
            left: -1, top: -22, boxShadow: '0 0 2px #fff' }} />
          <div style={{ width: 44, height: 2, background: RED, position: 'absolute',
            top: -1, left: -22, boxShadow: '0 0 2px #fff' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${RED}`,
            background: 'rgba(255,255,255,0.5)', position: 'absolute', left: -5, top: -5 }} />
        </div>
      </div>

      <div style={{ background: '#fff', padding: '10px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: GREY,
          marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
          <span dir="ltr">{center.lat.toFixed(6)}, {center.lon.toFixed(6)}</span>
          <span>{moved > 0 && shifted > 0 ? `הוזז ${shifted} מ׳ מנקודת הפתיחה` : 'נקודת הפתיחה'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, padding: '12px 0', borderRadius: 24, border: `1px solid ${BORDER}`,
              background: '#fff', color: '#555', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer' }}>ביטול</button>
          <button type="button" onClick={() => onConfirm(center)}
            style={{ flex: 2, padding: '12px 0', borderRadius: 24, border: 'none', background: RED,
              color: '#fff', fontSize: 15.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
            ✓ קבע כאן והתחל חישוב
          </button>
        </div>
      </div>
    </div>
  )
}
