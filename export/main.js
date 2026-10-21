// Processus principal de Brokk.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque.
// Le travail sur les images (lire un PSD, redimensionner, encoder en WebP…) se fait dans l'interface
// (renderer/), avec des <canvas>. Ici, on ne fait que lire les sources, écrire les fichiers produits
// dans le projet, surveiller les sources et garder les réglages.

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

// Réglages et journal dans %APPDATA%\atelier-export, que Brokk soit lancé depuis le clone
// (npm start) ou installé avec Brokk-Setup.exe.
app.setPath('userData', path.join(app.getPath('appData'), 'atelier-export'));
// Même identifiant que l'installeur (package.json › build.appId) : Windows range la fenêtre
// sous l'icône épinglée de Brokk dans la barre des tâches.
if (process.platform === 'win32') app.setAppUserModelId('fr.ragna.brokk');

// --- Journal (brokk.log) ---
const logPath = () => path.join(app.getPath('userData'), 'brokk.log');
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
// projets : pour chaque dossier de projet, la liste de ses assets (source, recette, réglages).
// Elle est gardée ici plutôt que dans le projet : Brokk ne laisse aucun fichier à lui dans tes projets.
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CONFIG = {
  claudeCommand: 'claude', // panneau Claude (../commun/claude.js)
  claudeModel: '',
  claudeCommandes: false, // Claude peut-il lancer des commandes (PowerShell, Python…) ?
  accentColor: '#ff7a3d',
  glass: true,
  windowBlur: false,
  webpQuality: 85,
  jpegQuality: 85,
  surveiller: false,
  projetsRecents: [],
  dernierDossierImages: '',
  projets: {},
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

// --- Panneau Claude (le même que dans Skald, Tafl : voir ../commun/LISEZMOI.md) ---
const claude = require('./commun/claude');
const { creerGithub, LimiteGithub } = require('./commun/github');
// Ce que Claude doit savoir en plus dans cet outil (voir ../commun/claude.js, ecrireConsignes).
const CLAUDE_CONSIGNES = [
  '- Les images à exporter et leurs réglages vivent dans la fenêtre de Brokk : lis-les et change-les avec ses',
  '  actions (ajouter_asset, regler_asset, retirer_asset, exporter…), plutôt que de convertir des images toi-même.',
].join('\n');
claude.register({ handle, log, dataDir: app.getPath('userData'), readConfig, outil: { nom: 'Brokk', role: "l'outil d'export d'assets web de Ragna (favicons, icônes, WebP, @2x, Open Graph)", consignes: CLAUDE_CONSIGNES } });

handle('config:read', async () => ({ config: await readConfig(), path: configPath() }));
// Les modifications des réglages passent une par une (lire, changer, écrire) : deux modifications
// lancées en même temps (une liste d'assets enregistrée pendant qu'on allume la surveillance)
// ne doivent pas s'écraser l'une l'autre.
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
handle('config:write', async (_event, changes) => modifierConfig((config) => Object.assign(config, changes)));
handle('app:version', async () => app.getVersion());

// --- Projets ---
// Un projet = un dossier (un site Vue, un dossier de logos…). Brokk n'écrit QUE dans le projet ouvert,
// et seulement dans un dossier choisi par toi (fenêtre « Choisir », projets récents, ou Atelier).
const projetsAutorises = new Set();

async function lireJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

// Que contient ce projet ? On regarde package.json et les dossiers habituels pour proposer
// les bonnes destinations : public/ pour les icônes (servi tel quel à la racine du site),
// src/assets/ pour les images importées par les composants Vue.
async function decrireProjet(dossier) {
  const existe = (rel) => fsSync.existsSync(path.join(dossier, rel));
  const pkg = await lireJson(path.join(dossier, 'package.json'));
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  let type = 'Dossier';
  if (deps.nuxt) type = 'Nuxt';
  else if (deps.vue && deps.vite) type = 'Vue + Vite';
  else if (deps.vue) type = 'Vue';
  else if (deps.react && deps.vite) type = 'React + Vite';
  else if (deps.vite) type = 'Vite';
  else if (pkg) type = 'Node';
  else if (existe('index.html')) type = 'Site HTML';
  const publicDir = existe('public') || ['Nuxt', 'Vue + Vite', 'Vue', 'Vite', 'React + Vite'].includes(type) ? 'public' : '';
  const assetsDir = existe('src/assets') ? 'src/assets/img' : existe('src') ? 'src/assets/img' : publicDir ? `${publicDir}/img` : 'img';
  // index.html à la racine (Vite) ou dans public/ (Vue CLI) : c'est là qu'on peut poser les balises des icônes.
  // Nuxt n'en a pas (les balises vont dans nuxt.config) : on donnera seulement le code à copier.
  const indexHtml = type === 'Nuxt' ? null : ['index.html', 'public/index.html'].find(existe) || null;
  return { dossier, nom: path.basename(dossier), type, publicDir, assetsDir, indexHtml };
}

async function ouvrirProjet(dossier) {
  const full = path.resolve(String(dossier));
  const st = await fs.stat(full).catch(() => null);
  if (!st || !st.isDirectory()) throw new Error(`Ce dossier n'existe pas (ou plus) : ${dossier}`);
  projetsAutorises.add(full);
  await modifierConfig((config) => { config.projetsRecents = [full, ...config.projetsRecents.filter((p) => p !== full)].slice(0, 12); });
  log('INFO', `Projet ouvert : ${full}`);
  return decrireProjet(full);
}

handle('projet:choisir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, {
    title: 'Choisir le projet où exporter les assets',
    defaultPath: config.projetsRecents[0] ? path.dirname(config.projetsRecents[0]) : os.homedir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  return ouvrirProjet(result.filePaths[0]);
});
// Un projet récent (déjà choisi une fois par toi), ou celui passé par Atelier.
handle('projet:ouvrir', async (_event, dossier) => {
  const config = await readConfig();
  const full = path.resolve(String(dossier));
  if (!config.projetsRecents.includes(full) && !projetsAutorises.has(full)) throw new Error(`Choisis d'abord ce dossier avec « Choisir un projet » : ${dossier}`);
  return ouvrirProjet(full);
});
handle('projet:recents', async () => (await readConfig()).projetsRecents.filter((p) => fsSync.existsSync(p)));

