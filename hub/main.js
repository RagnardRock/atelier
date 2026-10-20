// Processus principal d'Atelier, le hub de mes outils.
// C'est lui qui crée la fenêtre et qui a le droit de toucher au disque et de lancer des programmes :
// - retrouver Rune, Skald… installés sur le PC et lire leur version (registre de Windows) ;
// - demander à GitHub la dernière version de chacun, télécharger et lancer leur installeur ;
// - lancer un outil ;
// - garder les notes et les réglages dans %APPDATA%\atelier-hub ;
// - mettre Atelier lui-même à jour.

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, screen, session, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const OUTILS = require('./outils');
const claude = require('./claude');

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
  // Le dossier où sont rangés tes projets (widget Projets récents), comme dans Rune.
  // Outil choisi pour certains projets (clic droit › Toujours ouvrir avec…) : { nomDuDossier: 'skald' }.
  outilsProjets: {},
  dossierProjets: process.platform === 'win32' ? 'D:\\Projets' : path.join(os.homedir(), 'Projets'),
  // Presse-papiers : retenir ce que tu copies, et le garder après la fermeture d'Atelier (désactivé par
  // défaut : un mot de passe copié finirait sinon dans un fichier).
  surveillerPressePapiers: true,
  garderPressePapiers: false,
  // Widgets affichés (Réglages › Widgets).
  widgets: { notes: true, projets: true, pressePapiers: true, minuteurs: true, calendrier: true, claude: true },
  // Widget Claude : la commande de Claude Code, le modèle ('' = celui de Claude Code) et le droit de
  // lire les fichiers du dossier des projets (en plus des notes, du calendrier et de l'état des projets).
  claudeCommand: 'claude',
  claudeModel: '',
  claudeLitProjets: true,
  // Actions de Claude dans Atelier (notes, calendrier, minuteurs, projets) : permises ou non, et
  // les familles pour lesquelles il ne demande plus (sinon : une carte Autoriser / Refuser à chaque fois).
  claudeActions: true,
  claudeSansDemander: { notes: false, calendrier: false, minuteurs: false, projets: false },
  // Correction d'orthographe (notes, message à Claude…) : activée, et dans quelle(s) langue(s).
  orthographe: true,
  languesOrthographe: 'fr',
};
const readConfig = async () => {
  const config = { ...DEFAULT_CONFIG, ...(await readJson(configPath(), {})) };
  // Un widget ajouté dans une nouvelle version est affiché, même si config.json date d'avant.
  config.widgets = { ...DEFAULT_CONFIG.widgets, ...config.widgets };
  return config;
};

handle('config:read', async () => ({ config: await readConfig(), path: configPath() }));
handle('config:write', async (_event, changes) => {
  const config = { ...(await readConfig()), ...changes };
  await writeJson(configPath(), config);
  appliquerOrthographe(config);
  return config;
});

// --- Correction d'orthographe ---
// Le correcteur de Chromium souligne les fautes dans les zones de texte (notes, message à Claude).
// Sous Windows, il utilise le correcteur de Windows lui-même, avec les langues installées sur le PC.
// Le clic droit sur un mot souligné propose les corrections (menu de l'interface, voir base.js).
const LANGUES_ORTHOGRAPHE = { fr: ['fr-FR', 'fr'], en: ['en-US', 'en-GB', 'en'] };
function appliquerOrthographe(config) {
  const s = session.defaultSession;
  s.setSpellCheckerEnabled(config.orthographe !== false);
  if (config.orthographe === false) return;
  // « fr+en » : les deux à la fois. Pour chaque langue, le premier code que Chromium connaît.
  const dispo = s.availableSpellCheckerLanguages;
  const langues = String(config.languesOrthographe || 'fr').split('+')
    .map((l) => (LANGUES_ORTHOGRAPHE[l] || []).find((code) => !dispo.length || dispo.includes(code)))
    .filter(Boolean);
  try {
    if (langues.length) s.setSpellCheckerLanguages(langues);
  } catch (err) {
    log('ERREUR', `Orthographe : langues ${langues.join(', ')} refusées : ${err.message}`);
  }
}

