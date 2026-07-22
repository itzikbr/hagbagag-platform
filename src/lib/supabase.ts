import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

// ── choke-point גלובלי: timeout לכל בקשת HTTP של supabase-js ──────────
// כל קריאות ה-REST/auth/storage עוברות דרך fetch זה. אם בקשה נתקעת (stall של
// רענון-token / cold-start / רשת), ה-AbortController קוטע אותה אחרי FETCH_TIMEOUT_MS
// במקום להיתלות לנצח — כך אף מסך לא נתקע, גם כאלה ללא timeout/retry משלהם.
// הערה: realtime עובד על WebSocket (לא fetch) ולכן לא מושפע — ערוצים ארוכי-טווח
// נשארים חיים. הסף גבוה מכל ה-timeouts הפר-קומפוננטיים (עד 12ש') כדי שה-retry
// המקומי (המהיר) יקדים, וזה רק רשת-ביטחון אחרונה.
const FETCH_TIMEOUT_MS = 20000

const fetchWithTimeout: typeof fetch = (input, init = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), FETCH_TIMEOUT_MS)
  // מכבדים גם signal של הקורא (אם יש) — קוטעים את שלנו כשהוא נקטע.
  const caller = init.signal
  if (caller) {
    if (caller.aborted) controller.abort(caller.reason)
    else caller.addEventListener('abort', () => controller.abort(caller.reason), { once: true })
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // אנחנו מתחברים עם signInWithPassword, לא בזרימת OAuth-redirect,
    // אז אין צורך לנתח את ה-URL בכל טעינה (מקור נוסף לתקיעות).
    detectSessionInUrl: false,
    // ── התיקון לתקיעת הטעינה ──────────────────────────────────
    // ברירת המחדל של supabase-js משתמשת ב-Web Locks (navigator.locks)
    // לסנכרון טוקן ה-auth. ב-iOS PWA (standalone) נעילה זו נתקעת ולא
    // משתחררת אחרי מעבר לרקע/חזרה, וכל שאילתת DB שממתינה לטוקן
    // נתקעת לנצח → ה-timeout של 12 שניות ב-ExecutionSheetsList קופץ
    // ומציג "לא הצלחנו לטעון". פונקציית passthrough מריצה את הפעולה
    // ישירות בלי נעילה גלובלית ומבטלת את ה-deadlock.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
  // כל בקשות ה-HTTP עוברות דרך fetch עם timeout — ראה למעלה.
  global: { fetch: fetchWithTimeout },
})
