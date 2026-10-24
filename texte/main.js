// Processus principal d'Edda.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque : ouvrir et enregistrer les
// documents, lire les médias (images, vidéos, sons) insérés dans la page, fabriquer le PDF et imprimer.
// Les conversions de formats (docx, odt, rtf, md, html, txt) se font dans l'interface (renderer/formats/).

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, session, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { pathToFileURL, fileURLToPath } = require('node:url');

// Réglages et journal dans %APPDATA%\atelier-texte, qu'Edda soit lancée depuis le clone
// (npm start) ou installée avec Edda-Setup.exe.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-texte'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range la fenêtre
// sous l'icône épinglée d'Edda dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.edda');

// --- Journal (edda.log) ---
const logPath = () => path.join(app.getPath('userData'), 'edda.log');
const MAX_LOG_SIZE = 1024 * 1024;

async function log(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    const { size } = await fs.stat(logPath()).catch(() => ({ size: 0 }));
    if (size > MAX_LOG_SIZE) await fs.rename(logPath(), logPath().replace(/\.log$/, '.old.log'));
    await fs.appendFile(logPath(), line, 'utf8');
  } catch {
    console.error(line);
  }
}

function reportError(context, err) {
  const message = `${context} : ${err && err.message ? err.message : err}`;
  log('ERREUR', `${message}\n${(err && err.stack) || ''}`);
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('app:error', message);
}
process.on('uncaughtException', (err) => reportError('Erreur interne', err));
process.on('unhandledRejection', (err) => reportError('Erreur interne', err));

// Comme ipcMain.handle, mais chaque erreur est aussi écrite dans le journal.
function handle(channel, fn) {
  ipcMain.handle(channel, async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      log('ERREUR', `${channel} : ${err.message}`);
      throw err;
    }
  });
}

// --- Réglages (config.json) ---
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CONFIG = {
  claudeCommand: 'claude', // panneau Claude (../commun/claude.js)
  claudeModel: '',
  claudeCommandes: false, // Claude peut-il lancer des commandes (PowerShell, Python…) ?
  claudeSansDemander: {}, // familles d'actions que Claude fait sans demander (voir ../commun/claude.js)
  accentColor: '#7cc4ff',
  glass: true,
  windowBlur: false,
  page: 'claire', // la feuille : 'claire' (blanche, comme Word) ou 'sombre'
  police: 'Calibri', // police et taille des nouveaux documents
  taille: 11,
  zoom: 100,
  orthographe: true,
  languesOrthographe: 'fr', // 'fr', 'en' ou 'fr+en'
  formatParDefaut: 'docx', // format proposé pour enregistrer un nouveau document
  fichiersRecents: [],
  dernierDossier: '',
};

