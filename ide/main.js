// Processus principal d'Electron.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque.
// L'interface (renderer/) ne lit et n'écrit des fichiers qu'en lui demandant via IPC.

const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { execFile, spawn } = require('node:child_process');
// node-pty lance un vrai terminal (ConPTY sous Windows) : couleurs, ssh, vim… tout marche.
const pty = require('node-pty');
const claude = require('./claude');
const search = require('./search');
const preview = require('./preview');
const gitPanel = require('./git');
const scaffold = require('./scaffold');
const vueLanguage = require('./vue');

const DEFAULT_CONFIG = path.join(__dirname, 'config.default.json');

// Les réglages restent dans %APPDATA%\atelier-ide, que Rune soit lancé depuis le clone (npm start)
// ou installé avec Rune-Setup.exe : sans cette ligne, Electron utiliserait %APPDATA%\Rune
// (le nom affiché de l'application) et tu repartirais de zéro.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-ide'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range ainsi la fenêtre
// sous l'icône épinglée de Rune dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.rune');

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

// Surveillance du dossier ouvert : quand un fichier change sur le disque (git pull, Claude,
// un autre programme…), l'interface est prévenue pour recharger les onglets concernés.
let rootWatcher = null;
let changedFiles = new Set();
let changedTimer = null;
function watchRoot(root) {
  rootWatcher?.close();
  rootWatcher = null;
  try {
    rootWatcher = fsSync.watch(root, { recursive: true }, (_type, file) => {
      if (!file || /(^|[\\/])(\.git|node_modules)([\\/]|$)/.test(file)) return;
      changedFiles.add(path.join(root, file));
      clearTimeout(changedTimer);
      changedTimer = setTimeout(() => {
        const files = [...changedFiles];
        changedFiles = new Set();
        for (const win of BrowserWindow.getAllWindows()) win.webContents.send('fs:changed', files);
      }, 150);
    });
    rootWatcher.on('error', () => {}); // dossier supprimé ou devenu inaccessible : on arrête simplement
  } catch {
    rootWatcher = null; // surveillance impossible : l'IDE marche quand même, sans rechargement auto
  }
}

// Les modifications de state.json passent l'une après l'autre : deux écritures en même temps
// (dossier récent + onglets de la session) ne doivent pas s'effacer mutuellement.
let stateQueue = Promise.resolve();
function updateState(change) {
  stateQueue = stateQueue.then(async () => {
    const state = await readState();
    change(state);
    await fs.writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8');
  }).catch((err) => log('ERREUR', `state.json : ${err.message}`));
  return stateQueue;
}

async function setRoot(folder) {
  rootFolder = path.resolve(folder);
  watchRoot(rootFolder);
  await updateState((state) => {
    state.recentFolders = [rootFolder, ...state.recentFolders.filter((f) => f !== rootFolder)].slice(0, MAX_RECENTS);
  });
  return rootFolder;
}

// Onglets ouverts de chaque dossier, pour les rouvrir la prochaine fois (20 dossiers au plus).
handle('session:get', async () => ((await readState()).sessions || {})[rootFolder] || null);
handle('session:save', async (_event, session) => {
  if (!rootFolder) return;
  const folder = rootFolder;
  await updateState((state) => {
    const others = Object.entries(state.sessions || {}).filter(([f]) => f !== folder).slice(0, 19);
    state.sessions = Object.fromEntries([[folder, session], ...others]);
  });
});

async function existingRecents() {
  const { recentFolders } = await readState();
  const checks = await Promise.all(recentFolders.map((f) => fs.stat(f).then((st) => st.isDirectory(), () => false)));
  return recentFolders.filter((_, i) => checks[i]);
}

// Le dossier des projets (Réglages › Démarrage), s'il existe encore. Sinon : rien (Windows propose le dernier utilisé).
async function projectsFolder() {
  const folder = (await readConfig()).projectsFolder;
  if (typeof folder !== 'string' || !folder.trim()) return undefined;
  return (await fs.stat(folder).then((s) => s.isDirectory(), () => false)) ? folder : undefined;
}

handle('folder:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, { defaultPath: await projectsFolder(), properties: ['openDirectory'] });
  if (result.canceled) return null;
  return setRoot(result.filePaths[0]);
});

handle('folder:recents', async () => existingRecents());

// Dossier passé en ligne de commande : « Rune.exe D:\Projets\mon-site » (c'est ainsi qu'Atelier ouvre
// un projet dans Rune). Il rejoint les récents, puis l'interface l'ouvre au démarrage à la place du
// dernier dossier. On ne le donne qu'une fois : Ctrl+R ne le rouvre pas.
let startupFolder = process.argv.slice(app.isPackaged ? 1 : 2)
  .filter((a) => !a.startsWith('-') && a !== '.')
  .map((a) => path.resolve(a))
  .find((a) => fsSync.existsSync(a) && fsSync.statSync(a).isDirectory()) || null;
