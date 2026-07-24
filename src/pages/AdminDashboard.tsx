import { useNavigate } from 'react-router-dom'

// ============================================================
// /admin — דשבורד ניהול (איציק בלבד, נשמר ע"י RequireAdmin ב-App).
// כרטיסים: ניהול משתמשים ← /admin/users, קטלוג חומרים ← /admin/materials,
// ניהול קבוצות ← /admin/groups.
// ============================================================
const RED = '#CC0000'
const BG = '#f0ebe4'

const CARDS = [
  { title: 'ניהול משתמשים', subtitle: 'שם, תפקיד, הרשאה, פעיל/לא פעיל, סיסמה', icon: '👥', path: '/admin/users' },
  { title: 'ניהול קטלוג חומרים', subtitle: 'קטגוריות ופריטים, מחירים, ברירות מחדל', icon: '🧱', path: '/admin/materials' },
  { title: 'ניהול קבוצות', subtitle: 'שם קבוצה, הוספת/הסרת משתתפים, מחיקה', icon: '💬', path: '/admin/groups' },
]

export default function AdminDashboard() {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, direction: 'rtl' }}>
      {/* Header */}
      <div style={{ background: RED, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => navigate('/chats')} aria-label="חזרה" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 22, padding: 0, width: 30 }}>‹</button>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>⚙️ ניהול מערכת</span>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }} className="no-scrollbar">
        {CARDS.map(c => (
          <button
            key={c.path}
            onClick={() => navigate(c.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 16, textAlign: 'right', width: '100%',
              background: '#fff', border: '1px solid #e3ded7', borderRadius: 16, padding: '18px 20px',
              cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 34, lineHeight: 1 }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2b2b2b' }}>{c.title}</div>
              <div style={{ fontSize: 13, color: '#8A8A8A', marginTop: 2 }}>{c.subtitle}</div>
            </div>
            <span style={{ fontSize: 22, color: RED }}>‹</span>
          </button>
        ))}
      </div>
    </div>
  )
}
