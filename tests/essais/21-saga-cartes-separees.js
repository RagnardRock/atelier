// Saga 1.48 : des joueurs sur des cartes différentes en même temps. Le MJ envoie un héros ailleurs ; son joueur
// voit cette carte-là ; « Y aller seul » laisse le groupe en place ; un « Y aller » normal n'emmène que le groupe.
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

module.exports = [
  {
    nom: 'Saga : joueurs sur des cartes différentes (Saga 1.48)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'jdr', { taille: 32 }), { ctx });
      await page.getByText('Mode table (MJ)').click();
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      for (const n of ['Thorgrim', 'Elaria']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(500); }
      await page.waitForFunction(() => App.moteur.table.vue(), null, { timeout: 8000 });

      const r = await page.evaluate(() => {
        const T = App.moteur.table;
        const ici = T.carte().id;
        const autre = [...T.jeu().cartes.keys()].find((k) => k !== ici);
        const heros = T.table().pions.filter((p) => p.sorte === 'heros');
        const [a, b] = heros;
        const roleDe = (p) => { const c = T.partie().equipe.find((q) => q?.jdr && q.pion === p.id); return { mj: false, perso: c.creature, heros: p.id }; };
        const out = { autre: Boolean(autre), n: heros.length };
        out.envoye = T.envoyerHeros(a.id, autre);
        out.carteA = T.vuePour(roleDe(a)).carte === autre;
        out.carteB = T.vuePour(roleDe(b)).carte === ici;
        out.mj = T.vuePour({ mj: true }).carte === ici;
        out.ailleurs = T.herosAilleurs().map((p) => p.id);
        out.a = a.id;
        return out;
      });
      vrai(r.autre && r.n >= 2, 'le jeu a deux cartes et deux héros');
      vrai(r.envoye, 'le MJ envoie un héros sur une autre carte');
      vrai(r.carteA && r.carteB && r.mj, 'chaque joueur voit la carte de son héros, le MJ la sienne');
      egal(r.ailleurs, [r.a], 'le héros envoyé est listé « sur une autre carte »');
      await page.locator('.table-onglet[title="Pions"]').click();
      vrai(await page.getByText('Sur une autre carte').count() >= 1, 'l\'onglet Pions montre les héros ailleurs');
      if (process.env.CAPTURES) { await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.CAPTURES}/1-ailleurs.png` }); }

      // Le MJ y va seul : le reste du groupe reste en place.
      const seul = await page.evaluate(async () => {
        const T = App.moteur.table;
        const ici = T.carte().id, autre = T.herosAilleurs()[0].carte;
        T.allerCarte(autre, { seul: true });
        for (let i = 0; i < 60 && T.carte()?.id !== autre; i++) await new Promise((f) => setTimeout(f, 100));
        for (let i = 0; i < 30 && T.occupe(); i++) await new Promise((f) => setTimeout(f, 100));
        const heros = T.table().pions.filter((p) => p.sorte === 'heros');
        return { arrive: T.carte()?.id === autre, cartes: heros.map((p) => p.carte), ici, autre, ailleurs: heros.map((p) => Boolean(p.ailleurs)) };
      });
      vrai(seul.arrive, 'le MJ arrive sur l\'autre carte');
      egal([...seul.cartes].sort(), [seul.autre, seul.ici].sort(), 'en y allant seul, le reste du groupe ne suit pas');
      egal(seul.ailleurs, seul.cartes.map((c) => c !== seul.autre), 'ceux qu\'il retrouve rejoignent le groupe, les autres sont ailleurs');

      // « Y aller » normal vers la première carte : seul le groupe suit, le héros resté là-bas y est déjà.
      const tous = await page.evaluate(async (ici) => {
        const T = App.moteur.table;
        T.allerCarte(ici);
        for (let i = 0; i < 60 && T.carte()?.id !== ici; i++) await new Promise((f) => setTimeout(f, 100));
        for (let i = 0; i < 30 && T.occupe(); i++) await new Promise((f) => setTimeout(f, 100));
        return { cartes: T.table().pions.filter((p) => p.sorte === 'heros').map((p) => p.carte), ailleurs: T.herosAilleurs().length };
      }, seul.ici);
      egal(tous, { cartes: [seul.ici, seul.ici], ailleurs: 0 }, 'le groupe réuni sur la même carte');
      sansErreur(erreurs, 'Saga');
    },
  },
];
