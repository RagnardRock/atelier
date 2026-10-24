// Processus principal de Reikna, le tableur de l'Atelier.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque.
// Tout le travail sur les classeurs (lire un xlsx, calculer les formules, dessiner la grille) se fait
// dans l'interface (renderer/). Ici, on ne fait que lire et écrire les fichiers choisis par toi,
// garder les réglages et les fichiers récents, et demander avant de fermer un classeur non enregistré.

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

// Réglages et journal dans %APPDATA%\atelier-tableur, que Reikna soit lancé depuis le clone
// (npm start) ou installé avec Reikna-Setup.exe.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-tableur'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range la fenêtre
// sous l'icône épinglée de Reikna dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.reikna');

// --- Journal (reikna.log) ---
const logPath = () => path.join(app.getPath('userData'), 'reikna.log');
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
  claudeCommandes: false, // Claude peut-il lancer des commandes (PowerShell, Python…) ?
  claudeSansDemander: {}, // familles d'actions que Claude fait sans demander (voir ../commun/claude.js)
  accentColor: '#34d399',
  glass: true,
  windowBlur: false,
  langueFormules: 'fr',   // 'fr' : =SOMME(A1;B1) comme dans un Excel français ; 'en' : =SUM(A1,B1)
  csvSeparateur: ';',     // ce qu'écrit « Enregistrer en CSV » (Excel français attend « ; »)
  csvDecimale: ',',       // 12,5 ou 12.5 dans les CSV enregistrés
  quadrillage: true,
  zoom: 100,
  fichiersRecents: [],
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
// lancées en même temps ne doivent pas s'écraser l'une l'autre.
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
  '- Le classeur ouvert vit dans la fenêtre de Reikna : lis-le et modifie-le avec ses actions (infos, lire_plage,',
  '  ecrire, mettre_en_forme, trier…), plutôt que de lire ou réécrire le fichier .xlsx toi-même.',
  '- Les formules peuvent s\'écrire en anglais (=SUM(A1:A3, 2.5)) ou en français (=SOMME(A1:A3; 2,5)) :',
  '  Reikna les comprend toutes les deux et les montre à Ragna dans sa langue.',
].join('\n');
claude.register({ handle, log, dataDir: app.getPath('userData'), readConfig, writeConfig: (changes) => modifierConfig((config) => Object.assign(config, changes)), outil: { nom: 'Reikna', role: 'le tableur de Ragna (comme Excel : xlsx, xls, ods, csv)', consignes: CLAUDE_CONSIGNES } });

handle('config:read', async () => ({ config: await readConfig(), path: configPath() }));
handle('config:write', async (_event, changes) => modifierConfig((config) => Object.assign(config, changes)));
handle('app:version', async () => app.getVersion());

// --- Fichiers ---
// Reikna lit n'importe quel classeur que tu lui donnes (fenêtre Ouvrir, glisser-déposer, Atelier, ligne
// de commande), mais n'ÉCRIT que dans un fichier que tu as ouvert ou choisi avec « Enregistrer sous ».
const EXTENSIONS = ['xlsx', 'xlsm', 'xls', 'ods', 'csv', 'tsv', 'txt'];
const estClasseur = (f) => EXTENSIONS.includes(path.extname(f).slice(1).toLowerCase());
const fichiersAutorises = new Set();
const FILTRES = [
  { name: 'Classeurs (xlsx, xls, ods, csv)', extensions: EXTENSIONS },
  { name: 'Tous les fichiers', extensions: ['*'] },
];

async function ajouterRecent(full) {
  await modifierConfig((config) => {
    config.fichiersRecents = [full, ...config.fichiersRecents.filter((p) => p !== full)].slice(0, 15);
    config.dernierDossier = path.dirname(full);
  });
}

handle('fichier:choisir', async (event, dossier) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, {
    title: 'Ouvrir un classeur',
    defaultPath: dossier && fsSync.existsSync(dossier) ? dossier : config.dernierDossier || app.getPath('documents'),
    properties: ['openFile'],
    filters: FILTRES,
  });
  return result.canceled ? null : result.filePaths[0];
});

