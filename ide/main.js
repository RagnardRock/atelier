// Processus principal d'Electron.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque.
// L'interface (renderer/) ne lit et n'écrit des fichiers qu'en lui demandant via IPC.

const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { execFile, spawn } = require('node:child_process');
// node-pty lance un vrai terminal (ConPTY sous Windows) : couleurs, ssh, vim… tout marche.
const pty = require('node-pty');
const claude = require('./claude');
const search = require('./search');

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

// --- Dossiers récents ---
// Rangés dans state.json (à côté de la config). Ils servent à l'écran d'accueil et à rouvrir
// le dernier dossier au démarrage. L'interface ne peut ouvrir que des dossiers de cette liste
// ou choisis par toi dans la boîte de dialogue : elle ne peut pas inventer un chemin.

const statePath = () => path.join(app.getPath('userData'), 'state.json');
const MAX_RECENTS = 8;

async function readState() {
  try {
    return { recentFolders: [], ...JSON.parse(await fs.readFile(statePath(), 'utf8')) };
  } catch {
    return { recentFolders: [] };
  }
}

async function setRoot(folder) {
  rootFolder = path.resolve(folder);
  const state = await readState();
  state.recentFolders = [rootFolder, ...state.recentFolders.filter((f) => f !== rootFolder)].slice(0, MAX_RECENTS);
  await fs.writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8');
  return rootFolder;
}

async function existingRecents() {
  const { recentFolders } = await readState();
  const checks = await Promise.all(recentFolders.map((f) => fs.stat(f).then((st) => st.isDirectory(), () => false)));
  return recentFolders.filter((_, i) => checks[i]);
}

handle('folder:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  return setRoot(result.filePaths[0]);
});

handle('folder:recents', async () => existingRecents());

