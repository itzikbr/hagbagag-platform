import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Avatar from '../components/Avatar'

interface ChatDisplayItem {
  id: string
  name: string
  type: 'direct' | 'group'
  lastMessage: string
  lastMessageTime: string
}

export default function ChatList() {
  const [chats, setChats] = useState<ChatDisplayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    loadChats()
  }, [user])

  async function loadChats() {
    setLoading(true)

    const { data: memberships, error } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name, type)')
      .eq('user_id', user!.id)

    if (error || !memberships) {
      setLoading(false)
      return
    }

    const groupIds = memberships.map((m: any) => m.group_id)

    if (groupIds.length === 0) {
      setChats([])
      setLoading(false)
      return
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('group_id, content, created_at')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false })

    const lastMsgMap = new Map<string, { content: string; created_at: string }>()
    for (const msg of messages ?? []) {
      if (!lastMsgMap.has(msg.group_id)) {
        lastMsgMap.set(msg.group_id, msg)
      }
    }

    const items: ChatDisplayItem[] = memberships.map((m: any) => {
      const group = m.groups as { id: string; name: string; type: 'direct' | 'group' }
      const lastMsg = lastMsgMap.get(m.group_id)
      return {
        id: group.id,
        name: group.name,
        type: group.type,
        lastMessage: lastMsg?.content ?? '',
        lastMessageTime: lastMsg ? formatTime(lastMsg.created_at) : '',
      }
    })

    setChats(items)
    setLoading(false)
  }

  const filtered = chats.filter(c =>
    c.name.includes(search) || c.lastMessage.includes(search)
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
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="5" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
              <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
              <circle cx="19" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
            </svg>
          </button>
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
              border: 'none',
              background: 'none',
              outline: 'none',
              fontSize: 15,
              color: '#111',
              width: '100%',
              direction: 'rtl',
            }}
          />
        </div>
      </div>

      {/* Chat list */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }} className="no-scrollbar">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div style={{
              width: 28, height: 28,
              border: '3px solid #F0F2F5',
              borderTopColor: '#CC0000',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8696A0', padding: 32, direction: 'rtl' }}>
            אין שיחות עדיין
          </div>
        ) : (
          filtered.map(chat => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              onClick={() => navigate(`/chat/${chat.id}`)}
            />
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/new-chat')}
        style={{
          position: 'absolute',
          bottom: 72,
          left: 16,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#CC0000',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 10,
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

function ChatListItem({ chat, onClick }: { chat: ChatDisplayItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 16px',
        gap: 12,
        cursor: 'pointer',
        borderBottom: '1px solid #F0F2F5',
        background: '#fff',
        userSelect: 'none',
      }}
    >
      <Avatar name={chat.name} size={50} isGroup={chat.type === 'group'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 16, color: '#111' }}>{chat.name}</span>
          <span style={{ fontSize: 12, color: '#8696A0' }}>{chat.lastMessageTime}</span>
        </div>
        <span style={{
          fontSize: 14,
          color: '#8696A0',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
        }}>
          {chat.lastMessage}
        </span>
      </div>
    </div>
  )
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'אתמול'
  }
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}
