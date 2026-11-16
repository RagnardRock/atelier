#!/usr/bin/env node
// Refait les captures d'écran du mode d'emploi de Tafl et Saga (docs/manuel/captures/*.jpg).
//   node docs/manuel/captures.js            toutes les captures
//   node docs/manuel/captures.js saga       seulement celles dont le nom contient « saga »
// Tafl et Saga tournent dans un Chromium sans fenêtre, comme les essais (tests/lib). Les jeux sont ceux des
// modèles de Tafl, en tuiles de 32 px. Les captures du mode table et du compagnon viennent des essais
// eux-mêmes (tests/essais), lancés avec CAPTURES.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const RACINE = path.resolve(__dirname, '..', '..');
const LIB = path.join(RACINE, 'tests', 'lib');
const { chromium, ouvrirTafl, nouveauJeu, fichiersDuJeu } = require(path.join(LIB, 'tafl.js'));
const { exporter, ouvrirSaga } = require(path.join(LIB, 'saga.js'));

const SORTIE = path.join(__dirname, 'captures');
const filtre = process.argv[2] || '';
const QUALITE = 74;
const LARGEUR_MAX = 1800; // en pixels : assez net à l'impression, un PDF léger
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Une capture en JPEG (le PDF reste léger). zone : un sélecteur pour ne prendre qu'un élément.
async function photo(page, nom, { zone } = {}) {
  const chemin = path.join(SORTIE, `${nom}.jpg`);
  const cible = zone ? page.locator(zone).first() : page;
  try {
    const png = path.join(os.tmpdir(), `manuel-${nom}.png`);
    await cible.screenshot({ path: png, timeout: 8000 });
    await versJpeg(page.context().browser(), png, nom, true);
    await fsp.rm(png, { force: true });
    console.log(`  ✓ ${nom}`);
  } catch (e) { console.log(`  ✗ ${nom} : ${e.message.split('\n')[0]}`); }
}

// Une capture PNG recopiée en JPEG, réduite à LARGEUR_MAX de large au plus.
async function versJpeg(navigateur, source, nom, discret = false) {
  const page = await navigateur.newPage();
  const data = `data:image/png;base64,${(await fsp.readFile(source)).toString('base64')}`;
  const b64 = await page.evaluate(async ({ data, q, max }) => {
    const img = new Image(); img.src = data; await img.decode();
    const k = Math.min(1, max / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q).split(',')[1];
  }, { data, q: QUALITE / 100, max: LARGEUR_MAX });
  await fsp.writeFile(path.join(SORTIE, `${nom}.jpg`), Buffer.from(b64, 'base64'));
  await page.close();
  if (!discret) console.log(`  ✓ ${nom} (essai)`);
}

// --- Tafl ---
async function tafl(navigateur, modele, { largeur = 1600, hauteur = 1000 } = {}) {
  // Un contexte à 1,5 × pour des captures nettes ; ouvrirTafl n'y ouvre que sa page.
  const contexte = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1.5 });
  const { page, erreurs } = await ouvrirTafl({ newPage: () => contexte.newPage() });
  if (modele) await nouveauJeu(page, modele, { taille: 32 });
  await page.waitForTimeout(500);
  return { page, erreurs };
}
const espace = (page, id, opts) => page.evaluate(([id, opts]) => Espaces.aller(id, opts), [id, opts || {}]).then(() => page.waitForTimeout(700));
// Ouvre une fenêtre de Tafl sans attendre sa réponse (elle attend un clic).
const ouvrir = (page, fn) => page.evaluate(`setTimeout(() => { ${fn} }, 0)`).then(() => page.waitForTimeout(700));
const fermerFenetres = (page) => page.keyboard.press('Escape').then(() => page.waitForTimeout(300));

const SCENES = [];
const scene = (nom, faire) => SCENES.push({ nom, faire });

