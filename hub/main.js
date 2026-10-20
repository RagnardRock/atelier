// Processus principal d'Atelier, le hub de mes outils.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque et de lancer des programmes :
// - retrouver Rune, Skald… installés sur le PC et lire leur version (registre de Windows) ;
// - demander à GitHub la dernière version de chacun, télécharger et lancer leur installeur ;
// - lancer un outil ;
// - garder les notes et les réglages dans %APPDATA%\atelier-hub ;
// - mettre Atelier lui-même à jour.

const { app, BrowserWindow, ipcMain, Menu, net, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const OUTILS = require('./outils');

// Réglages, notes et journal dans %APPDATA%\atelier-hub, qu'Atelier soit lancé depuis le clone
// (npm start) ou installé avec Atelier-Setup.exe.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-hub'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range la fenêtre
// sous l'icône épinglée d'Atelier dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.atelier');

// --- Journal (atelier.log) ---
const logPath = () => path.join(app.getPath('userData'), 'atelier.log');
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

const sendToWindow = (channel, ...args) => BrowserWindow.getAllWindows()[0]?.webContents.send(channel, ...args);

// --- Fichiers JSON (réglages, notes) ---
// On écrit d'abord un fichier temporaire, puis on le renomme : si le PC s'éteint en plein milieu,
// l'ancien fichier reste intact au lieu d'être à moitié écrit.
async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(`${file}.tmp`, file);
}

// --- Réglages (config.json) ---
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CONFIG = {
  accentColor: '#5fd4a8',
  glass: true,
  windowBlur: false,
  checkToolUpdates: true, // au démarrage, regarder sur GitHub si Rune, Skald… ont une nouvelle version
};
const readConfig = async () => ({ ...DEFAULT_CONFIG, ...(await readJson(configPath(), {})) });

handle('config:read', async () => ({ config: await readConfig(), path: configPath() }));
handle('config:write', async (_event, changes) => {
  const config = { ...(await readConfig()), ...changes };
  await writeJson(configPath(), config);
  return config;
});
handle('app:version', async () => app.getVersion());

// --- Notes (notes.json) ---
// Toutes les notes dans un seul fichier, sur ton PC : [{ id, texte, epinglee, modifiee }].
const notesPath = () => path.join(app.getPath('userData'), 'notes.json');
handle('notes:read', async () => ({ notes: await readJson(notesPath(), []), path: notesPath() }));
handle('notes:write', async (_event, notes) => {
  if (!Array.isArray(notes)) throw new Error('Notes invalides');
  await writeJson(notesPath(), notes);
});
handle('notes:reveal', async () => shell.showItemInFolder(notesPath()));

// --- Outils : où ils sont installés ---
// Les installeurs de Rune et Skald (fabriqués par electron-builder) s'inscrivent dans le registre de
// Windows, à l'endroit que lit « Paramètres › Applications » :
//   HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<identifiant>
// avec DisplayName (« Rune »), DisplayVersion (« 0.11.0 ») et InstallLocation (le dossier choisi).
// On lit tout ce dossier du registre d'un coup avec la commande « reg query », puis on cherche
// chaque outil par son nom. Si le registre ne dit rien, on regarde l'emplacement par défaut
// (%LOCALAPPDATA%\Programs\<nom>).

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024, ...options }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error((stderr || err.message).trim()), { code: err.code }));
      else resolve(stdout);
    });
  });
}

async function readUninstallRegistry() {
  if (process.platform !== 'win32') return [];
  const out = await run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s']).catch(() => '');
  // Chaque programme est un bloc : une ligne « HKEY_CURRENT_USER\… » puis ses valeurs
  // (« nom    REG_SZ    valeur »).
  const entries = [];
  let current = null;
  for (const line of out.split(/\r?\n/)) {
    if (/^HKEY_/.test(line)) entries.push((current = {}));
    const m = current && line.match(/^\s+(\S+)\s+REG_\w+\s+(.*)$/);
    if (m) current[m[1]] = m[2].trim();
  }
  return entries;
}

// Version d'une app Electron installée, lue dans son package.json (si le registre ne la donne pas).
// Electron sait lire dans les archives app.asar comme dans un dossier.
async function versionInFolder(folder) {
  for (const file of [path.join(folder, 'resources', 'app.asar', 'package.json'), path.join(folder, 'resources', 'app', 'package.json')]) {
    const pkg = await readJson(file, null);
    if (pkg?.version) return pkg.version;
  }
  return null;
}

