// Tafl : il démarre, ses modèles de jeu sont sans erreur, et on trouve une commande ou une condition.
const { ouvrirTafl, nouveauJeu, verifier, MODELES } = require('../lib/tafl');
const { egal, vrai, sansErreur } = require('../lib/verifier');

module.exports = [
  {
    nom: 'Tafl démarre sans erreur',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirTafl(ctx.navigateur, ctx);
      await page.waitForTimeout(300);
      sansErreur(erreurs, 'au démarrage');
    },
  },
  {
    nom: 'Tafl : les modèles de Nouveau jeu passent le vérificateur',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirTafl(ctx.navigateur, ctx);
      for (const modele of ['vide', ...Object.keys(MODELES)]) {
        await nouveauJeu(page, modele);
        const problemes = (await verifier(page)).filter((p) => p.gravite === 'erreur');
        vrai(!problemes.length, `le modèle « ${modele} » a ${problemes.length} erreur(s) au vérificateur : ${problemes.slice(0, 3).map((p) => p.message).join(' / ')}`);
      }
      sansErreur(erreurs, 'en créant les modèles');
    },
  },
  {
    nom: 'Tafl : chercher une commande à ajouter (Tafl 1.32)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirTafl(ctx.navigateur, ctx);
      await nouveauJeu(page, 'domaine');
      page.evaluate(() => App.editEvent('brune'));
      await page.locator('.flow-plus').first().waitFor();
      const avant = await page.locator('.bloc').count();
      await page.locator('.flow-plus').nth(1).click();
      await page.locator('.choisir-champ').waitFor();
      vrai(await page.evaluate(() => document.activeElement?.classList.contains('choisir-champ')), 'la recherche n\'a pas le curseur');
      await page.mouse.move(2, 2);
      await page.keyboard.type('attendre');
      egal(await page.locator('.choisir-item').allTextContents(), ['Attendre', 'Changer l\'heure (dormir, attendre la nuit)'], 'commandes trouvées pour « attendre »');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter'); // la fenêtre de la commande : Entrée garde les valeurs proposées
      await page.waitForTimeout(200);
      egal(await page.locator('.bloc').count(), avant + 1, 'blocs après avoir ajouté « Attendre »');
      // Rouverte : « Attendre » est dans les derniers choisis ; Échap ferme la liste, pas l'événement.
      await page.locator('.flow-plus').nth(1).click();
      await page.locator('.choisir-champ').waitFor();
      egal((await page.locator('.choisir-groupe').first().textContent()), 'Derniers choisis', 'premier groupe');
      await page.keyboard.press('Escape');
      egal(await page.locator('.choisir').count(), 0, 'listes ouvertes après Échap');
      vrai(await page.evaluate(() => Boolean(Events.pageOuverte())), 'Échap a fermé l\'événement au lieu de la liste');
      sansErreur(erreurs, 'dans l\'éditeur d\'événement');
    },
  },
  {
    nom: 'Tafl : chercher une condition, sans accents (Tafl 1.32)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirTafl(ctx.navigateur, ctx);
      await nouveauJeu(page, 'domaine');
      page.evaluate(() => App.editEvent('brune'));
      await page.locator('.cmd-add', { hasText: 'Condition' }).click();
      await page.locator('.choisir-champ').waitFor();
      const groupes = await page.locator('.choisir-groupe').allTextContents();
      vrai(groupes.includes('Temps') && groupes.includes('Gestion'), `familles des conditions : ${groupes.join(', ')}`);
      vrai(!groupes.includes('Dés et règles'), 'les conditions du pack JDR sont proposées dans un jeu JRPG');
      await page.keyboard.type('batiment construit');
      egal(await page.locator('.choisir-item').allTextContents(), ['Un bâtiment est construit (gestion)'], 'conditions trouvées');
      await page.keyboard.press('Escape');
      sansErreur(erreurs, 'dans les conditions');
    },
  },
];
