import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DBUser } from '../types'
import Avatar from '../components/Avatar'

export default function Contacts() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [contacts, setContacts] = useState<DBUser[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadContacts() }, [user?.id])

  async function loadContacts() {
    const { data } = await supabase.from('users')
      .select('id, full_name, role, avatar_url, is_active')
      .eq('is_active', true).order('full_name')
    setContacts((data ?? []) as DBUser[])
    setLoading(false)
  }

  async function openDirectChat(contactId: string) {
    if (!user) return
    const myId = user.id
    const { data: myGroups } = await supabase.from('group_members')
      .select('group_id').eq('user_id', myId).is('left_at', null)
    const myGroupIds = myGroups?.map(m => m.group_id) ?? []
    if (myGroupIds.length > 0) {
      const { data: shared } = await supabase.from('group_members')
        .select('group_id, groups:group_id(type)')
        .eq('user_id', contactId).in('group_id', myGroupIds).is('left_at', null)
      const directGroup = shared?.find((row: any) => row.groups?.type === 'direct')
      if (directGroup) { navigate('/chat/' + directGroup.group_id); return }
    }
    const contactData = contacts.find(c => c.id === contactId)
    const { data: newGroup } = await supabase.from('groups')
      .insert({ name: contactData?.full_name ?? 'שיחה ישירה', type: 'direct', created_by: myId })
      .select('id').single()
    if (!newGroup) return
    await supabase.from('group_members').insert([
      { group_id: newGroup.id, user_id: myId },
      { group_id: newGroup.id, user_id: contactId },
    ])
    navigate('/chat/' + newGroup.id)
  }

  const filtered = contacts.filter(c => c.full_name.toLowerCase().includes(search.toLowerCase()))
  const byRole: Record<string, DBUser[]> = {}
  filtered.forEach(c => {
    const label = roleLabel(c.role)
    if (!byRole[label]) byRole[label] = []
    byRole[label].push(c)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: '#CC0000', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={() => navigate('/chats')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>
        </button>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 18 }}>אנשי קשר</span>
      </div>
      <div style={{ background: '#fff', padding: '6px 12px', flexShrink: 0 }}>
        <div style={{ background: '#F0F2F5', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="#8696A0" strokeWidth="2"/><path d="M21 21L16.65 16.65" stroke="#8696A0" strokeWidth="2"/></svg>
          <input type="text" placeholder="חיפוש" value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'none', outline: 'none', fontSize: 15, color: '#111', width: '100%', direction: 'rtl' }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }} className="no-scrollbar">
        {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8696A0' }}>טוען...</div>}
        {Object.entries(byRole).map(([label, users]) => (
          <div key={label}>
            <div style={{ padding: '6px 16px', background: '#F0F2F5', fontSize: 12, color: '#8696A0', fontWeight: 600 }}>{label}</div>
            {users.map(u => (
              <div key={u.id} onClick={() => openDirectChat(u.id)} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 14, cursor: 'pointer', borderBottom: '1px solid #F0F2F5', background: '#fff' }}>
                <Avatar name={u.full_name} size={48} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>{u.full_name}</div>
                  <div style={{ fontSize: 13, color: '#8696A0' }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function roleLabel(role: string): string {
  switch (role) {
    case 'manager': return 'הנהלה'
    case 'office': return 'משרד'
    case 'field_worker': return 'שטח'
    case 'external': return 'חיצוני'
    default: return role
  }
}
