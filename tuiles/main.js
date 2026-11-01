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
  claudeCommandes: false, // Claude peut-il lancer des commandes (PowerShell, Python…) ?
  claudeSansDemander: {}, // familles d'actions que Claude fait sans demander (voir ../commun/claude.js)
  accentColor: '#7bd88f',
  glass: true,
  windowBlur: false,
  tileSize: 16,
  palette: 'nature',
  pixelGrid: true,
  tileGrid: true,
  exportScale: 1,
  historySteps: 60,
  panelZoom: 100, // taille des panneaux de droite, en %
  vignette: 44, // taille des vignettes de tuiles, en px
  colonnes: 'auto', // panneau de droite : 'auto', '1' ou '2' colonnes
  recentFiles: [],
  lastFolder: '',
  // Tafl 0.22 : ComfyUI (comfy.js). Vides = Tafl cherche tout seul.
  comfy: { dossier: '', code: '', python: '', modeles: '', port: 8189 },
  comfyDerniers: {}, // les derniers choix de la fenêtre « Générer »
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
  // Tafl 0.20 : une planche nommée s'écrit avec ses noms juste à côté (planche.tuiles.json).
  if (format === 'png') writable.add(path.resolve(result.filePath.replace(/\.png$/i, '') + '.tuiles.json'));
  return result.filePath;
});

