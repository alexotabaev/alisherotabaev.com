/*
 * Service worker сайта.
 *
 * Главное правило: страницы всегда сначала из сети.
 *
 * Сайт лежит на GitHub Pages и обновляется деплоем из main. Если кешировать
 * HTML по принципу «сначала кеш», человек после обновления увидит старую
 * версию и не поймёт почему — а мы не поймём, почему правка «не доехала».
 * Такое здесь уже случалось с другими механизмами кеширования, и разбираться
 * пришлось долго. Поэтому:
 *
 *   страницы  — сначала сеть, кеш только если сети нет;
 *   шрифты, картинки, иконки — сначала кеш: они не меняются, а если меняются,
 *     то вместе с именем файла.
 *
 * Версия кеша в CACHE. Меняется — старые кеши удаляются при активации.
 */

const CACHE = 'ao-v1';

// Что кладём сразу при установке: страница на случай офлайна и шрифты.
const PRECACHE = [
  '/offline.html',
  '/files/fonts/roboto-cyrillic.woff2',
  '/files/fonts/roboto-condensed-cyrillic.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      // не даём установке упасть, если какого-то файла нет: без офлайн-страницы
      // воркер всё ещё полезен
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isStatic = (url) =>
  /\.(woff2|woff|ttf|png|jpe?g|webp|svg|ico|css|js)$/i.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Страницы: сначала сеть. Свежесть важнее скорости — иначе деплой не виден.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match('/offline.html'))
        )
    );
    return;
  }

  // Статика: сначала кеш, параллельно обновляем.
  if (isStatic(url)) {
    e.respondWith(
      caches.match(request).then((hit) => {
        const net = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
  }
});