// Clic droit dans une zone de texte : l'interface affiche le menu (corrections, couper, copier,
// coller…) et demande ici ce que le menu de l'interface ne peut pas faire seul.
handle('edition:commande', async (event, commande, mot) => {
  const wc = event.sender;
  if (commande === 'remplacer') return wc.replaceMisspelling(String(mot));
  if (commande === 'dictionnaire') return wc.session.addWordToSpellCheckerDictionary(String(mot));
  if (['cut', 'copy', 'paste', 'selectAll', 'undo', 'redo'].includes(commande)) return wc[commande]();
  throw new Error(`Commande inconnue : ${commande}`);
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

// --- Petits fichiers de données des widgets (couleurs, calendrier…) ---
// Un fichier JSON par widget dans %APPDATA%\atelier-hub. Seuls les noms listés ici sont permis.
// projets-memoire : ce que Claude retient sur chaque projet, { nomDuProjet: [{ id, texte, quand }] }.
// claude-conversations : les conversations du widget Claude (claude : l'ancienne, d'avant la liste).
const DONNEES = ['couleurs', 'calendrier', 'presse-papiers', 'minuteurs', 'claude', 'claude-conversations', 'projets-memoire'];
const donneesPath = (nom) => {
  if (!DONNEES.includes(nom)) throw new Error(`Données inconnues : ${nom}`);
  return path.join(app.getPath('userData'), `${nom}.json`);
};
handle('donnees:lire', async (_event, nom, defaut = null) => readJson(donneesPath(nom), defaut));
handle('donnees:ecrire', async (_event, nom, data) => writeJson(donneesPath(nom), data));

// --- Widget Presse-papiers ---
// Chaque seconde, on regarde le texte du presse-papiers de Windows. S'il a changé, il rejoint
// l'historique (40 éléments au plus, le plus récent en haut) et l'interface est prévenue.
// Seul le texte est retenu (pas les images ni les fichiers).
const MAX_HISTORIQUE = 40;
let historique = [];
let dernierTexte = null;
let surveillance = null;

async function enregistrerHistorique() {
  if ((await readConfig()).garderPressePapiers) await writeJson(donneesPath('presse-papiers'), historique);
}
function ajouterAuHistorique(texte) {
  historique = [{ texte, quand: Date.now() }, ...historique.filter((h) => h.texte !== texte)].slice(0, MAX_HISTORIQUE);
  sendToWindow('presse:change', historique);
  enregistrerHistorique().catch((err) => log('ERREUR', `presse-papiers.json : ${err.message}`));
}
// (Dans Electron 44, lire le presse-papiers est asynchrone : d'où le await.)
let lectureEnCours = false;
async function verifierPressePapiers() {
  if (lectureEnCours) return;
  lectureEnCours = true;
  const texte = String((await Promise.resolve(clipboard.readText()).catch(() => '')) ?? '');
  lectureEnCours = false;
  if (texte === dernierTexte) return;
  dernierTexte = texte;
  if (texte.trim() && texte.length <= 100_000) ajouterAuHistorique(texte);
}
async function demarrerSurveillance() {
  const config = await readConfig();
  clearInterval(surveillance);
  surveillance = null;
  if (config.garderPressePapiers && !historique.length) historique = await readJson(donneesPath('presse-papiers'), []);
  if (!config.garderPressePapiers) await fs.rm(donneesPath('presse-papiers'), { force: true }).catch(() => {});
  if (!config.surveillerPressePapiers) return;
  dernierTexte = String((await clipboard.readText()) ?? ''); // ce qui était copié avant le lancement ne compte pas
  surveillance = setInterval(verifierPressePapiers, 1000);
}
handle('presse:historique', async () => historique);
handle('presse:copier', async (_event, texte) => {
  await clipboard.writeText(String(texte));
  dernierTexte = String(texte);
  ajouterAuHistorique(dernierTexte); // remonte en haut de la liste
});
handle('presse:supprimer', async (_event, texte) => {
  historique = historique.filter((h) => h.texte !== texte);
  sendToWindow('presse:change', historique);
  await enregistrerHistorique();
});
handle('presse:vider', async () => {
  historique = [];
  sendToWindow('presse:change', historique);
  await enregistrerHistorique();
});
// Après un changement de réglages (surveiller / garder).
handle('presse:reglages', async () => demarrerSurveillance());

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

// --- Widget Projets récents ---
// Les dossiers de ton dossier de projets (D:\Projets par défaut), du plus récemment touché au plus
// ancien, avec pour chacun : son type (Vue, Vite, Node, HTML…), sa branche Git, le nombre de fichiers
// modifiés et de commits pas encore poussés. Un clic l'ouvre dans Rune.

async function dossierProjets() {
  const folder = (await readConfig()).dossierProjets;
  return typeof folder === 'string' && folder.trim() ? path.resolve(folder) : null;
}

// Le type d'un projet, d'après son package.json (ou la présence d'un index.html…).
async function typeProjet(folder) {
  const pkg = await readJson(path.join(folder, 'package.json'), null);
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, label] of [['nuxt', 'Nuxt'], ['vue', 'Vue'], ['react', 'React'], ['svelte', 'Svelte'], ['electron', 'Electron'], ['vite', 'Vite'], ['express', 'Express']]) if (deps[dep]) return label;
    return 'Node';
  }
  if (fsSync.existsSync(path.join(folder, 'composer.json'))) return 'PHP';
  if (fsSync.existsSync(path.join(folder, 'index.html'))) return 'HTML';
  return null;
}

