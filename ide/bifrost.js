// Bifrost (le CMS de tes clients), côté Node : connexion au compte dev, lien entre le dossier
// ouvert et un site Bifrost, récupération des modifications du client, envoi d'une nouvelle version.
//
// - Le jeton de connexion est gardé chiffré par Windows (safeStorage) dans
//   %APPDATA%\atelier-ide\bifrost.json. Le mot de passe n'est jamais enregistré.
// - Le lien d'un dossier est le fichier .bifrost.json à sa racine (adresse de Bifrost, site, date
//   de la dernière synchro). Il n'est jamais envoyé en ligne.
// - Avant d'écraser un fichier local par la version du client, Rune en garde une copie dans
//   %APPDATA%\atelier-ide\bifrost-sauvegardes\<site>\<date>\.
//
// L'API utilisée est celle de Bifrost : /api/dev (voir packages/server/src/routes/dev.routes.ts).

const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const LIEN = '.bifrost.json';
// Jamais envoyés : outils, dépôts, réglages d'éditeurs, fichiers cachés (sauf .htaccess et .well-known).
const IGNORES_DOSSIERS = new Set(['.git', 'node_modules', '.vscode', '.idea', 'ancien-site', 'outils', '__MACOSX']);
const IGNORES_FICHIERS = new Set([LIEN, '.DS_Store', 'Thumbs.db', 'desktop.ini']);
const estHtml = (f) => /\.html?$/i.test(f);
// Même règle pour un chemin « a/b/c.css » venu de Bifrost : ce que Rune n'enverrait pas, il ne le rapatrie pas non plus.
const ignore = (rel) => rel.split('/').some((m, i, t) => (i < t.length - 1 ? IGNORES_DOSSIERS.has(m) : IGNORES_FICHIERS.has(m)) || (m.startsWith('.') && m !== '.htaccess' && m !== '.well-known'));
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');

