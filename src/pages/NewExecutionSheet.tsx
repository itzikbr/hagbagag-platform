import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ──────────────────────────────────────────────────────────────
// צבעים / קבועים
// ──────────────────────────────────────────────────────────────
const RED = '#CC0000'
const GREY = '#8696A0'
const BG = '#F5F5F5'
const BORDER = '#E0E0E0'

// סוג העבודה היחיד בגרסה זו — התבנית תשוכפל לשאר הסוגים
const WORK_TYPE = 'בניית גג (עץ ומתכת)'

// ── רשימות בחירה (ניתנות לעריכה בהמשך) ──
const ROOFING_TYPES     = ['איסכורית', 'פנל מבודד', 'רעפים', 'אחר']
const ROOFING_THICKNESS = ['0.4', '0.5', 'קלקר', 'אחר']
const ROOFING_COLORS    = ['לבן', 'קרם', 'טרה קוטה', 'כסוף', 'אחר']
const WOOD_TYPES        = ['קורה 4×2', 'קורה 3×2', 'לתה', 'אחר']
const FLASHING_TYPES    = ['סוגר חזית', 'סוגר צד', 'פלשונג עליון', 'כובע לפלשונג', 'רוכב פח']
const ALUM_TYPES        = ['חיפוי', 'סוגר', 'זווית', 'אחר']
const ALUM_SHADES       = ['טבעי', 'לבן', 'שחור', 'ברונזה', 'אחר']
const IRON_PROFILES     = ['UNP 80', 'UNP 100', 'IPE 100', 'זווית', 'אחר']
const INSULATION_TYPES  = ['צמר סלעים', 'קלקר', 'יריעת בידוד', 'אחר']
const MISC_ITEMS        = ['ברגים', 'סיליקון', 'אטם', 'צבע', 'אחר']

// ──────────────────────────────────────────────────────────────
// טיפוסים
// ──────────────────────────────────────────────────────────────
interface QLRow { qty: string; length: string }               // כמות × אורך
interface RoofingBlock { type: string; thickness: string; color: string; rows: QLRow[] }
interface TypedRow { type: string; qty: string; measure: string }   // סוג + כמות × מידה
interface AlumRow { type: string; shade: string; qty: string; measure: string }
interface WoodRow { type: string; qty: string; length: string }
interface MiscRow { item: string; note: string }

interface Materials {
  roofing: RoofingBlock[]
  wood: WoodRow[]
  woodDisinfected: boolean
  woodPlaned: boolean
  flashing: TypedRow[]
  aluminum: AlumRow[]
  iron: TypedRow[]
  insulation: TypedRow[]
  misc: MiscRow[]
  hidden: string[]        // מפתחות קטגוריות שנמחקו מהתצוגה
}

function emptyMaterials(): Materials {
  return {
    roofing: [], wood: [], woodDisinfected: false, woodPlaned: false,
    flashing: [], aluminum: [], iron: [], insulation: [], misc: [], hidden: [],
  }
}

interface CatMeta { key: string; label: string }
const CATEGORIES: CatMeta[] = [
  { key: 'roofing',    label: 'חומרי קירוי' },
  { key: 'wood',       label: 'עץ' },
  { key: 'flashing',   label: 'פחחות' },
  { key: 'aluminum',   label: 'חיפוי אלומיניום' },
  { key: 'iron',       label: 'ברזל · קונסטרוקציית מתכת' },
  { key: 'insulation', label: 'בידוד' },
  { key: 'misc',       label: 'שונות' },
]

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function num(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}
function fmt(n: number): string {
  if (!n) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

// ──────────────────────────────────────────────────────────────
// סגנונות משותפים
// ──────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, boxSizing: 'border-box', border: `1px solid ${BORDER}`,
  borderRadius: 8, padding: '0 10px', fontSize: 13, fontWeight: 600, color: '#111',
  direction: 'rtl', outline: 'none', background: '#fff', fontFamily: 'inherit',
}
const addRowBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: RED, fontSize: 14, fontWeight: 700,
  cursor: 'pointer', padding: '6px 0', fontFamily: 'inherit',
}

