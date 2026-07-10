import { useNavigate } from 'react-router-dom'

const RED = '#CC0000'

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function todayInHebrew(): string {
  const d = new Date()
  return `יום ${HEBREW_DAYS[d.getDay()]}, ${d.getDate()} ב${HEBREW_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export default function ItzikDashboard() {
  const navigate = useNavigate()

  const actionBtn = (label: string, onClick: () => void, primary = false) => (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 130,
        background: primary ? RED : '#fff',
        color: primary ? '#fff' : RED,
        border: `1.5px solid ${RED}`,
        borderRadius: 12,
        padding: '12px 16px',
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', direction: 'rtl' }}>
      {/* Header */}
      <div style={{ background: RED, padding: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 22 }}>שלום איציק ☀️</span>
          <button onClick={() => navigate('/chats')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4 }}>
          {todayInHebrew()}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#F0F2F5', padding: 16 }} className="no-scrollbar">

        {/* בריף בוקר */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#111', marginBottom: 12 }}>בריף בוקר</div>
          <div style={{ fontSize: 15, color: '#333', lineHeight: 2 }}>
            <div>📋 סידור עבודה: טוען...</div>
            <div>💰 גביה דחופה: טוען...</div>
            <div>✅ משימות פתוחות: טוען...</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {actionBtn('🔄 רענן', () => {}, true)}
          {actionBtn('💬 דבר עם קלוד', () => {})}
          {actionBtn('📋 גביה', () => {})}
          {actionBtn('✅ משימות', () => {})}
        </div>

      </div>
    </div>
  )
}
