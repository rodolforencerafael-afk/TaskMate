// sw.js — TaskMate background service worker

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// =========================================
// PUSH — fires when Supabase sends a notification
// =========================================
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}

  // If the server sends a title (like the task name), use it. Otherwise, use a default.
  const title = data.title || '🔔 TaskMate Reminder';
  const options = {
    body: data.body || 'You have a task coming up.',
    icon: data.icon || '/images/logo.jpg',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'taskmate-reminder',
    renotify: true,
    requireInteraction: true,   // stays on screen until user dismisses it
    data: { url: data.url || '/#tasks' } // Opens the tasks page when clicked
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// =========================================
// CLICK — open TaskMate (or focus if already open)
// =========================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/#tasks';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      return clients.openWindow ? clients.openWindow(target) : null;
    })
  );
});