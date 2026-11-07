// Prépare moteur/nsis/ : NSIS, l'outil qui fabrique les installateurs Windows (Saga 1.23).
// Saga l'emporte (resources/nsis) pour faire « MonJeu-Setup.exe » quand on exporte un jeu (voir
// exporter.js). On prend le même NSIS qu'electron-builder (il le télécharge et vérifie son empreinte),
// et on n'en garde que ce qu'il faut sous Windows.
//   node build/preparer-nsis.js        (la CI le lance avant electron-builder)
const path = require('node:path');
const fs = require('node:fs');
const { getBinFromUrl } = require('app-builder-lib/out/binDownload');

(async () => {
  const source = await getBinFromUrl('nsis-3.0.4.1', 'nsis-3.0.4.1.7z', '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa');
  const cible = path.join(__dirname, '..', 'nsis');
  fs.rmSync(cible, { recursive: true, force: true });
  const garder = ['Bin', 'Stubs', 'Include', 'Plugins', 'Contrib/Language files', 'Contrib/Modern UI 2', 'Contrib/Graphics', 'Contrib/UIs', 'nsisconf.nsh', 'COPYING'];
  for (const rel of garder) {
    const de = path.join(source, rel);
    if (!fs.existsSync(de)) throw new Error(`NSIS : ${rel} manque dans ${source}`);
    fs.cpSync(de, path.join(cible, rel), { recursive: true });
  }
  if (!fs.existsSync(path.join(cible, 'Bin', 'makensis.exe'))) throw new Error('NSIS : Bin/makensis.exe manque');
  console.log(`NSIS prêt dans ${cible}`);
})().catch((e) => { console.error(e); process.exit(1); });
