import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { queryWithRetry } from '../lib/dbRetry'
import {
  ViewData, DocItem, Gallery, SheetSections, GalleryOverlay,
  buildViewData, signImages, has, fmtDate,
  HEADER_RED, BG, GREY, STATUS_META,
} from './ExecutionSheetView'

// ══════════════════════════════════════════════════════════════
// רצף דפי ביצוע — גלילה רציפה של כל הדפים, כל אחד במלואו (read-only,
// אותו רינדור כמו מסך הצפייה). מתעדכן בזמן אמת + פילטרים משולבים.
// ══════════════════════════════════════════════════════════════
const WORK_TYPES: { key: string; label: string }[] = [
  { key: 'roofReplace', label: 'החלפת גג' },
  { key: 'asbestos',    label: 'החלפת אזבסט' },
  { key: 'gutters',     label: 'מרזבים' },
  { key: 'aluminum',    label: 'ציפוי אלומיניום' },
  { key: 'insulation',  label: 'בידוד' },
  { key: 'other',       label: 'אחר' },
]
const WT_LABEL: Record<string, string> = Object.fromEntries(WORK_TYPES.map(w => [w.key, w.label]))

interface FeedItem {
  id: string
  view: ViewData
  filler: string
  supervisor: string     // מגיש/מפקח בקשת היתר משרד הסביבה (asbestos_permit.supervisor)
  workTypes: string[]
  execDate: string       // progress_data.execution_date ('YYYY-MM-DD')
}

