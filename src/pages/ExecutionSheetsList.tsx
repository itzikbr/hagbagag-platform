import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useIsAdmin } from '../hooks/useAuth'

interface SheetRow {
  id: string
  project_name: string
  sheet_date: string | null
  status: 'field' | 'in_progress' | 'submitted' | null
  order_number: string | null
  customer_code: string | null
  filled_by_name: string
  recommended_team: string | null
  num_buildings: number
  created_at: string
}

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  field:       { label: 'בשטח',   bg: '#FDECEC', color: '#CC0000' },
  in_progress: { label: 'בעבודה', bg: '#FFF4E5', color: '#B26A00' },
  submitted:   { label: 'הוגש',   bg: '#E8F5E9', color: '#2E7D32' },
}

export default function ExecutionSheetsList() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const logout = useAuth(s => s.logout)
  const [sheets, setSheets] = useState<SheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // מונה בקשות: רק התוצאה של הטעינה האחרונה מעדכנת את הנתונים, כדי שבקשה איטית/תקועה
  // שהתחילה מוקדם לא תדרוס תוצאה טרייה יותר.
  const reqSeq = useRef(0)
  // מזהה הטעינה היזומה האחרונה — היא זו שאחראית לכבות את הספינר.
  const fgSeq = useRef(0)
  // האם כבר הצגנו נתונים בהצלחה פעם אחת (במהלך החיים של הרכיב הזה).
  const loadedOnce = useRef(false)

  useEffect(() => {
    loadSheets()

    // Race condition: חוזרים לרשימה מיד אחרי navigate מדף שנשמר, והשורה
    // החדשה עלולה לא להופיע עדיין (replication lag / commit שטרם נראה).
    // טעינה חוזרת אחרי 500ms תופסת את הדף שזה עתה נשמר — כרענון רקע, בלי ספינר.
    const raceTimer = setTimeout(() => loadSheets({ background: true }), 500)

    // Realtime — refresh when a sheet is added/changed.
    // שם ערוץ ייחודי לכל mount: מונע התנגשות topic כשחוזרים לרשימה מיד אחרי
    // סגירת דף (ה-unmount הקודם עדיין משחרר את הערוץ), שהייתה תוקעת את ה-resubscribe.
    const channel = supabase
      .channel(`execution-sheets-list-${reqSeq.current}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'execution_sheets',
      }, () => {
        loadSheets({ background: true })
      })
      .subscribe()

    // רענון בכל חזרה למסך: כשה-PWA/טאב חוזר לחזית או מ-bfcache, הרכיב לא בהכרח
    // עובר mount מחדש (ואז ה-fetch של ה-mount לא רץ) — האזנה ל-visibility/focus/
    // pageshow מבטיחה fetch טרי בכל פעם שהמשתמש חוזר לרשימה. רענון רקע (בלי ספינר).
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') loadSheets({ background: true })
    }
    document.addEventListener('visibilitychange', refreshOnReturn)
    window.addEventListener('focus', refreshOnReturn)
    window.addEventListener('pageshow', refreshOnReturn)

    return () => {
      clearTimeout(raceTimer)
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', refreshOnReturn)
      window.removeEventListener('focus', refreshOnReturn)
      window.removeEventListener('pageshow', refreshOnReturn)
    }
  }, [])

  // background=true → רענון שקט: לא מדליק את מסך הטעינה ולא מציג שגיאה על נתונים קיימים.
  // background=false → טעינה יזומה (mount / "נסה שוב") שמציגה ספינר.
  async function loadSheets({ background = false }: { background?: boolean } = {}) {
    const seq = ++reqSeq.current
    if (!background) {
      fgSeq.current = seq
      setLoading(true)
      setError(null)
    }

    // Guard against a request/session-refresh that never settles (seen on iOS PWA,
    // where supabase-js can stall on the auth lock and the query promise hangs forever).
    // Without this the page would sit on "טוען דפי ביצוע..." indefinitely.
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), 12000)
    })

    try {
      const query = supabase
        .from('execution_sheets')
        .select('id, project_name, sheet_date, status, order_number, customer_code, filled_by_name, recommended_team, num_buildings, created_at')
        .order('created_at', { ascending: false })

      const { data, error } = await Promise.race([query, timeout]) as
        { data: SheetRow[] | null; error: { message: string } | null }

      // בקשה מיושנת — טעינה חדשה יותר כבר רצה/הסתיימה. אל תיגע ב-state.
      if (seq !== reqSeq.current) return

      if (error) {
        console.error('[sheets] query error:', error)
        if (!loadedOnce.current) setError('שגיאה בטעינת דפי הביצוע')
        return
      }

      setSheets((data ?? []) as SheetRow[])
      setError(null)
      loadedOnce.current = true
      // ברגע שיש נתונים להציג — מכבים את הספינר, גם אם זו טעינת רקע. אחרת, אם
      // טעינת ה-mount היזומה נתקעת (רענון טוקן אחרי סגירת דף), הרשת הייתה נשארת
      // על "טוען דפי ביצוע..." עד ה-timeout של 12 שניות למרות שהנתונים כבר הגיעו.
      setLoading(false)
    } catch (e) {
      console.error('[sheets] loadSheets failed:', e)
      // רק אם מעולם לא הצלחנו לטעון מציגים שגיאה; רענון רקע כושל לא ידרוס נתונים קיימים.
      if (seq === reqSeq.current && !loadedOnce.current) {
        setError('לא הצלחנו לטעון את דפי הביצוע. בדוק את החיבור ונסה שוב.')
      }
    } finally {
      clearTimeout(timer)
      // רק טעינה יזומה מכבה את הספינר — וגם רק אם היא עדיין הטעינה היזומה האחרונה.
      if (!background && seq === fgSeq.current) setLoading(false)
    }
  }

  async function deleteSheet(sheet: SheetRow) {
    if (!window.confirm(`למחוק את "${sheet.project_name}"? פעולה זו אינה הפיכה.`)) return
    // מסירים מיד מהתצוגה (optimistic), ומחזירים אם המחיקה נכשלה
    const prev = sheets
    setSheets(cur => cur.filter(s => s.id !== sheet.id))
    // מוחקים תחילה מבנים תלויים (FK) ואז את הדף
    await supabase.from('buildings').delete().eq('sheet_id', sheet.id)
    // .select() מחזיר את השורות שנמחקו בפועל. חשוב: אם RLS חוסם מחיקה,
    // supabase מחזיר error=null אבל 0 שורות — לכן בודקים גם שהשורה אכן נמחקה,
    // אחרת "מחיקה" מדומה תיראה כהצלחה והדף יחזור אחרי רענון.
    const { data, error } = await supabase
      .from('execution_sheets')
      .delete()
      .eq('id', sheet.id)
      .select('id')
    if (error || !data || data.length === 0) {
      console.error('[sheets] delete failed:', error ?? 'no rows deleted (RLS?)')
      alert('מחיקה נכשלה. נסה שוב.')
      setSheets(prev)
    }
  }

  const filtered = sheets.filter(s =>
    s.project_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.order_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.customer_code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.filled_by_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        background: '#CC0000',
        padding: '12px 16px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>דפי ביצוע</span>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 400 }}>
            חג בגג
          </span>
        </div>
        {/* כפתור יציאה — למשתמש שאינו אדמין אין ניווט תחתון, אז זו דרך היציאה היחידה */}
        {!isAdmin && (
          <button
            onClick={async () => { await logout(); navigate('/login', { replace: true }) }}
            title="יציאה"
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 17l5-5-5-5M21 12H9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ background: '#fff', padding: '6px 12px', flexShrink: 0 }}>
        <div style={{
          background: '#F0F2F5',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          gap: 8,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="#8696A0" strokeWidth="2"/>
            <path d="M21 21L16.65 16.65" stroke="#8696A0" strokeWidth="2"/>
          </svg>
          <input
            type="text"
            placeholder="חיפוש דף ביצוע"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none', background: 'none', outline: 'none',
              fontSize: 15, color: '#111', width: '100%', direction: 'rtl',
            }}
          />
        </div>
      </div>

      {/* Sheets list */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }} className="no-scrollbar">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: '#8696A0' }}>
            טוען דפי ביצוע...
          </div>
        )}

        {!loading && error && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center',
          }}>
            <p style={{ fontSize: 15, color: '#CC0000', margin: 0, lineHeight: 1.5 }}>{error}</p>
            <button
              onClick={() => loadSheets()}
              style={{
                background: '#CC0000', color: '#fff', border: 'none',
                borderRadius: 24, padding: '10px 22px', cursor: 'pointer',
                fontSize: 15, fontWeight: 600, direction: 'rtl',
              }}
            >
              נסה שוב
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState hasSearch={search.length > 0} onCreate={() => navigate('/sheets/new')} />
        )}

        {!loading && !error && filtered.map(sheet => (
          <SheetItem
            key={sheet.id}
            sheet={sheet}
            onClick={() => navigate(`/sheets/${sheet.id}`)}
            onView={() => navigate(`/sheets/${sheet.id}/view`)}
            onDelete={() => deleteSheet(sheet)}
          />
        ))}
      </div>

      {/* FAB — new sheet (UI only) */}
      {!loading && filtered.length > 0 && (
        <button
          onClick={() => navigate('/sheets/new')}
          style={{
            position: 'fixed', bottom: 72, left: 16,
            width: 56, height: 56, borderRadius: '50%',
            background: '#CC0000', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10,
          }}
          title="דף ביצוע חדש"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  )
}

function EmptyState({ hasSearch, onCreate }: { hasSearch: boolean; onCreate: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 16, padding: 32,
      textAlign: 'center',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 20,
        background: '#CC0000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(204,0,0,0.3)',
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="#fff" strokeWidth="1.8" fill="none"/>
          <line x1="3" y1="9" x2="21" y2="9" stroke="#fff" strokeWidth="1.4"/>
          <line x1="3" y1="15" x2="21" y2="15" stroke="#fff" strokeWidth="1.4"/>
          <line x1="9" y1="3" x2="9" y2="21" stroke="#fff" strokeWidth="1.4"/>
        </svg>
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>
        {hasSearch ? 'לא נמצאו תוצאות' : 'אין דפי ביצוע עדיין'}
      </h2>
      <p style={{ fontSize: 15, color: '#8696A0', margin: 0, lineHeight: 1.5 }}>
        {hasSearch
          ? 'נסה מונח חיפוש אחר.'
          : 'צור דף ביצוע חדש כדי לנהל פרויקטים, מבנים וחומרים בשטח.'}
      </p>

      {!hasSearch && (
        <button
          onClick={onCreate}
          style={{
            marginTop: 8,
            background: '#CC0000', color: '#fff', border: 'none',
            borderRadius: 24, padding: '12px 24px', cursor: 'pointer',
            fontSize: 16, fontWeight: 600, direction: 'rtl',
            boxShadow: '0 2px 8px rgba(204,0,0,0.3)',
          }}
        >
          ＋ דף ביצוע חדש
        </button>
      )}
    </div>
  )
}

const ACTION_W = 84   // רוחב כפתור הפעולה שנחשף
const THRESHOLD = 60  // מרחק גרירה מינימלי כדי לחשוף פעולה

function SheetItem({ sheet, onClick, onView, onDelete }: {
  sheet: SheetRow; onClick: () => void; onView: () => void; onDelete: () => void
}) {
  const status = STATUS_META[sheet.status ?? 'field'] ?? STATUS_META.field
  const subtitleParts = [
    sheet.order_number ? `הזמנה ${sheet.order_number}` : null,
    sheet.customer_code ? `לקוח ${sheet.customer_code}` : null,
    sheet.num_buildings ? `${sheet.num_buildings} מבנים` : null,
  ].filter(Boolean)

  // offset שלילי = החלקה שמאלה (חושף מחיקה בצד ימין); חיובי = החלקה ימינה (חושף צפייה בצד שמאל)
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
    // מגבילים לטווח [-ACTION_W, +ACTION_W] עם התנגדות קלה מעבר לכך
    if (next > ACTION_W) next = ACTION_W + (next - ACTION_W) * 0.3
    if (next < -ACTION_W) next = -ACTION_W + (next + ACTION_W) * 0.3
    setOffset(next)
  }
  function onTouchEnd() {
    setDragging(false)
    if (offset <= -THRESHOLD) setOffset(-ACTION_W)       // נעילה על חשיפת "מחק"
    else if (offset >= THRESHOLD) setOffset(ACTION_W)    // נעילה על חשיפת "צפייה"
    else setOffset(0)                                    // חזרה למקום
  }
  function handleClick() {
    // אם השורה פתוחה או בוצעה גרירה — קליק סוגר במקום לנווט
    if (offset !== 0) { setOffset(0); return }
    if (moved.current) return
    onClick()
  }

  const transition = dragging ? 'none' : 'transform 0.2s ease'

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F0F2F5', background: '#fff' }}>
      {/* פעולת מחיקה — נחשפת בצד ימין בהחלקה שמאלה */}
      <button
        type="button"
        onClick={onDelete}
        style={{
          position: 'absolute', top: 0, bottom: 0, right: 0, width: ACTION_W,
          background: '#CC0000', color: '#fff', border: 'none',
          fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          display: offset < 0 ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
        }}
      >מחק</button>
      {/* פעולת צפייה — נחשפת בצד שמאל בהחלקה ימינה */}
      <button
        type="button"
        onClick={() => { setOffset(0); onView() }}
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: ACTION_W,
          background: '#1A5FAD', color: '#fff', border: 'none',
          fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          display: offset > 0 ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
        }}
      >צפייה</button>

    <div
      onClick={handleClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px',
        gap: 12, cursor: 'pointer',
        background: '#fff', userSelect: 'none',
        transform: `translateX(${offset}px)`, transition, position: 'relative',
      }}
    >
      {/* Sheet icon */}
      <div style={{
        width: 46, height: 46, borderRadius: 12, flexShrink: 0,
        background: '#FDECEC',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3" width="16" height="18" rx="2" stroke="#CC0000" strokeWidth="1.8" fill="none"/>
          <line x1="8" y1="8" x2="16" y2="8" stroke="#CC0000" strokeWidth="1.4"/>
          <line x1="8" y1="12" x2="16" y2="12" stroke="#CC0000" strokeWidth="1.4"/>
          <line x1="8" y1="16" x2="13" y2="16" stroke="#CC0000" strokeWidth="1.4"/>
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, gap: 8 }}>
          <span style={{
            fontWeight: 600, fontSize: 16, color: '#111',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {sheet.project_name}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: status.color, background: status.bg,
            borderRadius: 10, padding: '2px 8px', flexShrink: 0,
          }}>
            {status.label}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 13, color: '#8696A0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {subtitleParts.join(' · ') || (sheet.filled_by_name || 'ללא פרטים')}
          </span>
          <span style={{ fontSize: 12, color: '#8696A0', flexShrink: 0 }}>
            {formatDate(sheet.sheet_date ?? sheet.created_at)}
          </span>
        </div>
      </div>
    </div>
    </div>
  )
}

function formatDate(isoStr: string): string {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })
}
