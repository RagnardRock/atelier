// Processus principal de Skald.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque.
// Toute la retouche (calques, pinceau, réglages…) se fait dans l'interface (renderer/), dans des
// <canvas> : ici, on ne fait qu'ouvrir et enregistrer des fichiers, et garder les réglages.

const { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

// Réglages et journal dans %APPDATA%\atelier-retouche, que Skald soit lancé depuis le clone
// (npm start) ou installé avec Skald-Setup.exe.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-retouche'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range la fenêtre
// sous l'icône épinglée de Skald dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.skald');

// --- Journal (skald.log) ---
const logPath = () => path.join(app.getPath('userData'), 'skald.log');
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
  accentColor: '#e0a526',
  glass: true,
  windowBlur: false,
  exportFormat: 'png',
  exportQuality: 90,
  historySteps: 40,
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
// fichiers récents, « Ouvrir avec Skald ») et n'écrire que là où tu as dit d'enregistrer.
const IMAGE_EXTENSIONS = ['psd', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'avif'];
const writable = new Set();
const isImage = (file) => IMAGE_EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase());

async function rememberRecent(file) {
  const config = await readConfig();
  config.recentFiles = [file, ...config.recentFiles.filter((f) => f !== file)].slice(0, 12);
  config.lastFolder = path.dirname(file);
  await writeConfig(config);
}

async function loadFile(file) {
  if (!isImage(file)) throw new Error(`Ce type de fichier n'est pas une image : ${path.basename(file)}`);
  const bytes = await fs.readFile(file);
  writable.add(path.resolve(file)); // « Enregistrer » pourra réécrire ce fichier
  await rememberRecent(file);
  return { path: file, name: path.basename(file), bytes };
}

handle('file:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, {
    title: 'Ouvrir une image',
    defaultPath: config.lastFolder || app.getPath('pictures'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images et Photoshop', extensions: IMAGE_EXTENSIONS },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(loadFile));
});

// Fichier récent, glissé sur la fenêtre, ou passé par Windows (« Ouvrir avec »).
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
    psd: { name: 'Photoshop (calques conservés)', extensions: ['psd'] },
    png: { name: 'PNG', extensions: ['png'] },
    jpeg: { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
    webp: { name: 'WebP', extensions: ['webp'] },
    ico: { name: 'Icône Windows / favicon', extensions: ['ico'] },
  };
  const result = await dialog.showSaveDialog(win, {
    title: format === 'psd' ? 'Enregistrer (PSD)' : 'Exporter',
    defaultPath: path.join(config.lastFolder || app.getPath('pictures'), defaultName || 'sans-titre'),
    filters: [filters[format] || filters.png],
  });
  if (result.canceled || !result.filePath) return null;
  writable.add(path.resolve(result.filePath));
  return result.filePath;
});

// Choisir un dossier (export de plusieurs tailles d'un logo). Ses fichiers deviennent inscriptibles.
const writableFolders = new Set();
handle('folder:pick', async (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, { title: String(title || 'Choisir un dossier'), defaultPath: config.lastFolder || app.getPath('pictures'), properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled) return null;
  writableFolders.add(path.resolve(result.filePaths[0]));
  return result.filePaths[0];
});

handle('file:write', async (_event, file, bytes) => {
  const full = path.resolve(String(file));
  if (!writable.has(full) && !writableFolders.has(path.dirname(full))) throw new Error(`Écriture refusée : ${file}`);
  // On écrit d'abord un fichier temporaire, puis on le renomme : si quelque chose plante
  // en plein milieu, l'ancien fichier reste intact.
  const temp = `${full}.skald-tmp`;
  await fs.writeFile(temp, Buffer.from(bytes));
  await fs.rename(temp, full);
  await rememberRecent(full);
  return { path: full, name: path.basename(full), size: bytes.byteLength };
});

// Presse-papiers de Windows : les images copiées depuis Photoshop, une capture d'écran (Win+Maj+S),
// un navigateur… arrivent ici en PNG ; ce que Skald copie peut se coller ailleurs.
// (API asynchrone d'Electron 44 : clipboard.read / clipboard.write, comme navigator.clipboard.)
handle('clipboard:readImage', async () => {
  for (const item of await clipboard.read()) {
    if (!item.types.includes('image/png')) continue;
    const blob = await item.getType('image/png');
    return new Uint8Array(await blob.arrayBuffer());
  }
  return null;
});
handle('clipboard:writeImage', async (_event, bytes) => {
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
});

handle('file:reveal', async (_event, file) => shell.showItemInFolder(String(file)));

handle('config:read', async () => ({ config: await readConfig(), path: configPath() }));
handle('config:write', async (_event, changes) => {
  const config = { ...(await readConfig()), ...changes };
  await writeConfig(config);
  return config;
});
handle('app:version', async () => app.getVersion());

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
handle('app:relaunch', async () => {
  app.relaunch();
  app.quit();
});
// Fermer sans redemander (après « Quitter sans enregistrer »).
handle('window:forceClose', async (event) => BrowserWindow.fromWebContents(event.sender).destroy());

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Images passées en ligne de commande : « Ouvrir avec Skald » ou un fichier glissé sur l'icône.
const filesFromArgs = (argv) => argv.slice(1).filter((a) => !a.startsWith('-') && isImage(a) && fsSync.existsSync(a)).map((a) => path.resolve(a));

// Images de la ligne de commande au démarrage : l'interface les demande une fois prête.
let startupFiles = filesFromArgs(process.argv);
handle('file:startup', async () => {
  const files = startupFiles;
  startupFiles = [];
  return files;
});

function createWindow(config) {
  const blur = wantsBlur(config);
  const win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 900,
    minHeight: 500,
    backgroundColor: blur ? '#00000000' : '#101014',
    ...(blur ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'Skald',
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
    // F12 = outils de développement, Ctrl+R = recharger l'interface (comme dans Rune).
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

// Une seule fenêtre Skald : « Ouvrir avec » sur une 2e image l'ajoute en onglet.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    for (const file of filesFromArgs(argv)) win.webContents.send('file:external', file);
  });

  app.whenReady().then(async () => {
    const config = await readConfig();
    log('INFO', `Démarrage de Skald ${app.getVersion()}`);
    Menu.setApplicationMenu(null);
    createWindow(config);
  });
  app.on('window-all-closed', () => app.quit());
}
