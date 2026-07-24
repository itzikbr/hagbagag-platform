import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { queryWithRetry } from '../lib/dbRetry'

// ══════════════════════════════════════════════════════════════
// חג בגג — דף ביצוע · מסך צפייה (read-only)
// ══════════════════════════════════════════════════════════════
const HEADER_RED = '#c0392b'
const SECTION_BG = '#e8d5d3'
const SECTION_COLOR = '#7b2d26'
const BG = '#F2EDE9'
const BORDER = '#E5E0DB'
const GREY = '#8696A0'

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  field:       { label: 'בשטח',   bg: '#FDECEC', color: '#CC0000' },
  in_progress: { label: 'בעבודה', bg: '#FFF4E5', color: '#B26A00' },
  submitted:   { label: 'הוגש',   bg: '#E8F5E9', color: '#2E7D32' },
}

const WORK_TYPE_LABEL: Record<string, string> = {
  asbestos: '🟠 החלפת אסבסט', roofReplace: '🏠 החלפת גג', aluminum: '🔩 ציפוי אלומיניום',
  gutters: '🌧️ מרזבים', insulation: '🧊 בידוד', other: '📝 אחר',
}
const CATEGORY_LABEL: Record<string, string> = {
  aluminum: 'חיפוי אלומיניום', flashing: 'פחחות', roofing: 'קירוי',
  wood: 'עץ', gutters: 'מרזבים', insulation: 'בידוד',
}
const CATEGORY_ICON: Record<string, string> = {
  aluminum: '🔩', flashing: '⚙️', roofing: '🔩', wood: '🪵', gutters: '🌧️', insulation: '🧊',
}
const CATEGORY_UNIT: Record<string, string> = {
  aluminum: 'מ׳', flashing: 'מ"א', roofing: 'מ"א', wood: 'מ"א', gutters: 'מ׳', insulation: 'מ"ר',
}

// ── טיפוסים רופפים לקריאה בלבד ─────────────────────────────────
interface DocItem { path?: string; url?: string; name?: string; note?: string }
interface MaterialRow { type?: string; typeOther?: string; shade?: string; qty?: string; measure?: string; catalog_number?: string; riderType?: string; riderAngle?: string }
interface MaterialCategory {
  rows?: MaterialRow[]; roofingType?: string; sheetThickness?: string; roofColor?: string
  topThickness?: string; bottomThickness?: string; fillType?: string; tileType?: string
}
interface AsbBuilding {
  coordX?: string; coordY?: string; roofSize?: string
  structureType?: string; structureTypeOther?: string
  construction?: string; constructionOther?: string; height?: string
  grandpaStick?: string; consState?: string; ceiling?: string; ceilingType?: string; ceilingTypeOther?: string
  infra?: string; asbestosKind?: string; asbestosSub?: string; asbestosSubOther?: string
  newRoof?: string; newRoofNote?: string; note?: string
}
interface AsbestosBlock {
  buildings?: AsbBuilding[]; generalNote?: string; sensitive?: string
  // תאימות לאחור — שדות מבנה ישן
  coordX?: string; coordY?: string; usedFor?: string; ceiling?: string
  ceilingType?: string; ceilingConstruction?: string; grandpaStick?: string; asbestosType?: string
}
interface Blocks {
  asbestos?: AsbestosBlock
  roofReplace?: Record<string, string>
  aluminum?: { shade?: string; meters?: string; coating?: string[] }
  gutters?: Record<string, string>
  insulation?: Record<string, string>
  other?: { note?: string }
}
interface WorkContent {
  details?: { date?: string; fillerName?: string; orderNumber?: string; customerName?: string; address?: string; phones?: string[]; solarPrep?: boolean }
  general?: { roofHeight?: string; area?: string; roofType?: string; construction?: string; chips?: string[] }
  logistics?: { crane?: string; container?: string; lift?: string; arm?: string; access?: string; workHeight?: string; chips?: string[] }
  workTypes?: string[]
  blocks?: Blocks
  documentation?: { photos?: DocItem[]; sketch?: DocItem[]; documents?: DocItem[] }
  notes?: Record<string, string>
  others?: Record<string, string>
}
interface ViewData {
  name: string
  date: string
  status: string
  fillerName: string
  content: WorkContent
  materials: { active?: string[]; data?: Record<string, MaterialCategory> }
}