// Chemin relatif au projet → chemin complet, en refusant tout ce qui sortirait du projet (« ../ »).
function dansProjet(projet, rel) {
  const racine = path.resolve(String(projet));
  if (!projetsAutorises.has(racine)) throw new Error(`Projet non ouvert : ${projet}`);
  const full = path.resolve(racine, String(rel));
  if (full !== racine && !full.startsWith(racine + path.sep)) throw new Error(`Chemin hors du projet refusé : ${rel}`);
  return full;
}

// Écrire un fichier produit. On écrit d'abord un fichier temporaire, puis on le renomme :
// si quelque chose plante en plein milieu, l'ancien fichier reste intact.
handle('projet:ecrire', async (_event, projet, rel, bytes) => {
  const full = dansProjet(projet, rel);
  const existait = fsSync.existsSync(full);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const temp = `${full}.brokk-tmp`;
  await fs.writeFile(temp, typeof bytes === 'string' ? bytes : Buffer.from(bytes));
  await fs.rename(temp, full);
  return { chemin: full, existait, taille: typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.byteLength };
});
handle('projet:existe', async (_event, projet, rel) => fsSync.existsSync(dansProjet(projet, rel)));

// Poser les balises des icônes dans index.html, entre deux commentaires repères :
//   <!-- brokk:icones --> … <!-- /brokk:icones -->
// La première fois, le bloc est ajouté juste avant </head>, et les anciennes balises d'icône
// (par exemple le <link rel="icon" href="/favicon.ico"> que crée Vite) sont retirées pour ne pas
// faire doublon. Les fois suivantes, seul ce qui est entre les repères est remplacé.
handle('projet:baliserIndex', async (_event, projet, rel, balises) => {
  const full = dansProjet(projet, rel);
  let html = await fs.readFile(full, 'utf8');
  const avant = html;
  const debut = '<!-- brokk:icones -->', fin = '<!-- /brokk:icones -->';
  const retirees = [];
  const i = html.indexOf(debut), j = html.indexOf(fin);
  if (i >= 0 && j > i) {
    const indent = html.slice(html.lastIndexOf('\n', i) + 1, i);
    html = `${html.slice(0, i)}${debut}\n${balises.map((b) => indent + b).join('\n')}\n${indent}${html.slice(j)}`;
  } else {
    const ancienne = /^[ \t]*<link\b[^>]*\brel=["'](?:shortcut )?(?:icon|apple-touch-icon|manifest|mask-icon)["'][^>]*>[ \t]*\r?\n/gim;
    html = html.replace(ancienne, (m) => { retirees.push(m.trim()); return ''; });
    const theme = /^[ \t]*<meta\b[^>]*\bname=["']theme-color["'][^>]*>[ \t]*\r?\n/gim;
    html = html.replace(theme, (m) => { retirees.push(m.trim()); return ''; });
    const head = html.search(/<\/head>/i);
    if (head < 0) throw new Error(`${rel} n'a pas de balise </head>`);
    const ligne = html.slice(html.lastIndexOf('\n', head) + 1, head);
    const indent = `${ligne.match(/^\s*/)[0]}  `;
    const bloc = `${indent}${debut}\n${balises.map((b) => indent + b).join('\n')}\n${indent}${fin}\n`;
    const debutLigne = html.lastIndexOf('\n', head) + 1;
    html = html.slice(0, debutLigne) + bloc + html.slice(debutLigne);
  }
  if (html === avant) return { modifie: false, retirees };
  const temp = `${full}.brokk-tmp`;
  await fs.writeFile(temp, html, 'utf8');
  await fs.rename(temp, full);
  return { modifie: true, retirees };
});

handle('projet:montrer', async (_event, projet, rel) => {
  const full = dansProjet(projet, rel || '.');
  if (fsSync.existsSync(full) && fsSync.statSync(full).isFile()) shell.showItemInFolder(full);
  else {
    const err = await shell.openPath(fsSync.existsSync(full) ? full : path.resolve(String(projet)));
    if (err) throw new Error(err);
  }
});

// --- Sources (les images que tu donnes à Brokk) ---
const IMAGE_EXTENSIONS = ['psd', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'];
const isImage = (file) => IMAGE_EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase());

handle('source:choisir', async (event, projet) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const result = await dialog.showOpenDialog(win, {
    title: 'Ajouter des images à exporter',
    defaultPath: config.dernierDossierImages || (projet && fsSync.existsSync(projet) ? projet : app.getPath('pictures')),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images et Photoshop', extensions: IMAGE_EXTENSIONS },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return [];
  await modifierConfig((c) => { c.dernierDossierImages = path.dirname(result.filePaths[0]); });
  return result.filePaths;
});

handle('source:lire', async (_event, file) => {
  const full = path.resolve(String(file));
  if (!isImage(full)) throw new Error(`Ce fichier n'est pas une image : ${path.basename(full)}`);
  const st = await fs.stat(full).catch(() => null);
  if (!st) throw new Error(`Image introuvable : ${full}`);
  return { chemin: full, nom: path.basename(full), modifie: st.mtimeMs, bytes: await fs.readFile(full) };
});

// --- Surveillance des sources ---
// Quand tu enregistres le PSD dans Photoshop, Brokk ré-exporte tout seul les assets qui en viennent.
// On surveille le DOSSIER de chaque source, pas le fichier : Photoshop enregistre dans un fichier
// temporaire puis le renomme, ce qui ferait perdre la trace d'une surveillance posée sur le fichier.
const surveillances = new Map(); // dossier → watcher
let delais = new Map();
handle('source:surveiller', async (event, fichiers) => {
  for (const w of surveillances.values()) w.close();
  surveillances.clear();
  const voulus = new Set((fichiers || []).map((f) => path.resolve(String(f))));
  const dossiers = new Set([...voulus].map((f) => path.dirname(f)));
  const sender = event.sender;
  for (const dossier of dossiers) {
    if (!fsSync.existsSync(dossier)) continue;
    try {
      const w = fsSync.watch(dossier, (_type, nom) => {
        if (!nom) return;
        const full = path.join(dossier, nom.toString());
        if (!voulus.has(full)) return;
        // Un enregistrement déclenche plusieurs événements : on attend que ça se calme.
        clearTimeout(delais.get(full));
        delais.set(full, setTimeout(() => {
          delais.delete(full);
          if (fsSync.existsSync(full) && !sender.isDestroyed()) sender.send('source:modifiee', full);
        }, 700));
      });
      w.on('error', () => {});
      surveillances.set(dossier, w);
    } catch (err) {
      log('ERREUR', `Surveillance de ${dossier} : ${err.message}`);
    }
  }
  return surveillances.size;
});

handle('clipboard:writeText', async (_event, text) => clipboard.writeText(String(text)));

// --- Mise à jour ---
// Comme Skald, Brokk tourne de deux façons et se met à jour selon celle utilisée :
// - Installé avec Brokk-Setup.exe (app.isPackaged) : on cherche sur GitHub la Release brokk-vX.Y.Z
//   la plus récente. On ne peut pas demander « la dernière Release » du dépôt : celle-là est celle de
//   Rune. Une fois la bonne Release trouvée, electron-updater y télécharge l'installeur (décrit par
//   latest.yml), ferme Brokk, l'installe sans rien demander et le relance.
// - Lancé depuis le clone git (npm start) : git pull + npm install, confiés à export/mettre-a-jour.bat,
//   lancé dans sa propre fenêtre APRÈS la fermeture de Brokk.

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

// La Release de Brokk la plus récente publiée sur GitHub (on ignore celles des autres outils).
// La liste vient de commun/github.js : le flux des Releases d'abord (pas compté dans la limite de
// 60 demandes par heure de GitHub), l'API seulement en complément, gardée sur le disque.
let github = null;
async function latestBrokkRelease() {
  github ??= creerGithub({ net, dossier: app.getPath('userData'), agent: 'Brokk' });
  const releases = (await github.releases()).filter((r) => /^brokk-v\d+\.\d+\.\d+$/.test(r.tag_name));
  let best = null;
  for (const r of releases) {
    const version = r.tag_name.slice('brokk-v'.length);
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
      release = await latestBrokkRelease();
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
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) throw new Error('git est introuvable : installe Git pour Windows pour pouvoir mettre Brokk à jour');
    throw new Error(`Impossible de contacter GitHub : ${err.message}`);
  }
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!upstream) throw new Error(`La branche « ${branch} » n'est reliée à aucune branche GitHub`);
  // Seulement ce qui touche Brokk (les nouveautés des autres outils ne comptent pas ici).
  const changes = await git(['log', '--format=%s', 'HEAD..@{u}', '--', 'export']);
  return { mode: 'git', branch, changes: changes ? changes.split('\n') : [] };
});

