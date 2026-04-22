// ============================================================
// Service Worker — חג בגג Platform
// אחראי על: Push Notifications + Cache (offline basic)
// ============================================================

const CACHE_NAME = 'hagbagag-v1'
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
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch — Network First, Cache Fallback ──
self.addEventListener('fetch', event => {
  // דלג על בקשות non-GET ו-supabase API
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('supabase.co')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // שמור בקאש אם הצליח
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
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
