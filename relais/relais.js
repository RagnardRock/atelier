#!/usr/bin/env node
// Le relais de Saga (Saga 1.33) : un petit serveur à poser sur n'importe quel serveur (un VPS), pour que
// des amis rejoignent une partie sans que l'hôte ouvre un port de sa box.
//
// Il ne connaît pas le jeu. Il fait passer des requêtes HTTP, rien d'autre :
//   - Saga (l'hôte) ouvre une « salle » : GET /hote/ouvrir?cle=… → un flux (server-sent events) qui lui
//     apporte les requêtes de ses amis ;
//   - un ami ouvre https://<relais>/p/<salle>/ dans son navigateur : chaque requête part à l'hôte par son
//     flux, et la réponse de l'hôte revient par POST /hote/reponse (par morceaux : le flux de l'ami, lui
//     aussi, est un flux qui dure).
// Tout le reste (le code de la partie, l'accord de l'hôte, ce que chacun voit) se décide chez l'hôte,
// comme sans relais : le relais ne voit passer que ce que l'hôte a déjà filtré pour chaque ami.
//
// Saga 1.38 : les campagnes. Une campagne a sa salle FIXE (/p/<campagne>/, le même lien à chaque séance),
// et un coffre : à la fin d'une séance, Saga y dépose pour chaque joueur une copie de ce qu'il a le droit de
// voir (sa fiche, ses documents, le journal), CHIFFRÉE avec une clé que seuls Saga et le téléphone du joueur
// connaissent. Le relais garde des octets qu'il ne sait pas lire ; le téléphone les relit hors séance. Un
// changement de fiche fait hors séance revient au MJ par le même coffre (une « proposition », chiffrée aussi).
//
// Sans dépendance : node relais.js (Node 18 ou plus). Réglages par variables d'environnement :
//   PORT              le port d'écoute (8790)
//   HOTE              l'adresse d'écoute (127.0.0.1 : derrière Caddy ou nginx, qui fait le HTTPS)
//   RELAIS_CLE        la clé que Saga doit donner pour ouvrir une salle (vide = tout le monde peut)
//   MAX_SALLES        le nombre de salles ouvertes en même temps (20)
//   CONFIANCE_PROXY   1 : lire l'adresse des amis dans X-Forwarded-For (derrière Caddy ou nginx)
//   DONNEES           le dossier des campagnes (./donnees, à côté de relais.js)
//   MAX_CAMPAGNES     le nombre de campagnes gardées (100)
//   MAX_CAMPAGNE_MO   la place d'une campagne dans le coffre, en Mo (20)
// Voir README.md pour l'installer.

'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 8790;
const HOTE = process.env.HOTE || '127.0.0.1';
const CLE = process.env.RELAIS_CLE || '';
const MAX_SALLES = Number(process.env.MAX_SALLES) || 20;
const CONFIANCE_PROXY = process.env.CONFIANCE_PROXY === '1';
const DONNEES = path.resolve(process.env.DONNEES || path.join(__dirname, 'donnees'));
const MAX_CAMPAGNES = Number(process.env.MAX_CAMPAGNES) || 100;
const MAX_CAMPAGNE = (Number(process.env.MAX_CAMPAGNE_MO) || 20) * 1024 * 1024;
const MAX_COPIE = 12 * 1024 * 1024;       // la copie d'un joueur (documents compris)
const MAX_BOITES = 40;                    // les joueurs d'une campagne
const MAX_PROPOSITIONS = 60, MAX_PROPOSITION = 32 * 1024;
const OUBLI = 400 * 86400e3;              // une campagne sans séance depuis plus d'un an s'efface
const ID_CAMPAGNE = /^[A-Za-z0-9_-]{16,32}$/;
const MAX_CORPS_AMI = 64 * 1024;          // une demande d'un ami (POST /action, /rejoindre)
const MAX_CORPS_HOTE = 48 * 1024 * 1024;  // une réponse de l'hôte (le jeu peut peser lourd)
const MAX_EN_COURS = 200;                 // requêtes en cours par salle
const DELAI_TETE = 20e3;                  // l'hôte a 20 s pour commencer à répondre
const GRACE = 90e3;                       // une salle dont l'hôte a perdu le fil attend son retour
const MAX_CACHE = 40 * 1024 * 1024;       // les fichiers de l'interface gardés par salle
const PAR_SECONDE = 40, RAFALE = 150;     // requêtes d'une même adresse

