import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
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
})
