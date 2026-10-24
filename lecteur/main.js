// Processus principal de Mímir.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque : lire les documents,
// enregistrer un PDF annoté, garder les réglages, les documents récents et tes signatures.
// L'affichage des documents (PDF, EPUB, BD, Word…) se fait dans l'interface (renderer/).

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, protocol, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

// Réglages et journal dans %APPDATA%\atelier-lecteur, que Mímir soit lancé depuis le clone
// (npm start) ou installé avec Mimir-Setup.exe.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-lecteur'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range la fenêtre
// sous l'icône épinglée de Mímir dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.mimir');

// --- Journal (mimir.log) ---
const logPath = () => path.join(app.getPath('userData'), 'mimir.log');
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

// --- Réglages (config.json) ---
// documents : pour chaque fichier déjà ouvert, où tu en étais (page, zoom, chapitre d'un EPUB…).
// signatures : tes signatures enregistrées (images PNG en data:), pour signer en deux clics.
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CONFIG = {
  claudeCommand: 'claude', // panneau Claude (../commun/claude.js)
  claudeModel: '',
  claudeCommandes: false, // Claude peut-il lancer des commandes (PowerShell, Python…) ?
  claudeSansDemander: {}, // familles d'actions que Claude fait sans demander (voir ../commun/claude.js)
  accentColor: '#8fb4ff',
  glass: true,
  windowBlur: false,
  lecture: 'normal',      // couleur des pages : normal, sombre (pages inversées), sepia
  zoom: 'page-width',     // zoom des PDF à l'ouverture : page-width, page-fit, auto ou un nombre (1 = 100 %)
  miniatures: true,       // colonne des miniatures et du sommaire ouverte
  reprendre: true,        // rouvrir chaque document à la page où tu t'étais arrêté
  rouvrirOnglets: true,   // au démarrage, rouvrir les documents restés ouverts
  epubTaille: 100,        // taille du texte des livres EPUB, en %
  bdDoublePage: false,
  bdSensManga: false,     // BD lues de droite à gauche
  surlignage: '#ffe066',
  auteur: '',             // nom écrit dans les annotations (« Auteur » dans Acrobat)
  recents: [],
  ouverts: [],
  documents: {},
  signatures: [],
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
// lancées en même temps (la page en cours et un document récent) ne doivent pas s'écraser.
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
  '- Les documents ouverts vivent dans la fenêtre de Mímir : lis-les avec ses actions (infos, lire_texte, voir_page,',
  '  chercher) plutôt qu\'en ouvrant les fichiers toi-même. Les numéros de page commencent à 1.',
  '- Pour annoter, remplir un formulaire ou enregistrer, passe aussi par ses actions : Ragna voit tout se faire',
  '  dans le document et peut l\'annuler (Ctrl+Z). Rien n\'est écrit sur le disque tant qu\'on n\'enregistre pas.',
].join('\n');
claude.register({ handle, log, dataDir: app.getPath('userData'), readConfig, writeConfig: (changes) => modifierConfig((config) => Object.assign(config, changes)), outil: { nom: 'Mímir', role: 'le lecteur de documents de Ragna (PDF avec annotations, signature et formulaires, EPUB, BD, Word, images, textes)', consignes: CLAUDE_CONSIGNES } });

handle('config:read', async () => ({ config: await readConfig(), path: configPath() }));
handle('config:write', async (_event, changes) => modifierConfig((config) => Object.assign(config, changes)));
// Où tu en es dans un document (page, zoom…) : gardé à part pour ne pas réécrire tout l'objet.
handle('config:position', async (_event, chemin, position) => modifierConfig((config) => {
  config.documents = { ...config.documents, [chemin]: { ...config.documents[chemin], ...position, vu: Date.now() } };
  // On garde les 300 derniers documents.
  const tous = Object.entries(config.documents).sort((a, b) => (b[1].vu || 0) - (a[1].vu || 0));
  if (tous.length > 300) config.documents = Object.fromEntries(tous.slice(0, 300));
}));
handle('app:version', async () => app.getVersion());

