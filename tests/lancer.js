#!/usr/bin/env node
// Les essais automatiques de Tafl et Saga : node tests/lancer.js [mot] (seulement les essais dont le
// nom contient ce mot). Chaque essai ouvre Tafl ou Saga dans un Chromium sans fenêtre, fait ce
// qu'un joueur ferait, et vérifie le résultat. Une capture d'écran est gardée dans tests/resultats/
// pour chaque essai raté. Voir tests/README.md.
//
// Pour aller plus vite, les fichiers d'essais se répartissent en parts :
//   --partie 2/4    ne lance que la 2e part sur 4 (GitHub lance les 4 parts sur 4 machines à la fois) ;
//   --parallele 3   lance 3 parts en même temps sur ce PC (chacune son Chromium) et dit le total.
// Les essais d'un même fichier restent ensemble et dans l'ordre. Les parts s'équilibrent avec les
// durées notées dans durees.json (--noter-durees les réécrit après un passage complet réussi).
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RESULTATS = path.join(__dirname, 'resultats');
const DUREES = path.join(__dirname, 'durees.json');

function lireArguments(argv) {
  const o = { filtre: '', partie: null, parallele: 1, noter: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valeur = () => (a.includes('=') ? a.split('=')[1] : argv[++i]);
    if (a.startsWith('--partie')) {
      const [k, n] = String(valeur()).split('/').map(Number);
      if (!(n >= 1 && k >= 1 && k <= n)) throw new Error(`--partie attend k/n (par exemple 2/4), pas « ${a} »`);
      o.partie = { k, n };
    } else if (a.startsWith('--parallele')) {
      o.parallele = Math.max(1, Number(valeur()) || 1);
    } else if (a === '--noter-durees') o.noter = true;
    else o.filtre = a;
  }
  return o;
}

async function lireDurees() {
  try { return JSON.parse(await fs.readFile(DUREES, 'utf8')); } catch { return {}; }
}

// Les fichiers d'essais répartis en n parts de durées proches : le plus long d'abord, dans la part la
// moins chargée. Un fichier sans durée connue compte pour 20 s. Chaque part garde l'ordre des noms.
function repartir(fichiers, n, durees) {
  const parts = Array.from({ length: n }, () => ({ total: 0, fichiers: [] }));
  const tries = [...fichiers].sort((a, b) => (durees[b] ?? 20) - (durees[a] ?? 20) || a.localeCompare(b));
  for (const f of tries) {
    const p = parts.reduce((m, x) => (x.total < m.total ? x : m));
    p.total += durees[f] ?? 20;
    p.fichiers.push(f);
  }
  return parts.map((p) => p.fichiers.sort());
}

async function tousLesFichiers() {
  return (await fs.readdir(path.join(__dirname, 'essais'))).filter((f) => f.endsWith('.js')).sort();
}

// Une part (ou tout) dans ce processus, avec un seul Chromium, un essai après l'autre.
async function lancer({ filtre, partie, noter }) {
  const { chromium } = require('playwright');
  let fichiers = await tousLesFichiers();
  if (partie) fichiers = repartir(fichiers, partie.n, await lireDurees())[partie.k - 1];
  const essais = fichiers.flatMap((f) => require(path.join(__dirname, 'essais', f)).map((e) => ({ ...e, fichier: f })))
    .filter((e) => e.nom.includes(filtre));
  await fs.mkdir(RESULTATS, { recursive: true });
  const navigateur = await chromium.launch();
  const rates = [];
  const parFichier = {};
  const partage = {};
  const debut = Date.now();
  if (partie) console.log(`  (part ${partie.k}/${partie.n} : ${fichiers.join(', ') || 'aucun fichier'})`);
  for (const e of essais) {
    const t0 = Date.now();
    const ctx = { navigateur, pages: [], partage };
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
    parFichier[e.fichier] = (parFichier[e.fichier] || 0) + (Date.now() - t0) / 1000;
  }
  await navigateur.close();
  const duree = ((Date.now() - debut) / 1000).toFixed(0);
  if (rates.length) {
    console.log(`\n${rates.length} essai(s) raté(s) sur ${essais.length} (${duree} s) : ${rates.join(', ')}`);
    process.exit(1);
  }
  console.log(`\n${essais.length} essai(s) réussi(s) (${duree} s).`);
  if (noter && !filtre && !partie) {
    const arrondi = Object.fromEntries(Object.entries(parFichier).sort(([a], [b]) => a.localeCompare(b)).map(([f, s]) => [f, Math.max(1, Math.round(s))]));
    await fs.writeFile(DUREES, `${JSON.stringify(arrondi, null, 2)}\n`);
    console.log('Durées notées dans durees.json.');
  }
}

// Plusieurs parts à la fois sur ce PC : chaque part est un processus à elle (son Chromium, ses ports).
// Les lignes s'affichent à mesure ; un essai raté est redit à la fin, avec le total.
async function enParallele({ filtre, parallele }) {
  const debut = Date.now();
  const rates = [];
  let reussis = 0;
  const parts = Array.from({ length: parallele }, (_, i) => new Promise((fini) => {
    const args = [__filename, ...(filtre ? [filtre] : []), '--partie', `${i + 1}/${parallele}`];
    const enfant = spawn(process.execPath, args, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
    let reste = '';
    const lignes = (bout, flux) => {
      const texte = reste + bout;
      const l = texte.split('\n');
      reste = l.pop();
      for (const x of l) {
        if (/^\d+ essai\(s\)/.test(x)) { const m = x.match(/^(\d+) essai\(s\) réussi/); if (m) reussis += Number(m[1]); continue; }
        if (x.startsWith('  ✗ ')) rates.push(x.slice(4));
        flux.write(`${x}\n`);
      }
    };
    enfant.stdout.on('data', (b) => lignes(b, process.stdout));
    enfant.stderr.on('data', (b) => process.stderr.write(b));
    enfant.on('close', (code) => { if (reste) process.stdout.write(`${reste}\n`); fini(code); });
  }));
  const codes = await Promise.all(parts);
  const duree = ((Date.now() - debut) / 1000).toFixed(0);
  if (rates.length || codes.some((c) => c !== 0)) {
    console.log(`\n${rates.length} essai(s) raté(s), ${parallele} parts à la fois (${duree} s)${rates.length ? ` :\n  ✗ ${rates.join('\n  ✗ ')}` : ''}`);
    process.exit(1);
  }
  console.log(`\n${reussis} essai(s) réussi(s), ${parallele} parts à la fois (${duree} s).`);
}

const options = lireArguments(process.argv.slice(2));
(options.parallele > 1 && !options.partie ? enParallele(options) : lancer(options)).catch((err) => { console.error(err); process.exit(1); });
