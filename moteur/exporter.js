// Exporter un jeu (Saga 0.9) : en faire quelque chose qu'on envoie à des testeurs, sans Tafl ni Saga.
//
// - Version web : un dossier « MonJeu-web » avec index.html, le moteur (renderer/) et le jeu emballé
//   dans jeu.js. On double-clique sur index.html (ça marche même hors ligne), ou on envoie le .zip sur
//   itch.io ou un serveur. Les sauvegardes restent dans le navigateur du joueur (localStorage).
// - Version Windows : un dossier « MonJeu » avec MonJeu.exe : une copie de Saga (son Electron) dont
//   l'application (resources/app) est Saga lui-même, et le jeu rangé dans resources/jeu. Au lancement,
//   main.js voit resources/jeu et passe en « mode joueur » (le jeu direct, sans menus de Saga).
//
// Les deux partent des textes que lit Saga (main.js › lireJeu) : on n'emporte que ce que le moteur lit,
// donc ni le .tafl de travail, ni les sauvegardes, ni le chemin du dossier sur le disque de Ragna.

const path = require('node:path');
const fs = require('node:fs/promises');
const zlib = require('node:zlib');
// Dans Electron, fs voit les .asar comme des dossiers : pour copier Electron lui-même, on prend le fs
// « original ». Hors d'Electron (tests avec node), c'est le fs normal.
const ofs = (() => { try { return require('original-fs').promises; } catch { return fs; } })();

