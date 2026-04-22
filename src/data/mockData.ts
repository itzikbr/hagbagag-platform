import { Contact, Chat } from '../types'

export const CURRENT_USER_ID = 'itzik'

export const contacts: Contact[] = [
  { id: 'claude',  name: 'קלוד',  role: 'admin',    isAI: true },
  { id: 'itzik',   name: 'איציק', role: 'admin',    avatarColor: '#CC0000' },
  { id: 'asaf',    name: 'אסף',   role: 'office',   avatarColor: '#E67E22' },
  { id: 'dalia',   name: 'דליה',  role: 'office',   avatarColor: '#9B59B6' },
  { id: 'moti',    name: 'מוטי',  role: 'office',   avatarColor: '#2980B9' },
  { id: 'amad',    name: 'עמאד',  role: 'field',    avatarColor: '#27AE60' },
  { id: 'samir',   name: 'סמיר',  role: 'field',    avatarColor: '#16A085' },
  { id: 'ali',     name: 'עלי',   role: 'field',    avatarColor: '#D35400' },
  { id: 'ext1',    name: 'ביטחון — יוסי', role: 'external', avatarColor: '#7F8C8D' },
]

export const getContact = (id: string): Contact | undefined =>
  contacts.find(c => c.id === id)

export const chats: Chat[] = [
  {
    id: 'claude',
    type: 'direct',
    name: 'קלוד — עוזר אישי',
    participants: ['itzik', 'claude'],
    lastMessage: 'שלום איציק! במה אוכל לעזור היום?',
    lastMessageTime: '09:14',
    unreadCount: 1,
    isPinned: true,
    isAI: true,
    messages: [
      { id: 'm1', senderId: 'claude', text: 'שלום איציק! אני קלוד, העוזר הדיגיטלי של חג בגג. במה אוכל לעזור היום?', timestamp: '09:14', date: '2026-04-21', read: false, type: 'text' },
    ],
  },
  {
    id: 'field-team',
    type: 'group',
    name: 'צוות שטח',
    participants: ['itzik', 'amad', 'samir', 'ali'],
    lastMessage: 'עמאד: הגענו לאתר, מתחילים עבודה',
    lastMessageTime: '08:47',
    unreadCount: 3,
    isPinned: false,
    isAI: false,
    messages: [
      { id: 'm1', senderId: 'amad',  text: 'בוקר טוב לכולם',               timestamp: '07:30', date: '2026-04-21', read: true,  type: 'text' },
      { id: 'm2', senderId: 'samir', text: 'בוקר טוב עמאד',                timestamp: '07:35', date: '2026-04-21', read: true,  type: 'text' },
      { id: 'm3', senderId: 'itzik', text: 'בוקר טוב, נסיעה טובה לכולם',   timestamp: '07:40', date: '2026-04-21', read: true,  type: 'text' },
      { id: 'm4', senderId: 'amad',  text: 'הגענו לאתר, מתחילים עבודה',    timestamp: '08:47', date: '2026-04-21', read: false, type: 'text' },
    ],
  },
  {
    id: 'asaf',
    type: 'direct',
    name: 'אסף',
    participants: ['itzik', 'asaf'],
    lastMessage: 'אשלח לך את ההצעה עד הצהריים',
    lastMessageTime: 'אתמול',
    unreadCount: 0,
    isPinned: false,
    isAI: false,
    messages: [
      { id: 'm1', senderId: 'itzik', text: 'אסף, קיבלת את המסמכים?',                timestamp: '14:00', date: '2026-04-20', read: true, type: 'text' },
      { id: 'm2', senderId: 'asaf',  text: 'כן, עברתי עליהם. יש כמה שאלות',         timestamp: '14:20', date: '2026-04-20', read: true, type: 'text' },
      { id: 'm3', senderId: 'itzik', text: 'בוא נדבר על זה מחר בבוקר',              timestamp: '14:25', date: '2026-04-20', read: true, type: 'text' },
      { id: 'm4', senderId: 'asaf',  text: 'אשלח לך את ההצעה עד הצהריים',          timestamp: '18:30', date: '2026-04-20', read: true, type: 'text' },
    ],
  },
  {
    id: 'amad',
    type: 'direct',
    name: 'עמאד',
    participants: ['itzik', 'amad'],
    lastMessage: 'אוקי בוס, מסודר',
    lastMessageTime: 'אתמול',
    unreadCount: 0,
    isPinned: false,
    isAI: false,
    messages: [
      { id: 'm1', senderId: 'itzik', text: 'עמאד, הפרויקט ברחוב הרצל — תגיע מחר 7:00',   timestamp: '17:00', date: '2026-04-20', read: true, type: 'text' },
      { id: 'm2', senderId: 'amad',  text: 'אוקי בוס, מסודר',                              timestamp: '17:05', date: '2026-04-20', read: true, type: 'text' },
    ],
  },
  {
    id: 'samir',
    type: 'direct',
    name: 'סמיר',
    participants: ['itzik', 'samir'],
    lastMessage: 'שלחתי תמונות מהגג',
    lastMessageTime: 'אתמול',
    unreadCount: 2,
    isPinned: false,
    isAI: false,
    messages: [
      { id: 'm1', senderId: 'samir', text: 'שלחתי תמונות מהגג, תסתכל בבקשה',  timestamp: '16:00', date: '2026-04-20', read: false, type: 'text' },
      { id: 'm2', senderId: 'samir', text: 'יש עוד משהו שצריך לבדוק?',          timestamp: '16:30', date: '2026-04-20', read: false, type: 'text' },
    ],
  },
  {
    id: 'dalia',
    type: 'direct',
    name: 'דליה',
    participants: ['itzik', 'dalia'],
    lastMessage: 'הזמנה 1247 אושרה',
    lastMessageTime: 'שני',
    unreadCount: 0,
    isPinned: false,
    isAI: false,
    messages: [
      { id: 'm1', senderId: 'dalia', text: 'הזמנה 1247 אושרה על ידי הלקוח', timestamp: '11:00', date: '2026-04-19', read: true, type: 'text' },
      { id: 'm2', senderId: 'itzik', text: 'תודה דליה!',                     timestamp: '11:05', date: '2026-04-19', read: true, type: 'text' },
    ],
  },
]

export const getChatById = (id: string): Chat | undefined =>
  chats.find(c => c.id === id)