export default function SheetsFeed() {
  const navigate = useNavigate()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [catSort, setCatSort] = useState<Record<string, number>>({})
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [galLoading, setGalLoading] = useState(false)
  const aliveRef = useRef(true)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ── פילטרים ──────────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false)
  const [fFillers, setFFillers] = useState<string[]>([])
  const [fSupers, setFSupers] = useState<string[]>([])
  const [fWork, setFWork] = useState<string[]>([])
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  async function load(background = false) {
    if (!background) setLoading(true)
    try {
      const sheets = await queryWithRetry<any[]>(() =>
        supabase.from('execution_sheets').select('*').order('created_at', { ascending: false }))
      const ids = (sheets ?? []).map(s => s.id)
      let bs: any[] = []
      if (ids.length) {
        bs = (await queryWithRetry<any[]>(() =>
          supabase.from('buildings').select('*').in('sheet_id', ids).order('building_number'))) ?? []
      }
      const buildingBySheet: Record<string, any> = {}
      for (const b of bs) if (!(b.sheet_id in buildingBySheet)) buildingBySheet[b.sheet_id] = b
      if (!aliveRef.current) return
      setItems((sheets ?? []).map(s => {
        const view = buildViewData(s, buildingBySheet[s.id])
        const pd = s.progress_data ?? {}
        return {
          id: s.id,
          view,
          filler: (s.filled_by_name ?? '').trim(),
          supervisor: (pd.asbestos_permit?.supervisor ?? '').trim(),
          workTypes: view.content.workTypes ?? [],
          execDate: (pd.execution_date ?? '').trim(),
        }
      }))
      setError(false)
    } catch (e) {
      console.error('[sheets-feed] load failed:', e)
      if (aliveRef.current && items.length === 0) setError(true)
    } finally {
      if (aliveRef.current && !background) setLoading(false)
    }
  }

  useEffect(() => {
    aliveRef.current = true
    load()
    supabase.from('materials_catalog').select('category_code,category_sort').then(({ data }) => {
      if (!data || !aliveRef.current) return
      const m: Record<string, number> = {}
      for (const r of data as { category_code: string; category_sort: number }[]) if (!(r.category_code in m)) m[r.category_code] = r.category_sort
      setCatSort(m)
    })
    const scheduleReload = () => {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => load(true), 500)
    }
    const ch = supabase.channel(`sheets-feed-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'execution_sheets' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buildings' }, scheduleReload)
      .subscribe()
    return () => { aliveRef.current = false; clearTimeout(reloadTimer.current); supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openGallery(title: string, imgItems: DocItem[]) {
    if (!imgItems?.length) return
    setGalLoading(true); setGallery({ title, imgs: [] })
    const imgs = await signImages(imgItems)
    setGallery({ title, imgs })
    setGalLoading(false)
  }

  // ── אפשרויות + סינון ──────────────────────────────────────────
  const heSort = (a: string, b: string) => a.localeCompare(b, 'he')
  const fillerOpts = [...new Set(items.map(i => i.filler).filter(Boolean))].sort(heSort)
  const superOpts = [...new Set(items.map(i => i.supervisor).filter(Boolean))].sort(heSort)
  const workOpts = WORK_TYPES.filter(w => items.some(i => i.workTypes.includes(w.key)))

  const activeCount =
    (fFillers.length ? 1 : 0) + (fSupers.length ? 1 : 0) + (fWork.length ? 1 : 0) + ((fFrom || fTo) ? 1 : 0)

  const shown = items.filter(it => {
    if (fFillers.length && !fFillers.includes(it.filler)) return false
    if (fSupers.length && !fSupers.includes(it.supervisor)) return false
    if (fWork.length && !it.workTypes.some(w => fWork.includes(w))) return false
    if (fFrom && (!it.execDate || it.execDate < fFrom)) return false
    if (fTo && (!it.execDate || it.execDate > fTo)) return false
    return true
  })

  const clearAll = () => { setFFillers([]); setFSupers([]); setFWork([]); setFFrom(''); setFTo('') }
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, fontFamily: 'Heebo, sans-serif' }}>
      {/* Header */}
      <div style={{ background: HEADER_RED, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => navigate('/sheets')} title="חזרה" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#fff', fontSize: 22, lineHeight: 1, fontFamily: 'inherit' }}>←</button>
        <div style={{ flex: 1, color: '#fff', fontSize: 17, fontWeight: 800 }}>רצף דפי ביצוע</div>
        {!loading && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}>{activeCount ? `${shown.length}/${items.length}` : items.length}</span>}
        <button onClick={() => setFilterOpen(true)} title="פילטרים" style={{
          position: 'relative', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
          color: '#fff', borderRadius: 18, padding: '6px 10px', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          🔍 פילטרים
          {activeCount > 0 && (
            <span style={{ background: '#fff', color: HEADER_RED, borderRadius: 9, minWidth: 18, height: 18, fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{activeCount}</span>
          )}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }} className="no-scrollbar">
        {loading ? (
          <div style={{ textAlign: 'center', color: GREY, padding: 40 }}>טוען…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ color: HEADER_RED, fontSize: 15, marginBottom: 12 }}>לא הצלחנו לטעון את הדפים.</div>
            <button onClick={() => load()} style={{ background: HEADER_RED, color: '#fff', border: 'none', borderRadius: 20, padding: '8px 22px', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}>נסה שוב</button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', color: GREY, padding: 40 }}>אין דפי ביצוע</div>
        ) : shown.length === 0 ? (
          <div style={{ textAlign: 'center', color: GREY, padding: 40 }}>
            אין דפים תואמים לפילטר.
            <div><button onClick={clearAll} style={{ marginTop: 12, background: HEADER_RED, color: '#fff', border: 'none', borderRadius: 20, padding: '8px 22px', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}>נקה פילטרים</button></div>
          </div>
        ) : shown.map((it, idx) => {
          const st = STATUS_META[it.view.status] ?? STATUS_META.field
          return (
            <div key={it.id}>
              {idx > 0 && <div style={{ borderTop: '3px solid #d8cec4', margin: '20px 10px 0' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 4px', direction: 'rtl' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.view.name}</div>
                  <div style={{ fontSize: 12, color: GREY, marginTop: 1 }}>
                    {[has(it.view.date) ? fmtDate(it.view.date) : '', has(it.view.fillerName) ? it.view.fillerName : ''].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 12, padding: '3px 12px', flexShrink: 0 }}>{st.label}</span>
                <button onClick={() => navigate(`/sheets/${it.id}/view`)} title="פתח דף" style={{ background: 'none', border: 'none', cursor: 'pointer', color: HEADER_RED, fontSize: 22, lineHeight: 1, fontFamily: 'inherit', flexShrink: 0 }}>‹</button>
              </div>
              <SheetSections data={it.view} catSort={catSort} onOpenGallery={openGallery} />
            </div>
          )
        })}
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div onClick={() => setFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div dir="rtl" onClick={e => e.stopPropagation()} className="no-scrollbar" style={{ background: '#fff', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', borderRadius: '16px 16px 0 0', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ flex: 1, fontWeight: 800, color: HEADER_RED, fontSize: 16 }}>פילטרים</span>
              <button onClick={() => setFilterOpen(false)} style={{ background: '#eee', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>סגור</button>
            </div>

            <FSection title="ממלא">
              {fillerOpts.length === 0 ? <Empty /> : fillerOpts.map(v => <Chip key={v} label={v} active={fFillers.includes(v)} onClick={() => toggle(fFillers, setFFillers, v)} />)}
            </FSection>

            <FSection title="מגיש בקשה לאיכות הסביבה">
              {superOpts.length === 0 ? <Empty /> : superOpts.map(v => <Chip key={v} label={v} active={fSupers.includes(v)} onClick={() => toggle(fSupers, setFSupers, v)} />)}
            </FSection>

            <FSection title="סוג עבודה">
              {workOpts.length === 0 ? <Empty /> : workOpts.map(w => <Chip key={w.key} label={w.label} active={fWork.includes(w.key)} onClick={() => toggle(fWork, setFWork, w.key)} />)}
            </FSection>

            <FSection title="תאריך ביצוע">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
                <label style={{ fontSize: 13, color: '#555' }}>מ־</label>
                <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={dateInput} />
                <label style={{ fontSize: 13, color: '#555' }}>עד</label>
                <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={dateInput} />
              </div>
            </FSection>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={clearAll} disabled={activeCount === 0} style={{
                flexShrink: 0, background: '#fff', color: activeCount ? HEADER_RED : '#bbb', border: `1.5px solid ${activeCount ? HEADER_RED : '#ddd'}`,
                borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: activeCount ? 'pointer' : 'default', fontFamily: 'inherit',
              }}>נקה פילטרים</button>
              <button onClick={() => setFilterOpen(false)} style={{
                flex: 1, background: HEADER_RED, color: '#fff', border: 'none', borderRadius: 10,
                padding: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              }}>הצג {shown.length} דפים</button>
            </div>
          </div>
        </div>
      )}

      <GalleryOverlay gallery={gallery} galLoading={galLoading} onClose={() => setGallery(null)} />
    </div>
  )
}

// ── פקדי פילטר ─────────────────────────────────────────────────
function FSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#444', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  )
}
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: active ? HEADER_RED : '#F2EDE9', color: active ? '#fff' : '#444',
      border: `1px solid ${active ? HEADER_RED : '#e0d8d0'}`, borderRadius: 16, padding: '6px 12px',
      fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  )
}
function Empty() { return <span style={{ fontSize: 13, color: '#aaa' }}>אין ערכים</span> }

const dateInput: React.CSSProperties = {
  flex: 1, minWidth: 0, border: '1px solid #e0d8d0', borderRadius: 8, padding: '8px 10px',
  fontSize: 14, fontFamily: 'inherit', outline: 'none', direction: 'rtl', background: '#fff',
}
