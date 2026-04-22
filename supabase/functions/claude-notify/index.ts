// ============================================================
// Supabase Edge Function — claude-notify
// שולח events לקלוד ומדווח לאיציק בצ'אט הפרטי
// ============================================================
// Deploy: supabase functions deploy claude-notify
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLAUDE_API_KEY   = Deno.env.get('ANTHROPIC_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MANAGER_USER_ID  = Deno.env.get('MANAGER_USER_ID')!   // ה-UUID של איציק ב-Supabase Auth
const CLAUDE_GROUP_ID  = Deno.env.get('CLAUDE_GROUP_ID')! // ה-UUID של קבוצת קלוד-איציק

type EventType =
  | 'new_sheet'
  | 'sheet_submitted'
  | 'electrical_marked'   // חוטי חשמל סומנו — דחוף!
  | 'new_group_message'   // סיכום יומי
  | 'user_joined'

interface AppEvent {
  type: EventType
  user: { id: string; name: string; role: string }
  data: Record<string, unknown>
  timestamp: string
}

// ============================================================
// בונה prompt לקלוד לפי סוג האירוע
// ============================================================
function buildPrompt(event: AppEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  })

  switch (event.type) {
    case 'new_sheet':
      return `[${time}] ${event.user.name} פתח דף ביצוע חדש: "${event.data.project_name}". לקוח: ${event.data.customer ?? '—'}. כתובת: ${event.data.address ?? '—'}.`

    case 'sheet_submitted':
      return `[${time}] ${event.user.name} הגיש דף ביצוע: "${event.data.project_name}". פרויקט מוכן לאישור.`

    case 'electrical_marked':
      return `⚡ [${time}] התראה: ${event.user.name} סימן חוטי חשמל בדף ביצוע "${event.data.project_name}". פרויקט: ${event.data.project_id}. נדרשת תשומת לב מיידית.`

    case 'new_group_message':
      return `[${time}] ${event.data.count} הודעות חדשות בקבוצה "${event.data.group_name}" היום. שולחים: ${event.data.senders}.`

    case 'user_joined':
      return `[${time}] משתמש חדש הצטרף למערכת: ${event.user.name} (${event.user.role}).`

    default:
      return `[${time}] אירוע: ${event.type} — ${JSON.stringify(event.data)}`
  }
}

// ============================================================
// קורא לקלוד ומחזיר תגובה
// ============================================================
async function askClaude(userMessage: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: `אתה קלוד, העוזר הדיגיטלי הפרטי של איציק בריסקין מחג בגג בע"מ.
אתה מקבל עדכונים על פעילות במערכת ומדווח לאיציק בצורה תמציתית ברורה בעברית.
אם יש התראה דחופה (חשמל, בטיחות) — הדגש זאת בתחילת ההודעה.
השב בשפה עברית בלבד, בטון ישיר וממוקד. מקסימום 3 משפטים.`,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error: ${err}`)
  }

  const json = await res.json()
  return json.content?.[0]?.text ?? '...'
}

// ============================================================
// שומר הודעת קלוד בצ'אט הפרטי של איציק
// ============================================================
async function saveClaudeMessage(supabase: ReturnType<typeof createClient>, text: string) {
  const { error } = await supabase.from('messages').insert({
    group_id: CLAUDE_GROUP_ID,
    sender_id: null,
    content: text,
  })
  if (error) console.error('Failed to save Claude message:', error)
}

// ============================================================
// Handler ראשי
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const event: AppEvent = await req.json()

    // וולידציה בסיסית
    if (!event.type || !event.user || !event.timestamp) {
      return new Response(JSON.stringify({ error: 'Invalid event structure' }), { status: 400 })
    }

    // בנה prompt
    const prompt = buildPrompt(event)

    // קבל תגובה מקלוד
    const claudeReply = await askClaude(prompt)

    // שמור בצ'אט
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    await saveClaudeMessage(supabase, claudeReply)

    return new Response(JSON.stringify({ ok: true, reply: claudeReply }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('claude-notify error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