// ── דרופדאון עם position:fixed — לא נחסם ע"י overflow ──────────
function Dropdown({ value, options, onChange, placeholder = 'בחר', flex = 1 }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder?: string; flex?: number
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(o => !o)
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} style={{
        ...inputStyle, flex, width: 'auto', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 6, cursor: 'pointer',
      }}>
        <span style={{
          color: value ? '#111' : '#BBB', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value || placeholder}</span>
        <span style={{ color: GREY, fontSize: 9, flexShrink: 0 }}>▼</span>
      </button>
      {open && rect && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} className="no-scrollbar" style={{
            position: 'fixed', top: rect.bottom + 4, right: window.innerWidth - rect.right,
            width: Math.max(rect.width, 150), maxHeight: 260, overflowY: 'auto',
            background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10,
            boxShadow: '0 6px 24px rgba(0,0,0,0.18)', direction: 'rtl', fontFamily: 'inherit',
          }}>
            {options.map(o => (
              <button key={o} type="button" onClick={() => { onChange(o); setOpen(false) }} style={{
                width: '100%', textAlign: 'right', padding: '11px 14px',
                background: o === value ? '#FDECEC' : '#fff', border: 'none',
                borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 14, color: '#111', fontWeight: o === value ? 700 : 500,
              }}>{o}</button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function DeleteX({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: 'none', border: 'none', color: GREY, cursor: 'pointer',
      fontSize: 20, lineHeight: 1, padding: '0 4px', fontFamily: 'inherit',
    }}>×</button>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      border: active ? `1px solid ${RED}` : `1px solid ${BORDER}`,
      background: active ? RED : '#fff', color: active ? '#fff' : '#333',
      borderRadius: 18, padding: '6px 14px', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', direction: 'rtl', fontFamily: 'inherit',
    }}>{label}</button>
  )
}

// ── כרטיס קטגוריה מתקפל ────────────────────────────────────────
function CategoryCard({ title, summary, open, onToggle, onDelete, children }: {
  title: string; summary: string; open: boolean
  onToggle: () => void; onDelete: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px',
        cursor: 'pointer', direction: 'rtl',
      }}>
        <button type="button" onClick={e => { e.stopPropagation(); onDelete() }} title="הסר קטגוריה" style={{
          width: 26, height: 26, borderRadius: '50%', border: `1px solid ${BORDER}`,
          background: '#fff', color: GREY, cursor: 'pointer', fontSize: 18, lineHeight: 1,
          flexShrink: 0, fontFamily: 'inherit',
        }}>−</button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: RED }}>{title}</span>
          {summary && <span style={{ fontSize: 10, color: GREY, fontWeight: 500 }}>{summary}</span>}
        </div>

        <span style={{
          flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          <svg width="9" height="15" viewBox="0 0 8 14" fill="none">
            <path d="M6.5 1 1.5 7l5 6" stroke="#C4C4C4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      {open && <div style={{ padding: '2px 12px 14px' }}>{children}</div>}
    </div>
  )
}

// ── סרגל סה"כ ──────────────────────────────────────────────────
function TotalBar({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 10, padding: '8px 12px', border: `1.5px solid ${RED}`,
      borderRadius: 8, direction: 'rtl',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: RED }}>{value}</span>
    </div>
  )
}