async function readConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(await fs.readFile(configPath(), 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
async function writeConfig(config) {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  // Fichier temporaire puis renommage : un plantage en pleine écriture ne casse pas les réglages.
  const temp = `${configPath()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(config, null, 2), 'utf8');
  await fs.rename(temp, configPath());
}
// Les modifications des réglages passent une par une (lire, changer, écrire) : deux modifications
// lancées en même temps ne doivent pas s'écraser l'une l'autre.
let file = Promise.resolve();
function modifierConfig(fn) {
  const suite = file.then(async () => {
    const config = await readConfig();
    await fn(config);
    await writeConfig(config);
    return config;
  });
  file = suite.catch(() => {});
  return suite;
}

// --- Panneau Claude (le même que dans Skald, Tafl, Brokk : voir ../commun/LISEZMOI.md) ---
const claude = require('./commun/claude');
const { creerGithub, LimiteGithub } = require('./commun/github');
// Ce que Claude doit savoir en plus dans cet outil (voir ../commun/claude.js, ecrireConsignes).
const CLAUDE_CONSIGNES = [
  '- Les documents ouverts vivent dans la fenêtre d\'Edda : lis-les avec lire_document et lire_selection,',
  '  et change-les avec ses actions (inserer, remplacer_selection, remplacer_texte, ecrire_document…),',
  '  plutôt que de modifier les fichiers .docx/.odt toi-même. Chaque changement s\'annule avec Ctrl+Z.',
  '- Écris le contenu en Markdown (titres #, **gras**, *italique*, listes, tableaux |…|), ou en HTML simple',
  '  si tu as besoin de couleurs, de polices ou d\'alignements.',
  '- Ragna écrit en français : réponds et rédige en français, sauf demande contraire.',
].join('\n');
claude.register({ handle, log, dataDir: app.getPath('userData'), readConfig, writeConfig: (changes) => modifierConfig((config) => Object.assign(config, changes)), outil: { nom: 'Edda', role: 'le traitement de texte de Ragna (documents Word, LibreOffice, RTF, Markdown, HTML, texte)', consignes: CLAUDE_CONSIGNES } });

handle('config:read', async () => ({ config: await readConfig(), path: configPath() }));
handle('config:write', async (_event, changes) => {
  const config = await modifierConfig((c) => Object.assign(c, changes));
  appliquerOrthographe(config);
  return config;
});
handle('app:version', async () => app.getVersion());

// --- Correction d'orthographe (comme dans Atelier) ---
// Le correcteur de Chromium souligne les fautes dans la page. Sous Windows, il utilise le correcteur
// de Windows lui-même, avec les langues installées sur le PC. Le clic droit sur un mot souligné
// propose les corrections (menu de l'interface, voir renderer/menus.js).
const LANGUES_ORTHOGRAPHE = { fr: ['fr-FR', 'fr'], en: ['en-US', 'en-GB', 'en'] };
function appliquerOrthographe(config) {
  const s = session.defaultSession;
  s.setSpellCheckerEnabled(config.orthographe !== false);
  if (config.orthographe === false) return;
  // « fr+en » : les deux à la fois. Pour chaque langue, le premier code que Chromium connaît.
  const dispo = s.availableSpellCheckerLanguages;
  const langues = String(config.languesOrthographe || 'fr').split('+')
    .map((l) => (LANGUES_ORTHOGRAPHE[l] || []).find((code) => !dispo.length || dispo.includes(code)))
    .filter(Boolean);
  try {
    if (langues.length) s.setSpellCheckerLanguages(langues);
  } catch (err) {
    log('ERREUR', `Orthographe : langues ${langues.join(', ')} refusées : ${err.message}`);
  }
}
handle('edition:commande', async (event, commande, mot) => {
  const wc = event.sender;
  if (commande === 'remplacer') return wc.replaceMisspelling(String(mot));
  if (commande === 'dictionnaire') return wc.session.addWordToSpellCheckerDictionary(String(mot));
  if (['cut', 'copy', 'paste', 'pasteAndMatchStyle', 'selectAll', 'undo', 'redo'].includes(commande)) return wc[commande]();
  throw new Error(`Commande inconnue : ${commande}`);
});

// --- Documents ---
// Edda n'écrit QUE dans des fichiers que tu as choisis toi-même : ouverts (fenêtre « Ouvrir »,
// fichiers récents, glissés sur la fenêtre, passés par Atelier) ou choisis dans « Enregistrer sous ».
const FORMATS = {
  docx: 'Document Word',
  odt: 'Document OpenDocument (LibreOffice)',
  rtf: 'Texte enrichi (RTF)',
  md: 'Markdown',
  html: 'Page web (HTML)',
  txt: 'Texte brut',
};
const EXTENSIONS = { docx: ['docx'], odt: ['odt'], rtf: ['rtf'], md: ['md', 'markdown'], html: ['html', 'htm'], txt: ['txt', 'text', 'log'] };
const TOUTES = Object.values(EXTENSIONS).flat();
const estDocument = (f) => TOUTES.includes(path.extname(f).slice(1).toLowerCase());
const fichiersAutorises = new Set();

async function ajouterRecent(full) {
  await modifierConfig((config) => {
    config.fichiersRecents = [full, ...config.fichiersRecents.filter((p) => p !== full)].slice(0, 20);
    config.dernierDossier = path.dirname(full);
  });
}

async function lireDocument(chemin) {
  const full = path.resolve(String(chemin));
  const ext = path.extname(full).slice(1).toLowerCase();
  if (ext === 'doc') throw new Error(`${path.basename(full)} est un ancien document Word (.doc) : ouvre-le dans Word ou LibreOffice et enregistre-le en .docx pour l'ouvrir dans Edda.`);
  if (!estDocument(full)) throw new Error(`Edda ne sait pas ouvrir ce type de fichier : ${path.basename(full)}`);
  const st = await fs.stat(full).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`Ce fichier n'existe pas (ou plus) : ${full}`);
  fichiersAutorises.add(full);
  await ajouterRecent(full);
  log('INFO', `Document ouvert : ${full}`);
  return { chemin: full, nom: path.basename(full), dossier: path.dirname(full), dossierUrl: pathToFileURL(path.dirname(full) + path.sep).href, modifie: st.mtimeMs, bytes: await fs.readFile(full) };
}

handle('document:choisir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, {
    title: 'Ouvrir des documents',
    defaultPath: config.dernierDossier || app.getPath('documents'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Tous les documents', extensions: TOUTES },
      ...Object.entries(FORMATS).map(([f, name]) => ({ name, extensions: EXTENSIONS[f] })),
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  return result.canceled ? [] : result.filePaths;
});
handle('document:lire', async (_event, chemin) => lireDocument(chemin));
handle('document:recents', async () => (await readConfig()).fichiersRecents.filter((p) => fsSync.existsSync(p)));
handle('document:oublierRecent', async (_event, chemin) => modifierConfig((c) => { c.fichiersRecents = c.fichiersRecents.filter((p) => p !== chemin); }));

// « Enregistrer sous » : la fenêtre de Windows, avec le format choisi d'avance.
handle('document:choisirDestination', async (event, { nom, format, dossier }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const base = String(nom || 'Document').replace(/\.[^.]+$/, '');
  const ordre = [format, ...Object.keys(FORMATS).filter((f) => f !== format)].filter((f) => FORMATS[f]);
  const result = await dialog.showSaveDialog(win, {
    title: 'Enregistrer le document',
    defaultPath: path.join(dossier || config.dernierDossier || app.getPath('documents'), `${base}.${EXTENSIONS[ordre[0]][0]}`),
    filters: ordre.map((f) => ({ name: FORMATS[f], extensions: EXTENSIONS[f] })),
  });
  if (result.canceled || !result.filePath) return null;
  const full = path.resolve(result.filePath);
  fichiersAutorises.add(full);
  return full;
});

// Écrire un document. On écrit d'abord un fichier temporaire, puis on le renomme :
// si quelque chose plante en plein milieu, l'ancien fichier reste intact.
handle('document:ecrire', async (_event, chemin, bytes) => {
  const full = path.resolve(String(chemin));
  if (!fichiersAutorises.has(full)) throw new Error(`Edda n'a pas le droit d'écrire ici sans que tu l'aies choisi : ${full}`);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const temp = `${full}.edda-tmp`;
  await fs.writeFile(temp, typeof bytes === 'string' ? bytes : Buffer.from(bytes));
  await fs.rename(temp, full);
  await ajouterRecent(full);
  const st = await fs.stat(full);
  log('INFO', `Document enregistré : ${full}`);
  return { chemin: full, nom: path.basename(full), dossier: path.dirname(full), dossierUrl: pathToFileURL(path.dirname(full) + path.sep).href, modifie: st.mtimeMs };
});
// Le fichier a-t-il été changé par un autre logiciel depuis qu'Edda l'a ouvert ou enregistré ?
handle('document:dateModif', async (_event, chemin) => (await fs.stat(String(chemin)).catch(() => null))?.mtimeMs ?? null);
// Un document que Claude vient d'écrire ou d'ouvrir dans le projet (claude:ecrireFichier, qui
// refuse tout chemin hors du projet) : Edda peut ensuite l'enregistrer normalement.
handle('document:adopter', async (_event, chemin) => {
  const full = path.resolve(String(chemin));
  if (!estDocument(full) || !fsSync.existsSync(full)) throw new Error(`Document introuvable : ${full}`);
  fichiersAutorises.add(full);
  await ajouterRecent(full);
  return { chemin: full, nom: path.basename(full), dossier: path.dirname(full), dossierUrl: pathToFileURL(path.dirname(full) + path.sep).href, modifie: fsSync.statSync(full).mtimeMs };
});
handle('document:montrer', async (_event, chemin) => shell.showItemInFolder(String(chemin)));

// Les documents d'un dossier (dossier passé par Atelier) : pour la page d'accueil.
handle('dossier:documents', async (_event, dossier) => {
  const full = path.resolve(String(dossier));
  const out = [];
  async function parcourir(d, profondeur) {
    let entrees = [];
    try { entrees = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name.endsWith('-medias')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory() && profondeur < 2) await parcourir(p, profondeur + 1);
      else if (e.isFile() && estDocument(e.name) && !/^(readme|license|changelog)\./i.test(e.name)) {
        const st = await fs.stat(p).catch(() => null);
        if (st) out.push({ chemin: p, nom: e.name, relatif: path.relative(full, p), modifie: st.mtimeMs });
      }
      if (out.length > 400) return;
    }
  }
  await parcourir(full, 0);
  return out.sort((a, b) => b.modifie - a.modifie).slice(0, 40);
});