function has(v: unknown): boolean {
  return v != null && String(v).trim() !== ''
}
function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })
}
function num(s?: string): number { const n = parseFloat(String(s ?? '')); return isNaN(n) ? 0 : n }

// ── פקדי תצוגה ─────────────────────────────────────────────────
function Section({ icon, title, badge, children }: {
  icon: string; title: string; badge?: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: '#fff', margin: '6px 8px', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <div style={{
        background: SECTION_BG, color: SECTION_COLOR, padding: '6px 12px', fontSize: 13, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl',
      }}>
        <span>{icon} {title}</span>
        {badge && <span style={{ fontSize: 12, fontWeight: 700 }}>{badge}</span>}
      </div>
      <div style={{ padding: '4px 0' }}>{children}</div>
    </div>
  )
}
// שורת ערך — לא מוצגת כלל אם הערך ריק
function Row({ label, value }: { label: string; value?: string }) {
  if (!has(value)) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '7px 12px', direction: 'rtl' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: GREY, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: '#111', textAlign: 'right' }}>{value}</span>
    </div>
  )
}
// זוג שדות בגריד 2 עמודות (מדלג על ריקים)
const galRow: React.CSSProperties = {
  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
  padding: '9px 12px', direction: 'rtl', background: 'none', border: 'none', borderTop: '1px solid #f0ebe6',
  cursor: 'pointer', fontFamily: 'inherit',
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, direction: 'rtl' }}>{children}</div>
}

