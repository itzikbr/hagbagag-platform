import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DBMessage } from '../types'
import Avatar from '../components/Avatar'
import GroupManagementPanel from '../components/GroupManagementPanel'
import { reportClient, errDetail } from '../lib/report'

// מכווץ תמונה: מקסימום maxW רוחב (שומר יחס), JPEG באיכות quality. מחזיר Blob.
// מקטין משמעותית את נפח ההעלאה מהנייד. זורק אם משהו נכשל (המתקשר נופל למקור).
function downscaleImage(file: File, maxW = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read-fail'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('img-fail'))
      img.onload = () => {
        let width = img.width, height = img.height
        if (width > maxW) { height = Math.round(height * maxW / width); width = maxW }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('no-ctx')); return }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('blob-fail')), 'image/jpeg', quality)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
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
  const [pending, setPending] = useState<{ file: File; url: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef(pending); pendingRef.current = pending
  // ניקוי object URLs של תצוגה מקדימה ביציאה מהמסך
  useEffect(() => () => { pendingRef.current.forEach(p => URL.revokeObjectURL(p.url)) }, [])
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // ── lazy-load הודעות: 50 אחרונות + טעינת ישנות בגלילה למעלה ──
  const PAGE_SIZE = 50
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const oldestRef = useRef<string | null>(null)
  const prependingRef = useRef(false)
  const didInitialScrollRef = useRef(false)

  // גלילה: טעינה ראשונית → לתחתית; הודעה חדשה → לתחתית רק אם קרובים לתחתית;
  // prepend (טעינת ישנות) → המיקום נשמר ידנית ב-loadOlder, לכן מדלגים כאן.
  useEffect(() => {
    if (prependingRef.current) { prependingRef.current = false; return }
    const el = scrollRef.current
    if (!el) return
    if (!didInitialScrollRef.current) {
      el.scrollTop = el.scrollHeight
      if (messages.length) didInitialScrollRef.current = true
      return
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [messages])

  // Load group info + messages + subscribe to realtime
  useEffect(() => {
    if (!groupId || !user) return
    loadGroupAndMessages()

    const channel = supabase
      .channel(`group-${groupId}-${Math.random().toString(36).slice(2)}`)
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

  // ניסיון בודד: פרטי הקבוצה + ההודעות, עם timeout משותף. זורק על שגיאה/פג-זמן — כדי
  // שהריטריי יתפוס (בעבר השגיאה נבלעה ב-destructure → "שיחה לא נמצאה" קבוע ללא ריטריי).
  // מחזיר null רק כשהקבוצה באמת לא קיימת (0 שורות, PGRST116) — שם אין טעם בריטריי.
  async function fetchConversationOnce(timeoutMs: number): Promise<{ group: GroupInfo; messages: DBMessage[] } | null> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs) })
    const race = <T,>(p: PromiseLike<T>) => Promise.race([p, timeout]) as Promise<T>
    try {
      // כל השאילתות במקביל — כולן תלויות רק ב-groupId, לא זו בזו. שם החבר בשיחת direct
      // נשלף ישירות עם embed של users (בלי סבב נוסף). כך: סבב רשת אחד במקום ~5 סדרתיים.
      const [gRes, cRes, mRes, oRes] = await Promise.all([
        race(supabase.from('groups').select('id, name, type').eq('id', groupId).single()),
        race(supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', groupId).is('left_at', null)),
        race(supabase.from('messages').select('*').eq('group_id', groupId).eq('is_deleted', false).order('created_at', { ascending: false }).limit(PAGE_SIZE)),
        race(supabase.from('group_members').select('user_id, users:user_id(full_name)').eq('group_id', groupId).is('left_at', null).neq('user_id', user?.id ?? '').limit(1)),
      ]) as [
        { data: { id: string; name: string; type: string } | null; error: { message: string; code?: string } | null },
        { count: number | null },
        { data: DBMessage[] | null; error: { message: string } | null },
        { data: { user_id: string; users: { full_name: string } | null }[] | null },
      ]

      const gErr = gRes.error
      if (gErr) {
        if (gErr.code === 'PGRST116') return null   // הקבוצה לא קיימת → not-found סופי
        throw new Error(gErr.message || 'groups error') // רשת/רענון-טוקן/5xx → ריטריי
      }
      const gData = gRes.data
      if (!gData) return null
      if (mRes.error) throw new Error(mRes.error.message || 'messages error')

      // בשיחת direct מציגים את שם החבר האחר (מה-embed); אחרת השם המאוחסן.
      let displayName = gData.name
      if (gData.type === 'direct') {
        const other = oRes.data?.[0]?.users?.full_name
        if (other) displayName = other
      }

      return {
        group: { id: gData.id, name: displayName, type: gData.type as 'direct' | 'group', memberCount: cRes.count ?? 0 },
        messages: ((mRes.data ?? []) as DBMessage[]).slice().reverse(),   // asc לתצוגה
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async function loadGroupAndMessages() {
    if (!groupId) return
    setLoading(true)
    didInitialScrollRef.current = false
    oldestRef.current = null
    setHasMore(false)

    // timeout מדורג + retry כמו ב-ChatList: ניסיון ראשון קצר תופס stall של cold-start
    // ב-PWA של iOS, והריטריי (שמצליח) קופץ מהר. שגיאה חולפת בשאילתת ה-groups כבר לא
    // נבלעת → מנסים שוב, ורק כשהקבוצה באמת לא קיימת (או אחרי מיצוי הריטריי) מציגים "לא נמצאה".
    const TIMEOUTS = [4000, 8000, 12000, 12000]
    const t0 = Date.now()
    try {
      let result: { group: GroupInfo; messages: DBMessage[] } | null = null
      let lastErr: unknown = null
      let usedAttempts = 0
      for (let i = 0; i < TIMEOUTS.length; i++) {
        usedAttempts = i + 1
        try { result = await fetchConversationOnce(TIMEOUTS[i]); lastErr = null; break }
        catch (e) { lastErr = e; if (i < TIMEOUTS.length - 1) await new Promise(r => setTimeout(r, 250)) }
      }
      if (lastErr) {
        console.error('[chat] load failed after retries:', lastErr)
        reportClient({ where: 'chat-load-failed', online: navigator.onLine, ...errDetail(lastErr) })
      } else if (result) {
        reportClient({ where: 'chat-load-ok', ms: Date.now() - t0, attempts: usedAttempts, online: navigator.onLine })
        setGroupInfo(result.group)
        setMessages(result.messages)
        oldestRef.current = result.messages[0]?.created_at ?? null
        setHasMore(result.messages.length >= PAGE_SIZE)
      }
      // result === null → הקבוצה לא קיימת; groupInfo נשאר null → "שיחה לא נמצאה"
    } finally {
      setLoading(false)   // תמיד — לא נתקעים על "טוען…"
    }
  }

  // טעינת הודעות ישנות (בגלילה לראש) — prepend תוך שמירת מיקום הגלילה
  async function loadOlder() {
    if (loadingOlder || !hasMore || !oldestRef.current || !groupId) return
    setLoadingOlder(true)
    const el = scrollRef.current
    const prevH = el?.scrollHeight ?? 0
    const prevT = el?.scrollTop ?? 0
    try {
      const { data } = await supabase.from('messages').select('*')
        .eq('group_id', groupId).eq('is_deleted', false)
        .lt('created_at', oldestRef.current)
        .order('created_at', { ascending: false }).limit(PAGE_SIZE)
      const older = ((data ?? []) as DBMessage[]).slice().reverse()
      if (older.length) {
        prependingRef.current = true
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id))
          return [...older.filter(m => !ids.has(m.id)), ...prev]
        })
        oldestRef.current = older[0].created_at
        requestAnimationFrame(() => {
          const el2 = scrollRef.current
          if (el2) el2.scrollTop = prevT + (el2.scrollHeight - prevH)
        })
      }
      setHasMore(older.length >= PAGE_SIZE)
    } catch (e) {
      console.error('[chat] load older failed:', e)
    } finally {
      setLoadingOlder(false)
    }
  }
  const onMessagesScroll = () => {
    const el = scrollRef.current
    if (el && el.scrollTop < 80 && hasMore && !loadingOlder) loadOlder()
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

  // בחירת תמונות (רב-בחירה) → נכנסות ל-pending לתצוגה מקדימה, בלי העלאה עדיין
  const pickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''  // מאפשר לבחור שוב אותם קבצים
    if (!files.length) return
    setPending(prev => [...prev, ...files.map(f => ({ file: f, url: URL.createObjectURL(f) }))])
  }

  const removePending = (i: number) => setPending(prev => {
    const it = prev[i]; if (it) URL.revokeObjectURL(it.url)
    return prev.filter((_, j) => j !== i)
  })

  // שליחה: מעלה את כל התמונות שנבחרו יחד (כיווץ 1200px/JPEG80% לכל אחת), ורק אז
  const sendPending = async () => {
    if (!pending.length || !groupId || !user || !profile || uploading) return
    const items = pending
    setUploading(true)
    try {
      for (const { file } of items) {
        let upload: Blob = file, ext = 'jpg', contentType: string | undefined = 'image/jpeg'
        const compressed = await downscaleImage(file, 1200, 0.8).catch(() => null)
        if (compressed) { upload = compressed }
        else { ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, ''); contentType = file.type || undefined; upload = file }
        const rand = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2))
        const path = `${groupId}/${rand}.${ext}`
        const { error: upErr } = await supabase.storage.from('chat-files').upload(path, upload, { contentType })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('chat-files').getPublicUrl(path)
        const { error: msgErr } = await supabase.from('messages').insert({
          group_id: groupId, sender_id: user.id, sender_name: profile.full_name,
          content: '', message_type: 'image', file_url: pub.publicUrl, file_name: file.name, file_size: upload.size,
        })
        if (msgErr) throw msgErr
      }
      items.forEach(it => URL.revokeObjectURL(it.url))
      setPending([])
    } catch (err) {
      console.error('שגיאה בהעלאת תמונות:', err)
      setToast('העלאת התמונות נכשלה')
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
      <div ref={scrollRef} onScroll={onMessagesScroll} style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }} className="no-scrollbar">
        {loadingOlder && (
          <div style={{ textAlign: 'center', color: '#8696A0', fontSize: 12, padding: '6px 0' }}>טוען הודעות קודמות…</div>
        )}
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

      {/* תצוגה מקדימה של התמונות שנבחרו — לפני שליחה */}
      {pending.length > 0 && (
        <div style={{ background: '#F0F2F5', padding: '8px 12px 0', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 }} className="no-scrollbar">
          {pending.map((p, i) => (
            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
              <img src={p.url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
              <button onClick={() => removePending(i)} aria-label="הסר"
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#000', color: '#fff', border: '2px solid #F0F2F5', cursor: 'pointer', fontSize: 11, lineHeight: '15px', padding: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{
        background: '#F0F2F5', padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        {/* קלט תמונות נסתר (רב-בחירה) — כפתור + פותח אותו */}
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={pickImages} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="צרף תמונות"
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
            if (uploading) return
            if (pending.length) { sendPending(); return }
            if (text.trim()) { handleSend(); return }
            setToast('בקרוב')
            setTimeout(() => setToast(null), 1800)
          }}
          disabled={uploading}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#CC0000', border: 'none', cursor: uploading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {(text.trim() || pending.length) ? (
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
