import { useState, useRef, useEffect } from 'react'

// ============================================================
// ✨ מסך שיחה עם Gemini — אדמין (איציק) בלבד.
// צ'אט פשוט: הודעות + שדה קלט. כל הודעה נשלחת ל-/gemini-api/chat
// (עובר דרך Caddy ל-gemini-server.js:3001) ומחזירה תשובה מ-Gemini.
// עיצוב תואם לשאר האפליקציה (כמו ChatConversation).
// ============================================================

const RED = '#CC0000'

interface Msg {
  role: 'user' | 'model'
  text: string
  image?: string  // dataURL להצגה בבועה (רק בהודעות משתמש)
}

interface PendingImage { dataUrl: string; mimeType: string; base64: string }

// קורא קובץ תמונה, מקטין למקסימום 1280px ומחזיר JPEG base64 (מקטין נפח ומאיץ שליחה).
function readImage(file: File): Promise<PendingImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read-fail'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('img-fail'))
      img.onload = () => {
        const maxDim = 1280
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height)
          width = Math.round(width * s); height = Math.round(height * s)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('no-ctx')); return }
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        resolve({ dataUrl, mimeType: 'image/jpeg', base64: dataUrl.split(',')[1] })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export default function GeminiChat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [micNote, setMicNote] = useState<string | null>(null)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // האם הדפדפן תומך בזיהוי קול (Chrome/Edge/Safari מודרני; ב-webkit עם קידומת)
  const speechSupported = typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  // גלילה לתחתית כשמגיעה הודעה או בזמן "מקליד…"
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // התאמת גובה ה-textarea לתוכן (עד ~5 שורות). רץ בכל שינוי טקסט —
  // כולל הקלדה, ניקוי אחרי שליחה, והחזרת טקסט אחרי כשל.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [text])

  // עצירת הזיהוי אם עוזבים את המסך
  useEffect(() => () => { try { recognitionRef.current?.stop() } catch { /* noop */ } }, [])

  // הפעלה/עצירה של זיהוי קול בעברית. תמלול סופי נכנס לשדה ונשלח אוטומטית.
  const toggleMic = () => {
    if (!speechSupported) {
      setMicNote('זיהוי קול לא נתמך בדפדפן הזה')
      setTimeout(() => setMicNote(null), 2500)
      return
    }
    if (listening) { try { recognitionRef.current?.stop() } catch { /* noop */ } return }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'he-IL'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.continuous = false
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any)
        .map((r: any) => r[0]?.transcript || '').join(' ').trim()
      if (transcript) { setText(transcript); send(transcript) }
    }
    rec.onerror = (e: any) => {
      setListening(false)
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setMicNote('אין הרשאת מיקרופון')
        setTimeout(() => setMicNote(null), 2500)
      }
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    setMicNote(null)
    setListening(true)
    try { rec.start() } catch { setListening(false) }
  }

  const send = async (override?: string) => {
    const content = (override ?? text).trim()
    const img = pendingImage
    if ((!content && !img) || sending) return
    setText('')
    setErrorMsg(null)
    setPendingImage(null)

    // ההיסטוריה שנשלחת לשרת = כל מה שהיה עד עכשיו (לפני ההודעה החדשה)
    const history = messages.map(m => ({ role: m.role, text: m.text }))
    setMessages(prev => [...prev, { role: 'user', text: content, image: img?.dataUrl }])
    setSending(true)

    try {
      const body: any = { message: content, history }
      if (img) body.image = { mimeType: img.mimeType, data: img.base64 }
      const r = await fetch('/gemini-api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json().catch(() => ({}))
      if (r.status === 429 || data.quota) throw new Error('quota')
      if (r.status === 503 || data.busy) throw new Error('busy')
      if (!r.ok || !data.reply) throw new Error('fail')
      setMessages(prev => [...prev, { role: 'model', text: String(data.reply) }])
    } catch (e) {
      // הבחנה: מכסה יומית / עומס זמני / כשל כללי
      const m = (e as Error).message
      setErrorMsg(m === 'quota'
        ? 'מכסת Gemini היומית נגמרה — נסה שוב מאוחר יותר'
        : m === 'busy'
        ? 'Gemini עמוס כרגע — נסה שוב עוד רגע'
        : 'השליחה נכשלה — נסה שוב')
      // מחזירים את הטקסט/התמונה כדי שאפשר לנסות שוב
      setText(content)
      setPendingImage(img)
      setMessages(prev => prev.slice(0, -1)) // מסירים את הודעת המשתמש שנכשלה
    } finally {
      setSending(false)
    }
  }

  // בחירת תמונה מהגלריה → הקטנה → נשמרת כ-pending עד השליחה
  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // כדי שאפשר לבחור שוב את אותו קובץ
    if (!file) return
    try { setPendingImage(await readImage(file)) }
    catch {
      setMicNote('טעינת התמונה נכשלה')
      setTimeout(() => setMicNote(null), 2500)
    }
  }

  // כתיבה ללוח עם fallback ל-execCommand. מחזיר האם הצליח.
  const writeClipboard = async (str: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(str); return true }
      const ta = document.createElement('textarea')
      ta.value = str; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      return true
    } catch { return false }
  }

  // העתקת בועת תשובה בודדת
  const copyMsg = async (i: number, txt: string) => {
    if (await writeClipboard(txt)) { setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1500) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#ECE5DD' }}>
      {/* Header */}
      <div style={{
        background: RED, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 24, lineHeight: 1 }}>✨</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 17 }}>שיחה עם Gemini</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>העוזר האישי שלך</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }} className="no-scrollbar">
        {messages.length === 0 && !sending && (
          <div style={{ textAlign: 'center', color: '#54656F', marginTop: 40, padding: '0 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✨</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#3F4A5A' }}>מה תרצה לשאול?</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>שיחה חופשית עם Gemini — כתוב הודעה למטה.</div>
          </div>
        )}

        {messages.map((m, i) => {
          const isMine = m.role === 'user'
          return (
            <div key={i} style={{
              display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 6,
            }}>
              <div style={{
                maxWidth: '80%',
                background: isMine ? '#DCF8C6' : '#fff',
                borderRadius: isMine ? '12px 12px 0 12px' : '12px 12px 12px 0',
                padding: '8px 12px 6px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                border: isMine ? 'none' : '1px solid #EBD9F5',
              }}>
                {!isMine && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#8A3FBF', marginBottom: 2 }}>✨ Gemini</div>
                )}
                {m.image && (
                  <img src={m.image} alt="תמונה" style={{
                    display: 'block', maxWidth: '100%', width: 200, borderRadius: 8,
                    marginBottom: m.text ? 6 : 0,
                  }} />
                )}
                {m.text && (
                  <span style={{
                    fontSize: 17, color: '#111', lineHeight: 1.5,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', direction: 'rtl',
                  }}>
                    {m.text}
                  </span>
                )}
                {/* כפתור העתקה בכל בועת תשובה של Gemini */}
                {!isMine && m.text && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
                    <button
                      onClick={() => copyMsg(i, m.text)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontSize: 12, fontWeight: 600,
                        color: copiedIdx === i ? '#16A34A' : '#8A3FBF',
                      }}
                    >
                      {copiedIdx === i ? 'הועתק ✓' : '📋 העתק'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* אינדיקטור "מקליד…" בזמן המתנה לתשובה */}
        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 6 }}>
            <div style={{
              background: '#fff', borderRadius: '12px 12px 12px 0', padding: '10px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)', border: '1px solid #EBD9F5',
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0, 1, 2].map(n => (
                <span key={n} style={{
                  width: 7, height: 7, borderRadius: '50%', background: '#B39CCB',
                  animation: 'gemBlink 1s infinite', animationDelay: `${n * 0.2}s`,
                }} />
              ))}
              <style>{'@keyframes gemBlink { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }'}</style>
            </div>
          </div>
        )}

        {errorMsg && (
          <div style={{ textAlign: 'center', color: RED, fontSize: 13, margin: '8px 0' }}>
            {errorMsg}
          </div>
        )}

        {micNote && (
          <div style={{ textAlign: 'center', color: '#8A3FBF', fontSize: 13, margin: '8px 0' }}>
            {micNote}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* תצוגה מקדימה של תמונה שנבחרה, לפני שליחה */}
      {pendingImage && (
        <div style={{
          background: '#F0F2F5', padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{ position: 'relative' }}>
            <img src={pendingImage.dataUrl} alt="לשליחה" style={{ height: 56, borderRadius: 8, display: 'block' }} />
            <button
              onClick={() => setPendingImage(null)}
              aria-label="הסר תמונה"
              style={{
                position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                background: '#000', color: '#fff', border: '2px solid #F0F2F5', cursor: 'pointer',
                fontSize: 11, lineHeight: '16px', padding: 0,
              }}
            >✕</button>
          </div>
          <span style={{ fontSize: 13, color: '#54656F' }}>תמונה מצורפת</span>
        </div>
      )}

      {/* Input bar */}
      <div style={{
        background: '#F0F2F5', padding: '8px 12px',
        display: 'flex', alignItems: 'flex-end', gap: 8, flexShrink: 0,
      }}>
        {/* input קובץ נסתר — 📷 פותח אותו */}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
        <div style={{
          flex: 1, background: '#fff', borderRadius: 20, padding: '8px 14px',
          display: 'flex', alignItems: 'flex-end', gap: 8,
        }}>
          {/* textarea: Enter לעולם לא שולח — רק מוסיף שורה חדשה (התנהגות textarea רגילה).
              השליחה היחידה היא דרך כפתור השליחה. הגובה גדל עם התוכן עד ~5 שורות. */}
          <textarea
            ref={taRef}
            rows={1}
            placeholder={listening ? 'מקשיב… דבר עכשיו' : 'כתוב הודעה ל-Gemini'}
            value={text}
            onChange={e => setText(e.target.value)}
            style={{
              border: 'none', outline: 'none', fontSize: 16,
              width: '100%', direction: 'rtl', background: 'none', color: '#111',
              resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
              maxHeight: 120, overflowY: 'auto', display: 'block',
            }}
          />
          {/* תמונה — פותח גלריה */}
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="צרף תמונה"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              width: 30, height: 30, flexShrink: 0, fontSize: 20, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >📷</button>
          {/* מיקרופון — זיהוי קול בעברית */}
          <button
            onClick={toggleMic}
            aria-label="דיבור"
            style={{
              background: listening ? RED : 'none', border: 'none', cursor: 'pointer',
              padding: 0, width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: speechSupported ? 1 : 0.4,
              animation: listening ? 'micPulse 1.2s infinite' : 'none',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill={listening ? '#fff' : '#8696A0'}/>
              <path d="M19 10V12C19 15.87 15.87 19 12 19C8.13 19 5 15.87 5 12V10H3V12C3 16.45 6.16 20.15 10.37 20.86L10 23H14L13.63 20.86C17.84 20.15 21 16.45 21 12V10H19Z" fill={listening ? '#fff' : '#8696A0'}/>
            </svg>
            <style>{'@keyframes micPulse { 0%,100%{box-shadow:0 0 0 0 rgba(204,0,0,0.5)} 50%{box-shadow:0 0 0 6px rgba(204,0,0,0)} }'}</style>
          </button>
        </div>

        <button
          type="button"
          // onMouseDown/preventDefault שומר על הפוקוס בשדה: ב-iOS הקשה על הכפתור
          // בזמן שהמקלדת פתוחה הייתה מטשטשת (blur) את השדה ו"בולעת" את הלחיצה,
          // כך שההודעה לא נשלחה. מניעת ברירת המחדל גורמת ל-onClick לפעול תמיד.
          onMouseDown={e => e.preventDefault()}
          onClick={() => send()}
          disabled={(!text.trim() && !pendingImage) || sending}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: ((!text.trim() && !pendingImage) || sending) ? '#E0A5A5' : RED,
            border: 'none', cursor: ((!text.trim() && !pendingImage) || sending) ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
