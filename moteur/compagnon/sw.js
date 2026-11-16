// Saga 1.34 : le compagnon hors ligne. Réseau d'abord, la copie en cache sinon (la page s'ouvre même sans réseau).
const CACHE = 'saga-compagnon-2';
const COQUE = ['./', 'compagnon.css', 'compagnon.js', '../saga/moteur/des-3d.js', 'icone.svg', 'manifest.webmanifest', '../commun/fiche-perso.js', '../codicons/codicon.css', '../codicons/codicon.ttf'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUE).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  // Le flux, l'image de fond et les actions ne passent jamais par le cache.
  if (/\/compagnon\/(flux|fond|action|relier|quitter)/.test(u.pathname) || u.search.includes('jeton=')) return;
  e.respondWith(fetch(r).then((rep) => {
    if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(r, copie)); }
    return rep;
  }).catch(() => caches.match(r).then((m) => m || caches.match('./'))));
});