// Dossier où les installeurs mettent les outils par défaut.
// ATELIER_DOSSIER_OUTILS sert seulement aux tests, hors Windows.
const defaultToolsFolder = () => process.env.ATELIER_DOSSIER_OUTILS || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs');

async function findInstalled(tool, registry) {
  const entry = registry.find((e) => e.DisplayName === tool.nom);
  const candidates = [];
  if (entry?.InstallLocation) candidates.push(entry.InstallLocation.replace(/^"|"$/g, ''));
  if (entry?.DisplayIcon) candidates.push(path.dirname(entry.DisplayIcon.replace(/^"|"$/g, '').replace(/,\d+$/, '')));
  candidates.push(path.join(defaultToolsFolder(), tool.nom));
  for (const folder of candidates) {
    const exe = path.join(folder, tool.exe);
    if (!fsSync.existsSync(exe)) continue;
    const version = (entry && folder === candidates[0] && entry.DisplayVersion) || (await versionInFolder(folder)) || entry?.DisplayVersion || null;
    return { exe, folder, version };
  }
  return null;
}

// --- Outils : dernières versions publiées sur GitHub ---
// Toutes les versions de tous les outils sont des Releases du même dépôt. On les demande une fois,
// puis on garde pour chaque outil la plus récente dont l'étiquette commence par son préfixe.
const GITHUB_REPO = 'RagnardRock/atelier';
// ATELIER_GITHUB_API sert seulement aux tests (un faux GitHub sur le PC).
const GITHUB_API = process.env.ATELIER_GITHUB_API || `https://api.github.com/repos/${GITHUB_REPO}`;

// 1.10.0 > 1.9.3 : on compare nombre par nombre, pas comme du texte.
function newer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

let releasesCache = null; // { at, list } : on ne redemande pas à GitHub plus d'une fois par minute
async function githubReleases(force = false) {
  if (!force && releasesCache && Date.now() - releasesCache.at < 60_000) return releasesCache.list;
  const res = await net.fetch(`${GITHUB_API}/releases?per_page=100`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Atelier' } });
  if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
  const list = (await res.json()).filter((r) => !r.draft && !r.prerelease);
  releasesCache = { at: Date.now(), list };
  return list;
}

function latestRelease(releases, prefix) {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+\\.\\d+\\.\\d+$`);
  let best = null;
  for (const r of releases) {
    if (!pattern.test(r.tag_name)) continue;
    const version = r.tag_name.slice(prefix.length);
    if (!best || newer(version, best.version)) best = { version, tag: r.tag_name, notes: r.body || '', assets: r.assets || [] };
  }
  return best;
}

const notesToList = (notes) => notes.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);

// État de chaque outil pour l'interface : installé ou non, quelle version, une plus récente ?
// github: false → on ne lit que ce qui est installé, sans contacter GitHub (réglage décoché au démarrage).
handle('outils:etat', async (_event, { refresh = false, github = true } = {}) => {
  const registry = await readUninstallRegistry();
  let releases = null;
  let githubError = null;
  if (github || releasesCache) {
    try {
      releases = github ? await githubReleases(refresh) : releasesCache.list;
    } catch (err) {
      githubError = `Impossible de contacter GitHub : ${err.message.split('\n')[0]}`;
    }
  }
  const result = [];
  for (const tool of OUTILS) {
    const installed = await findInstalled(tool, registry);
    const latest = releases ? latestRelease(releases, tool.prefixe) : null;
    result.push({
      id: tool.id,
      nom: tool.nom,
      glyphe: tool.glyphe,
      description: tool.description,
      icone: tool.icone,
      installe: Boolean(installed),
      version: installed?.version || null,
      dossier: installed?.folder || null,
      derniere: latest?.version || null,
      nouveautes: latest ? notesToList(latest.notes) : [],
      miseAJour: Boolean(installed && latest && installed.version && newer(latest.version, installed.version)),
    });
  }
  return { outils: result, erreurGithub: githubError };
});

const toolById = (id) => {
  const tool = OUTILS.find((t) => t.id === id);
  if (!tool) throw new Error(`Outil inconnu : ${id}`);
  return tool;
};

// --- Outils : lancer ---
handle('outils:lancer', async (_event, id) => {
  const tool = toolById(id);
  const installed = await findInstalled(tool, await readUninstallRegistry());
  if (!installed) throw new Error(`${tool.nom} n'est pas installé`);
  // « detached » + unref : l'outil vit sa vie, fermer Atelier ne le ferme pas.
  const child = spawn(installed.exe, [], { cwd: installed.folder, detached: true, stdio: 'ignore' });
  child.on('error', (err) => reportError(`Lancement de ${tool.nom}`, err));
  child.unref();
  log('INFO', `Lancement de ${tool.nom} (${installed.exe})`);
});