// « Le Trésor d'Écume ! » → « Le-Tresor-d-Ecume » : un nom de fichier sûr sous Windows.
function nomFichier(titre) {
  const nom = String(titre || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return nom || 'MonJeu';
}

// Tous les fichiers d'un dossier (chemins relatifs, avec /), en sautant ce que `garder` refuse.
async function lister(dossier, garder = () => true, sys = fs, rel = '') {
  const out = [];
  for (const e of await sys.readdir(path.join(dossier, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (!garder(r)) continue;
    if (e.isDirectory()) out.push(...await lister(dossier, garder, sys, r));
    else out.push(r);
  }
  return out;
}

async function copier(source, cible, garder, sys = fs) {
  const fichiers = await lister(source, garder, sys);
  for (const r of fichiers) {
    const de = path.join(source, r), vers = path.join(cible, r);
    await fs.mkdir(path.dirname(vers), { recursive: true });
    if (sys === fs) await fs.writeFile(vers, await fs.readFile(de)); // lit aussi dans app.asar
    else {
      await ofs.copyFile(de, vers);
      await ofs.chmod(vers, (await ofs.stat(de)).mode);
    }
  }
  return fichiers.length;
}

// Les fichiers du jeu, tels que Saga les lit : jeu.json, le .tafl, cartes/, donnees/.
// Un fichier commun (commun/copier.js le met dans moteur/commun/ ; depuis le clone sans npm install,
// on le prend dans atelier/commun/).
async function lireCommun(moteur, nom) {
  return fs.readFile(path.join(moteur, 'commun', nom)).catch(() => fs.readFile(path.join(moteur, '..', 'commun', nom)));
}

async function ecrireJeu(textes, dossier) {
  let data = {};
  try { data = JSON.parse(textes.jeu); } catch { /* lireJeu l'a déjà lu */ }
  const tuiles = /^[\w.-]+\.tafl$/.test(String(data.tuiles || '')) ? data.tuiles : 'tuiles.tafl';
  const fichiers = { 'jeu.json': textes.jeu, ...(textes.tuiles !== null ? { [tuiles]: textes.tuiles } : {}), ...textes.cartes, ...textes.donnees, ...(textes.scripts || {}) };
  for (const [rel, texte] of Object.entries(fichiers)) {
    await fs.mkdir(path.dirname(path.join(dossier, rel)), { recursive: true });
    await fs.writeFile(path.join(dossier, rel), texte, 'utf8');
  }
}

// Les sons du jeu (Saga 0.11) : les fichiers du dossier sons/ (musiques, bruitages, fonds sonores).
const SON = /\.(ogg|oga|mp3|wav|m4a|aac|opus|flac|webm)$/i;
async function lireSons(dossierJeu) {
  if (!dossierJeu) return [];
  const noms = await fs.readdir(path.join(dossierJeu, 'sons')).catch(() => []);
  const out = [];
  for (const n of noms.filter((x) => SON.test(x))) out.push({ rel: `sons/${n}`, data: await fs.readFile(path.join(dossierJeu, 'sons', n)) });
  return out;
}

// --- Zip (sans dépendance) : chaque fichier compressé avec zlib, écrit au fil de l'eau ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = zlib.crc32 || ((buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; });

async function zipper(dossier, zip, prefixe, progres) {
  const fichiers = await lister(dossier, () => true, ofs);
  const fh = await ofs.open(zip, 'w');
  const central = [];
  let pos = 0;
  const ecrire = async (buf) => { await fh.write(buf); pos += buf.length; };
  try {
    for (const [i, rel] of fichiers.entries()) {
      const full = path.join(dossier, rel);
      const [data, stat] = await Promise.all([ofs.readFile(full), ofs.stat(full)]);
      const comp = zlib.deflateRawSync(data, { level: 6 });
      const stocke = comp.length >= data.length; // déjà compressé (images, .pak) : on le range tel quel
      const corps = stocke ? data : comp;
      const nom = Buffer.from(prefixe ? `${prefixe}/${rel}` : rel, 'utf8');
      const crc = crc32(data) >>> 0;
      const d = stat.mtime;
      const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      const jour = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(stocke ? 0 : 8, 8); local.writeUInt16LE(heure, 10); local.writeUInt16LE(jour, 12);
      local.writeUInt32LE(crc, 14); local.writeUInt32LE(corps.length, 18); local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nom.length, 26); local.writeUInt16LE(0, 28);
      const debut = pos;
      await ecrire(local); await ecrire(nom); await ecrire(corps);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE((3 << 8) | 20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(stocke ? 0 : 8, 10); c.writeUInt16LE(heure, 12); c.writeUInt16LE(jour, 14);
      c.writeUInt32LE(crc, 16); c.writeUInt32LE(corps.length, 20); c.writeUInt32LE(data.length, 24);
      c.writeUInt16LE(nom.length, 28); c.writeUInt32LE(((stat.mode & 0xffff) << 16) >>> 0, 38); c.writeUInt32LE(debut, 42);
      central.push(c, nom);
      progres?.((i + 1) / fichiers.length);
    }
    const debutCentral = pos;
    for (const b of central) await ecrire(b);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10);
    fin.writeUInt32LE(pos - debutCentral, 12); fin.writeUInt32LE(debutCentral, 16);
    await ecrire(fin);
  } finally {
    await fh.close();
  }
}

// --- Version web (Saga 1.23 : un seul fichier) ---
// Tout le jeu tient dans « MonJeu.html » : le moteur, les styles, les polices et les images en data:,
// le jeu (window.SAGA_JEU) et les sons (window.SAGA_SONS, en base64). Un double-clic suffit, même hors
// ligne. Pour itch.io, qui demande un .zip avec un index.html, on peut ajouter « MonJeu-itch.zip ».

// Un texte placé dans <script> : « </script » le fermerait trop tôt.
const dansScript = (texte) => String(texte).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
// Un objet en JSON, sûr dans <script> (< n'apparaît que dans les chaînes, où < vaut <).
const jsonScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const dataUrl = (type, buf) => `data:${type};base64,${Buffer.from(buf).toString('base64')}`;

async function htmlUnique({ textes, titre, nom, moteur, version, configDefaut, dossierJeu, progres }) {
  const renderer = path.join(moteur, 'renderer');
  let html = await fs.readFile(path.join(renderer, 'index.html'), 'utf8');
  // Un fichier de renderer/ (ou de ../commun/, ou des codicons) d'après son chemin dans index.html.
  const lireRel = (rel) => {
    if (rel.startsWith('../commun/')) return lireCommun(moteur, rel.slice('../commun/'.length));
    return fs.readFile(path.join(renderer, rel));
  };
  // Les styles, avec leurs polices en data: (codicon.ttf, Jersey 10).
  const styles = [];
  for (const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)) {
    const rel = m[1];
    let css = rel.includes('codicons')
      ? await fs.readFile(path.join(moteur, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'), 'utf8')
      : (await lireRel(rel)).toString('utf8');
    const dossierCss = rel.includes('codicons') ? path.join(moteur, 'node_modules', '@vscode', 'codicons', 'dist') : path.join(renderer, path.dirname(rel));
    const urls = [...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((u) => u[2]).filter((u) => !/^(data:|https?:)/.test(u));
    for (const u of new Set(urls)) {
      const f = path.join(dossierCss, u.replace(/[?#].*$/, ''));
      const ext = path.extname(f).slice(1).toLowerCase();
      const type = { ttf: 'font/ttf', woff2: 'font/woff2', woff: 'font/woff', svg: 'image/svg+xml', png: 'image/png' }[ext] || 'application/octet-stream';
      const data = await fs.readFile(f).catch(() => null);
      if (data) css = css.split(u).join(dataUrl(type, data));
    }
    styles.push(css);
  }
  html = html.replace(/\s*<link rel="stylesheet" href="[^"]+">/g, '');
  html = html.replace('</head>', `  <style>\n${styles.join('\n').replace(/<\/(style)/gi, '<\\/$1')}\n  </style>\n</head>`);
  // Les images de l'interface (le logo saga.svg).
  for (const m of new Set([...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((x) => x[1]))) {
    if (/^data:/.test(m)) continue;
    const data = await lireRel(m).catch(() => null);
    if (data) html = html.split(`src="${m}"`).join(`src="${dataUrl(m.endsWith('.svg') ? 'image/svg+xml' : 'image/png', data)}"`);
  }
  // Le jeu, les sons et le pont web, avant base.js.
  progres?.('Ajout des sons…');
  const sons = await lireSons(dossierJeu);
  const jeu = { titre, cle: nom.toLowerCase(), saga: version, config: configDefaut, textes: { ...textes, dossier: nom } };
  const SONS = Object.fromEntries(sons.map((x) => [x.rel, x.data.toString('base64')]));
  const avant = [
    `<script>\n// ${titre.replace(/[\r\n]/g, ' ')} : le jeu, exporté par Saga ${version}.\nwindow.SAGA_JEU = ${jsonScript(jeu)};\nwindow.SAGA_SONS = ${jsonScript(SONS)};\n</script>`,
    `<script>\n${dansScript(await fs.readFile(path.join(moteur, 'web', 'saga-web.js'), 'utf8'))}\n</script>`,
  ].join('\n  ');
  // Les scripts de Saga, mis dans la page à leur place (sauf la mise à jour, qui ne sert qu'à Saga).
  html = html.replace(/\s*<script src="update\.js"><\/script>/, '');
  progres?.('Assemblage du moteur…');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((x) => x[1]);
  const contenus = {};
  for (const rel of scripts) contenus[rel] = (await lireRel(rel)).toString('utf8');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (tout, rel) => `${rel === 'base.js' ? `${avant}\n  ` : ''}<script>\n// --- ${rel} ---\n${dansScript(contenus[rel])}\n</script>`);
  // Une seule page, sans fichiers à côté : les scripts sont dans la page (rien ne vient d'Internet).
  html = html
    .replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/, `<meta http-equiv="Content-Security-Policy"\n        content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src data: blob:; connect-src data: blob:; worker-src blob:">`)
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">')
    .replace(/<title>[^<]*<\/title>/, `<title>${titre.replace(/[<>&]/g, '')}</title>`)
    .replace('<body class="glass">', '<body class="glass joueur web">');
  return html;
}

async function exporterWeb({ textes, titre, sortie, moteur, version, configDefaut, progres, dossierJeu, itch = false }) {
  const nom = nomFichier(titre);
  // L'export d'avant Saga 1.23 (un dossier « MonJeu-web » et son .zip) : on le range, s'il est bien de Saga.
  await nettoyerAncien(path.join(sortie, `${nom}-web`), MARQUE_WEB, path.join(sortie, `${nom}-web.zip`));
  progres?.('Copie du moteur…');
  const html = await htmlUnique({ textes, titre, nom, moteur, version, configDefaut, dossierJeu, progres });
  const fichier = path.join(sortie, `${nom}.html`);
  await fs.writeFile(fichier, html, 'utf8');
  const r = { fichier, index: fichier, zip: fichier };
  if (itch) {
    // itch.io : un .zip avec index.html dedans (le même fichier).
    progres?.('Compression du .zip pour itch.io…');
    const tmp = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'saga-itch-'));
    try {
      await fs.writeFile(path.join(tmp, 'index.html'), html, 'utf8');
      r.itch = path.join(sortie, `${nom}-itch.zip`);
      await zipper(tmp, r.itch, '');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
  return r;
}

// Range l'export d'avant (un dossier marqué par Saga + son .zip). On n'efface jamais un dossier qui
// n'a pas la marque de Saga.
async function nettoyerAncien(dossier, marque, zip) {
  const existe = await fs.stat(dossier).catch(() => null);
  if (!existe) return;
  const ancien = await fs.readFile(path.join(dossier, marque), 'utf8').catch(() => null);
  if (ancien === null) return;
  await fs.rm(dossier, { recursive: true, force: true });
  if (zip) await fs.rm(zip, { force: true });
}
const MARQUE_WEB = 'saga-export-web.txt';

// --- Version Windows (Saga 1.23 : un installateur « MonJeu-Setup.exe ») ---
// Un jeu Electron, c'est une centaine de fichiers (DLL, langues…). Au lieu de les montrer, on les range
// dans un installateur fait avec NSIS (le même outil que celui de Saga, emporté dans resources/nsis) :
// un seul fichier à envoyer. Le joueur l'ouvre, le jeu s'installe pour lui seul (sans droits
// d'administrateur) dans %LOCALAPPDATA%\Programs\MonJeu, avec un raccourci sur le Bureau et dans le menu
// Démarrer, et se désinstalle depuis les Paramètres de Windows (les sauvegardes restent).
//
// Le contenu installé ne change pas : une copie de Saga (son Electron) dont l'application
// (resources/app) est Saga lui-même, et le jeu rangé dans resources/jeu. Au lancement, main.js voit
// resources/jeu et passe en « mode joueur » (le jeu direct, sans menus de Saga).
const MARQUE_EXE = 'LISEZMOI.txt';
// Ce qu'on prend de l'application Saga pour en faire celle du jeu.
const FICHIERS_APP = ['main.js', 'preload.js', 'exporter.js', 'reseau.js', 'internet.js', 'web/saga-reseau.js', 'renderer', 'commun', 'build/icon.ico', 'build/icon.png',
  'node_modules/@vscode/codicons/dist/codicon.css', 'node_modules/@vscode/codicons/dist/codicon.ttf'];

// Le jeu prêt à lancer, dans `dossier` (Electron + resources/app + resources/jeu).
async function preparerJeuWindows({ textes, titre, nom, dossier, moteur, version, runtime, exe, progres, dossierJeu }) {
  // 1. Electron (le dossier de Saga.exe), sans l'application de Saga, sa désinstallation ni sa mise à jour.
  progres?.('Copie de Saga…');
  const sans = /^(Uninstall .*|resources\/(app\.asar(\.unpacked)?|app|jeu|nsis|app-update\.yml|default_app\.asar))$/i;
  await copier(runtime, dossier, (r) => !sans.test(r), ofs);
  const ext = path.extname(exe);
  await ofs.rename(path.join(dossier, exe), path.join(dossier, `${nom}${ext}`));
  // 2. L'application : Saga lui-même (lu dans app.asar s'il est installé, dans moteur/ depuis le clone).
  const app = path.join(dossier, 'resources', 'app');
  for (const f of FICHIERS_APP) {
    const de = path.join(moteur, f);
    const st = await fs.stat(de).catch(() => null);
    if (!st) continue;
    if (st.isDirectory()) await copier(de, path.join(app, f));
    else {
      await fs.mkdir(path.dirname(path.join(app, f)), { recursive: true });
      await fs.writeFile(path.join(app, f), await fs.readFile(de));
    }
  }
  // commun/ manque dans le clone si npm install n'a pas tourné : on prend celui d'atelier/.
  if (!(await fs.stat(path.join(app, 'commun')).catch(() => null))) {
    await copier(path.join(moteur, '..', 'commun'), path.join(app, 'commun'), (r) => ['github.js', 'bac-a-sable.js', 'modules.js', 'fiche-perso.js'].includes(r));
  }
  const pkg = JSON.parse(await fs.readFile(path.join(moteur, 'package.json'), 'utf8'));
  await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({
    name: nom.toLowerCase(), productName: titre, version: pkg.version || version, main: 'main.js', private: true,
  }, null, 2), 'utf8');
  // 3. Le jeu, et ce qu'il faut à main.js pour passer en mode joueur.
  progres?.('Ajout du jeu…');
  const jeu = path.join(dossier, 'resources', 'jeu');
  await ecrireJeu(textes, jeu);
  // Les sons (Saga 0.11) : le dossier sons/ du jeu, tel quel.
  for (const x of await lireSons(dossierJeu)) {
    await fs.mkdir(path.join(jeu, 'sons'), { recursive: true });
    await fs.writeFile(path.join(jeu, x.rel), x.data);
  }
  await fs.writeFile(path.join(jeu, 'export.json'), JSON.stringify({ titre, cle: nom, saga: version }, null, 2), 'utf8');
  return `${nom}${ext}`;
}

// makensis : emporté par Saga installé (resources/nsis), préparé dans moteur/nsis depuis le clone
// (node build/preparer-nsis.js), ou donné par SAGA_MAKENSIS (essais hors Windows).
async function trouverNsis(moteur) {
  const dossiers = [process.resourcesPath && path.join(process.resourcesPath, 'nsis'), path.join(moteur, 'nsis')].filter(Boolean);
  if (process.env.SAGA_MAKENSIS) return { exe: process.env.SAGA_MAKENSIS, dossier: process.env.SAGA_NSISDIR || path.dirname(path.dirname(process.env.SAGA_MAKENSIS)) };
  for (const d of dossiers) {
    const exe = path.join(d, 'Bin', 'makensis.exe');
    if (await ofs.stat(exe).catch(() => null)) return { exe, dossier: d };
  }
  return null;
}

// Un texte entre guillemets dans un script NSIS : $ et " s'échappent, pas de retour à la ligne.
const nsisTexte = (t) => String(t).replace(/[\r\n\t]+/g, ' ').replace(/\$/g, '$$$$').replace(/"/g, '$\\"');

function scriptNsis({ titre, nom, exeJeu, version, source, icone, sortie }) {
  const T = nsisTexte(titre);
  // Le nom des raccourcis : le titre, sans les caractères interdits dans un nom de fichier Windows.
  const L = nsisTexte(String(titre).replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/[. ]+$/, '').trim() || nom);
  const cle = `SagaJeu-${nom}`;
  return [
    'Unicode true',
    'ManifestDPIAware true',
    'RequestExecutionLevel user',
    'SetCompressor /SOLID lzma',
    '!include "MUI2.nsh"',
    `Name "${T}"`,
    `OutFile "${nsisTexte(sortie)}"`,
    // Toujours ce dossier-là : la désinstallation peut alors l'effacer en entier sans risque.
    `InstallDir "$LOCALAPPDATA\\Programs\\${nom}"`,
    `BrandingText "${T} · fait avec Saga ${nsisTexte(version)}"`,
    ...(icone ? [`!define MUI_ICON "${nsisTexte(icone)}"`, `!define MUI_UNICON "${nsisTexte(icone)}"`] : []),
    '!define MUI_ABORTWARNING',
    `!define MUI_WELCOMEPAGE_TEXT "Ce programme va installer ${T} sur ton ordinateur.$\\r$\\n$\\r$\\nIl n'y a rien d'autre à installer. Clique sur Suivant pour l'installer."`,
    `!define MUI_FINISHPAGE_RUN "$INSTDIR\\${exeJeu}"`,
    `!define MUI_FINISHPAGE_RUN_TEXT "Lancer ${T}"`,
    '!insertmacro MUI_PAGE_WELCOME',
    '!insertmacro MUI_PAGE_INSTFILES',
    '!insertmacro MUI_PAGE_FINISH',
    '!insertmacro MUI_UNPAGE_CONFIRM',
    '!insertmacro MUI_UNPAGE_INSTFILES',
    '!insertmacro MUI_LANGUAGE "French"',
    '',
    'Section "Jeu"',
    // Une installation précédente : on la remplace (pas de vieux fichiers qui traînent).
    '  RMDir /r "$INSTDIR"',
    '  SetOutPath "$INSTDIR"',
    `  File /r "${nsisTexte(source)}\\*.*"`,
    '  WriteUninstaller "$INSTDIR\\Desinstaller.exe"',
    `  CreateShortcut "$DESKTOP\\${L}.lnk" "$INSTDIR\\${exeJeu}"`,
    `  CreateShortcut "$SMPROGRAMS\\${L}.lnk" "$INSTDIR\\${exeJeu}"`,
    `  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${cle}" "DisplayName" "${T}"`,
    `  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${cle}" "UninstallString" "$\\"$INSTDIR\\Desinstaller.exe$\\""`,
    `  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${cle}" "DisplayIcon" "$INSTDIR\\${exeJeu}"`,
    `  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${cle}" "InstallLocation" "$INSTDIR"`,
    `  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${cle}" "Publisher" "Fait avec Saga"`,
    `  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${cle}" "NoModify" 1`,
    `  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${cle}" "NoRepair" 1`,
    'SectionEnd',
    '',
    // Les sauvegardes (%APPDATA%\MonJeu) restent : on peut réinstaller et reprendre sa partie.
    'Section "Uninstall"',
    `  Delete "$DESKTOP\\${L}.lnk"`,
    `  Delete "$SMPROGRAMS\\${L}.lnk"`,
    '  RMDir /r "$INSTDIR"',
    `  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${cle}"`,
    'SectionEnd',
    '',
  ].join('\r\n');
}

function lancer(exe, args, env) {
  const { spawn } = require('node:child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { env: { ...process.env, ...env }, windowsHide: true });
    let sortie = '';
    const garder = (d) => { sortie = (sortie + d).slice(-4000); };
    child.stdout.on('data', garder); child.stderr.on('data', garder);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(sortie) : reject(new Error(`NSIS a échoué (code ${code}) :\n${sortie.trim().split('\n').slice(-6).join('\n')}`))));
  });
}

async function exporterExe({ textes, titre, sortie, moteur, version, runtime, exe, progres, dossierJeu, installateur = process.platform === 'win32' }) {
  const nom = nomFichier(titre);
  // L'export d'avant Saga 1.23 (un dossier « MonJeu » et son .zip) : on le range, s'il est bien de Saga.
  await nettoyerAncien(path.join(sortie, nom), MARQUE_EXE, path.join(sortie, `${nom}-windows.zip`));
  const tmp = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'saga-export-'));
  try {
    const dossier = path.join(tmp, nom);
    await fs.mkdir(dossier, { recursive: true });
    const exeJeu = await preparerJeuWindows({ textes, titre, nom, dossier, moteur, version, runtime, exe, progres, dossierJeu });
    if (!installateur) {
      // Hors Windows (essais) : un .zip du jeu prêt à lancer.
      progres?.('Compression du .zip…');
      const zip = path.join(sortie, `${nom}-${process.platform}.zip`);
      await zipper(dossier, zip, nom);
      return { fichier: zip, zip };
    }
    const nsis = await trouverNsis(moteur);
    if (!nsis) throw new Error('L\'outil qui fabrique l\'installateur (NSIS) manque : mets Saga à jour depuis Atelier');
    // L'icône : celle de Saga (lue dans app.asar, donc recopiée à côté pour NSIS).
    const icone = path.join(tmp, 'icone.ico');
    const ico = await fs.readFile(path.join(moteur, 'build', 'icon.ico')).catch(() => null);
    if (ico) await fs.writeFile(icone, ico);
    const setup = path.join(sortie, `${nom}-Setup.exe`);
    const nsi = path.join(tmp, 'jeu.nsi');
    await fs.writeFile(nsi, '﻿' + scriptNsis({ titre, nom, exeJeu, version, source: dossier, icone: ico ? icone : null, sortie: setup }), 'utf8');
    progres?.('Fabrication de l\'installateur (ça peut prendre une ou deux minutes)…');
    await lancer(nsis.exe, ['-V2', '-INPUTCHARSET', 'UTF8', nsi], { NSISDIR: nsis.dossier });
    return { fichier: setup, zip: setup, exe: setup };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { exporterWeb, exporterExe, nomFichier, zipper, scriptNsis };