// Tafl 0.20 : les noms d'une planche (planche.tuiles.json à côté de planche.png), relus à l'import.
// Seulement le fichier voisin d'une image que Ragna (ou Claude, dans le projet) vient d'ouvrir.
handle('file:nomsPlanche', async (_event, file) => {
  if (typeof file !== 'string' || !/\.png$/i.test(file)) return null;
  try { return JSON.parse(await fs.readFile(file.replace(/\.png$/i, '') + '.tuiles.json', 'utf8')); } catch { return null; }
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
// Les noms de données du JDR ont un tiret bas (donnees/classes_jdr.json) : il est permis partout.
const GAME_FILE = /^(jeu\.json|[\w.-]+\.tafl|cartes\/[a-z0-9_-]+\.json|donnees\/[a-z0-9_-]+\.json|scripts\/[a-z0-9][a-z0-9_-]{0,59}\.js)$/;
const MAP_FILE = /^cartes\/[a-z0-9_-]+\.json$/;
const DATA_FILE = /^donnees\/[a-z0-9_-]+\.json$/;
// Tafl 0.31 : les scripts JS du jeu (scripts/*.js). Tafl ne les exécute jamais ici : seulement dans le
// bac à sable de la fenêtre (commun/bac-a-sable.js), comme Saga.
const SCRIPT_FILE = /^scripts\/[a-z0-9][a-z0-9_-]{0,59}\.js$/;
const relGame = (rel) => String(rel).replace(/\\/g, '/');
async function mapFilesIn(folder) {
  const names = await fs.readdir(path.join(folder, 'cartes')).catch(() => []);
  const scripts = await fs.readdir(path.join(folder, 'scripts')).catch(() => []);
  return [...names.map((n) => `cartes/${n}`).filter((f) => MAP_FILE.test(f)), ...scripts.map((n) => `scripts/${n}`).filter((f) => SCRIPT_FILE.test(f))];
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
  const scripts = {};
  for (const s of Array.isArray(data.scripts) ? data.scripts : []) {
    const rel = relGame(s?.fichier || '');
    if (!SCRIPT_FILE.test(rel)) continue;
    const text = await fs.readFile(path.join(folder, rel), 'utf8').catch(() => null);
    if (text !== null) scripts[rel] = text;
  }
  gameFolders.add(folder);
  await rememberRecent(file);
  return { folder, path: file, jeu, tuiles, cartes, donnees, scripts };
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
  if (files.some(([rel]) => SCRIPT_FILE.test(relGame(rel)))) await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  // Tout vérifier d'abord : un seul nom refusé ne doit pas laisser le dossier à moitié enregistré.
  for (const [rel] of files) if (!GAME_FILE.test(relGame(rel))) throw new Error(`Fichier refusé dans le dossier de jeu : ${rel}`);
  for (const [rel, bytes] of files) {
    const r = relGame(rel);
    const full = path.join(root, r);
    const temp = `${full}.tafl-tmp`;
    await fs.writeFile(temp, Buffer.from(bytes));
    await fs.rename(temp, full);
  }
  for (const rel of remove) {
    const r = relGame(rel);
    if (MAP_FILE.test(r) || SCRIPT_FILE.test(r)) await fs.rm(path.join(root, r), { force: true });
  }
  // La description du format, toujours celle de cette version de Tafl.
  await fs.copyFile(path.join(__dirname, 'FORMAT.md'), path.join(root, 'FORMAT.md')).catch((err) => log('ERREUR', `FORMAT.md : ${err.message}`));
  // Tafl 0.31 : et l'aide des scripts JS (pour Ragna, et pour Loki qui la lit avant d'écrire un script).
  await fs.copyFile(path.join(__dirname, 'SCRIPTS.md'), path.join(root, 'SCRIPTS.md')).catch((err) => log('ERREUR', `SCRIPTS.md : ${err.message}`));
  const file = path.join(root, 'jeu.json');
  await rememberRecent(file);
  return { path: file, folder: root };
});

handle('file:reveal', async (_event, file) => shell.showItemInFolder(String(file)));

// --- Les sons du jeu (Tafl 0.29, lus par Saga 0.11) : le dossier sons/ du jeu ---
// Tafl les liste (pour les choisir dans l'ambiance d'une carte, les réglages, les commandes), les y
// copie (« Ajouter un son… ») et les lit pour les écouter. Saga les joue.
const SOUND_EXT = /\.(ogg|oga|mp3|wav|m4a|aac|opus|flac|webm)$/i;
function dossierSons(folder) {
  const root = path.resolve(String(folder || ''));
  if (!gameFolders.has(root)) throw new Error('Enregistre d\'abord le jeu dans un dossier (Fichier › Enregistrer le jeu) : ses sons vont dans son dossier sons/.');
  return { root, sons: path.join(root, 'sons') };
}
handle('sons:liste', async (_event, folder) => {
  const { sons } = dossierSons(folder);
  const names = await fs.readdir(sons).catch(() => []);
  return names.filter((n) => SOUND_EXT.test(n)).sort((a, b) => a.localeCompare(b, 'fr')).map((n) => `sons/${n}`);
});
handle('sons:importer', async (event, folder) => {
  const { sons } = dossierSons(folder);
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Ajouter des sons au jeu (musiques, bruitages, fonds sonores)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Sons', extensions: ['ogg', 'mp3', 'wav', 'm4a', 'opus', 'flac', 'webm', 'aac', 'oga'] }],
  });
  if (result.canceled || !result.filePaths.length) return [];
  await fs.mkdir(sons, { recursive: true });
  const out = [];
  for (const file of result.filePaths) {
    // Un nom sûr : sans les caractères interdits par Windows, et sans écraser un autre son.
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, path.extname(file)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'son';
    let name = `${base}${ext}`, n = 2;
    while (fsSync.existsSync(path.join(sons, name)) && path.resolve(path.join(sons, name)) !== path.resolve(file)) name = `${base}-${n++}${ext}`;
    if (path.resolve(path.join(sons, name)) !== path.resolve(file)) await fs.copyFile(file, path.join(sons, name));
    out.push(`sons/${name}`);
  }
  log('INFO', `Sons ajoutés : ${out.join(', ')}`);
  return out;
});
handle('sons:lire', async (_event, folder, rel) => {
  const { root } = dossierSons(folder);
  const r = relGame(rel);
  if (!/^sons\/[^/]+$/.test(r) || !SOUND_EXT.test(r) || r.includes('..')) throw new Error(`Son refusé : ${rel}`);
  const octets = await fs.readFile(path.join(root, r));
  return new Uint8Array(octets.buffer, octets.byteOffset, octets.byteLength);
});
handle('sons:montrer', async (_event, folder) => {
  const { sons } = dossierSons(folder);
  await fs.mkdir(sons, { recursive: true });
  const err = await shell.openPath(sons);
  if (err) throw new Error(err);
});