export default function ExecutionSheetView() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ViewData | null>(null)
  const [gallery, setGallery] = useState<{ title: string; imgs: { url: string; note?: string }[] } | null>(null)
  const [galLoading, setGalLoading] = useState(false)

  // פותח גלריית תמונות — חותם מחדש את ה-paths (bucket פרטי 'sheet-images'),
  // עם נפילה לכתובות השמורות אם החתימה נכשלת.
  async function openGallery(title: string, items: DocItem[]) {
    const list = (items ?? []).filter(it => it.path || it.url)
    if (!list.length) return
    setGalLoading(true); setGallery({ title, imgs: [] })
    try {
      const paths = list.filter(it => it.path).map(it => it.path!) as string[]
      const signed: Record<string, string> = {}
      if (paths.length) {
        const { data: s } = await supabase.storage.from('sheet-images').createSignedUrls(paths, 60 * 60)
        for (const row of s ?? []) if (row.path && row.signedUrl) signed[row.path] = row.signedUrl
      }
      const imgs = list.map(it => ({ url: (it.path && signed[it.path]) || it.url || '', note: it.note })).filter(x => x.url)
      setGallery({ title, imgs })
    } catch (e) {
      console.error('[sheet-view] gallery sign failed:', e)
      const imgs = list.map(it => ({ url: it.url || '', note: it.note })).filter(x => x.url)
      setGallery({ title, imgs })
    } finally {
      setGalLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      let sheet: any, bs: any
      try {
        sheet = await queryWithRetry<any>(() => supabase.from('execution_sheets').select('*').eq('id', id).single())
        bs = await queryWithRetry<any[]>(() => supabase.from('buildings').select('*').eq('sheet_id', id).order('building_number').limit(1))
      } catch (e) {
        if (!cancelled) { console.error('[sheet-view] load failed after retries:', e); setError('הדף לא נמצא'); setLoading(false) }
        return
      }
      if (cancelled) return
      const b = bs?.[0]
      const content = (b?.work_content ?? {}) as WorkContent
      const materials = (b?.materials ?? {}) as ViewData['materials']
      setData({
        name: sheet.project_name || content.details?.customerName || 'דף ביצוע',
        date: sheet.sheet_date || content.details?.date || '',
        status: sheet.status || 'field',
        fillerName: sheet.filled_by_name || content.details?.fillerName || '',
        content,
        materials,
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id])

  // ערך בחירה — אם נבחר "אחר", הצג את הטקסט החופשי שנשמר תחת המפתח
  function pick(value?: string, okey?: string): string {
    const others = data?.content.others ?? {}
    if (value === 'אחר' && okey && has(others[okey])) return others[okey]
    return value ?? ''
  }

  async function share() {
    if (!data) return
    const lines = [
      `דף ביצוע — ${data.name}`,
      data.date ? `תאריך: ${fmtDate(data.date)}` : '',
      data.content.details?.address ? `כתובת: ${data.content.details.address}` : '',
    ].filter(Boolean)
    const text = lines.join('\n')
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: data.name, text, url })
        return
      }
    } catch { /* בוטל ע"י המשתמש */ }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      alert('הקישור הועתק ✓')
    } catch {
      alert(url)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: BG }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: HEADER_RED, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, background: BG, direction: 'rtl' }}>
        <p style={{ fontSize: 15, color: HEADER_RED }}>{error ?? 'שגיאה'}</p>
        <button onClick={() => navigate('/sheets')} style={{ background: HEADER_RED, color: '#fff', border: 'none', borderRadius: 20, padding: '10px 22px', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>חזרה</button>
      </div>
    )
  }

  const c = data.content
  const d = c.details ?? {}
  const g = c.general ?? {}
  const wt = c.workTypes ?? []
  const blocks = c.blocks ?? {}
  const status = STATUS_META[data.status] ?? STATUS_META.field
  const phones = (d.phones ?? []).filter(has)
  const doc = c.documentation ?? {}
  const photoCount = (doc.photos ?? []).length
  const sketchCount = (doc.sketch ?? []).length
  const docCount = (doc.documents ?? []).length
  const generalNote = c.notes?.details || c.notes?.general || (blocks.other?.note ?? '')

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, fontFamily: 'Heebo, sans-serif' }}>
      {/* Header */}
      <div style={{ background: HEADER_RED, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 17, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.name}</div>
          {has(data.date) && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 500 }}>{fmtDate(data.date)}</div>}
        </div>
        <button onClick={() => navigate('/sheets')} title="חזרה" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#fff', fontSize: 22, lineHeight: 1, fontFamily: 'inherit' }}>←</button>
      </div>

      {/* Status bar */}
      <div style={{ background: '#fff', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, direction: 'rtl' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{has(data.fillerName) ? `ממלא: ${data.fillerName}` : 'ממלא: —'}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: status.color, background: status.bg, borderRadius: 12, padding: '3px 12px' }}>{status.label}</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }} className="no-scrollbar">

        {/* פרטי לקוח */}
        <Section icon="👤" title="פרטי לקוח">
          {has(d.customerName) && (
            <div style={{ padding: '7px 12px', direction: 'rtl' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#111', textAlign: 'right' }}>{d.customerName}</div>
              {has(d.address) && <div style={{ fontSize: 14, color: '#555', textAlign: 'right', marginTop: 2 }}>{d.address}</div>}
            </div>
          )}
          {!has(d.customerName) && <Row label="כתובת" value={d.address} />}
          {has(d.orderNumber) && <Row label="הזמנה מס׳" value={d.orderNumber} />}
          {phones.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '7px 12px', direction: 'rtl' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: GREY, flexShrink: 0 }}>טלפון</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111', textAlign: 'right' }} dir="ltr">{phones.join(' · ')}</span>
            </div>
          )}
          {d.solarPrep && <Row label="הכנה סולרי" value="כן" />}
        </Section>

        {/* מאפיינים כלליים */}
        {(has(g.roofHeight) || has(g.area) || has(g.roofType) || has(g.construction) || (g.chips ?? []).length > 0) && (
          <Section icon="🏠" title="מאפיינים כלליים">
            <Grid>
              <Row label="גובה גג" value={g.roofHeight} />
              <Row label="שטח (מ״ר)" value={g.area} />
              <Row label="סוג גג" value={pick(g.roofType, 'gen.roofType')} />
              <Row label="קונסטרוקציה" value={pick(g.construction, 'gen.construction')} />
            </Grid>
            {(g.chips ?? []).length > 0 && <Row label="נוסף" value={(g.chips ?? []).join(', ')} />}
          </Section>
        )}

        {/* החלפת אסבסט (רב-מבנים) */}
        {wt.includes('asbestos') && blocks.asbestos && (() => {
          const a = blocks.asbestos!
          // תאימות לאחור: מבנה ישן ללא מערך buildings → עוטפים כמבנה יחיד
          const buildings: AsbBuilding[] = Array.isArray(a.buildings) && a.buildings.length
            ? a.buildings
            : (has(a.coordX) || has(a.coordY) || has(a.usedFor))
              ? [{ coordX: a.coordX, coordY: a.coordY, structureType: a.usedFor, construction: a.ceilingConstruction, ceiling: a.ceiling, ceilingType: a.ceilingType, grandpaStick: a.grandpaStick, asbestosKind: a.asbestosType }]
              : []
          if (buildings.length === 0 && !has(a.sensitive) && !has(a.generalNote)) return null
          const totalArea = buildings.reduce((s, b) => s + num(b.roofSize), 0)
          const other = (v?: string, o?: string) => (v === 'אחר' && has(o) ? o : v)
          const badge = buildings.length ? `${totalArea || 0} מ"ר · ${buildings.length} מבנים` : undefined
          return (
            <Section icon="🟠" title="החלפת אסבסט" badge={badge}>
              {buildings.map((b, i) => (
                <div key={i} style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : 'none', paddingTop: i > 0 ? 4 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 12px 2px', direction: 'rtl' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#c0392b' }}>מבנה {i + 1}</span>
                    {(has(b.coordX) || has(b.coordY)) && <span style={{ fontSize: 13, fontWeight: 600, color: GREY }} dir="ltr">{b.coordX || '—'} / {b.coordY || '—'}</span>}
                  </div>
                  <Grid>
                    <Row label={'גודל גג (מ"ר)'} value={b.roofSize} />
                    <Row label="סוג מבנה" value={other(b.structureType, b.structureTypeOther)} />
                    <Row label="קונסטרוקציה" value={other(b.construction, b.constructionOther)} />
                    <Row label="גובה (מ')" value={b.height} />
                    <Row label="מצב קונס'" value={b.consState} />
                    <Row label="מקל סבא" value={b.grandpaStick} />
                    <Row label="תקרה קשיחה" value={b.ceiling} />
                    {b.ceiling === 'יש' && <Row label="סוג תקרה" value={other(b.ceilingType, b.ceilingTypeOther)} />}
                    <Row label="תשתית" value={b.infra} />
                    <Row label="סוג אסבסט" value={b.asbestosKind} />
                    {b.asbestosKind === 'אחר' && <Row label="סוג" value={other(b.asbestosSub, b.asbestosSubOther)} />}
                    <Row label="קירוי חדש" value={b.newRoof && b.newRoof !== 'ללא' && has(b.newRoofNote) ? `${b.newRoof} — ${b.newRoofNote}` : b.newRoof} />
                  </Grid>
                  {has(b.note) && <Row label="הערה" value={b.note} />}
                </div>
              ))}
              <Row label="הערה כללית" value={a.generalNote} />
              <Row label="מבנים רגישים" value={a.sensitive} />
            </Section>
          )
        })()}

        {/* החלפת גג */}
        {wt.includes('roofReplace') && blocks.roofReplace && (() => {
          const r = blocks.roofReplace!
          return (
            <Section icon="🏗️" title="החלפת גג">
              <Grid>
                <Row label="גג קיים" value={pick(r.existingRoof, 'rr.existingRoof')} />
                <Row label="גג חדש" value={pick(r.newRoof, 'rr.newRoof')} />
                <Row label="קונסטרוקציה" value={pick(r.construction, 'rr.construction')} />
                <Row label="שיפוע" value={r.slope} />
                <Row label="עובי פח" value={r.sheetThickness} />
                <Row label="עובי פח עליון" value={r.topThickness} />
                <Row label="עובי פח תחתון" value={r.bottomThickness} />
                <Row label="סוג מילוי" value={pick(r.fillType, 'rr.fillType')} />
                <Row label="סוג רעף" value={pick(r.tileType, 'rr.tileType')} />
                <Row label="צבע" value={pick(r.color, 'rr.color')} />
                <Row label="בליטה מהפתות" value={r.overhang} />
                <Row label="הערה" value={r.overhangNote} />
              </Grid>
            </Section>
          )
        })()}

        {/* קטגוריות חומרים — רק כאלה עם נתונים */}
        {(data.materials.active ?? []).map(catKey => {
          const cat = data.materials.data?.[catKey]
          if (!cat) return null
          const rows = (cat.rows ?? []).filter(r => has(r.type) || has(r.qty) || has(r.measure))
          const hasRoofHead = catKey === 'roofing' && has(cat.roofingType)
          if (rows.length === 0 && !hasRoofHead) return null
          const unit = CATEGORY_UNIT[catKey] ?? ''
          const total = (cat.rows ?? []).reduce((s, r) => s + num(r.qty) * num(r.measure), 0)
          const ok = (k: string) => `mat.${catKey}.${k}`
          return (
            <Section key={catKey} icon={CATEGORY_ICON[catKey] ?? '📦'} title={CATEGORY_LABEL[catKey] ?? catKey}>
              {hasRoofHead && (
                <Grid>
                  <Row label="סוג" value={pick(cat.roofingType, ok('roofingType'))} />
                  <Row label="עובי" value={cat.sheetThickness} />
                  <Row label="עובי פח עליון" value={cat.topThickness} />
                  <Row label="עובי פח תחתון" value={cat.bottomThickness} />
                  <Row label="סוג מילוי" value={pick(cat.fillType, ok('fillType'))} />
                  <Row label="סוג רעף" value={pick(cat.tileType, ok('tileType'))} />
                  <Row label="צבע" value={pick(cat.roofColor, ok('roofColor'))} />
                </Grid>
              )}
              {rows.map((r, i) => {
                const typeLabel = r.type === 'אחר' && has(r.typeOther) ? r.typeOther : r.type
                const riderBits = r.type === 'רוכב'
                  ? [r.riderType, has(r.riderAngle) ? `זווית ${r.riderAngle}` : '']
                  : []
                const parts = [typeLabel, ...riderBits, r.shade].filter(has).join(' · ')
                const calc = num(r.qty) * num(r.measure)
                const qtyText = has(r.qty) || has(r.measure) ? `${r.qty || 0} × ${r.measure || 0} = ${calc || 0} ${unit}` : ''
                return <Row key={i} label={parts || `פריט ${i + 1}`} value={qtyText || '—'} />
              })}
              {total > 0 && <Row label={`סה״כ ${CATEGORY_LABEL[catKey] ?? ''}`} value={`${total} ${unit}`} />}
            </Section>
          )
        })}

        {/* מרזבים (מתוך בלוק העבודה) */}
        {wt.includes('gutters') && blocks.gutters && (has(blocks.gutters.type) || has(blocks.gutters.guttersM) || has(blocks.gutters.downUnits)) && (
          <Section icon="🌧️" title="מרזבים">
            <Row label="סוג" value={pick(blocks.gutters.type, 'gut.type')} />
            <Grid>
              <Row label="מרזבים (מ׳)" value={blocks.gutters.guttersM} />
              <Row label="מקטעים" value={blocks.gutters.guttersSegments} />
              <Row label="ירידות (יח׳)" value={blocks.gutters.downUnits} />
              <Row label="מקטעים" value={blocks.gutters.downSegments} />
            </Grid>
          </Section>
        )}

        {/* תיעוד */}
        {(photoCount > 0 || sketchCount > 0 || docCount > 0) && (
          <Section icon="📷" title="תיעוד">
            {photoCount > 0 && (
              <button type="button" onClick={() => openGallery('תמונות שטח', doc.photos ?? [])} style={galRow}>
                <span style={{ fontSize: 13, fontWeight: 600, color: GREY }}>תמונות שטח</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>{photoCount}</span>
                  <span style={{ color: HEADER_RED, fontSize: 20, lineHeight: 1 }}>›</span>
                </span>
              </button>
            )}
            {sketchCount > 0 && (
              <button type="button" onClick={() => openGallery('סקיצות', doc.sketch ?? [])} style={galRow}>
                <span style={{ fontSize: 13, fontWeight: 600, color: GREY }}>סקיצות</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>{sketchCount}</span>
                  <span style={{ color: HEADER_RED, fontSize: 20, lineHeight: 1 }}>›</span>
                </span>
              </button>
            )}
            <Row label="מסמכים" value={docCount ? String(docCount) : undefined} />
          </Section>
        )}

        {/* הערות סוגי עבודה */}
        {(() => {
          const wtNotes = wt
            .map(k => ({ label: WORK_TYPE_LABEL[k] ?? k, note: (c.notes?.[`wt:${k}`] ?? '').trim() }))
            .filter(x => x.note)
          if (!wtNotes.length) return null
          return (
            <Section icon="📝" title="הערות סוגי עבודה">
              {wtNotes.map((x, i) => (
                <div key={i} style={{ padding: '7px 12px', direction: 'rtl' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: GREY, marginBottom: 2 }}>{x.label}</div>
                  <div style={{ fontSize: 15, color: '#111', textAlign: 'right', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{x.note}</div>
                </div>
              ))}
            </Section>
          )
        })()}

        {/* הערה כללית */}
        {has(generalNote) && (
          <Section icon="📝" title="הערה כללית">
            <div style={{ padding: '7px 12px', fontSize: 15, color: '#111', textAlign: 'right', direction: 'rtl', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{generalNote}</div>
          </Section>
        )}
      </div>

      {/* Gallery overlay */}
      {gallery && (
        <div onClick={() => setGallery(null)} style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexShrink: 0, direction: 'rtl' }} onClick={e => e.stopPropagation()}>
            <span style={{ flex: 1, color: '#fff', fontWeight: 800, fontSize: 16 }}>{gallery.title}</span>
            <button onClick={() => setGallery(null)} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '50%', width: 34, height: 34, fontSize: 18, cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
          </div>
          <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 10px 20px', display: 'flex', flexDirection: 'column', gap: 14 }} onClick={e => e.stopPropagation()}>
            {galLoading && <div style={{ color: '#fff', textAlign: 'center', padding: 30 }}>טוען…</div>}
            {!galLoading && gallery.imgs.length === 0 && <div style={{ color: '#fff', textAlign: 'center', padding: 30 }}>אין תמונות להצגה</div>}
            {gallery.imgs.map((im, i) => (
              <div key={i}>
                <img src={im.url} alt="" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                {has(im.note) && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'right', direction: 'rtl', marginTop: 4 }}>{im.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate(`/sheets/${id}`)} style={{
          flex: 1, background: HEADER_RED, color: '#fff', border: 'none', borderRadius: 10,
          padding: 13, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>✏️ ערוך</button>
        <button onClick={share} style={{
          flex: 1, background: '#fff', color: HEADER_RED, border: `1.5px solid ${HEADER_RED}`, borderRadius: 10,
          padding: 13, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>שתף</button>
      </div>
    </div>
  )
}