handle('outils:ouvrirDossier', async (_event, id) => {
  const tool = toolById(id);
  const installed = await findInstalled(tool, await readUninstallRegistry());
  if (installed) shell.showItemInFolder(installed.exe);
});

// L'outil est-il ouvert ? (avant une mise à jour : l'installeur ne peut pas remplacer un programme
// en cours d'utilisation). « tasklist » liste les programmes ouverts sous Windows.
handle('outils:ouvert', async (_event, id) => {
  if (process.platform !== 'win32') return false;
  const tool = toolById(id);
  const out = await run('tasklist', ['/FI', `IMAGENAME eq ${tool.exe}`, '/NH', '/FO', 'CSV']).catch(() => '');
  return out.toLowerCase().includes(`"${tool.exe.toLowerCase()}"`);
});

// --- Outils : installer ou mettre à jour ---
// 1. On prend dans la dernière Release de l'outil son installeur (<nom>-Setup-<version>.exe) et
//    latest.yml, un petit fichier qui contient l'empreinte (sha512) de l'installeur.
// 2. On télécharge l'installeur dans le dossier temporaire de Windows, en envoyant l'avancement à
//    l'interface, puis on vérifie son empreinte : un fichier abîmé pendant le téléchargement est refusé.
// 3. On le lance :
//    - première installation : l'installeur s'ouvre normalement, tu choisis le dossier ;
//    - mise à jour : en silence (/S), il remplace l'ancienne version au même endroit.
// 4. Quand l'installeur a fini, l'interface relit l'état des outils.
const installing = new Set();

