import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DBUser } from '../types'
import Avatar from '../components/Avatar'

const ROLE_ORDER = ['admin', 'office', 'field_worker', 'external']

function roleLabel(role: string): string {
  switch (role) {
    case 'admin':       return 'מנהל'
    case 'office':      return 'משרד'
    case 'field_worker': return 'שטח'
    case 'external':    return 'חיצוני'
    default:            return role
  }
}

export default function NewChat() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [contacts, setContacts] = useState<DBUser[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadContacts()
  }, [user?.id])

  async function loadContacts() {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, role, avatar_url, is_active')
      .eq('is_active', true)
      .order('full_name')
    setContacts((data ?? []) as DBUser[])
    setLoading(false)
  }

  async function openDirectChat(contactId: string) {
    if (!user) return
    const myId = user.id

    // Find existing direct group between the two users
    const { data: myGroups } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', myId)
      .is('left_at', null)

    const myGroupIds = myGroups?.map(m => m.group_id) ?? []

    if (myGroupIds.length > 0) {
      const { data: shared } = await supabase
        .from('group_members')
        .select('group_id, groups:group_id(type)')
        .eq('user_id', contactId)
        .in('group_id', myGroupIds)
        .is('left_at', null)

      const directGroup = shared?.find((row: any) => row.groups?.type === 'direct')
      if (directGroup) {
        navigate(`/chat/${directGroup.group_id}`)
        return
      }
    }

    // Create new direct group
    const contactData = contacts.find(c => c.id === contactId)
    const { data: newGroup } = await supabase
      .from('groups')
      .insert({
        name: contactData?.full_name ?? 'שיחה ישירה',
        type: 'direct',
        created_by: myId,
      })
      .select('id')
      .single()

    if (!newGroup) return

    await supabase.from('group_members').insert([
      { group_id: newGroup.id, user_id: myId },
      { group_id: newGroup.id, user_id: contactId },
    ])

    navigate(`/chat/${newGroup.id}`)
  }

  const filtered = contacts.filter(c =>
    c.id !== user?.id &&
    (c.full_name.toLowerCase().includes(search.toLowerCase()) ||
     roleLabel(c.role).includes(search))
  )

  // Group by role in order
  const grouped = ROLE_ORDER.reduce<Record<string, DBUser[]>>((acc, role) => {
    const group = filtered.filter(c => c.role === role)
    if (group.length > 0) acc[role] = group
    return acc
  }, {})

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

        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: '#8696A0' }}>טוען...</div>
        )}

        {/* Grouped contacts */}
        {Object.entries(grouped).map(([role, users]) => (
          <div key={role}>
            <div style={{ padding: '8px 16px 4px', background: '#F0F2F5' }}>
              <span style={{ fontSize: 13, color: '#CC0000', fontWeight: 600 }}>{roleLabel(role)}</span>
            </div>
            {users.map(contact => (
              <div
                key={contact.id}
                onClick={() => openDirectChat(contact.id)}
                style={{
                  display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 14,
                  cursor: 'pointer', borderBottom: '1px solid #F0F2F5',
                }}
              >
                <Avatar name={contact.full_name} size={48} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>{contact.full_name}</div>
                  <div style={{ fontSize: 13, color: '#8696A0' }}>{roleLabel(contact.role)}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