handle('fichier:lire', async (_event, chemin) => {
  const full = path.resolve(String(chemin));
  const st = await fs.stat(full).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`Fichier introuvable : ${full}`);
  if (!estClasseur(full)) throw new Error(`Reikna ne sait pas ouvrir ce type de fichier : ${path.basename(full)}`);
  if (st.size > 200 * 1024 * 1024) throw new Error(`Fichier trop gros (${Math.round(st.size / 1024 / 1024)} Mo) : la limite est de 200 Mo`);
  fichiersAutorises.add(full);
  await ajouterRecent(full);
  log('INFO', `Ouvert : ${full}`);
  return { chemin: full, nom: path.basename(full), modifie: st.mtimeMs, bytes: await fs.readFile(full) };
});

handle('fichier:enregistrerSous', async (event, nomPropose, extension) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const noms = { xlsx: 'Classeur Excel', ods: 'Classeur OpenDocument (LibreOffice)', csv: 'CSV (valeurs séparées)', xls: 'Classeur Excel 97-2003', tsv: 'Texte séparé par des tabulations' };
  const result = await dialog.showSaveDialog(win, {
    title: 'Enregistrer le classeur',
    defaultPath: path.join(config.dernierDossier || app.getPath('documents'), nomPropose || `Classeur.${extension}`),
    filters: [{ name: noms[extension] || extension, extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return null;
  const full = path.resolve(result.filePath);
  fichiersAutorises.add(full);
  return full;
});

// Écrire : d'abord un fichier temporaire, puis on le renomme. Si quelque chose plante en plein
// milieu (ou si Excel a le fichier ouvert), l'ancien fichier reste intact.
handle('fichier:ecrire', async (_event, chemin, bytes) => {
  const full = path.resolve(String(chemin));
  if (!fichiersAutorises.has(full)) throw new Error(`Choisis d'abord où enregistrer (Enregistrer sous) : ${full}`);
  const temp = `${full}.reikna-tmp`;
  await fs.writeFile(temp, Buffer.from(bytes));
  try {
    await fs.rename(temp, full);
  } catch (err) {
    await fs.rm(temp, { force: true });
    if (err.code === 'EBUSY' || err.code === 'EPERM') throw new Error(`${path.basename(full)} est ouvert dans un autre programme (Excel ?) : ferme-le puis réessaie`);
    throw err;
  }
  await ajouterRecent(full);
  log('INFO', `Enregistré : ${full}`);
  const st = await fs.stat(full);
  return { chemin: full, nom: path.basename(full), modifie: st.mtimeMs };
});

handle('fichier:recents', async () => (await readConfig()).fichiersRecents.filter((p) => fsSync.existsSync(p)));
handle('fichier:oublier', async (_event, chemin) => modifierConfig((c) => { c.fichiersRecents = c.fichiersRecents.filter((p) => p !== chemin); }));
handle('fichier:montrer', async (_event, chemin) => shell.showItemInFolder(path.resolve(String(chemin))));

// Les classeurs d'un dossier (quand Atelier ouvre un projet dans Reikna) : ce dossier et ses
// sous-dossiers jusqu'à deux niveaux, sans node_modules ni dossiers cachés.
handle('dossier:classeurs', async (_event, dossier) => {
  const racine = path.resolve(String(dossier));
  const trouves = [];
  async function parcourir(d, profondeur) {
    const entrees = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entrees) {
      if (trouves.length >= 200) return;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory() && profondeur < 2) await parcourir(full, profondeur + 1);
      else if (e.isFile() && estClasseur(full) && !e.name.startsWith('~$')) trouves.push(full);
    }
  }
  await parcourir(racine, 0);
  return trouves;
});

// Presse-papiers : texte (des colonnes séparées par des tabulations, ce qu'Excel comprend) et HTML
// (un tableau, pour coller dans Word ou un mail avec la mise en forme).
handle('clipboard:write', async (_event, { text, html }) => clipboard.write({ text: String(text ?? ''), ...(html ? { html } : {}) }));
handle('clipboard:read', async () => ({ text: clipboard.readText(), html: clipboard.readHTML() }));

// --- Mise à jour ---
// Comme Brokk, Reikna tourne de deux façons et se met à jour selon celle utilisée :
// - Installé avec Reikna-Setup.exe (app.isPackaged) : on cherche sur GitHub la Release reikna-vX.Y.Z
//   la plus récente (pas « la dernière Release » du dépôt : celle-là est celle de Rune). electron-updater
//   y télécharge l'installeur, ferme Reikna, l'installe sans rien demander et le relance.
// - Lancé depuis le clone git (npm start) : git pull + npm install, confiés à tableur/mettre-a-jour.bat,
//   lancé dans sa propre fenêtre APRÈS la fermeture de Reikna.

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

let github = null;
async function latestRelease() {
  github ??= creerGithub({ net, dossier: app.getPath('userData'), agent: 'Reikna' });
  const releases = (await github.releases()).filter((r) => /^reikna-v\d+\.\d+\.\d+$/.test(r.tag_name));
  let best = null;
  for (const r of releases) {
    const version = r.tag_name.slice('reikna-v'.length);
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
      release = await latestRelease();
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
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) throw new Error('git est introuvable : installe Git pour Windows pour pouvoir mettre Reikna à jour');
    throw new Error(`Impossible de contacter GitHub : ${err.message}`);
  }
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!upstream) throw new Error(`La branche « ${branch} » n'est reliée à aucune branche GitHub`);
  // Seulement ce qui touche Reikna (les nouveautés des autres outils ne comptent pas ici).
  const changes = await git(['log', '--format=%s', 'HEAD..@{u}', '--', 'tableur']);
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
    quitter = true;
    setTimeout(() => updater.quitAndInstall(true, true), 300);
    return;
  }
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'start', '', path.join(__dirname, 'mettre-a-jour.bat')], { cwd: REPO, detached: true, stdio: 'ignore' })
    : spawn('sh', [path.join(__dirname, 'mettre-a-jour.sh')], { cwd: REPO, detached: true, stdio: 'ignore' });
  child.unref();
  quitter = true;
  setTimeout(() => app.quit(), 300);
});

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
handle('window:titre', async (event, titre) => BrowserWindow.fromWebContents(event.sender)?.setTitle(String(titre)));

