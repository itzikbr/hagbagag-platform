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
  const [newUser, setNewUser] = useState({ full_name: '', role: 'field_worker', email: '' })
  const [addMsg, setAddMsg] = useState('')

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
            <input
              type="email"
              placeholder="אימייל * (לכניסה למערכת)"
              value={newUser.email}
              onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
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
            <div style={{ fontSize: 12, color: '#8696A0', marginBottom: 12, lineHeight: 1.6, background: '#FFFBEA', padding: '8px 10px', borderRadius: 8 }}>
              ⚠️ שלב 1 מתוך 2: שמור כאן את הפרטים.<br/>
              שלב 2: ב-Supabase Dashboard ← Authentication ← Add User ← הכנס את האימייל וסיסמה ראשונית.
            </div>
            <button
              onClick={() => {
                if (!newUser.full_name.trim() || !newUser.email.trim()) {
                  setAddMsg('שם ואימייל חובה')
                  return
                }
                setAddMsg(`✅ הפרטים נשמרו.\nכעת לך ל-Supabase Dashboard → Authentication → Users → Add User\nאימייל: ${newUser.email}`)
              }}
              style={{ background: '#CC0000', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
            >
              שמור
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
                onEdit={() => setEditingId(editingId === u.id ? null : u.id)}
                onRoleChange={(role) => updateRole(u.id, role)}
                onToggleActive={() => toggleActive(u.id, u.is_active)}
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
                onEdit={() => setEditingId(editingId === u.id ? null : u.id)}
                onRoleChange={(role) => updateRole(u.id, role)}
                onToggleActive={() => toggleActive(u.id, u.is_active)}
              />
            ))}
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}

function UserCard({ user, editing, saving, onEdit, onRoleChange, onToggleActive }: {
  user: DBUser
  editing: boolean
  saving: boolean
  onEdit: () => void
  onRoleChange: (role: string) => void
  onToggleActive: () => void
}) {
  return (
    <div style={{ background: user.is_active ? '#fff' : '#F9F9F9', borderBottom: '1px solid #F0F2F5', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ opacity: user.is_active ? 1 : 0.45 }}>
          <Avatar name={user.full_name} size={46} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: user.is_active ? '#111' : '#999' }}>
            {user.full_name}
            {!user.is_active && <span style={{ fontSize: 11, color: '#bbb', marginRight: 6 }}>מושהה</span>}
          </div>
          <div style={{ fontSize: 13, color: '#8696A0', marginTop: 2 }}>
            {ROLE_LABELS[user.role] || user.role}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onEdit}
            disabled={saving}
            style={{ background: editing ? '#FFF0F0' : '#F0F2F5', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: editing ? '#CC0000' : '#555', fontWeight: editing ? 600 : 400 }}
          >
            תפקיד
          </button>
          <button
            onClick={onToggleActive}
            disabled={saving}
            style={{ background: user.is_active ? '#FFF0F0' : '#F0FFF0', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: user.is_active ? '#CC0000' : '#16a34a', fontWeight: 600, minWidth: 52 }}
          >
            {saving ? '...' : user.is_active ? 'השהה' : 'הפעל'}
          </button>
        </div>
      </div>

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
