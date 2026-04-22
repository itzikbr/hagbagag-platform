import { useNavigate, useLocation } from 'react-router-dom'

interface BottomNavProps {
  activeTab: 'chats' | 'sheets' | 'more'
  onTabChange: (tab: 'chats' | 'sheets' | 'more') => void
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const isChats = location.pathname.startsWith('/chat') || location.pathname === '/chats'
  const isSheets = location.pathname === '/sheets'

  const tabs = [
    {
      id: 'chats' as const,
      label: 'שיחות',
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
            fill={active ? '#CC0000' : '#8696A0'}
          />
        </svg>
      ),
      path: '/chats',
    },
    {
      id: 'sheets' as const,
      label: 'דפי ביצוע',
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke={active ? '#CC0000' : '#8696A0'} strokeWidth="2" fill="none"/>
          <line x1="3" y1="9" x2="21" y2="9" stroke={active ? '#CC0000' : '#8696A0'} strokeWidth="1.5"/>
          <line x1="3" y1="15" x2="21" y2="15" stroke={active ? '#CC0000' : '#8696A0'} strokeWidth="1.5"/>
          <line x1="9" y1="3" x2="9" y2="21" stroke={active ? '#CC0000' : '#8696A0'} strokeWidth="1.5"/>
        </svg>
      ),
      path: '/sheets',
    },
    {
      id: 'more' as const,
      label: 'התראות',
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" fill={active ? '#CC0000' : '#8696A0'}/>
        </svg>
      ),
      path: '/chats',
    },
  ]

  return (
    <div style={{
      height: 56,
      background: '#fff',
      borderTop: '1px solid #E0E0E0',
      display: 'flex',
      flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive = tab.id === 'chats' ? isChats : tab.id === 'sheets' ? isSheets : activeTab === 'more'
        return (
          <button
            key={tab.id}
            onClick={() => {
              onTabChange(tab.id)
              navigate(tab.path)
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {tab.icon(isActive)}
            <span style={{
              fontSize: 10,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#CC0000' : '#8696A0',
            }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