// --- Documents ---
// Les formats que Mímir sait lire. La liste sert aussi aux fichiers passés en ligne de commande
// (double-clic sur un PDF dans l'Explorateur, une fois Mímir choisi pour ouvrir les PDF).
const FORMATS = [
  { nom: 'Documents PDF', extensions: ['pdf'] },
  { nom: 'Livres EPUB', extensions: ['epub'] },
  { nom: 'Bandes dessinées', extensions: ['cbz', 'cbr', 'zip'] },
  { nom: 'Documents Word', extensions: ['docx'] },
  { nom: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico'] },
  { nom: 'Textes', extensions: ['txt', 'md', 'markdown', 'log', 'json', 'xml', 'csv', 'ini', 'yml', 'yaml'] },
];
const EXTENSIONS = FORMATS.flatMap((f) => f.extensions);
const lisible = (chemin) => EXTENSIONS.includes(path.extname(chemin).slice(1).toLowerCase());

async function ajouterRecent(chemin) {
  await modifierConfig((config) => { config.recents = [chemin, ...config.recents.filter((p) => p !== chemin)].slice(0, 30); });
}

handle('doc:choisir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, {
    title: 'Ouvrir des documents',
    defaultPath: config.dernierDossier || app.getPath('documents'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Tout ce que Mímir sait lire', extensions: EXTENSIONS },
      ...FORMATS.map((f) => ({ name: f.nom, extensions: f.extensions })),
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return [];
  await modifierConfig((c) => { c.dernierDossier = path.dirname(result.filePaths[0]); });
  return result.filePaths;
});

handle('doc:lire', async (_event, chemin) => {
  const full = path.resolve(String(chemin));
  const st = await fs.stat(full).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`Document introuvable : ${full}`);
  if (!lisible(full)) throw new Error(`Mímir ne sait pas encore lire ce type de fichier : ${path.basename(full)}`);
  await ajouterRecent(full);
  log('INFO', `Ouvert : ${full}`);
  return { chemin: full, nom: path.basename(full), taille: st.size, modifie: st.mtimeMs, bytes: await fs.readFile(full) };
});
handle('doc:recents', async () => (await readConfig()).recents.filter((p) => fsSync.existsSync(p)));
handle('doc:oublier', async (_event, chemin) => modifierConfig((c) => { c.recents = c.recents.filter((p) => p !== chemin); }));