// Tafl 0.31 : l'aide des scripts JS (bouton ? de la page d'un script). Copiée hors de l'archive de
// l'application, sinon Windows ne peut pas l'ouvrir ; elle s'ouvre avec le programme des fichiers .md.
handle('scripts:aide', async () => {
  const copie = path.join(app.getPath('userData'), 'SCRIPTS.md');
  await fs.copyFile(path.join(__dirname, 'SCRIPTS.md'), copie);
  const err = await shell.openPath(copie);
  if (err) throw new Error(err);
});

// --- Tafl 0.22 : générer des tuiles avec ComfyUI, caché (voir comfy.js) ---
const comfy = require('./comfy').creer({ log, dossierTafl: app.getPath('userData') });
const comfyConfig = async () => ({ ...DEFAULT_CONFIG.comfy, ...((await readConfig()).comfy || {}) });
const envoyer = (event, canal) => (p) => { if (!event.sender.isDestroyed()) event.sender.send(canal, p); };
handle('comfy:trouver', async () => ({ ...comfy.trouver(await comfyConfig()), ...comfy.infos(), catalogue: comfy.CATALOGUE, cleCivitai: Boolean((await readConfig()).civitaiCle) }));
handle('comfy:demarrer', async (event) => comfy.demarrer(await comfyConfig(), envoyer(event, 'comfy:progres')));
handle('comfy:arreter', async () => comfy.arreter());
handle('comfy:infos', async () => comfy.infos());
handle('comfy:modeles', async () => comfy.modeles());
handle('comfy:generer', async (event, graphe) => {
  // Une seule carte graphique : l'IA locale de Loki (Ollama) lui laisse la place.
  if (await require('./commun/ollama').liberer()) log('INFO', 'Ollama : modèles déchargés avant ComfyUI');
  const images = await comfy.generer(graphe, envoyer(event, 'comfy:progres'));
  return images.map((b) => new Uint8Array(b));
});
handle('comfy:interrompre', async () => comfy.interrompre());
handle('comfy:envoyerImage', async (_event, octets, nom) => comfy.envoyerImage(octets, nom));
handle('comfy:liberer', async () => comfy.liberer());
handle('comfy:telecharger', async (event, quoi) => {
  const t = comfy.trouver(await comfyConfig());
  const connu = comfy.CATALOGUE.find((m) => m.id === quoi?.id);
  return comfy.telecharger(connu || quoi || {}, t.modeles, envoyer(event, 'comfy:telechargement'), { cleCivitai: (await readConfig()).civitaiCle || '' });
});
// La clé Civitai de Ragna : rangée à part, « Oublier mes choix » ne l'efface pas. Jamais renvoyée à la fenêtre.
handle('comfy:cleCivitai', async (_event, cle) => {
  const config = await readConfig();
  await writeConfig({ ...config, civitaiCle: String(cle || '').trim() });
});
// Choisir à la main : le dossier de ComfyUI, son Python, ou le dossier des modèles.
handle('comfy:choisir', async (event, quoi) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const options = quoi === 'python'
    ? { title: 'Le Python de ComfyUI (python.exe, dans .venv\\Scripts ou python_embeded)', properties: ['openFile'], filters: [{ name: 'Python', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }] }
    : { title: quoi === 'modeles' ? 'Le dossier « models » de ComfyUI' : 'Le dossier où ComfyUI est installé', properties: ['openDirectory'] };
  const r = await dialog.showOpenDialog(win, options);
  if (r.canceled || !r.filePaths[0]) return null;
  const config = await readConfig();
  const c = { ...DEFAULT_CONFIG.comfy, ...(config.comfy || {}) };
  if (quoi === 'python') c.python = r.filePaths[0];
  else if (quoi === 'modeles') c.modeles = r.filePaths[0];
  else Object.assign(c, { dossier: r.filePaths[0], code: '', python: '', modeles: '' });
  await writeConfig({ ...config, comfy: c });
  return r.filePaths[0];
});
// Oublier les choix faits à la main : Tafl recherche tout seul.
handle('comfy:oublier', async () => {
  const config = await readConfig();
  await writeConfig({ ...config, comfy: { ...DEFAULT_CONFIG.comfy, port: config.comfy?.port || DEFAULT_CONFIG.comfy.port } });
});
// La page officielle de téléchargement de ComfyUI, dans le navigateur.
handle('comfy:siteOfficiel', async (_event, quoi) => shell.openExternal(quoi === 'civitai' ? 'https://civitai.com/user/account' : 'https://www.comfy.org/download'));
handle('comfy:ouvrirModeles', async () => {
  const t = comfy.trouver(await comfyConfig());
  if (t.modeles) await shell.openPath(t.modeles);
  return t.modeles;
});

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
// test (Tafl 0.27) : un test rapide, l'état de départ choisi dans Tafl (FORMAT.md › Test rapide). Il passe
// à Saga par un petit fichier dans le dossier temporaire : --test=<ce fichier>.
handle('jeu:jouer', async (_event, dossier, depart, test) => {
  const root = path.resolve(String(dossier));
  if (!gameFolders.has(root) || !fsSync.existsSync(path.join(root, 'jeu.json'))) throw new Error('Enregistre d\'abord le jeu dans un dossier');
  const saga = (!app.isPackaged && sagaDuClone()) || (await sagaInstalle()) || sagaDuClone();
  if (!saga) throw new Error('Saga, le moteur du jeu, n\'est pas installé : installe-le depuis Atelier');
  const args = [...saga.args, root];
  if (depart?.carte) args.push(`--carte=${depart.carte}`, `--x=${Math.round(depart.x)}`, `--y=${Math.round(depart.y)}`, `--direction=${depart.direction || 'bas'}`);
  if (test && typeof test === 'object') {
    const fichier = path.join(app.getPath('temp'), 'tafl-test-rapide.json');
    const texte = JSON.stringify(test);
    if (texte.length > 1e6) throw new Error('Cet état de test est trop gros');
    await fs.writeFile(fichier, texte, 'utf8');
    args.push(`--test=${fichier}`);
  }
  const child = spawn(saga.exe, args, { cwd: root, detached: true, stdio: 'ignore' });
  child.on('error', (err) => log('ERREUR', `Saga : ${err.message}`));
  child.unref();
  log('INFO', `Jouer : ${saga.exe} ${args.join(' ')}`);
});