const salles = new Map(); // id → { id, secret, flux, requetes: Map(rid → res), cache: Map, poidsCache, fin }
const seaux = new Map();  // ip → { jetons, t }
const journal = (...m) => console.log(new Date().toISOString(), ...m);

const egal = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const ipDe = (req) => (CONFIANCE_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress || '');
function permis(ip) {
  const t = Date.now();
  const s = seaux.get(ip) || { jetons: RAFALE, t };
  s.jetons = Math.min(RAFALE, s.jetons + ((t - s.t) / 1000) * PAR_SECONDE);
  s.t = t;
  seaux.set(ip, s);
  if (s.jetons < 1) return false;
  s.jetons--;
  return true;
}
setInterval(() => { const t = Date.now(); for (const [ip, s] of seaux) if (t - s.t > 60e3) seaux.delete(ip); }, 60e3).unref();

function fin(res, statut, texte = '') {
  if (res.headersSent) { res.end(); return; }
  res.writeHead(statut, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(texte);
}
function lire(req, max) {
  return new Promise((resoudre) => {
    let n = 0;
    const l = [];
    req.on('data', (b) => { n += b.length; if (n > max) { req.destroy(); resoudre(null); } else l.push(b); });
    req.on('end', () => resoudre(Buffer.concat(l)));
    req.on('error', () => resoudre(null));
  });
}
const envoyer = (salle, sorte, objet) => { if (salle.flux) salle.flux.write(`event: ${sorte}\ndata: ${JSON.stringify(objet)}\n\n`); };
function json(res, statut, objet) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(objet));
}

// --- Saga 1.38 : les campagnes (gardées sur le disque) ---
// campagnes.json : id → { empreinte (sha256 du secret de la campagne, que seul Saga connaît), cree, vu, depot }
// <DONNEES>/<campagne>/<boite>.copie        la dernière copie d'un joueur (chiffrée par Saga)
// <DONNEES>/<campagne>/<boite>.prop.json    ses propositions (chiffrées par son téléphone)
let campagnes = {};
const FICHIER = path.join(DONNEES, 'campagnes.json');
function chargerCampagnes() {
  try { const c = JSON.parse(fs.readFileSync(FICHIER, 'utf8')); campagnes = c && typeof c === 'object' ? c : {}; } catch { campagnes = {}; }
}
function garderCampagnes() {
  try {
    fs.mkdirSync(DONNEES, { recursive: true });
    fs.writeFileSync(`${FICHIER}.tmp`, JSON.stringify(campagnes));
    fs.renameSync(`${FICHIER}.tmp`, FICHIER);
  } catch (err) { journal('campagnes non gardées', err.message); }
}
const empreinte = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const dossierDe = (id) => path.join(DONNEES, id);
// La campagne si ce secret est le sien ; false si elle est à un autre ; null si elle n'existe pas (creer : la créer).
function proprietaire(id, secret, creer = false) {
  if (!ID_CAMPAGNE.test(String(id || '')) || typeof secret !== 'string' || secret.length < 20) return null;
  let c = campagnes[id];
  if (!c) {
    if (!creer || Object.keys(campagnes).length >= MAX_CAMPAGNES) return null;
    c = campagnes[id] = { empreinte: empreinte(secret), cree: Date.now(), vu: Date.now(), depot: 0 };
    garderCampagnes();
    journal('campagne créée', id);
  }
  return egal(c.empreinte, empreinte(secret)) ? c : false;
}
function poids(id) {
  let n = 0;
  try { for (const f of fs.readdirSync(dossierDe(id))) n += fs.statSync(path.join(dossierDe(id), f)).size; } catch { /* vide */ }
  return n;
}
function oublierCampagne(id) {
  fs.rmSync(dossierDe(id), { recursive: true, force: true });
  delete campagnes[id];
  garderCampagnes();
}
// Les vieilles campagnes s'effacent (au départ, puis chaque jour).
function menageCampagnes() {
  const t = Date.now();
  for (const [id, c] of Object.entries(campagnes)) if (t - (c.vu || 0) > OUBLI) { oublierCampagne(id); journal('campagne oubliée', id); }
}
chargerCampagnes();
menageCampagnes();
setInterval(menageCampagnes, 86400e3).unref();