// Projet de code ou projet d'images ? On compte les fichiers du dossier et de ses sous-dossiers
// directs (sans node_modules ni .git) : s'il y a plus d'images (PSD, AI, PNG, SVG…) que de fichiers
// de code, c'est un projet d'images, qui s'ouvre dans Skald. Sinon, dans Rune.
const EXT_IMAGES = new Set(['psd', 'psb', 'ai', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'avif', 'tif', 'tiff', 'xcf', 'kra']);
const EXT_CODE = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'svelte', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'php', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'json', 'md', 'sh', 'bat', 'ps1', 'yml', 'yaml', 'toml', 'sql', 'twig']);
async function categorieProjet(folder) {
  let images = 0, code = 0, vus = 0;
  const compter = (name) => {
    const ext = path.extname(name).slice(1).toLowerCase();
    if (EXT_IMAGES.has(ext)) images++;
    else if (EXT_CODE.has(ext)) code++;
  };
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.isFile()) compter(e.name);
    else if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && vus < 40) {
      vus++;
      for (const sub of await fs.readdir(path.join(folder, e.name), { withFileTypes: true }).catch(() => [])) if (sub.isFile()) compter(sub.name);
    }
  }
  return images > code ? 'images' : 'code';
}

// Branche, fichiers modifiés et commits à pousser / à récupérer. null si ce n'est pas un dépôt git
// (ou si git n'est pas installé).
async function etatGit(folder) {
  if (!fsSync.existsSync(path.join(folder, '.git'))) return null;
  try {
    const opts = { cwd: folder, timeout: 8000 };
    const [branche, status] = await Promise.all([
      run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts),
      run('git', ['status', '--porcelain'], opts),
    ]);
    // « 2	1 » : 2 commits sur GitHub pas encore récupérés, 1 commit local pas encore poussé.
    const ecart = await run('git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'], opts).catch(() => null);
    const [aRecuperer, aPousser] = ecart ? ecart.trim().split(/\s+/).map(Number) : [null, null];
    return { branche: branche.trim(), modifies: status.split('\n').filter(Boolean).length, aPousser, aRecuperer };
  } catch {
    return null;
  }
}

// Date de dernière activité : le plus récent entre le dossier, l'index git et le package.json.
async function derniereActivite(folder) {
  let last = 0;
  for (const f of [folder, path.join(folder, '.git', 'index'), path.join(folder, 'package.json'), path.join(folder, 'src')]) {
    const st = await fs.stat(f).catch(() => null);
    if (st && st.mtimeMs > last) last = st.mtimeMs;
  }
  return last;
}

