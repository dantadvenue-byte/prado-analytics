/**
 * Service Worker do Prado Analytics
 * Estratégia:
 *  - HTML (index.html): network-first (sempre tenta servidor primeiro pra pegar updates)
 *  - Assets estáticos (CSS/JS/imagens/fontes): cache-first (servem rápido)
 *  - API do Supabase: NUNCA cachear (dados sempre frescos quando online)
 */

const CACHE_NAME = 'prado-v3';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './favicon.png',
  './apple-touch-icon.png',
];

// ── Instalação: pré-cachear assets básicos ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Falha ao pré-cachear alguns assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Ativação: limpar caches antigos ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: estratégia por tipo de requisição ──
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só interceptar GET (POST/PUT/DELETE sempre passam direto)
  if (req.method !== 'GET') return;

  // 🚫 Nunca cachear Supabase (dados precisam ser frescos)
  if (url.hostname.includes('supabase.co')) return;

  // 🚫 Nunca cachear chrome-extension:// etc
  if (!url.protocol.startsWith('http')) return;

  // HTML: network-first (pega updates rapidamente)
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Atualiza cache em background
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Assets estáticos: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Atualiza em background pra próxima vez
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, res));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
