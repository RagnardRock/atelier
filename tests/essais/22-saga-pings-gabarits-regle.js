// Saga 1.49 : la couleur d'un ping, les gabarits animés qui s'en vont au bout de quelques secondes, et la
// règle que tout le monde voit (le MJ peut mesurer en secret).
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

module.exports = [
  {
    nom: 'Saga : pings en couleur, gabarits animés, règle partagée (Saga 1.49)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'jdr', { taille: 32 }), { ctx });
      await page.getByText('Mode table (MJ)').click();
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      for (const n of ['Thorgrim', 'Elaria']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(500); }
      await page.waitForFunction(() => App.moteur.table.vue(), null, { timeout: 8000 });
      const box = await page.locator('canvas.table-plateau').first().boundingBox();
      const vue = (f, x) => page.evaluate(f, x);
      const attendre = async (f, voulu) => { let v; for (let i = 0; i < 30; i++) { v = await vue(f); if (JSON.stringify(v) === JSON.stringify(voulu)) break; await page.waitForTimeout(100); } return v; };

      // Un ping bleu : l'outil P, sa couleur, un clic.
      await page.keyboard.press('p');
      await page.locator('select[title="La couleur de mes pings"]').selectOption('bleu');
      await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.5);
      egal(await attendre(() => App.moteur.table.vue().pings.at(-1)?.couleur || '', '#5ea8ff'), '#5ea8ff', 'le ping prend la couleur choisie');

      // Un gabarit de flammes pour 3 s : l'outil G, l'animation, la durée, un clic.
      await page.keyboard.press('g');
      await page.locator('select[title="Une animation sur la zone"]').selectOption('flammes');
      await page.locator('select[title="Combien de temps il reste"]').selectOption('3');
      if (process.env.CAPTURES) { await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45); await page.waitForTimeout(300); await page.screenshot({ path: `${process.env.CAPTURES}/3-outil-gabarit.png` }); }
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.45);
      const g = await attendre(() => App.moteur.table.vue().gabarits.map((q) => [q.anim, q.duree]), [['flammes', 3]]);
      egal(g, [['flammes', 3]], 'le gabarit garde son animation et sa durée');
      await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('v');
      // Deux autres qui restent, pour voir l'eau et les cœurs.
      await page.evaluate(() => {
        const T = App.moteur.table, p = T.table().pions.find((q) => q.sorte === 'heros');
        T.agir({ type: 'gabarit', forme: 'cercle', x: p.x + 4, y: p.y + 1, taille: 1, couleur: 'bleu', anim: 'eau' });
        T.agir({ type: 'gabarit', forme: 'carre', x: p.x - 3, y: p.y + 2, taille: 2, couleur: 'rouge', anim: 'coeurs' });
      });
      if (process.env.CAPTURES) { await page.waitForTimeout(500); await page.screenshot({ path: `${process.env.CAPTURES}/1-gabarits-animes.png` }); }
      await page.waitForTimeout(3300);
      egal(await vue(() => App.moteur.table.vue().gabarits.map((q) => q.anim)), ['eau', 'coeurs'], 'au bout de 3 s, les flammes s\'en vont ; ceux sans durée restent');

      // La règle d'un joueur : le MJ la voit, pas lui (il a la sienne) ; puis elle s'efface quand il lâche.
      const r = await page.evaluate(() => {
        const T = App.moteur.table, h = T.partie().equipe.find((c) => c.jdr);
        const role = { mj: false, perso: h.creature, heros: h.pion };
        T.agir({ type: 'regle', de: { x: 2, y: 3 }, a: { x: 6, y: 3 }, texte: '4 cases · 6 m' }, role, 'Thorgrim');
        const mj = T.vuePour({ mj: true }).regles.map((q) => [q.qui, q.texte]);
        const lui = T.vuePour(role).regles.length;
        return { mj, lui, role };
      });
      egal([r.mj, r.lui], [[['Thorgrim', '4 cases · 6 m']], 0], 'le MJ voit la règle de Thorgrim, Thorgrim ne la reçoit pas en double');
      if (process.env.CAPTURES) { await page.waitForTimeout(300); await page.screenshot({ path: `${process.env.CAPTURES}/2-regle-joueur.png` }); }
      await page.evaluate((role) => App.moteur.table.agir({ type: 'regle' }, role, 'Thorgrim'), r.role);
      egal(await vue(() => App.moteur.table.vuePour({ mj: true }).regles.length), 0, 'la règle s\'efface quand il lâche');

      // La règle du MJ, à la souris : les joueurs la voient, sauf s'il la met en secret.
      const mesurer = async () => {
        await page.keyboard.down('Shift');
        await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55, { steps: 8 });
        await page.waitForTimeout(200);
        const n = await vue((role) => App.moteur.table.vuePour(role).regles.map((q) => q.qui), r.role);
        await page.mouse.up();
        await page.keyboard.up('Shift');
        return n;
      };
      egal(await mesurer(), ['MJ'], 'les joueurs voient la règle du MJ');
      egal(await vue((role) => App.moteur.table.vuePour(role).regles.length, r.role), 0, 'elle s\'efface quand il lâche');
      await page.keyboard.press('r');
      await page.locator('select[title="Qui voit ta règle"]').selectOption('mj');
      await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('v');
      egal(await mesurer(), [], 'une règle secrète ne part pas chez les joueurs');
      // X : le MJ efface tous les gabarits de la carte d'un coup (même ceux des joueurs).
      await page.evaluate(() => {
        const T = App.moteur.table, h = T.partie().equipe.find((c) => c.jdr);
        T.agir({ type: 'gabarit', forme: 'cercle', x: 3, y: 3, taille: 1, couleur: 'vert' }, { mj: false, perso: h.creature, heros: h.pion }, 'Thorgrim');
        document.activeElement?.blur();
      });
      await page.keyboard.press('x');
      egal(await vue(() => App.moteur.table.vuePour({ mj: true }).gabarits.length), 0, 'X : le MJ efface tous les gabarits');
      sansErreur(erreurs, 'Saga');
    },
  },
];
