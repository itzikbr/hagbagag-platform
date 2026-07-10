import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DBUser, UserRole } from '../types'
import Avatar from './Avatar'

interface GroupInfo {
  id: string
  name: string
  type: 'direct' | 'group'
  memberCount: number
}

interface Member {
  user_id: string
  full_name: string
  role: UserRole
  avatar_url: string | null
  can_add_members: boolean
}

interface Props {
  group: GroupInfo
  onClose: () => void
  onGroupRenamed: (newName: string) => void
  onGroupDeleted: () => void
  onMembersChanged: (count: number) => void
}

function roleLabel(role: string): string {
  switch (role) {
    case 'manager': return 'מנהל'
    case 'office': return 'משרד'
    case 'field_worker': return 'שטח'
    case 'external': return 'חיצוני'
    default: return role
  }
}

export default function GroupManagementPanel({ group, onClose, onGroupRenamed, onGroupDeleted, onMembersChanged }: Props) {
  const { user, profile } = useAuth()
  const isManager = profile?.role === 'manager'

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(group.name)
  const [savingName, setSavingName] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { loadMembers() }, [group.id])

  async function loadMembers() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('group_members')
        .select('user_id, can_add_members, users:user_id (full_name, role, avatar_url)')
        .eq('group_id', group.id)
        .is('left_at', null)

      const mapped: Member[] = (data ?? []).map((row: any) => ({
        user_id: row.user_id,
        full_name: row.users?.full_name ?? '—',
        role: (row.users?.role ?? 'external') as UserRole,
        avatar_url: row.users?.avatar_url ?? null,
        can_add_members: !!row.can_add_members,
      }))
      // Sort: self first, then by name
      mapped.sort((a, b) => {
        if (a.user_id === user?.id) return -1
        if (b.user_id === user?.id) return 1
        return a.full_name.localeCompare(b.full_name, 'he')
      })
      setMembers(mapped)
      onMembersChanged(mapped.length)
    } finally {
      setLoading(false)
    }
  }

  async function handleRename() {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === group.name) {
      setEditingName(false)
      setNewName(group.name)
      return
    }
    setSavingName(true)
    try {
      const { error } = await supabase.from('groups')
        .update({ name: trimmed })
        .eq('id', group.id)
      if (error) {
        alert('שגיאה בשינוי שם: ' + error.message)
        setNewName(group.name)
      } else {
        await supabase.from('messages').insert({
          group_id: group.id, sender_id: null, sender_name: 'מערכת',
          content: `${profile?.full_name ?? 'מנהל'} שינה את שם הקבוצה ל"${trimmed}"`,
          message_type: 'system',
        })
        onGroupRenamed(trimmed)
      }
    } finally {
      setSavingName(false)
      setEditingName(false)
    }
  }

  async function handleRemove(member: Member) {
    const isSelf = member.user_id === user?.id
    const msg = isSelf ? 'לצאת מהקבוצה?' : `להסיר את ${member.full_name}?`
    if (!window.confirm(msg)) return

    const { error } = await supabase.from('group_members')
      .update({ left_at: new Date().toISOString() })
      .eq('group_id', group.id)
      .eq('user_id', member.user_id)

    if (error) {
      alert('שגיאה: ' + error.message)
      return
    }

    await supabase.from('messages').insert({
      group_id: group.id, sender_id: null, sender_name: 'מערכת',
      content: isSelf
        ? `${member.full_name} עזב/ה את הקבוצה`
        : `${profile?.full_name ?? 'מנהל'} הסיר/ה את ${member.full_name}`,
      message_type: 'system',
    })

    if (isSelf) {
      onClose()
      // Navigate away — the parent will handle since user lost access
      window.location.href = '/chats'
    } else {
      loadMembers()
    }
  }

  async function handleDelete() {
    const { error } = await supabase.from('groups').delete().eq('id', group.id)
    if (error) {
      alert('שגיאה במחיקה: ' + error.message)
      return
    }
    onGroupDeleted()
  }

  // ──────── Render ────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#fff', zIndex: 1000,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: '#CC0000', padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 17 }}>פרטי קבוצה</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: '#F0F2F5' }} className="no-scrollbar">
        {/* Group card */}
        <div style={{ background: '#fff', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Avatar name={group.name} size={96} isGroup />

          {editingName ? (
            <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 320 }}>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
                style={{
                  flex: 1, fontSize: 18, padding: '6px 10px', direction: 'rtl',
                  border: '2px solid #CC0000', borderRadius: 8, outline: 'none', color: '#111', background: '#fff',
                }}
              />
              <button onClick={handleRename} disabled={savingName} style={{ background: '#CC0000', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>
                שמור
              </button>
              <button onClick={() => { setEditingName(false); setNewName(group.name) }} style={{ background: '#F0F2F5', color: '#54656F', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 14, cursor: 'pointer' }}>
                ביטול
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 600, color: '#111' }}>{group.name}</span>
              {isManager && (
                <button onClick={() => setEditingName(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} title="ערוך שם">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M11 4H4C3.45 4 3 4.45 3 5V20C3 20.55 3.45 21 4 21H19C19.55 21 20 20.55 20 20V13" stroke="#54656F" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M18.5 2.5C19.33 1.67 20.67 1.67 21.5 2.5C22.33 3.33 22.33 4.67 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="#54656F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          )}

          <span style={{ color: '#8696A0', fontSize: 13 }}>קבוצה · {members.length} משתתפים</span>
        </div>

        {/* Members list */}
        <div style={{ marginTop: 12, background: '#fff' }}>
          <div style={{
            padding: '12px 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', borderBottom: '1px solid #F0F2F5',
          }}>
            <span style={{ fontSize: 13, color: '#8696A0', fontWeight: 600 }}>
              {members.length} משתתפים
            </span>
            {isManager && (
              <button
                onClick={() => setShowAddMember(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CC0000', fontWeight: 600, fontSize: 14, padding: 4 }}
              >
                + הוסף משתתף
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#8696A0' }}>טוען...</div>
          ) : (
            members.map(m => {
              const isSelf = m.user_id === user?.id
              const canRemove = isSelf || isManager
              return (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12, borderBottom: '1px solid #F0F2F5' }}>
                  <Avatar name={m.full_name} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 500, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{m.full_name}</span>
                      {isSelf && <span style={{ fontSize: 12, color: '#8696A0' }}>(אתה)</span>}
                      {m.can_add_members && (
                        <span style={{ fontSize: 11, color: '#CC0000', background: '#FFF5F5', borderRadius: 4, padding: '1px 6px' }}>יוצר</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: '#8696A0' }}>{roleLabel(m.role)}</div>
                  </div>
                  {canRemove && (
                    <button
                      onClick={() => handleRemove(m)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}
                      title={isSelf ? 'יציאה' : 'הסר'}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M3 6H21M8 6V4C8 3.45 8.45 3 9 3H15C15.55 3 16 3.45 16 4V6M19 6V20C19 20.55 18.55 21 18 21H6C5.45 21 5 20.55 5 20V6H19Z" stroke="#CC0000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Danger zone */}
        {isManager && (
          <div style={{ marginTop: 12, background: '#fff', padding: '8px 0' }}>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  width: '100%', background: 'none', border: 'none',
                  padding: '14px 16px', textAlign: 'right', cursor: 'pointer',
                  color: '#CC0000', fontSize: 16, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6H21M8 6V4C8 3.45 8.45 3 9 3H15C15.55 3 16 3.45 16 4V6M19 6V20C19 20.55 18.55 21 18 21H6C5.45 21 5 20.55 5 20V6H19Z" stroke="#CC0000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                מחק את הקבוצה
              </button>
            ) : (
              <div style={{ padding: '14px 16px' }}>
                <div style={{ color: '#111', fontSize: 15, marginBottom: 12 }}>
                  למחוק את הקבוצה לצמיתות? פעולה זו אינה ניתנת לביטול.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleDelete}
                    style={{ flex: 1, background: '#CC0000', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
                  >
                    מחק
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ flex: 1, background: '#F0F2F5', color: '#54656F', border: 'none', borderRadius: 8, padding: '10px', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>

      {showAddMember && (
        <AddMemberModal
          groupId={group.id}
          existingIds={members.map(m => m.user_id)}
          onClose={() => setShowAddMember(false)}
          onAdded={() => { setShowAddMember(false); loadMembers() }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Add Member sub-modal
// ────────────────────────────────────────────────────────────

interface AddProps {
  groupId: string
  existingIds: string[]
  onClose: () => void
  onAdded: () => void
}

function AddMemberModal({ groupId, existingIds, onClose, onAdded }: AddProps) {
  const { profile } = useAuth()
  const [users, setUsers] = useState<DBUser[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    const { data } = await supabase.from('users')
      .select('id, full_name, role, avatar_url, is_active')
      .eq('is_active', true)
      .order('full_name')
    const candidates = (data ?? []).filter((u: any) => !existingIds.includes(u.id))
    setUsers(candidates as DBUser[])
  }

  const filtered = users.filter(u => u.full_name.toLowerCase().includes(search.toLowerCase()))
  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  async function handleAdd() {
    if (selected.length === 0) return
    setSaving(true)
    try {
      // Re-activate previously-left rows or insert new ones
      // Strategy: try update first (set left_at = null), then insert any that didn't have a row
      const { data: existing } = await supabase.from('group_members')
        .select('user_id, left_at')
        .eq('group_id', groupId)
        .in('user_id', selected)

      const existingMap = new Map((existing ?? []).map((r: any) => [r.user_id, r]))
      const toReactivate = selected.filter(id => existingMap.has(id))
      const toInsert = selected.filter(id => !existingMap.has(id))

      if (toReactivate.length > 0) {
        await supabase.from('group_members')
          .update({ left_at: null })
          .eq('group_id', groupId)
          .in('user_id', toReactivate)
      }
      if (toInsert.length > 0) {
        await supabase.from('group_members').insert(
          toInsert.map(uid => ({ group_id: groupId, user_id: uid, can_add_members: false }))
        )
      }

      // System message naming who was added
      const addedNames = users.filter(u => selected.includes(u.id)).map(u => u.full_name)
      await supabase.from('messages').insert({
        group_id: groupId, sender_id: null, sender_name: 'מערכת',
        content: `${profile?.full_name ?? 'מנהל'} הוסיף/ה את ${addedNames.join(', ')}`,
        message_type: 'system',
      })

      onAdded()
    } catch (err: any) {
      alert('שגיאה בהוספה: ' + (err?.message ?? 'לא ידועה'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#fff', zIndex: 1100,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        background: '#CC0000', padding: '8px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 17 }}>הוספת משתתפים</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              {selected.length > 0 ? `${selected.length} נבחרו` : 'בחר משתתפים'}
            </div>
          </div>
        </div>
        {selected.length > 0 && (
          <button
            onClick={handleAdd}
            disabled={saving}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 20, padding: '6px 14px', cursor: saving ? 'wait' : 'pointer', color: '#fff', fontSize: 14, fontWeight: 600 }}
          >
            {saving ? 'מוסיף...' : 'הוסף'}
          </button>
        )}
      </div>

      <div style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px solid #F0F2F5', flexShrink: 0 }}>
        <div style={{ background: '#F0F2F5', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8 }}>
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

      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }} className="no-scrollbar">
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#8696A0' }}>
            {users.length === 0 ? 'כל המשתמשים כבר בקבוצה' : 'אין תוצאות'}
          </div>
        )}
        {filtered.map(u => {
          const isSelected = selected.includes(u.id)
          return (
            <div
              key={u.id}
              onClick={() => toggle(u.id)}
              style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 14, cursor: 'pointer', borderBottom: '1px solid #F0F2F5', background: isSelected ? '#FFF5F5' : '#fff' }}
            >
              <Avatar name={u.full_name} size={48} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>{u.full_name}</div>
                <div style={{ fontSize: 13, color: '#8696A0' }}>{roleLabel(u.role)}</div>
              </div>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                border: '2px solid ' + (isSelected ? '#CC0000' : '#D0D0D0'),
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