// --- Médias (images, vidéos, sons insérés dans la page) ---
const MEDIAS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'],
  video: ['mp4', 'webm', 'ogv', 'mov', 'm4v'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'],
};
const typeMedia = (f) => Object.keys(MEDIAS).find((t) => MEDIAS[t].includes(path.extname(f).slice(1).toLowerCase())) || null;
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg',
};

handle('media:choisir', async (event, type) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const types = type && MEDIAS[type] ? [type] : Object.keys(MEDIAS);
  const noms = { image: 'Images', video: 'Vidéos', audio: 'Sons' };
  const result = await dialog.showOpenDialog(win, {
    title: type === 'image' ? 'Insérer des images' : type === 'video' ? 'Insérer une vidéo' : type === 'audio' ? 'Insérer un son' : 'Insérer des médias',
    defaultPath: config.dernierDossierMedias || app.getPath(type === 'video' ? 'videos' : type === 'audio' ? 'music' : 'pictures'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: types.map((t) => noms[t]).join(', '), extensions: types.flatMap((t) => MEDIAS[t]) },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return [];
  await modifierConfig((c) => { c.dernierDossierMedias = path.dirname(result.filePaths[0]); });
  return result.filePaths.map(decrireMedia).filter(Boolean);
});

// Un média vu par l'interface : son type, son adresse file:// (pour l'afficher dans la page).
function decrireMedia(chemin) {
  const full = path.resolve(String(chemin));
  const type = typeMedia(full);
  if (!type || !fsSync.existsSync(full)) return null;
  return { chemin: full, nom: path.basename(full), type, mime: MIME[path.extname(full).slice(1).toLowerCase()], url: pathToFileURL(full).href, taille: fsSync.statSync(full).size };
}
handle('media:decrire', async (_event, chemin) => decrireMedia(chemin));

// Lire un média pour l'enregistrer dans le document (une image dans un .docx).
// src : une adresse file:// ou https:// (une image collée depuis un site).
handle('media:lire', async (_event, src) => {
  const s = String(src);
  if (/^https?:\/\//i.test(s)) {
    const res = await net.fetch(s);
    if (!res.ok) throw new Error(`Image introuvable (${res.status}) : ${s}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get('content-type') || '' };
  }
  const full = s.startsWith('file:') ? fileURLToPath(s) : path.resolve(s);
  if (!typeMedia(full)) throw new Error(`Ce n'est pas un média : ${path.basename(full)}`);
  return { bytes: await fs.readFile(full), mime: MIME[path.extname(full).slice(1).toLowerCase()] || '' };
});

// Ranger un média (vidéo, son) à côté du document, dans « <document>-medias/ », pour que le document
// reste lisible ailleurs. Renvoie le chemin relatif au document (« Rapport-medias/clip.mp4 »).
// src : une adresse file://, ou les octets d'une image collée ({ nom, bytes }).
handle('media:ranger', async (_event, document, src) => {
  const doc = path.resolve(String(document));
  if (!fichiersAutorises.has(doc)) throw new Error(`Document non autorisé : ${doc}`);
  const nomDossier = `${path.basename(doc, path.extname(doc))}-medias`;
  const dossier = path.join(path.dirname(doc), nomDossier);
  if (src && typeof src === 'object') {
    // Une image sans fichier (collée, ou venue d'un .docx) : on l'écrit, sous un nom tiré de son contenu
    // pour ne pas la recopier à chaque enregistrement.
    const bytes = Buffer.from(src.bytes);
    const ext = path.extname(String(src.nom || '')).slice(1).toLowerCase() || 'png';
    if (!typeMedia(`x.${ext}`)) throw new Error(`Ce n'est pas un média : ${src.nom}`);
    const empreinte = require('node:crypto').createHash('sha1').update(bytes).digest('hex').slice(0, 10);
    const base = String(src.nom || 'image').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 40) || 'image';
    const nom = `${base}-${empreinte}.${ext}`;
    await fs.mkdir(dossier, { recursive: true });
    if (!fsSync.existsSync(path.join(dossier, nom))) await fs.writeFile(path.join(dossier, nom), bytes);
    return `${nomDossier}/${nom}`;
  }
  const source = String(src).startsWith('file:') ? fileURLToPath(String(src)) : path.resolve(String(src));
  if (!typeMedia(source)) throw new Error(`Ce n'est pas un média : ${path.basename(source)}`);
  // Déjà rangé (le document a été rouvert) : rien à copier.
  if (path.dirname(source) === dossier) return `${nomDossier}/${path.basename(source)}`;
  await fs.mkdir(dossier, { recursive: true });
  let nom = path.basename(source);
  const ext = path.extname(nom), base = path.basename(nom, ext);
  for (let i = 2; fsSync.existsSync(path.join(dossier, nom)); i++) {
    // Même fichier déjà copié : on le réutilise.
    const a = fsSync.statSync(path.join(dossier, nom)), b = fsSync.statSync(source);
    if (a.size === b.size) break;
    nom = `${base}-${i}${ext}`;
  }
  if (!fsSync.existsSync(path.join(dossier, nom))) await fs.copyFile(source, path.join(dossier, nom));
  return `${nomDossier}/${nom}`;
});
handle('media:ouvrir', async (_event, src) => {
  const s = String(src);
  if (/^https?:\/\//i.test(s)) return shell.openExternal(s);
  const err = await shell.openPath(s.startsWith('file:') ? fileURLToPath(s) : s);
  if (err) throw new Error(err);
});
handle('lien:ouvrir', async (_event, url) => {
  if (/^(https?|mailto):/i.test(String(url))) return shell.openExternal(String(url));
  throw new Error(`Lien non pris en charge : ${url}`);
});

// --- PDF et impression ---
// Le document est mis dans une fenêtre invisible, toute seule (sans la barre d'outils d'Edda),
// avec la feuille de style d'impression, puis Chromium en fait un PDF ou l'envoie à l'imprimante.
async function fenetreImpression(html) {
  const temp = path.join(os.tmpdir(), `edda-impression-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(temp, html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(temp);
  // Les images et vidéos (affiche) ont le temps d'arriver.
  await new Promise((r) => setTimeout(r, 300));
  return { win, fin: () => { win.destroy(); fs.unlink(temp).catch(() => {}); } };
}
handle('pdf:exporter', async (event, { html, nom, dossier, format }) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showSaveDialog(parent, {
    title: 'Exporter en PDF',
    defaultPath: path.join(dossier || config.dernierDossier || app.getPath('documents'), `${String(nom || 'Document').replace(/\.[^.]+$/, '')}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return null;
  const { win, fin } = await fenetreImpression(html);
  try {
    const pdf = await win.webContents.printToPDF({ pageSize: format || 'A4', printBackground: true, preferCSSPageSize: true });
    await fs.writeFile(result.filePath, pdf);
  } finally {
    fin();
  }
  log('INFO', `PDF exporté : ${result.filePath}`);
  return result.filePath;
});
handle('impression:imprimer', async (_event, { html }) => {
  const { win, fin } = await fenetreImpression(html);
  return new Promise((resolve, reject) => {
    win.webContents.print({ printBackground: true }, (ok, raison) => {
      fin();
      if (ok || raison === 'cancelled' || raison === 'Print job canceled') resolve(ok);
      else reject(new Error(`Impression impossible : ${raison}`));
    });
  });
});
handle('pdf:ouvrir', async (_event, chemin) => {
  const err = await shell.openPath(String(chemin));
  if (err) throw new Error(err);
});

handle('clipboard:writeText', async (_event, text) => clipboard.writeText(String(text)));

// --- Mise à jour ---
// Comme Skald et Brokk, Edda tourne de deux façons et se met à jour selon celle utilisée :
// - Installée avec Edda-Setup.exe (app.isPackaged) : on cherche sur GitHub la Release edda-vX.Y.Z
//   la plus récente. On ne peut pas demander « la dernière Release » du dépôt : celle-là est celle de
//   Rune. Une fois la bonne Release trouvée, electron-updater y télécharge l'installeur (décrit par
//   latest.yml), ferme Edda, l'installe sans rien demander et la relance.
// - Lancée depuis le clone git (npm start) : git pull + npm install, confiés à texte/mettre-a-jour.bat,
//   lancé dans sa propre fenêtre APRÈS la fermeture d'Edda.

const GITHUB_REPO = 'RagnardRock/atelier';
const REPO = path.join(__dirname, '..');

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: REPO, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error((stderr || err.message).trim()), { code: err.code }));
      else resolve(stdout.trim());
    });
  });
}

