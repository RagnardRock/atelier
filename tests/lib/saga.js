// Saga dans Chromium : le jeu est exporté en version web (moteur/exporter.js, comme « Exporter le jeu »),
// puis joué au clavier. App.moteur (renderer/app.js) laisse lire la partie et la position du joueur.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { suivreErreurs, RACINE } = require('./tafl');

const MOTEUR = path.join(RACINE, 'moteur');
const Exporter = require(path.join(MOTEUR, 'exporter.js'));

// fichiers : { chemin: texte } (lib/tafl.js fichiersDuJeu). Rend le chemin du .html exporté.
async function exporter(fichiers, nom = 'essai') {
  const dossier = await fs.mkdtemp(path.join(os.tmpdir(), `saga-essai-${nom}-`));
  for (const [rel, texte] of Object.entries(fichiers)) {
    await fs.mkdir(path.dirname(path.join(dossier, rel)), { recursive: true });
    await fs.writeFile(path.join(dossier, rel), texte, 'utf8');
  }
  const jeu = JSON.parse(fichiers['jeu.json']);
  const pick = (liste) => Object.fromEntries(liste.filter((f) => fichiers[f] !== undefined).map((f) => [f, fichiers[f]]));
  const textes = {
    dossier,
    jeu: fichiers['jeu.json'],
    tuiles: fichiers[jeu.tuiles || 'tuiles.tafl'] ?? null,
    cartes: pick((jeu.cartes || []).map((c) => c.fichier)),
    donnees: pick(Object.values(jeu.donnees || {})),
    scripts: pick((jeu.scripts || []).map((s) => s.fichier)),
  };
  const version = JSON.parse(await fs.readFile(path.join(MOTEUR, 'package.json'), 'utf8')).version;
  const r = await Exporter.exporterWeb({ textes, titre: nom, sortie: dossier, moteur: MOTEUR, version, configDefaut: {}, dossierJeu: dossier });
  return r.fichier;
}

// ctx (facultatif) : celui de l'essai (lancer.js). stockage : { clé: texte } mis dans localStorage avant
// d'ouvrir (une ancienne sauvegarde, par exemple).
async function ouvrirSaga(navigateur, html, { stockage, ctx } = {}) {
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await contexte.newPage();
  ctx?.pages.push(page);
  const erreurs = suivreErreurs(page);
  if (stockage) await page.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, stockage);
  await page.goto(`file://${html}`);
  await page.waitForFunction(() => typeof App !== 'undefined' && App?.moteur);
  return { page, erreurs, contexte, saga: aides(page) };
}

// Ce qu'un essai fait dans le jeu.
function aides(page) {
  const lire = (fn, arg) => page.evaluate(fn, arg);
  const position = () => lire(() => App.moteur.position());
  const partie = () => lire(() => App.moteur.partie());
  const enScript = () => lire(() => App.moteur.enScript);
  async function touche(t, attente = 120) { await page.keyboard.press(t); await page.waitForTimeout(attente); }
  // Attendre que le joueur ait la main (pas de script, de combat, de fondu ni de pas en cours).
  async function attendreLibre(ms = 8000) {
    await page.waitForFunction(() => App.moteur.libre, null, { timeout: ms });
  }
  // Un pas dans une direction (la touche est tenue le temps du pas).
  async function pas(dir) {
    const t = { haut: 'ArrowUp', bas: 'ArrowDown', gauche: 'ArrowLeft', droite: 'ArrowRight' }[dir];
    await page.keyboard.down(t);
    await page.waitForTimeout(90);
    await page.keyboard.up(t);
    await page.waitForFunction(() => !App.moteur.partieVive || App.moteur.libre || App.moteur.enScript, null, { timeout: 4000 });
    await page.waitForTimeout(40);
  }
  // Marcher jusqu'à (x, y), d'abord en colonnes puis en rangées (sans recherche de chemin : les
  // essais choisissent des trajets dégagés). Lève une erreur si le joueur est bloqué.
  async function aller(x, y) {
    for (let i = 0; i < 80; i++) {
      const p = await position();
      if (p.x === x && p.y === y) return;
      const dir = p.x !== x ? (p.x < x ? 'droite' : 'gauche') : (p.y < y ? 'bas' : 'haut');
      await pas(dir);
      let q = await position();
      // Un appui bref quand on regarde ailleurs ne fait que tourner le joueur : on réessaie une fois.
      if (q.x === p.x && q.y === p.y && p.direction !== dir) { await pas(dir); q = await position(); }
      if (q.x === p.x && q.y === p.y) throw new Error(`bloqué en (${p.x}, ${p.y}) vers ${dir}, pour aller en (${x}, ${y})`);
    }
    throw new Error(`jamais arrivé en (${x}, ${y})`);
  }
  // Se tourner sans avancer : un pas contre ce qui bloque (un personnage, un meuble) tourne le joueur.
  async function regarder(dir) { await pas(dir); }
  // Parler / agir (Espace), puis faire défiler les dialogues (Espace) jusqu'à la fin du script.
  // reponses : les réponses aux choix, dans l'ordre (le numéro, de 0 ; 0 par défaut).
  async function agir({ reponses = [], max = 60 } = {}) {
    await touche('Space', 250);
    let n = 0;
    for (let i = 0; i < max && (await enScript()); i++) {
      const choix = await page.locator('.dialogue-choix:visible, .choix-liste:visible').count().catch(() => 0);
      if (choix && reponses.length > n) {
        for (let k = 0; k < reponses[n]; k++) await touche('ArrowDown', 80);
        n++;
      }
      await touche('Space', 220);
    }
    if (await enScript()) throw new Error('le script ne finit pas');
  }
  // Faire défiler ce qui reste à l'écran (un message, un dialogue) jusqu'à avoir la main.
  async function finir(max = 30) {
    for (let i = 0; i < max && !(await lire(() => App.moteur.libre)); i++) await touche('Space', 250);
    await attendreLibre();
  }
  async function capture(chemin) { await page.screenshot({ path: chemin }); }
  return { page, lire, position, partie, enScript, touche, attendreLibre, finir, pas, aller, regarder, agir, capture };
}

module.exports = { exporter, ouvrirSaga };

// Le jeu d'un modèle de Tafl, exporté une seule fois pour tous les essais (ctx.partage).
async function jeuDuModele(ctx, modele) {
  const cle = `html:${modele}`;
  if (!ctx.partage[cle]) {
    const { ouvrirTafl, nouveauJeu, fichiersDuJeu } = require('./tafl');
    const { page } = await ouvrirTafl(ctx.navigateur);
    await nouveauJeu(page, modele);
    ctx.partage[cle] = await exporter(await fichiersDuJeu(page), modele);
    await page.context().close();
  }
  return ctx.partage[cle];
}
module.exports.jeuDuModele = jeuDuModele;
