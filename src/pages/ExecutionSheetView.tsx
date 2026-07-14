import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
  asbestos: '🟠 הסרת אסבסט', roofReplace: '🏠 החלפת גג', aluminum: '🔩 ציפוי אלומיניום',
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
interface Blocks {
  asbestos?: Record<string, string> & { foamed?: boolean }
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
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, direction: 'rtl' }}>{children}</div>
}

export default function ExecutionSheetView() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ViewData | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      const { data: sheet, error: sErr } = await supabase.from('execution_sheets').select('*').eq('id', id).single()
      if (cancelled) return
      if (sErr || !sheet) { setError('הדף לא נמצא'); setLoading(false); return }
      const { data: bs } = await supabase.from('buildings').select('*').eq('sheet_id', id).order('building_number').limit(1)
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

        {/* הסרת אסבסט */}
        {wt.includes('asbestos') && blocks.asbestos && (() => {
          const a = blocks.asbestos!
          const badge = (has(a.coordX) || has(a.coordY)) ? `${a.coordX || '—'} / ${a.coordY || '—'}` : undefined
          return (
            <Section icon="🟡" title="הסרת אסבסט" badge={badge}>
              <Grid>
                <Row label="למה משמש" value={pick(a.usedFor, 'asb.usedFor')} />
                <Row label="קונסטרוקציה" value={pick(a.ceilingConstruction, 'asb.construction')} />
                <Row label="תקרה קשיחה" value={pick(a.ceiling, 'asb.ceiling')} />
                <Row label="סוג תקרה" value={pick(a.ceilingType, 'asb.ceilingType')} />
                <Row label="מקל סבא" value={a.grandpaStick} />
                <Row label="סוג אסבסט" value={pick(a.asbestosType, 'asb.type')} />
                <Row label="מוקצף" value={a.foamed ? 'כן' : 'לא'} />
              </Grid>
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
            <Row label="תמונות שטח" value={photoCount ? String(photoCount) : undefined} />
            <Row label="סקיצות" value={sketchCount ? String(sketchCount) : undefined} />
            <Row label="מסמכים" value={docCount ? String(docCount) : undefined} />
          </Section>
        )}

        {/* הערה כללית */}
        {has(generalNote) && (
          <Section icon="📝" title="הערה כללית">
            <div style={{ padding: '7px 12px', fontSize: 15, color: '#111', textAlign: 'right', direction: 'rtl', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{generalNote}</div>
          </Section>
        )}
      </div>

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