// 1.10.0 > 1.9.3 : on compare nombre par nombre, pas comme du texte.
function newer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// La Release d'Edda la plus récente publiée sur GitHub (on ignore celles des autres outils).
let github = null;
async function latestEddaRelease() {
  github ??= creerGithub({ net, dossier: app.getPath('userData'), agent: 'Edda' });
  const releases = (await github.releases()).filter((r) => /^edda-v\d+\.\d+\.\d+$/.test(r.tag_name));
  let best = null;
  for (const r of releases) {
    const version = r.tag_name.slice('edda-v'.length);
    if (!best || newer(version, best.version)) best = { version, tag: r.tag_name, notes: r.body || '' };
  }
  return best;
}

let autoUpdater = null;
let pendingRelease = null;
function installerUpdater() {
  if (autoUpdater) return autoUpdater;
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = false; // on télécharge seulement quand tu cliques « Mettre à jour »
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = { info: (m) => log('INFO', `Mise à jour : ${m}`), warn: (m) => log('INFO', `Mise à jour : ${m}`), error: (m) => log('ERREUR', `Mise à jour : ${m}`), debug: () => {} };
  autoUpdater.on('download-progress', (p) => BrowserWindow.getAllWindows()[0]?.webContents.send('update:progress', Math.round(p.percent)));
  return autoUpdater;
}

