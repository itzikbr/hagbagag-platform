import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Avatar from '../components/Avatar'

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
  const profile = useAuth(s => s.profile)

  useEffect(() => {
    if (!userId) return
    loadGroups()

    // Realtime — refresh when a new message arrives in any group
    const channel = supabase
      .channel('chatlist-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, () => {
        loadGroups()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function loadGroups() {
    if (!userId) return
    try {
      // 1. Get group IDs the user belongs to
      const { data: memberOf, error: memberErr } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .is('left_at', null)

      if (memberErr) { console.error(memberErr); return }
      if (!memberOf || memberOf.length === 0) {
        setGroups([])
        setLoading(false)
        return
      }

      const groupIds = memberOf.map(m => m.group_id)

      // 2. Get groups data
      const { data: groupsData, error: groupsErr } = await supabase
        .from('groups')
        .select('id, name, type, avatar_url, updated_at')
        .in('id', groupIds)
        .order('updated_at', { ascending: false })

      if (groupsErr) { console.error(groupsErr); return }

      // 3. Get last message for each group
      const { data: allMessages } = await supabase
        .from('messages')
        .select('group_id, content, sender_name, created_at, message_type')
        .in('group_id', groupIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

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

      const rows: GroupRow[] = (groupsData ?? []).map(g => {
        const lm = lastMsgMap[g.id]
        return {
          id: g.id,
          name: g.name,
          type: g.type as 'direct' | 'group',
          avatar_url: g.avatar_url,
          updated_at: g.updated_at,
          lastMessage: lm?.content ?? 'עדיין אין הודעות',
          lastMessageTime: lm ? formatTime(lm.created_at) : '',
          unreadCount: 0, // TODO: compute unread from message_reads
        }
      })

      setGroups(rows)
    } finally {
      setLoading(false)
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
        <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>חג בגג</span>
        <div style={{ display: 'flex', gap: 8 }}>
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
          <button
            onClick={() => navigate('/contacts')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/>
              <path d="M4 20C4 17 7.6 15 12 15C16.4 15 20 17 20 20" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          {profile?.role === 'manager' && (
            <button
              onClick={() => navigate('/admin')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/>
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round"/>
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

      {/* FAB */}
      <button
        onClick={() => navigate('/new-chat')}
        style={{
          position: 'absolute', bottom: 72, left: 16,
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
