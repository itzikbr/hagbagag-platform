import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Avatar from '../components/Avatar'

interface DBMessage {
  id: string
  group_id: string
  sender_id: string
  content: string
  created_at: string
}

interface DisplayMessage {
  id: string
  senderId: string
  text: string
  timestamp: string
  date: string
}

interface GroupInfo {
  id: string
  name: string
  type: 'direct' | 'group'
}

function toDisplay(msg: DBMessage): DisplayMessage {
  return {
    id: msg.id,
    senderId: msg.sender_id,
    text: msg.content,
    timestamp: new Date(msg.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    date: msg.created_at.slice(0, 10),
  }
}

export default function ChatConversation() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id || !user) return

    loadGroup()
    loadMessages()

    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${id}` },
        (payload) => {
          setMessages(prev => [...prev, toDisplay(payload.new as DBMessage)])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id, user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadGroup() {
    const { data } = await supabase
      .from('groups')
      .select('id, name, type')
      .eq('id', id)
      .single()
    if (data) setGroup(data as GroupInfo)
  }

  async function loadMessages() {
    setLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('id, group_id, sender_id, content, created_at')
      .eq('group_id', id)
      .order('created_at', { ascending: true })
    setMessages((data ?? []).map(toDisplay))
    setLoading(false)
  }

  async function handleSend() {
    if (!text.trim() || !user || !id) return
    const content = text.trim()
    setText('')
    await supabase.from('messages').insert({
      group_id: id,
      sender_id: user.id,
      content,
    })
  }

  const groupedMessages = messages.reduce<{ date: string; msgs: DisplayMessage[] }[]>((acc, msg) => {
    const last = acc[acc.length - 1]
    if (last && last.date === msg.date) {
      last.msgs.push(msg)
    } else {
      acc.push({ date: msg.date, msgs: [msg] })
    }
    return acc
  }, [])

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
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>

        <Avatar name={group?.name ?? '...'} size={40} isGroup={group?.type === 'group'} />

        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>{group?.name ?? '...'}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            {group?.type === 'group' ? 'קבוצה' : 'שיחה ישירה'}
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
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div style={{
              width: 28, height: 28,
              border: '3px solid rgba(255,255,255,0.4)',
              borderTopColor: '#CC0000',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
          </div>
        )}

        {groupedMessages.map(({ date, msgs }) => (
          <div key={date}>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
              <span style={{
                background: 'rgba(255,255,255,0.85)',
                borderRadius: 6,
                padding: '3px 10px',
                fontSize: 12,
                color: '#54656F',
              }}>
                {formatDate(date)}
              </span>
            </div>

            {msgs.map(msg => {
              const isMine = msg.senderId === user?.id
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
                    background: isMine ? '#DCF8C6' : '#fff',
                    borderRadius: isMine ? '12px 12px 0 12px' : '12px 12px 12px 0',
                    padding: '6px 8px 4px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}>
                    <span style={{ fontSize: 14, color: '#111', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {msg.text}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: '#8696A0' }}>{msg.timestamp}</span>
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
        background: '#F0F2F5',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1,
          background: '#fff',
          borderRadius: 20,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="הודעה"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            style={{
              border: 'none',
              outline: 'none',
              fontSize: 15,
              width: '100%',
              direction: 'rtl',
              background: 'none',
              color: '#111',
            }}
          />
        </div>

        <button
          onClick={handleSend}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: '#CC0000',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr === today) return 'היום'
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === yesterday) return 'אתמול'
  return new Date(dateStr).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}
