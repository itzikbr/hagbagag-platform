import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { queryWithRetry } from '../lib/dbRetry'
import { reportClient, errDetail } from '../lib/report'

// ── לוח בקרה עסקאות (admin-only) ────────────────────────────────
// מסך עבודה, לא נוי: המטרה היא לדעת תוך שנייה כמה כסף איפה, מה חדש/תקוע,
// ומה עדיין לא מקושר לדף ביצוע. נתונים חיים מ-Supabase — שתי שאילתות
// (deals + מספרי הזמנה מקושרים מ-execution_sheets) + realtime, בלי snapshot.

const RED = '#CC0000'
const CREAM = '#F2EDE9'
const GREY = '#8696A0'
const BORDER = '#E5DDD5'

interface DealRow {
  id: string
  order_number: string
  customer_number: string | null
  customer_name: string | null
  total_price: number | null
  stage: number
  stage_updated_at: string | null
  created_at: string | null
  balance_due: number | null
  balance_note: string | null
  raw_data: { profit_pct?: number; site?: string; contact?: string; handled_by?: string; profit?: number; order_status_raw?: string; date_serial?: number | string } | null
}
// גיול מצרפי ברמת לקוח (טבלת customer_aging) — מתרענן שבועית מקובץ פריוריטי
interface AgingRow { customer_number: string; aging_total: number; as_of_date: string }

// 8 שלבים — שמות/צבעים כפי שנקבעו במוקאף המאושר (אין עדיין קונבנציית צבע
// קיימת ל-8 שלבים במקום אחר באפליקציה — StageCard בדף הביצוע הבודד מטפל
// רק ב-7 ומציג עיגול אדום אחיד, בלי צבעים; ראו הערה בדוח הסיום).
const STAGE_META: Record<number, { label: string; bg: string; fg: string }> = {
  1: { label: 'טיוטא', bg: '#9CA3AF', fg: '#1F2937' },
  2: { label: 'זמני מאושרת', bg: '#D4A24C', fg: '#3A2A05' },
  3: { label: 'מאושרת לביצוע', bg: '#4A7FBF', fg: '#fff' },
  4: { label: 'בביצוע', bg: '#7C5CBF', fg: '#fff' },
  5: { label: 'בוצעה', bg: '#3B8686', fg: '#fff' },
  6: { label: 'מוסדי לתשלום', bg: '#E08E45', fg: '#3A2205' },
  7: { label: 'סגורה', bg: '#8FA998', fg: '#1F2E22' },
  8: { label: 'לבירור', bg: '#D1495B', fg: '#fff' },
}
const CHIP_STAGES = [1, 2, 3, 4, 5, 6, 8]   // בלי 7 — "סגורה" בסעיף היסטוריה בנפרד
const HISTORY_STAGE = 7
const HISTORY_TOP_N = 20