handle('update:check', async () => {
  if (app.isPackaged) {
    let release;
    try {
      release = await latestEddaRelease();
    } catch (err) {
      if (err instanceof LimiteGithub) throw err; // le message dit déjà quoi faire et quand
      throw new Error(`Impossible de contacter GitHub : ${err.message.split('\n')[0]}`);
    }
    if (!release || !newer(release.version, app.getVersion())) return { mode: 'installer', version: app.getVersion(), changes: [] };
    pendingRelease = release;
    const changes = release.notes.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
    return { mode: 'installer', version: release.version, changes: changes.length ? changes : [`Version ${release.version}`] };
  }
  try {
    await git(['fetch', '--quiet']);
  } catch (err) {
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) throw new Error('git est introuvable : installe Git pour Windows pour pouvoir mettre Edda à jour');
    throw new Error(`Impossible de contacter GitHub : ${err.message}`);
  }
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!upstream) throw new Error(`La branche « ${branch} » n'est reliée à aucune branche GitHub`);
  // Seulement ce qui touche Edda (les nouveautés des autres outils ne comptent pas ici).
  const changes = await git(['log', '--format=%s', 'HEAD..@{u}', '--', 'texte']);
  return { mode: 'git', branch, changes: changes ? changes.split('\n') : [] };
});