async function download(url, file, onProgress) {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'Atelier' } });
  if (!res.ok) throw new Error(`Téléchargement refusé par GitHub (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha512');
  const out = fsSync.createWriteStream(file);
  let received = 0;
  let lastPercent = -1;
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      const percent = total ? Math.floor((received / total) * 100) : 0;
      if (percent !== lastPercent) onProgress((lastPercent = percent));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  return hash.digest('base64');
}

handle('outils:installer', async (_event, id) => {
  const tool = toolById(id);
  if (installing.has(id)) throw new Error(`${tool.nom} est déjà en cours d'installation`);
  installing.add(id);
  const progress = (step, percent = null) => sendToWindow('outils:progression', { id, step, percent });
  try {
    const latest = latestRelease(await githubReleases(true), tool.prefixe);
    if (!latest) throw new Error(`Aucune version de ${tool.nom} n'est publiée sur GitHub`);
    const setupName = `${tool.nom}-Setup-${latest.version}.exe`;
    const setup = latest.assets.find((a) => a.name === setupName);
    if (!setup) throw new Error(`La Release ${latest.tag} ne contient pas ${setupName}`);
    const yml = latest.assets.find((a) => a.name === 'latest.yml');
    let expected = null;
    if (yml) {
      const res = await net.fetch(yml.browser_download_url, { headers: { 'User-Agent': 'Atelier' } });
      if (res.ok) expected = (await res.text()).match(/^sha512:\s*(\S+)/m)?.[1] || null;
    }

    const folder = path.join(app.getPath('temp'), 'atelier-installeurs');
    await fs.mkdir(folder, { recursive: true });
    const file = path.join(folder, setupName);
    log('INFO', `Téléchargement de ${setupName}`);
    progress('telechargement', 0);
    const actual = await download(setup.browser_download_url, file, (p) => progress('telechargement', p));
    if (expected && actual !== expected) {
      await fs.rm(file, { force: true });
      throw new Error(`L'installeur de ${tool.nom} téléchargé est abîmé (empreinte différente). Réessaie.`);
    }
    if (process.platform !== 'win32') await fs.chmod(file, 0o755); // hors Windows (tests) : le rendre exécutable

    const already = await findInstalled(tool, await readUninstallRegistry());
    progress('installation');
    log('INFO', `Lancement de ${setupName}${already ? ' en silence (mise à jour)' : ''}`);
    const code = await new Promise((resolve, reject) => {
      const child = spawn(file, already ? ['/S'] : [], { detached: false, stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', resolve);
    });
    await fs.rm(file, { force: true }).catch(() => {});
    // Code 0 : installé. Autre chose : annulé (fenêtre fermée) ou échec.
    if (code !== 0) throw new Error(`L'installation de ${tool.nom} a été annulée ou a échoué (code ${code})`);
    log('INFO', `${tool.nom} ${latest.version} installé`);
    return { version: latest.version };
  } finally {
    installing.delete(id);
    progress('fin');
  }
});

// --- Mise à jour d'Atelier lui-même ---
// Même principe que Skald :
// - Installé avec Atelier-Setup.exe (app.isPackaged) : on cherche la Release atelier-vX.Y.Z la plus
//   récente (pas « la dernière Release » du dépôt, qui est celle de Rune), puis electron-updater y
//   télécharge l'installeur décrit par latest.yml, ferme Atelier, l'installe en silence et le relance.
// - Lancé depuis le clone git (npm start) : git pull + npm install, confiés à hub/mettre-a-jour.bat,
//   lancé dans sa propre fenêtre APRÈS la fermeture d'Atelier.
const REPO = path.join(__dirname, '..');
const git = (args) => run('git', args, { cwd: REPO }).then((s) => s.trim());

let autoUpdater = null;
let pendingRelease = null;
function installerUpdater() {
  if (autoUpdater) return autoUpdater;
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = false; // on télécharge seulement quand tu cliques « Mettre à jour »
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = { info: (m) => log('INFO', `Mise à jour : ${m}`), warn: (m) => log('INFO', `Mise à jour : ${m}`), error: (m) => log('ERREUR', `Mise à jour : ${m}`), debug: () => {} };
  autoUpdater.on('download-progress', (p) => sendToWindow('update:progress', Math.round(p.percent)));
  return autoUpdater;
}

handle('update:check', async () => {
  if (app.isPackaged) {
    let release;
    try {
      release = latestRelease(await githubReleases(), 'atelier-v');
    } catch (err) {
      throw new Error(`Impossible de contacter GitHub : ${err.message.split('\n')[0]}`);
    }
    if (!release || !newer(release.version, app.getVersion())) return { mode: 'installer', version: app.getVersion(), changes: [] };
    pendingRelease = release;
    const changes = notesToList(release.notes);
    return { mode: 'installer', version: release.version, changes: changes.length ? changes : [`Version ${release.version}`] };
  }
  try {
    await git(['fetch', '--quiet']);
  } catch (err) {
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) throw new Error('git est introuvable : installe Git pour Windows pour pouvoir mettre Atelier à jour');
    throw new Error(`Impossible de contacter GitHub : ${err.message}`);
  }
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!upstream) throw new Error(`La branche « ${branch} » n'est reliée à aucune branche GitHub`);
  // Seulement ce qui touche Atelier (hub/).
  const changes = await git(['log', '--format=%s', 'HEAD..@{u}', '--', 'hub']);
  return { mode: 'git', branch, changes: changes ? changes.split('\n') : [] };
});

handle('update:install', async () => {
  log('INFO', 'Mise à jour d\'Atelier lancée depuis le bouton');
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

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

function createWindow(config) {
  const blur = wantsBlur(config);
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 820,
    minHeight: 520,
    backgroundColor: blur ? '#00000000' : '#101014',
    ...(blur ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'Atelier',
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
  // Un lien dans une note s'ouvre dans le navigateur, pas dans Atelier.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
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

// Une seule fenêtre Atelier : relancer Atelier remet simplement la fenêtre au premier plan.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    const config = await readConfig();
    log('INFO', `Démarrage d'Atelier ${app.getVersion()}`);
    Menu.setApplicationMenu(null);
    createWindow(config);
  });
  app.on('window-all-closed', () => app.quit());
}