const MAX_PROJETS = 40;
// (Aussi utilisé par le widget Claude, pour lui décrire tes projets.)
async function listeProjets() {
  const racine = await dossierProjets();
  if (!racine || !fsSync.existsSync(racine)) return { racine, existe: false, projets: [], noms: [], memoire: {} };
  const entries = (await fs.readdir(racine, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules');
  const projets = await Promise.all(entries.map(async (e) => {
    const folder = path.join(racine, e.name);
    return { nom: e.name, dossier: folder, activite: await derniereActivite(folder) };
  }));
  projets.sort((a, b) => b.activite - a.activite);
  const garder = projets.slice(0, MAX_PROJETS);
  const { outilsProjets = {} } = await readConfig();
  // Ce que Claude retient sur chaque projet (widget Claude), affiché aussi dans Projets récents.
  const memoire = await readJson(donneesPath('projets-memoire'), {});
  // Type, catégorie et état git en parallèle pour tous les projets gardés.
  await Promise.all(garder.map(async (p) => {
    [p.type, p.categorie, p.git] = await Promise.all([typeProjet(p.dossier), categorieProjet(p.dossier), etatGit(p.dossier)]);
    if (p.categorie === 'images' && !p.type) p.type = 'Images';
    // L'outil qui l'ouvre : ton choix s'il y en a un, sinon Skald pour les images et Rune pour le reste.
    p.outilAuto = p.categorie === 'images' ? 'skald' : 'rune';
    p.outil = outilsProjets[p.nom] || p.outilAuto;
    p.memoire = Array.isArray(memoire[p.nom]) ? memoire[p.nom] : [];
  }));
  return { racine, existe: true, projets: garder, total: projets.length, noms: projets.map((p) => p.nom), memoire };
}
handle('projets:liste', listeProjets);

// Un projet ne peut être ouvert que s'il est bien dans le dossier des projets.
async function projetAutorise(folder) {
  const racine = await dossierProjets();
  const full = path.resolve(String(folder));
  if (!racine || path.dirname(full) !== racine || !fsSync.existsSync(full)) throw new Error(`Ce dossier n'est pas un de tes projets : ${folder}`);
  return full;
}

// Ouvre un projet avec un outil (rune, skald) ou dans l'Explorateur.
handle('projets:ouvrir', async (_event, folder, outil) => {
  const full = await projetAutorise(folder);
  if (outil === 'explorateur') {
    const err = await shell.openPath(full);
    if (err) throw new Error(err);
    return;
  }
  const tool = toolById(outil);
  const installed = await findInstalled(tool, await readUninstallRegistry());
  if (!installed) throw new Error(`${tool.nom} n'est pas installé : installe-le depuis la colonne Outils`);
  // Une version trop ancienne s'ouvrirait, mais sur son dernier dossier et pas sur celui-ci.
  if (tool.ouvreDossier && installed.version && newer(tool.ouvreDossier, installed.version)) {
    throw new Error(`${tool.nom} ${installed.version} ne sait pas encore ouvrir un dossier : mets-le à jour (version ${tool.ouvreDossier} ou plus) depuis la colonne Outils`);
  }
  const child = spawn(installed.exe, [full], { cwd: full, detached: true, stdio: 'ignore' });
  child.on('error', (err) => reportError(`Ouverture dans ${tool.nom}`, err));
  child.unref();
  log('INFO', `Ouverture de ${full} dans ${tool.nom}`);
});
// Toujours ouvrir ce projet avec cet outil (null : revenir au choix automatique).
handle('projets:choisirOutil', async (_event, nom, outil) => {
  const config = await readConfig();
  const outilsProjets = { ...config.outilsProjets };
  if (outil) outilsProjets[String(nom)] = String(outil);
  else delete outilsProjets[String(nom)];
  await writeJson(configPath(), { ...config, outilsProjets });
});
handle('projets:choisirDossier', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, { title: 'Dossier de mes projets', defaultPath: (await dossierProjets()) || os.homedir(), properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// --- Widget Claude (voir claude.js) ---
claude.register({ handle, log, dataDir: app.getPath('userData'), readConfig, readJson, notesPath, donneesPath, listeProjets, run });
// « Toujours autoriser » sur une carte du widget : cette famille d'actions ne demande plus
// (Réglages › Sans me demander la permission, pour décocher).
handle('claude:toujours', async (_event, famille) => {
  if (!['notes', 'calendrier', 'minuteurs', 'projets', 'memoire'].includes(famille)) throw new Error(`Famille d'actions inconnue : ${famille}`);
  const config = await readConfig();
  await writeJson(configPath(), { ...config, claudeSansDemander: { ...config.claudeSansDemander, [famille]: true } });
});
handle('claude:ouvrirDossier', async () => {
  const err = await shell.openPath(await claude.dossier());
  if (err) throw new Error(err);
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

// --- Taille et place de la fenêtre, retrouvées d'une session à l'autre (fenetre.json) ---
// { x, y, width, height, maximized }. x, y, width, height : la fenêtre « normale », même quand elle
// est agrandie (pour qu'un clic sur « Restaurer » la remette à sa taille d'avant).
const fenetrePath = () => path.join(app.getPath('userData'), 'fenetre.json');
const FENETRE_DEFAUT = { width: 1400, height: 860 };

function lireFenetre() {
  let f;
  try {
    f = JSON.parse(fsSync.readFileSync(fenetrePath(), 'utf8'));
  } catch {
    return FENETRE_DEFAUT;
  }
  const nombre = (n) => Number.isFinite(n);
  if (!nombre(f.width) || !nombre(f.height)) return FENETRE_DEFAUT;
  const bounds = { width: Math.max(820, Math.round(f.width)), height: Math.max(520, Math.round(f.height)) };
  // La place n'est reprise que si la fenêtre reste visible sur un écran branché
  // (sinon, après avoir débranché un écran, elle s'ouvrirait hors de vue).
  if (nombre(f.x) && nombre(f.y)) {
    const zone = { x: Math.round(f.x), y: Math.round(f.y), ...bounds };
    const visible = screen.getAllDisplays().some(({ workArea: w }) => {
      const largeur = Math.min(zone.x + zone.width, w.x + w.width) - Math.max(zone.x, w.x);
      const hauteur = Math.min(zone.y + zone.height, w.y + w.height) - Math.max(zone.y, w.y);
      return largeur >= 100 && hauteur >= 40;
    });
    if (visible) Object.assign(bounds, { x: zone.x, y: zone.y });
  }
  return { ...bounds, maximized: Boolean(f.maximized) };
}

function retenirFenetre(win) {
  let minuteur = null;
  const ecrire = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const etat = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    try {
      fsSync.writeFileSync(fenetrePath(), JSON.stringify(etat, null, 2));
    } catch (err) {
      log('ERREUR', `Taille de la fenêtre non enregistrée : ${err.message}`);
    }
  };
  // Pendant un déplacement, on attend la fin du mouvement ; à la fermeture, on écrit tout de suite.
  const bientot = () => { clearTimeout(minuteur); minuteur = setTimeout(ecrire, 500); };
  for (const evenement of ['resize', 'move', 'maximize', 'unmaximize']) win.on(evenement, bientot);
  win.on('close', () => { clearTimeout(minuteur); ecrire(); });
}
// Un minuteur a sonné : l'icône d'Atelier clignote dans la barre des tâches jusqu'à ce que tu y reviennes.
handle('window:attention', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win.isFocused()) win.flashFrame(true);
});

const WINDOW_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

function createWindow(config) {
  const blur = wantsBlur(config);
  const { maximized, ...bounds } = lireFenetre();
  const win = new BrowserWindow({
    ...bounds,
    show: false,
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
  // Agrandie à la dernière fermeture : elle se rouvre agrandie (sur l'écran où elle était).
  if (maximized) win.maximize();
  win.show();
  retenirFenetre(win);
  win.on('focus', () => win.flashFrame(false));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Clic droit dans une zone de texte : le menu (corrections d'orthographe, couper, copier, coller)
  // est dessiné par l'interface, avec le même style que les autres menus d'Atelier.
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    win.webContents.send('menu:edition', {
      x: params.x,
      y: params.y,
      mot: params.misspelledWord,
      suggestions: params.dictionarySuggestions || [],
      selection: Boolean(params.selectionText),
      peutCouper: params.editFlags.canCut,
      peutCopier: params.editFlags.canCopy,
      peutColler: params.editFlags.canPaste,
    });
  });
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
    appliquerOrthographe(config);
    createWindow(config);
    demarrerSurveillance();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => claude.stop());
}
