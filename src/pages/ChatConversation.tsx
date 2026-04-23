import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DBMessage } from '../types'
import Avatar from '../components/Avatar'

interface GroupInfo {
  id: string
  name: string
  type: 'direct' | 'group'
  memberCount: number
}

export default function ChatConversation() {
  const { id: groupId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null)
  const [messages, setMessages] = useState<DBMessage[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load group info + messages + subscribe to realtime
  useEffect(() => {
    if (!groupId || !user) return
    loadGroupAndMessages()

    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `group_id=eq.${groupId}`,
      }, (payload) => {
        setMessages(prev => {
          // Avoid duplicates
          const newMsg = payload.new as DBMessage
          if (prev.some(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [groupId, user?.id])

  async function loadGroupAndMessages() {
    if (!groupId) return
    setLoading(true)
    try {
      // Group info
      const { data: gData } = await supabase
        .from('groups')
        .select('id, name, type')
        .eq('id', groupId)
        .single()

      // Member count
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .is('left_at', null)

      if (gData) {
        setGroupInfo({
          id: gData.id,
          name: gData.name,
          type: gData.type as 'direct' | 'group',
          memberCount: count ?? 0,
        })
      }

      // Messages
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', groupId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(100)

      setMessages((msgs ?? []) as DBMessage[])
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!text.trim() || !groupId || !user || !profile) return
    const content = text.trim()
    setText('')

    const { error } = await supabase.from('messages').insert({
      group_id: groupId,
      sender_id: user.id,
      sender_name: profile.full_name,
      content,
      message_type: 'text',
    })

    if (error) {
      console.error('שגיאה בשליחת הודעה:', error)
      setText(content) // Restore on error
    }
    // Realtime subscription will add the new message automatically
  }

  // Group messages by date
  const grouped = messages.reduce<{ date: string; msgs: DBMessage[] }[]>((acc, msg) => {
    const date = msg.created_at.slice(0, 10)
    const last = acc[acc.length - 1]
    if (last && last.date === date) {
      last.msgs.push(msg)
    } else {
      acc.push({ date, msgs: [msg] })
    }
    return acc
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: '#8696A0' }}>טוען...</span>
      </div>
    )
  }

  if (!groupInfo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <span style={{ color: '#54656F', fontSize: 16 }}>שיחה לא נמצאה</span>
        <button
          onClick={() => navigate('/chats')}
          style={{
            background: '#CC0000', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 24px', fontSize: 15, cursor: 'pointer', fontWeight: 500,
          }}
        >
          חזרה לשיחות
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#ECE5DD' }}>
      {/* Header */}
      <div style={{
        background: '#CC0000',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/chats')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#fff' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>

        <Avatar name={groupInfo.name} size={40} isGroup={groupInfo.type === 'group'} />

        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>{groupInfo.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            {groupInfo.type === 'group'
              ? `${groupInfo.memberCount} משתתפים`
              : 'מחובר'}
          </div>
        </div>

        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="5" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
            <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
            <circle cx="19" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }} className="no-scrollbar">
        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            {/* Date separator */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
              <span style={{
                background: 'rgba(255,255,255,0.85)', borderRadius: 6,
                padding: '3px 10px', fontSize: 12, color: '#54656F',
              }}>
                {formatDate(date)}
              </span>
            </div>

            {msgs.map(msg => {
              const isMine = msg.sender_id === user?.id
              const isAI = msg.message_type === 'ai'
              const isSystem = msg.message_type === 'system'

              if (isSystem) {
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                    <span style={{
                      background: 'rgba(255,255,255,0.85)', borderRadius: 8,
                      padding: '3px 12px', fontSize: 12, color: '#54656F',
                    }}>
                      {msg.content}
                    </span>
                  </div>
                )
              }

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: isMine ? 'flex-end' : 'flex-start',
                    marginBottom: 4,
                  }}
                >
                  <div style={{
                    maxWidth: '75%',
                    background: isAI
                      ? '#EDE7FF'
                      : isMine ? '#DCF8C6' : '#fff',
                    borderRadius: isMine ? '12px 12px 0 12px' : '12px 12px 12px 0',
                    padding: '6px 8px 4px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    border: isAI ? '1px solid #9C27B0' : 'none',
                  }}>
                    {/* Sender name in group (not mine) */}
                    {groupInfo.type === 'group' && !isMine && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: isAI ? '#9C27B0' : '#CC0000', marginBottom: 2 }}>
                        {isAI ? '🤖 ' : ''}{msg.sender_name}
                      </div>
                    )}

                    <span style={{ fontSize: 14, color: '#111', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {msg.content}
                    </span>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: '#8696A0' }}>
                        {new Date(msg.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMine && <span style={{ fontSize: 12, color: '#8696A0' }}>✓✓</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        background: '#F0F2F5', padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#8696A0" strokeWidth="1.5"/>
            <path d="M8 13C8 13 9.5 15 12 15C14.5 15 16 13 16 13" stroke="#8696A0" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="9" cy="10" r="1" fill="#8696A0"/>
            <circle cx="15" cy="10" r="1" fill="#8696A0"/>
          </svg>
        </button>

        <div style={{
          flex: 1, background: '#fff', borderRadius: 20,
          padding: '8px 14px', display: 'flex', alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="הודעה"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            style={{
              border: 'none', outline: 'none', fontSize: 15,
              width: '100%', direction: 'rtl', background: 'none', color: '#111',
            }}
          />
        </div>

        <button
          onClick={text.trim() ? handleSend : undefined}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#CC0000', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {text.trim() ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill="#fff"/>
              <path d="M19 10V12C19 15.87 15.87 19 12 19C8.13 19 5 15.87 5 12V10H3V12C3 16.45 6.16 20.15 10.37 20.86L10 23H14L13.63 20.86C17.84 20.15 21 16.45 21 12V10H19Z" fill="#fff"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr === today) return 'היום'
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === yesterday) return 'אתמול'
  return new Date(dateStr).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}