// Écrire un document (un PDF annoté, signé ou rempli). Fichier temporaire puis renommage : si
// quelque chose plante en plein milieu, l'ancien fichier reste intact.
async function ecrireDocument(chemin, bytes) {
  const full = path.resolve(String(chemin));
  await fs.mkdir(path.dirname(full), { recursive: true });
  const temp = `${full}.mimir-tmp`;
  await fs.writeFile(temp, Buffer.from(bytes));
  try {
    await fs.rename(temp, full);
  } catch (err) {
    await fs.rm(temp, { force: true });
    // Sous Windows, un PDF ouvert dans Acrobat ou Edge est verrouillé.
    if (err.code === 'EPERM' || err.code === 'EBUSY') throw new Error(`${path.basename(full)} est ouvert dans un autre programme (Acrobat, Edge…) : ferme-le, puis réessaie, ou utilise « Enregistrer sous ».`);
    throw err;
  }
  await ajouterRecent(full);
  log('INFO', `Enregistré : ${full}`);
  const st = await fs.stat(full);
  return { chemin: full, nom: path.basename(full), modifie: st.mtimeMs, taille: st.size };
}
handle('doc:enregistrer', async (_event, chemin, bytes) => ecrireDocument(chemin, bytes));
handle('doc:enregistrerSous', async (event, chemin, bytes, { titre, extension = 'pdf' } = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const parse = path.parse(String(chemin));
  const result = await dialog.showSaveDialog(win, {
    title: titre || 'Enregistrer une copie',
    defaultPath: path.join(parse.dir || app.getPath('documents'), `${parse.name}${extension === parse.ext.slice(1) ? ' (annoté)' : ''}.${extension}`),
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return null;
  return ecrireDocument(result.filePath, bytes);
});
handle('doc:montrer', async (_event, chemin) => shell.showItemInFolder(path.resolve(String(chemin))));
// Ouvrir dans le programme par défaut de Windows (Word pour un .docx, par exemple).
handle('doc:ouvrirAilleurs', async (_event, chemin) => {
  const err = await shell.openPath(path.resolve(String(chemin)));
  if (err) throw new Error(err);
});

// BD au format CBR (une archive RAR d'images) : le RAR ne se lit pas dans la fenêtre, on le
// décompresse ici avec node-unrar-js (unrar compilé en WebAssembly, rien à installer).
// Les CBZ (archives ZIP) se lisent directement dans la fenêtre avec JSZip.
handle('bd:rar', async (_event, chemin) => {
  const { createExtractorFromData } = require('node-unrar-js');
  const data = await fs.readFile(path.resolve(String(chemin)));
  const extracteur = await createExtractorFromData({ data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
  const { files } = extracteur.extract({ files: (h) => !h.flags.directory && /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(h.name) });
  const pages = [];
  for (const f of files) if (f.extraction) pages.push({ nom: f.fileHeader.name, bytes: Buffer.from(f.extraction) });
  return pages;
});

handle('clipboard:writeText', async (_event, text) => clipboard.writeText(String(text)));

// --- Mise à jour ---
// Comme Brokk, Mímir tourne de deux façons et se met à jour selon celle utilisée :
// - Installé avec Mimir-Setup.exe (app.isPackaged) : on cherche sur GitHub la Release mimir-vX.Y.Z
//   la plus récente. On ne peut pas demander « la dernière Release » du dépôt : celle-là est celle de
//   Rune. Une fois la bonne Release trouvée, electron-updater y télécharge l'installeur (décrit par
//   latest.yml), ferme Mímir, l'installe sans rien demander et le relance.
// - Lancé depuis le clone git (npm start) : git pull + npm install, confiés à lecteur/mettre-a-jour.bat,
//   lancé dans sa propre fenêtre APRÈS la fermeture de Mímir.

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

// La Release de Mímir la plus récente publiée sur GitHub (on ignore celles des autres outils).
let github = null;
async function latestMimirRelease() {
  github ??= creerGithub({ net, dossier: app.getPath('userData'), agent: 'Mimir' });
  const releases = (await github.releases()).filter((r) => /^mimir-v\d+\.\d+\.\d+$/.test(r.tag_name));
  let best = null;
  for (const r of releases) {
    const version = r.tag_name.slice('mimir-v'.length);
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
      release = await latestMimirRelease();
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
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) throw new Error('git est introuvable : installe Git pour Windows pour pouvoir mettre Mímir à jour');
    throw new Error(`Impossible de contacter GitHub : ${err.message}`);
  }
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!upstream) throw new Error(`La branche « ${branch} » n'est reliée à aucune branche GitHub`);
  // Seulement ce qui touche Mímir (les nouveautés des autres outils ne comptent pas ici).
  const changes = await git(['log', '--format=%s', 'HEAD..@{u}', '--', 'lecteur']);
  return { mode: 'git', branch, changes: changes ? changes.split('\n') : [] };
});

handle('update:install', async () => {
  log('INFO', 'Mise à jour lancée depuis le bouton');
  if (nonEnregistres > 0) throw new Error(`${nonEnregistres} document(s) ont des modifications pas encore enregistrées : enregistre-les (Ctrl+S) ou ferme-les, puis relance la mise à jour`);
  if (app.isPackaged) {
    if (!pendingRelease) throw new Error('Cherche d\'abord la mise à jour');
    const updater = installerUpdater();
    updater.setFeedURL({ provider: 'generic', url: `https://github.com/${GITHUB_REPO}/releases/download/${pendingRelease.tag}` });
    const result = await updater.checkForUpdates();
    if (!result?.isUpdateAvailable) throw new Error(`La Release ${pendingRelease.tag} ne contient pas d'installeur utilisable`);
    await updater.downloadUpdate();
    fermetureAutorisee = true;
    setTimeout(() => updater.quitAndInstall(true, true), 300);
    return;
  }
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'start', '', path.join(__dirname, 'mettre-a-jour.bat')], { cwd: REPO, detached: true, stdio: 'ignore' })
    : spawn('sh', [path.join(__dirname, 'mettre-a-jour.sh')], { cwd: REPO, detached: true, stdio: 'ignore' });
  child.unref();
  fermetureAutorisee = true;
  setTimeout(() => app.quit(), 300);
});

