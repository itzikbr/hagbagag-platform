import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ══════════════════════════════════════════════════════════════
// חג בגג — דף ביצוע v3 · טופס 3 לשוניות
// ══════════════════════════════════════════════════════════════
const RED = '#CC0000'
const GREY = '#8696A0'
const BG = '#F2EDE9'
const BORDER = '#E5E0DB'
const AUTOSAVE_MS = 2000

// ── רשימות בחירה ───────────────────────────────────────────────
const FILLERS = ['עמאד', 'סמיר', 'עלי', 'אסף', 'דליה', 'מוטי', 'איציק']
const ROOF_TYPES = ['חד שיפועי', 'דו שיפועי', 'רב שיפועי', 'אחר']
const CONSTRUCTIONS = ['עץ', 'מתכת', 'אחר']
const GENERAL_CHIPS = ['דוד שמש', 'קולטים', 'פאנלים סולריים', 'מזגנים', 'ארובה', 'פטרית איזור', 'חלון תאורה', 'אנטנות', 'אחר']
const CRANE_OPTS = ['לא נדרש', 'קצר', 'ארוך', 'אחר']
const CONTAINER_OPTS = ['לא נדרש', '10m³', '20m³', '30m³']
const LIFT_OPTS = ['לא נדרש', 'דיזל', 'חשמלית']
const ARM_OPTS = ['לא נדרש', 'מספריים', 'זרוע']
const ACCESS_OPTS = ['קלה', 'מוגבלת', 'קשה', 'ללא גישה']
const LOGISTICS_CHIPS = ['פנויה', 'עצים', 'חשמל', 'דרך צרה', 'אחר']
const CEILING_OPTS = ['יש', 'בטון', 'רביץ', 'צפה', 'אחר', 'אין']
const PANEL_OPTS = ['איסכורית', 'פנל מבודד', 'אחר']
const ALUM_SHADES = ['חום', 'פולי סנדר', 'מהגוני', 'לבן', 'קרם', 'אפור', 'ירוק', 'אחר']
const GUTTER_TYPES = ['חיצוני', 'פנימי', 'חיצוני ופנימי', 'אחר']

// ── לשונית התקדמות ─────────────────────────────────────────────
const PERMIT_SUPERVISORS = ['עמאד', 'סמיר', 'עלי', 'אסף', 'איציק']
const ROOFING_SUPPLIERS = ['הגן הנדסה', 'אופק', 'פוליפח', 'א.ד פלדות', 'מבנה דרום', 'אחר']
const ALL_SUPPLIERS = ['הגן הנדסה', 'אופק', 'פוליפח', 'א.ד פלדות', 'מבנה דרום', 'אחים שחם', 'כראדי', 'פסקל', 'מטלום', 'עץ ועצה', 'אלי לבן', 'נוימן', 'אחר']
const TEAM_LEADS = ['עמאד', 'סמיר', 'עלי']
const SUBCONTRACTORS = ['זכי', 'מאלק', 'חאזם', 'וויסאם', 'מחמוד', 'האני', 'גל', 'אחר']