// ── שורת כמות × מידה עם תוצאה אדומה ────────────────────────────
function QtyMeasureRow({ qty, measure, measurePlaceholder, onQty, onMeasure }: {
  qty: string; measure: string; measurePlaceholder: string
  onQty: (v: string) => void; onMeasure: (v: string) => void
}) {
  const result = num(qty) * num(measure)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'rtl' }}>
      <input style={{ ...inputStyle, flex: 1 }} type="number" inputMode="numeric" placeholder="כמות"
        value={qty} onChange={e => onQty(e.target.value)} />
      <span style={{ color: GREY, fontSize: 13, fontWeight: 700 }}>×</span>
      <input style={{ ...inputStyle, flex: 1 }} type="number" inputMode="decimal" placeholder={measurePlaceholder}
        value={measure} onChange={e => onMeasure(e.target.value)} />
      <span style={{ color: GREY, fontSize: 13, fontWeight: 700 }}>=</span>
      <span style={{
        flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 800, color: RED,
      }}>{fmt(result)}</span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// קטגוריה: חומרי קירוי (בלוקים מרובים)
// ──────────────────────────────────────────────────────────────
function roofingBlockTotal(b: RoofingBlock): number {
  return b.rows.reduce((s, r) => s + num(r.qty) * num(r.length), 0)
}
function RoofingCategory({ blocks, onChange }: { blocks: RoofingBlock[]; onChange: (b: RoofingBlock[]) => void }) {
  const [editing, setEditing] = useState<number | null>(null)

  function addBlock() {
    const next = [...blocks, { type: '', thickness: '', color: '', rows: [{ qty: '', length: '' }] }]
    onChange(next)
    setEditing(next.length - 1)
  }
  function patchBlock(i: number, p: Partial<RoofingBlock>) {
    onChange(blocks.map((b, j) => (j === i ? { ...b, ...p } : b)))
  }
  function removeBlock(i: number) {
    onChange(blocks.filter((_, j) => j !== i))
    setEditing(null)
  }
  function finishBlock() {
    setEditing(null)
    if (window.confirm('להוסיף סוג קירוי נוסף?')) {
      const next = [...blocks, { type: '', thickness: '', color: '', rows: [{ qty: '', length: '' }] }]
      onChange(next)
      setEditing(next.length - 1)
    }
  }

  return (
    <div>
      {blocks.map((b, i) => {
        const total = roofingBlockTotal(b)
        if (editing !== i) {
          return (
            <div key={i} onClick={() => setEditing(i)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 8,
              marginBottom: 8, cursor: 'pointer', direction: 'rtl', background: '#FAFAFA',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>
                {b.type || 'סוג קירוי'}{b.color ? ` · ${b.color}` : ''}{b.thickness ? ` · ${b.thickness}` : ''}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: RED }}>{fmt(total)} מ"א</span>
            </div>
          )
        }
        return (
          <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <DeleteX onClick={() => removeBlock(i)} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <Dropdown value={b.type} options={ROOFING_TYPES} placeholder="סוג קירוי"
                onChange={v => patchBlock(i, { type: v })} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <Dropdown value={b.thickness} options={ROOFING_THICKNESS} placeholder="עובי"
                onChange={v => patchBlock(i, { thickness: v })} />
              <Dropdown value={b.color} options={ROOFING_COLORS} placeholder="צבע"
                onChange={v => patchBlock(i, { color: v })} />
            </div>
            {b.rows.map((r, ri) => (
              <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <QtyMeasureRow qty={r.qty} measure={r.length} measurePlaceholder="אורך"
                    onQty={v => patchBlock(i, { rows: b.rows.map((x, j) => j === ri ? { ...x, qty: v } : x) })}
                    onMeasure={v => patchBlock(i, { rows: b.rows.map((x, j) => j === ri ? { ...x, length: v } : x) })} />
                </div>
                {b.rows.length > 1 && (
                  <DeleteX onClick={() => patchBlock(i, { rows: b.rows.filter((_, j) => j !== ri) })} />
                )}
              </div>
            ))}
            <button type="button" style={addRowBtn}
              onClick={() => patchBlock(i, { rows: [...b.rows, { qty: '', length: '' }] })}>+ הוסף שורה</button>
            <TotalBar label='סה"כ סוג זה' value={`${fmt(total)} מ"א`} />
            <button type="button" onClick={finishBlock} style={{
              width: '100%', marginTop: 10, background: RED, color: '#fff', border: 'none',
              borderRadius: 8, padding: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>✓ סיום</button>
          </div>
        )
      })}
      <button type="button" onClick={addBlock} style={{
        width: '100%', background: '#fff', border: `1.5px dashed ${RED}`, color: RED,
        borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}>＋ הוסף סוג קירוי</button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// קטגוריה: עץ
// ──────────────────────────────────────────────────────────────
function WoodCategory({ m, patch }: { m: Materials; patch: (p: Partial<Materials>) => void }) {
  const rows = m.wood
  const total = rows.reduce((s, r) => s + num(r.qty) * num(r.length), 0)
  function upd(next: WoodRow[]) { patch({ wood: next }) }
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <Chip label="מחוטא" active={m.woodDisinfected} onClick={() => patch({ woodDisinfected: !m.woodDisinfected })} />
        <Chip label="מוקצע" active={m.woodPlaned} onClick={() => patch({ woodPlaned: !m.woodPlaned })} />
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Dropdown value={r.type} options={WOOD_TYPES} placeholder="סוג עץ"
              onChange={v => upd(rows.map((x, j) => j === i ? { ...x, type: v } : x))} />
            <DeleteX onClick={() => upd(rows.filter((_, j) => j !== i))} />
          </div>
          <QtyMeasureRow qty={r.qty} measure={r.length} measurePlaceholder="אורך"
            onQty={v => upd(rows.map((x, j) => j === i ? { ...x, qty: v } : x))}
            onMeasure={v => upd(rows.map((x, j) => j === i ? { ...x, length: v } : x))} />
        </div>
      ))}
      <button type="button" style={addRowBtn}
        onClick={() => upd([...rows, { type: '', qty: '', length: '' }])}>+ הוסף שורה</button>
      {rows.length > 0 && <TotalBar label='סה"כ עץ' value={`${fmt(total)} מ"א`} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// קטגוריה גנרית: סוג + כמות × מידה (פחחות / ברזל / בידוד)
// ──────────────────────────────────────────────────────────────
function TypedRowsCategory({ rows, onChange, typeOptions, typePlaceholder, measurePlaceholder, totalLabel, unit }: {
  rows: TypedRow[]; onChange: (r: TypedRow[]) => void
  typeOptions: string[]; typePlaceholder: string; measurePlaceholder: string
  totalLabel: string; unit: string
}) {
  const total = rows.reduce((s, r) => s + num(r.qty) * num(r.measure), 0)
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Dropdown value={r.type} options={typeOptions} placeholder={typePlaceholder}
              onChange={v => onChange(rows.map((x, j) => j === i ? { ...x, type: v } : x))} />
            <DeleteX onClick={() => onChange(rows.filter((_, j) => j !== i))} />
          </div>
          <QtyMeasureRow qty={r.qty} measure={r.measure} measurePlaceholder={measurePlaceholder}
            onQty={v => onChange(rows.map((x, j) => j === i ? { ...x, qty: v } : x))}
            onMeasure={v => onChange(rows.map((x, j) => j === i ? { ...x, measure: v } : x))} />
        </div>
      ))}
      <button type="button" style={addRowBtn}
        onClick={() => onChange([...rows, { type: '', qty: '', measure: '' }])}>+ הוסף שורה</button>
      {rows.length > 0 && <TotalBar label={totalLabel} value={`${fmt(total)} ${unit}`} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// קטגוריה: חיפוי אלומיניום (סוג + גוון + כמות × מ׳)
// ──────────────────────────────────────────────────────────────
function AluminumCategory({ rows, onChange }: { rows: AlumRow[]; onChange: (r: AlumRow[]) => void }) {
  const total = rows.reduce((s, r) => s + num(r.qty) * num(r.measure), 0)
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Dropdown value={r.type} options={ALUM_TYPES} placeholder="סוג"
              onChange={v => onChange(rows.map((x, j) => j === i ? { ...x, type: v } : x))} />
            <Dropdown value={r.shade} options={ALUM_SHADES} placeholder="גוון"
              onChange={v => onChange(rows.map((x, j) => j === i ? { ...x, shade: v } : x))} />
            <DeleteX onClick={() => onChange(rows.filter((_, j) => j !== i))} />
          </div>
          <QtyMeasureRow qty={r.qty} measure={r.measure} measurePlaceholder='מ׳'
            onQty={v => onChange(rows.map((x, j) => j === i ? { ...x, qty: v } : x))}
            onMeasure={v => onChange(rows.map((x, j) => j === i ? { ...x, measure: v } : x))} />
        </div>
      ))}
      <button type="button" style={addRowBtn}
        onClick={() => onChange([...rows, { type: '', shade: '', qty: '', measure: '' }])}>+ הוסף שורה</button>
      {rows.length > 0 && <TotalBar label='סה"כ אלומיניום' value={`${fmt(total)} מ׳`} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// קטגוריה: שונות (פריט + הערה)
// ──────────────────────────────────────────────────────────────
function MiscCategory({ rows, onChange }: { rows: MiscRow[]; onChange: (r: MiscRow[]) => void }) {
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Dropdown value={r.item} options={MISC_ITEMS} placeholder="פריט"
              onChange={v => onChange(rows.map((x, j) => j === i ? { ...x, item: v } : x))} />
            <DeleteX onClick={() => onChange(rows.filter((_, j) => j !== i))} />
          </div>
          <input style={inputStyle} placeholder="הערה חופשית" value={r.note}
            onChange={e => onChange(rows.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
        </div>
      ))}
      <button type="button" style={addRowBtn}
        onClick={() => onChange([...rows, { item: '', note: '' }])}>+ הוסף פריט</button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// תקצירי קטגוריות (מוצגים ליד הכותרת כשמכווצת)
// ──────────────────────────────────────────────────────────────
function categorySummary(key: string, m: Materials): string {
  switch (key) {
    case 'roofing': {
      const total = m.roofing.reduce((s, b) => s + roofingBlockTotal(b), 0)
      if (!m.roofing.length) return ''
      const types = m.roofing.map(b => b.type).filter(Boolean)
      return `${types.length ? types.join(', ') + ' · ' : ''}${fmt(total)} מ"א`
    }
    case 'wood': {
      if (!m.wood.length) return ''
      const total = m.wood.reduce((s, r) => s + num(r.qty) * num(r.length), 0)
      const tags = [m.woodDisinfected && 'מחוטא', m.woodPlaned && 'מוקצע'].filter(Boolean).join(', ')
      return `${m.wood.length} פריטים · ${fmt(total)} מ"א${tags ? ' · ' + tags : ''}`
    }
    case 'flashing': {
      if (!m.flashing.length) return ''
      const total = m.flashing.reduce((s, r) => s + num(r.qty) * num(r.measure), 0)
      return `${m.flashing.length} שורות · ${fmt(total)} מ"א`
    }
    case 'aluminum': {
      if (!m.aluminum.length) return ''
      const total = m.aluminum.reduce((s, r) => s + num(r.qty) * num(r.measure), 0)
      const shades = Array.from(new Set(m.aluminum.map(r => r.shade).filter(Boolean)))
      return `${shades.length ? shades.join(', ') + ' · ' : ''}${fmt(total)} מ׳`
    }
    case 'iron': {
      if (!m.iron.length) return ''
      const total = m.iron.reduce((s, r) => s + num(r.qty) * num(r.measure), 0)
      return `${m.iron.length} שורות · ${fmt(total)} מ"א`
    }
    case 'insulation': {
      if (!m.insulation.length) return ''
      const total = m.insulation.reduce((s, r) => s + num(r.qty) * num(r.measure), 0)
      return `${m.insulation.length} שורות · ${fmt(total)} מ"ר`
    }
    case 'misc':
      return m.misc.length ? `${m.misc.length} פריטים` : ''
    default:
      return ''
  }
}

function hasAnyContent(m: Materials): boolean {
  return m.roofing.length > 0 || m.wood.length > 0 || m.flashing.length > 0 ||
    m.aluminum.length > 0 || m.iron.length > 0 || m.insulation.length > 0 || m.misc.length > 0
}

// ──────────────────────────────────────────────────────────────
// הקומפוננטה הראשית
// ──────────────────────────────────────────────────────────────
export default function NewExecutionSheet() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { id: editId } = useParams<{ id: string }>()

  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const [projectName, setProjectName] = useState('')
  const [sheetDate, setSheetDate] = useState(todayISO())
  const [materials, setMaterials] = useState<Materials>(emptyMaterials())
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

  // מזהה הדף — נשמר גם ב-ref כדי שהשמירה האוטומטית תראה ערך עדכני
  const [sheetId, setSheetId] = useState<string | null>(null)
  const sheetIdRef = useRef<string | null>(null)

  // תמונת מצב עדכנית לשימוש בתוך ה-interval של השמירה האוטומטית
  const latest = useRef({ projectName, sheetDate, materials })
  latest.current = { projectName, sheetDate, materials }
  const savingRef = useRef(false)
  const lastErrRef = useRef<string | null>(null)

  function patchMat(p: Partial<Materials>) { setMaterials(prev => ({ ...prev, ...p })) }
  function toggleOpen(key: string) {
    setOpenKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function deleteCategory(key: string) {
    setMaterials(prev => ({ ...prev, hidden: Array.from(new Set([...prev.hidden, key])) }))
    setOpenKeys(prev => { const n = new Set(prev); n.delete(key); return n })
  }
  function restoreCategory(key: string) {
    setMaterials(prev => ({ ...prev, hidden: prev.hidden.filter(k => k !== key) }))
  }

  // ── טעינת דף קיים לעריכה ──────────────────────────────────
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    ;(async () => {
      const { data: sheet } = await supabase.from('execution_sheets').select('*').eq('id', editId).single()
      if (cancelled) return
      if (sheet) {
        setSheetId(sheet.id); sheetIdRef.current = sheet.id
        setProjectName(sheet.project_name ?? '')
        setSheetDate(sheet.sheet_date ?? todayISO())
      }
      const { data: bs } = await supabase.from('buildings')
        .select('*').eq('sheet_id', editId).order('building_number').limit(1)
      if (cancelled) return
      const b = bs?.[0]
      if (b?.materials) {
        const mm = b.materials as Partial<Materials>
        setMaterials({ ...emptyMaterials(), ...mm })
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [editId])

  // ── שמירה ל-Supabase ──────────────────────────────────────
  async function persist(status: 'field' | 'submitted'): Promise<string | null> {
    lastErrRef.current = null
    const cur = latest.current

    // מדיניות ה-RLS על execution_sheets דורשת auth.uid() = created_by.
    // שולפים את מזהה המשתמש ישירות מהסשן (ולא מ-profile שעלול להיות null
    // בשמירה אוטומטית / לפני שהפרופיל נטען) כדי להבטיח התאמה.
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id ?? null
    if (!uid) {
      console.error('[sheet] persist: אין סשן פעיל — auth.uid() ריק, השמירה תיכשל על RLS')
      lastErrRef.current = 'החיבור פג. התחבר מחדש ונסה שוב.'
      return null
    }

    const payload = {
      project_name: cur.projectName.trim() || 'בניית גג — ללא שם',
      sheet_date: cur.sheetDate || todayISO(),
      num_buildings: 1,
      filled_by: uid,
      filled_by_name: profile?.full_name ?? '',
      created_by: uid,
      status,
      updated_at: new Date().toISOString(),
    }

    let sid = sheetIdRef.current
    if (sid) {
      const { error } = await supabase.from('execution_sheets').update(payload).eq('id', sid)
      if (error) {
        console.error('[sheet] עדכון execution_sheets נכשל:', JSON.stringify(error), error)
        lastErrRef.current = `שמירה נכשלה: ${error.message}`
        return null
      }
    } else {
      const { data, error } = await supabase.from('execution_sheets').insert(payload).select('id').single()
      if (error || !data) {
        console.error('[sheet] יצירת execution_sheets נכשלה:', JSON.stringify(error), error)
        lastErrRef.current = `שמירה נכשלה: ${error?.message ?? 'שגיאה לא ידועה'}`
        return null
      }
      sid = data.id
      sheetIdRef.current = sid
      setSheetId(sid)
    }

    // מבנה יחיד (בניית גג) — כל החומרים ב-jsonb
    const buildingPayload = {
      sheet_id: sid,
      building_number: 1,
      building_name: 'בניית גג',
      work_types: [WORK_TYPE],
      structure_type: ['עץ', 'מתכת'],
      needs_crane: false,
      work_content: {},
      materials: cur.materials,
    }
    const { data: existing, error: selErr } = await supabase.from('buildings')
      .select('id').eq('sheet_id', sid).eq('building_number', 1).limit(1)
    if (selErr) console.error('[sheet] שליפת building נכשלה:', JSON.stringify(selErr))
    const bRes = existing?.[0]?.id
      ? await supabase.from('buildings').update(buildingPayload).eq('id', existing[0].id)
      : await supabase.from('buildings').insert(buildingPayload)
    if (bRes.error) {
      console.error('[sheet] שמירת building נכשלה:', JSON.stringify(bRes.error), bRes.error)
      lastErrRef.current = `שמירת החומרים נכשלה: ${bRes.error.message}`
      return null
    }
    // ניקוי מבנים עודפים במקרה של דף ישן מרובה-מבנים
    await supabase.from('buildings').delete().eq('sheet_id', sid).gt('building_number', 1)
    return sid
  }

  async function saveDraft() {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try {
      const sid = await persist('field')
      if (sid) { setFlash('נשמר ✓'); setTimeout(() => setFlash(null), 1800) }
      else alert(lastErrRef.current ?? 'השמירה נכשלה — בדוק את החיבור ונסה שוב')
    } finally { savingRef.current = false; setSaving(false) }
  }

  async function submit() {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try {
      const sid = await persist('submitted')
      if (sid) { alert('✓ הדף נשמר ואושר בהצלחה'); navigate('/sheets') }
      else alert(lastErrRef.current ?? 'השמירה נכשלה — בדוק את החיבור ונסה שוב')
    } finally { savingRef.current = false; setSaving(false) }
  }

  // ── שמירה אוטומטית כל 30 שניות ──────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const cur = latest.current
      const meaningful = cur.projectName.trim().length > 0 || hasAnyContent(cur.materials)
      if (meaningful && !savingRef.current) {
        persist('field').then(sid => {
          if (sid) { setFlash('נשמר אוטומטית ✓'); setTimeout(() => setFlash(null), 1500) }
        })
      }
    }, 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: BG }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: RED, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    )
  }

  const visibleCats = CATEGORIES.filter(c => !materials.hidden.includes(c.key))
  const hiddenCats = CATEGORIES.filter(c => materials.hidden.includes(c.key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, fontFamily: 'Heebo, sans-serif' }}>
      {/* Header */}
      <div style={{ background: RED, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <button onClick={() => navigate('/sheets')} title="סגור"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <line x1="6" y1="6" x2="18" y2="18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="18" y1="6" x2="6" y2="18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{editId ? 'עריכת דף ביצוע' : 'דף ביצוע חדש'}</span>
        <span style={{ width: 32 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="no-scrollbar">
        {/* פרטי בסיס */}
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 4 }}>
            שם פרויקט <span style={{ color: RED }}>*</span>
          </label>
          <input style={{ ...inputStyle, marginBottom: 12 }} value={projectName}
            onChange={e => setProjectName(e.target.value)} placeholder="לדוגמה: מחסן לוגיסטי חדרה" />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 4 }}>תאריך</label>
          <input type="date" style={{ ...inputStyle, marginBottom: 12 }} value={sheetDate}
            onChange={e => setSheetDate(e.target.value)} />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: '#FDECEC', border: `1px solid ${RED}`, borderRadius: 8, padding: '8px 12px',
          }}>
            <span style={{ fontSize: 11, color: GREY }}>סוג עבודה</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: RED }}>{WORK_TYPE}</span>
          </div>
        </div>

        {/* קטגוריות חומרים */}
        {visibleCats.map(cat => (
          <CategoryCard
            key={cat.key}
            title={cat.label}
            summary={categorySummary(cat.key, materials)}
            open={openKeys.has(cat.key)}
            onToggle={() => toggleOpen(cat.key)}
            onDelete={() => deleteCategory(cat.key)}
          >
            {cat.key === 'roofing' && (
              <RoofingCategory blocks={materials.roofing} onChange={v => patchMat({ roofing: v })} />
            )}
            {cat.key === 'wood' && (
              <WoodCategory m={materials} patch={patchMat} />
            )}
            {cat.key === 'flashing' && (
              <TypedRowsCategory rows={materials.flashing} onChange={v => patchMat({ flashing: v })}
                typeOptions={FLASHING_TYPES} typePlaceholder="סוג פחחות" measurePlaceholder='מ"א'
                totalLabel='סה"כ פחחות' unit='מ"א' />
            )}
            {cat.key === 'aluminum' && (
              <AluminumCategory rows={materials.aluminum} onChange={v => patchMat({ aluminum: v })} />
            )}
            {cat.key === 'iron' && (
              <TypedRowsCategory rows={materials.iron} onChange={v => patchMat({ iron: v })}
                typeOptions={IRON_PROFILES} typePlaceholder="פרופיל" measurePlaceholder="אורך"
                totalLabel='סה"כ ברזל' unit='מ"א' />
            )}
            {cat.key === 'insulation' && (
              <TypedRowsCategory rows={materials.insulation} onChange={v => patchMat({ insulation: v })}
                typeOptions={INSULATION_TYPES} typePlaceholder="סוג בידוד" measurePlaceholder='מ"ר'
                totalLabel='סה"כ בידוד' unit='מ"ר' />
            )}
            {cat.key === 'misc' && (
              <MiscCategory rows={materials.misc} onChange={v => patchMat({ misc: v })} />
            )}
          </CategoryCard>
        ))}

        {/* הוספת קטגוריה שנמחקה */}
        {hiddenCats.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
            <div style={{ minWidth: 200 }}>
              <Dropdown value="" placeholder="＋ הוסף קטגוריה" options={hiddenCats.map(c => c.label)}
                onChange={label => {
                  const cat = hiddenCats.find(c => c.label === label)
                  if (cat) restoreCategory(cat.key)
                }} />
            </div>
          </div>
        )}

        <div style={{ height: 12 }} />
      </div>

      {/* Flash */}
      {flash && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: '#111', color: '#fff', padding: '8px 18px', borderRadius: 20,
          fontSize: 13, fontWeight: 600, zIndex: 300, direction: 'rtl',
        }}>{flash}</div>
      )}

      {/* Footer */}
      <div style={{
        flexShrink: 0, background: '#fff', borderTop: `1px solid ${BORDER}`,
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={saveDraft} disabled={saving} style={{
          flex: 1, background: '#fff', color: RED, border: `1.5px solid ${RED}`,
          borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 700,
          cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>שמור טיוטה</button>
        <button onClick={submit} disabled={saving} style={{
          flex: 1, background: RED, color: '#fff', border: 'none',
          borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700,
          cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>{saving ? 'שומר…' : '✓ אישור ושמירה'}</button>
      </div>
    </div>
  )
}
