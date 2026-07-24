import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { queryWithRetry } from '../lib/dbRetry'
import { reportClient, errDetail } from '../lib/report'

// ============================================================
// לשונית חומרים חכמה — מבוססת materials_catalog + materials_defaults.
// לפי סוגי העבודה (workTypes) + סוג קירוי (roofType) פותחת ברירות מחדל
// אוטומטית, מציגה קטגוריות מתקפלות, ומאפשרת שכפול/מחיקה/הוספה.
// ============================================================

const RED = '#CC0000'
const BORDER = '#e3ded7'

// סוג קירוי (רק ל"החלפת גג") — הערך הפנימי תואם ל-materials_defaults.roof_type
const ROOF_TYPE_OPTS: { value: string; label: string }[] = [
  { value: 'panel', label: 'פנל מבודד' },
  { value: 'iskoreet', label: 'איסכורית' },
  { value: 'roof-tiles', label: 'רעפים' },
]

export interface SmartRow {
  key: string
  itemCode: string
  categoryCode: string
  categoryName: string
  name: string
  qty: string
  meter: string
}
export interface SmartMaterials {
  roofType: string   // '' | 'panel' | 'iskoreet' | 'roof-tiles'
  rows: SmartRow[]
}
export function emptySmartMaterials(): SmartMaterials {
  return { roofType: '', rows: [] }
}
// נרמול בעת טעינה מ-DB (נתונים ישנים / חלקיים)
export function normalizeSmartMaterials(raw: unknown): SmartMaterials {
  const r = raw as Partial<SmartMaterials> | undefined
  if (!r || !Array.isArray(r.rows)) return emptySmartMaterials()
  return {
    roofType: typeof r.roofType === 'string' ? r.roofType : '',
    rows: r.rows.map(x => ({
      key: String(x?.key || newKey()),
      itemCode: String(x?.itemCode || ''),
      categoryCode: String(x?.categoryCode || ''),
      categoryName: String(x?.categoryName || ''),
      name: String(x?.name || ''),
      qty: String(x?.qty ?? ''),
      meter: String(x?.meter ?? ''),
    })),
  }
}

interface CatalogItem {
  category_code: string
  category_name: string
  item_code: string
  name: string
  catalog_number: string | null
  is_default: boolean
  sort_order: number
  category_sort: number
}
interface DefaultRow {
  work_type: string
  roof_type: string | null
  material_item_code: string
  sort_order: number
}

function newKey(): string {
  try { return crypto.randomUUID() } catch { return Math.random().toString(36).slice(2) + Date.now() }
}

interface Props {
  workTypes: string[]
  value: SmartMaterials
  onChange: (v: SmartMaterials) => void
}

