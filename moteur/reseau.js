// Le multijoueur de Saga (Saga 1.0) : le petit serveur de l'hôte, sur le réseau local.
//
// Commun à tous les jeux (le mode table du JDR est le premier à s'en servir) : ce fichier ne connaît
// pas les règles. Il ne fait que transporter :
//   - les amis ouvrent l'adresse de l'hôte dans leur navigateur (PC, tablette, téléphone) : on leur sert
//     l'interface de Saga, avec web/saga-reseau.js à la place de preload.js ;
//   - ils entrent le code de la partie et leur prénom (POST /rejoindre) et reçoivent un jeton ;
//   - l'hôte (la fenêtre de Saga) leur envoie leur vue, déjà filtrée pour leur rôle (GET /flux, un flux
//     « server-sent events ») ; leurs demandes (POST /action) remontent à l'hôte, qui décide.
// Rien ici ne choisit ce qu'un ami voit : c'est l'hôte qui calcule chaque vue, et le caché ne sort jamais.
//
// Deux sortes de parties :
//   'table'  le mode table du JDR : l'hôte est le MJ ; les amis ne reçoivent du jeu que de quoi dessiner
//            (jeuPublic), et leur vue de la table vient de l'hôte ;
//   'monde'  les autres jeux (Pokémon, JRPG…) : chaque ami joue sa propre partie dans son navigateur (le
//            jeu entier lui est envoyé) ; on se voit marcher sur les cartes, on discute, on échange, on se
//            défie. Ce fichier relaie les positions et les messages d'un joueur à l'autre (« pair »).
// Le chat et la liste des joueurs valent pour les deux. L'hôte y est un joueur comme un autre, d'id 'hote'.
//
// Plus tard, un relais sur le serveur de Ragna pourra remplacer ce serveur (mêmes messages : rejoindre,
// vue, action), pour jouer hors du réseau local.

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const PORT_DEFAUT = 7777;
const MAX_CLIENTS = 12;
const MAX_CORPS = 16 * 1024;
const LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O (on les confond avec 1 et 0)
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json',
};

