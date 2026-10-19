// Processus principal d'Electron.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque.
// L'interface (renderer/) ne lit et n'écrit des fichiers qu'en lui demandant via IPC.

const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
// node-pty lance un vrai terminal (ConPTY sous Windows) : couleurs, ssh, vim… tout marche.
const pty = require('node-pty');

const DEFAULT_CONFIG = path.join(__dirname, 'config.default.json');
// La config perso vit dans le dossier utilisateur de l'app
// (sous Windows : %APPDATA%\atelier-ide\config.json), pour survivre aux mises à jour.
const configPath = () => path.join(app.getPath('userData'), 'config.json');

// Dossier actuellement ouvert : on refuse de lire/écrire en dehors.
let rootFolder = null;

function isAllowed(target) {
  const full = path.resolve(target);
  if (full === configPath()) return true;
  if (!rootFolder) return false;
  const rel = path.relative(rootFolder, full);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function assertAllowed(target) {
  if (!isAllowed(target)) throw new Error(`Accès refusé hors du dossier ouvert : ${target}`);
}

async function ensureConfig() {
  try {
    await fs.access(configPath());
  } catch {
    await fs.mkdir(path.dirname(configPath()), { recursive: true });
    await fs.copyFile(DEFAULT_CONFIG, configPath());
  }
}

async function readConfig() {
  const defaults = JSON.parse(await fs.readFile(DEFAULT_CONFIG, 'utf8'));
  try {
    const user = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    return { ...defaults, ...user };
  } catch {
    // Config illisible (JSON cassé pendant une modif) : on garde les valeurs par défaut.
    return defaults;
  }
}

// --- Canaux IPC : la liste exacte de ce que l'interface peut demander ---

ipcMain.handle('folder:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  rootFolder = path.resolve(result.filePaths[0]);
  return rootFolder;
});

ipcMain.handle('folder:read', async (_event, dir) => {
  assertAllowed(dir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.name !== '.git')
    .map((e) => ({ name: e.name, path: path.join(dir, e.name), isDir: e.isDirectory() }))
    // Dossiers d'abord, puis ordre alphabétique.
    .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
});

ipcMain.handle('file:read', async (_event, file) => {
  assertAllowed(file);
  return fs.readFile(file, 'utf8');
});

ipcMain.handle('file:write', async (_event, file, content) => {
  assertAllowed(file);
  await fs.writeFile(file, content, 'utf8');
});

ipcMain.handle('config:get', async () => readConfig());
ipcMain.handle('config:path', async () => configPath());

// --- Terminaux ---
// Chaque terminal est un processus (PowerShell, ssh…) piloté ici.
// Ce qu'il affiche part vers l'interface ("term:data"), ce que tu tapes revient par "term:write".

const terminals = new Map(); // id -> processus
let nextTerminalId = 1;

// "default" = le shell habituel du système : PowerShell sous Windows, bash/zsh ailleurs.
function resolveCommand(command) {
  if (command !== 'default') return command;
  return process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
}

ipcMain.handle('term:create', async (event, profileName, cols, rows) => {
  const { terminalProfiles } = await readConfig();
  const profile = terminalProfiles.find((p) => p.name === profileName);
  if (!profile) throw new Error(`Profil de terminal inconnu : ${profileName}`);

  const id = nextTerminalId++;
  const proc = pty.spawn(resolveCommand(profile.command), profile.args || [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: rootFolder || os.homedir(), // le terminal démarre dans le dossier ouvert
    env: process.env,
  });
  terminals.set(id, proc);

  const send = (channel, ...args) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, id, ...args);
  };
  proc.onData((data) => send('term:data', data));
  proc.onExit(({ exitCode }) => {
    terminals.delete(id);
    send('term:exit', exitCode);
  });
  return id;
});

ipcMain.on('term:write', (_event, id, data) => terminals.get(id)?.write(data));
ipcMain.on('term:resize', (_event, id, cols, rows) => terminals.get(id)?.resize(cols, rows));
ipcMain.on('term:kill', (_event, id) => terminals.get(id)?.kill());

// --- Fenêtre ---

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1e1e1e',
    title: 'Atelier',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // l'interface n'a pas accès à Node directement
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  await ensureConfig();
  // Pas de menu Fichier/Édition natif : tout passe par l'interface et les raccourcis.
  // On garde seulement les outils de dev (F12) et le rechargement (Ctrl+R).
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Vue', submenu: [{ role: 'reload' }, { role: 'toggleDevTools', accelerator: 'F12' }] },
  ]));
  createWindow();
});

app.on('window-all-closed', () => {
  // On ne laisse aucun PowerShell ou ssh tourner en fond après la fermeture.
  for (const proc of terminals.values()) proc.kill();
  app.quit();
});
