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

// --- Journal (atelier.log) ---
// Toutes les erreurs y sont écrites avec la date, pour retrouver ce qui s'est passé.
// Sous Windows : %APPDATA%\atelier-ide\atelier.log
const logPath = () => path.join(app.getPath('userData'), 'atelier.log');
const MAX_LOG_SIZE = 1024 * 1024; // au-delà de 1 Mo, l'ancien journal devient atelier.old.log

async function log(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  try {
    const { size } = await fs.stat(logPath()).catch(() => ({ size: 0 }));
    if (size > MAX_LOG_SIZE) await fs.rename(logPath(), logPath().replace(/\.log$/, '.old.log'));
    await fs.appendFile(logPath(), line, 'utf8');
  } catch {
    // Si même le journal est inaccessible, on n'a plus que la console.
    console.error(line);
  }
}

// Erreur imprévue dans ce processus : on la journalise et on prévient l'interface au lieu de planter.
function reportError(context, err) {
  const message = `${context} : ${err && err.message ? err.message : err}`;
  log('ERREUR', `${message}\n${(err && err.stack) || ''}`);
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('app:error', message);
}
process.on('uncaughtException', (err) => reportError('Erreur interne', err));
process.on('unhandledRejection', (err) => reportError('Erreur interne', err));

// Comme ipcMain.handle, mais chaque erreur est aussi écrite dans le journal.
// L'interface la reçoit quand même, pour l'afficher.
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
// La config perso vit dans le dossier utilisateur de l'app
// (sous Windows : %APPDATA%\atelier-ide\config.json), pour survivre aux mises à jour.
const configPath = () => path.join(app.getPath('userData'), 'config.json');

// Dossier actuellement ouvert : on refuse de lire/écrire en dehors.
let rootFolder = null;

function isAllowed(target) {
  const full = path.resolve(target);
  if (full === configPath() || full === logPath()) return true;
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

// Renvoie la config et, si ton fichier est invalide, un message qui dit pourquoi.
// Dans ce cas l'IDE continue avec les valeurs par défaut au lieu de refuser de démarrer.
async function loadConfig() {
  const defaults = JSON.parse(await fs.readFile(DEFAULT_CONFIG, 'utf8'));
  let text;
  try {
    text = await fs.readFile(configPath(), 'utf8');
  } catch (err) {
    return { config: defaults, error: `Config illisible (${err.code}), valeurs par défaut utilisées` };
  }
  try {
    const user = JSON.parse(text);
    return { config: { ...defaults, ...user, shortcuts: { ...defaults.shortcuts, ...user.shortcuts } }, error: null };
  } catch (err) {
    return { config: defaults, error: `config.json invalide : ${describeJsonError(text, err)}. Valeurs par défaut utilisées en attendant.` };
  }
}

// "Unexpected token } in JSON at position 120" -> "ligne 5, colonne 3 : Unexpected token }"
function describeJsonError(text, err) {
  const match = /position (\d+)/.exec(err.message);
  if (!match) return err.message;
  const before = text.slice(0, Number(match[1]));
  const line = before.split('\n').length;
  const column = before.length - before.lastIndexOf('\n');
  return `ligne ${line}, colonne ${column} (${err.message.replace(/ in JSON at position \d+.*/, '')})`;
}

async function readConfig() {
  return (await loadConfig()).config;
}

// --- Canaux IPC : la liste exacte de ce que l'interface peut demander ---

handle('folder:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  rootFolder = path.resolve(result.filePaths[0]);
  return rootFolder;
});

handle('folder:read', async (_event, dir) => {
  assertAllowed(dir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.name !== '.git')
    .map((e) => ({ name: e.name, path: path.join(dir, e.name), isDir: e.isDirectory() }))
    // Dossiers d'abord, puis ordre alphabétique.
    .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
});

handle('file:read', async (_event, file) => {
  assertAllowed(file);
  return fs.readFile(file, 'utf8');
});

handle('file:write', async (_event, file, content) => {
  assertAllowed(file);
  await fs.writeFile(file, content, 'utf8');
});

handle('config:get', async () => {
  const result = await loadConfig();
  if (result.error) log('ATTENTION', result.error);
  applyShortcuts(result.config.shortcuts);
  return result;
});
handle('config:path', async () => configPath());
handle('log:path', async () => logPath());

// L'interface envoie ici ses propres erreurs, pour qu'elles finissent aussi dans le journal.
ipcMain.on('log:write', (_event, level, message) => log(level, message));

// --- Serveurs favoris ---
// Rangés dans servers.json, à côté de la config. Aucun mot de passe n'y est stocké :
// ssh le demande dans le terminal, ou utilise ta clé SSH.

const serversPath = () => path.join(app.getPath('userData'), 'servers.json');

async function readServers() {
  try {
    return JSON.parse(await fs.readFile(serversPath(), 'utf8'));
  } catch {
    return [];
  }
}

