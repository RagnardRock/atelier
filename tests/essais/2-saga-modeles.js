// Saga : chaque modèle de jeu de Tafl démarre sans erreur et le héros se déplace.
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { MODELES } = require('../lib/tafl');
const { vrai, sansErreur } = require('../lib/verifier');

module.exports = ['vide', ...Object.keys(MODELES)].map((modele) => ({
  nom: `Saga joue le modèle « ${modele} »`,
  async faire(ctx) {
    const html = await jeuDuModele(ctx, modele);
    const { page, erreurs, saga } = await ouvrirSaga(ctx.navigateur, html, { ctx });
    // Le pack JDR demande d'abord comment jouer : seul.
    const seul = page.getByRole('button', { name: 'Seul (aventure)' });
    await Promise.race([seul.waitFor({ timeout: 3000 }).then(() => seul.click()), saga.attendreLibre(3000)]).catch(() => {});
    // Le pack JDR fait ensuite composer le groupe : un prétiré à chaque place (« … · niv. 1 »).
    if (modele === 'jdr') {
      await page.locator('button:visible', { hasText: 'niv.' }).first().waitFor({ timeout: 5000 });
      for (let i = 0; i < 8; i++) {
        const pretire = page.locator('button:visible', { hasText: 'niv.' }).first();
        if (!(await pretire.count())) break;
        await pretire.click();
        await page.waitForTimeout(400);
      }
    }
    for (let i = 0; i < 20 && !(await saga.lire(() => App.moteur.libre)); i++) await saga.touche('Enter', 300);
    await saga.attendreLibre();
    const depart = await saga.position();
    vrai(depart, 'pas de héros sur la carte');
    // Un pas, dans la première direction libre.
    let bouge = false;
    for (const dir of ['bas', 'haut', 'gauche', 'droite']) {
      for (let i = 0; i < 2 && !bouge; i++) {
        await saga.pas(dir);
        const p = await saga.position();
        bouge = p.x !== depart.x || p.y !== depart.y;
      }
      if (bouge) break;
    }
    vrai(bouge, `le héros ne bouge pas depuis (${depart.x}, ${depart.y})`);
    await page.waitForTimeout(500);
    sansErreur(erreurs, 'en jouant');
  },
}));