// --- L'hôte ---
function fermerSalle(salle, raison) {
  if (!salles.has(salle.id)) return;
  salles.delete(salle.id);
  for (const r of salle.requetes.values()) fin(r.res, 502, 'L\'hôte a quitté la partie.');
  salle.requetes.clear();
  salle.flux?.end();
  clearTimeout(salle.fin);
  journal('salle fermée', salle.id, raison);
}
function ouvrirFlux(req, res, url) {
  if (CLE && !egal(url.searchParams.get('cle') || '', CLE)) return fin(res, 403, 'Mauvaise clé de relais.');
  // Saga 1.38 : une campagne ouvre toujours la même salle (son id), prouvée par son secret.
  const idCampagne = url.searchParams.get('campagne') || '';
  if (idCampagne) {
    const c = proprietaire(idCampagne, url.searchParams.get('cs') || '', true);
    if (c === false) return fin(res, 403, 'Cette campagne appartient à un autre MJ sur ce relais.');
    if (!c) return fin(res, 503, 'Le relais ne peut pas garder de nouvelle campagne (plein, ou identifiant invalide).');
    c.vu = Date.now();
    garderCampagnes();
  }
  // Reprendre sa salle après une coupure (même id, même secret), sinon en ouvrir une.
  let salle = salles.get(idCampagne || url.searchParams.get('salle') || '');
  if (salle && !idCampagne && !egal(url.searchParams.get('secret') || '', salle.secret)) salle = null;
  if (!salle) {
    if (salles.size >= MAX_SALLES) return fin(res, 503, 'Le relais est plein, réessaie plus tard.');
    const id = idCampagne || crypto.randomBytes(6).toString('base64url');
    salle = { id, secret: crypto.randomBytes(24).toString('base64url'), flux: null, requetes: new Map(), cache: new Map(), poidsCache: 0, fin: null };
    salles.set(id, salle);
    journal('salle ouverte', id, ipDe(req));
  }
  salle.flux?.end();
  clearTimeout(salle.fin);
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  salle.flux = res;
  envoyer(salle, 'salle', { salle: salle.id, secret: salle.secret });
  const ping = setInterval(() => res.write(': ping\n\n'), 20e3);
  ping.unref?.();
  req.on('close', () => {
    clearInterval(ping);
    if (salle.flux !== res) return;
    salle.flux = null;
    // Saga 1.38 : les demandes en cours ne recevront plus rien (l'hôte a perdu le fil) : on les termine, pour que
    // les pages des amis et les téléphones le sachent et se reconnectent (sinon leur flux restait muet).
    for (const r of salle.requetes.values()) { clearTimeout(r.delai); fin(r.res, 502, 'L\'hôte s\'est déconnecté.'); }
    salle.requetes.clear();
    salle.fin = setTimeout(() => fermerSalle(salle, 'hôte parti'), GRACE);
    salle.fin.unref?.();
  });
}
// Ce que l'hôte répond : [{ rid, statut?, entetes?, morceau? (base64), fin? }]
async function reponses(req, res, url) {
  const salle = salles.get(url.searchParams.get('salle') || '');
  if (!salle || !egal(url.searchParams.get('secret') || '', salle.secret)) return fin(res, 403);
  const corps = await lire(req, MAX_CORPS_HOTE);
  let liste;
  try { liste = JSON.parse(corps.toString('utf8')); } catch { return fin(res, 400); }
  for (const m of Array.isArray(liste) ? liste : [liste]) {
    const r = salle.requetes.get(String(m?.rid || ''));
    if (!r) continue;
    if (m.statut && !r.res.headersSent) {
      const e = {};
      for (const [k, v] of Object.entries(m.entetes || {})) if (/^(content-type|cache-control|x-content-type-options|x-frame-options|referrer-policy|x-accel-buffering)$/i.test(k)) e[k] = String(v);
      r.res.writeHead(Math.max(100, Math.min(599, Number(m.statut) || 502)), e);
      clearTimeout(r.delai);
      r.cachable = r.cachable && Number(m.statut) === 200;
      r.type = e['content-type'] || e['Content-Type'] || '';
    }
    if (m.morceau) {
      const b = Buffer.from(String(m.morceau), 'base64');
      if (!r.res.headersSent) r.res.writeHead(200);
      r.res.write(b);
      if (r.cachable) { r.octets.push(b); r.poids += b.length; if (r.poids > 8 * 1024 * 1024) r.cachable = false; }
    }
    if (m.fin) {
      if (!r.res.headersSent) r.res.writeHead(502);
      r.res.end();
      salle.requetes.delete(r.rid);
      if (r.cachable && salle.poidsCache + r.poids <= MAX_CACHE) {
        salle.cache.set(r.cle, { entetes: { 'Content-Type': r.type || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }, corps: Buffer.concat(r.octets) });
        salle.poidsCache += r.poids;
      }
    }
  }
  fin(res, 200, 'ok');
}

