// Processus principal de Tafl.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque.
// Tout le dessin (tuiles, palette, carte…) se fait dans l'interface (renderer/), dans des <canvas> :
// ici, on ne fait qu'ouvrir et enregistrer des fichiers, garder les réglages et gérer les mises à jour.
// Même organisation que Skald (retouche/main.js), pour s'y retrouver d'un outil à l'autre.

const { app, BrowserWindow, dialog, ipcMain, Menu, net, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

// Réglages et journal dans %APPDATA%\atelier-tuiles, que Tafl soit lancé depuis le clone
// (npm start) ou installé avec Tafl-Setup.exe.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-tuiles'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range la fenêtre
// sous l'icône épinglée de Tafl dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.tafl');

// --- Journal (tafl.log) ---
const logPath = () => path.join(app.getPath('userData'), 'tafl.log');
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
  claudeCommand: 'claude', // panneau Claude (../commun/claude.js)
  claudeModel: '',
  accentColor: '#7bd88f',
  glass: true,
  windowBlur: false,
  tileSize: 16,
  palette: 'nature',
  pixelGrid: true,
  tileGrid: true,
  exportScale: 1,
  historySteps: 60,
  recentFiles: [],
  lastFolder: '',
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
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), 'utf8');
}

// --- Fichiers ---
// L'interface ne peut lire que les fichiers que tu as choisis (fenêtre « Ouvrir », glisser-déposer,
// fichiers récents, double-clic sur un .tafl) et n'écrire que là où tu as dit d'enregistrer.
const OPEN_EXTENSIONS = ['tafl', 'png', 'gif', 'webp', 'bmp'];
const writable = new Set();
const writableFolders = new Set();
const gameFolders = new Set(); // dossiers de jeu ouverts ou choisis : Tafl peut y écrire ses fichiers
const isGameFile = (file) => path.basename(file).toLowerCase() === 'jeu.json';
const canOpen = (file) => OPEN_EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase()) || isGameFile(file);

async function rememberRecent(file) {
  const config = await readConfig();
  // Seuls les jeux de tuiles (.tafl) vont dans les récents : les PNG importés n'en sont qu'une source.
  if (path.extname(file).toLowerCase() === '.tafl' || isGameFile(file)) config.recentFiles = [file, ...config.recentFiles.filter((f) => f !== file)].slice(0, 12);
  config.lastFolder = path.dirname(file);
  await writeConfig(config);
}

async function loadFile(file) {
  if (!canOpen(file)) throw new Error(`Tafl n'ouvre pas ce type de fichier : ${path.basename(file)}`);
  const bytes = await fs.readFile(file);
  if (path.extname(file).toLowerCase() === '.tafl') writable.add(path.resolve(file)); // « Enregistrer » pourra le réécrire
  await rememberRecent(file);
  return { path: file, name: path.basename(file), bytes };
}

