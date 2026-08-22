const CACHE_NAME = "boxclube-v4";
const PRECACHE_URLS = [
  "./index.html",
  "./css/style.css",
  "./js/main.js",
  "./data/players.json",
  "./data/formations.json",
  "./data/boxes"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Firestore/Auth/qualquer domínio externo (firebaseapp.com, googleapis.com, PeerJS, etc):
  // passa direto pra rede, sem cache, sem interceptar. Evita quebrar streams do Firestore.
  if (!isSameOrigin) {
    return;
  }

  // Arquivos .js: network-first. Assim, correções de bugs em JS entram em
  // vigor imediatamente no próximo carregamento, sem depender do usuário
  // limpar o cache do app. Só cai pro cache se estiver offline.
  if (url.pathname.endsWith(".js")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Demais assets locais do próprio jogo: cache-first (funciona offline),
  // atualiza o cache em segundo plano quando online.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