handle('folder:openRecent', async (_event, folder) => {
  if (!(await existingRecents()).includes(folder)) throw new Error(`Ce dossier n'existe plus : ${folder}`);
  return setRoot(folder);
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

// Création de fichiers et de dossiers. Un nom peut contenir des sous-dossiers
// ("css/style.css") : ils sont créés au passage. On refuse d'écraser ce qui existe déjà.
const FORBIDDEN_CHARS = /[<>:"|?*\x00-\x1f]/; // caractères interdits dans un nom sous Windows

function checkNewPath(target) {
  assertAllowed(target);
  const name = path.basename(target);
  if (!name || FORBIDDEN_CHARS.test(path.relative(rootFolder, target))) {
    throw new Error(`Nom invalide : « ${name} » (caractères interdits : < > : " | ? *)`);
  }
}

handle('file:create', async (_event, file) => {
  checkNewPath(file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(file, '', { flag: 'wx' }); // "wx" = échoue si le fichier existe déjà
  } catch (err) {
    if (err.code === 'EEXIST') throw new Error(`« ${path.basename(file)} » existe déjà`);
    throw err;
  }
});

handle('folder:create', async (_event, dir) => {
  checkNewPath(dir);
  try {
    await fs.mkdir(dir, { recursive: false });
  } catch (err) {
    if (err.code === 'EEXIST') throw new Error(`« ${path.basename(dir)} » existe déjà`);
    if (err.code === 'ENOENT') return fs.mkdir(dir, { recursive: true }); // sous-dossiers à créer
    throw err;
  }
});

// Renommer ou déplacer (c'est la même opération pour le disque). On refuse d'écraser ce qui
// existe, de toucher au dossier ouvert lui-même et de ranger un dossier dans lui-même.
const isInside = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

handle('path:rename', async (_event, from, to) => {
  assertAllowed(from);
  checkNewPath(to);
  if (path.resolve(from) === path.resolve(rootFolder)) throw new Error('Impossible de renommer le dossier ouvert lui-même');
  if (isInside(from, to)) throw new Error('Impossible de ranger un dossier dans lui-même');
  // Sous Windows, "page.html" et "Page.html" sont le même fichier : changer seulement les
  // majuscules est permis, alors que le nouveau nom "existe" déjà.
  const sameFile = from.toLowerCase() === to.toLowerCase();
  if (!sameFile && await fs.access(to).then(() => true, () => false)) {
    throw new Error(`« ${path.basename(to)} » existe déjà à cet endroit`);
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
});

// Supprimer = mettre à la corbeille de Windows : on peut toujours récupérer le fichier.
handle('path:trash', async (_event, target) => {
  assertAllowed(target);
  if (path.resolve(target) === path.resolve(rootFolder)) throw new Error('Impossible de supprimer le dossier ouvert lui-même');
  await shell.trashItem(target);
});

handle('path:join', async (_event, ...parts) => path.join(...parts));

handle('config:get', async () => {
  const result = await loadConfig();
  if (result.error) log('ATTENTION', result.error);
  applyShortcuts(result.config.shortcuts);
  return result;
});
handle('config:path', async () => configPath());

// Fenêtre de réglages : elle envoie seulement les clés modifiées, qu'on fusionne dans ton
// config.json (les autres clés, et celles que l'interface ne connaît pas, sont gardées).
// Seules les clés de config.default.json sont acceptées.
handle('config:save', async (_event, changes) => {
  const defaults = JSON.parse(await fs.readFile(DEFAULT_CONFIG, 'utf8'));
  let user = {};
  const text = await fs.readFile(configPath(), 'utf8').catch(() => '{}');
  try {
    user = JSON.parse(text);
  } catch (err) {
    throw new Error(`config.json contient une erreur (${describeJsonError(text, err)}). Corrige-la d'abord dans le fichier, sinon tes réglages seraient écrasés.`);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (!(key in defaults)) throw new Error(`Réglage inconnu : ${key}`);
    user[key] = value;
  }
  await fs.writeFile(configPath(), `${JSON.stringify(user, null, 2)}\n`, 'utf8');
  const result = await loadConfig();
  applyShortcuts(result.config.shortcuts);
  return result;
});

// Pendant qu'on enregistre un nouveau raccourci dans les réglages, main.js ne doit pas
// intercepter les touches (sinon Ctrl+J ouvrirait le terminal au lieu d'être enregistré).
let shortcutsPaused = false;
handle('shortcuts:pause', async (_event, paused) => { shortcutsPaused = Boolean(paused); });
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

handle('term:create', async (event, profileName, cols, rows, cwd) => {
  const { terminalProfiles } = await readConfig();
  const profile = terminalProfiles.find((p) => p.name === profileName);
  if (!profile) throw new Error(`Profil de terminal inconnu : ${profileName}`);
  return spawnTerminal(event, resolveCommand(profile.command), profile.args || [], cols, rows, cwd);
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

// Dossier de départ d'un terminal : celui demandé par l'interface (le dossier sélectionné dans
// l'arborescence) s'il est dans le projet ouvert, sinon la racine du projet, sinon ton dossier perso.
function terminalCwd(requested) {
  if (requested && isAllowed(requested)) return path.resolve(requested);
  return rootFolder || os.homedir();
}

function spawnTerminal(event, command, args, cols, rows, cwd) {
  const id = nextTerminalId++;
  let proc;
  try {
    proc = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: terminalCwd(cwd),
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

// --- Mise à jour ---
// L'IDE vit dans un clone git du dépôt atelier : mettre à jour = git pull + npm install.
// main.js vérifie s'il y a des nouveautés ; l'installation est confiée à mettre-a-jour.bat,
// lancé dans sa propre fenêtre APRÈS la fermeture de l'IDE (sous Windows, npm ne peut pas
// remplacer Electron ou node-pty tant que l'IDE les utilise).

const REPO = path.join(__dirname, '..');

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: REPO, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

handle('update:check', async () => {
  try {
    await git(['fetch', '--quiet']);
  } catch (err) {
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) throw new Error("git est introuvable : installe Git pour Windows pour pouvoir mettre l'IDE à jour");
    throw new Error(`Impossible de contacter GitHub : ${err.message}`);
  }
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!upstream) throw new Error(`La branche « ${branch} » n'est reliée à aucune branche GitHub`);
  const log = await git(['log', '--format=%s', 'HEAD..@{u}']);
  return { branch, changes: log ? log.split('\n') : [] };
});

handle('update:install', async () => {
  log('INFO', 'Mise à jour lancée depuis le bouton');
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'start', '', path.join(REPO, 'mettre-a-jour.bat')], { cwd: REPO, detached: true, stdio: 'ignore' })
    : spawn('sh', [path.join(REPO, 'mettre-a-jour.sh')], { cwd: REPO, detached: true, stdio: 'ignore' });
  child.unref();
  // Le script attend 2 secondes que l'IDE soit fermé avant de toucher aux fichiers.
  setTimeout(() => app.quit(), 300);
});

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

// Couleurs de la barre de titre (boutons Windows réduire / agrandir / fermer), selon le thème.
const TITLE_BAR = {
  dark: { color: '#181818', symbolColor: '#cccccc', height: 40 },
  light: { color: '#f3f3f3', symbolColor: '#333333', height: 40 },
};

// Flou de Windows 11 ("acrylic") : le bureau se voit, flouté, à travers la fenêtre.
// Il n'existe qu'à partir de Windows 11 22H2 (build 22621).
function blurSupported() {
  if (process.platform !== 'win32') return false;
  const build = Number(os.release().split('.')[2]);
  return build >= 22621;
}

// Le flou demande une fenêtre "translucide", et Electron ne choisit ce type de fenêtre qu'à sa
// création : l'activer ensuite ne fait rien. On le décide donc au démarrage d'après la config,
// et si tu l'actives en cours de route, l'interface propose de redémarrer.
const wantsBlur = (c) => Boolean(c.glass && c.windowBlur && c.theme === 'vs-dark' && blurSupported());

// L'interface indique son thème et si le verre dépoli est activé, avec ou sans flou Windows.
// Renvoie { blur: le flou est actif, needsRestart: il faut redémarrer pour l'activer }.
handle('window:theme', async (event, { theme, glass, blur }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const wanted = Boolean(glass && blur && theme !== 'light' && blurSupported());
  const useBlur = wanted && win.blurCapable;
  if (win.blurCapable) {
    win.setBackgroundMaterial(useBlur ? 'acrylic' : 'none');
    win.setBackgroundColor(useBlur ? '#00000000' : '#101014');
  }
  if (process.platform !== 'darwin') {
    let colors = TITLE_BAR[theme === 'light' ? 'light' : 'dark'];
    if (glass && theme !== 'light') colors = { ...colors, color: useBlur ? '#00000000' : '#101014' };
    win.setTitleBarOverlay(colors);
  }
  return { blur: useBlur, needsRestart: wanted && !win.blurCapable };
});

// Redémarrer l'IDE (après avoir activé le flou Windows 11).
handle('app:relaunch', async () => {
  app.relaunch();
  app.quit();
});
handle('window:blurSupported', async () => blurSupported());

// Chat avec Claude (voir claude.js).
claude.register({ handle, getRoot: () => rootFolder, readConfig, log, dataDir: app.getPath('userData') });
search.register({ handle, getRoot: () => rootFolder });

function createWindow(config) {
  const blur = wantsBlur(config);
  log('INFO', `Flou Windows 11 : ${blur ? 'activé' : 'désactivé'} (Windows ${os.release()}, pris en charge : ${blurSupported() ? 'oui' : 'non'})`);
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 700,
    minHeight: 400,
    backgroundColor: blur ? '#00000000' : '#101014',
    ...(blur ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'Atelier',
    // Pas de barre de titre système : la barre du haut de l'interface la remplace,
    // et Windows y dessine ses propres boutons réduire / agrandir / fermer.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 13 } } : { titleBarOverlay: blur ? { ...TITLE_BAR.dark, color: '#00000000' } : TITLE_BAR.dark }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // l'interface n'a pas accès à Node directement
      nodeIntegration: false,
    },
  });
  win.blurCapable = blur; // fenêtre créée translucide : le flou peut être activé ou coupé
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // L'interface ne doit jamais être remplacée par une autre page (lien cliqué, fichier lâché
  // sur la fenêtre…) : seul le rechargement de l'IDE lui-même est permis.
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('before-input-event', (event, input) => {
    // Outils intégrés (il n'y a plus de menu) : F12 = outils de dev, Ctrl+R = recharger l'interface.
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      return win.webContents.toggleDevTools();
    }
    if (input.type === 'keyDown' && input.control && !input.alt && !input.shift && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      return win.webContents.reload();
    }
    if (shortcutsPaused) return;
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
  const config = await readConfig();
  applyShortcuts(config.shortcuts);
  log('INFO', `Démarrage d'Atelier ${app.getVersion()}`);
  // Pas de menu natif : tout passe par l'interface et les raccourcis.
  Menu.setApplicationMenu(null);
  createWindow(config);
});

app.on('window-all-closed', () => {
  // On ne laisse aucun PowerShell ou ssh tourner en fond après la fermeture.
  for (const proc of terminals.values()) proc.kill();
  claude.stop();
  app.quit();
});
