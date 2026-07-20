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

type Urgency = 'urgent' | 'warning' | 'info' | 'ok' | 'normal' | 'muted'

interface DigestItem {
  icon: string
  text: string
  subText?: string
  blockId: string        // לניווט לבלוק
  urgency: Urgency
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
  urgency?: Urgency
  hasArrow?: boolean
}

// ── צבעים ──────────────────────────────────────────────────
const URGENCY_COLOR: Record<string, string> = {
  urgent:  '#CC0000',   // אדום דחוף
  warning: '#E8820C',   // כתום אזהרה
  info:    '#2563EB',   // כחול מידע
  ok:      '#16A34A',   // ירוק תקין
  normal:  '#3F4A5A',   // כהה-נייטרלי (פריט רגיל)
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

// ── הפרומפט שנשלח לקלוד (v3 — סידור עבודה + אלכסנדרה/תזרים נכון) ──
const BRIEF_PROMPT = `אתה עוזר של איציק בריסקין. תפקידך: לייצר snapshot קצר ומדויק של המצב הנוכחי.

החזר JSON בלבד, ללא טקסט נוסף, בפורמט הזה בדיוק:
{"lastUpdated":"HH:MM","digest":[{"icon":"...","text":"...","subText":"...","blockId":"...","urgency":"urgent|warning|info|muted"}],"blocks":[{"id":"...","icon":"...","title":"...","badge":"...","badgeColor":"red|orange|green|gray|blue","items":[{"title":"...","subTitle":"...","urgency":"urgent|warning|ok|muted","hasArrow":true}]}]}

מקורות לקרוא — בסדר הזה, כל אחד בקריאה אחת מהירה:

1. Google Calendar — אירועי אתמול (משמעותי?), היום, מחר בלבד. אל תקרא יותר.

2. נוטיון — מסד גביה: שלוף רק רשומות שתאריך הפירעון שלהן הוא עד 7 ימים קדימה או כבר עבר. מיין לפי דחיפות (ימים שעברו × סכום). מקסימום 5 רשומות.

3. נוטיון — משימות: שלוף רק משימות עם סטטוס פתוח/בטיפול שתאריך היעד עבר או הוא היום. מקסימום 3 משימות.

4. Google Drive — סידור עבודה (fileId: 1E5EziPnZZFY1-seq37jc1dt4la7UTSOw), לשונית "סידור עבודה". הקובץ מכיל 1000+ שורות מ-2024 עד העתיד — אל תקרא מההתחלה, קרא רק את 100 השורות האחרונות של הגיליון; שם נמצא השבוע הנוכחי. מצא את השורות שהתאריך שלהן בתוך 3 ימים מהיום = השבוע הנכון. מי עובד היום: שכירים (עמאד, סמיר, עלי, אסף) תמיד עובדים — תא ריק = לא שובץ, תא עם טקסט = זו העבודה שלהם; קבלני משנה — רק מי שרשום עובד; מנופים — רק אם רשום.

5. Google Drive — אלכסנדרה (fileId: 1hGPxoQFFt5pO5aUu2Et6PMvEYZqHCzMi), לשונית ראשית "פועלים 2026". אל תקרא מההתחלה — קרא רק את 50 השורות האחרונות של הלשונית. מבנה: עמודות תאריך, שם, סכום, הערה. עמודת "סכום" = תנועה עתידית/פעילה שטרם ירדה; עמודת "היסטוריה" = ירד בפועל (מסומן ב-✅). שלוף רק שורות שתאריכן בתוך 30 יום קדימה ועד 7 ימים אחורה = רלוונטי עכשיו. אל תקרא שורות מ-2024 או מחודשים רחוקים.

כללי Layer 1 (digest) — מה להכניס:
- גביה: חובות שפגו + חובות שיפגו תוך 7 ימים (לפי סכום × ימים)
- יומן: כל אירוע שאם תפספס — בעיה. אין מכסה.
- שטח: שורה אחת בלבד (למשל "עמאד ← יגור, סמיר ← רחובות" או "צוות יגור — יום 3 מתוך 5"). אל תצרף shetach ל-digest אלא אם יש משהו חריג.
- משימות: רק עבר הדדליין + דחוף במפורש
- תזרים: רק אם יש תנועה גדולה (50K+) שטרם ירדה ותאריכה השבוע. אחרת אל תצרף ל-digest.

בלוקים קבועים (blocks) — תמיד כלול את כולם:
1. id: "gabiya", icon: "💰", title: "גביה דחופה"
2. id: "yoman", icon: "📅", title: "יומן"
3. id: "shetach", icon: "🔨", title: "שטח היום" — items: שכירים (מי עובד + איפה אם רשום), קבלני משנה (רק מי שרשום היום), מנופים (רק אם רשום)
4. id: "mishmot", icon: "✅", title: "משימות"
5. id: "tizreem", icon: "📊", title: "תזרים" — items: סכום שטרם ירד השבוע (כמה + יעדי/עמדות יציאה); סכום שירד השבוע לפי ההיסטוריה (כמה ועם מי); 3 תנועות גדולות קרובות בשם ותאריך. badgeColor לפי דחיפות.

אם מקור לא זמין — המשך בלי להיתקע, רשום "לא זמין" בפריט.`

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
  const [error, setError] = useState(false)             // שגיאה מלאה — אין נתונים להציג
  const [refreshError, setRefreshError] = useState(false) // רענון ברקע נכשל אך מציגים cache ישן
  const [briefData, setBriefData] = useState<BriefData | null>(null)
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({})
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // טעינה מיידית מה-cache בשרת (GET /api/brief-cache) — מוחזר {response, cachedAt} או {}
  const loadCache = async (): Promise<BriefData | null> => {
    try {
      const r = await fetch('/api/brief-cache')
      if (!r.ok) return null
      const d = await r.json()
      return extractJson(String(d.response ?? ''))
    } catch {
      return null
    }
  }

  // hasFallback=true → כבר מוצג cache; כשל רענון לא יחליף למסך שגיאה אלא ישאיר את הישן
  const fetchBrief = async (hasFallback: boolean) => {
    setLoading(true)
    setError(false)
    setRefreshError(false)
    // timeout של 180 שניות — ייצור הבריף נמדד ב-~195ש' (ראה timing בלוגי claude-server),
    // 120ש' הקודמים גרמו ל-abort בדפדפן לפני שהבריף חזר.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 180000)
    try {
      // הקריאה עוברת דרך Caddy: /api/* → claude-server.js (:4000)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: BRIEF_PROMPT,
          noHistory: true,
          userId: 'itzik',
          conversationId: 'lightning-brief',
        }),
      })
      const data = await response.json()
      // חילוץ JSON גם אם יש טקסט לפני/אחרי (מאזן סוגריים, חסין יותר מ-regex)
      const parsed = extractJson(String(data.response ?? ''))
      if (!parsed) throw new Error('no-json')
      setBriefData(parsed)
      // בלוקים נפתחים סגורים כברירת מחדל
      setOpenBlocks({})
    } catch {
      if (hasFallback) setRefreshError(true)  // משאירים את ה-cache המוצג
      else setError(true)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  // בטעינת המסך: הצג מיד מה-cache אם קיים, ואז רענן ברקע.
  // אם אין cache — fetchBrief מציג spinner כרגיל.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cached = await loadCache()
      if (cancelled) return
      if (cached) setBriefData(cached)
      fetchBrief(!!cached)
    })()
    return () => { cancelled = true }
  }, [])

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* כפתור ניהול מערכת → /admin */}
          <button
            onClick={() => navigate('/admin')}
            aria-label="ניהול מערכת"
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, lineHeight: 1,
            }}
          >⚙️</button>

          {/* כפתור רענן עגול — רענון ברקע, משאיר את ה-cache המוצג */}
          <button
            onClick={() => fetchBrief(!!briefData)}
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
        </div>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6 }}>
          {loading ? (briefData ? 'מרענן ברקע…' : 'מרענן…') : `עודכן ${lastUpdated}`}
        </div>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: BG, padding: 16 }} className="no-scrollbar">

        {/* רענון ברקע נכשל — מציגים את ה-cache האחרון */}
        {refreshError && briefData && !loading && (
          <div style={{
            background: '#FCEBD6', color: '#8A4B00', borderRadius: 12,
            padding: '10px 14px', fontSize: 13.5, marginBottom: 12, textAlign: 'center',
          }}>
            הרענון לא הצליח — מציג את הנתונים האחרונים שנשמרו.
          </div>
        )}

        {/* מצב שגיאה */}
        {error && !loading && (
          <div style={{ background: CARD, borderRadius: 16, padding: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>😕</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111', marginBottom: 6 }}>לא הצלחתי לרענן כרגע</div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>נסה שוב בעוד רגע.</div>
            <button
              onClick={() => fetchBrief(false)}
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
            <div style={{ fontSize: 15, color: '#555' }}>מרכז נתונים... (~60 שניות)</div>
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