// kind : 'tafl' (ouvrir un jeu de tuiles) ou 'image' (importer une planche de tuiles en PNG…).
// dossier : où ouvrir la fenêtre (un projet ouvert depuis Atelier) ; sinon le dernier dossier utilisé.
// titre : le titre de la fenêtre (« Portrait de Maman »…).
handle('file:open', async (event, { kind = 'tafl', dossier, titre } = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const ici = typeof dossier === 'string' && fsSync.existsSync(dossier) ? dossier : null;
  const filters = kind === 'image'
    ? [{ name: 'Images (planche de tuiles)', extensions: ['png', 'gif', 'webp', 'bmp'] }]
    : [{ name: 'Jeu de tuiles Tafl, ou jeu.json d\'un dossier de jeu', extensions: ['tafl', 'json'] }, { name: 'Images (planche de tuiles)', extensions: ['png', 'gif', 'webp', 'bmp'] }];
  const result = await dialog.showOpenDialog(win, {
    title: titre ? String(titre) : kind === 'image' ? 'Importer une planche de tuiles' : 'Ouvrir un jeu de tuiles',
    defaultPath: ici || config.lastFolder || app.getPath('documents'),
    properties: ['openFile'],
    filters: [...filters, { name: 'Tous les fichiers', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return loadFile(result.filePaths[0]);
});

handle('file:openPath', async (_event, file) => loadFile(String(file)));
handle('file:recents', async () => {
  const { recentFiles } = await readConfig();
  return recentFiles.filter((f) => fsSync.existsSync(f));
});

// Choisir où enregistrer. Le chemin choisi devient inscriptible.
handle('file:saveDialog', async (event, { defaultName, format }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const filters = {
    tafl: { name: 'Jeu de tuiles Tafl', extensions: ['tafl'] },
    png: { name: 'Image PNG', extensions: ['png'] },
  };
  const result = await dialog.showSaveDialog(win, {
    title: format === 'tafl' ? 'Enregistrer le jeu de tuiles' : 'Exporter en PNG',
    defaultPath: path.join(config.lastFolder || app.getPath('documents'), defaultName || 'tuiles'),
    filters: [filters[format] || filters.png],
  });
  if (result.canceled || !result.filePath) return null;
  writable.add(path.resolve(result.filePath));
  return result.filePath;
});

// Choisir un dossier (tuiles séparées, carte pour Tiled). Ses fichiers deviennent inscriptibles.
handle('folder:pick', async (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, { title: String(title || 'Choisir un dossier'), defaultPath: config.lastFolder || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled) return null;
  writableFolders.add(path.resolve(result.filePaths[0]));
  return result.filePaths[0];
});

handle('file:write', async (_event, file, bytes) => {
  const full = path.resolve(String(file));
  if (!writable.has(full) && !writableFolders.has(path.dirname(full))) throw new Error(`Écriture refusée : ${file}`);
  // On écrit d'abord un fichier temporaire, puis on le renomme : si quelque chose plante
  // en plein milieu, l'ancien fichier reste intact.
  const temp = `${full}.tafl-tmp`;
  await fs.writeFile(temp, Buffer.from(bytes));
  await fs.rename(temp, full);
  await rememberRecent(full);
  return { path: full, name: path.basename(full), size: bytes.byteLength };
});

// --- Dossier de jeu (Tafl 0.6, voir FORMAT.md) ---
// MonJeu/jeu.json, MonJeu/tuiles.tafl, MonJeu/cartes/*.json, MonJeu/donnees/*.json (Tafl 0.7) et
// MonJeu/FORMAT.md. Tafl n'écrit dans un dossier de jeu que si tu l'as ouvert ou choisi, et seulement
// ces fichiers-là.
const GAME_FILE = /^(jeu\.json|[\w.-]+\.tafl|cartes\/[a-z0-9-]+\.json|donnees\/[a-z0-9-]+\.json)$/;
const MAP_FILE = /^cartes\/[a-z0-9-]+\.json$/;
const DATA_FILE = /^donnees\/[a-z0-9-]+\.json$/;
const relGame = (rel) => String(rel).replace(/\\/g, '/');
async function mapFilesIn(folder) {
  const names = await fs.readdir(path.join(folder, 'cartes')).catch(() => []);
  return names.map((n) => `cartes/${n}`).filter((f) => MAP_FILE.test(f));
}

handle('game:pick', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, { title: 'Dossier du jeu (crée-le s\'il n\'existe pas encore)', defaultPath: config.lastFolder || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = path.resolve(result.filePaths[0]);
  gameFolders.add(folder);
  const exists = fsSync.existsSync(path.join(folder, 'jeu.json'));
  return { folder, exists, fichiers: exists ? await mapFilesIn(folder) : [] };
});

// Ouvrir un jeu : le chemin de son jeu.json, ou son dossier.
handle('game:open', async (_event, target) => {
  let file = path.resolve(String(target));
  if (fsSync.existsSync(file) && fsSync.statSync(file).isDirectory()) file = path.join(file, 'jeu.json');
  if (!isGameFile(file)) throw new Error(`${path.basename(file)} n'est pas le jeu.json d'un dossier de jeu`);
  const folder = path.dirname(file);
  const jeu = await fs.readFile(file, 'utf8');
  let data = {};
  try { data = JSON.parse(jeu); } catch { /* l'interface dira que le fichier est abîmé */ }
  const tuilesName = typeof data.tuiles === 'string' && GAME_FILE.test(data.tuiles) && data.tuiles.endsWith('.tafl') ? data.tuiles : 'tuiles.tafl';
  const tuiles = await fs.readFile(path.join(folder, tuilesName), 'utf8').catch(() => null);
  const cartes = {};
  for (const c of Array.isArray(data.cartes) ? data.cartes : []) {
    const rel = relGame(c?.fichier || '');
    if (!MAP_FILE.test(rel)) continue;
    const text = await fs.readFile(path.join(folder, rel), 'utf8').catch(() => null);
    if (text !== null) cartes[rel] = text;
  }
  const donnees = {};
  for (const f of Object.values(data.donnees && typeof data.donnees === 'object' ? data.donnees : {})) {
    const rel = relGame(f || '');
    if (!DATA_FILE.test(rel)) continue;
    const text = await fs.readFile(path.join(folder, rel), 'utf8').catch(() => null);
    if (text !== null) donnees[rel] = text;
  }
  gameFolders.add(folder);
  await rememberRecent(file);
  return { folder, path: file, jeu, tuiles, cartes, donnees };
});

// Tafl 0.8 : importer les données officielles Pokémon (PokeAPI, voir officiel.js), à la demande.
// Seuls les fichiers de PokeAPI sur GitHub sont téléchargés.
const officiel = require('./officiel');
handle('officiel:importer', async (event, options) => {
  const telecharger = async (url) => {
    if (!url.startsWith('https://raw.githubusercontent.com/PokeAPI/')) throw new Error('Adresse refusée');
    const r = await net.fetch(url);
    if (!r.ok) throw new Error(`${url} : ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  const progres = (p) => { if (!event.sender.isDestroyed()) event.sender.send('officiel:progres', p); };
  try {
    return await officiel.importer(options || {}, progres, telecharger);
  } catch (err) {
    throw new Error(`Import impossible (es-tu connecté à Internet ?) : ${err.message}`);
  }
});

// Le jeu.json d'un dossier de jeu, s'il y en a un (Atelier ouvre Tafl sur un dossier de projet).
handle('game:find', async (_event, folder) => {
  const file = path.join(path.resolve(String(folder || '')), 'jeu.json');
  return folder && fsSync.existsSync(file) ? file : null;
});
// Un jeu que Claude vient d'écrire dans le projet : Tafl pourra le réenregistrer.
handle('game:register', async (_event, file) => {
  const full = path.resolve(String(file));
  if (!isGameFile(full) || !fsSync.existsSync(full)) throw new Error('Pas de jeu.json à cet endroit');
  gameFolders.add(path.dirname(full));
});

// Enregistrer : files = [[chemin relatif, octets]], remove = cartes supprimées depuis l'ouverture.
handle('game:write', async (_event, folder, files, remove = []) => {
  const root = path.resolve(String(folder));
  if (!gameFolders.has(root)) throw new Error(`Écriture refusée : ${root} n'est pas un dossier de jeu ouvert`);
  await fs.mkdir(path.join(root, 'cartes'), { recursive: true });
  await fs.mkdir(path.join(root, 'donnees'), { recursive: true });
  for (const [rel, bytes] of files) {
    const r = relGame(rel);
    if (!GAME_FILE.test(r)) throw new Error(`Fichier refusé dans le dossier de jeu : ${rel}`);
    const full = path.join(root, r);
    const temp = `${full}.tafl-tmp`;
    await fs.writeFile(temp, Buffer.from(bytes));
    await fs.rename(temp, full);
  }
  for (const rel of remove) {
    const r = relGame(rel);
    if (MAP_FILE.test(r)) await fs.rm(path.join(root, r), { force: true });
  }
  // La description du format, toujours celle de cette version de Tafl.
  await fs.copyFile(path.join(__dirname, 'FORMAT.md'), path.join(root, 'FORMAT.md')).catch((err) => log('ERREUR', `FORMAT.md : ${err.message}`));
  const file = path.join(root, 'jeu.json');
  await rememberRecent(file);
  return { path: file, folder: root };
});

handle('file:reveal', async (_event, file) => shell.showItemInFolder(String(file)));

// --- Jouer : lancer le jeu dans Saga, le moteur (atelier/moteur) ---
// Saga reçoit le dossier du jeu en ligne de commande, et pour « Jouer ici » la carte et la case :
//   Saga.exe D:\Jeux\MonJeu --carte=route-1 --x=4 --y=7
// Où est Saga ?
// - Tafl lancé depuis le clone (npm start) et Saga installé dans le clone (moteur/node_modules) :
//   on lance le Saga du clone, avec son Electron, pour jouer avec la même version du code.
// - Sinon, le Saga installé (Saga-Setup.exe) : le registre de Windows le dit (comme dans Atelier),
//   ou l'emplacement par défaut %LOCALAPPDATA%\Programs\Saga.
function sagaDuClone() {
  const dossier = path.join(__dirname, '..', 'moteur');
  try {
    const electron = require(path.join(dossier, 'node_modules', 'electron'));
    return typeof electron === 'string' && fsSync.existsSync(electron) ? { exe: electron, args: [dossier] } : null;
  } catch {
    return null;
  }
}
function sagaInstalle() {
  return new Promise((resolve) => {
    const parDefaut = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Saga', 'Saga.exe');
    const ici = () => resolve(fsSync.existsSync(parDefaut) ? { exe: parDefaut, args: [] } : null);
    if (process.platform !== 'win32') return ici();
    execFile('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', 'Saga', '/d'], { windowsHide: true }, (err, stdout) => {
      if (err) return ici();
      // Le bloc du programme dont le nom affiché est exactement « Saga », puis son dossier d'installation.
      for (const bloc of String(stdout).split(/\r?\n(?=HKEY_)/)) {
        if (!/^\s+DisplayName\s+REG_SZ\s+Saga\s*$/m.test(bloc)) continue;
        const lieu = bloc.match(/^\s+InstallLocation\s+REG_SZ\s+(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, '');
        const exe = lieu && path.join(lieu, 'Saga.exe');
        if (exe && fsSync.existsSync(exe)) return resolve({ exe, args: [] });
      }
      ici();
    });
  });
}
handle('jeu:jouer', async (_event, dossier, depart) => {
  const root = path.resolve(String(dossier));
  if (!gameFolders.has(root) || !fsSync.existsSync(path.join(root, 'jeu.json'))) throw new Error('Enregistre d\'abord le jeu dans un dossier');
  const saga = (!app.isPackaged && sagaDuClone()) || (await sagaInstalle()) || sagaDuClone();
  if (!saga) throw new Error('Saga, le moteur du jeu, n\'est pas installé : installe-le depuis Atelier');
  const args = [...saga.args, root];
  if (depart?.carte) args.push(`--carte=${depart.carte}`, `--x=${Math.round(depart.x)}`, `--y=${Math.round(depart.y)}`, `--direction=${depart.direction || 'bas'}`);
  const child = spawn(saga.exe, args, { cwd: root, detached: true, stdio: 'ignore' });
  child.on('error', (err) => log('ERREUR', `Saga : ${err.message}`));
  child.unref();
  log('INFO', `Jouer : ${saga.exe} ${args.join(' ')}`);
});

// --- Panneau Claude (le même que dans Skald, Brokk : voir ../commun/LISEZMOI.md) ---
const claude = require('./commun/claude');
const { creerGithub, LimiteGithub } = require('./commun/github');
claude.register({ handle, log, dataDir: app.getPath('userData'), readConfig, outil: { nom: 'Tafl', role: "l'éditeur de tuiles et de cartes en pixel art de Ragna (pour son jeu façon Pokémon, export Tiled)" } });

handle('config:read', async () => ({ config: await readConfig(), path: configPath() }));
handle('config:write', async (_event, changes) => {
  const config = { ...(await readConfig()), ...changes };
  await writeConfig(config);
  return config;
});
handle('app:version', async () => app.getVersion());

// --- Mise à jour ---
// Comme Skald, Tafl tourne de deux façons et se met à jour selon celle utilisée :
// - Installé avec Tafl-Setup.exe (app.isPackaged) : on cherche sur GitHub la Release tafl-vX.Y.Z
//   la plus récente (la Release « Latest » du dépôt est celle de Rune). electron-updater y télécharge
//   l'installeur (décrit par latest.yml), ferme Tafl, l'installe sans rien demander et le relance.
// - Lancé depuis le clone git (npm start) : git pull + npm install, confiés à
//   tuiles/mettre-a-jour.bat, lancé dans sa propre fenêtre APRÈS la fermeture de Tafl
//   (sous Windows, npm ne peut pas remplacer Electron tant que Tafl l'utilise).

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

// La Release de Tafl la plus récente publiée sur GitHub (on ignore celles des autres outils).
// La liste vient de commun/github.js : le flux des Releases d'abord (pas compté dans la limite de
// 60 demandes par heure de GitHub), l'API seulement en complément, gardée sur le disque.
let github = null;
async function latestTaflRelease() {
  github ??= creerGithub({ net, dossier: app.getPath('userData'), agent: 'Tafl' });
  const releases = (await github.releases()).filter((r) => /^tafl-v\d+\.\d+\.\d+$/.test(r.tag_name));
  let best = null;
  for (const r of releases) {
    const version = r.tag_name.slice('tafl-v'.length);
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
      release = await latestTaflRelease();
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
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) throw new Error('git est introuvable : installe Git pour Windows pour pouvoir mettre Tafl à jour');
    throw new Error(`Impossible de contacter GitHub : ${err.message}`);
  }
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!upstream) throw new Error(`La branche « ${branch} » n'est reliée à aucune branche GitHub`);
  // Seulement ce qui touche Tafl (les nouveautés des autres outils ne comptent pas ici).
  const changes = await git(['log', '--format=%s', 'HEAD..@{u}', '--', 'tuiles']);
  return { mode: 'git', branch, changes: changes ? changes.split('\n') : [] };
});

handle('update:install', async () => {
  log('INFO', 'Mise à jour lancée depuis le bouton');
  if (app.isPackaged) {
    if (!pendingRelease) throw new Error('Cherche d\'abord la mise à jour');
    const updater = installerUpdater();
    // L'installeur et latest.yml sont dans les fichiers de la Release tafl-vX.Y.Z trouvée plus haut.
    updater.setFeedURL({ provider: 'generic', url: `https://github.com/${GITHUB_REPO}/releases/download/${pendingRelease.tag}` });
    const result = await updater.checkForUpdates();
    if (!result?.isUpdateAvailable) throw new Error(`La Release ${pendingRelease.tag} ne contient pas d'installeur utilisable`);
    await updater.downloadUpdate();
    // Installation silencieuse (pas de fenêtre d'installeur), puis Tafl se relance tout seul.
    setTimeout(() => updater.quitAndInstall(true, true), 300);
    return;
  }
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'start', '', path.join(__dirname, 'mettre-a-jour.bat')], { cwd: REPO, detached: true, stdio: 'ignore' })
    : spawn('sh', [path.join(__dirname, 'mettre-a-jour.sh')], { cwd: REPO, detached: true, stdio: 'ignore' });
  child.unref();
  // Le script attend 2 secondes que Tafl soit fermé avant de toucher aux fichiers.
  setTimeout(() => app.quit(), 300);
});

// --- Fenêtre ---
const TITLE_BAR = { color: '#101014', symbolColor: '#cccccc', height: 40 };

// Flou de Windows 11 ("acrylic"), à partir de Windows 11 22H2 (build 22621), comme dans Rune et Skald.
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
handle('app:relaunch', async () => {
  app.relaunch();
  app.quit();
});
// Fermer sans redemander (après « Quitter sans enregistrer »).
handle('window:forceClose', async (event) => BrowserWindow.fromWebContents(event.sender).destroy());

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Fichier passé en ligne de commande : double-clic sur un .tafl, ou « Ouvrir avec Tafl ».
const fileFromArgs = (argv) => argv.slice(1).filter((a) => !a.startsWith('-') && canOpen(a) && fsSync.existsSync(a)).map((a) => path.resolve(a))[0] || null;
let startupFile = fileFromArgs(process.argv);
handle('file:startup', async () => {
  const file = startupFile;
  startupFile = null;
  return file;
});

// Dossier passé en ligne de commande (« Tafl.exe D:\Projets\mon-jeu », c'est ainsi qu'Atelier ouvre un
// projet) : Tafl s'ouvre avec la fenêtre « Ouvrir » placée dans ce dossier.
// (Lancé depuis le clone, un des arguments est le dossier de Tafl lui-même : on le saute.)
const folderFromArgs = (argv) => argv.slice(app.isPackaged ? 1 : 2)
  .filter((a) => !a.startsWith('-') && a !== '.')
  .map((a) => path.resolve(a))
  .find((a) => a !== app.getAppPath() && fsSync.existsSync(a) && fsSync.statSync(a).isDirectory()) || null;
let startupFolder = folderFromArgs(process.argv);
claude.setProjet(startupFolder); // le projet avec lequel Atelier a ouvert l'outil
handle('folder:startup', async () => {
  const folder = startupFolder;
  startupFolder = null;
  return folder;
});

function createWindow(config) {
  const blur = wantsBlur(config);
  const win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 960,
    minHeight: 560,
    backgroundColor: blur ? '#00000000' : '#101014',
    ...(blur ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'Tafl',
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
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (event, input) => {
    // F12 = outils de développement, Ctrl+R = recharger l'interface (comme dans Rune et Skald).
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      win.webContents.toggleDevTools();
    } else if (input.type === 'keyDown' && input.control && !input.alt && !input.shift && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      win.webContents.reload();
    }
  });
  return win;
}

// Une seule fenêtre Tafl : double-cliquer un 2e .tafl l'envoie à la fenêtre ouverte.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const file = fileFromArgs(argv);
    if (file) win.webContents.send('file:external', file);
    const folder = folderFromArgs(argv);
    claude.setProjet(folder);
    if (folder) win.webContents.send('folder:external', folder);
  });

  app.whenReady().then(async () => {
    const config = await readConfig();
    log('INFO', `Démarrage de Tafl ${app.getVersion()}`);
    Menu.setApplicationMenu(null);
    createWindow(config);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => claude.stop());
}