// --- Les amis : tout ce qui est sous /p/<salle>/ part à l'hôte ---
const CACHABLE = /^\/(saga|codicons|commun)\//;
async function ami(req, res, url) {
  const m = url.pathname.match(/^\/p\/([A-Za-z0-9_-]{4,32})(\/.*)?$/);
  const salle = m && salles.get(m[1]);
  // Saga 1.38 : le lien d'une campagne sert à chaque séance ; entre deux, il le dit.
  // Saga 1.38.1 : entre deux séances, la page de la partie mène au compagnon (celui d'un PC ou d'un
  // téléphone déjà relié s'ouvre de son cache, hors séance).
  if (!salle?.flux && m && campagnes[m[1]] && req.method === 'GET' && (!m[2] || m[2] === '/')) { res.writeHead(302, { Location: `/p/${m[1]}/compagnon/`, 'Cache-Control': 'no-store' }); return res.end(); }
  if (!salle && m && campagnes[m[1]]) return fin(res, 503, 'La séance n\'est pas ouverte : reviens quand ton MJ la lance (le lien reste le même).');
  if (!salle) return fin(res, 404, 'Cette partie n\'existe pas ou est finie.');
  if (!m[2]) { res.writeHead(301, { Location: `/p/${salle.id}/${url.search}` }); return res.end(); }
  if (!salle.flux) return fin(res, 503, 'L\'hôte s\'est déconnecté, réessaie dans un instant.');
  if (!['GET', 'POST'].includes(req.method)) return fin(res, 405);
  const chemin = m[2] + url.search;
  const cle = `${req.method} ${chemin}`;
  if (req.method === 'GET' && CACHABLE.test(m[2]) && salle.cache.has(cle)) {
    const c = salle.cache.get(cle);
    res.writeHead(200, c.entetes);
    return res.end(c.corps);
  }
  if (salle.requetes.size >= MAX_EN_COURS) return fin(res, 503, 'Trop de demandes en même temps.');
  const corps = req.method === 'POST' ? await lire(req, MAX_CORPS_AMI) : Buffer.alloc(0);
  if (corps === null) return fin(res, 413);
  const rid = crypto.randomBytes(9).toString('base64url');
  const r = { rid, res, cle, cachable: req.method === 'GET' && CACHABLE.test(m[2]), octets: [], poids: 0, delai: null };
  r.delai = setTimeout(() => { if (!res.headersSent) { salle.requetes.delete(rid); fin(res, 504, 'L\'hôte ne répond pas.'); } }, DELAI_TETE);
  salle.requetes.set(rid, r);
  res.on('close', () => {
    clearTimeout(r.delai);
    if (salle.requetes.delete(rid)) envoyer(salle, 'annuler', { rid });
  });
  const entetes = {};
  for (const k of ['content-type', 'x-jeton', 'x-compagnon', 'accept', 'last-event-id']) if (req.headers[k]) entetes[k] = String(req.headers[k]).slice(0, 512);
  envoyer(salle, 'requete', { rid, methode: req.method, chemin, entetes, ip: ipDe(req), corps: corps.length ? corps.toString('base64') : '' });
}