// --- Exporter le jeu (Tafl 0.26) : une version web et/ou Windows (.exe) à envoyer à des testeurs ---
// C'est Saga (0.9 ou plus) qui fabrique l'export : il a le moteur et Electron. Tafl le lance sans fenêtre :
//   Saga.exe D:\Jeux\MonJeu --exporter=web,exe --sortie=D:\Exports --rapport=<fichier temporaire>
// puis lit le rapport (les dossiers et les .zip créés, ou l'erreur) quand Saga a fini.
handle('jeu:exporter', async (event, dossier, formats) => {
  const root = path.resolve(String(dossier));
  if (!gameFolders.has(root) || !fsSync.existsSync(path.join(root, 'jeu.json'))) throw new Error('Enregistre d\'abord le jeu dans un dossier');
  formats = ['web', 'exe'].filter((f) => Array.isArray(formats) && formats.includes(f));
  if (!formats.length) throw new Error('Choisis au moins une version : web ou Windows');
  const saga = (!app.isPackaged && sagaDuClone()) || (await sagaInstalle()) || sagaDuClone();
  if (!saga) throw new Error('Saga, le moteur du jeu, n\'est pas installé : installe-le depuis Atelier (c\'est lui qui fabrique l\'export)');
  const win = BrowserWindow.fromWebContents(event.sender);
  const config = await readConfig();
  const choix = await dialog.showOpenDialog(win, {
    title: 'Où ranger l\'export du jeu ?',
    defaultPath: config.dossierExport || path.dirname(root),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (choix.canceled || !choix.filePaths[0]) return null;
  const sortie = choix.filePaths[0];
  await writeConfig({ ...(await readConfig()), dossierExport: sortie });
  const rapport = path.join(os.tmpdir(), `tafl-export-${process.pid}-${Date.now()}.json`);
  const args = [...saga.args, root, `--exporter=${formats.join(',')}`, `--sortie=${sortie}`, `--rapport=${rapport}`];
  log('INFO', `Export : ${saga.exe} ${args.join(' ')}`);
  await new Promise((resolve, reject) => {
    const child = spawn(saga.exe, args, { cwd: root, stdio: 'ignore', windowsHide: true });
    const minuterie = setTimeout(() => { child.kill(); reject(new Error('Saga met trop de temps à exporter (plus de 10 minutes) : regarde saga.log')); }, 10 * 60 * 1000);
    child.on('error', (err) => { clearTimeout(minuterie); reject(new Error(`Impossible de lancer Saga : ${err.message}`)); });
    child.on('exit', () => { clearTimeout(minuterie); resolve(); });
  });
  const r = await fs.readFile(rapport, 'utf8').then(JSON.parse).catch(() => null);
  await fs.rm(rapport, { force: true });
  if (!r) throw new Error('Saga n\'a rien exporté : il est peut-être trop ancien (il faut Saga 0.9 ou plus, mets-le à jour depuis Atelier)');
  if (!r.ok) throw new Error(r.erreur || 'L\'export a échoué');
  return r;
});

// --- Panneau Claude (le même que dans Skald, Brokk : voir ../commun/LISEZMOI.md) ---
const claude = require('./commun/claude');
const { creerGithub, LimiteGithub } = require('./commun/github');
// Ce que Claude doit savoir en plus dans cet outil (voir ../commun/claude.js, ecrireConsignes).
const CLAUDE_CONSIGNES = [
  '- Le jeu ouvert vit dans la fenêtre de Tafl : lis-le avec infos, voir_carte, donnees, voir_donnees, et',
  '  change-le avec les actions (poser_tuiles, cartes, evenement, donnee…). Ne modifie pas les fichiers JSON du dossier de',
  '  jeu toi-même : Tafl les réécrit à chaque enregistrement, et ce qui n\'est pas enregistré n\'y est pas encore.',
  '- Un dossier de jeu (jeu.json, tuiles.tafl, cartes/, donnees/) est décrit dans le FORMAT.md copié dans ce',
  '  dossier : ouvre-le avec Read seulement si une question porte sur le format des fichiers (pour le moteur Saga).',
  '- Pour enregistrer : enregistrer_jeu (ou enregistrer). Pour essayer le jeu : Ragna clique sur « Jouer ».',
  '- Scripts JS (Tafl 0.31) : quand un bloc ne suffit pas (dés, calculs, règles maison, réactions), écris un script',
  '  avec l\'action script, après avoir lu le SCRIPTS.md du dossier du jeu (l\'API : commande, formule, quand, saga.*,',
  '  des.*). Regarde d\'abord l\'action scripts, essaie avec essayer_script, puis pose le bloc Script dans un événement.',
  '- Multijoueur (Saga 1.0) : les amis rejoignent la partie de Ragna par leur navigateur. Réglages › Partie ›',
  '  Multijoueur dit ce qu\'ils ont le droit de faire ; la commande composer_equipe sert aux arènes (chacun choisit',
  '  son équipe, ses attaques et ses objets, puis les deux se défient face à face). Fichier › Nouveau jeu propose',
  '  « L\'arène de duel », un jeu modèle tout prêt pour essayer à deux.',
  '- Après une grosse modification (cartes, téléporteurs, quêtes, scripts), lance l\'action verifier et corrige les',
  '  erreurs qu\'elle trouve. Pour essayer un passage précis avec une équipe, des objets ou des badges : Ragna ouvre',
  '  Jeu › Test rapide (Ctrl+F5).',
  '',
  '### Économiser les jetons (la limite d\'utilisation de Ragna)',
  '',
  'Chaque action relit toute la conversation : 100 petites actions coûtent bien plus que 3 grandes, et une',
  'grosse réponse (une image, une longue liste) se repaie à chaque action suivante.',
  '- Texte d\'abord : catalogue (tuiles et tampons par nom), infos, voir_carte sans image. Les images (voir_tuiles,',
  '  voir_tampons, voir_carte image: true) seulement quand le texte ne suffit pas, et une fois.',
  '- Planche importée : ses tuiles n\'ont pas de nom. Regarde-les par pages de 128 à 256 (voir_tuiles de, nombre) et',
  '  décris-les toutes avec nommer (un appel par page : sol, chemins, eau, murs, toits, portes… et le passage',
  '  bloque des murs et de l\'eau), nomme aussi les tampons, puis enregistre : les conversations suivantes',
  '  liront le catalogue au lieu des images. Propose ensuite exporter_planche_nommee (le PNG et ses noms) : importée',
  '  dans un autre jeu, la planche arrive déjà nommée.',
  '- Construire une carte : écris d\'abord le plan (où vont les maisons, l\'arène, les chemins, l\'eau), puis',
  '  pose-le avec plan_carte, en un appel par carte (ou par grande partie). Pas de poser_tuiles case par case.',
  '  Vérifie une fois à la fin (voir_carte image: true), corrige avec un petit plan_carte, et passe à la suite.',
  '- Pour une grande demande (plusieurs villes), fais une carte après l\'autre et enregistre entre deux ; dis à',
  '  Ragna qu\'une nouvelle conversation par grosse étape coûte moins (la mémoire de la précédente est le jeu',
  '  lui-même : catalogue, infos et voir_carte la retrouvent).',
  '',
  '### Générer avec ComfyUI (gratuit en jetons)',
  '',
  '- generer_tuiles fait dessiner ComfyUI sur la carte graphique de Ragna (moteur caché, lancé par Tafl) : un sol',
  '  qui se répète ou un objet détouré, en pixel art ou dans un autre style. Ça ne coûte que le texte de l\'appel.',
  '  Préfère-le pour les grandes surfaces et les objets détaillés ; retouche ensuite à la main si besoin.',
  '  Si ComfyUI manque, dis à Ragna d\'ouvrir « Générer › Installation et réglages de ComfyUI… ».',
  '',
  '### Dessiner de belles tuiles (pixel art)',
  '',
  'Ragna tient à la qualité : du détail, de la profondeur, un vrai pixel art 16 bits vu de dessus, sombre et',
  'feutré (verts éteints, ardoises sombres, bois, pluie). Ne livre pas une tuile plate ou bruitée au hasard.',
  '- Pour aller vite : recette_tuile donne en un appel un sol, un chemin, des pavés, de l\'eau, un mur ou un toit propres',
  '  (et leurs variantes) ; pars de là et retouche avec peindre_tuile plutôt que de tout refaire.',
  '- Méthode : 1) choisis 2 ou 3 rampes (palette « brume », ou action rampe autour d\'une couleur) ; 2) peindre_tuile',
  '  pour la base : aplat, taches douces, quelques marques ; 3) les formes, puis ombrage, contour, ombre_portee ;',
  '  4) les détails à la main (opération pixels ou dessiner_tuile) ; 5) regarde l\'aperçu et le regard critique',
  '  renvoyés, corrige au moins une fois, puis seulement dis à Ragna que c\'est fait.',
  '- Couleurs : 3 à 5 teintes par matière, en rampe ; les ombres tirent vers le bleu violet, les lumières vers le',
  '  jaune (jamais du noir ou du blanc purs). 4 à 8 couleurs suffisent pour une tuile de 16 px.',
  '- Lumière toujours en haut à gauche : bord haut gauche clair, bord bas droit sombre, ombre portée en bas à droite.',
  '- Contours : la teinte la plus sombre de la rampe de l\'objet (pas #000), surtout en bas ; souvent pas de contour',
  '  sur le haut éclairé. Le sol n\'a pas de contour.',
  '- Propre avant tout : un sol est CALME (agitation sous 25 % dans le regard critique). Base unie, puis 3 à 6',
  '  marques seulement (touffes, cailloux, reflets), d\'une teinte voisine. Les taches douces (opération taches) servent',
  '  aux grandes tuiles (32 px et plus) ou très légèrement ; nettoyer en dernier. Mieux vaut trop calme que bruité.',
  '  Le détail et le contraste vont aux objets, aux bordures (herbe qui déborde sur le chemin, ombre sous le bord)',
  '  et aux ombres : c\'est ce qui donne la profondeur, pas des points partout.',
  '- Texture : des amas de 2 à 4 pixels, jamais de pixels isolés qui tranchent ; une seule teinte d\'écart avec la base.',
  '  Pas d\'« ombrage coussin » (le centre clair et tout le tour sombre) : la lumière vient d\'un côté.',
  '- Tuiles de sol (herbe, terre, eau) : elles doivent se raccorder ; vérifie la mosaïque 3 × 3, pas de motif centré.',
  '  Fais 2 ou 3 variantes (même recette, autre graine) et pose-les avec poser_tuiles variantes : la répétition disparaît.',
  '- La finesse se joue sur les grands objets : dessine-les d\'un seul tenant avec dessiner_objet (un sapin en 3 × 4',
  '  tuiles, une maison en 5 × 5), silhouette en polygone, puis des motifs soignés répétés (repeter), puis retouches.',
  '- Profondeur : les objets hauts (arbres, maisons, falaises) sur plusieurs tuiles (tampons), le haut sur un calque',
  '  « dessus » ; une rangée plus sombre au pied des murs et falaises.',
  '- Animation : animer_tuile plutôt qu\'image par image : cycle de couleurs pour l\'eau, balancement d\'1 pixel pour',
  '  les herbes, scintillement pour les reflets ; 3 à 6 images de 150 à 300 ms, des mouvements petits et doux.',
].join('\n');
// La version courte pour Loki en local (un modèle de 8 à 14 milliards de paramètres a peu de mémoire :
// le catalogue des actions y prend déjà beaucoup de place). Les mêmes règles, sans les conseils de style.
const CLAUDE_CONSIGNES_LOCALES = [
  '- Le jeu ouvert vit dans la fenêtre de Tafl. Pour le lire : infos, catalogue, voir_carte, donnees, voir_donnees.',
  '  Pour le changer : les actions (plan_carte, poser_tuiles, cartes, evenement, donnee…). Ne modifie jamais les',
  '  fichiers JSON du dossier de jeu toi-même : passe par les actions.',
  '- Commence par infos quand tu ne sais pas ce qui est ouvert. S\'il n\'y a pas de jeu : nouveau_jeu.',
  '- Construire une carte : un plan, puis plan_carte en un appel (pas de poser_tuiles case par case).',
  '- Pour enregistrer : enregistrer_jeu. Après une grosse modification : verifier.',
  '- Tuiles : recette_tuile d\'abord (herbe, terre, chemin, pavés, eau, sable, roche, rocher, falaise, murs, toit,',
  '  fleurs ; plusieurs variantes, une catégorie) : propre en un appel. peindre_tuile seulement pour retoucher.',
  '- Maisons, arbres, objets détaillés : generer_tuiles (ComfyUI, sur la carte graphique de Ragna).',
  '- Tu ne vois pas les images : fie-toi au texte (catalogue, voir_carte sans image).',
].join('\n');
// Les actions toujours données au modèle local comme vrais outils (les autres sont dans son catalogue).
const LOKI_ESSENTIELLES = ['infos', 'catalogue', 'recette_tuile', 'voir_carte', 'plan_carte', 'poser_tuiles', 'enregistrer_jeu', 'annuler'];

claude.register({ handle, log, dataDir: app.getPath('userData'), readConfig, writeConfig: async (changes) => writeConfig({ ...(await readConfig()), ...changes }), avantLocal: () => comfy.liberer(), outil: { nom: 'Tafl', role: "l'éditeur de tuiles et de cartes en pixel art de Ragna (pour son jeu façon Pokémon, export Tiled)", consignes: CLAUDE_CONSIGNES, consignesLocales: CLAUDE_CONSIGNES_LOCALES, essentielles: LOKI_ESSENTIELLES } });

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
  app.on('will-quit', () => { claude.stop(); comfy.arreter(); });
}