handle('update:install', async () => {
  log('INFO', 'Mise à jour lancée depuis le bouton');
  if (app.isPackaged) {
    if (!pendingRelease) throw new Error('Cherche d\'abord la mise à jour');
    const updater = installerUpdater();
    // L'installeur et latest.yml sont dans les fichiers de la Release edda-vX.Y.Z trouvée plus haut.
    updater.setFeedURL({ provider: 'generic', url: `https://github.com/${GITHUB_REPO}/releases/download/${pendingRelease.tag}` });
    const result = await updater.checkForUpdates();
    if (!result?.isUpdateAvailable) throw new Error(`La Release ${pendingRelease.tag} ne contient pas d'installeur utilisable`);
    await updater.downloadUpdate();
    // Installation silencieuse (pas de fenêtre d'installeur), puis Edda se relance toute seule.
    fermetureAutorisee = true;
    setTimeout(() => updater.quitAndInstall(true, true), 300);
    return;
  }
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'start', '', path.join(__dirname, 'mettre-a-jour.bat')], { cwd: REPO, detached: true, stdio: 'ignore' })
    : spawn('sh', [path.join(__dirname, 'mettre-a-jour.sh')], { cwd: REPO, detached: true, stdio: 'ignore' });
  child.unref();
  // Le script attend 2 secondes qu'Edda soit fermée avant de toucher aux fichiers.
  fermetureAutorisee = true;
  setTimeout(() => app.quit(), 300);
});

