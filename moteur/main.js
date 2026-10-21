// Processus principal de Saga, le moteur des jeux faits avec Tafl.
// C'est lui qui crée la fenêtre et qui a le droit de lire le disque.
// Le jeu lui-même (dessin des cartes, déplacements, météo) tourne dans l'interface (renderer/),
// dans un <canvas>. Ici, on ne fait que lire les fichiers du dossier de jeu et garder les réglages.
// Saga n'écrit JAMAIS dans le dossier du jeu : c'est Tafl qui le décrit, Saga ne fait que le jouer.

const { app, BrowserWindow, dialog, ipcMain, Menu, net, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

// Réglages et journal dans %APPDATA%\atelier-moteur, que Saga soit lancé depuis le clone
// (npm start) ou installé avec Saga-Setup.exe.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-moteur'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range la fenêtre
// sous l'icône épinglée de Saga dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.saga');

// --- Journal (saga.log) ---
const logPath = () => path.join(app.getPath('userData'), 'saga.log');
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
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CONFIG = {
  zoom: 0,               // 0 = automatique (le plus grand zoom entier qui montre assez de la carte), sinon ×1 à ×8
  casesVisibles: 11,     // en zoom automatique : combien de cases on voit au moins en hauteur
  courirParDefaut: false, // true : on court sans tenir Maj (Maj fait alors marcher)
  meteo: true,           // montrer la météo des cartes
  jeuxRecents: [],       // les dossiers de jeu ouverts, du plus récent au plus ancien
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

handle('config:read', async () => ({ config: await readConfig(), path: configPath() }));
handle('config:write', async (_event, changes) => modifierConfig((config) => Object.assign(config, changes)));
handle('app:version', async () => app.getVersion());

// --- Le jeu ---
// Un jeu = un dossier écrit par Tafl (voir tuiles/FORMAT.md) : jeu.json, tuiles.tafl, cartes/*.json,
// donnees/*.json. On lit tout d'un coup et on l'envoie à l'interface sous forme de textes : le moteur
// (renderer/moteur/) ne touche jamais au disque, ce qui lui permettra un jour de tourner dans un
// navigateur (un export web du jeu).
const MAP_FILE = /^cartes\/[a-z0-9-]+\.json$/;
const DATA_FILE = /^donnees\/[a-z0-9-]+\.json$/;
const TILES_FILE = /^[\w.-]+\.tafl$/;
const relJeu = (rel) => String(rel || '').replace(/\\/g, '/');

// Le dossier du jeu, que l'on donne le dossier ou son jeu.json.
function dossierDuJeu(cible) {
  let full = path.resolve(String(cible));
  if (path.basename(full).toLowerCase() === 'jeu.json') full = path.dirname(full);
  return full;
}

async function lireJeu(cible) {
  const dossier = dossierDuJeu(cible);
  const jeuPath = path.join(dossier, 'jeu.json');
  const jeu = await fs.readFile(jeuPath, 'utf8').catch(() => null);
  if (jeu === null) throw new Error(`Pas de jeu.json dans ${dossier} : choisis le dossier d'un jeu créé avec Tafl (Fichier › Nouveau jeu)`);
  let data = {};
  try { data = JSON.parse(jeu); } catch { /* le moteur dira que le fichier est abîmé */ }
  const tuilesRel = TILES_FILE.test(relJeu(data.tuiles)) ? relJeu(data.tuiles) : 'tuiles.tafl';
  const tuiles = await fs.readFile(path.join(dossier, tuilesRel), 'utf8').catch(() => null);
  const cartes = {};
  for (const c of Array.isArray(data.cartes) ? data.cartes : []) {
    const rel = relJeu(c?.fichier);
    if (!MAP_FILE.test(rel)) continue;
    const text = await fs.readFile(path.join(dossier, rel), 'utf8').catch(() => null);
    if (text !== null) cartes[rel] = text;
  }
  const donnees = {};
  for (const f of Object.values(data.donnees && typeof data.donnees === 'object' ? data.donnees : {})) {
    const rel = relJeu(f);
    if (!DATA_FILE.test(rel)) continue;
    const text = await fs.readFile(path.join(dossier, rel), 'utf8').catch(() => null);
    if (text !== null) donnees[rel] = text;
  }
  await modifierConfig((config) => { config.jeuxRecents = [dossier, ...config.jeuxRecents.filter((d) => d !== dossier)].slice(0, 12); });
  log('INFO', `Jeu ouvert : ${dossier}`);
  return { dossier, jeu, tuiles, cartes, donnees };
}

handle('jeu:choisir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, {
    title: 'Ouvrir un jeu (le dossier créé avec Tafl, ou son jeu.json)',
    defaultPath: config.jeuxRecents[0] ? path.dirname(config.jeuxRecents[0]) : app.getPath('documents'),
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'Jeu Tafl', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return lireJeu(result.filePaths[0]);
});
// Ouvrir (ou recharger, F5) un jeu dont on connaît le dossier.
handle('jeu:ouvrir', async (_event, dossier) => lireJeu(dossier));
handle('jeu:recents', async () => (await readConfig()).jeuxRecents.filter((d) => fsSync.existsSync(path.join(d, 'jeu.json'))));
handle('jeu:montrer', async (_event, dossier) => {
  const err = await shell.openPath(dossierDuJeu(dossier));
  if (err) throw new Error(err);
});

// --- Sauvegardes ---
// Une sauvegarde par jeu, dans %APPDATA%\atelier-moteur\sauvegardes (jamais dans le dossier du jeu :
// Saga ne l'écrit pas, et la sauvegarde ne doit pas partir dans Git avec le jeu). Le nom du fichier
// vient du chemin du dossier du jeu.
const crypto = require('node:crypto');
const sauvegardePath = (dossier) => path.join(app.getPath('userData'), 'sauvegardes',
  `${crypto.createHash('sha1').update(dossierDuJeu(dossier).toLowerCase()).digest('hex').slice(0, 16)}.json`);
handle('sauvegarde:lire', async (_event, dossier) => {
  try { return JSON.parse(await fs.readFile(sauvegardePath(dossier), 'utf8')); } catch { return null; }
});
handle('sauvegarde:ecrire', async (_event, dossier, donnees) => {
  const file = sauvegardePath(dossier);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ ...donnees, dossier: dossierDuJeu(dossier) }, null, 1), 'utf8');
  await fs.rename(temp, file);
});

