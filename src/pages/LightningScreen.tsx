import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ============================================================
// ⚡ Lightning Tab — מסך אישי של איציק
// snapshot חי מכל המקורות (נוטיון + Drive + יומן) דרך claude-server
// ============================================================

const BG = '#f0ebe4'      // קרם חם
const RED = '#CC0000'
const CARD = '#ffffff'

// ── טיפוסים ────────────────────────────────────────────────
interface BriefData {
  lastUpdated: string
  digest: DigestItem[]   // Layer 1
  blocks: Block[]        // Layer 2
}

interface DigestItem {
  icon: string
  text: string
  subText?: string
  blockId: string        // לניווט לבלוק
  urgency: 'urgent' | 'warning' | 'info' | 'muted'
}

interface Block {
  id: string
  icon: string
  title: string
  badge: string
  badgeColor: 'red' | 'orange' | 'green' | 'gray' | 'blue'
  items: BlockItem[]
  isFuture?: boolean
}

interface BlockItem {
  title: string
  subTitle?: string
  urgency?: 'urgent' | 'warning' | 'ok' | 'muted'
  hasArrow?: boolean
}

// ── צבעים ──────────────────────────────────────────────────
const URGENCY_COLOR: Record<string, string> = {
  urgent:  '#CC0000',   // אדום דחוף
  warning: '#E8820C',   // כתום אזהרה
  info:    '#2563EB',   // כחול מידע
  ok:      '#16A34A',   // ירוק תקין
  muted:   '#9AA0A6',   // אפור לא פעיל
}

const BADGE_COLOR: Record<Block['badgeColor'], { bg: string; fg: string }> = {
  red:    { bg: '#FDE7E7', fg: '#CC0000' },
  orange: { bg: '#FCEBD6', fg: '#C56A00' },
  green:  { bg: '#E4F5E9', fg: '#16A34A' },
  gray:   { bg: '#ECECEC', fg: '#6B7075' },
  blue:   { bg: '#E4ECFB', fg: '#2563EB' },
}

// ── בלוקים עתידיים (placeholder בלבד) ──────────────────────
const FUTURE_BLOCKS: Block[] = [
  { id: 'bank',     icon: '🏦', title: 'בנק',      badge: 'בקרוב', badgeColor: 'gray', items: [], isFuture: true },
  { id: 'priority', icon: '📊', title: 'פריוריטי', badge: 'בקרוב', badgeColor: 'gray', items: [], isFuture: true },
  { id: 'pension',  icon: '💼', title: 'פנסיה',    badge: 'בקרוב', badgeColor: 'gray', items: [], isFuture: true },
]

// ── הפרומפט שנשלח לקלוד ────────────────────────────────────
const BRIEF_PROMPT = `אתה עוזר של איציק בריסקין. תפקידך עכשיו: לייצר snapshot מהיר של המצב הנוכחי.

קרא את המקורות הבאים ובנה תשובה בפורמט JSON בלבד (ללא טקסט נוסף):

1. נוטיון — מסד גביה: שלוף חובות שתאריך פירעונם עבר או קרוב (עד 7 ימים)
2. נוטיון — משימות פתוחות: שלוף משימות דחופות או שעבר דדליין שלהן
3. Google Calendar — אירועים: אתמול (משמעותי?), היום, מחר
4. Google Drive — סידור עבודה (fileId: 14UteHhz5ofMLqPGNU5i8dR-TSiDt0lEt): מי עובד היום
5. Google Drive — אלכסנדרה (fileId: 1hGPxoQFFt5pO5aUu2Et6PMvEYZqHCzMi): תנועות גדולות השבוע

כללי סינון:
- גביה: העלה רק חובות שפגו + חובות שיפגו תוך 7 ימים. מיין לפי (סכום × ימים)
- יומן: העלה כל אירוע שאם איציק יפספס — בעיה. אין מכסה.
- שטח: שורת סיכום אחת בלבד
- משימות: רק דחופות + עבר דדליין
- תזרים: רק אם יש תנועה גדולה שאמורה לצאת ועוד לא יצאה

החזר JSON בפורמט הזה בדיוק:
{
  "lastUpdated": "HH:MM",
  "digest": [
    {"icon": "💰", "text": "...", "subText": "...", "blockId": "gabiya", "urgency": "urgent"}
  ],
  "blocks": [
    {
      "id": "gabiya",
      "icon": "💰",
      "title": "גביה דחופה",
      "badge": "3 ממתינים",
      "badgeColor": "red",
      "items": [
        {"title": "...", "subTitle": "...", "urgency": "urgent", "hasArrow": true}
      ]
    }
  ]
}`

