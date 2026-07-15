import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useIsAdmin } from '../hooks/useAuth'

// ── טיפוסים ────────────────────────────────────────────────────
interface BuildingRow { work_content?: { details?: { customerName?: string; address?: string; orderNumber?: string } } }
interface SheetRow {
  id: string
  project_name: string
  archived: boolean
  progress_data: { execution_date?: string; team_lead?: string; subcontractor?: string } | null
  buildings: BuildingRow[] | null
}
interface DecoratedSheet {
  id: string
  name: string
  address: string
  orderNumber: string
  execDate: Date | null
  execMs: number
  when: 'past' | 'today' | 'future' | 'none'
  teamLead: string
  subcontractor: string
}
type View = 'active' | 'archived'

const RED = '#CC0000'
const BLUE = '#1A5FAD'
const GREY = '#8696A0'

// ── עזרי תאריך/שם ──────────────────────────────────────────────
function parseExec(s?: string): Date | null {
  if (!s) return null
  const d = new Date(`${s}T00:00:00`)
  return isNaN(d.getTime()) ? null : d
}
function todayMidnight(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
function whenOf(d: Date | null, today: Date): DecoratedSheet['when'] {
  if (!d) return 'none'
  const t = d.getTime()
  if (t === today.getTime()) return 'today'
  return t < today.getTime() ? 'past' : 'future'
}
function fmtDM(d: Date | null): string {
  return d ? `${d.getDate()}.${d.getMonth() + 1}` : '—'
}
// קיצור שם: יותר מ-2 לקוחות (מופרדים בפסיק) → "הלקוח הראשון ועוד";
// אחרת, יותר מ-2 מילים → השם הפרטי הראשון בלבד; אחרת השם המלא.
function shortName(name: string): string {
  const clean = (name || '').trim()
  const customers = clean.split(',').map(s => s.trim()).filter(Boolean)
  if (customers.length > 2) return `${customers[0]} ועוד`
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length > 2) return words[0]
  return clean
}

// ── צבעי תגית תאריך ────────────────────────────────────────────
const BADGE: Record<DecoratedSheet['when'], { bg: string; color: string }> = {
  past:   { bg: '#F5EFEF', color: RED },
  today:  { bg: RED,       color: '#fff' },
  future: { bg: '#EEF2FF', color: BLUE },
  none:   { bg: '#EEE',    color: GREY },
}

