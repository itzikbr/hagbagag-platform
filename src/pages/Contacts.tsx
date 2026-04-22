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

export default function Contacts() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('users')
      .select('id, full_name, role')
      .then(({ data }) => {
        setUsers(data ?? [])
        setLoading(false)
      })
  }, [])

  async function handleUserClick(targetId: string) {
    if (!user) return

    // Find groups shared by both users
    const { data: myGroups } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)

    const myGroupIds = (myGroups ?? []).map((g: any) => g.group_id)

    if (myGroupIds.length > 0) {
      const { data: common } = await supabase
        .from('group_members')
        .select('group_id, groups!inner(type)')
        .eq('user_id', targetId)
        .in('group_id', myGroupIds)

      const directGroup = (common ?? []).find((g: any) => g.groups?.type === 'direct')
      if (directGroup) {
        navigate(`/chat/${directGroup.group_id}`)
        return
      }
    }

    // Create new direct group
    const targetUser = users.find(u => u.id === targetId)
    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name: targetUser?.full_name ?? 'שיחה', type: 'direct' })
      .select()
      .single()

    if (error || !group) return

    await supabase.from('group_members').insert([
      { group_id: group.id, user_id: user.id },
      { group_id: group.id, user_id: targetId },
    ])

    navigate(`/chat/${group.id}`)
  }

  const filtered = users.filter(u =>
    u.full_name.includes(search) || u.role.includes(search)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        background: '#CC0000',
        padding: '12px 16px 8px',
        flexShrink: 0,
      }}>
        <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>אנשי קשר</span>
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

      {/* List */}
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
            לא נמצאו משתמשים
          </div>
        ) : (
          filtered.map(u => (
            <div
              key={u.id}
              onClick={() => handleUserClick(u.id)}
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
              <Avatar name={u.full_name} size={50} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: '#111' }}>{u.full_name}</div>
                <div style={{ fontSize: 13, color: '#8696A0' }}>{u.role}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