// ── חילוץ JSON מתוך טקסט (claude עלול לעטוף בטקסט/```json) ──
function extractJson(raw: string): BriefData | null {
  if (!raw) return null
  const start = raw.indexOf('{')
  if (start === -1) return null
  // מוצא את הסוגר התואם ל-{ הראשון, תוך התעלמות ממחרוזות
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inStr) {
      if (esc) { esc = false }
      else if (ch === '\\') { esc = true }
      else if (ch === '"') { inStr = false }
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1)) as BriefData
        } catch {
          return null
        }
      }
    }
  }
  return null
}

// ── שעה נוכחית HH:MM (fallback ל-lastUpdated) ──────────────
function nowHHMM(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function LightningScreen() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [briefData, setBriefData] = useState<BriefData | null>(null)
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({})
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const fetchBrief = async () => {
    setLoading(true)
    setError(false)
    try {
      // הקריאה עוברת דרך Caddy: /api/* → claude-server.js (:4000)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: BRIEF_PROMPT,
          noHistory: true,
          userId: 'itzik',
          conversationId: 'lightning-brief',
        }),
      })
      const data = await response.json()
      const parsed = extractJson(String(data.response ?? ''))
      if (!parsed) throw new Error('no-json')
      setBriefData(parsed)
      // בלוקים נפתחים סגורים כברירת מחדל
      setOpenBlocks({})
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  // רענון ראשוני בטעינת המסך
  useEffect(() => { fetchBrief() }, [])

  // לחיצה על שורת digest → פותח את הבלוק וגולל אליו
  const goToBlock = (blockId: string) => {
    setOpenBlocks(prev => ({ ...prev, [blockId]: true }))
    // ממתין ל-render של הבלוק הפתוח לפני הגלילה
    setTimeout(() => {
      blockRefs.current[blockId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const toggleBlock = (blockId: string) => {
    setOpenBlocks(prev => ({ ...prev, [blockId]: !prev[blockId] }))
  }

  const activeBlocks = briefData?.blocks ?? []
  const allBlocks = [...activeBlocks, ...FUTURE_BLOCKS]
  const digest = briefData?.digest ?? []
  const lastUpdated = briefData?.lastUpdated || nowHHMM()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', direction: 'rtl' }}>
      {/* ── Header ── */}
      <div style={{ background: RED, padding: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => navigate('/chats')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              aria-label="חזרה"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 21 }}>⚡ שלום איציק</span>
          </div>

          {/* כפתור רענן עגול */}
          <button
            onClick={fetchBrief}
            disabled={loading}
            aria-label="רענן"
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)', border: 'none',
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg
              width="22" height="22" viewBox="0 0 24 24" fill="none"
              style={loading ? { animation: 'spin 0.8s linear infinite' } : undefined}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M21 3v6h-6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6 }}>
          {loading ? 'מרענן…' : `עודכן ${lastUpdated}`}
        </div>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: BG, padding: 16 }} className="no-scrollbar">

        {/* מצב שגיאה */}
        {error && !loading && (
          <div style={{ background: CARD, borderRadius: 16, padding: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>😕</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111', marginBottom: 6 }}>לא הצלחתי לרענן כרגע</div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>נסה שוב בעוד רגע.</div>
            <button
              onClick={fetchBrief}
              style={{
                background: RED, color: '#fff', border: 'none', borderRadius: 12,
                padding: '11px 26px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              נסה שוב
            </button>
          </div>
        )}

        {/* טעינה ראשונית (עדיין אין נתונים) */}
        {loading && !briefData && !error && (
          <div style={{ background: CARD, borderRadius: 16, padding: 28, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <div style={{ width: 34, height: 34, margin: '0 auto 14px', border: '3px solid #eee', borderTopColor: RED, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: 15, color: '#555' }}>אוסף את התמונה מכל המקורות…</div>
          </div>
        )}

        {/* Layer 1 — מה שחשוב עכשיו */}
        {briefData && !error && digest.length > 0 && (
          <div style={{ background: CARD, borderRadius: 16, padding: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111', padding: '8px 10px 4px' }}>מה שחשוב עכשיו</div>
            {digest.map((d, i) => (
              <button
                key={i}
                onClick={() => goToBlock(d.blockId)}
                style={{
                  width: '100%', textAlign: 'right', background: 'none', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px', borderTop: i === 0 ? 'none' : '1px solid #f2efe9',
                }}
              >
                <span style={{ fontSize: 20, lineHeight: '22px', flexShrink: 0 }}>{d.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: URGENCY_COLOR[d.urgency] || '#111', lineHeight: 1.35 }}>
                    {d.text}
                  </span>
                  {d.subText && (
                    <span style={{ display: 'block', fontSize: 13, color: '#777', marginTop: 2 }}>{d.subText}</span>
                  )}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 3 }}>
                  <path d="M15 6L9 12L15 18" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* מצב ריק — אין digest אבל הבקשה הצליחה */}
        {briefData && !error && digest.length === 0 && (
          <div style={{ background: CARD, borderRadius: 16, padding: 22, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>הכל רגוע כרגע</div>
            <div style={{ fontSize: 14, color: '#777', marginTop: 4 }}>אין דברים דחופים שדורשים תשומת לב.</div>
          </div>
        )}

        {/* Layer 2 — בלוקים */}
        {(briefData || (!loading && !error)) && allBlocks.map(block => {
          const isOpen = !!openBlocks[block.id]
          const badge = BADGE_COLOR[block.badgeColor] || BADGE_COLOR.gray
          const future = block.isFuture
          return (
            <div
              key={block.id}
              ref={el => { blockRefs.current[block.id] = el }}
              style={{
                background: CARD, borderRadius: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
                marginBottom: 12, overflow: 'hidden', opacity: future ? 0.6 : 1,
              }}
            >
              <button
                onClick={() => { if (!future) toggleBlock(block.id) }}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: future ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{block.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#111', flex: 1, textAlign: 'right' }}>{block.title}</span>
                <span style={{
                  background: badge.bg, color: badge.fg, fontSize: 12.5, fontWeight: 700,
                  padding: '4px 10px', borderRadius: 999, flexShrink: 0,
                }}>
                  {block.badge}
                </span>
                {!future && (
                  <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none"
                    style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                  >
                    <path d="M6 9L12 15L18 9" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {future && (
                <div style={{ padding: '0 16px 14px', fontSize: 13.5, color: '#999' }}>
                  בקרוב — יחובר בשלב הבא.
                </div>
              )}

              {!future && isOpen && (
                <div style={{ padding: '0 12px 8px' }}>
                  {block.items.length === 0 && (
                    <div style={{ padding: '4px 6px 12px', fontSize: 14, color: '#999' }}>אין פריטים.</div>
                  )}
                  {block.items.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => { /* Layer 3 — מסך פרטים בעתיד (placeholder) */ }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 6px',
                        borderTop: idx === 0 ? 'none' : '1px solid #f2efe9',
                      }}
                    >
                      {item.urgency && (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: URGENCY_COLOR[item.urgency] || URGENCY_COLOR.muted,
                        }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#111', lineHeight: 1.35 }}>{item.title}</div>
                        {item.subTitle && (
                          <div style={{ fontSize: 13, color: '#777', marginTop: 2 }}>{item.subTitle}</div>
                        )}
                      </div>
                      {item.hasArrow && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M15 6L9 12L15 18" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}
