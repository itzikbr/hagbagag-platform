import { useNavigate } from 'react-router-dom'
import { contacts, getContact } from '../data/mockData'
import { Contact, UserRole } from '../types'
import Avatar from '../components/Avatar'
import { useState } from 'react'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'מנהל',
  office: 'משרד',
  field: 'שטח',
  external: 'חיצוני',
}

const ROLE_ORDER: UserRole[] = ['admin', 'office', 'field', 'external']

export default function NewChat() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const claude = getContact('claude')!
  const others = contacts.filter(c => c.id !== 'itzik' && c.id !== 'claude')

  const filtered = others.filter(c =>
    c.name.includes(search) || ROLE_LABELS[c.role].includes(search)
  )

  const grouped = ROLE_ORDER.reduce<Record<UserRole, Contact[]>>((acc, role) => {
    acc[role] = filtered.filter(c => c.role === role)
    return acc
  }, { admin: [], office: [], field: [], external: [] })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {/* Header */}
      <div style={{ background: '#CC0000', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate('/chats')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 18 }}>שיחה חדשה</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>בחר איש קשר</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px solid #F0F2F5' }}>
        <div style={{
          background: '#F0F2F5', borderRadius: 8,
          display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8,
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
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: 15, width: '100%', direction: 'rtl' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }} className="no-scrollbar">
        {/* New group */}
        <div
          onClick={() => navigate('/new-group')}
          style={{
            display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 14,
            cursor: 'pointer', borderBottom: '1px solid #F0F2F5',
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: '#CC0000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M16 11C17.66 11 18.99 9.66 18.99 8C18.99 6.34 17.66 5 16 5C14.34 5 13 6.34 13 8C13 9.66 14.34 11 16 11ZM8 11C9.66 11 10.99 9.66 10.99 8C10.99 6.34 9.66 5 8 5C6.34 5 5 6.34 5 8C5 9.66 6.34 11 8 11ZM8 13C5.67 13 1 14.17 1 16.5V19H15V16.5C15 14.17 10.33 13 8 13ZM16 13C15.71 13 15.38 13.02 15.03 13.05C16.19 13.89 17 15.02 17 16.5V19H23V16.5C23 14.17 18.33 13 16 13Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>קבוצה חדשה</span>
        </div>

        {/* Claude */}
        <ContactRow contact={claude} onClick={() => navigate('/chat/claude')} />

        {/* Grouped contacts */}
        {ROLE_ORDER.map(role => {
          const group = grouped[role]
          if (group.length === 0) return null
          return (
            <div key={role}>
              <div style={{ padding: '8px 16px 4px', background: '#F0F2F5' }}>
                <span style={{ fontSize: 13, color: '#CC0000', fontWeight: 600 }}>{ROLE_LABELS[role]}</span>
              </div>
              {group.map(contact => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  onClick={() => navigate(`/chat/${contact.id}`)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ContactRow({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 14,
        cursor: 'pointer', borderBottom: '1px solid #F0F2F5',
      }}
    >
      <Avatar contact={contact} size={48} />
      <div>
        <div style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>{contact.name}</div>
        <div style={{ fontSize: 13, color: '#8696A0' }}>{ROLE_LABELS[contact.role]}</div>
      </div>
    </div>
  )
}
