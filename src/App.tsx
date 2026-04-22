import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import IosInstallBanner from './components/IosInstallBanner'
import ChatList from './pages/ChatList'
import ChatConversation from './pages/ChatConversation'
import NewChat from './pages/NewChat'
import NewGroup from './pages/NewGroup'
import SheetsPlaceholder from './pages/SheetsPlaceholder'
import Contacts from './pages/Contacts'
import Admin from './pages/Admin'
import BottomNav from './components/BottomNav'

function Splash() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#CC0000', gap: 16 }}>
      <span style={{ fontSize: 60 }}>🏠</span>
      <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 700, margin: 0 }}>חג בגג</h1>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginTop: 8 }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuth()
  const location = useLocation()
  if (!initialized) return <Splash />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

function PlatformLayout() {
  const [activeTab, setActiveTab] = useState<'chats' | 'sheets' | 'more'>('chats')
  const location = useLocation()
  const hideNav = location.pathname.startsWith('/chat/') ||
                  location.pathname === '/new-chat' ||
                  location.pathname === '/new-group' ||
                  location.pathname === '/contacts' ||
                  location.pathname === '/admin'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <Routes>
          <Route path="/"          element={<Navigate to="/chats" replace />} />
          <Route path="/chats"     element={<ChatList />} />
          <Route path="/chat/:id"  element={<ChatConversation />} />
          <Route path="/new-chat"  element={<NewChat />} />
          <Route path="/new-group" element={<NewGroup />} />
          <Route path="/sheets"    element={<SheetsPlaceholder />} />
          <Route path="/contacts"  element={<Contacts />} />
          <Route path="/admin"     element={<Admin />} />
          <Route path="*"          element={<Navigate to="/chats" replace />} />
        </Routes>
      </div>
      {!hideNav && <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />}
    </div>
  )
}

export default function App() {
  const initialize = useAuth(s => s.initialize)
  useEffect(() => { initialize() }, [initialize])
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<RequireAuth><PlatformLayout /></RequireAuth>} />
      </Routes>
      <IosInstallBanner />
    </>
  )
}
