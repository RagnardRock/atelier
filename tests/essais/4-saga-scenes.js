// Saga : les nouveautés de Saga 1.27 à 1.29 jouées pour de vrai, dans « Le petit domaine » auquel on
// ajoute deux événements :
// - « Statue » (12, 13), au bout du chemin : en pleine scène, elle prend l'apparence d'un tampon (#137, #140), puis
//   disparaît (commande apparition, #140) : on peut alors marcher sur sa case ;
// - « Quête de la maison » (tout seul, aussi après une construction, #143) : elle allume un
//   interrupteur dès que le joueur pose une maison, mais pas pour la maison posée par un script ;
// - « Charrette » (13, 14), un tampon de 3 × 2 : elle part vers la droite à travers tout et sort de la
//   carte (#137, #138).
const { ouvrirTafl, nouveauJeu, fichiersDuJeu } = require('../lib/tafl');
const { exporter, ouvrirSaga } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

async function jeu(ctx) {
  if (ctx.partage.scenes) return ctx.partage.scenes;
  const { page } = await ouvrirTafl(ctx.navigateur);
  await nouveauJeu(page, 'domaine');
  await page.evaluate(() => {
    const carte = App.doc.maps.find((m) => m.id === 'clairiere');
    const dire = (texte) => ({ type: 'dire', qui: '', expression: 'normal', texte });
    const ev = (id, nom, x, y, declenchement, pages, autres = {}) => Events.normEvent({
      id, nom, type: 'pnj', x, y, apparence: { personnage: 'brune', tuile: -1 }, direction: 'bas', deplacement: 'fixe',
      traversable: false, declenchement, pages, ...autres,
    }, id, carte.width, carte.height);
    carte.events.push(ev('statue', 'Statue', 12, 13, 'parler', [{ conditions: [], cache: false, commandes: [
      // La maison du héros, posée par un script : elle ne doit pas compter pour la quête.
      { type: 'gestion_construire', batiment: 'maison', carte: 'clairiere', x: 3, y: 3, annoncer: false, reussi: [], rate: [] },
      { type: 'apparence', qui: '@evenement', action: 'changer', personnage: '', tuile: -1, tampon: 'potager' },
      dire('La statue se change en potager !'),
      { type: 'apparition', qui: '@evenement', action: 'disparaitre' },
      dire('Et la voilà partie.'),
    ] }]));
    carte.events.push(ev('charrette', 'Charrette', 13, 14, 'parler', [{ conditions: [], cache: false, commandes: [
      dire('En route !'),
      { type: 'deplacer', qui: '@evenement', mode: 'chemin', chemin: [{ direction: 'droite', cases: 20 }], vitesse: 'rapide', traverser: true, attendre: true },
      dire('La charrette est partie.'),
    ] }], { apparence: { personnage: '', tuile: -1, tampon: 'ferme' } }));
    carte.events.push(ev('quete-maison', 'Quête de la maison', 0, 0, 'auto', [
      // Saga joue la dernière page valable : « déjà fait » en dernier, pour ne jouer la scène qu'une fois.
      { conditions: [{ type: 'gestion_batiment', batiment: 'maison', min: 1, par: 'joueur', chantiers: true }], cache: false, commandes: [
        dire('Ta première maison !'),
        { type: 'interrupteur', id: 'maison-du-joueur', valeur: true },
        { type: 'local', valeur: true },
      ] },
      { conditions: [{ type: 'local', valeur: true }], cache: false, commandes: [] },
    ], { relances: ['construction'], apparence: { personnage: '', tuile: -1 }, traversable: true }));
  });
  const html = await exporter(await fichiersDuJeu(page), 'scenes');
  await page.context().close();
  ctx.partage.scenes = html;
  return html;
}