export default function MaterialsTab({ workTypes, value, onChange }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [defaults, setDefaults] = useState<DefaultRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadErr, setLoadErr] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [moreOpen, setMoreOpen] = useState<Record<string, boolean>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [search, setSearch] = useState('')

  const appliedRef = useRef<Set<string>>(new Set())
  const initedRef = useRef(false)

  const roofActive = workTypes.includes('roofReplace')

  // טעינת קטלוג + ברירות מחדל — מבודד ב-try/catch עם לוג מפורט.
  // כשל כאן משפיע רק על לשונית החומרים; הוא לעולם לא זולג החוצה (וגם ככה
  // המסך הזה נטען רק בתוך עורך הדף, לא ברשימת דפי הביצוע).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const catData = await queryWithRetry<CatalogItem[]>(() =>
          supabase.from('materials_catalog')
            .select('category_code,category_name,item_code,name,catalog_number,is_default,sort_order,category_sort')
            .eq('is_active', true).order('category_code').order('sort_order')
        )
        const defData = await queryWithRetry<DefaultRow[]>(() =>
          supabase.from('materials_defaults')
            .select('work_type,roof_type,material_item_code,sort_order').order('sort_order')
        )

        if (cancelled) return
        setCatalog((catData ?? []) as CatalogItem[])
        setDefaults((defData ?? []) as DefaultRow[])
        setLoaded(true)
      } catch (e) {
        if (cancelled) return
        console.error('[materials] load failed:', e)
        reportClient({ where: 'materials-load-failed', online: navigator.onLine, ...errDetail(e) })
        setLoadErr(true); setLoaded(true)   // מציג "טעינת הקטלוג נכשלה" — לא מפיל כלום
      }
    })()
    return () => { cancelled = true }
  }, [])

  // פתיחת ברירות מחדל אוטומטית לפי workTypes + roofType
  useEffect(() => {
    if (!loaded || !catalog.length) return
    const rt = value.roofType

    // הזרקת ברירות מחדל לצירופים שטרם טופלו (הוספה בלבד — לא מוחקת בחירות המשתמש)
    const inject = (mark: boolean) => {
      const byCode = new Map(catalog.map(c => [c.item_code, c]))
      const present = new Set(value.rows.map(r => r.itemCode))
      const additions: SmartRow[] = []
      for (const wt of workTypes) {
        const comboKey = `${wt}|${rt || ''}`
        if (appliedRef.current.has(comboKey)) continue
        appliedRef.current.add(comboKey)
        if (!mark) {
          const rowsForCombo = defaults
            .filter(d => d.work_type === wt && (d.roof_type == null || d.roof_type === rt))
            .sort((a, b) => a.sort_order - b.sort_order)
          for (const d of rowsForCombo) {
            const c = byCode.get(d.material_item_code)
            if (!c || present.has(c.item_code)) continue
            present.add(c.item_code)
            additions.push({ key: newKey(), itemCode: c.item_code, categoryCode: c.category_code, categoryName: c.category_name, name: c.name, qty: '', meter: '' })
          }
        }
      }
      if (additions.length) onChange({ ...value, rows: [...value.rows, ...additions] })
    }

    if (!initedRef.current) {
      initedRef.current = true
      // דף קיים עם בחירות שמורות — לא מזריקים מחדש; דף חדש ריק — מזריקים ברירות מחדל
      inject(value.rows.length > 0)
    } else {
      inject(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, catalog, workTypes.join(','), value.roofType])

  // ── עדכוני שורות ──────────────────────────────────────────────
  const setRows = (rows: SmartRow[]) => onChange({ ...value, rows })
  const updateRow = (key: string, p: Partial<SmartRow>) => setRows(value.rows.map(r => r.key === key ? { ...r, ...p } : r))
  const deleteRow = (key: string) => setRows(value.rows.filter(r => r.key !== key))
  const duplicateRow = (key: string) => {
    const i = value.rows.findIndex(r => r.key === key)
    if (i < 0) return
    const copy: SmartRow = { ...value.rows[i], key: newKey() }
    const next = [...value.rows]
    next.splice(i + 1, 0, copy)   // מתחת לשורה הנוכחית
    setRows(next)
  }
  const addItem = (c: CatalogItem) => {
    setRows([...value.rows, { key: newKey(), itemCode: c.item_code, categoryCode: c.category_code, categoryName: c.category_name, name: c.name, qty: '', meter: '' }])
  }

  const setRoofType = (rt: string) => onChange({ ...value, roofType: rt })

  // ── קיבוץ שורות לקטגוריות (בסדר הופעה) ────────────────────────
  const catOrder: string[] = []
  const catName: Record<string, string> = {}
  const grouped: Record<string, SmartRow[]> = {}
  for (const r of value.rows) {
    if (!grouped[r.categoryCode]) { grouped[r.categoryCode] = []; catOrder.push(r.categoryCode); catName[r.categoryCode] = r.categoryName }
    grouped[r.categoryCode].push(r)
  }
  // סדר הקטגוריות לפי category_sort מהקטלוג (סדר הגרירה במסך הניהול); לא-ידועים בסוף
  const catSortByCode: Record<string, number> = {}
  for (const c of catalog) if (!(c.category_code in catSortByCode)) catSortByCode[c.category_code] = c.category_sort
  catOrder.sort((a, b) => (catSortByCode[a] ?? 999) - (catSortByCode[b] ?? 999))

  // item_code → מספר קטלוגי (lookup חי מהקטלוג; לא נשמר ב-SmartRow)
  const catNumByCode: Record<string, string> = {}
  for (const c of catalog) if (c.catalog_number) catNumByCode[c.item_code] = c.catalog_number

  if (!loaded) return <div style={{ textAlign: 'center', color: '#888', padding: 30 }}>טוען חומרים…</div>
  if (loadErr) return <div style={{ textAlign: 'center', color: RED, padding: 30 }}>טעינת הקטלוג נכשלה — נסה לרענן</div>

  const modalItems = catalog.filter(c => {
    const q = search.trim()
    if (!q) return true
    return c.name.includes(q) || c.item_code.includes(q) || c.category_name.includes(q)
  })

  return (
    <div style={{ padding: '8px 8px 20px' }}>
      {/* בורר סוג קירוי — רק להחלפת גג */}
      {roofActive && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>סוג קירוי</span>
          <select dir="rtl" value={value.roofType} onChange={e => setRoofType(e.target.value)} style={{ ...input, flex: 1, cursor: 'pointer' }}>
            <option value="">בחר…</option>
            {ROOF_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {catOrder.length === 0 && (
        <div style={{ textAlign: 'center', color: '#888', padding: '24px 12px', fontSize: 14 }}>
          אין עדיין חומרים. בחר סוג עבודה בלשונית פרטים לפתיחת ברירות מחדל, או הוסף פריט מהרשימה למטה.
        </div>
      )}

      {catOrder.map(code => {
        const rows = grouped[code]
        const isCollapsed = !!collapsed[code]
        const others = catalog.filter(c => c.category_code === code)
          .sort((a, b) => (Number(b.is_default) - Number(a.is_default)) || (a.sort_order - b.sort_order))
        return (
          <div key={code} style={card}>
            {/* כותרת קטגוריה מתקפלת */}
            <button type="button" onClick={() => setCollapsed(s => ({ ...s, [code]: !s[code] }))} style={catHeader}>
              <span style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', fontSize: 12 }}>▼</span>
              <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: RED }}>{catName[code]}</span>
              <span style={{ fontSize: 12, color: '#888', background: '#f2eee8', borderRadius: 10, padding: '1px 8px' }}>{rows.length}</span>
            </button>

            {!isCollapsed && (
              <div style={{ padding: '4px 8px 8px' }}>
                {rows.map(r => (
                  <div key={r.key} style={rowWrap}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      {catNumByCode[r.itemCode] && <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>מק״ט {catNumByCode[r.itemCode]}</div>}
                    </div>
                    <input dir="rtl" inputMode="decimal" placeholder="כמות" value={r.qty} onChange={e => updateRow(r.key, { qty: e.target.value })} style={numInput} />
                    <input dir="rtl" inputMode="decimal" placeholder="מטר" value={r.meter} onChange={e => updateRow(r.key, { meter: e.target.value })} style={numInput} />
                    <button type="button" title="שכפל" onClick={() => duplicateRow(r.key)} style={dupBtn}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <rect x="8" y="8" width="12" height="12" rx="2" stroke="#2a5ca8" strokeWidth="2" />
                        <rect x="4" y="4" width="12" height="12" rx="2" fill="#c8daf5" stroke="#2a5ca8" strokeWidth="2" />
                      </svg>
                    </button>
                    <button type="button" title="מחק" onClick={() => deleteRow(r.key)} style={delBtn}>✕</button>
                  </div>
                ))}

                {/* עוד פריטים — שאר פריטי הקטגוריה */}
                <button type="button" onClick={() => setMoreOpen(s => ({ ...s, [code]: !s[code] }))} style={moreBtn}>
                  {moreOpen[code] ? 'הסתר פריטים' : '＋ עוד פריטים'}
                </button>
                {moreOpen[code] && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {others.map(c => (
                      <button key={c.item_code} type="button" onClick={() => addItem(c)} style={chip}>
                        ＋ {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* הוסף פריט מכל הרשימה */}
      <div style={{ margin: '10px 4px 0' }}>
        <button type="button" onClick={() => { setModalOpen(true); setSearch('') }} style={{
          width: '100%', background: 'transparent', border: `1.5px dashed ${RED}`, color: RED,
          borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', direction: 'rtl',
        }}>＋ הוסף פריט מכל הרשימה</button>
      </div>

      {/* Modal חיפוש */}
      {modalOpen && (
        <div style={modalBackdrop} onClick={() => setModalOpen(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ flex: 1, fontWeight: 800, color: RED, fontSize: 15 }}>הוסף פריט</span>
              <button type="button" onClick={() => setModalOpen(false)} style={delBtn}>✕</button>
            </div>
            <input dir="rtl" autoFocus placeholder="חיפוש לפי שם / קוד / קטגוריה" value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, marginBottom: 8 }} />
            <div style={{ overflowY: 'auto', flex: 1 }} className="no-scrollbar">
              {modalItems.map(c => (
                <button key={c.item_code} type="button" onClick={() => { addItem(c); setModalOpen(false) }} style={modalRow}>
                  <span style={{ flex: 1, textAlign: 'right', fontSize: 14, color: '#333' }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: '#999' }}>{c.category_name}{c.catalog_number ? ` · מק״ט ${c.catalog_number}` : ''}</span>
                </button>
              ))}
              {modalItems.length === 0 && <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>לא נמצאו פריטים</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── סגנונות ────────────────────────────────────────────────────
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, margin: '8px 4px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const catHeader: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 12px', fontFamily: 'inherit', direction: 'rtl' }
const rowWrap: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderTop: `1px solid #f2efe9` }
const input: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff', direction: 'rtl' }
const numInput: React.CSSProperties = { ...input, width: 56, textAlign: 'center', padding: '6px 4px', flexShrink: 0 }
const dupBtn: React.CSSProperties = { width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: '#c8daf5', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const delBtn: React.CSSProperties = { width: 30, height: 30, flexShrink: 0, borderRadius: 8, background: '#f7e4e4', color: RED, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }
const moreBtn: React.CSSProperties = { marginTop: 8, background: 'none', border: 'none', color: '#2a5ca8', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', direction: 'rtl' }
const chip: React.CSSProperties = { background: '#f2eee8', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '5px 10px', fontSize: 12.5, color: '#444', cursor: 'pointer', fontFamily: 'inherit' }
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const modalBox: React.CSSProperties = { background: '#fff', width: '100%', maxWidth: 520, maxHeight: '75vh', borderRadius: '16px 16px 0 0', padding: 14, display: 'flex', flexDirection: 'column' }
const modalRow: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', borderBottom: `1px solid #f2efe9`, padding: '10px 4px', cursor: 'pointer', fontFamily: 'inherit', direction: 'rtl' }
