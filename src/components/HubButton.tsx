import { useState } from 'react'

// ============================================================
// 🌐 Hub — כפתור צף (אדמין) שפותח מסך בחירה: Claude / Gemini.
// claude.ai ו-gemini.google.com חוסמים הטמעה ב-iframe (X-Frame-Options
// DENY/SAMEORIGIN), לכן אי אפשר Webview אמיתי בתוך PWA — כל אפשרות
// נפתחת בכרטיסייה חדשה. ה-overlay עצמו מלא-מסך עם X לחזרה לחגגי.
// ============================================================

const RED = '#CC0000'

const SITES = [
  { id: 'claude', label: 'Claude', url: 'https://claude.ai', emoji: '🟠', tint: '#D97757' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com', emoji: '✨', tint: '#4285F4' },
]

export default function HubButton() {
  const [open, setOpen] = useState(false)

  const openSite = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Hub"
        style={{
          // שמאל-למטה, 120px מהתחתית, קטן (44). z-index גבוה כדי להופיע מעל תוכן
          // בכל המסכים הראשיים (sheets / chats / ⚡ / ✨).
          position: 'fixed', bottom: 120, left: 16, width: 44, height: 44, borderRadius: '50%',
          background: RED, border: 'none', cursor: 'pointer', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="6" cy="6" r="2.4" fill="#fff" />
          <circle cx="12" cy="6" r="2.4" fill="#fff" />
          <circle cx="18" cy="6" r="2.4" fill="#fff" />
          <circle cx="6" cy="12" r="2.4" fill="#fff" />
          <circle cx="12" cy="12" r="2.4" fill="#fff" />
          <circle cx="18" cy="12" r="2.4" fill="#fff" />
          <circle cx="6" cy="18" r="2.4" fill="#fff" />
          <circle cx="12" cy="18" r="2.4" fill="#fff" />
          <circle cx="18" cy="18" r="2.4" fill="#fff" />
        </svg>
      </button>

      {/* Overlay מלא-מסך */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000, background: '#f0ebe4',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* כותרת + X */}
          <div style={{
            background: RED, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{ flex: 1, color: '#fff', fontWeight: 700, fontSize: 18 }}>Hub</div>
            <button
              onClick={() => setOpen(false)}
              aria-label="סגור"
              style={{
                background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
                width: 34, height: 34, borderRadius: '50%', color: '#fff', fontSize: 18, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* אפשרויות */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, padding: 20, overflowY: 'auto' }}>
            {SITES.map(s => (
              <button
                key={s.id}
                onClick={() => openSite(s.url)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, textAlign: 'right',
                  background: '#fff', border: `2px solid ${s.tint}`, borderRadius: 16,
                  padding: '18px 20px', cursor: 'pointer', width: '100%',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              >
                <span style={{ fontSize: 30, lineHeight: 1 }}>{s.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: '#2b2b2b' }}>{s.label}</div>
                  <div style={{ fontSize: 13, color: '#8A8A8A', direction: 'ltr', textAlign: 'right' }}>{s.url.replace('https://', '')}</div>
                </div>
                <span style={{ fontSize: 20, color: s.tint }}>↗</span>
              </button>
            ))}
            <div style={{ fontSize: 12, color: '#9AA0A6', textAlign: 'center', marginTop: 4 }}>
              נפתח בכרטיסייה חדשה — סגור אותה כדי לחזור לחגבגג
            </div>
          </div>
        </div>
      )}
    </>
  )
}
