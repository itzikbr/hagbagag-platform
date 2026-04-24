import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DBUser } from '../types'
import Avatar from '../components/Avatar'

const ROLE_LABELS: Record<string, string> = {
  manager: 'מנהל',
  office: 'משרד',
  field_worker: 'שטח',
  field: 'שטח',
  external: 'חיצוני',
}

const ROLE_OPTIONS = [
  { value: 'manager', label: 'מנהל' },
  { value: 'office', label: 'משרד' },
  { value: 'field_worker', label: 'שטח' },
  { value: 'external', label: 'חיצוני' },
]

export default function Admin() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [users, setUsers] = useState<DBUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newUser, setNewUser] = useState({ full_name: '', role: 'field_worker', username: '', password: '' })
  const [addMsg, setAddMsg] = useState('')
  const [editingName, setEditingName] = useState<{ id: string; value: string } | null>(null)
  const [changingPassword, setChangingPassword] = useState<{ id: string; value: string } | null>(null)

  useEffect(() => {
    if (profile?.role === 'manager') loadUsers()
  }, [profile])

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase
      .from('users')
      .select('id, full_name, role, avatar_url, is_active')
      .order('full_name')
    setUsers((data ?? []) as DBUser[])
    setLoading(false)
  }

  async function updateRole(userId: string, newRole: string) {
    setSaving(userId)
    const { error } = await supabase
      .from('users')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as any } : u))
      setEditingId(null)
    }
    setSaving(null)
  }

  async function toggleActive(userId: string, current: boolean) {
    setSaving(userId)
    const { error } = await supabase
      .from('users')
      .update({ is_active: !current, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !current } : u))
    }
    setSaving(null)
  }

  async function updateName(userId: string, name: string) {
    if (!name.trim()) return
    setSaving(userId)
    const { error } = await supabase
      .from('users')
      .update({ full_name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, full_name: name.trim() } : u))
      setEditingName(null)
    }
    setSaving(null)
  }

  async function changePassword(userId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 4) return
    setSaving(userId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://edsivltyzrfjrjhwfbid.supabase.co/functions/v1/create-user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: userId, password: newPassword })
      })
      const result = await res.json()
      if (result.success) {
        setChangingPassword(null)
      } else {
        alert('שגיאה: ' + (result.error || 'לא ידוע'))
        setChangingPassword(null)
      }
    } catch {
      setChangingPassword(null)
    } finally {
      setSaving(null)
    }
  }

  if (profile?.role !== 'manager') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <span style={{ fontSize: 48 }}>🔒</span>
        <span style={{ fontSize: 16, color: '#8696A0' }}>הגישה מוגבלת למנהלים בלבד</span>
        <button onClick={() => navigate('/chats')} style={{ marginTop: 8, background: '#CC0000', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', cursor: 'pointer', fontSize: 15 }}>
          חזרה לשיחות
        </button>
      </div>
    )
  }

  const active = users.filter(u => u.is_active)
  const inactive = users.filter(u => !u.is_active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', direction: 'rtl' }}>
      {/* Header */}
      <div style={{ background: '#CC0000', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/chats')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 18 }}>ניהול משתמשים</span>
        </div>
        <button
          onClick={() => { setShowAddForm(!showAddForm); setAddMsg('') }}
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 20, padding: '6px 14px', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
        >
          {showAddForm ? 'ביטול' : '+ הוסף'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: '#F0F2F5' }} className="no-scrollbar">

        {/* Add User Form */}
        {showAddForm && (
          <div style={{ background: '#fff', margin: 12, borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15, color: '#111' }}>משתמש חדש</div>
            <input
              type="text"
              placeholder="שם מלא *"
              value={newUser.full_name}
              onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))}
              style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', direction: 'rtl' }}
            />
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <input
                type="text"
                placeholder="שם כניסה * — באנגלית בלבד (samir, asaf...)"
                value={newUser.username}
                onChange={e => setNewUser(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box', direction: 'ltr' }}
              />
              <div style={{ fontSize: 11, color: '#8696A0', marginTop: 3, paddingRight: 4 }}>זה מה שהמשתמש יקליד בכניסה — אנגלית בלבד</div>
            </div>
            <input
              type="password"
              placeholder="סיסמה ראשונית *"
              value={newUser.password}
              onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
              style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', direction: 'ltr' }}
            />
            <select
              value={newUser.role}
              onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
              style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 12, background: '#fff', direction: 'rtl' }}
            >
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {addMsg && (
              <div style={{ fontSize: 13, color: addMsg.includes('✅') ? '#22c55e' : '#CC0000', marginBottom: 8, lineHeight: 1.6 }}>{addMsg}</div>
            )}
            <button
              onClick={async () => {
                if (!newUser.full_name.trim() || !newUser.username.trim()) {
                  setAddMsg('שם מלא ושם משתמש חובה')
                  return
                }
                if (!newUser.password || newUser.password.length < 4) {
                  setAddMsg('סיסמה חייבת להיות לפחות 4 תווים')
                  return
                }
                setAddMsg('יוצר משתמש...')
                try {
                  const { data: { session } } = await supabase.auth.getSession()
                  const res = await fetch('https://edsivltyzrfjrjhwfbid.supabase.co/functions/v1/create-user', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session?.access_token}`,
                    },
                    body: JSON.stringify({
                      email: `${newUser.username}@hagbagag.local`,
                      password: newUser.password,
                      full_name: newUser.full_name,
                      role: newUser.role,
                    })
                  })
                  const result = await res.json()
                  if (result.success) {
                    setAddMsg('✅ ' + newUser.full_name + ' נוסף בהצלחה!')
                    setNewUser({ full_name: '', role: 'field_worker', username: '', password: '' })
                    loadUsers()
                  } else {
                    setAddMsg('שגיאה: ' + (result.error || 'לא ידוע'))
                  }
                } catch {
                  setAddMsg('שגיאת תקשורת')
                }
              }}
              style={{ background: '#CC0000', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
            >
              צור משתמש
            </button>
          </div>
        )}

        {loading && (
          <div style={{ padding: 32, textAlign: 'center', color: '#8696A0' }}>טוען...</div>
        )}

        {/* Active Users */}
        {!loading && active.length > 0 && (
          <div>
            <div style={{ padding: '10px 16px 4px', fontSize: 12, color: '#8696A0', fontWeight: 600, letterSpacing: 0.5 }}>
              פעילים — {active.length}
            </div>
            {active.map(u => (
              <UserCard
                key={u.id}
                user={u}
                editing={editingId === u.id}
                saving={saving === u.id}
                editingName={editingName?.id === u.id ? editingName.value : null}
                changingPassword={changingPassword?.id === u.id ? changingPassword.value : null}
                onEdit={() => setEditingId(editingId === u.id ? null : u.id)}
                onRoleChange={(role) => updateRole(u.id, role)}
                onToggleActive={() => toggleActive(u.id, u.is_active)}
                onStartEditName={() => setEditingName({ id: u.id, value: u.full_name })}
                onNameChange={(v) => setEditingName({ id: u.id, value: v })}
                onSaveName={() => updateName(u.id, editingName?.value ?? '')}
                onStartChangePassword={() => setChangingPassword({ id: u.id, value: '' })}
                onPasswordChange={(v) => setChangingPassword({ id: u.id, value: v })}
                onSavePassword={() => changePassword(u.id, changingPassword?.value ?? '')}
              />
            ))}
          </div>
        )}

        {/* Inactive Users */}
        {!loading && inactive.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ padding: '10px 16px 4px', fontSize: 12, color: '#8696A0', fontWeight: 600, letterSpacing: 0.5 }}>
              מושהים — {inactive.length}
            </div>
            {inactive.map(u => (
              <UserCard
                key={u.id}
                user={u}
                editing={editingId === u.id}
                saving={saving === u.id}
                editingName={editingName?.id === u.id ? editingName.value : null}
                changingPassword={changingPassword?.id === u.id ? changingPassword.value : null}
                onEdit={() => setEditingId(editingId === u.id ? null : u.id)}
                onRoleChange={(role) => updateRole(u.id, role)}
                onToggleActive={() => toggleActive(u.id, u.is_active)}
                onStartEditName={() => setEditingName({ id: u.id, value: u.full_name })}
                onNameChange={(v) => setEditingName({ id: u.id, value: v })}
                onSaveName={() => updateName(u.id, editingName?.value ?? '')}
                onStartChangePassword={() => setChangingPassword({ id: u.id, value: '' })}
                onPasswordChange={(v) => setChangingPassword({ id: u.id, value: v })}
                onSavePassword={() => changePassword(u.id, changingPassword?.value ?? '')}
              />
            ))}
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}

function UserCard({ user, editing, saving, editingName, changingPassword, onEdit, onRoleChange, onToggleActive, onStartEditName, onNameChange, onSaveName, onStartChangePassword, onPasswordChange, onSavePassword }: {
  user: DBUser
  editing: boolean
  saving: boolean
  editingName: string | null
  changingPassword: string | null
  onEdit: () => void
  onRoleChange: (role: string) => void
  onToggleActive: () => void
  onStartEditName: () => void
  onNameChange: (v: string) => void
  onSaveName: () => void
  onStartChangePassword: () => void
  onPasswordChange: (v: string) => void
  onSavePassword: () => void
}) {
  return (
    <div style={{ background: user.is_active ? '#fff' : '#F9F9F9', borderBottom: '1px solid #F0F2F5', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ opacity: user.is_active ? 1 : 0.45 }}>
          <Avatar name={user.full_name} size={46} />
        </div>
        <div style={{ flex: 1 }}>
          {editingName !== null ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={editingName} onChange={e => onNameChange(e.target.value)} autoFocus
                style={{ border: '1px solid #CC0000', borderRadius: 6, padding: '4px 8px', fontSize: 14, flex: 1, direction: 'rtl' }} />
              <button onClick={onSaveName} style={{ background: '#CC0000', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}>שמור</button>
            </div>
          ) : (
            <div style={{ fontSize: 15, fontWeight: 500, color: user.is_active ? '#111' : '#999', cursor: 'pointer' }} onClick={onStartEditName}>
              {user.full_name} ✎
              {!user.is_active && <span style={{ fontSize: 11, color: '#bbb', marginRight: 6 }}>מושהה</span>}
            </div>
          )}
          <div style={{ fontSize: 13, color: '#8696A0', marginTop: 2 }}>
            {ROLE_LABELS[user.role] || user.role}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onEdit} disabled={saving}
              style={{ background: editing ? '#FFF0F0' : '#F0F2F5', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: editing ? '#CC0000' : '#555' }}>
              תפקיד
            </button>
            <button onClick={onToggleActive} disabled={saving}
              style={{ background: user.is_active ? '#FFF0F0' : '#F0FFF0', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: user.is_active ? '#CC0000' : '#16a34a', fontWeight: 600 }}>
              {saving ? '...' : user.is_active ? 'השהה' : 'הפעל'}
            </button>
          </div>
          <button onClick={onStartChangePassword} disabled={saving}
            style={{ background: '#F0F2F5', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: '#555' }}>
            סיסמה
          </button>
        </div>
      </div>

      {/* Password change */}
      {changingPassword !== null && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, paddingRight: 58, alignItems: 'center' }}>
          <input type="password" placeholder="סיסמה חדשה" value={changingPassword} onChange={e => onPasswordChange(e.target.value)} autoFocus
            style={{ border: '1px solid #CC0000', borderRadius: 6, padding: '6px 10px', fontSize: 14, flex: 1, direction: 'ltr' }} />
          <button onClick={onSavePassword}
            style={{ background: '#CC0000', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>עדכן</button>
        </div>
      )}

      {/* Role selector */}
      {editing && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', paddingRight: 58 }}>
          {ROLE_OPTIONS.map(r => {
            const isActive = user.role === r.value || (r.value === 'field_worker' && user.role === 'field')
            return (
              <button
                key={r.value}
                onClick={() => onRoleChange(r.value)}
                style={{ padding: '6px 16px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 700 : 400, background: isActive ? '#CC0000' : '#F0F2F5', color: isActive ? '#fff' : '#333' }}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