interface WorkTypeMeta { key: string; label: string }
const WORK_TYPES: WorkTypeMeta[] = [
  { key: 'asbestos',    label: '🟠 הסרת אסבסט' },
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
interface AsbestosBlock {
  coordX: string; coordY: string; usedFor: string
  ceiling: string; ceilingConstruction: string
  grandpaStick: string; empty: string; sensitive: string
}
interface RoofReplaceBlock {
  existingRoof: string; newRoof: string
  construction: string; slope: string; overhang: string
  panelType: string; thickness1: string; thickness2: string
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
interface MaterialRow { type: string; shade: string; qty: string; measure: string }
interface MaterialCategory { rows: MaterialRow[]; thickness: string; color: string }
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
  documentation: Documentation
  progress: ProgressData
  notes: Record<string, string>
}

// ── ברירות מחדל ────────────────────────────────────────────────
function todayISO(): string { return new Date().toISOString().slice(0, 10) }
function emptyBlocks(): WorkBlocks {
  return {
    asbestos:    { coordX: '', coordY: '', usedFor: '', ceiling: '', ceilingConstruction: '', grandpaStick: '', empty: '', sensitive: '' },
    roofReplace: { existingRoof: '', newRoof: '', construction: '', slope: '', overhang: '', panelType: '', thickness1: '', thickness2: '' },
    aluminum:    { shade: '', meters: '', coating: [] },
    gutters:     { type: '', guttersM: '', guttersSegments: '', downUnits: '', downSegments: '' },
    insulation:  { type: '', area: '', thickness: '' },
    other:       { note: '' },
  }
}
function emptyCategory(): MaterialCategory { return { rows: [{ type: '', shade: '', qty: '', measure: '' }], thickness: '', color: '' } }
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
    details: { date: todayISO(), fillerName: '', customerName: '', address: '', phones: [''], solarPrep: false },
    general: { roofHeight: '', area: '', roofType: '', construction: '', chips: [] },
    logistics: { crane: '', container: '', lift: '', arm: '', access: '', workHeight: '', chips: [] },
    workTypes: [],
    blocks: emptyBlocks(),
    materials: { active: ['flashing'], data: { flashing: emptyCategory() } },
    documentation: { photos: [], sketch: [], documents: [] },
    progress: emptyProgress(),
    notes: {},
  }
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
function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return <input dir="rtl" type={type} style={inputStyle} value={value} placeholder={placeholder}
    inputMode={type === 'number' ? 'decimal' : undefined}
    onChange={e => onChange(e.target.value)} />
}
function SelectBox({ value, onChange, options, placeholder = 'בחר' }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
  return (
    <select dir="rtl" value={value} onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, color: value ? '#111' : '#555', appearance: 'none', cursor: 'pointer' }}>
      <option value="" disabled hidden>{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
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
  const open = noteEnabled && notesOpen!.has(id!)
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
          <button type="button" onClick={() => { if (open) setNotes!(id!, ''); toggleNote!(id!) }}
            title="הערה" style={{
              width: 20, height: 20, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: RED, color: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
            }}>{open ? '−' : '＋'}</button>
        )}
      </div>
      <div style={{ padding: 12 }}>
        {open && (
          <textarea dir="rtl" autoFocus placeholder="הערה…" value={notes![id!] ?? ''}
            onChange={e => setNotes!(id!, e.target.value)}
            style={{ ...inputStyle, height: 'auto', minHeight: 40, padding: 8, resize: 'vertical', marginBottom: 10, lineHeight: 1.4 }} />
        )}
        {children}
      </div>
    </div>
  )
}