function ils(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return ''
  return '₪' + Number(n).toLocaleString('he-IL')
}
// סכום מקוצר לצ'יפים (K/M) — לא לכרטיסים, שם נשאר הסכום המלא (ils).
function ilsCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M ₪'
  if (abs >= 1_000) return Math.round(n / 1_000) + 'K ₪'
  return ils(n)
}
// 2026-08-16 → 16/08/26
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso
    : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)}`
}
function profitTone(pct: number): { bg: string; color: string } {
  if (pct < 20) return { bg: '#FDECEC', color: RED }
  if (pct < 35) return { bg: '#FFF1E0', color: '#B5651D' }
  return { bg: '#E8F5E9', color: '#1A5A2A' }
}

export default function DealsDashboard() {
  const navigate = useNavigate()
  const [deals, setDeals] = useState<DealRow[]>([])
  const [linkCounts, setLinkCounts] = useState<Map<string, number>>(new Map())
  const [agingByCustomer, setAgingByCustomer] = useState<Map<string, AgingRow>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStage, setSelectedStage] = useState<number | null>(null)   // null = "הכל הפעיל"
  const [historyOpen, setHistoryOpen] = useState(false)

  const aliveRef = useRef(true)
  const reqSeq = useRef(0)
  const loadStartRef = useRef<number | null>(null)
  const initialDoneRef = useRef(false)
  const historyRef = useRef<HTMLDivElement>(null)

  async function loadAll({ background = false }: { background?: boolean } = {}) {
    const seq = ++reqSeq.current
    if (!background) { setLoading(true); setError(null); loadStartRef.current = Date.now() }
    const t0 = Date.now()
    try {
      const [dealRows, sheetOrderNumbers, agingRows] = await Promise.all([
        queryWithRetry<DealRow[]>(() => supabase.from('deals').select('*')),
        queryWithRetry<{ order_number: string }[]>(() =>
          supabase.from('execution_sheets').select('order_number').not('order_number', 'is', null)),
        // גיול מצרפי ברמת לקוח — הנתון היחיד שאומר כמה הלקוח *באמת* חייב
        // כשיש לו כמה הזמנות פתוחות ו-balance_due נשאר NULL בכולן.
        queryWithRetry<AgingRow[]>(() =>
          supabase.from('customer_aging').select('customer_number, aging_total, as_of_date')),
      ])
      if (!aliveRef.current || seq !== reqSeq.current) return
      const counts = new Map<string, number>()
      for (const r of sheetOrderNumbers ?? []) {
        counts.set(r.order_number, (counts.get(r.order_number) ?? 0) + 1)
      }
      const aging = new Map<string, AgingRow>()
      for (const a of agingRows ?? []) aging.set(a.customer_number, a)
      setDeals(dealRows ?? [])
      setLinkCounts(counts)
      setAgingByCustomer(aging)
      setError(null)
    } catch (e) {
      console.error('[deals-dashboard] load failed:', e)
      reportClient({ where: 'deals-dashboard-load-failed', ms: Date.now() - t0, background, ...errDetail(e) })
      if (!background) setError('לא הצלחנו לטעון את העסקאות. נסה שוב.')
    } finally {
      if (aliveRef.current && !background && seq === reqSeq.current) {
        setLoading(false); initialDoneRef.current = true; loadStartRef.current = null
      }
    }
  }

  useEffect(() => {
    aliveRef.current = true
    loadAll()

    const channel = supabase
      .channel(`deals-dashboard-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => loadAll({ background: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'execution_sheets' }, () => loadAll({ background: true }))
      .subscribe()

    // רענון בחזרה למסך — אם הטעינה הראשונית עדיין תקועה (PWA הוקפאה ברקע
    // ותקועה מזמן), מתחילים ניסיון טרי במקום לחכות לניסיון הקפוא.
    const STUCK_MS = 6000
    const refreshOnReturn = () => {
      if (document.visibilityState !== 'visible') return
      if (initialDoneRef.current) { loadAll({ background: true }); return }
      if (loadStartRef.current && Date.now() - loadStartRef.current > STUCK_MS) loadAll()
    }
    document.addEventListener('visibilitychange', refreshOnReturn)
    window.addEventListener('focus', refreshOnReturn)
    window.addEventListener('pageshow', refreshOnReturn)

    return () => {
      aliveRef.current = false
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', refreshOnReturn)
      window.removeEventListener('focus', refreshOnReturn)
      window.removeEventListener('pageshow', refreshOnReturn)
    }
  }, [])

  const { totalAll, totalActive, perStage } = useMemo(() => {
    const perStage = new Map<number, { count: number; sum: number }>()
    let totalAll = 0, totalActive = 0
    for (const d of deals) {
      const price = d.total_price ?? 0
      totalAll += price
      if (d.stage !== HISTORY_STAGE) totalActive += price
      const cur = perStage.get(d.stage) ?? { count: 0, sum: 0 }
      cur.count += 1; cur.sum += price
      perStage.set(d.stage, cur)
    }
    return { totalAll, totalActive, perStage }
  }, [deals])

  const visibleRows = useMemo(() => {
    const filtered = selectedStage == null
      ? deals.filter(d => d.stage !== HISTORY_STAGE)
      : deals.filter(d => d.stage === selectedStage)
    return filtered.sort((a, b) => (b.total_price ?? 0) - (a.total_price ?? 0))
  }, [deals, selectedStage])

  const historyDeals = useMemo(() => {
    const closed = deals.filter(d => d.stage === HISTORY_STAGE)
    const sorted = closed.sort((a, b) => (b.total_price ?? 0) - (a.total_price ?? 0))
    return { count: closed.length, sum: closed.reduce((s, d) => s + (d.total_price ?? 0), 0), top: sorted.slice(0, HISTORY_TOP_N) }
  }, [deals])

  // כמה עסקאות פתוחות (stage≠7) יש לכל customer_number — לתצוגת "יתרה משוערת"
  // בלבד (ראו BalanceRow). לא נכתב לשום מקום ב-DB.
  // גם הסכום, לא רק המניין — האזהרה על לקוח מרובה-הזמנות מציגה את שניהם.
  const openByCustomer = useMemo(() => {
    const m = new Map<string, { count: number; sum: number }>()
    for (const d of deals) {
      if (d.stage === HISTORY_STAGE || !d.customer_number) continue
      const cur = m.get(d.customer_number) ?? { count: 0, sum: 0 }
      cur.count += 1; cur.sum += d.total_price ?? 0
      m.set(d.customer_number, cur)
    }
    return m
  }, [deals])

  function onPipelineClick(stage: number) {
    if (stage === HISTORY_STAGE) {
      setHistoryOpen(true)
      requestAnimationFrame(() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      return
    }
    setSelectedStage(cur => (cur === stage ? null : stage))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: RED, padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
        <button onClick={() => navigate('/sheets')} title="חזרה"
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 22, lineHeight: 1, fontFamily: 'inherit' }}>←</button>
        {/* כניסה כללית זמנית לכלי המרחקים — המיקום הסופי בתפריט יוסדר
            בעיצוב הניווט מחדש. בלי sheetId ⇒ בדיקה חד-פעמית שלא נשמרת. */}
        <button onClick={() => navigate('/mirchakim')} title="מרחקים למבנים סמוכים"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.45)', cursor: 'pointer', color: '#fff', fontSize: 12.5, fontWeight: 700, borderRadius: 14, padding: '5px 11px', fontFamily: 'inherit' }}>📐 מרחקים</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>לוח בקרה עסקאות</span>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 400 }}>חג בגג</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: CREAM }} className="no-scrollbar">
        {loading && <div style={{ padding: 24, textAlign: 'center', color: GREY }}>טוען עסקאות...</div>}

        {!loading && error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: RED, margin: 0 }}>{error}</p>
            <button onClick={() => loadAll()} style={{ background: RED, color: '#fff', border: 'none', borderRadius: 24, padding: '10px 22px', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>נסה שוב</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* פס פייפליין */}
            <div style={{ background: '#fff', padding: '14px 14px 12px', direction: 'rtl' }}>
              <div style={{ display: 'flex', width: '100%', height: 22, borderRadius: 8, overflow: 'hidden', gap: 1 }}>
                {Object.keys(STAGE_META).map(Number).map(stage => {
                  const s = perStage.get(stage)
                  if (!s || totalAll <= 0) return null
                  const pct = (s.sum / totalAll) * 100
                  if (pct <= 0) return null
                  const meta = STAGE_META[stage]
                  return (
                    <button key={stage} type="button" onClick={() => onPipelineClick(stage)}
                      title={`${meta.label} — ${ils(s.sum)} (${pct.toFixed(1)}%)`}
                      style={{ width: `${pct}%`, minWidth: 3, background: meta.bg, border: 'none', cursor: 'pointer', padding: 0 }} />
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12.5, fontWeight: 700, color: '#555' }}>
                <span>שווי מצטבר (הכל): <b style={{ color: '#111' }}>{ils(totalAll)}</b></span>
                <span>פעיל כרגע: <b style={{ color: RED }}>{ils(totalActive)}</b></span>
              </div>
            </div>

            {/* צ'יפים */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', background: '#fff', borderTop: `1px solid ${BORDER}` }} className="no-scrollbar">
              <Chip label="הכל הפעיל" count={deals.filter(d => d.stage !== HISTORY_STAGE).length} sum={totalActive}
                active={selectedStage == null} color={RED} onClick={() => setSelectedStage(null)} />
              {CHIP_STAGES.map(stage => (
                <Chip key={stage} label={STAGE_META[stage].label} count={perStage.get(stage)?.count ?? 0} sum={perStage.get(stage)?.sum ?? 0}
                  active={selectedStage === stage} color={STAGE_META[stage].bg}
                  onClick={() => setSelectedStage(cur => (cur === stage ? null : stage))} />
              ))}
            </div>

            {/* רשימת כרטיסים */}
            <div style={{ padding: '10px 10px 4px' }}>
              {visibleRows.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: GREY, fontSize: 14 }}>אין עסקאות בסינון הזה</div>
              )}
              {visibleRows.map(d => <DealCard key={d.id} deal={d} linkedCount={linkCounts.get(d.order_number) ?? 0} openCountForCustomer={d.customer_number ? openByCustomer.get(d.customer_number)?.count ?? 0 : 0} openSumForCustomer={d.customer_number ? openByCustomer.get(d.customer_number)?.sum ?? 0 : 0} aging={d.customer_number ? agingByCustomer.get(d.customer_number) ?? null : null} />)}
            </div>

            {/* היסטוריה — סגורות, מקופל בברירת מחדל */}
            <div ref={historyRef} style={{ margin: '4px 10px 20px', background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              <button type="button" onClick={() => setHistoryOpen(o => !o)} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', direction: 'rtl', fontFamily: 'inherit',
              }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>📦 היסטוריה — עסקאות סגורות</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>{historyDeals.count} · {ils(historyDeals.sum)}</span>
                  <span style={{ transform: historyOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: '#888' }}>⌄</span>
                </span>
              </button>
              {historyOpen && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 11.5, color: GREY, padding: '10px 6px 4px', direction: 'rtl' }}>
                    {HISTORY_TOP_N} הגדולות מתוך {historyDeals.count} — לא נטען הכל, כדי לא להעמיס בשוטף.
                  </div>
                  {historyDeals.top.map(d => <DealCard key={d.id} deal={d} linkedCount={linkCounts.get(d.order_number) ?? 0} openCountForCustomer={d.customer_number ? openByCustomer.get(d.customer_number)?.count ?? 0 : 0} openSumForCustomer={d.customer_number ? openByCustomer.get(d.customer_number)?.sum ?? 0 : 0} aging={d.customer_number ? agingByCustomer.get(d.customer_number) ?? null : null} />)}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Chip({ label, count, sum, active, color, onClick }: { label: string; count: number; sum: number; active: boolean; color: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '7px 13px', borderRadius: 14,
      border: `1.5px solid ${active ? color : BORDER}`, background: active ? color : '#fff',
      color: active ? '#fff' : '#333', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      <span style={{
        fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: active ? 'rgba(255,255,255,0.9)' : '#777',
      }}>{count} · {ilsCompact(sum)}</span>
    </button>
  )
}

// "נותר לתשלום" — תצוגה בלבד, לא נכתב חזרה ל-DB:
// balance_due מאומת (לא NULL) → מוצג כמו שהוא, בלי תווית "משוער".
// balance_due=NULL → total_price של העסקה עצמה כהערכה: אזהרה חלשה (יתרה
// משוערת) כברירת מחדל, או אזהרה חזקה אם ללקוח (customer_number) יש עוד
// עסקאות פתוחות — כי אז אין דרך לדעת כמה מהיתרה שייך לעסקה הזו בפרט.
function balanceInfo(deal: DealRow, openCountForCustomer: number): { value: number | null; verified: boolean; warnStrong: boolean } {
  if (deal.balance_due != null) return { value: deal.balance_due, verified: true, warnStrong: false }
  if (deal.total_price == null) return { value: null, verified: false, warnStrong: false }
  return { value: deal.total_price, verified: false, warnStrong: openCountForCustomer > 1 }
}

// דגלים מתוך balance_note — מילות מפתח שנכתבות בסקירות הגיול. הצבע שונה
// בכוונה מאזהרת "יתרה משוערת": שם מדובר בחוסר ודאות בחישוב, כאן בפריט
// שממתין להכרעה אנושית.
const NOTE_FLAGS: { kw: string; label: string; bg: string; fg: string; border: string }[] = [
  { kw: 'סתירה',        label: '⚠️ סתירה — בבדיקה',  bg: '#FDE7E9', fg: '#8E1B27', border: '#F0A9B2' },
  { kw: 'מועמד לסגירה', label: '🏁 מועמד לסגירה',     bg: '#E8F0FE', fg: '#1A3E7A', border: '#A9C2F0' },
]
function noteFlags(note: string | null): typeof NOTE_FLAGS {
  if (!note) return []
  return NOTE_FLAGS.filter(f => note.includes(f.kw))
}

// גיל ההזמנה בימים.
// כאן *לא* משתמשים ב-stage_updated_at/created_at: שניהם חותמות של ייבוא ה-DB
// (כל 359 העסקאות יובאו ב-08/2026 ונחתמו יחד), ולכן הם לא מודדים כלום עסקית —
// דגל שמבוסס עליהם יורה על 0 שורות. raw_data.date_serial הוא תאריך ההזמנה
// האמיתי מפריוריטי (סריאל אקסל), וזה הסימן היחיד שמשקף גיל בפועל.
function excelSerialToDate(v: unknown): Date | null {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return null
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000)
}
function orderAgeDays(deal: DealRow): number | null {
  const d = excelSerialToDate(deal.raw_data?.date_serial)
    ?? (deal.stage_updated_at || deal.created_at ? new Date(deal.stage_updated_at || deal.created_at!) : null)
  if (!d || isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}
const STUCK_DAYS = 60
const STUCK_STAGES = [3, 4, 5]

function DealCard({ deal, linkedCount, openCountForCustomer, openSumForCustomer, aging }: {
  deal: DealRow; linkedCount: number; openCountForCustomer: number; openSumForCustomer: number; aging: AgingRow | null
}) {
  const meta = STAGE_META[deal.stage] ?? STAGE_META[1]
  const profitPct = deal.raw_data?.profit_pct
  const tone = profitPct != null ? profitTone(profitPct) : null
  const bal = balanceInfo(deal, openCountForCustomer)
  const flags = noteFlags(deal.balance_note)
  const [noteOpen, setNoteOpen] = useState(false)
  const ageDays = orderAgeDays(deal)
  const stuck = STUCK_STAGES.includes(deal.stage) && ageDays != null && ageDays > STUCK_DAYS
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '12px 14px', marginBottom: 8, direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deal.customer_name || 'לקוח לא ידוע'}
          </div>
          <div style={{ fontSize: 12.5, color: GREY, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{deal.order_number}</div>
        </div>
        {/* המספר הראשי: כשיש balance_due מאומת — הוא הנתון שמעניין ("נותר
            לתשלום"), ו-total_price יורד לשורת משנה. בלי balance_due נשאר
            total_price כראשי, בדיוק כמו קודם. */}
        <div style={{ flexShrink: 0, textAlign: 'left' }}>
          {bal.verified ? (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: GREY, letterSpacing: 0.2 }}>נותר לתשלום</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: bal.value! < 0 ? '#1A5A2A' : '#111', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                {ils(bal.value)}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: GREY, fontVariantNumeric: 'tabular-nums' }}>
                מתוך {ils(deal.total_price)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 17, fontWeight: 900, color: '#111', fontVariantNumeric: 'tabular-nums' }}>{ils(deal.total_price)}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, background: meta.bg, color: meta.fg, borderRadius: 8, padding: '2px 10px' }}>{meta.label}</span>
        {tone && (
          <span style={{ fontSize: 12, fontWeight: 800, background: tone.bg, color: tone.color, borderRadius: 8, padding: '2px 10px' }}>
            רווח {profitPct!.toFixed(0)}%
          </span>
        )}
        {linkedCount > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1A5A2A' }}>🔗 {linkedCount} דפי ביצוע</span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: GREY }}>— אין דף ביצוע</span>
        )}
        {/* דגלי balance_note — לחיצה פותחת את ההערה המלאה */}
        {flags.map(f => (
          <button key={f.kw} type="button" onClick={() => setNoteOpen(o => !o)}
            title={deal.balance_note ?? ''}
            style={{ fontSize: 12, fontWeight: 800, background: f.bg, color: f.fg, border: `1px solid ${f.border}`,
                     borderRadius: 8, padding: '2px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
            {f.label} {noteOpen ? '▴' : '▾'}
          </button>
        ))}
        {/* דגל "סטטוס תקוע" — שלבים 3-5 בלבד */}
        {stuck && (
          <span title={`תאריך ההזמנה בפריוריטי: לפני ${ageDays} ימים. הסטטוס לא עודכן מאז — ייתכן שהעבודה כבר הסתיימה.`}
            style={{ fontSize: 12, fontWeight: 800, background: '#F3EAFB', color: '#5B2E8A', border: '1px solid #CDB2E6', borderRadius: 8, padding: '2px 10px' }}>
            ⏳ ללא שינוי סטטוס {ageDays} ימים
          </span>
        )}
      </div>

      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${BORDER}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#555' }}>נותר לתשלום</span>
          {bal.value != null ? (
            <span style={{ fontSize: 14, fontWeight: 800, color: bal.verified ? '#111' : (bal.warnStrong ? '#B5651D' : '#8A6D00') }}>{ils(bal.value)}</span>
          ) : (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: GREY }}>לא זמין (אין total_price)</span>
          )}
        </div>
        {!bal.verified && bal.value != null && (
          bal.warnStrong ? (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8A4B00', background: '#FFF1DB', border: '1px solid #F0C98C', borderRadius: 6, padding: '4px 8px', marginTop: 6 }}>
              ⚠️ יתרה משוערת — ללקוח זה יש כמה עסקאות פתוחות, לא ניתן לפצל בין הזמנות
              <div style={{ fontWeight: 600, marginTop: 3 }}>
                {aging
                  ? <>הלקוח חייב בסה״כ <b>{ils(aging.aging_total)}</b> (גיול {fmtDate(aging.as_of_date)}), על פני {openCountForCustomer} הזמנות פתוחות בסכום כולל {ils(openSumForCustomer)}</>
                  : <>{openCountForCustomer} הזמנות פתוחות בסכום כולל {ils(openSumForCustomer)} — אין נתון גיול ללקוח זה</>}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8A6D00', marginTop: 3 }}>יתרה משוערת (טרם אומת)</div>
          )
        )}
      </div>
      {/* ההערה המלאה: כשיש דגל היא מוצגת רק בלחיצה עליו (כדי לא להציף את
          הכרטיס), וכשאין דגל היא מוצגת תמיד — ההתנהגות שהייתה קודם. */}
      {deal.balance_note && (flags.length === 0 || noteOpen) && (
        <div style={{ fontSize: 11.5, color: '#7a5b00', background: '#FFF8E6', border: '1px solid #F0D98C', borderRadius: 6, padding: '4px 8px', marginTop: 6, lineHeight: 1.45 }}>
          ⚠️ {deal.balance_note}
        </div>
      )}
    </div>
  )
}
