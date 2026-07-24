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
// אותו רינדור כמו מסך הצפייה). מתעדכן בזמן אמת (Realtime על השינויים).
// ══════════════════════════════════════════════════════════════
interface FeedItem { id: string; view: ViewData }

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
      // מבנה ראשון (building_number הנמוך) לכל דף
      const buildingBySheet: Record<string, any> = {}
      for (const b of bs) if (!(b.sheet_id in buildingBySheet)) buildingBySheet[b.sheet_id] = b
      if (!aliveRef.current) return
      setItems((sheets ?? []).map(s => ({ id: s.id, view: buildViewData(s, buildingBySheet[s.id]) })))
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
    // Realtime — כל שינוי בדפים/מבנים → רענון (debounce קצר לאיחוד עדכונים)
    const scheduleReload = () => {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => load(true), 500)
    }
    const ch = supabase.channel('sheets-feed')
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

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, fontFamily: 'Heebo, sans-serif' }}>
      {/* Header */}
      <div style={{ background: HEADER_RED, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => navigate('/sheets')} title="חזרה" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#fff', fontSize: 22, lineHeight: 1, fontFamily: 'inherit' }}>←</button>
        <div style={{ flex: 1, color: '#fff', fontSize: 17, fontWeight: 800 }}>רצף דפי ביצוע</div>
        {!loading && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}>{items.length}</span>}
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
        ) : items.map((it, idx) => {
          const st = STATUS_META[it.view.status] ?? STATUS_META.field
          return (
            <div key={it.id}>
              {idx > 0 && <div style={{ borderTop: '3px solid #d8cec4', margin: '20px 10px 0' }} />}
              {/* כותרת דף */}
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

      <GalleryOverlay gallery={gallery} galLoading={galLoading} onClose={() => setGallery(null)} />
    </div>
  )
}
