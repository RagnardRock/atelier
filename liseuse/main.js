// Processus principal de Kenning.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque : lire les livres, chercher
// les nouveaux livres dans tes dossiers, garder la bibliothèque (bibliotheque.json), les couvertures
// et les réglages. L'ouverture et l'affichage des livres (EPUB, MOBI, AZW3, FB2…) se font dans
// l'interface (renderer/), avec foliate-js.

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, protocol, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

// Réglages, bibliothèque et journal dans %APPDATA%\atelier-liseuse, que Kenning soit lancé depuis le
// clone (npm start) ou installé avec Kenning-Setup.exe.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-liseuse'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range la fenêtre
// sous l'icône épinglée de Kenning dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.kenning');

// --- Journal (kenning.log) ---
const logPath = () => path.join(app.getPath('userData'), 'kenning.log');
const MAX_LOG_SIZE = 1024 * 1024;

async function log(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  try {
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

// Écrire un fichier JSON sans risque : fichier temporaire puis renommage (un plantage en pleine
// écriture laisse l'ancien intact).
async function ecrireJson(fichier, donnees) {
  await fs.mkdir(path.dirname(fichier), { recursive: true });
  const temp = `${fichier}.tmp`;
  await fs.writeFile(temp, JSON.stringify(donnees, null, 1), 'utf8');
  await fs.rename(temp, fichier);
}
async function lireJson(fichier, defaut) {
  try {
    return JSON.parse(await fs.readFile(fichier, 'utf8'));
  } catch {
    return defaut;
  }
}
// Les modifications d'un fichier passent une par une (lire, changer, écrire) : deux modifications
// lancées en même temps (la page en cours et un surlignage) ne doivent pas s'écraser.
function fileAttente() {
  let file = Promise.resolve();
  return (fn) => {
    const suite = file.then(fn);
    file = suite.catch(() => {});
    return suite;
  };
}

// --- Réglages (config.json) ---
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CONFIG = {
  claudeCommand: 'claude', // panneau Loki (../commun/claude.js)
  claudeModel: '',
  claudeCommandes: false,  // Loki peut-il lancer des commandes (PowerShell, Python…) ?
  claudeSansDemander: {},  // familles d'actions que Loki fait sans demander (voir ../commun/claude.js)
  accentColor: '#b9a3ff',
  glass: true,
  windowBlur: false,
  // Dossiers surveillés : les livres qui y apparaissent entrent seuls dans la bibliothèque.
  dossiers: [],
  dossiersProposes: false, // D:\Livres a déjà été proposé au premier démarrage
  // Bibliothèque
  vue: 'grille',           // grille ou liste
  tri: 'lu',               // lu (dernière lecture), ajoute, titre, auteur
  tailleCouvertures: 150,  // largeur des couvertures dans la grille, en pixels
  // Lecture (réglables pendant la lecture, avec le bouton Aa)
  lecture: {
    theme: 'sombre',       // sombre, nuit, sepia, clair
    police: 'Literata',
    taille: 18,            // en pixels
    interligne: 1.6,
    marges: 48,            // haut et bas, en pixels
    largeur: 720,          // largeur maximale d'une colonne de texte, en pixels
    colonnes: 'auto',      // auto (deux colonnes si la fenêtre est large), 1, 2, 3
    mode: 'pages',         // pages ou defilement
    justifier: true,
    cesure: true,
    policeLivre: false,    // garder la police choisie par l'éditeur du livre
    animation: true,       // les pages glissent
    filtreChaud: 0,        // 0 à 60 : lumière plus chaude le soir
  },
  ouvert: null,            // le livre ouvert à la fermeture (rouvert au démarrage)
  rouvrir: true,
  dernierDossier: '',
};

async function readConfig() {
  const lu = await lireJson(configPath(), {});
  return { ...DEFAULT_CONFIG, ...lu, lecture: { ...DEFAULT_CONFIG.lecture, ...(lu.lecture || {}) } };
}
const enFileConfig = fileAttente();
function modifierConfig(fn) {
  return enFileConfig(async () => {
    const config = await readConfig();
    await fn(config);
    await ecrireJson(configPath(), config);
    return config;
  });
}

// --- Bibliothèque (bibliotheque.json) ---
// livres : { id: { chemin, titre, auteur, langue, format, ajoute, lu, progression, position (CFI),
//          statut, collections, surlignages, marquePages, … } }. Les fichiers restent où ils sont :
//          la bibliothèque ne garde que ces fiches et une petite image de chaque couverture.
// collections : [{ id, nom }], dans l'ordre d'affichage.
const biblioPath = () => path.join(app.getPath('userData'), 'bibliotheque.json');
const couverturesDir = () => path.join(app.getPath('userData'), 'couvertures');
const enFileBiblio = fileAttente();
async function lireBiblio() {
  const b = await lireJson(biblioPath(), {});
  return { livres: b.livres || {}, collections: b.collections || [] };
}
function modifierBiblio(fn) {
  return enFileBiblio(async () => {
    const b = await lireBiblio();
    const r = await fn(b);
    await ecrireJson(biblioPath(), b);
    return r;
  });
}

// --- Panneau Loki (le même que dans les autres outils : voir ../commun/LISEZMOI.md) ---
const claude = require('./commun/claude');
const { creerGithub, LimiteGithub } = require('./commun/github');
// Ce que Loki doit savoir en plus dans cet outil (voir ../commun/claude.js, ecrireConsignes).
const CLAUDE_CONSIGNES = [
  '- La bibliothèque et le livre ouvert vivent dans la fenêtre de Kenning : utilise ses actions',
  '  (bibliotheque, livre_ouvert, lire_chapitre, chercher…) plutôt que d\'ouvrir les fichiers toi-même.',
  '  Les chapitres sont numérotés à partir de 1, dans l\'ordre du sommaire.',
  '- Ragna lit souvent dans une autre langue (le polonais, par exemple) : quand on te demande d\'expliquer',
  '  un passage, donne le sens, puis les mots ou tournures difficiles, sans traduire tout le chapitre d\'un coup.',
  '- Ne révèle pas la suite de l\'histoire au-delà du chapitre en cours, sauf si Ragna le demande.',
].join('\n');
claude.register({
  handle, log, dataDir: app.getPath('userData'), readConfig,
  writeConfig: (changes) => modifierConfig((config) => Object.assign(config, changes)),
  outil: { nom: 'Kenning', role: 'la liseuse d\'eBooks de Ragna (bibliothèque de livres EPUB, MOBI, AZW3, FB2, lecture, surlignages)', consignes: CLAUDE_CONSIGNES },
});

handle('config:read', async () => ({ config: await readConfig(), path: configPath(), dossierDonnees: app.getPath('userData') }));
handle('config:write', async (_event, changes) => modifierConfig((config) => Object.assign(config, changes)));
handle('app:version', async () => app.getVersion());

handle('biblio:lire', async () => lireBiblio());
// Ajouter ou modifier des fiches : changements = { id: { champs… } } (null = retirer la fiche).
handle('biblio:livres', async (_event, changements) => modifierBiblio(async (b) => {
  for (const [id, c] of Object.entries(changements || {})) {
    if (c === null) {
      delete b.livres[id];
      await fs.rm(path.join(couverturesDir(), `${id}.jpg`), { force: true });
    } else {
      b.livres[id] = { ...(b.livres[id] || {}), ...c, id };
    }
  }
}));
handle('biblio:collections', async (_event, collections) => modifierBiblio((b) => { b.collections = collections; }));
handle('biblio:couverture', async (_event, id, bytes) => {
  if (!/^[a-z0-9]+$/.test(String(id))) throw new Error('Identifiant de livre invalide');
  await fs.mkdir(couverturesDir(), { recursive: true });
  await fs.writeFile(path.join(couverturesDir(), `${id}.jpg`), Buffer.from(bytes));
});

// --- Livres ---
// Les formats que Kenning sait lire (le .zip seulement s'il contient un FB2 : « .fb2.zip »).
const EXTENSIONS = ['epub', 'mobi', 'azw3', 'azw', 'kf8', 'fb2', 'fbz', 'cbz', 'txt'];
const estLivre = (chemin) => {
  const nom = path.basename(String(chemin)).toLowerCase();
  return EXTENSIONS.includes(path.extname(nom).slice(1)) || nom.endsWith('.fb2.zip');
};

handle('livres:choisir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, {
    title: 'Ajouter des livres',
    defaultPath: config.dernierDossier || app.getPath('documents'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Livres numériques', extensions: [...EXTENSIONS, 'zip'] },
      { name: 'EPUB', extensions: ['epub'] },
      { name: 'Kindle (MOBI, AZW3)', extensions: ['mobi', 'azw3', 'azw', 'kf8'] },
      { name: 'FictionBook (FB2)', extensions: ['fb2', 'fbz', 'zip'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return [];
  await modifierConfig((c) => { c.dernierDossier = path.dirname(result.filePaths[0]); });
  return result.filePaths.filter(estLivre);
});
handle('dossier:choisir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, { title: 'Choisir un dossier de livres', properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// Les livres d'un dossier et de ses sous-dossiers (8 niveaux au plus, 20 000 fichiers au plus).
async function livresDe(dossier, profondeur = 0, out = []) {
  if (profondeur > 8 || out.length > 20000) return out;
  let entrees;
  try {
    entrees = await fs.readdir(dossier, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entrees) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '$RECYCLE.BIN') continue;
    const full = path.join(dossier, e.name);
    if (e.isDirectory()) await livresDe(full, profondeur + 1, out);
    else if (e.isFile() && estLivre(e.name)) {
      const st = await fs.stat(full).catch(() => null);
      if (st) out.push({ chemin: full, taille: st.size, modifie: st.mtimeMs });
    }
  }
  return out;
}
handle('dossiers:scanner', async (_event, dossiers) => {
  const tous = [];
  for (const d of dossiers || []) tous.push(...await livresDe(path.resolve(String(d))));
  return tous;
});
handle('dossier:existe', async (_event, dossier) => {
  const st = await fs.stat(path.resolve(String(dossier))).catch(() => null);
  return Boolean(st?.isDirectory());
});
// Lesquels de ces fichiers existent encore (les livres déplacés ou effacés sont signalés).
handle('fichiers:existent', async (_event, chemins) => Promise.all((chemins || []).map((c) => fs.access(String(c)).then(() => true, () => false))));
handle('fichier:infos', async (_event, chemin) => {
  const st = await fs.stat(path.resolve(String(chemin)));
  return { chemin: path.resolve(String(chemin)), taille: st.size, modifie: st.mtimeMs };
});

handle('livre:lire', async (_event, chemin) => {
  const full = path.resolve(String(chemin));
  const st = await fs.stat(full).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`Livre introuvable : ${full} (déplacé ou effacé ?)`);
  if (/\.pdf$/i.test(full)) throw new Error('Les PDF s\'ouvrent dans Mímir, le lecteur de documents d\'Atelier.');
  return { chemin: full, nom: path.basename(full), taille: st.size, modifie: st.mtimeMs, bytes: await fs.readFile(full) };
});
handle('livre:montrer', async (_event, chemin) => shell.showItemInFolder(path.resolve(String(chemin))));

// Surveiller les dossiers : un livre copié dans D:\Livres apparaît tout seul dans la bibliothèque.
// fs.watch suit les sous-dossiers sous Windows et macOS ; on attend que les copies se calment
// (2 secondes sans changement) avant de prévenir la fenêtre, qui compare avec sa bibliothèque.
let surveillances = [];
let delaiSurveillance = null;
function surveiller(dossiers) {
  for (const w of surveillances) w.close();
  surveillances = [];
  for (const d of dossiers || []) {
    try {
      const w = fsSync.watch(d, { recursive: process.platform !== 'linux' }, (_type, nom) => {
        if (nom && !estLivre(nom)) return;
        clearTimeout(delaiSurveillance);
        delaiSurveillance = setTimeout(() => BrowserWindow.getAllWindows()[0]?.webContents.send('biblio:dossiers-changes'), 2000);
      });
      w.on('error', () => {});
      surveillances.push(w);
    } catch (err) {
      log('INFO', `Impossible de surveiller ${d} : ${err.message}`);
    }
  }
}
handle('dossiers:surveiller', async (_event, dossiers) => surveiller(dossiers));

// Enregistrer un texte (les surlignages exportés en Markdown) là où Ragna le choisit.
handle('texte:enregistrerSous', async (event, nomPropose, texte) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showSaveDialog(win, {
    title: 'Exporter les surlignages',
    defaultPath: path.join(config.dernierDossier || app.getPath('documents'), String(nomPropose).replace(/[\\/:*?"<>|]/g, '-')),
    filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'Texte', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, String(texte), 'utf8');
  return result.filePath;
});

handle('clipboard:writeText', async (_event, text) => clipboard.writeText(String(text)));

// --- Mise à jour ---
// Comme Mímir, Kenning tourne de deux façons et se met à jour selon celle utilisée :
// - Installé avec Kenning-Setup.exe (app.isPackaged) : on cherche sur GitHub la Release kenning-vX.Y.Z
//   la plus récente. On ne peut pas demander « la dernière Release » du dépôt : celle-là est celle de
//   Rune. Une fois la bonne Release trouvée, electron-updater y télécharge l'installeur (décrit par
//   latest.yml), ferme Kenning, l'installe sans rien demander et le relance.
// - Lancé depuis le clone git (npm start) : git pull + npm install, confiés à liseuse/mettre-a-jour.bat,
//   lancé dans sa propre fenêtre APRÈS la fermeture de Kenning.

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

// La Release de Kenning la plus récente publiée sur GitHub (on ignore celles des autres outils).
let github = null;
async function latestKenningRelease() {
  github ??= creerGithub({ net, dossier: app.getPath('userData'), agent: 'Kenning' });
  const releases = (await github.releases()).filter((r) => /^kenning-v\d+\.\d+\.\d+$/.test(r.tag_name));
  let best = null;
  for (const r of releases) {
    const version = r.tag_name.slice('kenning-v'.length);
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
      release = await latestKenningRelease();
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
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) throw new Error('git est introuvable : installe Git pour Windows pour pouvoir mettre Kenning à jour');
    throw new Error(`Impossible de contacter GitHub : ${err.message}`);
  }
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!upstream) throw new Error(`La branche « ${branch} » n'est reliée à aucune branche GitHub`);
  // Seulement ce qui touche Kenning (les nouveautés des autres outils ne comptent pas ici).
  const changes = await git(['log', '--format=%s', 'HEAD..@{u}', '--', 'liseuse']);
  return { mode: 'git', branch, changes: changes ? changes.split('\n') : [] };
});

handle('update:install', async () => {
  log('INFO', 'Mise à jour lancée depuis le bouton');
  if (app.isPackaged) {
    if (!pendingRelease) throw new Error('Cherche d\'abord la mise à jour');
    const updater = installerUpdater();
    updater.setFeedURL({ provider: 'generic', url: `https://github.com/${GITHUB_REPO}/releases/download/${pendingRelease.tag}` });
    const result = await updater.checkForUpdates();
    if (!result?.isUpdateAvailable) throw new Error(`La Release ${pendingRelease.tag} ne contient pas d'installeur utilisable`);
    await updater.downloadUpdate();
    setTimeout(() => updater.quitAndInstall(true, true), 300);
    return;
  }
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'start', '', path.join(__dirname, 'mettre-a-jour.bat')], { cwd: REPO, detached: true, stdio: 'ignore' })
    : spawn('sh', [path.join(__dirname, 'mettre-a-jour.sh')], { cwd: REPO, detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => app.quit(), 300);
});

// --- L'adresse kenning:// ---
// L'interface est servie par une adresse à nous (kenning://app/renderer/index.html) plutôt que par
// file:// : foliate-js est fait de modules JavaScript, et déchiffre certaines polices de livres avec
// l'outil de chiffrement du navigateur, deux choses que Chromium refuse depuis file://.
// kenning://app/… sert les fichiers du dossier de Kenning, kenning://couvertures/<id>.jpg les
// couvertures de la bibliothèque. Rien d'autre n'est servi.
protocol.registerSchemesAsPrivileged([{ scheme: 'kenning', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
function servirFichiers() {
  protocol.handle('kenning', async (request) => {
    const url = new URL(request.url);
    const racine = url.host === 'couvertures' ? couverturesDir() : url.host === 'app' ? __dirname : null;
    if (!racine) return new Response('Interdit', { status: 403 });
    const full = path.normalize(path.join(racine, decodeURIComponent(url.pathname)));
    if (!full.startsWith(racine + path.sep)) return new Response('Interdit', { status: 403 });
    try {
      const data = await fs.readFile(full);
      return new Response(data, { headers: { 'content-type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' } });
    } catch {
      return new Response('Introuvable', { status: 404 });
    }
  });
}

// --- Fenêtre ---
const TITLE_BAR = { color: '#101014', symbolColor: '#cccccc', height: 40 };

// Flou de Windows 11 ("acrylic"), à partir de Windows 11 22H2 (build 22621), comme dans Rune.
function blurSupported() {
  if (process.platform !== 'win32') return false;
  return Number(os.release().split('.')[2]) >= 22621;
}
const wantsBlur = (config) => Boolean(config.glass && config.windowBlur && blurSupported());

handle('window:theme', async (event, { glass, blur, couleurBarre }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const wanted = Boolean(glass && blur && blurSupported());
  const useBlur = wanted && win.blurCapable;
  if (win.blurCapable) {
    win.setBackgroundMaterial(useBlur ? 'acrylic' : 'none');
    win.setBackgroundColor(useBlur ? '#00000000' : '#101014');
  }
  // Pendant la lecture, la barre de titre prend la couleur des pages (sépia, clair…).
  if (process.platform !== 'darwin') {
    win.setTitleBarOverlay({ ...TITLE_BAR, color: useBlur && !couleurBarre ? '#00000000' : (couleurBarre?.fond || '#101014'), symbolColor: couleurBarre?.texte || TITLE_BAR.symbolColor });
  }
  return { blur: useBlur, needsRestart: wanted && !win.blurCapable };
});
handle('window:blurSupported', async () => blurSupported());
handle('window:pleinEcran', async (event, oui) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.setFullScreen(oui === undefined ? !win.isFullScreen() : Boolean(oui));
  return win.isFullScreen();
});

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Livres passés en ligne de commande (double-clic sur un EPUB, fichier glissé sur l'icône de Kenning).
// (Lancé depuis le clone, un des arguments est le dossier de Kenning lui-même : ce n'est pas un livre, on le saute.)
const filesFromArgs = (argv) => argv.slice(1)
  .filter((a) => !a.startsWith('-') && estLivre(a) && fsSync.existsSync(a) && fsSync.statSync(a).isFile())
  .map((a) => path.resolve(a));

let startupFiles = filesFromArgs(process.argv);
handle('startup', async () => {
  const out = startupFiles;
  startupFiles = [];
  return out;
});

// Taille et position de la fenêtre, gardées d'une fois sur l'autre.
const fenetrePath = () => path.join(app.getPath('userData'), 'fenetre.json');

function createWindow(config, bornes) {
  const blur = wantsBlur(config);
  const win = new BrowserWindow({
    width: bornes?.width || 1440,
    height: bornes?.height || 920,
    ...(bornes?.x !== undefined ? { x: bornes.x, y: bornes.y } : {}),
    minWidth: 720,
    minHeight: 500,
    backgroundColor: blur ? '#00000000' : '#101014',
    ...(blur ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'Kenning',
    ...(fsSync.existsSync(WINDOW_ICON) ? { icon: WINDOW_ICON } : {}),
    // Pas de barre de titre système : celle de l'interface la remplace,
    // et Windows y dessine ses boutons réduire / agrandir / fermer.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 13 } } : { titleBarOverlay: { ...TITLE_BAR, color: blur ? '#00000000' : '#101014' } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (bornes?.maximized) win.maximize();
  win.blurCapable = blur;
  win.loadURL('kenning://app/renderer/index.html');
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
  });
  // Un lien vers un site dans un livre : il s'ouvre dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (event, input) => {
    // F12 = outils de développement, Ctrl+R = recharger l'interface (comme dans les autres outils).
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      win.webContents.toggleDevTools();
    } else if (input.type === 'keyDown' && input.control && !input.alt && !input.shift && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      win.webContents.reload();
    }
  });
  win.on('close', () => {
    const b = win.getNormalBounds();
    try { fsSync.writeFileSync(fenetrePath(), JSON.stringify({ ...b, maximized: win.isMaximized() })); } catch { /* pas grave */ }
  });
  return win;
}

// Une seule fenêtre Kenning : un autre livre ouvert depuis l'Explorateur arrive dans la même.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const files = filesFromArgs(argv);
    if (files.length) win.webContents.send('livres:externes', files);
  });

  app.whenReady().then(async () => {
    const config = await readConfig();
    log('INFO', `Démarrage de Kenning ${app.getVersion()}`);
    Menu.setApplicationMenu(null);
    servirFichiers();
    createWindow(config, await lireJson(fenetrePath(), null));
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { claude.stop(); for (const w of surveillances) w.close(); });
}