handle('folder:startup', async () => {
  const folder = startupFolder;
  startupFolder = null;
  if (folder) await updateState((state) => { state.recentFolders = [folder, ...state.recentFolders.filter((f) => f !== folder)].slice(0, MAX_RECENTS); });
  return folder;
});

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

// Images et fichiers binaires (PSD, AI, PDF…) : l'éditeur ne les ouvre pas comme du texte.
// "binary" = le début du fichier contient un octet nul, ce qui n'arrive pas dans un fichier texte.
handle('file:info', async (_event, file) => {
  assertAllowed(file);
  const stat = await fs.stat(file);
  const handleFile = await fs.open(file, 'r');
  try {
    const { buffer, bytesRead } = await handleFile.read(Buffer.alloc(8192), 0, 8192, 0);
    return { size: stat.size, binary: buffer.subarray(0, bytesRead).includes(0) };
  } finally {
    await handleFile.close();
  }
});

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon' };
const MAX_IMAGE_SIZE = 30 * 1024 * 1024;
// L'image est envoyée à l'interface en "data URL" (base64) : la page de l'IDE n'a pas le droit de
// lire directement les fichiers du disque.
handle('file:dataUrl', async (_event, file) => {
  assertAllowed(file);
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
  if (!type) throw new Error("Ce n'est pas une image que l'aperçu sait afficher");
  const stat = await fs.stat(file);
  if (stat.size > MAX_IMAGE_SIZE) throw new Error(`Image trop lourde pour l'aperçu (${Math.round(stat.size / 1048576)} Mo)`);
  return `data:${type};base64,${(await fs.readFile(file)).toString('base64')}`;
});
// Ouvrir avec le programme associé (Photoshop pour un .psd…), ou montrer dans l'Explorateur.
handle('file:openDefault', async (_event, file) => {
  assertAllowed(file);
  const error = await shell.openPath(file);
  if (error) throw new Error(error);
});
handle('file:reveal', async (_event, file) => {
  assertAllowed(file);
  shell.showItemInFolder(file);
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

// --- Scripts npm (panneau Scripts) ---
// Les "scripts" des package.json du projet : celui de la racine, et ceux des sous-dossiers
// (sur deux niveaux, pour un projet qui a par exemple front/ et back/). node_modules est ignoré.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.nuxt', '.next', 'vendor']);

async function readPackage(dir) {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
    return { dir, name: typeof pkg.name === 'string' ? pkg.name : path.basename(dir), scripts: Object.fromEntries(Object.entries(scripts).filter(([, v]) => typeof v === 'string')) };
  } catch {
    return null; // pas de package.json, ou JSON cassé
  }
}

handle('scripts:list', async () => {
  if (!rootFolder) return [];
  const found = [];
  async function walk(dir, depth) {
    const pkg = await readPackage(dir);
    if (pkg && Object.keys(pkg.scripts).length) found.push({ ...pkg, rel: path.relative(rootFolder, dir) });
    if (depth === 2) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) await walk(path.join(dir, e.name), depth + 1);
    }
  }
  await walk(rootFolder, 0);
  return found;
});

