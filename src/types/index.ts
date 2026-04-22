// ============================================================
// Types — חג בגג פלטפורמה
// UserRole מתאים לטבלת users ב-Supabase
// ============================================================

export type UserRole = 'manager' | 'office' | 'field_worker' | 'external'

export interface Contact {
  id: string
  name: string
  role: UserRole
  avatarColor?: string
  isAI?: boolean
}

export interface Message {
  id: string
  senderId: string
  senderName: string
  text: string
  timestamp: string // HH:MM
  date: string      // YYYY-MM-DD
  read: boolean
  type: 'text' | 'image' | 'file' | 'voice' | 'system' | 'ai'
}

export interface Chat {
  id: string
  type: 'direct' | 'group'
  name: string
  participants: string[]
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  isPinned?: boolean
  isAI?: boolean
  messages: Message[]
}

// ── DB row types (Supabase) ──────────────────────────────
export interface DBGroup {
  id: string
  name: string
  type: 'direct' | 'group'
  avatar_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DBMessage {
  id: string
  group_id: string
  sender_id: string | null
  sender_name: string
  content: string | null
  message_type: 'text' | 'image' | 'file' | 'system' | 'ai'
  file_url: string | null
  file_name: string | null
  file_size: number | null
  is_pinned: boolean
  is_deleted: boolean
  created_at: string
  ai_notes: string | null
}

export interface DBUser {
  id: string
  full_name: string
  role: UserRole
  avatar_url: string | null
  is_active: boolean
}