// Fermer avec un classeur non enregistré : l'interface pose la question (Enregistrer / Ne pas
// enregistrer / Annuler), puis rappelle « fenetre:fermer » si tu as choisi de fermer.
let nonEnregistre = false;
let quitter = false;
handle('fenetre:nonEnregistre', async (_event, valeur) => { nonEnregistre = Boolean(valeur); });
handle('fenetre:fermer', async (event) => {
  quitter = true;
  BrowserWindow.fromWebContents(event.sender)?.close();
});

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Arguments de la ligne de commande : un classeur (« Reikna.exe D:\Compta\budget.xlsx », ou un fichier
// glissé sur l'icône), ou un dossier (c'est ainsi qu'Atelier ouvre un projet : Reikna montre alors
// les classeurs de ce dossier). Lancé depuis le clone, un des arguments est le dossier de Reikna : on le saute.
function argsDe(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && a !== '.').map((a) => path.resolve(a))
    .filter((a) => a !== app.getAppPath() && fsSync.existsSync(a));
  const fichier = args.find((a) => fsSync.statSync(a).isFile() && estClasseur(a)) || null;
  const dossier = args.find((a) => fsSync.statSync(a).isDirectory()) || null;
  return { fichier, dossier };
}

let demarrage = argsDe(process.argv);
claude.setProjet(demarrage.dossier || (demarrage.fichier && path.dirname(demarrage.fichier)));
handle('startup', async () => {
  const out = demarrage;
  demarrage = { fichier: null, dossier: null };
  return out;
});

function createWindow(config) {
  const blur = wantsBlur(config);
  const win = new BrowserWindow({
    width: 1600,
    height: 940,
    minWidth: 900,
    minHeight: 520,
    backgroundColor: blur ? '#00000000' : '#101014',
    ...(blur ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'Reikna',
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
  // Un lien hypertexte d'une cellule (Ctrl+clic) s'ouvre dans le navigateur, jamais dans Reikna.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (event, input) => {
    // F12 = outils de développement (comme dans Rune et Skald). Pas de Ctrl+R ici : il recharge la
    // page et ferait perdre le classeur ; dans un tableur, on s'attend plutôt à « recopier à droite ».
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });
  win.on('close', (event) => {
    if (quitter || !nonEnregistre) return;
    event.preventDefault();
    win.webContents.send('fenetre:fermer?');
  });
  return win;
}

// Une seule fenêtre Reikna : ouvrir un autre classeur (depuis l'Explorateur ou Atelier) passe par elle.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const { fichier, dossier } = argsDe(argv);
    if (dossier || fichier) claude.setProjet(dossier || path.dirname(fichier));
    if (fichier || dossier) win.webContents.send('externe', { fichier, dossier });
  });

  app.whenReady().then(async () => {
    const config = await readConfig();
    log('INFO', `Démarrage de Reikna ${app.getVersion()}`);
    Menu.setApplicationMenu(null);
    createWindow(config);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => claude.stop());
}
