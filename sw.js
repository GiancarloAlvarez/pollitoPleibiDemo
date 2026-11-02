const CACHE = 'pollito-pleibi-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/01-tokens.css',
  './css/02-layout.css',
  './css/03-components.css',
  './css/04-login.css',
  './css/05-responsive.css',
  './css/06-extras.css',
  './assets/icons/icon.svg',
  './assets/icons/apple-icon.png',
  './assets/icons/icon-light-32x32.png',
  './assets/icons/icon-dark-32x32.png',
  './assets/vendor/lucide.min.js',
  './assets/vendor/chart.umd.min.js',
  './assets/vendor/xlsx.full.min.js',
  './js/app.js',
  './js/config.js',
  './js/components/theme.js',
  './js/components/icons.js',
  './js/components/toast.js',
  './js/components/modal.js',
  './js/core/utils.js',
  './js/core/db.js',
  './js/core/state.js',
  './js/core/router.js',
  './js/core/repo.js',
  './js/core/analytics.js',
  './js/core/charts.js',
  './js/core/excel.js',
  './js/core/auth.js',
  './js/core/supabase.js',
  './js/core/sync.js',
  './js/data/seed.js',
  './js/views/login.view.js',
  './js/views/dashboard.view.js',
  './js/views/pos.view.js',
  './js/views/kitchen.view.js',
  './js/views/products.view.js',
  './js/views/product-form.view.js',
  './js/views/inventory.view.js',
  './js/views/inventory-entry.view.js',
  './js/views/suppliers.view.js',
  './js/views/supplier-form.view.js',
  './js/views/reports.view.js',
  './js/views/users.view.js',
  './js/views/user-form.view.js',
  './js/views/config.view.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then(cached => cached || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('sync', event => {
  if (event.tag === 'pollito-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_NOW' }));
      }),
    );
  }
});