// --- L'adresse mimir:// ---
// L'interface est servie par une adresse à nous (mimir://app/renderer/index.html) plutôt que par
// file:// : pdf.js est fait de modules JavaScript et d'un « worker », et va chercher ses polices et
// ses tables de caractères avec fetch(), trois choses que Chromium refuse depuis file://.
// Seuls les fichiers du dossier de Mímir sont servis.
protocol.registerSchemesAsPrivileged([{ scheme: 'mimir', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.icc': 'application/octet-stream',
};
function servirFichiers() {
  protocol.handle('mimir', async (request) => {
    const url = new URL(request.url);
    const full = path.normalize(path.join(__dirname, decodeURIComponent(url.pathname)));
    if (!full.startsWith(__dirname + path.sep)) return new Response('Interdit', { status: 403 });
    try {
      const data = await fs.readFile(full);
      return new Response(data, { headers: { 'content-type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream' } });
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
handle('window:pleinEcran', async (event, oui) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.setFullScreen(oui === undefined ? !win.isFullScreen() : Boolean(oui));
  return win.isFullScreen();
});

// Fermer avec des annotations pas encore enregistrées : l'interface demande d'abord.
let fermetureAutorisee = false;
let nonEnregistres = 0;
handle('app:nonEnregistres', async (_event, n) => { nonEnregistres = Number(n) || 0; });
handle('app:fermer', async (event) => {
  fermetureAutorisee = true;
  BrowserWindow.fromWebContents(event.sender)?.close();
});

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Documents passés en ligne de commande (double-clic sur un PDF, fichier glissé sur l'icône de Mímir).
// (Lancé depuis le clone, un des arguments est le dossier de Mímir lui-même : il n'est pas lisible, on le saute.)
const filesFromArgs = (argv) => argv.slice(1)
  .filter((a) => !a.startsWith('-') && lisible(a) && fsSync.existsSync(a) && fsSync.statSync(a).isFile())
  .map((a) => path.resolve(a));

let startupFiles = filesFromArgs(process.argv);
handle('startup', async () => {
  const out = startupFiles;
  startupFiles = [];
  return out;
});

function createWindow(config) {
  const blur = wantsBlur(config);
  const win = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: blur ? '#00000000' : '#101014',
    ...(blur ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'Mímir',
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
  win.blurCapable = blur;
  win.loadURL('mimir://app/renderer/index.html');
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
    // Un lien vers un site, dans un PDF ou un livre : il s'ouvre dans le navigateur.
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
  });
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
  win.on('close', (event) => {
    if (fermetureAutorisee || nonEnregistres === 0) return;
    event.preventDefault();
    win.webContents.send('app:fermer-demande');
  });
  return win;
}

// Une seule fenêtre Mímir : un autre PDF ouvert depuis l'Explorateur arrive dans un nouvel onglet.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const files = filesFromArgs(argv);
    if (files.length) win.webContents.send('doc:externe', files);
  });

  app.whenReady().then(async () => {
    const config = await readConfig();
    log('INFO', `Démarrage de Mímir ${app.getVersion()}`);
    Menu.setApplicationMenu(null);
    servirFichiers();
    createWindow(config);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => claude.stop());
}
