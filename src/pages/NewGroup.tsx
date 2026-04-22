import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DBUser } from '../types'
import Avatar from '../components/Avatar'

export default function NewGroup() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [users, setUsers] = useState<DBUser[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [groupName, setGroupName] = useState('')
  const [step, setStep] = useState<'members' | 'name'>('members')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadUsers() }, [user?.id])

  async function loadUsers() {
    if (!user) return
    const { data } = await supabase.from('users')
      .select('id, full_name, role, avatar_url, is_active')
      .eq('is_active', true).neq('id', user.id).order('full_name')
    setUsers((data ?? []) as DBUser[])
  }

  const filtered = users.filter(u => u.full_name.toLowerCase().includes(search.toLowerCase()))
  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const selectedUsers = users.filter(u => selected.includes(u.id))

  const handleCreate = async () => {
    if (!user || !profile || !groupName.trim()) return
    setSaving(true)
    try {
      const { data: newGroup, error: groupErr } = await supabase.from('groups')
        .insert({ name: groupName.trim(), type: 'group', created_by: user.id })
        .select('id').single()
      if (groupErr || !newGroup) { console.error('שגיאה:', groupErr); return }
      const members = [user.id, ...selected].map(uid => ({
        group_id: newGroup.id, user_id: uid, can_add_members: uid === user.id,
      }))
      await supabase.from('group_members').insert(members)
      await supabase.from('messages').insert({
        group_id: newGroup.id, sender_id: null, sender_name: 'מערכת',
        content: profile.full_name + ' יצר/ה את הקבוצה', message_type: 'system',
      })
      navigate('/chat/' + newGroup.id)
    } finally { setSaving(false) }
  }

  if (step === 'members') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
        <div style={{ background: '#CC0000', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate('/new-chat')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </button>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 18 }}>קבוצה חדשה</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{selected.length > 0 ? selected.length + ' נבחרו' : 'הוסף משתתפים'}</div>
            </div>
          </div>
          {selected.length > 0 && (
            <button onClick={() => setStep('name')} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 20, padding: '6px 14px', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 600 }}>הבא ›</button>
          )}
        </div>
        {selectedUsers.length > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', overflowX: 'auto', background: '#fff', borderBottom: '1px solid #F0F2F5', flexShrink: 0 }} className="no-scrollbar">
            {selectedUsers.map(u => (
              <div key={u.id} onClick={() => toggle(u.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                  <Avatar name={u.full_name} size={44} />
                  <div style={{ position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: '#8696A0', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: '#fff', lineHeight: 1 }}>x</span>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#111', maxWidth: 48, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px solid #F0F2F5' }}>
          <div style={{ background: '#F0F2F5', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="#8696A0" strokeWidth="2"/><path d="M21 21L16.65 16.65" stroke="#8696A0" strokeWidth="2"/></svg>
            <input type="text" placeholder="חיפוש" value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'none', outline: 'none', fontSize: 15, width: '100%', direction: 'rtl' }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }} className="no-scrollbar">
          {filtered.map(u => {
            const isSelected = selected.includes(u.id)
            return (
              <div key={u.id} onClick={() => toggle(u.id)} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 14, cursor: 'pointer', borderBottom: '1px solid #F0F2F5', background: isSelected ? '#FFF5F5' : '#fff' }}>
                <div style={{ position: 'relative' }}>
                  <Avatar name={u.full_name} size={48} />
                  {isSelected && <div style={{ position: 'absolute', bottom: 0, left: 0, width: 18, height: 18, borderRadius: '50%', background: '#CC0000', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12L10 17L19 8" stroke="#fff" strokeWidth="3" strokeLinecap="round"/></svg></div>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>{u.full_name}</div>
                  <div style={{ fontSize: 13, color: '#8696A0' }}>{roleLabel(u.role)}</div>
                </div>
                <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid ' + (isSelected ? '#CC0000' : '#D0D0D0'), background: isSelected ? '#CC0000' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12L10 17L19 8" stroke="#fff" strokeWidth="3" strokeLinecap="round"/></svg>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ background: '#CC0000', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => setStep('members')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>
        </button>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 18 }}>שם הקבוצה</span>
      </div>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selectedUsers.map(u => <div key={u.id} style={{ background: '#F0F2F5', borderRadius: 16, padding: '4px 12px', fontSize: 13, color: '#111' }}>{u.full_name.split(' ')[0]}</div>)}
        </div>
        <input type="text" placeholder="שם הקבוצה (חובה)" value={groupName} onChange={e => setGroupName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && groupName.trim()) handleCreate() }} autoFocus style={{ border: 'none', borderBottom: '2px solid #CC0000', outline: 'none', fontSize: 18, padding: '8px 0', direction: 'rtl', color: '#111', background: 'none' }} />
        <button onClick={handleCreate} disabled={!groupName.trim() || saving} style={{ marginTop: 8, background: groupName.trim() && !saving ? '#CC0000' : '#ccc', color: '#fff', border: 'none', borderRadius: 24, padding: '14px 24px', fontSize: 16, fontWeight: 600, cursor: groupName.trim() && !saving ? 'pointer' : 'not-allowed' }}>
          {saving ? 'יוצר...' : 'צור קבוצה'}
        </button>
      </div>
    </div>
  )
}

function roleLabel(role: string): string {
  switch (role) {
    case 'manager': return 'מנהל'
    case 'office': return 'משרד'
    case 'field_worker': return 'עובד שטח'
    case 'external': return 'חיצוני'
    default: return role
  }
}
