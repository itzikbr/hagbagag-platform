import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
  const [sheets, setSheets] = useState<SheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadSheets()

    // Realtime — refresh when a sheet is added/changed
    const channel = supabase
      .channel('execution-sheets-list')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'execution_sheets',
      }, () => {
        loadSheets()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadSheets() {
    console.log('[sheets] loadSheets: start')
    setLoading(true)
    setError(null)

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

      if (error) {
        console.error('[sheets] query error:', error)
        setError('שגיאה בטעינת דפי הביצוע')
        return
      }

      console.log('[sheets] loaded rows:', data?.length ?? 0, data)
      setSheets((data ?? []) as SheetRow[])
    } catch (e) {
      console.error('[sheets] loadSheets failed:', e)
      setError('לא הצלחנו לטעון את דפי הביצוע. בדוק את החיבור ונסה שוב.')
    } finally {
      clearTimeout(timer)
      setLoading(false)
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
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>דפי ביצוע</span>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 400 }}>
            חג בגג
          </span>
        </div>
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
          <SheetItem key={sheet.id} sheet={sheet} onClick={() => navigate(`/sheets/${sheet.id}`)} />
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

function SheetItem({ sheet, onClick }: { sheet: SheetRow; onClick: () => void }) {
  const status = STATUS_META[sheet.status ?? 'field'] ?? STATUS_META.field
  const subtitleParts = [
    sheet.order_number ? `הזמנה ${sheet.order_number}` : null,
    sheet.customer_code ? `לקוח ${sheet.customer_code}` : null,
    sheet.num_buildings ? `${sheet.num_buildings} מבנים` : null,
  ].filter(Boolean)

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px',
        gap: 12, cursor: 'pointer', borderBottom: '1px solid #F0F2F5',
        background: '#fff', userSelect: 'none',
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
  )
}

function formatDate(isoStr: string): string {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })
}
