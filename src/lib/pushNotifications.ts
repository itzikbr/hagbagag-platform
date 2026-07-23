// ============================================================
// Push Notifications — רישום + שליחה
// ============================================================
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

// האם הדפדפן תומך ב-push בכלל (ב-iOS: רק PWA מותקן ב-16.4+).
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

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

// ──────────────────────────────────────────────
// שמירת מנוי ה-push ב-Supabase (upsert לפי endpoint — רישום חוזר מעדכן)
// ──────────────────────────────────────────────
async function savePushSubscription(userId: string, sub: PushSubscriptionJSON): Promise<void> {
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('invalid subscription')
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) throw error
}

// ──────────────────────────────────────────────
// הפעלת push — נקרא ממחווה של המשתמש (חובה ל-iOS). מבקש הרשאה, נרשם, ושומר.
// ──────────────────────────────────────────────
export async function enablePush(userId: string): Promise<boolean> {
  return subscribeToPush(userId, async (payload) => {
    const { subscription } = payload as { userId: string; subscription: PushSubscriptionJSON }
    await savePushSubscription(userId, subscription)
  })
}

// ──────────────────────────────────────────────
// רענון שקט בעליית האפליקציה — אם ההרשאה כבר ניתנה. מנויי iOS PWA נאבדים
// אחרי שה-OS מפנה את האפליקציה, לכן רושמים מחדש (upsert) כדי לרענן endpoint.
// לא מבקש הרשאה ולא מציג כלום — בטוח לקרוא בלי מחווה.
// ──────────────────────────────────────────────
export async function refreshPushIfGranted(userId: string): Promise<void> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return
  if (Notification.permission !== 'granted') return
  try { await enablePush(userId) } catch (e) { console.warn('push refresh failed:', e) }
}