const serveur = http.createServer({ headersTimeout: 15e3, requestTimeout: 0, maxHeaderSize: 8192 }, (req, res) => {
  const url = new URL(req.url, 'http://relais');
  if (!permis(ipDe(req))) return fin(res, 429, 'Doucement !');
  const p = url.pathname;
  const suite = (x) => Promise.resolve(x).catch((err) => { journal('erreur', err.message); fin(res, 500); });
  if (req.method === 'GET' && p === '/hote/ouvrir') return ouvrirFlux(req, res, url);
  if (req.method === 'POST' && p === '/hote/reponse') return suite(reponses(req, res, url));
  if (p.startsWith('/p/')) return suite(ami(req, res, url));
  if (p.startsWith('/campagne/')) return suite(coffre(req, res, url));
  if (req.method === 'GET' && p === '/') return fin(res, 200, 'Relais de Saga. Ouvre le lien que ton MJ t\'a donné.');
  if (req.method === 'GET' && p === '/sante') return fin(res, 200, JSON.stringify({ ok: true, salles: salles.size, cle: Boolean(CLE), campagnes: Object.keys(campagnes).length, version: 2 }));
  return fin(res, 404);
});

// --- Saga 1.38 : le coffre d'une campagne ---
//   GET    /campagne/<id>/etat                          { direct, depot } : la séance est-elle ouverte ?
//   PUT    /campagne/<id>/coffre/<boite>?cs=            Saga dépose la copie (chiffrée) d'un joueur
//   GET    /campagne/<id>/coffre/<boite>                 son téléphone la relit (connaître la boîte suffit)
//   DELETE /campagne/<id>/coffre/<boite>?cs=            Saga retire une boîte (un téléphone coupé)
//   POST   /campagne/<id>/coffre/<boite>/proposition     le téléphone propose un changement (chiffré)
//   GET    /campagne/<id>/propositions?cs=              Saga relève les propositions { boite: [texte] }
//   DELETE /campagne/<id>/propositions?cs=&boites=a,b   …puis les efface
//   DELETE /campagne/<id>?cs=                           Saga oublie la campagne
const ID_BOITE = /^[A-Za-z0-9_-]{20,48}$/;
async function coffre(req, res, url) {
  const m = url.pathname.match(/^\/campagne\/([A-Za-z0-9_-]{16,32})(?:\/(etat|propositions|coffre\/([A-Za-z0-9_-]{20,48})(\/proposition)?))?$/);
  if (!m) return fin(res, 404);
  const [, id, quoi = '', boite = '', prop = ''] = m;
  const c = campagnes[id];
  if (!c) return fin(res, 404, 'Campagne inconnue.');
  const mj = () => proprietaire(id, url.searchParams.get('cs') || String(req.headers['x-campagne'] || '')) || null;
  const dossier = dossierDe(id);
  const copie = boite ? path.join(dossier, `${boite}.copie`) : '';
  const props = boite ? path.join(dossier, `${boite}.prop.json`) : '';

  if (quoi === 'etat' && req.method === 'GET') return json(res, 200, { direct: Boolean(salles.get(id)?.flux), depot: c.depot || 0 });
  if (!quoi && req.method === 'DELETE') {
    if (!mj()) return fin(res, 403);
    if (salles.get(id)) fermerSalle(salles.get(id), 'campagne oubliée');
    oublierCampagne(id);
    journal('campagne oubliée par son MJ', id);
    return json(res, 200, { ok: true });
  }
  if (quoi === 'propositions') {
    if (!mj()) return fin(res, 403);
    if (req.method === 'GET') {
      const out = {};
      let liste = [];
      try { liste = fs.readdirSync(dossier).filter((f) => f.endsWith('.prop.json')); } catch { /* aucune */ }
      for (const f of liste) {
        try { const l = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')); if (Array.isArray(l) && l.length) out[f.slice(0, -10)] = l; } catch { /* abîmé */ }
      }
      return json(res, 200, out);
    }
    if (req.method === 'DELETE') {
      for (const b of String(url.searchParams.get('boites') || '').split(',')) if (ID_BOITE.test(b)) fs.rmSync(path.join(dossier, `${b}.prop.json`), { force: true });
      return json(res, 200, { ok: true });
    }
    return fin(res, 405);
  }
  if (boite && !prop) {
    if (req.method === 'GET') {
      let st;
      try { st = fs.statSync(copie); } catch { return fin(res, 404, 'Rien de déposé pour l\'instant.'); }
      const etiquette = `"${st.size}-${Math.round(st.mtimeMs)}"`;
      if (req.headers['if-none-match'] === etiquette) { res.writeHead(304, { ETag: etiquette, 'Cache-Control': 'no-cache' }); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etiquette, 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(copie).pipe(res);
    }
    if (!mj()) return fin(res, 403);
    if (req.method === 'DELETE') {
      fs.rmSync(copie, { force: true });
      fs.rmSync(props, { force: true });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PUT') {
      const corps = await lire(req, MAX_COPIE);
      if (!corps) return fin(res, 413, 'Cette copie est trop lourde.');
      let ancienne = 0;
      try { ancienne = fs.statSync(copie).size; } catch { /* nouvelle boîte */ }
      if (!ancienne) {
        let n = 0;
        try { n = fs.readdirSync(dossier).filter((f) => f.endsWith('.copie')).length; } catch { /* vide */ }
        if (n >= MAX_BOITES) return fin(res, 413, 'Trop de joueurs dans cette campagne.');
      }
      if (poids(id) - ancienne + corps.length > MAX_CAMPAGNE) return fin(res, 413, `La campagne est pleine (${Math.round(MAX_CAMPAGNE / 1048576)} Mo) : retire des documents.`);
      fs.mkdirSync(dossier, { recursive: true });
      fs.writeFileSync(`${copie}.tmp`, corps);
      fs.renameSync(`${copie}.tmp`, copie);
      c.depot = Date.now();
      c.vu = c.depot;
      garderCampagnes();
      return json(res, 200, { ok: true, depot: c.depot });
    }
    return fin(res, 405);
  }
  if (prop && req.method === 'POST') {
    // Seule une boîte où Saga a déjà déposé reçoit des propositions (pas de boîte inventée).
    if (!fs.existsSync(copie)) return fin(res, 404);
    const corps = await lire(req, MAX_PROPOSITION);
    const texte = corps ? corps.toString('utf8').trim() : '';
    if (!texte || !/^[A-Za-z0-9_\-+/=]+$/.test(texte)) return fin(res, 400);
    let l = [];
    try { l = JSON.parse(fs.readFileSync(props, 'utf8')); } catch { /* aucune */ }
    if (!Array.isArray(l)) l = [];
    if (l.length >= MAX_PROPOSITIONS) return fin(res, 429, 'Trop de changements en attente : attends la prochaine séance.');
    if (poids(id) + texte.length > MAX_CAMPAGNE) return fin(res, 413);
    l.push(texte);
    fs.writeFileSync(props, JSON.stringify(l));
    return json(res, 200, { ok: true, attente: l.length });
  }
  return fin(res, 405);
}

if (require.main === module) {
  serveur.listen(PORT, HOTE, () => journal(`Relais de Saga sur http://${HOTE}:${PORT}${CLE ? ' (avec clé)' : ' (SANS clé : tout le monde peut ouvrir une salle)'}`));
}
module.exports = { serveur };
