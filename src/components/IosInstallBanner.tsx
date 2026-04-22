import { useState, useEffect } from 'react'
import { shouldShowIosInstallPrompt, dismissIosInstallPrompt } from '../lib/pushNotifications'

// ============================================================
// IosInstallBanner — הנחיה להוספת האפליקציה למסך הבית ב-iOS
// מוצגת פעם אחת בלבד, ניתן לסגור
// ============================================================

export default function IosInstallBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // קצת עיכוב כדי לא להיות אגרסיבי מיד
    const timer = setTimeout(() => {
      setShow(shouldShowIosInstallPrompt())
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  if (!show) return null

  const handleDismiss = () => {
    dismissIosInstallPrompt()
    setShow(false)
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 70,
      right: 12,
      left: 12,
      background: '#1a1a1a',
      borderRadius: 16,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      zIndex: 1000,
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      animation: 'slideUp 0.3s ease',
    }}>
      {/* אייקון */}
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: '#CC0000', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>
        🏠
      </div>

      {/* טקסט */}
      <div style={{ flex: 1 }}>
        <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>
          הוסף למסך הבית
        </p>
        <p style={{ color: '#aaa', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
          לחץ על{' '}
          <span style={{ color: '#fff' }}>
            <svg
              style={{ display: 'inline', verticalAlign: 'middle', marginBottom: 2 }}
              width="14" height="14" viewBox="0 0 24 24" fill="none"
            >
              <path d="M12 3v13M7 8l5-5 5 5M3 21h18" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {' '}שתף
          </span>
          {' '}ואז «הוסף למסך הבית» לקבלת התראות
        </p>
      </div>

      {/* סגירה */}
      <button
        onClick={handleDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#888', fontSize: 20, padding: '0 4px', lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ×
      </button>

      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  )
}