// Lance « npm run <script> » comme processus d'un onglet de terminal : arrêter le script = fermer
// ce processus. Le nom doit exister dans le package.json et ne contenir aucun caractère spécial
// (sous Windows, la commande passe par cmd.exe, qui interpréterait & ou |).
handle('term:script', async (event, dir, script, cols, rows) => {
  assertAllowed(dir);
  const pkg = await readPackage(dir);
  if (!pkg || !Object.hasOwn(pkg.scripts, script)) throw new Error(`Script introuvable dans package.json : ${script}`);
  if (!/^[\w:.@/+-]+$/.test(script)) throw new Error(`Nom de script non pris en charge : ${script}`);
  return process.platform === 'win32'
    ? spawnTerminal(event, 'cmd.exe', ['/d', '/c', `npm run ${script}`], cols, rows, dir)
    : spawnTerminal(event, 'npm', ['run', script], cols, rows, dir);
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
// Rune tourne de deux façons, et se met à jour selon celle utilisée :
// - Installé avec Rune-Setup.exe (app.isPackaged) : chaque version publiée sur GitHub
//   (onglet « Releases » du dépôt) contient le nouvel installeur. electron-updater le télécharge,
//   ferme Rune, l'installe sans rien demander et relance Rune.
// - Lancé depuis le clone git (npm start) : mettre à jour = git pull + npm install. L'installation
//   est confiée à mettre-a-jour.bat, lancé dans sa propre fenêtre APRÈS la fermeture de l'IDE
//   (sous Windows, npm ne peut pas remplacer Electron ou node-pty tant que l'IDE les utilise).

const REPO = path.join(__dirname, '..');

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: REPO, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

// electron-updater n'est chargé que dans la version installée (il n'a rien à faire dans le clone).
let autoUpdater = null;
function installerUpdater() {
  if (autoUpdater) return autoUpdater;
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = false; // on télécharge seulement quand tu cliques « Mettre à jour »
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = { info: (m) => log('INFO', `Mise à jour : ${m}`), warn: (m) => log('INFO', `Mise à jour : ${m}`), error: (m) => log('ERREUR', `Mise à jour : ${m}`), debug: () => {} };
  autoUpdater.on('download-progress', (p) => mainWindow()?.webContents.send('update:progress', Math.round(p.percent)));
  return autoUpdater;
}

const mainWindow = () => BrowserWindow.getAllWindows()[0];

// Les notes d'une version GitHub arrivent en HTML : on garde une ligne par élément de liste.
function releaseLines(notes) {
  const text = Array.isArray(notes) ? notes.map((n) => n.note || '').join('\n') : String(notes || '');
  const items = [...text.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  const lines = items.length ? items : text.split(/<br\s*\/?>|\n/);
  return lines
    .map((l) => l.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
}

handle('update:check', async () => {
  if (app.isPackaged) {
    let result;
    try {
      result = await installerUpdater().checkForUpdates();
    } catch (err) {
      throw new Error(`Impossible de contacter GitHub : ${err.message.split('\n')[0]}`);
    }
    if (!result?.isUpdateAvailable) return { mode: 'installer', version: app.getVersion(), changes: [] };
    const { version, releaseNotes } = result.updateInfo;
    const lines = releaseLines(releaseNotes);
    return { mode: 'installer', version, changes: lines.length ? lines : [`Version ${version}`] };
  }
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
  return { mode: 'git', branch, changes: log ? log.split('\n') : [] };
});

handle('update:install', async () => {
  log('INFO', 'Mise à jour lancée depuis le bouton');
  if (app.isPackaged) {
    const updater = installerUpdater();
    await updater.downloadUpdate();
    // Installation silencieuse (pas de fenêtre d'installeur), puis Rune se relance tout seul.
    setTimeout(() => updater.quitAndInstall(true, true), 300);
    return;
  }
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
preview.register({ handle, getRoot: () => rootFolder, openExternal: (url) => shell.openExternal(url) });
gitPanel.register({ handle, getRoot: () => rootFolder, assertAllowed });
// Intelligence Vue (Volar) : tsserver + vue-language-server, lancés au premier fichier .vue ouvert.
const vueServers = vueLanguage.register({ handle, getRoot: () => rootFolder, isAllowed, log, readConfig });
// Nouveau projet : par défaut, à côté du dossier ouvert, sinon dans Documents.
scaffold.register({ handle, setRoot, readState, updateState, projectsFolder, defaultParent: () => (rootFolder ? path.dirname(rootFolder) : app.getPath('documents')) });
// Lien cliqué dans un terminal : seulement des adresses web, ouvertes dans ton navigateur habituel.
handle('link:open', async (_event, url) => {
  if (!/^https?:\/\//i.test(String(url))) throw new Error(`Lien refusé : ${url}`);
  await shell.openExternal(String(url));
});
// Choisir le dossier où créer un nouveau projet (sans l'ouvrir).
handle('dialog:pickFolder', async (event, defaultPath, title) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, { title: typeof title === 'string' ? title : 'Où créer le projet ?', defaultPath: defaultPath || undefined, properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

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
    title: 'Rune',
    // L'icône de la fenêtre quand Rune est lancé avec npm start (la version installée prend celle du .exe).
    ...(fsSync.existsSync(WINDOW_ICON) ? { icon: WINDOW_ICON } : {}),
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
      message: "L'interface de Rune s'est arrêtée.",
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
  log('INFO', `Démarrage de Rune ${app.getVersion()}`);
  // Pas de menu natif : tout passe par l'interface et les raccourcis.
  Menu.setApplicationMenu(null);
  createWindow(config);
});

app.on('window-all-closed', () => {
  // On ne laisse aucun PowerShell ou ssh tourner en fond après la fermeture.
  for (const proc of terminals.values()) proc.kill();
  claude.stop();
  preview.stop();
  vueServers.stop();
  app.quit();
});