// --- Fenêtre ---
const TITLE_BAR = { color: '#101014', symbolColor: '#cccccc', height: 40 };

// Flou de Windows 11 ("acrylic"), à partir de Windows 11 22H2 (build 22621), comme dans Rune.
function blurSupported() {
  if (process.platform !== 'win32') return false;
  return Number(os.release().split('.')[2]) >= 22621;
}
const wantsBlur = (config) => Boolean(config.glass && config.windowBlur && blurSupported());

handle('window:theme', async (event, { glass, blur }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const wanted = Boolean(glass && blur && blurSupported());
  const useBlur = wanted && win.blurCapable;
  if (win.blurCapable) {
    win.setBackgroundMaterial(useBlur ? 'acrylic' : 'none');
    win.setBackgroundColor(useBlur ? '#00000000' : '#101014');
  }
  if (process.platform !== 'darwin') win.setTitleBarOverlay({ ...TITLE_BAR, color: useBlur ? '#00000000' : '#101014' });
  return { blur: useBlur, needsRestart: wanted && !win.blurCapable };
});
handle('window:blurSupported', async () => blurSupported());
handle('window:titre', async (event, titre) => { BrowserWindow.fromWebContents(event.sender).setTitle(String(titre)); });

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Arguments de la ligne de commande :
// - des documents (« Edda.exe D:\Rapport.docx », un fichier glissé sur l'icône, « Ouvrir avec ») ;
// - ou un dossier (« Edda.exe D:\Projets\site », c'est ainsi qu'Atelier ouvre un projet) : la page
//   d'accueil liste ses documents, et c'est le projet de Claude.
// (Lancée depuis le clone, un des arguments est le dossier d'Edda lui-même : on le saute.)
const argumentsUtiles = (argv) => argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && a !== '.').map((a) => path.resolve(a)).filter((a) => a !== app.getAppPath());
const folderFromArgs = (argv) => argumentsUtiles(argv).find((a) => fsSync.existsSync(a) && fsSync.statSync(a).isDirectory()) || null;
const filesFromArgs = (argv) => argumentsUtiles(argv).filter((a) => estDocument(a) && fsSync.existsSync(a));

