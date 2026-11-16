#!/usr/bin/env node
// Fabrique le PDF du mode d'emploi à partir de manuel.html (Chromium, comme les essais).
//   node docs/manuel/generer.js              le PDF seul (avec les captures déjà là)
//   node docs/manuel/generer.js --captures   refait d'abord toutes les captures (captures.js) ; sans captures, il le fait seul
// Sortie : docs/manuel/mode-emploi-tafl-saga.pdf. Prévient si une page déborde.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RACINE, 'tests', 'lib', 'tafl.js'));
const SORTIE = path.join(__dirname, 'mode-emploi-tafl-saga.pdf');

async function main() {
  const sansCaptures = !fs.existsSync(path.join(__dirname, 'captures')) || !fs.readdirSync(path.join(__dirname, 'captures')).length;
  if (sansCaptures || process.argv.includes('--captures')) execFileSync(process.execPath, [path.join(__dirname, 'captures.js')], { stdio: 'inherit' });
  const version = (dossier) => JSON.parse(fs.readFileSync(path.join(RACINE, dossier, 'package.json'), 'utf8')).version;
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const infos = { tafl: version('tuiles'), saga: version('moteur'), date };

  const navigateur = await chromium.launch();
  const page = await navigateur.newPage();
  await page.addInitScript((i) => { window.MANUEL = i; }, infos);
  await page.goto(`file://${path.join(__dirname, 'manuel.html')}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  const trop = await page.evaluate(() => window.debordements());
  for (const t of trop) console.log(`  ! page ${t.i} (${t.titre}) déborde de ${t.trop} px`);
  await page.pdf({ path: SORTIE, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const n = await page.evaluate(() => document.querySelectorAll('.page').length);
  await navigateur.close();
  console.log(`${path.relative(RACINE, SORTIE)} : ${n} pages, ${(fs.statSync(SORTIE).size / 1e6).toFixed(1)} Mo (Tafl ${infos.tafl}, Saga ${infos.saga})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