scene('tafl-bienvenue', async (nav) => {
  const { page } = await tafl(nav, null);
  await photo(page, 'tafl-bienvenue');
  await ouvrir(page, 'App.newDocument(true)');
  await page.evaluate(() => { const s = [...document.querySelectorAll('.modal select')]; s[0].value = '32'; s.at(-1).value = 'domaine'; for (const x of s) x.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('.modal input[type=text]').first().fill('Le petit domaine');
  await photo(page, 'tafl-nouveau-jeu', { zone: '.modal' });
});

scene('tafl-espaces', async (nav) => {
  const { page } = await tafl(nav, 'domaine');
  await espace(page, 'accueil');
  await photo(page, 'tafl-accueil');
  // Tuiles : une tuile détaillée (le toit), la mosaïque.
  await espace(page, 'tuiles');
  await page.evaluate(() => { const i = App.doc.tiles.findIndex((t) => /arbre|sapin/i.test(t.name)); App.selectTile(i >= 0 ? i : 6); });
  await page.waitForTimeout(400);
  await photo(page, 'tafl-tuiles');
  await page.evaluate(() => { const i = App.doc.tiles.findIndex((t) => /herbe/i.test(t.name)); App.selectTile(Math.max(0, i)); App.toggleOption('mosaic'); });
  await page.waitForTimeout(400);
  await photo(page, 'tafl-mosaique');
  await page.evaluate(() => App.toggleOption('mosaic'));
  // Cartes, puis le passage visible.
  await espace(page, 'cartes');
  await photo(page, 'tafl-cartes');
  await page.evaluate(() => App.selectLayer(-1));
  await page.waitForTimeout(400);
  await photo(page, 'tafl-passage', { zone: '#workspace' });
  await page.evaluate(() => App.selectLayer(0));
  // Événements : Brune et son script en blocs.
  await espace(page, 'evenements');
  await photo(page, 'tafl-evenements');
  await page.locator('.bloc, .bloc-commande').filter({ hasText: 'Bienvenue' }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await photo(page, 'tafl-apercu-dialogue');
  // Données : les personnages, puis les bâtiments du module gestion.
  await espace(page, 'donnees');
  await photo(page, 'tafl-donnees');
  await espace(page, 'jeu');
  await photo(page, 'tafl-jeu');
  // Chercher partout.
  await page.evaluate(() => Recherche.ouvrir());
  await page.keyboard.type('maison', { delay: 30 });
  await page.waitForTimeout(500);
  await photo(page, 'tafl-recherche');
  await fermerFenetres(page);
  // La carte monde, le test rapide, l'export.
  await ouvrir(page, 'App.openWorld()');
  await page.waitForTimeout(800);
  await photo(page, 'tafl-carte-monde');
  await fermerFenetres(page);
  await ouvrir(page, 'App.testRapide()');
  await photo(page, 'tafl-test-rapide');
  await fermerFenetres(page);
  await espace(page, 'cartes');
  await ouvrir(page, 'App.mapAmbiance()');
  await photo(page, 'tafl-ambiance', { zone: '.modal' });
  await fermerFenetres(page);
});

scene('tafl-jdr', async (nav) => {
  const { page } = await tafl(nav, 'jdr');
  const menuDonnees = (nom) => page.locator('#page-donnees button, #page-donnees .row').filter({ hasText: new RegExp(`^\\s*${nom}`) }).first().click().then(() => page.waitForTimeout(700));
  await espace(page, 'cartes');
  await photo(page, 'tafl-cartes-jdr');
  await espace(page, 'donnees');
  await menuDonnees('Personnages');
  await page.locator('#page-donnees').getByText('Thorgrim', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  await photo(page, 'tafl-perso-jdr');
  await menuDonnees('Monstres');
  await photo(page, 'tafl-monstres');
  await menuDonnees('Réglages');
  for (const [onglet, nom] of [['Règles du jeu', 'tafl-reglages-regles'], ['Fiche des personnages', 'tafl-fiche'], ['Interface', 'tafl-reglages-interface']]) {
    if (!(await page.locator('.reglages-onglet', { hasText: onglet }).count())) continue;
    await page.locator('.reglages-onglet', { hasText: onglet }).click();
    await page.waitForTimeout(600);
    await photo(page, nom);
  }
  // Un script JS d'exemple (le + de la liste des scripts).
  await espace(page, 'evenements');
  await page.locator('.scripts-tete .icon-button').click({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.locator('.menu-item, .menu button, [role=menuitem]').filter({ hasText: /d[ée]s|jet/i }).first().click().catch(async () => { await page.locator('.menu-item, .menu button, [role=menuitem]').first().click(); });
  await page.waitForTimeout(2500);
  await photo(page, 'tafl-script-js');
});

scene('tafl-sprite', async (nav) => {
  const { page } = await tafl(nav, 'domaine');
  await espace(page, 'donnees');
  await page.locator('button:visible', { hasText: 'personnage de base' }).first().click({ timeout: 5000 });
  await page.waitForTimeout(1200);
  await photo(page, 'tafl-sprite');
  // L'effet au passage d'une tuile (les hautes herbes du modèle, sinon la première).
  await espace(page, 'tuiles');
  await page.evaluate(() => { const i = App.doc.tiles.findIndex((t) => t.effet); App.selectTile(Math.max(0, i)); });
  await ouvrir(page, 'App.tileMenuItems().find((x) => /Effet au passage/.test(x.label)).run()');
  await photo(page, 'tafl-effet-passage');
});

// --- Saga ---
// Le jeu d'un modèle, exporté en version web (comme « Exporter le jeu »). avant(doc) : une retouche du jeu
// dans Tafl avant l'export (un combat posé à côté du départ, par exemple), écrite comme du code de page.
async function jeuSaga(nav, modele, avant) {
  const { page } = await tafl(nav, modele);
  if (avant) await page.evaluate(avant);
  const html = await exporter(await fichiersDuJeu(page), modele);
  await page.context().close();
  return html;
}
async function saga(nav, html, { largeur = 1280, hauteur = 720 } = {}) {
  const r = await ouvrirSaga({ newContext: (o) => nav.newContext({ ...o, viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1.5 }) }, html);
  return r;
}
// Un déclencheur posé sous le départ du joueur, qui joue ces commandes.
const declencheur = (commandes) => `(() => {
  const m = App.doc.maps[0];
  m.events.push({ id: 'manuel', nom: 'Manuel', type: 'declencheur', x: 12, y: 15, apparence: { personnage: '', tuile: -1 }, direction: 'bas', deplacement: 'fixe', traversable: true, declenchement: 'toucher', pages: [{ conditions: [], cache: false, commandes: ${JSON.stringify(commandes)} }] });
})()`;

scene('saga-domaine', async (nav) => {
  const { page, saga: s } = await saga(nav, await jeuSaga(nav, 'domaine'));
  await s.attendreLibre();
  await page.waitForTimeout(800);
  await photo(page, 'saga-domaine');
  // Parler à Brune : la boîte de dialogue.
  await s.aller(12, 15); await s.aller(11, 15); await s.regarder('gauche');
  await s.touche('Space', 1800);
  await photo(page, 'saga-dialogue');
  await s.finir();
  // Le menu du jeu (Échap), puis Construire et la visée.
  await s.touche('Escape', 700);
  await photo(page, 'saga-menu');
  await page.getByText('Construire', { exact: true }).click();
  await page.waitForTimeout(600);
  await photo(page, 'saga-construire');
  await page.locator('button:visible', { hasText: 'Maison' }).first().click();
  await page.waitForTimeout(400);
  for (let i = 0; i < 5; i++) await s.touche('ArrowUp', 120);
  await page.waitForTimeout(400);
  await photo(page, 'saga-visee');
  await s.touche('Space', 600);
  await s.finir();
  // Le domaine (menu du jeu › Domaine).
  await s.touche('Escape', 700);
  await page.locator('button:visible', { hasText: 'Domaine' }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  await photo(page, 'saga-ecran-domaine');
  for (let i = 0; i < 4 && !(await s.lire(() => App.moteur.libre && !document.querySelector('.menus:not([hidden]), .menu-jeu:not([hidden])'))); i++) await s.touche('Escape', 400);
  await s.attendreLibre().catch(() => {});
  // Dormir : le rapport du matin.
  await s.aller(15, 15); await s.regarder('droite');
  await s.touche('Space', 400);
  for (let i = 0; i < 12 && await s.enScript(); i++) {
    if (await page.locator('.menu-lecture:visible, .menus:visible').count().catch(() => 0)) break;
    await s.touche('Space', 900);
  }
  await page.waitForTimeout(800);
  await photo(page, 'saga-matin');
  await s.finir().catch(() => {});
  // Les options (Ctrl+,).
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(700);
  await photo(page, 'saga-options');
});

scene('saga-combat-jrpg', async (nav) => {
  const { page, saga: s } = await saga(nav, await jeuSaga(nav, 'domaine', declencheur([{ type: 'combat_groupe', groupe: 'lapins' }])));
  await s.attendreLibre();
  await s.pas('haut');
  await page.waitForTimeout(3500);
  await photo(page, 'saga-combat-jrpg');
  await s.touche('Space', 900);
  await photo(page, 'saga-combat-jrpg-menu');
});

scene('saga-donjon', async (nav) => {
  const { page, saga: s } = await saga(nav, await jeuSaga(nav, 'donjon'));
  await s.attendreLibre();
  await page.mouse.click(640, 300);
  for (const [t, ms] of [['ArrowDown', 900], ['ArrowRight', 1400], ['ArrowDown', 900]]) { await page.keyboard.down(t); await page.waitForTimeout(ms); await page.keyboard.up(t); }
  await page.waitForTimeout(500);
  await photo(page, 'saga-donjon');
});

scene('saga-jdr-solo', async (nav) => {
  const { page, saga: s } = await saga(nav, await jeuSaga(nav, 'jdr'));
  const seul = page.getByRole('button', { name: 'Seul (aventure)' });
  await seul.waitFor({ timeout: 5000 });
  await seul.click();
  await page.locator('button:visible', { hasText: 'niv.' }).first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  await photo(page, 'saga-jdr-groupe');
  for (let i = 0; i < 8; i++) {
    const b = page.locator('button:visible', { hasText: 'niv.' }).first();
    if (!(await b.count())) break;
    await b.click(); await page.waitForTimeout(400);
  }
  for (let i = 0; i < 20 && !(await s.lire(() => App.moteur.libre)); i++) await s.touche('Enter', 300);
  await s.attendreLibre();
  await page.waitForTimeout(600);
  await photo(page, 'saga-jdr-carte');
  await s.touche('m', 1000);
  await photo(page, 'saga-carte-monde');
});

// --- Les captures des essais (mode table, documents, campagne, compagnon…) ---
// Chaque fichier d'essai est lancé avec CAPTURES (et SURVIVOR_CAPTURES) vers un dossier à lui ; ses captures
// deviennent <préfixe>-<nom>.jpg.
const ESSAIS = {
  '1-tafl.js': 'essai-tafl', '5-saga-survivor.js': 'survivor', '7-saga-table-outils.js': 'outils',
  '9-compagnon.js': 'compagnon', '10-saga-table-interface.js': 'table', '11-saga-documents.js': 'docs',
  '12-saga-campagne.js': 'campagne', '14-saga-scene-image.js': 'scene', '15-saga-calque-initiative.js': 'calque',
  '16-saga-initiative-reglable.js': 'reglable',
  '17-saga-vision.js': 'vision',
};
for (const [fichier, prefixe] of Object.entries(ESSAIS)) {
  scene(`essai-${prefixe}`, async (nav) => {
    const chemin = path.join(RACINE, 'tests', 'essais', fichier);
    if (!fs.existsSync(chemin)) return;
    const dossier = await fsp.mkdtemp(path.join(os.tmpdir(), `manuel-${prefixe}-`));
    process.env.CAPTURES = dossier;
    process.env.SURVIVOR_CAPTURES = dossier;
    delete require.cache[require.resolve(chemin)];
    const essais = require(chemin);
    const partage = {};
    for (const e of essais) {
      const ctx = { navigateur: nav, pages: [], partage };
      try { await e.faire(ctx); } catch (err) { console.log(`  ✗ ${e.nom} : ${String(err.message).split('\n')[0]}`); }
      for (const p of ctx.pages) await p.context().close().catch(() => {});
    }
    for (const f of (await fsp.readdir(dossier)).filter((f) => f.endsWith('.png'))) await versJpeg(nav, path.join(dossier, f), `${prefixe}-${f.replace(/\.png$/, '')}`);
    await fsp.rm(dossier, { recursive: true, force: true });
  });
}

async function main() {
  await fsp.mkdir(SORTIE, { recursive: true });
  const navigateur = await chromium.launch();
  for (const s of SCENES.filter((s) => s.nom.includes(filtre))) {
    const contexteAvant = navigateur.contexts().length;
    try { await s.faire(navigateur); } catch (e) { console.log(`  ✗ ${s.nom} : ${e.message.split('\n')[0]}`); }
    for (const c of navigateur.contexts().slice(contexteAvant)) await c.close().catch(() => {});
  }
  await navigateur.close();
}
module.exports = { photo, versJpeg };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
