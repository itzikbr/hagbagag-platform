export type UserRole = 'admin' | 'office' | 'field' | 'external'

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
  text: string
  timestamp: string // HH:MM
  date: string      // YYYY-MM-DD
  read: boolean
  type: 'text' | 'image' | 'file' | 'voice'
}

export interface Chat {
  id: string
  type: 'direct' | 'group'
  name: string
  participants: string[] // contact IDs
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  isPinned?: boolean
  isAI?: boolean
  messages: Message[]
}