// --- Mise à jour ---
// Comme Brokk et Tafl, Saga tourne de deux façons et se met à jour selon celle utilisée :
// - Installé avec Saga-Setup.exe (app.isPackaged) : on cherche sur GitHub la Release saga-vX.Y.Z
//   la plus récente (pas « la dernière Release » du dépôt : celle-là est celle de Rune), puis
//   electron-updater y télécharge l'installeur, ferme Saga, l'installe sans rien demander et le relance.
// - Lancé depuis le clone git (npm start) : git pull + npm install, confiés à moteur/mettre-a-jour.bat,
//   lancé dans sa propre fenêtre APRÈS la fermeture de Saga.

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

// La Release de Saga la plus récente publiée sur GitHub (on ignore celles des autres outils).
// La liste vient de commun/github.js : le flux des Releases d'abord (pas compté dans la limite de
// 60 demandes par heure de GitHub), l'API seulement en complément, gardée sur le disque.
// moteur/commun/ est rempli par « npm install » ; depuis le clone, s'il manque, on prend commun/.
const { creerGithub, LimiteGithub } = (() => {
  try { return require('./commun/github'); } catch { return require('../commun/github'); }
})();
let github = null;
async function latestSagaRelease() {
  github ??= creerGithub({ net, dossier: app.getPath('userData'), agent: 'Saga' });
  const releases = (await github.releases()).filter((r) => /^saga-v\d+\.\d+\.\d+$/.test(r.tag_name));
  let best = null;
  for (const r of releases) {
    const version = r.tag_name.slice('saga-v'.length);
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
      release = await latestSagaRelease();
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
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) throw new Error('git est introuvable : installe Git pour Windows pour pouvoir mettre Saga à jour');
    throw new Error(`Impossible de contacter GitHub : ${err.message}`);
  }
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!upstream) throw new Error(`La branche « ${branch} » n'est reliée à aucune branche GitHub`);
  // Seulement ce qui touche Saga (les nouveautés des autres outils ne comptent pas ici).
  const changes = await git(['log', '--format=%s', 'HEAD..@{u}', '--', 'moteur']);
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

// --- Fenêtre ---
const TITLE_BAR = { color: '#0b0b0f', symbolColor: '#cccccc', height: 40 };
const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Plein écran (F11) : la barre de titre disparaît, le jeu prend tout l'écran.
handle('window:pleinEcran', async (event, oui) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.setFullScreen(oui === undefined ? !win.isFullScreen() : Boolean(oui));
  return win.isFullScreen();
});

// Ce qu'on passe en ligne de commande (c'est ainsi que Tafl et Atelier lancent un jeu) :
//   Saga.exe D:\Jeux\MonJeu                     le jeu, depuis le départ du joueur
//   Saga.exe D:\Jeux\MonJeu --carte=route-1 --x=4 --y=7   le jeu, sur cette case (« Jouer ici » de Tafl)
// (Lancé depuis le clone, un des arguments est le dossier de Saga lui-même : on le saute.)
function lancementDepuis(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  const option = (nom) => args.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? null;
  const dossier = args
    .filter((a) => !a.startsWith('-') && a !== '.')
    .map((a) => dossierDuJeu(a))
    .find((a) => a !== app.getAppPath() && fsSync.existsSync(path.join(a, 'jeu.json'))) || null;
  if (!dossier) return null;
  const carte = option('carte');
  const x = Number(option('x')), y = Number(option('y'));
  return { dossier, depart: carte && Number.isInteger(x) && Number.isInteger(y) ? { carte, x, y, direction: option('direction') || 'bas' } : null };
}

let lancement = lancementDepuis(process.argv);
handle('startup', async () => {
  const out = lancement;
  lancement = null;
  return out;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#0b0b0f',
    title: 'Saga',
    ...(fsSync.existsSync(WINDOW_ICON) ? { icon: WINDOW_ICON } : {}),
    // Pas de barre de titre système : celle de l'interface la remplace,
    // et Windows y dessine ses boutons réduire / agrandir / fermer.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 13 } } : { titleBarOverlay: TITLE_BAR }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('enter-full-screen', () => win.webContents.send('window:pleinEcran', true));
  win.on('leave-full-screen', () => win.webContents.send('window:pleinEcran', false));
  win.webContents.on('before-input-event', (event, input) => {
    // F12 = outils de développement (comme dans Rune, Skald et Tafl). Ctrl+R ne recharge PAS
    // l'interface ici : dans un jeu, on appuie vite sur des touches. F5 recharge le jeu (voir app.js).
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });
  return win;
}

// Une seule fenêtre Saga : « Jouer » dans Tafl alors que Saga est déjà ouvert recharge le jeu
// dans la fenêtre existante (avec les cartes que Tafl vient d'enregistrer).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const l = lancementDepuis(argv);
    if (l) win.webContents.send('jeu:externe', l);
  });

  app.whenReady().then(() => {
    log('INFO', `Démarrage de Saga ${app.getVersion()}`);
    Menu.setApplicationMenu(null);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
