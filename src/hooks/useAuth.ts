import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'manager' | 'office' | 'field_worker' | 'external'

export interface UserProfile {
  id:         string
  full_name:  string
  role:       UserRole
  avatar_url: string | null
}

interface AuthState {
  user:        User | null
  profile:     UserProfile | null
  loading:     boolean
  initialized: boolean

  login:       (username: string, password: string) => Promise<void>
  logout:      () => Promise<void>
  initialize:  () => Promise<void>
  _fetchProfile: (userId: string) => Promise<UserProfile | null>
}

export const useAuth = create<AuthState>((set, get) => ({
  user:        null,
  profile:     null,
  loading:     false,
  initialized: false,

  // ──────────────────────────────────────────────
  // שליפת פרופיל מטבלת users
  // ──────────────────────────────────────────────
  _fetchProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, role, avatar_url')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('שגיאה בשליפת פרופיל:', error.message)
      return null
    }
    return data as UserProfile
  },

  // ──────────────────────────────────────────────
  // כניסה: שם משתמש → @hagbagag.local
  // ──────────────────────────────────────────────
  login: async (username: string, password: string) => {
    const email = `${username.trim().toLowerCase()}@hagbagag.local`

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)

    const profile = await get()._fetchProfile(data.user.id)
    set({ user: data.user, profile })
  },

  // ──────────────────────────────────────────────
  // יציאה
  // ──────────────────────────────────────────────
  logout: async () => {
    set({ loading: true })
    try {
      // scope 'local' מנקה את הסשן במכשיר בלי קריאת רשת שעלולה להיכשל
      // (טוקן שפג / אופליין) ולחסום את ההתנתקות
      await supabase.auth.signOut({ scope: 'local' })
    } catch (e) {
      console.warn('signOut נכשל — מנקים סשן מקומי בכל מקרה:', e)
    } finally {
      // תמיד מנקים את המצב המקומי כדי שההתנתקות תצליח בכל תרחיש
      set({ user: null, profile: null, loading: false })
    }
  },

  // ──────────────────────────────────────────────
  // אתחול — בדיקת סשן קיים בעליית האפליקציה
  // ──────────────────────────────────────────────
  initialize: async () => {
    set({ loading: true })

    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
      const profile = await get()._fetchProfile(session.user.id)
      set({ user: session.user, profile, loading: false, initialized: true })
    } else {
      set({ loading: false, initialized: true })
    }

    // האזנה לשינויי session (refresh, sign-out ממכשיר אחר)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await get()._fetchProfile(session.user.id)
        set({ user: session.user, profile })
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, profile: null })
      }
    })
  },
}))