// ── בלוק דינמי לפי סוג עבודה ───────────────────────────────────
function WorkBlock({ typeKey, blocks, patch }: {
  typeKey: string; blocks: WorkBlocks; patch: (p: Partial<WorkBlocks>) => void
}) {
  if (typeKey === 'asbestos') {
    const b = blocks.asbestos
    const set = (p: Partial<AsbestosBlock>) => patch({ asbestos: { ...b, ...p } })
    return (
      <>
        <div style={grid2}>
          <Field label="נ.צ. X"><TextInput value={b.coordX} onChange={v => set({ coordX: v })} placeholder="X" /></Field>
          <Field label="נ.צ. Y"><TextInput value={b.coordY} onChange={v => set({ coordY: v })} placeholder="Y" /></Field>
        </div>
        <div style={{ marginBottom: 8 }}>
          <Field label="למה משמש"><TextInput value={b.usedFor} onChange={v => set({ usedFor: v })} placeholder="שימוש המבנה" /></Field>
        </div>
        <div style={grid2}>
          <Field label="תקרה"><SelectBox value={b.ceiling} onChange={v => set({ ceiling: v })} options={CEILING_OPTS} /></Field>
          <Field label="קונסטרוקציה"><TextInput value={b.ceilingConstruction} onChange={v => set({ ceilingConstruction: v })} placeholder="קונסטרוקציה" /></Field>
        </div>
        <div style={grid2}>
          <Field label="מקל סבא"><TextInput value={b.grandpaStick} onChange={v => set({ grandpaStick: v })} placeholder="מקל סבא" /></Field>
          <Field label="ריק"><TextInput value={b.empty} onChange={v => set({ empty: v })} placeholder="ריק" /></Field>
        </div>
        <Field label="מבנים רגישים"><TextArea value={b.sensitive} onChange={v => set({ sensitive: v })} placeholder="מבנים רגישים בסביבה" /></Field>
      </>
    )
  }
  if (typeKey === 'roofReplace') {
    const b = blocks.roofReplace
    const set = (p: Partial<RoofReplaceBlock>) => patch({ roofReplace: { ...b, ...p } })
    return (
      <>
        <div style={grid2}>
          <Field label="גג קיים"><TextInput value={b.existingRoof} onChange={v => set({ existingRoof: v })} placeholder="גג קיים" /></Field>
          <Field label="גג חדש"><TextInput value={b.newRoof} onChange={v => set({ newRoof: v })} placeholder="גג חדש" /></Field>
        </div>
        <div style={grid2}>
          <Field label="קונסטרוקציה"><TextInput value={b.construction} onChange={v => set({ construction: v })} placeholder="קונסטרוקציה" /></Field>
          <Field label="שיפוע"><TextInput value={b.slope} onChange={v => set({ slope: v })} placeholder="שיפוע" /></Field>
        </div>
        <div style={{ marginBottom: 8 }}>
          <Field label="בליטה מהפטות"><TextInput value={b.overhang} onChange={v => set({ overhang: v })} placeholder="בליטה מהפטות" /></Field>
        </div>
        <div style={grid2}>
          <Field label="סוג פח"><SelectBox value={b.panelType} onChange={v => set({ panelType: v })} options={PANEL_OPTS} /></Field>
          {b.panelType === 'איסכורית' && <Field label="עובי פח"><TextInput value={b.thickness1} onChange={v => set({ thickness1: v })} placeholder="עובי" /></Field>}
          {b.panelType === 'פנל מבודד' && <Field label="עובי חיצוני"><TextInput value={b.thickness1} onChange={v => set({ thickness1: v })} placeholder="עובי חיצוני" /></Field>}
        </div>
        {b.panelType === 'פנל מבודד' && (
          <div style={{ marginBottom: 8 }}>
            <Field label="עובי כולל"><TextInput value={b.thickness2} onChange={v => set({ thickness2: v })} placeholder="עובי כולל" /></Field>
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
          <Field label="גוון"><SelectBox value={b.shade} onChange={v => set({ shade: v })} options={ALUM_SHADES} /></Field>
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
          <Field label="סוג"><SelectBox value={b.type} onChange={v => set({ type: v })} options={GUTTER_TYPES} /></Field>
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
          <Field label="סוג"><TextInput value={b.type} onChange={v => set({ type: v })} placeholder="סוג בידוד" /></Field>
        </div>
        <div style={grid2}>
          <Field label="שטח (מ״ר)"><TextInput type="number" value={b.area} onChange={v => set({ area: v })} placeholder="מ״ר" /></Field>
          <Field label="עובי"><TextInput value={b.thickness} onChange={v => set({ thickness: v })} placeholder="עובי" /></Field>
        </div>
      </>
    )
  }
  // other
  const b = blocks.other
  return <Field label="פירוט"><TextArea value={b.note} onChange={v => patch({ other: { note: v } })} placeholder="פירוט העבודה" /></Field>
}

// ── כרטיסיית קטגוריית חומרים ───────────────────────────────────
function MaterialCategoryCard({ catKey, cat, onChange, onRemove }: {
  catKey: string; cat: MaterialCategory; onChange: (c: MaterialCategory) => void; onRemove: () => void
}) {
  const meta = CATEGORY_META[catKey]
  const total = cat.rows.reduce((s, r) => s + num(r.qty) * num(r.measure), 0)
  function setRow(i: number, p: Partial<MaterialRow>) {
    onChange({ ...cat, rows: cat.rows.map((r, j) => j === i ? { ...r, ...p } : r) })
  }
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
        {meta.roofSub && (
          <div style={grid2}>
            <Field label="עובי"><TextInput value={cat.thickness} onChange={v => onChange({ ...cat, thickness: v })} placeholder="עובי" /></Field>
            <Field label="צבע"><TextInput value={cat.color} onChange={v => onChange({ ...cat, color: v })} placeholder="צבע" /></Field>
          </div>
        )}
        {cat.rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, direction: 'rtl' }}>
            <input dir="rtl" style={{ ...inputStyle, flex: meta.hasShade ? 1.3 : 2 }} placeholder="סוג"
              value={r.type} onChange={e => setRow(i, { type: e.target.value })} />
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
        ))}
        <button type="button" onClick={() => onChange({ ...cat, rows: [...cat.rows, { type: '', shade: '', qty: '', measure: '' }] })}
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
                ? <img src={it.url} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
    </div>
  )
}

