// Saga 1.43 : le calque du MJ (le feutre et les notes, pour lui seul ou pour tous) et l'initiative tenue à la main.
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

module.exports = [
  {
    nom: 'Saga : calque du MJ et initiative à la main (Saga 1.43)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'jdr', { taille: 32 }), { ctx });
      await page.getByText('Mode table (MJ)').click();
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      for (const n of ['Thorgrim', 'Elaria']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(500); }
      await page.waitForFunction(() => App.moteur.table.vue(), null, { timeout: 8000 });

      // Le feutre à la souris : un trait sur le calque du MJ (le réglage par défaut du MJ).
      const pos = await page.evaluate(() => { const T = App.moteur.table; const p = T.table().pions.find((q) => q.sorte === 'heros'); return { a: T.pointDe(p.x + 1, p.y), b: T.pointDe(p.x + 3, p.y + 1), c: T.pointDe(p.x + 2, p.y - 1), x: p.x, y: p.y }; });
      await page.keyboard.press('f');
      await page.mouse.move(pos.a.x, pos.a.y);
      await page.mouse.down();
      for (let k = 1; k <= 8; k++) await page.mouse.move(pos.a.x + ((pos.b.x - pos.a.x) * k) / 8, pos.a.y + ((pos.b.y - pos.a.y) * k) / 8);
      await page.mouse.up();
      // Une note pour tous : le calque change, le texte s'écrit, un clic la pose.
      await page.keyboard.press('t');
      await page.locator('.table-outils select[title="Qui voit ce que tu dessines"]').selectOption('tous');
      await page.locator('.table-outil-texte').fill('Porte piégée');
      await page.mouse.click(pos.c.x, pos.c.y);
      await page.keyboard.press('v');
      await page.waitForTimeout(300);
      if (process.env.CAPTURES) await page.screenshot({ path: `${process.env.CAPTURES}/1-calque-mj.png` });
      const calque = await page.evaluate(() => {
        const T = App.moteur.table, jeu = T.jeu(), partie = T.partie();
        const ctxv = { carte: T.carte(), presents: [] };
        const h1 = partie.equipe.find((c) => c.jdr);
        const r1 = { mj: false, perso: h1.creature, heros: h1.pion };
        const mj = TableEtat.vue(jeu, partie, { mj: true }, ctxv), lui = TableEtat.vue(jeu, partie, r1, ctxv);
        // Un joueur dessine aussi (pour tous), mais pas sur le calque du MJ, et n'efface pas ce qui n'est pas à lui.
        const sien = TableEtat.agir(jeu, partie, r1, { type: 'dessin', points: [[1, 1], [2, 2]], couleur: 'bleu', visible: 'mj' }, ctxv).ok;
        const apres = TableEtat.vue(jeu, partie, r1, ctxv);
        const effaceMj = TableEtat.agir(jeu, partie, r1, { type: 'dessin_retirer', id: mj.notes[0]?.id }, ctxv).ok;
        return {
          mj: [mj.dessins.length, mj.dessins[0]?.visible, mj.dessins[0]?.points.length > 3, mj.notes.map((n) => [n.texte, n.visible])],
          joueur: [lui.dessins.length, lui.notes.map((n) => n.texte)],
          sien, sienVisible: apres.dessins.map((d) => d.visible), effaceMj,
        };
      });
      egal(calque.mj, [1, 'mj', true, [['Porte piégée', 'tous']]], 'le trait au feutre est sur le calque du MJ ; la note est pour tous');
      egal(calque.joueur, [0, ['Porte piégée']], 'un joueur ne voit pas le calque du MJ, mais voit la note');
      vrai(calque.sien && calque.sienVisible.length === 1 && calque.sienVisible[0] === 'tous', 'le dessin d\'un joueur est pour tous');
      vrai(!calque.effaceMj, 'un joueur n\'efface pas la note du MJ');
      // Le MJ efface son calque (la corbeille du feutre) : la note pour tous reste.
      await page.keyboard.press('f');
      await page.locator('.table-outils select[title="Qui voit ce que tu dessines"]').selectOption('mj');
      await page.locator('.table-outils button[title="Effacer les dessins et notes de ce calque"]').click();
      await page.keyboard.press('v');
      await page.waitForTimeout(200);
      const reste = await page.evaluate(() => { const e = TableEtat.etatCarte(App.moteur.table.table(), App.moteur.table.carte().id); return [e.dessins.map((d) => d.visible), e.notes.length]; });
      egal(reste, [['tous'], 1], 'effacer le calque du MJ ne touche pas au reste');

      // L'initiative à la main : jeter pour tous, une ligne libre, monter, passer le tour, ce que voit un joueur.
      await page.locator('.table-onglet[title="Scène"]').click();
      await page.locator('.table-section-titre', { hasText: 'Initiative à la main' }).click();
      await page.getByRole('button', { name: 'Jeter pour tous' }).click();
      await page.waitForTimeout(300);
      const ajout = page.locator('.table-init-ajout');
      if (await ajout.locator('select').count()) await ajout.locator('select').selectOption('');
      await ajout.locator('.table-init-texte').fill('Le piège');
      await ajout.locator('.table-init-chiffre').fill('30');
      await ajout.getByRole('button', { name: 'Ajouter' }).click();
      await page.waitForTimeout(200);
      const ini = await page.evaluate(() => {
        const T = App.moteur.table, jeu = T.jeu(), partie = T.partie();
        const l = T.table().initiative.liste;
        const h1 = partie.equipe.find((c) => c.jdr);
        const r1 = { mj: false, perso: h1.creature, heros: h1.pion };
        const v = TableEtat.vue(jeu, partie, r1, { carte: T.carte(), presents: [] }).initiative;
        const triee = l.every((x, k) => !k || l[k - 1].init >= x.init);
        return { n: l.length, premier: l[0].nom, actif: l.findIndex((x) => x.id === T.table().initiative.actif), triee, joueur: v ? [v.ordre.length, v.ordre.some((o) => 'init' in o), v.manuel] : null };
      });
      vrai(ini.n === 3 && ini.premier === 'Le piège' && ini.actif === 1 && ini.triee, 'les héros jettent leur initiative ; la ligne libre se range à sa place, en tête (le tour en cours ne change pas)');
      egal(ini.joueur, [3, false, true], 'le joueur voit l\'ordre, sans les chiffres');
      // Passer le tour (le bouton en haut du plateau), descendre une ligne, retirer, puis un nouveau tour.
      await page.locator('.ti-ordre button', { hasText: 'Suivant' }).click();
      const deux = await page.evaluate(() => { const t = App.moteur.table.table().initiative; return t.liste.findIndex((x) => x.id === t.actif); });
      egal(deux, 2, 'Suivant passe au suivant');
      await page.evaluate(() => { const T = App.moteur.table; const l = T.table().initiative.liste; T.agir({ type: 'init_monter', id: l[0].id, sens: 1 }); });
      const ordre = await page.evaluate(() => App.moteur.table.table().initiative.liste.map((x) => x.nom));
      egal(ordre[1], 'Le piège', 'une ligne descend d\'un cran');
      await page.evaluate(() => { const T = App.moteur.table; T.passerInitiative(1); T.passerInitiative(1); });
      const tour = await page.evaluate(() => { const t = App.moteur.table.table().initiative; return [t.tour, t.liste.findIndex((x) => x.id === t.actif)]; });
      egal(tour, [2, 1], 'après le dernier, un nouveau tour commence en tête');
      await page.waitForTimeout(300);
      if (process.env.CAPTURES) await page.screenshot({ path: `${process.env.CAPTURES}/2-initiative.png` });
      const retire = await page.evaluate(() => { const T = App.moteur.table; const l = T.table().initiative.liste; T.agir({ type: 'init_retirer', id: l.find((x) => x.nom === 'Le piège').id }); const r = TableEtat.agir(T.jeu(), T.partie(), { mj: false, perso: 'x' }, { type: 'init_vider' }, { carte: T.carte(), presents: [] }); return [T.table().initiative.liste.length, r.ok]; });
      egal(retire, [2, false], 'retirer une ligne ; un joueur ne touche pas à l\'initiative');
      sansErreur(erreurs, 'Saga');
    },
  },
];