export default function ExecutionSheetsList() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const logout = useAuth(s => s.logout)
  const [sheets, setSheets] = useState<SheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('active')

  const reqSeq = useRef(0)
  const appliedSeq = useRef(0)
  const loadedOnce = useRef(false)
  const aliveRef = useRef(true)
  const initialDoneRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef<string>('')   // אחרון שגללנו אליו: view

  useEffect(() => {
    aliveRef.current = true
    loadSheets()

    // רענון רקע קצר אחרי mount — תופס דף שזה עתה נשמר (replication lag).
    const raceTimer = setTimeout(() => loadSheets({ background: true }), 500)

    // Realtime — רענון כשדף נוסף/משתנה/מאורכב.
    const channel = supabase
      .channel(`execution-sheets-list-${reqSeq.current}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'execution_sheets' }, () => {
        loadSheets({ background: true })
      })
      .subscribe()

    // רענון בכל חזרה למסך (PWA/טאב/bfcache) — רק אחרי הטעינה הראשונית.
    const refreshOnReturn = () => {
      if (initialDoneRef.current && document.visibilityState === 'visible') loadSheets({ background: true })
    }
    document.addEventListener('visibilitychange', refreshOnReturn)
    window.addEventListener('focus', refreshOnReturn)
    window.addEventListener('pageshow', refreshOnReturn)

    return () => {
      aliveRef.current = false
      clearTimeout(raceTimer)
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', refreshOnReturn)
      window.removeEventListener('focus', refreshOnReturn)
      window.removeEventListener('pageshow', refreshOnReturn)
    }
  }, [])

  async function loadSheets({ background = false }: { background?: boolean } = {}) {
    const seq = ++reqSeq.current
    if (!background) { setLoading(true); setError(null) }

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 12000) })

    try {
      const query = supabase
        .from('execution_sheets')
        .select('id, project_name, archived, progress_data, buildings(work_content)')
        .order('created_at', { ascending: false })

      const { data, error } = await Promise.race([query, timeout]) as
        { data: SheetRow[] | null; error: { message: string } | null }

      if (!aliveRef.current) return

      if (error) {
        console.error('[sheets] query error:', error)
        if (!loadedOnce.current && seq === reqSeq.current) setError('שגיאה בטעינת דפי הביצוע')
      } else if (seq > appliedSeq.current) {
        appliedSeq.current = seq
        setSheets((data ?? []) as SheetRow[])
        setError(null)
        loadedOnce.current = true
      }
    } catch (e) {
      console.error('[sheets] loadSheets failed:', e)
      if (aliveRef.current && !loadedOnce.current && seq === reqSeq.current) {
        setError('לא הצלחנו לטעון את דפי הביצוע. בדוק את החיבור ונסה שוב.')
      }
    } finally {
      clearTimeout(timer)
      if (aliveRef.current && (seq === reqSeq.current || loadedOnce.current)) {
        setLoading(false)
        initialDoneRef.current = true
      }
    }
  }

  // ── פעולות ───────────────────────────────────────────────────
  async function archiveSheet(id: string) {
    if (!window.confirm('להעביר לארכיון?')) return
    setSheets(cur => cur.map(s => (s.id === id ? { ...s, archived: true } : s)))
    const { error } = await supabase.from('execution_sheets').update({ archived: true }).eq('id', id)
    if (error) {
      console.error('[sheets] archive failed:', error)
      alert('העברה לארכיון נכשלה. נסה שוב.')
      setSheets(cur => cur.map(s => (s.id === id ? { ...s, archived: false } : s)))
    }
  }

  async function deleteSheet(id: string) {
    if (!window.confirm('למחוק לצמיתות?')) return
    const prev = sheets
    setSheets(cur => cur.filter(s => s.id !== id))
    await supabase.from('buildings').delete().eq('sheet_id', id)
    const { data, error } = await supabase.from('execution_sheets').delete().eq('id', id).select('id')
    if (error || !data || data.length === 0) {
      console.error('[sheets] delete failed:', error ?? 'no rows deleted (RLS?)')
      alert('מחיקה נכשלה. נסה שוב.')
      setSheets(prev)
    }
  }

  // ── גזירת נתונים לתצוגה ───────────────────────────────────────
  const today = todayMidnight()
  const decorated: DecoratedSheet[] = sheets
    .filter(s => !!s.archived === (view === 'archived'))
    .map(s => {
      const details = s.buildings?.[0]?.work_content?.details ?? {}
      const execDate = parseExec(s.progress_data?.execution_date)
      return {
        id: s.id,
        name: s.project_name || details.customerName || 'דף ביצוע',
        address: details.address ?? '',
        orderNumber: details.orderNumber ?? '',
        execDate,
        execMs: execDate ? execDate.getTime() : Infinity,
        when: whenOf(execDate, today),
        teamLead: s.progress_data?.team_lead ?? '',
        subcontractor: s.progress_data?.subcontractor ?? '',
      }
    })

  const q = search.trim().toLowerCase()
  const filtered = (q
    ? decorated.filter(d => d.name.toLowerCase().includes(q) || d.orderNumber.toLowerCase().includes(q))
    : decorated
  ).sort((a, b) => (a.execMs - b.execMs) || a.name.localeCompare(b.name, 'he'))

  // גלילה כך שהיום/עתיד יופיעו בראש התצוגה (למעלה=עבר, למטה=עתיד). פעם אחת לכל view.
  useEffect(() => {
    if (loading) return
    if (didScrollRef.current === view) return
    const c = listRef.current
    if (!c) return
    const raf = requestAnimationFrame(() => {
      const cards = c.querySelectorAll('[data-when]')
      if (!cards.length) return   // עוד אין כרטיסים — ננסה שוב כשיגיעו נתונים
      const target = c.querySelector('[data-when="today"],[data-when="future"]') as HTMLElement | null
      if (target) {
        c.scrollTop += target.getBoundingClientRect().top - c.getBoundingClientRect().top
      } else {
        c.scrollTop = c.scrollHeight   // הכול בעבר → העדכני ביותר בתחתית
      }
      didScrollRef.current = view
    })
    return () => cancelAnimationFrame(raf)
  }, [view, loading, sheets])

  // ── UI ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        background: RED, padding: '12px 16px 8px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, position: 'relative',
      }}>
        {view === 'archived' ? (
          <button onClick={() => setView('active')} title="חזרה"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>
            → חזרה
          </button>
        ) : (
          <button onClick={() => setView('archived')} title="ארכיון"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700, borderRadius: 14, padding: '5px 12px', fontFamily: 'inherit' }}>
            📦 ארכיון
          </button>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>{view === 'archived' ? 'ארכיון' : 'דפי ביצוע'}</span>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 400 }}>חג בגג</span>
        </div>

        {view === 'active' && !isAdmin && (
          <button onClick={async () => { await logout(); navigate('/login', { replace: true }) }} title="יציאה"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 17l5-5-5-5M21 12H9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ background: '#fff', padding: '6px 12px', flexShrink: 0 }}>
        <div style={{ background: '#F0F2F5', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="#8696A0" strokeWidth="2"/>
            <path d="M21 21L16.65 16.65" stroke="#8696A0" strokeWidth="2"/>
          </svg>
          <input type="text" placeholder="חיפוש לפי שם לקוח או מספר הזמנה" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: 15, color: '#111', width: '100%', direction: 'rtl' }} />
        </div>
      </div>

      {/* List */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', background: '#fff' }} className="no-scrollbar">
        {loading && <div style={{ padding: 24, textAlign: 'center', color: GREY }}>טוען דפי ביצוע...</div>}

        {!loading && error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: RED, margin: 0, lineHeight: 1.5 }}>{error}</p>
            <button onClick={() => loadSheets()} style={{ background: RED, color: '#fff', border: 'none', borderRadius: 24, padding: '10px 22px', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>נסה שוב</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState view={view} hasSearch={q.length > 0} onCreate={() => navigate('/sheets/new')} />
        )}

        {!loading && !error && filtered.map((d, i) => (
          <SheetCard key={d.id} d={d} index={i} view={view}
            onOpen={() => navigate(`/sheets/${d.id}`)}
            onView={() => navigate(`/sheets/${d.id}/view`)}
            onArchive={() => archiveSheet(d.id)}
            onDelete={() => deleteSheet(d.id)} />
        ))}
      </div>

      {/* FAB — new sheet (active view only) */}
      {view === 'active' && !loading && filtered.length > 0 && (
        <button onClick={() => navigate('/sheets/new')} title="דף ביצוע חדש"
          style={{ position: 'fixed', bottom: 72, left: 16, width: 56, height: 56, borderRadius: '50%', background: RED, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  )
}

// ── כרטיס דף (עם החלקה לחשיפת פעולות) ─────────────────────────
const ACTION_W = 96   // רוחב כפתור הפעולה שנחשף בהחלקה
const THRESHOLD = 56  // מרחק גרירה מינימלי לנעילה על פעולה

function SheetCard({ d, index, view, onOpen, onView, onArchive, onDelete }: {
  d: DecoratedSheet; index: number; view: View
  onOpen: () => void; onView: () => void; onArchive: () => void; onDelete: () => void
}) {
  const bg = d.when === 'today' ? '#FFF0EE' : (index % 2 === 0 ? '#ffffff' : '#F5F2EF')
  const badge = BADGE[d.when]
  const title = d.address ? `${shortName(d.name)} · ${d.address}` : shortName(d.name)
  const row2Parts = [d.subcontractor, d.teamLead].filter(Boolean).join(' · ')

  // offset שלילי = החלקה שמאלה (חושף פעולה אדומה בצד ימין);
  // offset חיובי = החלקה ימינה (חושף "צפייה" כחול בצד שמאל)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startOffset = useRef(0)
  const moved = useRef(false)

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX
    startOffset.current = offset
    moved.current = false
    setDragging(true)
  }
  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startX.current
    if (Math.abs(dx) > 6) moved.current = true
    let next = startOffset.current + dx
    if (next > ACTION_W) next = ACTION_W + (next - ACTION_W) * 0.3
    if (next < -ACTION_W) next = -ACTION_W + (next + ACTION_W) * 0.3
    setOffset(next)
  }
  function onTouchEnd() {
    setDragging(false)
    if (offset <= -THRESHOLD) setOffset(-ACTION_W)
    else if (offset >= THRESHOLD) setOffset(ACTION_W)
    else setOffset(0)
  }
  function handleClick() {
    if (offset !== 0) { setOffset(0); return }   // שורה פתוחה/נגררה → קליק סוגר
    if (moved.current) return
    onOpen()
  }
  function leftAction() {   // אדום — ארכיון (תצוגה רגילה) או מחיקה (ארכיון)
    setOffset(0)
    if (view === 'active') onArchive(); else onDelete()
  }
  function rightAction() {  // כחול — צפייה
    setOffset(0)
    onView()
  }
  const transition = dragging ? 'none' : 'transform 0.2s ease'

  return (
    <div data-when={d.when} style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F0F2F5' }}>
      {/* החלקה שמאלה → אדום (ארכיון/מחיקה), נחשף בצד ימין */}
      <button type="button" onClick={leftAction} style={{
        position: 'absolute', top: 0, bottom: 0, right: 0, width: ACTION_W,
        background: RED, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit', direction: 'rtl',
        display: offset < 0 ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
      }}>{view === 'active' ? 'ארכיון 📦' : 'מחק 🗑'}</button>

      {/* החלקה ימינה → כחול (צפייה), נחשף בצד שמאל */}
      <button type="button" onClick={rightAction} style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: ACTION_W,
        background: BLUE, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit', direction: 'rtl',
        display: offset > 0 ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
      }}>צפייה 👁</button>

      <div onClick={handleClick} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{
          background: bg, padding: '6px 16px', cursor: 'pointer', userSelect: 'none', direction: 'rtl',
          transform: `translateX(${offset}px)`, transition, position: 'relative',
        }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 900, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
          {view === 'active' ? (
            <button onClick={e => { e.stopPropagation(); onArchive() }} title="ארכב"
              style={iconBtn}>📦</button>
          ) : (
            <button onClick={e => { e.stopPropagation(); onDelete() }} title="מחק לצמיתות"
              style={iconBtn}>🗑️</button>
          )}
        </div>

        {/* Row 2 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 8, padding: '2px 9px', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {fmtDM(d.execDate)}
          </span>
          {row2Parts && (
            <span style={{ fontSize: 14, fontWeight: 600, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row2Parts}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 20, lineHeight: 1, padding: 4, fontFamily: 'inherit',
}

// ── מצב ריק ───────────────────────────────────────────────────
function EmptyState({ view, hasSearch, onCreate }: { view: View; hasSearch: boolean; onCreate: () => void }) {
  const archived = view === 'archived'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32, textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: 20, background: RED, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(204,0,0,0.3)', fontSize: 38 }}>
        {archived ? '📦' : (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="#fff" strokeWidth="1.8" fill="none"/>
            <line x1="3" y1="9" x2="21" y2="9" stroke="#fff" strokeWidth="1.4"/>
            <line x1="3" y1="15" x2="21" y2="15" stroke="#fff" strokeWidth="1.4"/>
            <line x1="9" y1="3" x2="9" y2="21" stroke="#fff" strokeWidth="1.4"/>
          </svg>
        )}
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>
        {hasSearch ? 'לא נמצאו תוצאות' : archived ? 'הארכיון ריק' : 'אין דפי ביצוע עדיין'}
      </h2>
      <p style={{ fontSize: 15, color: GREY, margin: 0, lineHeight: 1.5 }}>
        {hasSearch ? 'נסה מונח חיפוש אחר.'
          : archived ? 'דפים שתעביר לארכיון יופיעו כאן.'
          : 'צור דף ביצוע חדש כדי לנהל פרויקטים, מבנים וחומרים בשטח.'}
      </p>
      {!hasSearch && !archived && (
        <button onClick={onCreate} style={{ marginTop: 8, background: RED, color: '#fff', border: 'none', borderRadius: 24, padding: '12px 24px', cursor: 'pointer', fontSize: 16, fontWeight: 600, direction: 'rtl', boxShadow: '0 2px 8px rgba(204,0,0,0.3)' }}>
          ＋ דף ביצוע חדש
        </button>
      )}
    </div>
  )
}