// ── לשונית התקדמות ─────────────────────────────────────────────
function PSelect({ value, onChange, options, emptyLabel = '— בחר —', accent }: {
  value: string; onChange: (v: string) => void; options: string[]; emptyLabel?: string; accent?: string
}) {
  return (
    <select dir="rtl" value={value} onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, color: value ? '#111' : '#555', appearance: 'none', cursor: 'pointer', ...(accent ? { borderColor: accent } : {}) }}>
      <option value="">{emptyLabel}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
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

function ProgressTab({ progress, workTypes, onChange }: {
  progress: ProgressData; workTypes: string[]; onChange: (p: Partial<ProgressData>) => void
}) {
  const p = progress
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          {p.suppliers.map((s, i) => (
            <PSelect key={i} value={s} options={i % 3 === 0 ? ROOFING_SUPPLIERS : ALL_SUPPLIERS}
              emptyLabel={i % 3 === 0 ? '— קירוי —' : '— ספק —'} onChange={v => setSupplier(i, v)} />
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
          <Field label="קבלן משנה"><PSelect value={p.subcontractor} options={SUBCONTRACTORS} emptyLabel="— ללא —" accent="#1A5A2A" onChange={v => onChange({ subcontractor: v })} /></Field>
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
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// הקומפוננטה הראשית
// ══════════════════════════════════════════════════════════════
type TabKey = 'details' | 'docs' | 'materials' | 'progress'

export default function NewExecutionSheet() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { id: editId } = useParams<{ id: string }>()

  const [tab, setTab] = useState<TabKey>('details')
  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<SheetForm>(emptyForm())

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
  const setNote = (k: string, v: string) => setForm(f => ({ ...f, notes: { ...f.notes, [k]: v } }))
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
    ;(async () => {
      const { data: sheet } = await supabase.from('execution_sheets').select('*').eq('id', editId).single()
      if (cancelled) return
      if (sheet) { sheetIdRef.current = sheet.id }
      const { data: bs } = await supabase.from('buildings').select('*').eq('sheet_id', editId).order('building_number').limit(1)
      if (cancelled) return
      const b = bs?.[0]
      const wc = (b?.work_content ?? {}) as Partial<SheetForm>
      const base = emptyForm()
      const merged: SheetForm = {
        details: { ...base.details, ...(wc.details ?? {}), date: sheet?.sheet_date ?? wc.details?.date ?? todayISO(), fillerName: wc.details?.fillerName ?? sheet?.filled_by_name ?? '', customerName: wc.details?.customerName ?? sheet?.project_name ?? '' },
        general: { ...base.general, ...(wc.general ?? {}) },
        logistics: { ...base.logistics, ...(wc.logistics ?? {}) },
        workTypes: wc.workTypes ?? (b?.work_types ?? []),
        blocks: { ...emptyBlocks(), ...(wc.blocks ?? {}) },
        materials: (b?.materials && (b.materials as MaterialsState).active) ? (b.materials as MaterialsState) : base.materials,
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
      }
      // חתימות URL מחדש לתמונות (bucket פרטי)
      for (const sec of ['photos', 'sketch', 'documents'] as const) {
        const arr = merged.documentation[sec]
        for (const it of arr) {
          if (it.path) {
            const { data: signed } = await supabase.storage.from('sheet-images').createSignedUrl(it.path, 60 * 60 * 24 * 365)
            it.url = signed?.signedUrl ?? it.url
          }
          it.noteOpen = false
        }
      }
      if (!cancelled) { setForm(merged); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [editId])

  // ── שמירה ל-Supabase ──────────────────────────────────────────
  async function persist(status: 'field' | 'submitted'): Promise<string | null> {
    lastErrRef.current = null
    const f = latest.current
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id ?? null
    if (!uid) { lastErrRef.current = 'החיבור פג. התחבר מחדש ונסה שוב.'; return null }

    const projectName = f.details.customerName.trim() || f.details.address.trim() || 'דף ביצוע — ללא שם'
    const payload = {
      project_name: projectName,
      sheet_date: f.details.date || todayISO(),
      num_buildings: 1,
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
      const sid = await persist('field')
      if (sid) { setFlash('נשמר ✓'); setTimeout(() => setFlash(null), 1600) }
      else alert(lastErrRef.current ?? 'השמירה נכשלה')
    } finally { savingRef.current = false; setSaving(false) }
  }
  async function submit() {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try {
      const sid = await persist('submitted')
      if (sid) { alert('✓ הדף נשמר ואושר בהצלחה'); navigate('/sheets') }
      else alert(lastErrRef.current ?? 'השמירה נכשלה')
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
      persist('field').then(sid => { if (sid) { setFlash('נשמר אוטומטית ✓'); setTimeout(() => setFlash(null), 1300) } })
    }, AUTOSAVE_MS)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, loading])

  // ── העלאת קבצים ל-storage: sheet-images ───────────────────────
  async function uploadDocs(section: keyof Documentation, files: FileList) {
    setUploading(true)
    try {
      const sid = await ensureSheetId()
      if (!sid) { alert(lastErrRef.current ?? 'צריך לשמור את הדף לפני העלאה'); return }
      const added: DocItem[] = []
      for (const file of Array.from(files)) {
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
      <div style={{ display: 'flex', background: BG, flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}>
        {([['details', 'פרטים'], ['docs', 'תיעוד'], ['materials', 'חומרים'], ['progress', '🚦 התקדמות']] as [TabKey, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, height: 26, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: tab === key ? 800 : 500, color: tab === key ? RED : '#888',
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
              <div style={{ marginBottom: 8 }}><Field label="ממלא הדף"><SelectBox value={form.details.fillerName} onChange={v => patchDetails({ fillerName: v })} options={FILLERS} /></Field></div>
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
                <Field label="גובה גג"><TextInput type="number" value={form.general.roofHeight} onChange={v => patchGeneral({ roofHeight: v })} placeholder="מ׳" /></Field>
                <Field label="שטח (מ״ר)"><TextInput type="number" value={form.general.area} onChange={v => patchGeneral({ area: v })} placeholder="מ״ר" /></Field>
              </div>
              <div style={grid2}>
                <Field label="סוג גג"><SelectBox value={form.general.roofType} onChange={v => patchGeneral({ roofType: v })} options={ROOF_TYPES} /></Field>
                <Field label="קונסטרוקציה"><SelectBox value={form.general.construction} onChange={v => patchGeneral({ construction: v })} options={CONSTRUCTIONS} /></Field>
              </div>
              <ChipGroup options={GENERAL_CHIPS} value={form.general.chips} onChange={v => patchGeneral({ chips: v })} />
            </Card>

            <Card id="logistics" title="לוגיסטיקה" {...noteProps}>
              <div style={grid2}>
                <Field label="מנוף"><SelectBox value={form.logistics.crane} onChange={v => patchLogistics({ crane: v })} options={CRANE_OPTS} /></Field>
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
              <Card key={key} title={WORK_TYPE_LABEL[key]} tone="orange">
                <WorkBlock typeKey={key} blocks={form.blocks} patch={patchBlocks} />
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

        {/* ══ לשונית חומרים ══ */}
        {tab === 'materials' && (
          <>
            {form.materials.active.map(key => (
              <MaterialCategoryCard key={key} catKey={key} cat={form.materials.data[key] ?? emptyCategory()}
                onChange={c => setCategory(key, c)} onRemove={() => removeCategory(key)} />
            ))}
            {inactiveCats.length > 0 && (
              <div style={{ margin: '6px 8px' }}>
                <select dir="rtl" value="" onChange={e => { if (e.target.value) addCategory(e.target.value) }} style={{
                  ...inputStyle, color: '#555', appearance: 'none', cursor: 'pointer',
                  border: `1.5px dashed ${RED}`, height: 42, fontWeight: 700,
                }}>
                  <option value="" disabled hidden>＋ הוסף קטגוריה</option>
                  {inactiveCats.map(k => <option key={k} value={k}>{CATEGORY_META[k].label}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        {/* ══ לשונית התקדמות ══ */}
        {tab === 'progress' && (
          <ProgressTab progress={form.progress} workTypes={form.workTypes} onChange={patchProgress} />
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
      <div style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
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