function register({ handle, getRoot, dataDir, safeStorage, log }) {
  const comptePath = () => path.join(dataDir, 'bifrost.json');

  // --- Compte ---

  async function lireCompte() {
    try { return JSON.parse(await fs.readFile(comptePath(), 'utf8')); } catch { return {}; }
  }
  async function ecrireCompte(c) {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(comptePath(), JSON.stringify(c, null, 2), 'utf8');
  }
  function chiffrer(jeton) {
    if (safeStorage?.isEncryptionAvailable()) return { jeton: safeStorage.encryptString(jeton).toString('base64'), chiffre: true };
    return { jeton, chiffre: false };
  }
  function dechiffrer(c) {
    if (!c.jeton) return null;
    if (!c.chiffre) return c.jeton;
    try { return safeStorage.decryptString(Buffer.from(c.jeton, 'base64')); } catch { return null; }
  }

  const normaliserServeur = (s) => {
    let v = String(s || '').trim().replace(/\/+$/, '');
    if (!v) throw new Error("Indique l'adresse de ton Bifrost (par exemple https://bifrost.mon-domaine.fr)");
    if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
    const u = new URL(v);
    if (u.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error("L'adresse doit commencer par https:// (http seulement pour localhost)");
    return u.origin;
  };

  // Appel de l'API. brut : renvoie le contenu du fichier (Buffer) au lieu du JSON.
  async function api(methode, chemin, { corps, brut = false, serveur, jeton } = {}) {
    const c = await lireCompte();
    serveur = serveur || c.serveur;
    jeton = jeton === undefined ? dechiffrer(c) : jeton;
    if (!serveur) throw new Error('Connecte-toi d\'abord à Bifrost');
    const headers = { Accept: 'application/json' };
    if (jeton) headers.Authorization = `Bearer ${jeton}`;
    if (corps !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(`${serveur}/api/dev${chemin}`, {
        method: methode, headers, body: corps === undefined ? undefined : JSON.stringify(corps),
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
    } catch (err) {
      throw new Error(`Bifrost injoignable (${serveur}) : ${err.cause?.code || err.message}`);
    }
    if (brut && res.ok) return Buffer.from(await res.arrayBuffer());
    let json = null;
    try { json = await res.json(); } catch { /* pas du JSON : page d'erreur du serveur */ }
    if (!res.ok || !json?.success) {
      const e = new Error(json?.error?.message || `Bifrost a répondu ${res.status}`);
      e.code = json?.error?.code || (res.status === 401 ? 'UNAUTHORIZED' : 'ERREUR');
      if (res.status === 401 && jeton) e.message += ' (reconnecte-toi dans le panneau Bifrost)';
      throw e;
    }
    return json.data;
  }

  // --- Lien du dossier ouvert ---

  async function lireLien() {
    const root = getRoot();
    if (!root) return null;
    try { return JSON.parse(await fs.readFile(path.join(root, LIEN), 'utf8')); } catch { return null; }
  }
  async function ecrireLien(lien) {
    const root = getRoot();
    if (!root) throw new Error('Ouvre d\'abord le dossier du site');
    await fs.writeFile(path.join(root, LIEN), `${JSON.stringify(lien, null, 2)}\n`, 'utf8');
  }
  async function lienRequis() {
    const lien = await lireLien();
    if (!lien?.site?.id) throw new Error('Ce dossier n\'est relié à aucun site Bifrost');
    return lien;
  }
  // Dossier qui contient le site (la racine, ou un sous-dossier comme « public » ou « dist »).
  function dossierSite(lien) {
    const root = getRoot();
    const base = path.resolve(root, lien.dossier || '.');
    const rel = path.relative(root, base);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Le dossier du site doit être dans le dossier ouvert');
    return base;
  }

  // Fichiers du site local : { "css/style.css": chemin complet }
  async function fichiersLocaux(base) {
    const res = new Map();
    async function parcourir(d) {
      for (const e of await fs.readdir(d, { withFileTypes: true })) {
        const cache = e.name.startsWith('.') && e.name !== '.htaccess' && e.name !== '.well-known';
        if (e.isDirectory()) {
          if (!IGNORES_DOSSIERS.has(e.name) && !cache) await parcourir(path.join(d, e.name));
        } else if (e.isFile() && !IGNORES_FICHIERS.has(e.name) && !cache) {
          const full = path.join(d, e.name);
          res.set(path.relative(base, full).split(path.sep).join('/'), full);
          if (res.size > 20000) throw new Error('Plus de 20 000 fichiers : est-ce bien le dossier du site ?');
        }
      }
    }
    await parcourir(base);
    return res;
  }

  async function empreintes(locaux) {
    const res = {};
    for (const [rel, full] of locaux) res[rel] = sha1(await fs.readFile(full));
    return res;
  }

  // --- Interface ---

  handle('bifrost:etat', async () => {
    const c = await lireCompte();
    const lien = await lireLien();
    return { connecte: Boolean(dechiffrer(c)), serveur: c.serveur || '', email: c.email || '', lien };
  });

  handle('bifrost:connexion', async (_e, { serveur, email, motDePasse }) => {
    const s = normaliserServeur(serveur);
    const r = await api('POST', '/connexion', { serveur: s, jeton: null, corps: { email, motDePasse, appareil: `Rune (${require('node:os').hostname()})` } });
    await ecrireCompte({ serveur: s, email: r.email, ...chiffrer(r.jeton) });
    log?.('INFO', `Bifrost : connecté à ${s}`);
    return { serveur: s, email: r.email };
  });

  handle('bifrost:deconnexion', async () => {
    const c = await lireCompte();
    await api('DELETE', '/connexion').catch(() => {}); // jeton retiré côté Bifrost si possible
    await ecrireCompte({ serveur: c.serveur, email: c.email });
  });

  handle('bifrost:jetons', () => api('GET', '/jetons'));
  handle('bifrost:retirerJeton', (_e, id) => api('DELETE', `/jetons/${encodeURIComponent(id)}`));
  handle('bifrost:sites', () => api('GET', '/sites'));

  handle('bifrost:lier', async (_e, site) => {
    const c = await lireCompte();
    const avant = await lireLien();
    const lien = { serveur: c.serveur, site: { id: site.id, slug: site.slug || null, nom: site.nom }, dossier: avant?.dossier || '', synchro: null };
    await ecrireLien(lien);
    return lien;
  });
  handle('bifrost:delier', async () => {
    const root = getRoot();
    if (root) await fs.rm(path.join(root, LIEN), { force: true });
  });
  handle('bifrost:reglerDossier', async (_e, dossier) => {
    const lien = await lienRequis();
    lien.dossier = String(dossier || '').replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '');
    dossierSite(lien);
    await ecrireLien(lien);
    return lien;
  });

  const cle = (lien) => encodeURIComponent(lien.site.id);

  handle('bifrost:fiche', async () => {
    const lien = await lienRequis();
    return api('GET', `/sites/${cle(lien)}`);
  });

  // Rapatrier : ce qui diffère entre la version de Bifrost (en ligne ou brouillon du client) et le dossier local.
  handle('bifrost:rapatrierApercu', async (_e, version = 'publie') => {
    const lien = await lienRequis();
    const distants = await api('GET', `/sites/${cle(lien)}/manifeste?version=${version}`);
    const locaux = await fichiersLocaux(dossierSite(lien));
    const h = await empreintes(locaux);
    const fichiers = [];
    for (const d of distants) {
      if (ignore(d.chemin)) continue;
      if (!h[d.chemin]) fichiers.push({ chemin: d.chemin, etat: 'nouveau', taille: d.taille });
      else if (h[d.chemin] !== d.sha1) fichiers.push({ chemin: d.chemin, etat: 'modifie', taille: d.taille });
    }
    const enLigne = new Set(distants.map((d) => d.chemin));
    const seulementLocaux = [...locaux.keys()].filter((f) => !enLigne.has(f));
    return { version, fichiers, seulementLocaux };
  });

  // Texte d'un fichier côté Bifrost (pour la comparaison avec le fichier local).
  handle('bifrost:texteDistant', async (_e, chemin, version = 'publie') => {
    const lien = await lienRequis();
    const b = await api('GET', `/sites/${cle(lien)}/fichier?version=${version}&chemin=${encodeURIComponent(chemin)}`, { brut: true });
    return b.toString('utf8');
  });
  handle('bifrost:cheminLocal', async (_e, chemin) => {
    const lien = await lienRequis();
    const base = dossierSite(lien);
    const full = path.resolve(base, chemin);
    if (path.relative(base, full).startsWith('..')) throw new Error('Chemin invalide');
    return full;
  });

  handle('bifrost:rapatrier', async (_e, version, chemins) => {
    const lien = await lienRequis();
    const base = dossierSite(lien);
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const sauvegarde = path.join(dataDir, 'bifrost-sauvegardes', lien.site.slug || lien.site.id, date);
    let sauves = 0;
    for (const chemin of chemins) {
      const full = path.resolve(base, chemin);
      const rel = path.relative(base, full);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
      const contenu = await api('GET', `/sites/${cle(lien)}/fichier?version=${version}&chemin=${encodeURIComponent(chemin)}`, { brut: true });
      try {
        const avant = await fs.readFile(full);
        if (avant.equals(contenu)) continue;
        await fs.mkdir(path.dirname(path.join(sauvegarde, rel)), { recursive: true });
        await fs.writeFile(path.join(sauvegarde, rel), avant);
        sauves++;
      } catch { /* nouveau fichier : rien à sauvegarder */ }
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, contenu);
    }
    lien.synchro = new Date().toISOString();
    await ecrireLien(lien);
    log?.('INFO', `Bifrost : ${chemins.length} fichier(s) rapatrié(s) de ${lien.site.nom}`);
    return { ecrits: chemins.length, sauvegarde: sauves ? sauvegarde : null };
  });

  // --- Envoyer sur Bifrost ---

  async function demande(lien, { supprimer = false, avec = [] } = {}) {
    const locaux = await fichiersLocaux(dossierSite(lien));
    const manifeste = await empreintes(locaux);
    const fichiers = {};
    for (const [rel, full] of locaux) {
      if (estHtml(rel) || avec.includes(rel)) fichiers[rel] = (await fs.readFile(full)).toString('base64');
    }
    return { manifeste, fichiers, supprimer, depuis: lien.synchro || undefined };
  }

  handle('bifrost:envoiEssai', async (_e, options = {}) => {
    const lien = await lienRequis();
    return api('POST', `/sites/${cle(lien)}/envoi/essai`, { corps: await demande(lien, options) });
  });

  handle('bifrost:envoyer', async (_e, { supprimer = false, ecraserBrouillon = false } = {}) => {
    const lien = await lienRequis();
    // L'essai dit quels fichiers (images, CSS…) Bifrost n'a pas encore : on n'envoie que ceux-là.
    const essai = await api('POST', `/sites/${cle(lien)}/envoi/essai`, { corps: await demande(lien, { supprimer }) });
    const corps = { ...(await demande(lien, { supprimer, avec: essai.manquants })), ecraserBrouillon };
    const r = await api('POST', `/sites/${cle(lien)}/envoi`, { corps });
    lien.synchro = new Date().toISOString();
    await ecrireLien(lien);
    log?.('INFO', `Bifrost : nouvelle version envoyée sur ${lien.site.nom}`);
    return r;
  });
}

module.exports = { register };