// Un hôte ou un utilisateur qui commence par "-" serait lu par ssh comme une option : refusé.
function validateServer(s) {
  const clean = {
    id: String(s.id || Date.now()),
    name: String(s.name || '').trim(),
    host: String(s.host || '').trim(),
    user: String(s.user || '').trim(),
    port: Number(s.port) || 22,
    keyFile: String(s.keyFile || '').trim(),
  };
  if (!clean.name) throw new Error('Le nom est obligatoire');
  if (!clean.host) throw new Error("L'hôte est obligatoire");
  if (/^-|\s/.test(clean.host) || /^-|[\s@]/.test(clean.user)) throw new Error('Hôte ou utilisateur invalide');
  if (clean.port < 1 || clean.port > 65535) throw new Error('Port invalide');
  return clean;
}

handle('servers:list', async () => readServers());

handle('servers:save', async (_event, server) => {
  const clean = validateServer(server);
  const servers = await readServers();
  const i = servers.findIndex((s) => s.id === clean.id);
  if (i >= 0) servers[i] = clean; else servers.push(clean);
  await fs.writeFile(serversPath(), JSON.stringify(servers, null, 2), 'utf8');
  return servers;
});

handle('servers:delete', async (_event, id) => {
  const servers = (await readServers()).filter((s) => s.id !== id);
  await fs.writeFile(serversPath(), JSON.stringify(servers, null, 2), 'utf8');
  return servers;
});

handle('dialog:pickKey', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Choisir ta clé SSH privée',
    defaultPath: path.join(os.homedir(), '.ssh'),
    properties: ['openFile', 'showHiddenFiles'],
  });
  return result.canceled ? null : result.filePaths[0];
});

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

handle('term:create', async (event, profileName, cols, rows) => {
  const { terminalProfiles } = await readConfig();
  const profile = terminalProfiles.find((p) => p.name === profileName);
  if (!profile) throw new Error(`Profil de terminal inconnu : ${profileName}`);
  return spawnTerminal(event, resolveCommand(profile.command), profile.args || [], cols, rows);
});

// Connexion à un serveur favori : on construit la commande ssh à partir de sa fiche.
handle('term:connect', async (event, serverId, cols, rows) => {
  const server = (await readServers()).find((s) => s.id === serverId);
  if (!server) throw new Error('Serveur introuvable');
  const args = ['-p', String(server.port || 22)];
  if (server.keyFile) args.push('-i', server.keyFile);
  args.push(server.user ? `${server.user}@${server.host}` : server.host);
  return spawnTerminal(event, 'ssh', args, cols, rows);
});

function spawnTerminal(event, command, args, cols, rows) {
  const id = nextTerminalId++;
  let proc;
  try {
    proc = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: rootFolder || os.homedir(), // le terminal démarre dans le dossier ouvert
      env: process.env,
    });
  } catch (err) {
    // Commande introuvable, droits insuffisants… : message clair plutôt que l'erreur brute.
    throw new Error(`« ${command} » n'a pas pu être lancé (${err.message})`);
  }
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
}

ipcMain.on('term:write', (_event, id, data) => terminals.get(id)?.write(data));
ipcMain.on('term:resize', (_event, id, cols, rows) => terminals.get(id)?.resize(cols, rows));
ipcMain.on('term:kill', (_event, id) => terminals.get(id)?.kill());

// --- Raccourcis globaux ---
// Ctrl+J (terminal) et Ctrl+Alt+D (diviser) sont interceptés ici, AVANT que la page ne reçoive
// la touche. Ainsi ils marchent toujours, même quand l'éditeur ou le terminal ont le focus
// (sinon le terminal prendrait Ctrl+J pour un retour à la ligne).
// Les combinaisons se règlent dans "shortcuts" de la config, par exemple "Ctrl+Shift+T".

let shortcuts = [];

function applyShortcuts(map = {}) {
  shortcuts = Object.entries(map).map(([action, combo]) => {
    const parts = String(combo).toLowerCase().split('+').map((p) => p.trim());
    return {
      action,
      key: parts.pop(),
      ctrl: parts.includes('ctrl'),
      alt: parts.includes('alt'),
      shift: parts.includes('shift'),
    };
  });
}

function matchShortcut(input) {
  if (input.type !== 'keyDown') return null;
  const key = input.key.toLowerCase();
  return shortcuts.find((s) => s.key === key && s.ctrl === input.control && s.alt === input.alt && s.shift === input.shift);
}

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

  win.webContents.on('before-input-event', (event, input) => {
    const shortcut = matchShortcut(input);
    if (!shortcut) return;
    event.preventDefault();
    win.webContents.send('shortcut', shortcut.action);
  });

  // L'interface a planté (rare) : on le note et on propose de la recharger.
  win.webContents.on('render-process-gone', async (_event, details) => {
    await log('ERREUR', `Interface arrêtée : ${details.reason}`);
    const { response } = await dialog.showMessageBox(win, {
      type: 'error',
      message: "L'interface d'Atelier s'est arrêtée.",
      detail: `Raison : ${details.reason}. Le détail est dans ${logPath()}.`,
      buttons: ['Recharger', 'Fermer'],
    });
    if (response === 0) win.reload(); else win.close();
  });
}

app.whenReady().then(async () => {
  await ensureConfig();
  applyShortcuts((await readConfig()).shortcuts);
  log('INFO', `Démarrage d'Atelier ${app.getVersion()}`);
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
