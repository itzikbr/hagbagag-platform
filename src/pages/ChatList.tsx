import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chats } from '../data/mockData'
import { Chat } from '../types'
import Avatar from '../components/Avatar'
import { getContact } from '../data/mockData'

export default function ChatList() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const filtered = chats.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.lastMessage.toLowerCase().includes(search.toLowerCase())
  )

  const pinned = filtered.filter(c => c.isPinned)
  const rest = filtered.filter(c => !c.isPinned)

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
        {/* Pinned */}
        {pinned.map(chat => (
          <ChatItem key={chat.id} chat={chat} onClick={() => navigate(`/chat/${chat.id}`)} />
        ))}

        {/* Divider */}
        {pinned.length > 0 && rest.length > 0 && (
          <div style={{ padding: '4px 16px', background: '#F0F2F5' }}>
            <span style={{ fontSize: 12, color: '#8696A0' }}>שיחות</span>
          </div>
        )}

        {/* Rest */}
        {rest.map(chat => (
          <ChatItem key={chat.id} chat={chat} onClick={() => navigate(`/chat/${chat.id}`)} />
        ))}
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

function ChatItem({ chat, onClick }: { chat: Chat; onClick: () => void }) {
  const isGroup = chat.type === 'group'
  const otherParticipantId = !isGroup ? chat.participants.find(id => id !== 'itzik') : undefined
  const contact = otherParticipantId ? getContact(otherParticipantId) : undefined

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
        background: chat.isAI ? '#FFF5F5' : '#fff',
        userSelect: 'none',
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative' }}>
        <Avatar
          contact={contact}
          name={chat.name}
          size={50}
          isGroup={isGroup}
        />
        {chat.isPinned && (
          <div style={{
            position: 'absolute',
            bottom: -2,
            left: -2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#1a0a0a',
            border: '1px solid #CC0000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff',
          }}>
            <span style={{ fontSize: 8, color: '#CC0000' }}>✦</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 16, color: '#111' }}>{chat.name}</span>
          <span style={{ fontSize: 12, color: chat.unreadCount > 0 ? '#CC0000' : '#8696A0' }}>
            {chat.lastMessageTime}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 14,
            color: '#8696A0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '200px',
          }}>
            {chat.lastMessage}
          </span>
          {chat.unreadCount > 0 && (
            <div style={{
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              background: '#CC0000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 6px',
            }}>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{chat.unreadCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
