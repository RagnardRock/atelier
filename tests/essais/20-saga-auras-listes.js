// Saga 1.48 : une aura autour d'un pion (qui la voit, elle le suit) et les listes de lecture du MJ (un morceau
// après l'autre, au hasard ou dans l'ordre, en boucle).
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

// Un WAV de silence (8 kHz, 8 bits) de d secondes.
function wav(d) {
  const n = Math.round(8000 * d), b = Buffer.alloc(44 + n, 128);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b.toString('base64');
}

module.exports = [
  {
    nom: 'Saga : auras et listes de lecture du MJ (Saga 1.48)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'jdr', { taille: 32 }), { ctx });
      await page.evaluate((b) => { window.SAGA_SONS = { 'sons/un.wav': b, 'sons/deux.wav': b }; }, wav(0.8));
      await page.getByText('Mode table (MJ)').click();
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      for (const n of ['Thorgrim', 'Elaria']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(500); }
      await page.waitForFunction(() => App.moteur.table.vue(), null, { timeout: 8000 });

      // Une aura de 3 m autour d'un héros, puis vue du MJ seul.
      const aura = await page.evaluate(() => {
        const T = App.moteur.table;
        const p = T.table().pions.find((q) => q.sorte === 'heros');
        const vue = (mj) => TableEtat.vue(T.jeu(), T.partie(), mj ? { mj: true } : { mj: false, perso: null }, { carte: T.carte(), presents: [] }).pions.find((q) => q.id === p.id).aura || null;
        T.agir({ type: 'aura', pion: p.id, metres: 3, couleur: 'bleu' });
        const tous = vue(false);
        T.agir({ type: 'aura', pion: p.id, metres: 3, visible: 'mj' });
        const cachee = [vue(false), vue(true)?.visible];
        T.agir({ type: 'aura', pion: p.id, metres: 3, visible: 'tous' });
        T.selection = null;
        return { tous, cachee };
      });
      egal(aura.tous, { rayon: 2, couleur: 'bleu' }, 'une aura de 3 m (2 cases), bleue, que les joueurs voient');
      egal(aura.cachee, [null, 'mj'], 'une aura du MJ seul ne part pas chez les joueurs');
      await page.locator('.table-onglet[title="Pions"]').click();
      vrai(await page.locator('.table-carte-pion select[title^="Un cercle"]').count() >= 2, 'chaque pion a son aura dans l\'onglet Pions');
      if (process.env.CAPTURES) { await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.CAPTURES}/2-aura.png` }); }

      // Une liste de deux morceaux : ils s'enchaînent, puis la liste recommence.
      await page.locator('.table-onglet[title="Scène"]').click();
      await page.locator('.table-section-titre', { hasText: 'Musique' }).click();
      await page.getByRole('button', { name: 'Nouvelle liste' }).click();
      const id = await page.evaluate(() => App.moteur.table.table().listes[0].id);
      for (const m of ['sons/un.wav', 'sons/deux.wav']) await page.evaluate(([i, x]) => App.moteur.table.agir({ type: 'liste_modifier', id: i, ajouter: x }), [id, m]);
      if (process.env.CAPTURES) { await page.waitForTimeout(300); await page.screenshot({ path: `${process.env.CAPTURES}/1-liste-lecture.png` }); }
      await page.locator('.table-ligne.son', { hasText: 'Liste 1 (2)' }).locator('button[title="Jouer la liste"]').click();
      const joues = [];
      for (let i = 0; i < 40 && joues.length < 3; i++) {
        const c = await page.evaluate(() => App.moteur.table.lecture()?.chemin || '');
        if (c && c !== joues[joues.length - 1]) joues.push(c);
        await page.waitForTimeout(150);
      }
      egal(joues, ['sons/un.wav', 'sons/deux.wav', 'sons/un.wav'], 'les morceaux s\'enchaînent dans l\'ordre, en boucle');
      // Une autre musique arrête la liste.
      await page.evaluate(() => App.moteur.table.musique('aucune'));
      egal(await page.evaluate(() => App.moteur.table.lecture()), null, 'une autre musique arrête la liste');
      sansErreur(erreurs, 'Saga');
    },
  },
];
