// Saga : trois jours dans « Le petit domaine » (modèle de Tafl), comme un joueur.
// Parler à Brune, construire une maison, dormir, voir arriver les habitants, sauvegarder et reprendre.
const fs = require('node:fs/promises');
const path = require('node:path');
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

// Les places du modèle (tuiles/renderer/exemple-domaine.js).
const BRUNE = { x: 10, y: 15 }, LIT = { x: 16, y: 15 };
const SAUVEGARDE = path.join(__dirname, '..', 'sauvegardes', 'domaine-jour-3.json');

// Dormir au lit de camp : y aller, le regarder, agir.
async function dormir(saga) {
  await saga.aller(LIT.x - 1, LIT.y);
  await saga.regarder('droite');
  await saga.agir();
  await saga.finir(); // le rapport du matin
}

module.exports = [
  {
    nom: 'Saga : trois jours dans « Le petit domaine »',
    duree: 180000,
    async faire(ctx) {
      const html = await jeuDuModele(ctx, 'domaine');
      const { page, erreurs, saga } = await ouvrirSaga(ctx.navigateur, html, { ctx });
      await saga.attendreLibre();
      egal(await saga.position(), { carte: 'clairiere', x: 12, y: 16, direction: 'haut' }, 'départ du joueur');

      // 1. Parler à Brune : 10 points d'amitié (relations › parler).
      await saga.aller(12, 15);
      await saga.aller(BRUNE.x + 1, BRUNE.y);
      await saga.regarder('gauche');
      await saga.agir();
      let p = await saga.partie();
      egal(p.modules.relations.liens.brune?.points, 10, 'amitié de Brune après la première conversation');

      // 2. Construire une maison (6 bois) dans le pré, par le menu du jeu.
      await saga.touche('Escape', 400);
      await page.getByText('Construire', { exact: true }).click();
      await page.locator('button:visible', { hasText: 'Maison' }).first().click();
      await page.waitForTimeout(400);
      for (let i = 0; i < 5; i++) await saga.touche('ArrowUp', 120);
      vrai((await saga.lire(() => App.moteur.visee()))?.ok, 'la maison ne peut pas être posée là');
      await saga.touche('Space', 600);
      p = await saga.partie();
      egal(p.modules.gestion.stock.bois, 6, 'bois après la maison (12 - 6)');
      egal(p.modules.gestion.batiments.map((b) => [b.type, b.etat]), [['maison', 'chantier']], 'bâtiments posés');

      // 3. Première nuit : la maison est finie et un habitant arrive.
      await saga.finir();
      await dormir(saga);
      p = await saga.partie();
      egal(p.jour, 2, 'jour après la première nuit');
      egal(p.modules.gestion.batiments.map((b) => b.etat), ['fini'], 'état de la maison après une nuit');
      egal(p.modules.gestion.habitants, 1, 'habitants après la première nuit');
      

      // 4. Deuxième nuit : un deuxième habitant (la maison en loge deux).
      await dormir(saga);
      p = await saga.partie();
      egal(p.jour, 3, 'jour après la deuxième nuit');
      egal(p.modules.gestion.habitants, 2, 'habitants après la deuxième nuit');

      // 5. Sauvegarder (Ctrl+S), recharger la page, Continuer : la partie est la même.
      await saga.finir();
      const avant = await saga.position();
      await page.keyboard.press('Control+s');
      await page.waitForTimeout(600);
      const sauvee = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.endsWith(':sauvegarde'))?.[1]);
      vrai(sauvee, 'pas de sauvegarde dans le navigateur après Ctrl+S');
      // Garder cette sauvegarde pour les versions suivantes (essai « ancienne sauvegarde »), une seule fois.
      if (process.env.GARDER_SAUVEGARDE) await fs.writeFile(SAUVEGARDE, `${JSON.stringify(JSON.parse(sauvee).partie, null, 1)}\n`, 'utf8');
      await page.reload();
      await page.getByRole('button', { name: 'Continuer' }).click();
      await saga.attendreLibre();
      p = await saga.partie();
      egal(p.jour, 3, 'jour après avoir repris la sauvegarde');
      egal(p.modules.gestion.habitants, 2, 'habitants après avoir repris la sauvegarde');
      egal(await saga.position(), avant, 'position après avoir repris la sauvegarde');
      sansErreur(erreurs, 'pendant les trois jours');
    },
  },
  {
    // Une partie sauvegardée par une version plus ancienne de Saga doit toujours se reprendre.
    nom: 'Saga reprend une ancienne sauvegarde du « petit domaine »',
    async faire(ctx) {
      const partie = JSON.parse(await fs.readFile(SAUVEGARDE, 'utf8'));
      const html = await jeuDuModele(ctx, 'domaine');
      const cle = `saga:${path.basename(html, '.html').toLowerCase()}:sauvegarde`;
      const { page, erreurs, saga } = await ouvrirSaga(ctx.navigateur, html, { ctx, stockage: { [cle]: JSON.stringify({ quand: Date.now(), partie }) } });
      await page.getByRole('button', { name: 'Continuer' }).click();
      await saga.attendreLibre();
      let p = await saga.partie();
      egal([p.jour, p.modules.gestion.habitants], [partie.jour, partie.modules.gestion.habitants], 'jour et habitants repris');
      await dormir(saga);
      p = await saga.partie();
      egal(p.jour, partie.jour + 1, 'jour après une nuit');
      sansErreur(erreurs, 'avec l\'ancienne sauvegarde');
    },
  },
];
