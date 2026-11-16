// Saga 1.34 : le compagnon hors ligne. Réseau d'abord, la copie en cache sinon (la page s'ouvre même sans réseau).
// Saga 1.38 : une réponse en erreur (la séance n'est pas ouverte : le relais répond 503) vaut aussi le cache, et la
// copie chiffrée de la campagne (/campagne/…/coffre/…) est gardée pour être relue sans réseau.
const CACHE = 'saga-compagnon-8';
const COQUE = ['./', 'compagnon.css', 'compagnon.js', '../saga/moteur/des-3d.js', '../saga/moteur/zoom-image.js', 'icone.svg', 'manifest.webmanifest', '../commun/fiche-perso.js', '../codicons/codicon.css', '../codicons/codicon.ttf'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUE).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  // Le flux, l'image de fond, les actions et l'état de la campagne ne passent jamais par le cache.
  if (/\/compagnon\/(flux|fond|action|relier|quitter)/.test(u.pathname) || /\/campagne\/[^/]+\/etat$/.test(u.pathname) || u.search.includes('jeton=')) return;
  const deCache = () => caches.match(r).then((m) => m || (r.mode === 'navigate' ? caches.match('./') : null));
  e.respondWith(fetch(r).then((rep) => {
    if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(r, copie)); return rep; }
    return deCache().then((m) => m || rep);
  }).catch(() => deCache().then((m) => m || Response.error())));
});