handle('update:install', async () => {
  log('INFO', 'Mise à jour lancée depuis le bouton');
  if (app.isPackaged) {
    if (!pendingRelease) throw new Error('Cherche d\'abord la mise à jour');
    const updater = installerUpdater();
    // L'installeur et latest.yml sont dans les fichiers de la Release brokk-vX.Y.Z trouvée plus haut.
    updater.setFeedURL({ provider: 'generic', url: `https://github.com/${GITHUB_REPO}/releases/download/${pendingRelease.tag}` });
    const result = await updater.checkForUpdates();
    if (!result?.isUpdateAvailable) throw new Error(`La Release ${pendingRelease.tag} ne contient pas d'installeur utilisable`);
    await updater.downloadUpdate();
    // Installation silencieuse (pas de fenêtre d'installeur), puis Brokk se relance tout seul.
    claude.stop(true); // Claude Code et son serveur MCP aussi, sinon l'installeur ne peut pas remplacer les fichiers
    setTimeout(() => updater.quitAndInstall(true, true), 300);
    return;
  }
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'start', '', path.join(__dirname, 'mettre-a-jour.bat')], { cwd: REPO, detached: true, stdio: 'ignore' })
    : spawn('sh', [path.join(__dirname, 'mettre-a-jour.sh')], { cwd: REPO, detached: true, stdio: 'ignore' });
  child.unref();
  // Le script attend 2 secondes que Brokk soit fermé avant de toucher aux fichiers.
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

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Dossier passé en ligne de commande (« Brokk.exe D:\Projets\site », c'est ainsi qu'Atelier ouvre un
// projet dans Brokk) : ce dossier devient le projet ouvert.
// (Lancé depuis le clone, un des arguments est le dossier de Brokk lui-même : on le saute.)
const folderFromArgs = (argv) => argv.slice(app.isPackaged ? 1 : 2)
  .filter((a) => !a.startsWith('-') && a !== '.')
  .map((a) => path.resolve(a))
  .find((a) => a !== app.getAppPath() && fsSync.existsSync(a) && fsSync.statSync(a).isDirectory()) || null;
// Images passées en ligne de commande (un fichier glissé sur l'icône de Brokk).
const filesFromArgs = (argv) => argv.slice(1).filter((a) => !a.startsWith('-') && isImage(a) && fsSync.existsSync(a)).map((a) => path.resolve(a));

let startupFolder = folderFromArgs(process.argv);
claude.setProjet(startupFolder); // le projet avec lequel Atelier a ouvert l'outil
if (startupFolder) projetsAutorises.add(startupFolder);
let startupFiles = filesFromArgs(process.argv);
handle('startup', async () => {
  const out = { dossier: startupFolder, fichiers: startupFiles };
  startupFolder = null;
  startupFiles = [];
  return out;
});

function createWindow(config) {
  const blur = wantsBlur(config);
  const win = new BrowserWindow({
    width: 1600,
    height: 940,
    minWidth: 980,
    minHeight: 560,
    backgroundColor: blur ? '#00000000' : '#101014',
    ...(blur ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'Brokk',
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

// Une seule fenêtre Brokk : ouvrir un autre projet depuis Atelier le change dans la fenêtre déjà ouverte.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const folder = folderFromArgs(argv);
    claude.setProjet(folder);
    if (folder) {
      projetsAutorises.add(folder);
      win.webContents.send('projet:externe', folder);
    }
    const files = filesFromArgs(argv);
    if (files.length) win.webContents.send('source:externe', files);
  });

  app.whenReady().then(async () => {
    const config = await readConfig();
    log('INFO', `Démarrage de Brokk ${app.getVersion()}`);
    Menu.setApplicationMenu(null);
    createWindow(config);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => claude.stop(true));
}
