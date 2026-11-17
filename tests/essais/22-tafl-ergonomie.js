// Tafl 1.42 : l'audit de l'interface. Nouveau jeu (le modèle d'abord, le pack d'un jeu vide), les
// outils d'un autre espace cachés, les Réglages de Tafl en onglets, les événements semblables groupés.
const { ouvrirTafl, nouveauJeu } = require('../lib/tafl');
const { egal, vrai, sansErreur } = require('../lib/verifier');

module.exports = [
  {
    nom: 'Tafl : un nouveau jeu vide choisit son pack, un modèle non (Tafl 1.42)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirTafl(ctx.navigateur, ctx);
      page.evaluate(() => App.newDocument(true));
      await page.locator('select[name=modele]').waitFor();
      vrai(await page.locator('select[name=pack]').isVisible(), 'un jeu vide montre le choix du pack');
      await page.selectOption('select[name=modele]', 'jdr');
      vrai(!(await page.locator('select[name=pack]').isVisible()), 'un modèle apporte son pack : pas de choix');
      await page.selectOption('select[name=modele]', 'vide');
      await page.selectOption('select[name=pack]', 'jrpg');
      await page.locator('.modal button[type=submit]').click();
      await page.waitForFunction(() => App.doc?.game);
      egal(await page.evaluate(() => [App.doc.data.reglages.regles, App.doc.data.reglages.monnaie, App.doc.tileSize]), ['jrpg', 'Or', 32], 'pack, monnaie du pack et tuiles de 32 px');
      sansErreur(erreurs, 'en créant le jeu');
    },
  },
  {
    nom: 'Tafl : outils cachés hors de leur espace, Réglages en onglets, événements groupés (Tafl 1.42)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirTafl(ctx.navigateur, ctx);
      await nouveauJeu(page, 'jdr', { taille: 32 });
      await page.evaluate(() => Espaces.aller('tuiles'));
      egal(await page.locator('#tool-buttons button:visible').count(), 7, 'outils visibles en Tuiles');
      await page.evaluate(() => Espaces.aller('cartes'));
      egal(await page.locator('#tool-buttons button:visible').count(), 12, 'outils visibles en Cartes');

      await page.click('#btn-settings');
      await page.locator('.modal-onglet').first().waitFor();
      egal(await page.locator('.modal-onglet').allTextContents(), ['Apparence', 'Édition', 'Panneaux', 'Loki'], 'onglets des Réglages');
      vrai(!(await page.locator('select[name=claudeModel]').isVisible()), 'Loki est caché dans Apparence');
      await page.locator('.modal-onglet', { hasText: 'Loki' }).click();
      vrai(await page.locator('select[name=claudeModel]').isVisible(), 'Loki se voit dans son onglet');
      await page.keyboard.press('Escape');

      await page.evaluate(() => Espaces.aller('evenements'));
      const lot = page.locator('.lot-evenements');
      await lot.first().waitFor();
      vrai(/× \d+/.test(await lot.first().textContent()), 'les gardiens de la crypte tiennent sur une ligne « × N »');
      const avant = await page.locator('#ev-liste .row').count();
      await lot.first().click();
      vrai(await page.locator('#ev-liste .row.sous').count() >= 3, 'un clic déplie le lot');
      vrai(await page.locator('#ev-liste .row').count() > avant, 'les lignes du lot apparaissent');
      sansErreur(erreurs, 'dans les réglages et les événements');
    },
  },
];
