// Network first, cache as fallback: the game needs the server, but the app still opens offline.
const CACHE = 'bluff-gambit-v2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/socket.io')) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
        }
        return res
      })
      .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match('/'))),
  )
})

self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'Bluff Gambit', body: 'À toi de jouer' }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: '/icon-192.png', badge: '/favicon.png', tag: 'turn', renotify: true }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin))
      return open ? open.focus() : self.clients.openWindow('/#/partie')
    }),
  )
})
