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

// Un dossier de sortie tout neuf (on remplace l'export précédent, jamais autre chose : on vérifie
// que l'ancien dossier est bien un export de Saga avant de l'effacer).
async function dossierNeuf(dossier, marque) {
  const existe = await fs.stat(dossier).catch(() => null);
  if (existe) {
    const ancien = await fs.readFile(path.join(dossier, marque), 'utf8').catch(() => null);
    if (ancien === null) throw new Error(`Le dossier ${dossier} existe déjà et n'est pas un export de Saga : choisis un autre dossier ou renomme-le`);
    await fs.rm(dossier, { recursive: true, force: true });
  }
  await fs.mkdir(dossier, { recursive: true });
}

// Les fichiers du jeu, tels que Saga les lit : jeu.json, le .tafl, cartes/, donnees/.
async function ecrireJeu(textes, dossier) {
  let data = {};
  try { data = JSON.parse(textes.jeu); } catch { /* lireJeu l'a déjà lu */ }
  const tuiles = /^[\w.-]+\.tafl$/.test(String(data.tuiles || '')) ? data.tuiles : 'tuiles.tafl';
  const fichiers = { 'jeu.json': textes.jeu, ...(textes.tuiles !== null ? { [tuiles]: textes.tuiles } : {}), ...textes.cartes, ...textes.donnees };
  for (const [rel, texte] of Object.entries(fichiers)) {
    await fs.mkdir(path.dirname(path.join(dossier, rel)), { recursive: true });
    await fs.writeFile(path.join(dossier, rel), texte, 'utf8');
  }
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
      const nom = Buffer.from(`${prefixe}/${rel}`, 'utf8');
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

// --- Version web ---
const MARQUE_WEB = 'saga-export-web.txt';

async function exporterWeb({ textes, titre, sortie, moteur, version, configDefaut, progres }) {
  const nom = nomFichier(titre);
  const dossier = path.join(sortie, `${nom}-web`);
  await dossierNeuf(dossier, MARQUE_WEB);
  progres?.('Copie du moteur…');
  // Le moteur : tout renderer/ (sauf ce qui ne sert qu'à Saga : la mise à jour), et les icônes.
  await copier(path.join(moteur, 'renderer'), path.join(dossier, 'saga'), (r) => r !== 'update.js' && r !== 'index.html');
  await copier(path.join(moteur, 'node_modules', '@vscode', 'codicons', 'dist'), path.join(dossier, 'saga', 'codicons'),
    (r) => /^codicon\.(css|ttf)$/.test(r));
  // index.html : celui de Saga, avec <base href="saga/"> (tous ses chemins restent bons), les icônes
  // copiées à côté, et le pont web (saga-web.js) à la place de preload.js d'Electron.
  let html = await fs.readFile(path.join(moteur, 'renderer', 'index.html'), 'utf8');
  html = html
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <base href="saga/">')
    .replace('../node_modules/@vscode/codicons/dist/codicon.css', 'codicons/codicon.css')
    .replace(/<title>[^<]*<\/title>/, `<title>${titre.replace(/[<>&]/g, '')}</title>`)
    .replace('<body class="glass">', '<body class="glass joueur web">')
    .replace(/\s*<script src="update\.js"><\/script>/, '')
    .replace('<script src="base.js"></script>', '<script src="../jeu.js"></script>\n  <script src="saga-web.js"></script>\n  <script src="base.js"></script>');
  await fs.writeFile(path.join(dossier, 'index.html'), html, 'utf8');
  await fs.writeFile(path.join(dossier, 'saga', 'saga-web.js'), await fs.readFile(path.join(moteur, 'web', 'saga-web.js')));
  // Le jeu : les textes que lit le moteur, sans le chemin du dossier de Ragna.
  const jeu = { titre, cle: nom.toLowerCase(), saga: version, config: configDefaut, textes: { ...textes, dossier: nom } };
  await fs.writeFile(path.join(dossier, 'jeu.js'), `// ${titre} : le jeu, exporté par Saga ${version}.\nwindow.SAGA_JEU = ${JSON.stringify(jeu)};\n`, 'utf8');
  await fs.writeFile(path.join(dossier, MARQUE_WEB), [
    `${titre} : version web exportée par Saga ${version}.`,
    '',
    'Pour jouer : ouvre index.html dans un navigateur (Chrome, Edge, Firefox). Pas besoin d\'Internet.',
    'Pour le mettre en ligne : envoie le .zip sur itch.io (« HTML », jouable dans le navigateur),',
    'ou copie ce dossier sur un serveur web.',
    'Les sauvegardes restent dans le navigateur de chaque joueur.',
    '',
  ].join('\r\n'), 'utf8');
  progres?.('Compression du .zip…');
  const zip = path.join(sortie, `${nom}-web.zip`);
  await zipper(dossier, zip, `${nom}-web`);
  return { dossier, zip, index: path.join(dossier, 'index.html') };
}

// --- Version Windows (.exe) ---
const MARQUE_EXE = 'LISEZMOI.txt';
// Ce qu'on prend de l'application Saga pour en faire celle du jeu.
const FICHIERS_APP = ['main.js', 'preload.js', 'exporter.js', 'renderer', 'commun', 'build/icon.ico', 'build/icon.png',
  'node_modules/@vscode/codicons/dist/codicon.css', 'node_modules/@vscode/codicons/dist/codicon.ttf'];

async function exporterExe({ textes, titre, sortie, moteur, version, runtime, exe, progres }) {
  const nom = nomFichier(titre);
  const dossier = path.join(sortie, nom);
  await dossierNeuf(dossier, MARQUE_EXE);
  // 1. Electron (le dossier de Saga.exe), sans l'application de Saga, sa désinstallation ni sa mise à jour.
  progres?.('Copie de Saga…');
  const sans = /^(Uninstall .*|resources\/(app\.asar(\.unpacked)?|app|jeu|app-update\.yml|default_app\.asar))$/i;
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
    await copier(path.join(moteur, '..', 'commun'), path.join(app, 'commun'), (r) => r === 'github.js');
  }
  const pkg = JSON.parse(await fs.readFile(path.join(moteur, 'package.json'), 'utf8'));
  await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({
    name: nom.toLowerCase(), productName: titre, version: pkg.version || version, main: 'main.js', private: true,
  }, null, 2), 'utf8');
  // 3. Le jeu, et ce qu'il faut à main.js pour passer en mode joueur.
  progres?.('Ajout du jeu…');
  const jeu = path.join(dossier, 'resources', 'jeu');
  await ecrireJeu(textes, jeu);
  await fs.writeFile(path.join(jeu, 'export.json'), JSON.stringify({ titre, cle: nom, saga: version }, null, 2), 'utf8');
  await fs.writeFile(path.join(dossier, MARQUE_EXE), [
    `${titre} : exporté par Saga ${version}.`,
    '',
    `Pour jouer : double-clique sur ${nom}${ext}. Rien à installer.`,
    'Windows peut dire « Windows a protégé votre ordinateur » (le jeu n\'est pas signé) :',
    'clique sur « Informations complémentaires » puis « Exécuter quand même ».',
    '',
    `Les sauvegardes sont dans %APPDATA%\\${nom}.`,
    '',
  ].join('\r\n'), 'utf8');
  progres?.('Compression du .zip (ça peut prendre une minute)…');
  const zip = path.join(sortie, `${nom}-${process.platform === 'win32' ? 'windows' : process.platform}.zip`);
  await zipper(dossier, zip, nom);
  return { dossier, zip, exe: path.join(dossier, `${nom}${ext}`) };
}

module.exports = { exporterWeb, exporterExe, nomFichier, zipper };
