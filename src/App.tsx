import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth, useIsAdmin } from './hooks/useAuth'
import { runningBundle, deployedBundle } from './lib/appVersion'
import Login from './pages/Login'
import IosInstallBanner from './components/IosInstallBanner'
import ChatList from './pages/ChatList'
import ChatConversation from './pages/ChatConversation'
import NewChat from './pages/NewChat'
import NewGroup from './pages/NewGroup'
import ExecutionSheetsList from './pages/ExecutionSheetsList'
import NewExecutionSheet from './pages/NewExecutionSheet'
import ExecutionSheetView from './pages/ExecutionSheetView'
import SheetsFeed from './pages/SheetsFeed'
import Contacts from './pages/Contacts'
import Admin from './pages/Admin'
import AdminDashboard from './pages/AdminDashboard'
import LightningScreen from './pages/LightningScreen'
import GeminiChat from './pages/GeminiChat'
import MaterialsAdmin from './pages/MaterialsAdmin'
import GroupsAdmin from './pages/GroupsAdmin'
import BottomNav from './components/BottomNav'
import HubButton from './components/HubButton'
import ErrorBoundary from './components/ErrorBoundary'

function Splash() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#CC0000', gap: 16 }}>
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

// גישת אדמין נקבעת לפי האימייל של המשתמש המחובר. מי שאינו אדמין
// מנותב חזרה לדפי הביצוע — המסך היחיד שפתוח בפניו.
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { initialized } = useAuth()
  const isAdmin = useIsAdmin()
  if (!initialized) return <Splash />
  if (!isAdmin) return <Navigate to="/sheets" replace />
  return <>{children}</>
}

function PlatformLayout() {
  const [activeTab, setActiveTab] = useState<'chats' | 'sheets' | 'more' | 'itzik' | 'gemini'>('chats')
  const location = useLocation()
  const isAdmin = useIsAdmin()
  // הניווט התחתון מוצג לכל המשתמשים (שיחות + דפי ביצוע). מוסתר רק במסכי-משנה
  // מלאים (שיחה בודדת, עורך דף, מסכי אדמין) שיש להם כותרת/חזרה משלהם.
  const hideNav = location.pathname.startsWith('/chat/') ||
                  location.pathname === '/new-chat' ||
                  location.pathname === '/new-group' ||
                  location.pathname === '/contacts' ||
                  location.pathname.startsWith('/sheets/') ||
                  location.pathname.startsWith('/admin')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <ErrorBoundary name="platform">
        <Routes>
          <Route path="/"          element={<Navigate to="/sheets" replace />} />
          {/* דפי ביצוע — פתוח לכל משתמש מחובר */}
          <Route path="/sheets"     element={<ExecutionSheetsList />} />
          <Route path="/sheets/new" element={<NewExecutionSheet />} />
          <Route path="/sheets/feed" element={<SheetsFeed />} />
          <Route path="/sheets/:id/view" element={<ExecutionSheetView />} />
          <Route path="/sheets/:id" element={<NewExecutionSheet />} />
          {/* שיחות — פתוח לכל משתמש מחובר (RLS מבוסס-חברות קובע מה נראה) */}
          <Route path="/chats"     element={<ChatList />} />
          <Route path="/chat/:id"  element={<ChatConversation />} />
          {/* יצירת שיחות/קבוצות/אנשי קשר + ניהול — אדמין בלבד */}
          <Route path="/new-chat"  element={<RequireAdmin><NewChat /></RequireAdmin>} />
          <Route path="/new-group" element={<RequireAdmin><NewGroup /></RequireAdmin>} />
          <Route path="/contacts"  element={<RequireAdmin><Contacts /></RequireAdmin>} />
          <Route path="/admin"          element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          <Route path="/admin/users"     element={<RequireAdmin><Admin /></RequireAdmin>} />
          <Route path="/admin/materials" element={<RequireAdmin><MaterialsAdmin /></RequireAdmin>} />
          <Route path="/admin/groups"    element={<RequireAdmin><GroupsAdmin /></RequireAdmin>} />
          <Route path="/itzik"     element={<RequireAdmin><LightningScreen /></RequireAdmin>} />
          <Route path="/gemini"    element={<RequireAdmin><GeminiChat /></RequireAdmin>} />
          <Route path="*"          element={<Navigate to="/sheets" replace />} />
        </Routes>
        </ErrorBoundary>
      </div>
      {!hideNav && <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />}
      {isAdmin && location.pathname === '/gemini' && <HubButton />}
    </div>
  )
}

export default function App() {
  const initialize = useAuth(s => s.initialize)
  const [updateReady, setUpdateReady] = useState(false)
  useEffect(() => { initialize() }, [initialize])

  // גרסה חדשה זמינה → באנר רענון. בודקים כל דקה + בכל חזרה לפוקוס (תופס PWA
  // שחוזר מרקע), ומשווים את הבנדל הרץ מול הפרוס. לא מרעננים בכפייה כדי לא לאבד
  // עריכה באמצע — המשתמש מקיש לרענון.
  useEffect(() => {
    const current = runningBundle()
    if (!current) return
    let stopped = false
    const check = async () => {
      if (stopped || updateReady || document.visibilityState !== 'visible') return
      const dep = await deployedBundle()
      if (!stopped && dep && dep !== current) setUpdateReady(true)
    }
    const iv = setInterval(check, 60000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    check()
    return () => {
      stopped = true
      clearInterval(iv)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [updateReady])

  return (
    <>
      {updateReady && (
        <button
          onClick={() => window.location.reload()}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 6000,
            background: '#CC0000', color: '#fff', border: 'none', cursor: 'pointer',
            padding: '10px 14px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            direction: 'rtl', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          🔄 גרסה חדשה זמינה — הקש לרענון
        </button>
      )}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<RequireAuth><PlatformLayout /></RequireAuth>} />
      </Routes>
      <IosInstallBanner />
    </>
  )
}
