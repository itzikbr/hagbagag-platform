import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { queryWithRetry } from '../lib/dbRetry'
import Avatar from '../components/Avatar'
import GroupManagementPanel from '../components/GroupManagementPanel'

// ============================================================
// /admin/groups — ניהול קבוצות (אדמין בלבד, נשמר ע"י RequireAdmin ב-App).
// רשימת כל הקבוצות (type='group'); לחיצה פותחת את GroupManagementPanel
// לשם עריכת שם / הוספה-הסרה משתתפים / מחיקה.
// ============================================================
const RED = '#CC0000'
const BG = '#f0ebe4'

interface GroupRow { id: string; name: string; type: 'direct' | 'group'; memberCount: number }

export default function GroupsAdmin() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GroupRow | null>(null)

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    setLoading(true)
    try {
      // אדמין רואה את כל הקבוצות (RLS: is_admin()).
      const gs = await queryWithRetry<any[]>(() =>
        supabase.from('groups').select('id, name, type').eq('type', 'group').order('updated_at', { ascending: false })
      )
      const ids = (gs ?? []).map(g => g.id)
      const counts: Record<string, number> = {}
      if (ids.length) {
        const gm = await queryWithRetry<any[]>(() =>
          supabase.from('group_members').select('group_id').is('left_at', null).in('group_id', ids)
        )
        for (const m of gm ?? []) counts[m.group_id] = (counts[m.group_id] ?? 0) + 1
      }
      setGroups((gs ?? []).map(g => ({ id: g.id, name: g.name, type: g.type, memberCount: counts[g.id] ?? 0 })))
    } catch (e) {
      console.error('[groups-admin] load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, direction: 'rtl' }}>
      {/* Header */}
      <div style={{ background: RED, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => navigate('/admin')} aria-label="חזרה" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 22, padding: 0, width: 30 }}>‹</button>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>👥 ניהול קבוצות</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }} className="no-scrollbar">
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F0F2F5' }}>
          <span style={{ fontSize: 13, color: '#8696A0', fontWeight: 600 }}>{groups.length} קבוצות</span>
          <button onClick={() => navigate('/new-group')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontWeight: 600, fontSize: 14, padding: 4 }}>
            + קבוצה חדשה
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8696A0' }}>טוען...</div>
        ) : groups.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8696A0' }}>אין קבוצות עדיין.</div>
        ) : (
          groups.map(g => (
            <div
              key={g.id}
              onClick={() => setSelected(g)}
              style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12, borderBottom: '1px solid #F0F2F5', cursor: 'pointer', background: '#fff' }}
            >
              <Avatar name={g.name} size={44} isGroup />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>{g.name}</div>
                <div style={{ fontSize: 13, color: '#8696A0' }}>{g.memberCount} משתתפים</div>
              </div>
              <span style={{ fontSize: 20, color: RED }}>‹</span>
            </div>
          ))
        )}
      </div>

      {selected && (
        <GroupManagementPanel
          group={{ id: selected.id, name: selected.name, type: selected.type, memberCount: selected.memberCount }}
          onClose={() => setSelected(null)}
          onGroupRenamed={(newName) => { setSelected(s => (s ? { ...s, name: newName } : s)); loadGroups() }}
          onGroupDeleted={() => { setSelected(null); loadGroups() }}
          onMembersChanged={(count) => { setSelected(s => (s ? { ...s, memberCount: count } : s)); loadGroups() }}
        />
      )}
    </div>
  )
}
