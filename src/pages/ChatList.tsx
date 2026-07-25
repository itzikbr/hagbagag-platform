import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useIsAdmin } from '../hooks/useAuth'
import Avatar from '../components/Avatar'
import { reportClient, errDetail } from '../lib/report'
import { enablePush, refreshPushIfGranted, isPushSupported } from '../lib/pushNotifications'

interface GroupRow {
  id: string
  name: string
  type: 'direct' | 'group'
  avatar_url: string | null
  updated_at: string
  lastMessage?: string
  lastMessageTime?: string
  unreadCount: number
}

export default function ChatList() {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const userId = useAuth(s => s.user?.id)
  const logout = useAuth(s => s.logout)
  const profile = useAuth(s => s.profile)
  const isAdmin = useIsAdmin()
  const [pushPerm, setPushPerm] = useState<NotificationPermission | 'unsupported'>(
    () => (isPushSupported() ? Notification.permission : 'unsupported')
  )

  const aliveRef = useRef(true)
  const loadedOnce = useRef(false)
  const initialDoneRef = useRef(false)

  async function handleEnablePush() {
    if (!userId) return
    const ok = await enablePush(userId)
    setPushPerm(ok ? 'granted' : (isPushSupported() ? Notification.permission : 'unsupported'))
  }

  useEffect(() => {
    if (!userId) return
    aliveRef.current = true
    loadGroups()
    // רענון שקט של מנוי ה-push אם ההרשאה כבר ניתנה (מנויי iOS PWA נאבדים ברקע).
    refreshPushIfGranted(userId)

    // Realtime — refresh when a new message arrives in any group
    const channel = supabase
      .channel(`chatlist-messages-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, () => {
        loadGroups({ background: true })
      })
      .subscribe()

    // רענון בכל חזרה למסך (PWA/טאב/bfcache) — רק אחרי הטעינה הראשונית.
    // בלי זה, טעינה שנתקעה ברקע (iOS) נשארת תקועה על "טוען שיחות..." לנצח.
    const refreshOnReturn = () => {
      if (initialDoneRef.current && document.visibilityState === 'visible') loadGroups({ background: true })
    }
    document.addEventListener('visibilitychange', refreshOnReturn)
    window.addEventListener('focus', refreshOnReturn)
    window.addEventListener('pageshow', refreshOnReturn)

    return () => {
      aliveRef.current = false
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', refreshOnReturn)
      window.removeEventListener('focus', refreshOnReturn)
      window.removeEventListener('pageshow', refreshOnReturn)
    }
  }, [userId])

  // ניסיון בודד לטעינת השיחות, עם timeout. זורק על שגיאה/פג-זמן — כדי שהריטריי יתפוס.
  async function fetchGroupsOnce(timeoutMs: number): Promise<GroupRow[]> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs) })
    try {
      // 1. Get group IDs the user belongs to
      const { data: memberOf, error: memberErr } = await Promise.race([
        supabase.from('group_members').select('group_id').eq('user_id', userId).is('left_at', null),
        timeout,
      ]) as { data: { group_id: string }[] | null; error: { message: string } | null }
      if (memberErr) throw new Error(memberErr.message || 'group_members error')
      if (!memberOf || memberOf.length === 0) return []

      const groupIds = memberOf.map(m => m.group_id)

      // 2–4: קבוצות + הודעות + שמות החברים האחרים — במקביל (סבב אחד במקום שלושה).
      //    שם החבר בשיחת direct נשלף עם embed של users, בלי סבב נוסף.
      const race = <T,>(p: PromiseLike<T>) => Promise.race([p, timeout]) as Promise<T>
      const [gRes, mRes, oRes] = await Promise.all([
        race(supabase.from('groups').select('id, name, type, avatar_url, updated_at').in('id', groupIds).order('updated_at', { ascending: false })),
        race(supabase.from('messages').select('group_id, content, sender_name, created_at, message_type').in('group_id', groupIds).eq('is_deleted', false).order('created_at', { ascending: false })),
        race(supabase.from('group_members').select('group_id, users:user_id(full_name)').in('group_id', groupIds).is('left_at', null).neq('user_id', userId)),
      ]) as [
        { data: Omit<GroupRow, 'lastMessage' | 'lastMessageTime' | 'unreadCount'>[] | null; error: { message: string } | null },
        { data: { group_id: string; content: string | null; created_at: string; message_type: string }[] | null; error: { message: string } | null },
        { data: { group_id: string; users: { full_name: string } | null }[] | null },
      ]
      if (gRes.error) throw new Error(gRes.error.message || 'groups error')
      const groupsData = gRes.data
      const allMessages = mRes.data

      // group_id → שם החבר האחר (embed של users; בשיחת direct יש בדיוק אחד כזה)
      const otherNameMap: Record<string, string> = {}
      for (const m of oRes.data ?? []) {
        if (!otherNameMap[m.group_id] && m.users?.full_name) otherNameMap[m.group_id] = m.users.full_name
      }

      // Build a map: group_id → last message
      const lastMsgMap: Record<string, { content: string; created_at: string }> = {}
      if (allMessages) {
        for (const msg of allMessages) {
          if (!lastMsgMap[msg.group_id]) {
            lastMsgMap[msg.group_id] = {
              content: msg.content ?? (msg.message_type !== 'text' ? `📎 ${msg.message_type}` : ''),
              created_at: msg.created_at,
            }
          }
        }
      }

      return (groupsData ?? []).map(g => {
        const lm = lastMsgMap[g.id]
        return {
          id: g.id,
          // בשיחת direct מציגים את שם החבר האחר (לא את groups.name הסטטי); בקבוצה — השם המשותף.
          name: g.type === 'direct' ? (otherNameMap[g.id] ?? g.name) : g.name,
          type: g.type as 'direct' | 'group',
          avatar_url: g.avatar_url,
          updated_at: g.updated_at,
          lastMessage: lm?.content ?? 'עדיין אין הודעות',
          lastMessageTime: lm ? formatTime(lm.created_at) : '',
          unreadCount: 0, // TODO: compute unread from message_reads
        }
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async function loadGroups({ background = false }: { background?: boolean } = {}) {
    if (!userId) return
    if (!background) setLoading(true)
    try {
      // timeout מדורג כמו ב-ExecutionSheetsList: ניסיון 1 קצר תופס stall של cold-start
      // ב-PWA של iOS והריטריי קופץ מהר; מאוחר יותר ארוך יותר לרשת איטית אמיתית.
      const TIMEOUTS = [4000, 8000, 12000, 12000]
      const t0 = Date.now()
      let rows: GroupRow[] | null = null
      let lastErr: unknown = null
      let usedAttempts = 0
      for (let attempt = 0; attempt < TIMEOUTS.length; attempt++) {
        usedAttempts = attempt + 1
        try { rows = await fetchGroupsOnce(TIMEOUTS[attempt]); lastErr = null; break }
        catch (e) {
          lastErr = e
          console.warn(`[chatlist] attempt ${attempt + 1} failed:`, e)
          if (attempt < TIMEOUTS.length - 1) await new Promise(r => setTimeout(r, 250))
        }
      }
      if (!aliveRef.current) return

      if (lastErr) {
        console.error('[chatlist] loadGroups failed after retries:', lastErr)
        reportClient({ where: 'chatlist-load-failed', online: navigator.onLine, background, ...errDetail(lastErr) })
      } else if (rows) {
        if (!background) reportClient({ where: 'chatlist-load-ok', ms: Date.now() - t0, attempts: usedAttempts, online: navigator.onLine })
        setGroups(rows)
        loadedOnce.current = true
      }
    } finally {
      // תמיד מכבים את הספינר בסיום ניסיון foreground — כדי שלא נתקע לנצח על "טוען שיחות...".
      if (aliveRef.current && !background) { setLoading(false); initialDoneRef.current = true }
    }
  }

  const filtered = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    (g.lastMessage ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        background: '#CC0000',
        padding: '12px 16px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={async () => { await logout(); navigate('/login', { replace: true }) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            title="יציאה"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round"/><polyline points="16 17 21 12 16 7" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="21" y1="12" x2="9" y2="12" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
          {pushPerm === 'default' && (
            <button
              onClick={handleEnablePush}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              title="הפעל התראות"
              aria-label="הפעל התראות"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2Z" fill="rgba(255,255,255,0.85)"/></svg>
            </button>
          )}
          {profile?.full_name && (
            <div
              title={profile.full_name}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.85)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Avatar name={profile.full_name} size={30} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>חג בגג</span>
          {profile?.full_name && (
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 400 }}>
              {profile.full_name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button
              onClick={() => navigate('/new-chat')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="rgba(255,255,255,0.8)"/>
                <line x1="8" y1="10" x2="16" y2="10" stroke="#CC0000" strokeWidth="1.5"/>
                <line x1="12" y1="6" x2="12" y2="14" stroke="#CC0000" strokeWidth="1.5"/>
              </svg>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => navigate('/contacts')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/>
                <path d="M4 20C4 17 7.6 15 12 15C16.4 15 20 17 20 20" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              aria-label="ניהול מערכת"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="#ffffff" strokeWidth="2"/>
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ background: '#fff', padding: '6px 12px', flexShrink: 0 }}>
        <div style={{
          background: '#F0F2F5',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          gap: 8,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="#8696A0" strokeWidth="2"/>
            <path d="M21 21L16.65 16.65" stroke="#8696A0" strokeWidth="2"/>
          </svg>
          <input
            type="text"
            placeholder="חיפוש"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none', background: 'none', outline: 'none',
              fontSize: 15, color: '#111', width: '100%', direction: 'rtl',
            }}
          />
        </div>
      </div>

      {/* Group list */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }} className="no-scrollbar">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: '#8696A0' }}>
            טוען שיחות...
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#8696A0' }}>
            אין שיחות עדיין. לחץ + כדי ליצור קבוצה.
          </div>
        )}
        {filtered.map(group => (
          <GroupItem
            key={group.id}
            group={group}
            onClick={() => navigate(`/chat/${group.id}`)}
          />
        ))}
      </div>

      {/* FAB — יצירת שיחה חדשה (אדמין בלבד; משתמשים רגילים משתתפים בשיחות קיימות) */}
      {isAdmin && (
        <button
          onClick={() => navigate('/new-chat')}
          style={{
            position: 'fixed', bottom: 72, left: 16,
            width: 56, height: 56, borderRadius: '50%',
            background: '#CC0000', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#fff"/>
            <line x1="8" y1="10" x2="16" y2="10" stroke="#CC0000" strokeWidth="2"/>
            <line x1="12" y1="6" x2="12" y2="14" stroke="#CC0000" strokeWidth="2"/>
          </svg>
        </button>
      )}
    </div>
  )
}

function GroupItem({ group, onClick }: { group: GroupRow; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', padding: '10px 16px',
        gap: 12, cursor: 'pointer', borderBottom: '1px solid #F0F2F5',
        background: '#fff', userSelect: 'none',
      }}
    >
      <Avatar name={group.name} size={50} isGroup={group.type === 'group'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 16, color: '#111' }}>{group.name}</span>
          <span style={{ fontSize: 12, color: group.unreadCount > 0 ? '#CC0000' : '#8696A0' }}>
            {group.lastMessageTime}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 14, color: '#8696A0',
            overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', maxWidth: '200px',
          }}>
            {group.lastMessage}
          </span>
          {group.unreadCount > 0 && (
            <div style={{
              minWidth: 20, height: 20, borderRadius: 10,
              background: '#CC0000', display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 6px',
            }}>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{group.unreadCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) {
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}
