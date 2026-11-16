// Saga 1.31 : le personnage de base (commun/perso-base.js). Un héros sans sprite marche, et en temps réel
// (« Le petit donjon ») il prend les animations de base (repos, coup d'épée avec la lame de Saga).
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

module.exports = [
  {
    nom: 'Saga : le personnage de base et ses animations en temps réel (Saga 1.31)',
    async faire(ctx) {
      const { page, erreurs, saga } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'donjon'), { ctx });
      await saga.attendreLibre();
      const vu = await saga.lire(() => {
        const b = Sprites.base('#d94a4a', 16), b2 = Sprites.base('#d94a4a', 64);
        return {
          marche: `${b.sprite.largeur}x${b.sprite.hauteur}`, double: `${b2.sprite.largeur}x${b2.sprite.hauteur}`,
          animations: Object.keys(b.animations).join(' '), heros: App.moteur ? Boolean(Sprites.animationBase('#d94a4a', 'repos', 16)) : false,
        };
      });
      // Jamais réduit : 32 × 32 en tuiles de 16 et de 32 px, doublé en tuiles de 64.
      egal(vu, { marche: '32x32', double: '64x64', animations: 'repos attaque coup mort', heros: true }, 'les planches du personnage de base');
      // Il marche, frappe (la lame de Saga par-dessus le bras), puis reste au repos, sans erreur.
      await page.mouse.click(640, 300);
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(350); await page.keyboard.up('ArrowRight');
      await page.keyboard.press('Space'); await page.waitForTimeout(400);
      await page.waitForTimeout(600);
      vrai(await saga.lire(() => App.moteur.libre), 'le héros n\'a plus la main');
      sansErreur(erreurs, 'en marchant et en frappant');
    },
  },
];
