import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DBMessage } from '../types'
import Avatar from '../components/Avatar'
import GroupManagementPanel from '../components/GroupManagementPanel'
import { reportClient, errDetail } from '../lib/report'

// מריץ הבטחה עם timeout — אם לא הושלמה בזמן, נזרק 'timeout' (הבקשה שברקע ננטשת).
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}

interface GroupInfo {
  id: string
  name: string
  type: 'direct' | 'group'
  memberCount: number
}

export default function ChatConversation() {
  const { id: groupId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null)
  const [messages, setMessages] = useState<DBMessage[]>([])
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load group info + messages + subscribe to realtime
  useEffect(() => {
    if (!groupId || !user) return
    loadGroupAndMessages()

    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `group_id=eq.${groupId}`,
      }, (payload) => {
        setMessages(prev => {
          // Avoid duplicates
          const newMsg = payload.new as DBMessage
          if (prev.some(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [groupId, user?.id])

  async function loadGroupAndMessages() {
    if (!groupId) return
    setLoading(true)

    // שלוש השאילתות. שאילתה שנתקעת (cold-start ב-PWA של iOS) הייתה תולה את
    // ה-await לנצח וה-finally לא רץ → תקוע על "טוען…". עוטפים ב-timeout מדורג
    // עם retry, כך שהניסיון הראשון נכשל מהר והריטריי (שמצליח) קופץ מיד.
    const run = async () => {
      const { data: gData } = await supabase
        .from('groups').select('id, name, type').eq('id', groupId).single()
      const { count } = await supabase
        .from('group_members').select('*', { count: 'exact', head: true })
        .eq('group_id', groupId).is('left_at', null)
      if (gData) {
        setGroupInfo({ id: gData.id, name: gData.name, type: gData.type as 'direct' | 'group', memberCount: count ?? 0 })
      }
      const { data: msgs } = await supabase
        .from('messages').select('*').eq('group_id', groupId).eq('is_deleted', false)
        .order('created_at', { ascending: true }).limit(100)
      setMessages((msgs ?? []) as DBMessage[])
    }

    const TIMEOUTS = [4000, 8000, 12000, 12000]
    try {
      let lastErr: unknown = null
      for (let i = 0; i < TIMEOUTS.length; i++) {
        try { await withTimeout(run(), TIMEOUTS[i]); lastErr = null; break }
        catch (e) { lastErr = e; if (i < TIMEOUTS.length - 1) await new Promise(r => setTimeout(r, 250)) }
      }
      if (lastErr) {
        console.error('[chat] load failed after retries:', lastErr)
        reportClient({ where: 'chat-load-failed', online: navigator.onLine, ...errDetail(lastErr) })
      }
    } finally {
      setLoading(false)   // תמיד — לא נתקעים על "טוען…"
    }
  }

  const handleSend = async () => {
    if (!text.trim() || !groupId || !user || !profile) return
    const content = text.trim()
    setText('')

    const { error } = await supabase.from('messages').insert({
      group_id: groupId,
      sender_id: user.id,
      sender_name: profile.full_name,
      content,
      message_type: 'text',
    })

    if (error) {
      console.error('שגיאה בשליחת הודעה:', error)
      setText(content) // Restore on error
    }
    // Realtime subscription will add the new message automatically
  }

  // העלאת תמונה/קובץ ל-Supabase Storage (bucket ציבורי chat-files) + הודעה
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''  // מאפשר לבחור שוב אותו קובץ
    if (!file || !groupId || !user || !profile || uploading) return
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      const rand = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2))
      const path = `${groupId}/${rand}.${ext}`
      const { error: upErr } = await supabase.storage.from('chat-files').upload(path, file, { contentType: file.type || undefined })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('chat-files').getPublicUrl(path)
      const isImage = (file.type || '').startsWith('image/')
      const { error: msgErr } = await supabase.from('messages').insert({
        group_id: groupId,
        sender_id: user.id,
        sender_name: profile.full_name,
        content: isImage ? '' : file.name,
        message_type: isImage ? 'image' : 'file',
        file_url: pub.publicUrl,
        file_name: file.name,
        file_size: file.size,
      })
      if (msgErr) throw msgErr
      // Realtime subscription יוסיף את ההודעה
    } catch (err) {
      console.error('שגיאה בהעלאת קובץ:', err)
      setToast('העלאת הקובץ נכשלה')
      setTimeout(() => setToast(null), 2200)
    } finally {
      setUploading(false)
    }
  }

  // Group messages by date
  const grouped = messages.reduce<{ date: string; msgs: DBMessage[] }[]>((acc, msg) => {
    const date = msg.created_at.slice(0, 10)
    const last = acc[acc.length - 1]
    if (last && last.date === date) {
      last.msgs.push(msg)
    } else {
      acc.push({ date, msgs: [msg] })
    }
    return acc
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: '#8696A0' }}>טוען...</span>
      </div>
    )
  }

  if (!groupInfo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <span style={{ color: '#54656F', fontSize: 16 }}>שיחה לא נמצאה</span>
        <button
          onClick={() => navigate('/chats')}
          style={{
            background: '#CC0000', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 24px', fontSize: 15, cursor: 'pointer', fontWeight: 500,
          }}
        >
          חזרה לשיחות
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#ECE5DD' }}>
      {/* Header */}
      <div style={{
        background: '#CC0000',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/chats')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#fff' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>

        <Avatar name={groupInfo.name} size={40} isGroup={groupInfo.type === 'group'} />

        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>{groupInfo.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            {groupInfo.type === 'group'
              ? `${groupInfo.memberCount} משתתפים`
              : 'מחובר'}
          </div>
        </div>

        {groupInfo.type === 'group' && (
          <button
            onClick={() => setShowPanel(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="5" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
              <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
              <circle cx="19" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }} className="no-scrollbar">
        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            {/* Date separator */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
              <span style={{
                background: 'rgba(255,255,255,0.85)', borderRadius: 6,
                padding: '3px 10px', fontSize: 12, color: '#54656F',
              }}>
                {formatDate(date)}
              </span>
            </div>

            {msgs.map(msg => {
              const isMine = msg.sender_id === user?.id
              const isAI = msg.message_type === 'ai'
              const isSystem = msg.message_type === 'system'

              if (isSystem) {
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                    <span style={{
                      background: 'rgba(255,255,255,0.85)', borderRadius: 8,
                      padding: '3px 12px', fontSize: 12, color: '#54656F',
                    }}>
                      {msg.content}
                    </span>
                  </div>
                )
              }

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: isMine ? 'flex-end' : 'flex-start',
                    marginBottom: 4,
                  }}
                >
                  <div style={{
                    maxWidth: '75%',
                    background: isAI
                      ? '#EDE7FF'
                      : isMine ? '#DCF8C6' : '#fff',
                    borderRadius: isMine ? '12px 12px 0 12px' : '12px 12px 12px 0',
                    padding: '6px 8px 4px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    border: isAI ? '1px solid #9C27B0' : 'none',
                  }}>
                    {/* Sender name in group (not mine) */}
                    {groupInfo.type === 'group' && !isMine && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: isAI ? '#9C27B0' : '#CC0000', marginBottom: 2 }}>
                        {isAI ? '🤖 ' : ''}{msg.sender_name}
                      </div>
                    )}

                    {msg.message_type === 'image' && msg.file_url ? (
                      <img src={msg.file_url} alt={msg.file_name ?? 'תמונה'}
                        onClick={() => window.open(msg.file_url!, '_blank')}
                        style={{ maxWidth: 220, maxHeight: 280, borderRadius: 8, display: 'block', cursor: 'pointer' }} />
                    ) : msg.message_type === 'file' && msg.file_url ? (
                      <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#111', padding: '2px 0' }}>
                        <span style={{ fontSize: 24 }}>📎</span>
                        <span style={{ fontSize: 14, wordBreak: 'break-word' }}>
                          {msg.file_name || 'קובץ'}
                          {msg.file_size ? <span style={{ color: '#8696A0', fontSize: 12 }}> · {Math.max(1, Math.round(msg.file_size / 1024))}KB</span> : null}
                        </span>
                      </a>
                    ) : (
                      <span style={{ fontSize: 14, color: '#111', lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {msg.content}
                      </span>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: '#8696A0' }}>
                        {new Date(msg.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMine && <span style={{ fontSize: 12, color: '#8696A0' }}>✓✓</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        background: '#F0F2F5', padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        {/* קלט קובץ נסתר — כפתור + פותח אותו (גלריה/קבצים) */}
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={handleFile} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="צרף קובץ"
          style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: '#fff', border: '1px solid #E0E0E0', cursor: uploading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
        >
          {uploading ? (
            <span style={{ width: 18, height: 18, border: '2px solid #ccc', borderTopColor: '#CC0000', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#54656F" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          )}
          <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
        </button>

        <div style={{
          flex: 1, background: '#fff', borderRadius: 20,
          padding: '8px 14px', display: 'flex', alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="הודעה"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            style={{
              border: 'none', outline: 'none', fontSize: 15,
              width: '100%', direction: 'rtl', background: 'none', color: '#111',
            }}
          />
        </div>

        <button
          onClick={() => {
            if (text.trim()) { handleSend(); return }
            setToast('בקרוב')
            setTimeout(() => setToast(null), 1800)
          }}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#CC0000', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {text.trim() ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill="#fff"/>
              <path d="M19 10V12C19 15.87 15.87 19 12 19C8.13 19 5 15.87 5 12V10H3V12C3 16.45 6.16 20.15 10.37 20.86L10 23H14L13.63 20.86C17.84 20.15 21 16.45 21 12V10H19Z" fill="#fff"/>
            </svg>
          )}
        </button>
      </div>

      {showPanel && (
        <GroupManagementPanel
          group={groupInfo}
          onClose={() => setShowPanel(false)}
          onGroupRenamed={(newName) => setGroupInfo(g => g ? { ...g, name: newName } : g)}
          onGroupDeleted={() => { setShowPanel(false); navigate('/chat') }}
          onMembersChanged={(count) => setGroupInfo(g => g ? { ...g, memberCount: count } : g)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '8px 18px',
          borderRadius: 20, fontSize: 14, zIndex: 1000,
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr === today) return 'היום'
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === yesterday) return 'אתמול'
  return new Date(dateStr).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}
