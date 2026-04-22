import { Contact } from '../types'

interface AvatarProps {
  contact?: Contact
  name?: string
  size?: number
  isGroup?: boolean
}

const AVATAR_COLORS = [
  '#E67E22', '#9B59B6', '#2980B9', '#27AE60',
  '#16A085', '#D35400', '#C0392B', '#8E44AD',
]

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return parts[0][0] + parts[1][0]
  return name.substring(0, 2)
}

export default function Avatar({ contact, name, size = 48, isGroup = false }: AvatarProps) {
  const displayName = contact?.name ?? name ?? '?'
  const isAI = contact?.isAI

  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: size * 0.35,
    fontWeight: 700,
    color: '#fff',
    userSelect: 'none',
  }

  if (isAI) {
    return (
      <div style={{ ...style, background: '#1a0a0a', border: '2px solid #CC0000' }}>
        <span style={{ fontSize: size * 0.4, color: '#CC0000' }}>✦</span>
      </div>
    )
  }

  if (isGroup) {
    return (
      <div style={{ ...style, background: '#8B0000' }}>
        <span style={{ fontSize: size * 0.45 }}>👥</span>
      </div>
    )
  }

  const bg = contact?.avatarColor ?? nameToColor(displayName)
  return (
    <div style={{ ...style, background: bg }}>
      {getInitials(displayName)}
    </div>
  )
}
