#!/usr/bin/env node
// Les essais automatiques de Tafl et Saga : node tests/lancer.js [mot] (seulement les essais dont le
// nom contient ce mot). Chaque essai ouvre Tafl ou Saga dans un Chromium sans fenêtre, fait ce
// qu'un joueur ferait, et vérifie le résultat. Une capture d'écran est gardée dans tests/resultats/
// pour chaque essai raté. Voir tests/README.md.
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const RESULTATS = path.join(__dirname, 'resultats');
const filtre = process.argv[2] || '';

async function main() {
  const fichiers = (await fs.readdir(path.join(__dirname, 'essais'))).filter((f) => f.endsWith('.js')).sort();
  const essais = fichiers.flatMap((f) => require(path.join(__dirname, 'essais', f)).map((e) => ({ ...e, fichier: f })))
    .filter((e) => e.nom.includes(filtre));
  await fs.mkdir(RESULTATS, { recursive: true });
  const navigateur = await chromium.launch();
  const rates = [];
  const debut = Date.now();
  for (const e of essais) {
    const t0 = Date.now();
    const ctx = { navigateur, pages: [], partage: essais.partage || (essais.partage = {}) };
    try {
      // Un essai bloqué (une fenêtre qui attend une réponse, un jeu qui ne finit pas) rate au bout de 2 min.
      let minuteur;
      await Promise.race([e.faire(ctx), new Promise((_, non) => { minuteur = setTimeout(() => non(new Error('plus de 2 minutes : bloqué')), e.duree || 120000); })])
        .finally(() => clearTimeout(minuteur));
      console.log(`  ✓ ${e.nom} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (err) {
      rates.push(e.nom);
      console.log(`  ✗ ${e.nom}\n      ${String(err?.message || err).split('\n').join('\n      ')}`);
      const page = ctx.pages.at(-1);
      if (page && !page.isClosed()) {
        const nom = e.nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        await page.screenshot({ path: path.join(RESULTATS, `${nom}.png`) }).catch(() => {});
      }
    } finally {
      for (const p of ctx.pages) await p.context().close().catch(() => {});
    }
  }
  await navigateur.close();
  const duree = ((Date.now() - debut) / 1000).toFixed(0);
  if (rates.length) {
    console.log(`\n${rates.length} essai(s) raté(s) sur ${essais.length} (${duree} s) : ${rates.join(', ')}`);
    process.exit(1);
  }
  console.log(`\n${essais.length} essai(s) réussi(s) (${duree} s).`);
}
main().catch((err) => { console.error(err); process.exit(1); });