function creer({ moteur, lireJeuPublic, lireSon, versHote, clientsChanges, log = () => {}, version = '', config = {} }) {
  let serveur = null, code = '', port = 0, mode = 'monde', titre = '';
  let hote = { id: 'hote', nom: 'Hôte', position: null };
  let chat = [], numeroChat = 0;
  const clients = new Map(); // id → { id, nom, jeton, flux, ip, derniere }
  const essais = new Map();  // ip → [dates des mauvais codes]
  let jeuPublic = null;

  const liste = () => [...clients.values()].map((c) => ({ id: c.id, nom: c.nom, connecte: Boolean(c.flux) }));
  // Qui est là, pour tout le monde (l'hôte en tête).
  const joueurs = () => [{ id: 'hote', nom: hote.nom, connecte: true, hote: true }, ...liste()];
  function prevenir() {
    clientsChanges?.(liste());
    diffuser('joueurs', JSON.stringify(joueurs()));
  }
  // Envoyer à un joueur (l'hôte compris : sa fenêtre reçoit par versHote).
  function envoyerA(id, sorte, objet) {
    if (id === 'hote') versHote({ reseau: sorte, ...objet });
    else envoyer(id, sorte, JSON.stringify(objet));
  }
  function diffuser(sorte, json, sauf = '') {
    for (const c of clients.values()) if (c.id !== sauf) envoyer(c.id, sorte, json);
  }

  // --- Le chat : à tous, ou en privé à un joueur (l'hôte compris) ---
  function dire(de, texte, pour = 'tous') {
    texte = String(texte || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 500);
    if (!texte) return;
    const auteur = de === 'hote' ? hote : clients.get(de);
    if (!auteur) return;
    if (pour !== 'tous' && pour !== 'hote' && !clients.has(pour)) pour = 'tous';
    const l = { n: ++numeroChat, de, nom: auteur.nom, pour, texte, t: Date.now() };
    chat.push(l);
    if (chat.length > 120) chat.shift();
    for (const id of ['hote', ...clients.keys()]) if (pour === 'tous' || id === pour || id === de) envoyerA(id, 'chat', l);
  }
  const chatPour = (id) => chat.filter((l) => l.pour === 'tous' || l.pour === id || l.de === id);

  // --- Le monde partagé : où est chacun (seuls ceux de la même carte se voient) ---
  function positions(pour) {
    const moi = pour === 'hote' ? hote : clients.get(pour);
    const carte = moi?.position?.carte;
    if (!carte) return [];
    return [hote, ...clients.values()].filter((j) => j.id !== pour && j.position?.carte === carte && (j.id === 'hote' || j.flux))
      .map((j) => ({ id: j.id, nom: j.nom, ...j.position }));
  }
  function bouger(id, p) {
    const j = id === 'hote' ? hote : clients.get(id);
    if (!j || !p || typeof p !== 'object') return;
    const avant = j.position?.carte;
    j.position = {
      carte: String(p.carte || '').slice(0, 80), x: Math.round(Number(p.x) || 0), y: Math.round(Number(p.y) || 0),
      direction: ['haut', 'bas', 'gauche', 'droite'].includes(p.direction) ? p.direction : 'bas',
      personnage: String(p.personnage || '').slice(0, 80), tenue: String(p.tenue || '').slice(0, 80), marche: Boolean(p.marche),
    };
    // Ceux de l'ancienne carte et de la nouvelle apprennent le changement.
    for (const k of [hote, ...clients.values()]) {
      if (k.id === id) continue;
      const c = k.position?.carte;
      if (c && (c === j.position.carte || c === avant)) envoyerA(k.id, 'monde', { joueurs: positions(k.id) });
    }
    envoyerA(id, 'monde', { joueurs: positions(id) });
  }
  // Un message d'un joueur à un autre (proposer un échange, une offre, un choix de duel…) : relayé tel quel.
  function pair(de, vers, donnees) {
    if (de === vers || !(vers === 'hote' || clients.has(vers)) || !donnees || typeof donnees !== 'object') return;
    envoyerA(vers, 'pair', { de, nom: (de === 'hote' ? hote : clients.get(de))?.nom || '', donnees });
  }

  function adresses() {
    const out = [];
    for (const l of Object.values(os.networkInterfaces())) {
      for (const a of l || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
    // Les adresses de la maison (192.168…) d'abord.
    return out.sort((a, b) => Number(!a.startsWith('192.168.')) - Number(!b.startsWith('192.168.')));
  }
  const nouveauCode = () => Array.from(crypto.randomBytes(4), (b) => LETTRES[b % LETTRES.length]).join('');

  // --- Les fichiers de l'interface ---
  async function page() {
    let html = await fs.readFile(path.join(moteur, 'renderer', 'index.html'), 'utf8');
    return html
      .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <base href="/saga/">')
      .replace('../node_modules/@vscode/codicons/dist/codicon.css', '/codicons/codicon.css')
      .replace(/<title>[^<]*<\/title>/, `<title>${titre.replace(/[<>&]/g, '') || 'Saga'} · rejoindre la partie</title>`)
      .replace('<body class="glass">', '<body class="glass web reseau">')
      .replace(/\s*<script src="update\.js"><\/script>/, '')
      .replace('<script src="base.js"></script>', '<script src="/web/saga-reseau.js"></script>\n  <script src="base.js"></script>');
  }
  // Un fichier sous une racine, sans jamais en sortir.
  async function fichier(res, racine, rel) {
    const p = path.resolve(racine, `.${path.posix.normalize(`/${decodeURIComponent(rel)}`)}`);
    if (!p.startsWith(path.resolve(racine) + path.sep)) return fin(res, 404);
    const type = TYPES[path.extname(p).toLowerCase()];
    if (!type) return fin(res, 404);
    try {
      const data = await fs.readFile(p);
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch { fin(res, 404); }
  }
  function fin(res, statut, corps = null) {
    if (res.headersSent) { res.end(); return; }
    res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(corps === null ? JSON.stringify({ ok: statut < 400 }) : JSON.stringify(corps));
  }
  function lireCorps(req) {
    return new Promise((resoudre) => {
      let n = 0;
      const morceaux = [];
      req.on('data', (b) => { n += b.length; if (n > MAX_CORPS) { req.destroy(); resoudre(null); } else morceaux.push(b); });
      req.on('end', () => { try { resoudre(JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}')); } catch { resoudre(null); } });
      req.on('error', () => resoudre(null));
    });
  }
  const clientDe = (req, url) => {
    const j = req.headers['x-jeton'] || url.searchParams.get('jeton') || '';
    return [...clients.values()].find((c) => c.jeton === j) || null;
  };

  // --- Les demandes ---
  async function repondre(req, res) {
    const url = new URL(req.url, 'http://saga');
    const p = url.pathname;
    const ip = req.socket.remoteAddress || '';
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
      res.end(await page());
      return;
    }
    // Le pont du navigateur, précédé de ce qu'il doit savoir avant que l'interface démarre (la sorte de partie).
    if (req.method === 'GET' && p === '/web/saga-reseau.js') {
      const pont = await fs.readFile(path.join(moteur, 'web', 'saga-reseau.js'), 'utf8');
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
      res.end(`window.SAGA_RESEAU = ${JSON.stringify({ mode, titre, version, config })};\n${pont}`);
      return;
    }
    if (req.method === 'GET' && p.startsWith('/saga/')) return fichier(res, path.join(moteur, 'renderer'), p.slice(6));
    if (req.method === 'GET' && p.startsWith('/commun/')) return fichier(res, path.join(moteur, 'commun'), p.slice(8));
    if (req.method === 'GET' && p.startsWith('/codicons/')) return fichier(res, path.join(moteur, 'node_modules', '@vscode', 'codicons', 'dist'), p.slice(10));

    if (req.method === 'POST' && p === '/rejoindre') {
      const maintenant = Date.now();
      const l = (essais.get(ip) || []).filter((t) => maintenant - t < 60e3);
      essais.set(ip, l);
      if (l.length >= 6) return fin(res, 429, { erreur: 'Trop d\'essais : attends une minute.' });
      const corps = await lireCorps(req);
      const nom = String(corps?.nom || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
      // Revenir avec son jeton (la page rechargée, le Wi-Fi coupé) : on retrouve sa place.
      const ancien = typeof corps?.jeton === 'string' ? [...clients.values()].find((c) => c.jeton === corps.jeton) : null;
      if (ancien) return fin(res, 200, { ok: true, jeton: ancien.jeton, id: ancien.id, nom: ancien.nom, version });
      if (String(corps?.code || '').trim().toUpperCase() !== code) {
        l.push(maintenant);
        return fin(res, 403, { erreur: 'Ce code ne correspond pas à la partie.' });
      }
      if (!nom) return fin(res, 400, { erreur: 'Écris ton prénom.' });
      if (clients.size >= MAX_CLIENTS) return fin(res, 403, { erreur: 'La partie est pleine.' });
      // Un même prénom : c'est sans doute le même ami, sur un autre appareil ou un nouvel onglet.
      let c = [...clients.values()].find((x) => x.nom.toLowerCase() === nom.toLowerCase());
      if (c) { c.flux?.end(); c.flux = null; c.jeton = crypto.randomBytes(18).toString('base64url'); }
      else {
        c = { id: `j-${crypto.randomBytes(4).toString('hex')}`, nom, jeton: crypto.randomBytes(18).toString('base64url'), flux: null, ip };
        clients.set(c.id, c);
      }
      log('INFO', `Multijoueur : ${nom} rejoint la partie (${ip})`);
      prevenir();
      return fin(res, 200, { ok: true, jeton: c.jeton, id: c.id, nom: c.nom, version });
    }

    const c = clientDe(req, url);
    if (!c) return fin(res, 401, { erreur: 'Pas (ou plus) dans la partie.' });
    if (req.method === 'GET' && p === '/jeu') {
      jeuPublic = jeuPublic || await lireJeuPublic(mode);
      return fin(res, 200, jeuPublic);
    }
    // Les sons (le monde partagé : chacun entend son jeu ; à la table, la musique reste chez le MJ).
    if (req.method === 'GET' && p === '/son' && mode === 'monde') {
      try {
        const data = await lireSon(url.searchParams.get('chemin') || '');
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
        return res.end(data);
      } catch { return fin(res, 404); }
    }
    if (req.method === 'GET' && p === '/flux') {
      c.flux?.end();
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      c.flux = res;
      req.on('close', () => { if (c.flux === res) { c.flux = null; prevenir(); if (c.position) bouger(c.id, { ...c.position, carte: '' }); } });
      envoyer(c.id, 'bienvenue', JSON.stringify({ id: c.id, nom: c.nom, mode, titre, version, chat: chatPour(c.id) }));
      prevenir();
      if (c.position) bouger(c.id, c.position);
      return;
    }
    if (req.method === 'POST' && p === '/action') {
      const a = await lireCorps(req);
      if (!a || typeof a !== 'object' || Array.isArray(a)) return fin(res, 400);
      if (a.type === 'chat') dire(c.id, a.texte, String(a.pour || 'tous'));
      else if (a.type === 'position') bouger(c.id, a);
      else if (a.type === 'pair') pair(c.id, String(a.vers || ''), a.donnees);
      else versHote({ ...a, client: c.id });
      return fin(res, 200);
    }
    return fin(res, 404);
  }

  // --- Ouvrir, fermer, envoyer ---
  function ouvrir({ port: portVoulu = PORT_DEFAUT, mode: m = 'monde', nom = '', titre: t = '' } = {}) {
    if (serveur) return Promise.resolve(infos());
    code = nouveauCode();
    jeuPublic = null;
    mode = m === 'table' ? 'table' : 'monde';
    titre = String(t || '').slice(0, 120);
    hote = { id: 'hote', nom: String(nom || '').trim().slice(0, 24) || (mode === 'table' ? 'MJ' : 'Hôte'), position: null };
    chat = [];
    const essayer = (pt, reste) => new Promise((resoudre, rejeter) => {
      const s = http.createServer((req, res) => { repondre(req, res).catch((err) => { log('ERREUR', `Multijoueur : ${err.message}`); fin(res, 500); }); });
      s.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && reste > 0) essayer(pt + 1, reste - 1).then(resoudre, rejeter);
        else rejeter(new Error(err.code === 'EADDRINUSE' ? 'Les ports 7777 à 7787 sont déjà pris' : err.message));
      });
      s.listen(pt, '0.0.0.0', () => { serveur = s; port = pt; resoudre(infos()); });
    });
    // Un ping régulier garde les flux ouverts (certains routeurs coupent un flux muet).
    const r = essayer(Number(portVoulu) || PORT_DEFAUT, 10);
    r.then(() => {
      log('INFO', `Multijoueur : partie ouverte sur le port ${port}`);
      ping = setInterval(() => { for (const c of clients.values()) c.flux?.write(': ping\n\n'); }, 20e3);
    }).catch(() => {});
    return r;
  }
  let ping = null;
  function fermer() {
    if (!serveur) return;
    for (const c of clients.values()) { envoyer(c.id, 'fin', '{"raison":"ferme"}'); c.flux?.end(); }
    clients.clear();
    hote.position = null;
    clearInterval(ping);
    serveur.close();
    serveur.closeAllConnections?.();
    serveur = null;
    code = '';
    log('INFO', 'Multijoueur : partie fermée');
    prevenir();
  }
  function envoyer(id, sorte, json) {
    const c = clients.get(id);
    if (!c?.flux || typeof json !== 'string') return false;
    c.flux.write(`event: ${sorte}\ndata: ${json.replace(/\n/g, '\ndata: ')}\n\n`);
    return true;
  }
  function expulser(id) {
    const c = clients.get(id);
    if (!c) return;
    envoyer(id, 'fin', '{"raison":"expulse"}');
    c.flux?.end();
    clients.delete(id);
    log('INFO', `Multijoueur : ${c.nom} quitte la partie`);
    prevenir();
  }
  // Le jeu a été rouvert ou rechargé : les amis le relisent.
  function oublierJeu() { jeuPublic = null; for (const c of clients.values()) envoyer(c.id, 'jeu', '{}'); }
  const infos = () => (serveur ? { ouvert: true, port, code, mode, adresses: adresses(), clients: liste(), joueurs: joueurs(), chat: chatPour('hote') } : { ouvert: false, clients: [], joueurs: [], chat: [] });

  return {
    ouvrir, fermer, envoyer, expulser, infos, oublierJeu, get ouvert() { return Boolean(serveur); },
    // Ce que fait l'hôte, comme un joueur : parler, bouger, écrire à un autre.
    dire: (texte, pour) => dire('hote', texte, pour), bouger: (p) => bouger('hote', p), pair: (vers, donnees) => pair('hote', vers, donnees),
  };
}

// Ce que les amis reçoivent du jeu : de quoi dessiner, rien de plus. Pas les événements (dialogues,
// secrets, pièges), ni les zones, ni les scripts, ni les fiches des monstres (seulement leur image).
function jeuPublic(textes) {
  const lire = (t) => { try { return JSON.parse(t); } catch { return null; } };
  const jeu = lire(textes.jeu) || {};
  const garder = ['personnages', 'monstres_jdr'];
  const donneesJeu = jeu.donnees && typeof jeu.donnees === 'object' ? jeu.donnees : {};
  const donnees = {};
  const mapDonnees = {};
  for (const sorte of garder) {
    const rel = String(donneesJeu[sorte] || '').replace(/\\/g, '/');
    if (!rel || textes.donnees[rel] == null) continue;
    let d = lire(textes.donnees[rel]);
    if (!d) continue;
    if (sorte === 'monstres_jdr') d = { ...d, monstres_jdr: (d.monstres_jdr || []).map((m) => ({ id: m.id, nom: m.nom, image: m.image })) };
    if (sorte === 'personnages') d = { ...d, personnages: (d.personnages || []).map((p) => ({ id: p.id, nom: p.nom, couleur: p.couleur, tuile: p.tuile, sprite: p.sprite, apparence: p.apparence, tenues: (p.tenues || []).map((t) => ({ id: t.id, nom: t.nom, sprite: t.sprite })) })) };
    donnees[rel] = JSON.stringify(d);
    mapDonnees[sorte] = rel;
  }
  const cartes = {};
  for (const [rel, t] of Object.entries(textes.cartes || {})) {
    const c = lire(t);
    if (!c) continue;
    delete c.evenements; delete c.zones; delete c.teleporteurs; delete c.rencontres;
    cartes[rel] = JSON.stringify(c);
  }
  const jeuOut = { ...jeu, donnees: mapDonnees, scripts: [] };
  return { dossier: 'reseau', jeu: JSON.stringify(jeuOut), tuiles: textes.tuiles, cartes, donnees, scripts: {} };
}

module.exports = { creer, jeuPublic, PORT_DEFAUT };
