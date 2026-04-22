import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Avatar from '../components/Avatar'

interface UserRow {
  id: string
  full_name: string
  role: string
}

export default function NewGroup() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('users')
      .select('id, full_name, role')
      .neq('id', user.id)
      .then(({ data }) => setUsers(data ?? []))
  }, [user])

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const filtered = users.filter(u =>
    u.full_name.includes(search) || u.role.includes(search)
  )

  const selectedUsers = users.filter(u => selected.includes(u.id))

  async function handleCreate() {
    if (selected.length === 0 || !user) return
    setCreating(true)

    const name = groupName.trim() || selectedUsers.map(u => u.full_name).join(', ')

    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name, type: 'group' })
      .select()
      .single()

    if (error || !group) {
      setCreating(false)
      return
    }

    await supabase.from('group_members').insert([
      { group_id: group.id, user_id: user.id },
      ...selected.map(uid => ({ group_id: group.id, user_id: uid })),
    ])

    navigate('/chats')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {/* Header */}
      <div style={{ background: '#CC0000', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/new-chat')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 18 }}>קבוצה חדשה</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              {selected.length > 0 ? `${selected.length} נבחרו` : 'הוסף משתתפים'}
            </div>
          </div>
        </div>
        {selected.length > 0 && (
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              background: creating ? 'rgba(255,255,255,0.5)' : '#fff',
              border: 'none',
              borderRadius: 20,
              padding: '8px 16px',
              cursor: creating ? 'default' : 'pointer',
              color: '#CC0000',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {creating ? '...' : 'הבא'}
          </button>
        )}
      </div>

      {/* Group name input — shown when at least one member selected */}
      {selected.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #F0F2F5' }}>
          <input
            type="text"
            placeholder="שם הקבוצה (אופציונלי)"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            style={{
              width: '100%',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 15,
              direction: 'rtl',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Selected chips */}
      {selectedUsers.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, padding: '8px 12px',
          overflowX: 'auto', background: '#fff', borderBottom: '1px solid #F0F2F5',
          flexShrink: 0,
        }} className="no-scrollbar">
          {selectedUsers.map(u => (
            <div
              key={u.id}
              onClick={() => toggle(u.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}
            >
              <div style={{ position: 'relative' }}>
                <Avatar name={u.full_name} size={44} />
                <div style={{
                  position: 'absolute', top: -2, right: -2,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#8696A0', border: '2px solid #fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 12, color: '#fff', lineHeight: 1 }}>×</span>
                </div>
              </div>
              <span style={{ fontSize: 11, color: '#111', maxWidth: 48, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.full_name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px solid #F0F2F5' }}>
        <div style={{ background: '#F0F2F5', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="#8696A0" strokeWidth="2"/>
            <path d="M21 21L16.65 16.65" stroke="#8696A0" strokeWidth="2"/>
          </svg>
          <input
            type="text"
            placeholder="הוסף משתתפים"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: 15, width: '100%', direction: 'rtl' }}
          />
        </div>
      </div>

      {/* User list */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="no-scrollbar">
        {filtered.map(u => {
          const isSelected = selected.includes(u.id)
          return (
            <div
              key={u.id}
              onClick={() => toggle(u.id)}
              style={{
                display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 14,
                cursor: 'pointer', borderBottom: '1px solid #F0F2F5',
                background: isSelected ? '#FFF5F5' : '#fff',
              }}
            >
              <div style={{ position: 'relative' }}>
                <Avatar name={u.full_name} size={48} />
                {isSelected && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#CC0000', border: '2px solid #fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12L10 17L19 8" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>{u.full_name}</div>
                <div style={{ fontSize: 13, color: '#8696A0' }}>{u.role}</div>
              </div>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                border: `2px solid ${isSelected ? '#CC0000' : '#D0D0D0'}`,
                background: isSelected ? '#CC0000' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12L10 17L19 8" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
