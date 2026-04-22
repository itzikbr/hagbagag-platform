import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getChatById, getContact, CURRENT_USER_ID } from '../data/mockData'
import { Message } from '../types'
import Avatar from '../components/Avatar'

export default function ChatConversation() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const chat = id ? getChatById(id) : undefined

  const [messages, setMessages] = useState<Message[]>(chat?.messages ?? [])
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!chat) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span>שיחה לא נמצאה</span>
      </div>
    )
  }

  const isGroup = chat.type === 'group'
  const otherParticipantId = !isGroup ? chat.participants.find(p => p !== CURRENT_USER_ID) : undefined
  const contact = otherParticipantId ? getContact(otherParticipantId) : undefined

  const handleSend = () => {
    if (!text.trim()) return
    const newMsg: Message = {
      id: `m${Date.now()}`,
      senderId: CURRENT_USER_ID,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toISOString().slice(0, 10),
      read: false,
      type: 'text',
    }
    setMessages(prev => [...prev, newMsg])
    setText('')

    // Auto-reply from Claude
    if (chat.isAI) {
      setTimeout(() => {
        const reply: Message = {
          id: `m${Date.now() + 1}`,
          senderId: 'claude',
          text: getClaudeReply(text.trim()),
          timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
          date: new Date().toISOString().slice(0, 10),
          read: false,
          type: 'text',
        }
        setMessages(prev => [...prev, reply])
      }, 800)
    }
  }

  // Group messages by date
  const groupedMessages = messages.reduce<{ date: string; msgs: Message[] }[]>((acc, msg) => {
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
        background: chat.isAI ? '#1a0a0a' : '#CC0000',
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

        <Avatar contact={contact} name={chat.name} size={40} isGroup={isGroup} />

        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>{chat.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            {chat.isAI ? 'עוזר דיגיטלי של חג בגג' : isGroup ? `${chat.participants.length} משתתפים` : 'מחובר'}
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
        {groupedMessages.map(({ date, msgs }) => (
          <div key={date}>
            {/* Date separator */}
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
              const isMine = msg.senderId === CURRENT_USER_ID
              const sender = !isMine ? getContact(msg.senderId) : undefined

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
                    background: msg.senderId === 'claude' ? '#1a0a0a' : isMine ? '#DCF8C6' : '#fff',
                    borderRadius: isMine ? '12px 12px 0 12px' : '12px 12px 12px 0',
                    padding: '6px 8px 4px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    position: 'relative',
                    border: msg.senderId === 'claude' ? '1px solid #CC0000' : 'none',
                  }}>
                    {/* Sender name in group */}
                    {isGroup && !isMine && sender && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: sender.avatarColor ?? '#CC0000', marginBottom: 2 }}>
                        {sender.name}
                      </div>
                    )}

                    <span style={{ fontSize: 14, color: msg.senderId === 'claude' ? '#fff' : '#111', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {msg.text}
                    </span>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: '#8696A0' }}>{msg.timestamp}</span>
                      {isMine && (
                        <span style={{ fontSize: 12, color: msg.read ? '#53BDEB' : '#8696A0' }}>✓✓</span>
                      )}
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
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#8696A0" strokeWidth="1.5"/>
            <path d="M8 13C8 13 9.5 15 12 15C14.5 15 16 13 16 13" stroke="#8696A0" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="9" cy="10" r="1" fill="#8696A0"/>
            <circle cx="15" cy="10" r="1" fill="#8696A0"/>
          </svg>
        </button>

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
          onClick={text.trim() ? handleSend : undefined}
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

const claudeReplies = [
  'אני כאן! מה אתה צריך?',
  'בטח, אבדוק את זה.',
  'הבנתי. רגע בודק...',
  'כן, יש לי את המידע. מה תרצה לדעת?',
  'נשמע טוב. איך אפשר לעזור?',
  'בסדר גמור! מה השלב הבא?',
]

function getClaudeReply(input: string): string {
  if (input.includes('שלום') || input.includes('היי')) return 'שלום! במה אוכל לעזור היום?'
  if (input.includes('תודה')) return 'בשמחה! תמיד כאן בשבילך 😊'
  if (input.includes('פרויקט')) return 'לגבי הפרויקט — תוכל לפרט יותר? אשמח לעזור.'
  return claudeReplies[Math.floor(Math.random() * claudeReplies.length)]
}