let startupFolder = folderFromArgs(process.argv);
claude.setProjet(startupFolder); // le projet avec lequel Atelier a ouvert l'outil
let startupFiles = filesFromArgs(process.argv);
for (const f of startupFiles) fichiersAutorises.add(f);
handle('startup', async () => {
  const out = { dossier: startupFolder, fichiers: startupFiles };
  startupFolder = null;
  startupFiles = [];
  return out;
});

// Fermer avec des documents pas enregistrés : la fenêtre demande d'abord (renderer/app.js).
let fermetureAutorisee = false;
let modifies = 0;
handle('app:modifies', async (_event, n) => { modifies = Number(n) || 0; });
handle('app:fermer', async (event) => {
  fermetureAutorisee = true;
  BrowserWindow.fromWebContents(event.sender)?.close();
});

function createWindow(config) {
  const blur = wantsBlur(config);
  const win = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: blur ? '#00000000' : '#101014',
    ...(blur ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'Edda',
    ...(fsSync.existsSync(WINDOW_ICON) ? { icon: WINDOW_ICON } : {}),
    // Pas de barre de titre système : celle de l'interface la remplace,
    // et Windows y dessine ses boutons réduire / agrandir / fermer.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 13 } } : { titleBarOverlay: { ...TITLE_BAR, color: blur ? '#00000000' : '#101014' } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.blurCapable = blur;
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (event) => {
    if (fermetureAutorisee || !modifies) return;
    event.preventDefault();
    win.webContents.send('app:fermer-demande');
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Clic droit : le menu (corrections d'orthographe, couper, copier, coller, tableau, média…)
  // est dessiné par l'interface, avec le même style que les autres menus.
  win.webContents.on('context-menu', (_event, params) => {
    win.webContents.send('menu:contexte', {
      x: params.x,
      y: params.y,
      editable: params.isEditable,
      mot: params.misspelledWord,
      suggestions: params.dictionarySuggestions || [],
      selection: Boolean(params.selectionText),
      peutCouper: params.editFlags.canCut,
      peutCopier: params.editFlags.canCopy,
      peutColler: params.editFlags.canPaste,
    });
  });
  win.webContents.on('before-input-event', (event, input) => {
    // F12 = outils de développement, Ctrl+Maj+R = recharger l'interface (Ctrl+R reste libre :
    // dans un traitement de texte, on s'attend à ce que ce soit « aligner à droite »).
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      win.webContents.toggleDevTools();
    } else if (input.type === 'keyDown' && input.control && !input.alt && input.shift && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      if (!modifies) win.webContents.reload();
    }
  });
  return win;
}

// Une seule fenêtre Edda : un document ouvert depuis l'Explorateur ou Atelier s'ouvre dans un
// nouvel onglet de la fenêtre déjà ouverte.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const folder = folderFromArgs(argv);
    if (folder) {
      claude.setProjet(folder);
      win.webContents.send('dossier:externe', folder);
    }
    const files = filesFromArgs(argv);
    for (const f of files) fichiersAutorises.add(f);
    if (files.length) win.webContents.send('document:externe', files);
  });

  app.whenReady().then(async () => {
    const config = await readConfig();
    log('INFO', `Démarrage d'Edda ${app.getVersion()}`);
    appliquerOrthographe(config);
    Menu.setApplicationMenu(null);
    createWindow(config);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => claude.stop());
}