module.exports = [
  {
    nom: 'Saga : changer d\'apparence puis disparaître en pleine scène (Saga 1.27)',
    async faire(ctx) {
      const { page, erreurs, saga } = await ouvrirSaga(ctx.navigateur, await jeu(ctx), { ctx });
      await saga.attendreLibre();
      // La statue bloque sa case.
      await saga.aller(12, 14);
      await saga.regarder('haut');
      egal((await saga.position()).y, 14, 'rangée du joueur devant la statue (elle doit bloquer)');
      await saga.touche('Space', 500);
      await saga.finir();
      const p = await saga.partie();
      vrai(JSON.stringify(p.retouches).includes('statue'), `la disparition n'est pas gardée dans la partie : ${JSON.stringify(p.retouches)}`);
      // Partie : on marche sur sa case.
      await saga.aller(12, 13);
      sansErreur(erreurs, 'pendant la scène');
    },
  },
  {
    nom: 'Saga : une quête réagit à la maison posée par le joueur, pas à celle d\'un script (Saga 1.29)',
    async faire(ctx) {
      const { page, erreurs, saga } = await ouvrirSaga(ctx.navigateur, await jeu(ctx), { ctx });
      await saga.attendreLibre();
      // La maison du héros, par le script de la statue.
      await saga.aller(12, 14);
      await saga.regarder('haut');
      await saga.touche('Space', 400);
      await saga.finir();
      let p = await saga.partie();
      egal(p.modules.gestion.batiments.map((b) => [b.type, Boolean(b.script)]), [['maison', true]], 'maison posée par le script');
      vrai(!p.interrupteurs['maison-du-joueur'], 'la quête a réagi à la maison posée par un script');
      // Le joueur pose la sienne : la scène se lance tout de suite.
      await saga.touche('Escape', 400);
      await page.getByText('Construire', { exact: true }).click();
      await page.locator('button:visible', { hasText: 'Maison' }).first().click();
      await page.waitForTimeout(400);
      for (let i = 0; i < 5; i++) await saga.touche('ArrowUp', 120);
      await saga.touche('Space', 600);
      await saga.finir();
      p = await saga.partie();
      egal(p.modules.gestion.batiments.length, 2, 'bâtiments après la pose du joueur');
      egal(p.interrupteurs['maison-du-joueur'], true, 'interrupteur de la quête après la pose du joueur');
      sansErreur(erreurs, 'pendant la quête');
    },
  },
  {
    nom: 'Saga : jouer au doigt sur tablette (Saga 1.28)',
    async faire(ctx) {
      const { jeuDuModele } = require('../lib/saga');
      const html = await jeuDuModele(ctx, 'domaine');
      const contexte = await ctx.navigateur.newContext({ ...require('playwright').devices['iPad (gen 7) landscape'] });
      const page = await contexte.newPage();
      ctx.pages.push(page);
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(e.message));
      await page.goto(`file://${html}`);
      await page.waitForFunction(() => App?.moteur?.libre);
      await page.touchscreen.tap(640, 300); // le premier toucher montre les commandes
      await page.waitForTimeout(300);
      vrai(await page.locator('#tactile').isVisible(), 'la croix et les boutons ne s\'affichent pas après un toucher');
      // Tenir la flèche du haut : le héros marche.
      const avant = await page.evaluate(() => App.moteur.position());
      const fleche = await page.locator('.tactile-fleche.haut').boundingBox();
      const cdp = await contexte.newCDPSession(page);
      const point = { x: fleche.x + fleche.width / 2, y: fleche.y + fleche.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await page.waitForTimeout(600);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(400);
      const apres = await page.evaluate(() => App.moteur.position());
      vrai(apres.y < avant.y, `le héros n'a pas monté au doigt : (${avant.x}, ${avant.y}) → (${apres.x}, ${apres.y})`);
      // ☰ ouvre le menu du jeu.
      await page.locator('.tactile-menu').tap();
      await page.waitForTimeout(400);
      vrai(await page.getByText('Construire', { exact: true }).isVisible(), 'le bouton ☰ n\'ouvre pas le menu du jeu');
      if (erreurs.length) throw new Error(erreurs.join('\n'));
    },
  },
  {
    nom: 'Saga : un tampon qui traverse sort de la carte (Saga 1.27.1)',
    async faire(ctx) {
      const { erreurs, saga } = await ouvrirSaga(ctx.navigateur, await jeu(ctx), { ctx });
      await saga.attendreLibre();
      await saga.aller(12, 14);
      await saga.regarder('droite');
      egal((await saga.position()).x, 12, 'colonne du joueur devant la charrette (elle doit bloquer)');
      await saga.agir({ max: 80 });
      await saga.finir();
      // Partie hors de la carte : sa case est libre.
      await saga.aller(14, 14);
      sansErreur(erreurs, 'pendant le départ de la charrette');
    },
  },
];
