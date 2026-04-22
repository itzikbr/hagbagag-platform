// ============================================================
// Push Notifications — רישום + שליחה
// ============================================================

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

// המרת base64 ל-Uint8Array (נדרש לרישום push)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// ──────────────────────────────────────────────
// רישום Service Worker
// ──────────────────────────────────────────────
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported')
    return null
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    console.log('SW registered:', reg.scope)
    return reg
  } catch (err) {
    console.error('SW registration failed:', err)
    return null
  }
}

// ──────────────────────────────────────────────
// בקשת הרשאת push מהמשתמש
// ──────────────────────────────────────────────
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

// ──────────────────────────────────────────────
// רישום מנוי push ב-Supabase
// (שומר את endpoint המכשיר לשליחת הודעות בעתיד)
// ──────────────────────────────────────────────
export async function subscribeToPush(
  userId: string,
  saveFn: (sub: object) => Promise<void>
): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('VAPID_PUBLIC_KEY not set — push disabled')
    return false
  }

  const reg = await registerServiceWorker()
  if (!reg) return false

  const permission = await requestPushPermission()
  if (permission !== 'granted') return false

  try {
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    await saveFn({ userId, subscription: subscription.toJSON() })
    console.log('Push subscription saved')
    return true
  } catch (err) {
    console.error('Push subscription failed:', err)
    return false
  }
}

// ──────────────────────────────────────────────
// הצג הנחיה להוספת לדף הבית (iOS)
// ──────────────────────────────────────────────
export function shouldShowIosInstallPrompt(): boolean {
  const ua = navigator.userAgent
  const isIos = /iphone|ipad|ipod/i.test(ua)
  const isInStandalone = ('standalone' in navigator) && (navigator as unknown as { standalone: boolean }).standalone
  const alreadyDismissed = localStorage.getItem('ios_install_dismissed') === '1'
  return isIos && !isInStandalone && !alreadyDismissed
}

export function dismissIosInstallPrompt() {
  localStorage.setItem('ios_install_dismissed', '1')
}
