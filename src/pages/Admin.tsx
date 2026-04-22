import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Admin() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  if (profile?.role !== 'manager') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <span style={{ fontSize: 48 }}>🔒</span>
        <span style={{ fontSize: 16, color: '#8696A0' }}>הגישה מוגבלת למנהלים בלבד</span>
        <button onClick={() => navigate('/chats')} style={{ marginTop: 8, background: '#CC0000', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', cursor: 'pointer', fontSize: 15 }}>
          חזרה לשיחות
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: '#CC0000', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={() => navigate('/chats')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 18 }}>פאנל ניהול</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <span style={{ fontSize: 64 }}>🔧</span>
        <h2 style={{ margin: 0, fontSize: 22, color: '#111', fontWeight: 700 }}>ניהול — בקרוב</h2>
        <p style={{ margin: 0, color: '#8696A0', textAlign: 'center', fontSize: 15, lineHeight: 1.6 }}>
          כאן יהיה פאנל ניהול מלא:<br/>
          ניהול משתמשים, קבוצות, הרשאות ודוחות מערכת
        </p>
      </div>
    </div>
  )
}
