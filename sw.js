'use strict';

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appWindow = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (appWindow) return appWindow.focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
