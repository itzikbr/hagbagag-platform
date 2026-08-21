// ============================================================
// Service Worker — חג בגג Platform
// אחראי על: Push Notifications + Cache (offline basic)
// ============================================================

const CACHE_NAME = 'hagbagag-v10'
const OFFLINE_FALLBACK = '/offline.html'

// קבצים לשמירה בקאש ראשוני
const PRECACHE = [
  '/',
  '/manifest.json',
]

// ── Install ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

// ── Activate ──
// מנקה קאש ישן, תופס שליטה, ומכריח חלונות פתוחים לטעון מחדש את קליפת האפליקציה
// כדי שמכשירים שנתקעו על גרסה מקומית ישנה (בעיקר PWA ב-iOS) יקבלו את הבנדל החדש.
// רץ פעם אחת בלבד לכל גרסת SW, לכן אין לולאת רענון.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    await self.clients.claim()
    const windows = await self.clients.matchAll({ type: 'window' })
    for (const client of windows) {
      client.navigate(client.url)
    }
  })())
})

// ── Fetch ──
// אסטרטגיה מוקשחת נגד "shell ישן שמצביע על assets שנמחקו":
//  • ניווטים (HTML): network-first תמיד → אונליין מקבל index.html טרי עם ה-hash
//    הנוכחי (שקיים בשרת). נפילה ל-shell מהקאש רק כשאין רשת.
//  • /assets/* (גיבוב, immutable): cache-first — מהיר ובטוח (תוכן קבוע לכל hash).
//  • שאר GET מאותו origin: network-first עם נפילה לקאש.
self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return   // supabase / חיצוני — לא מטופל ע"י ה-SW

  // ניווטי דפים — network-first, נפילה ל-shell/offline רק באין רשת
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        // רק ניווט לשורש מעדכן את ה-shell. בלי התנאי הזה כל ניווט נשמר
        // תחת המפתח '/' — כך שביקור ב-/oauth-drive-callback היה הופך את
        // דף ההצלחה של OAuth ל-shell של האפליקציה במצב offline.
        // בנוסף: תשובת 302 (למשל /drive-auth) היא opaqueredirect,
        // ו-cache.put דוחה אותה — מה שיצר unhandled rejection.
        if (url.pathname === '/' || url.pathname === '/index.html') {
          if (fresh.ok && fresh.type !== 'opaqueredirect') {
            const cache = await caches.open(CACHE_NAME)
            await cache.put('/', fresh.clone())
          }
        }
        return fresh
      } catch {
        return (await caches.match('/')) || (await caches.match(OFFLINE_FALLBACK)) || Response.error()
      }
    })())
    return
  }

  // assets בגיבוב — cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req)
      if (cached) return cached
      const fresh = await fetch(req)
      if (fresh.ok) { const cache = await caches.open(CACHE_NAME); cache.put(req, fresh.clone()) }
      return fresh
    })())
    return
  }

  // שאר בקשות GET מקומיות — network-first
  event.respondWith(
    fetch(req)
      .then(response => {
        if (response.ok) { const clone = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(req, clone)) }
        return response
      })
      .catch(() => caches.match(req))
  )
})

// ── Push Notifications ──
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}

  const title   = data.title   ?? 'חג בגג'
  const body    = data.body    ?? 'הודעה חדשה'
  const icon    = data.icon    ?? '/icons/icon-192.png'
  const badge   = data.badge   ?? '/icons/icon-192.png'
  const url     = data.url     ?? '/'
  const tag     = data.tag     ?? 'hagbagag-msg'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url },
      actions: [
        { action: 'open',    title: 'פתח' },
        { action: 'dismiss', title: 'סגור' },
      ],
    })
  )
})

// ── Notification Click ──
self.addEventListener('notificationclick', event => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // פתח tab קיים אם יש
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // פתח tab חדש
      clients.openWindow(url)
    })
  )
})
