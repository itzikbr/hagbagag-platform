import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Admin() {
  const { profile } = useAuth()

  if (profile && profile.role !== 'manager') {
    return <Navigate to="/chats" replace />
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 16,
      direction: 'rtl',
    }}>
      <span style={{ fontSize: 56 }}>🔧</span>
      <h2 style={{ color: '#CC0000', margin: 0, fontSize: 22, fontWeight: 700 }}>פאנל ניהול</h2>
      <p style={{ color: '#8696A0', fontSize: 16, margin: 0 }}>בקרוב...</p>
    </div>
  )
}
