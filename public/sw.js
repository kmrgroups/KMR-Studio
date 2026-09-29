// Lumen Studio: lets phones install the dashboard as an app. Always uses the live server (no offline copy).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
