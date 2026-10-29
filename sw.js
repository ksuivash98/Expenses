const CACHE = 'finance-shell-v1';
const SHELL = ["./", "./index.html", "./style.css", "./manifest.webmanifest", "./assets/icons/app-192.png", "./assets/icons/app-512.png", "./analytics.js", "./app.js", "./budget.js", "./calendar.js", "./charts.js", "./credits.js", "./expenses.js", "./goals.js", "./history.js", "./income.js", "./notifications.js", "./requiredExpenses.js", "./settings.js", "./silk.js", "./storage.js", "./ui.js", "./utilities.js", "./utils.js", "./warpText.js", "./cloud-config.js", "./cloud.js", "./pwa.js"];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('finance-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || (request.mode === 'navigate' ? await caches.match('./index.html') : Response.error())));
});
