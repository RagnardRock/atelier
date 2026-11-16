// Saga 1.45 + Tafl 1.39 : la vision dynamique du mode table (lignes de vue, murs, ce qui a été vu, le noir, la
// lumière des pions, la vision dans le noir) et les tuiles « transparentes » de Tafl (l'eau : bloque le pas, pas la vue).
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { ouvrirTafl, nouveauJeu, fichiersDuJeu } = require('../lib/tafl');
const { egal, vrai, sansErreur } = require('../lib/verifier');
const TableVision = require('../../moteur/renderer/moteur/table/vision.js');

module.exports = [
  {
    nom: 'Vision : lignes de vue, murs et tuiles transparentes (calcul pur)',
    async faire() {
      // Une pièce de 9 × 5, un mur au milieu (x = 4) avec une case d'eau transparente (y = 2).
      const W = 9, H = 5;
      const carte = { largeur: W, hauteur: H, collisions: new Int32Array(W * H).fill(1), calques: [{ profondeur: 'sol', cases: new Int32Array(W * H).fill(0) }] };
      for (let y = 0; y < H; y++) carte.collisions[y * W + 4] = 2;
      carte.calques[0].cases[2 * W + 4] = 1;
      const op = TableVision.opaque(carte, [{}, { transparent: true }]);
      egal([op[0 * W + 4], op[2 * W + 4]], [1, 0], 'le mur arrête la vue, l\'eau non');
      const champ = TableVision.champ(carte, op, 1, 2, 10);
      vrai(champ.has(2 * W + 7) && !champ.has(0 * W + 7) && champ.has(0 * W + 4), 'à travers l\'eau on voit en face ; derrière le mur, non ; le mur lui-même se voit');
      const noir = TableVision.voit(carte, op, [{ x: 1, y: 2, nuit: 0 }], [], 'sombre');
      const torche = TableVision.voit(carte, op, [{ x: 1, y: 2, nuit: 0 }], [{ x: 1, y: 2, rayon: 2 }], 'sombre');
      const loin = TableVision.voit(carte, op, [{ x: 1, y: 2, nuit: 0 }], [{ x: 7, y: 2, rayon: 1 }], 'sombre');
      vrai(noir.size <= 9 && torche.size > noir.size, `dans le noir, à tâtons (${noir.size}) ; une torche éclaire autour (${torche.size})`);
      vrai(loin.has(2 * W + 7) && !loin.has(2 * W + 6 - 1), 'une lumière au loin, en vue, se voit (sans ce qui est entre)');
    },
  },
  {
    nom: 'Saga : la vision dynamique au mode table (Saga 1.45)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'jdr', { taille: 32 }), { ctx });
      await page.getByText('Mode table (MJ)').click();
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      for (const n of ['Thorgrim', 'Elaria']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(500); }
      await page.waitForFunction(() => App.moteur.table.vue(), null, { timeout: 8000 });
      await page.locator('.table-onglet[title="Scène"]').click();
      await page.locator('.table-section-titre', { hasText: 'Vision et lumière' }).click();
      await page.locator('.table-section', { hasText: 'Vision et lumière' }).locator('select').first().selectOption('jour');
      const jour = await page.evaluate(() => {
        const T = App.moteur.table, jeu = T.jeu(), partie = T.partie(), carte = T.carte();
        const ctxv = { carte, presents: [] };
        const v = () => TableEtat.vue(jeu, partie, { mj: false, perso: null }, ctxv);
        const compte = (m, c) => [...m].filter((x) => x === c).length;
        const op = TableVision.opaque(carte, jeu.tuiles);
        const a = v();
        const [h1] = T.table().pions.filter((p) => p.sorte === 'heros');
        // Une case cachée par un mur : opaque entre elle et chaque héros.
        const W = carte.largeur;
        let derriere = -1;
        for (let i = 0; i < a.masque.length && derriere < 0; i++) if (a.masque[i] === '0' && !op[i]) derriere = i;
        // Un monstre posé là, puis les héros s'en vont : les cases vues restent explorées (2), sans le monstre.
        const avant = compte(a.masque, '1');
        // Là où les héros iront (un coin libre loin d'eux) : ce qu'ils verront de là.
        let B = null;
        for (let y = 0; y < carte.hauteur && !B; y++) for (let x = 0; x < W && !B; x++) if (TableGrille.libre(carte, x, y) && Math.abs(x - h1.x) + Math.abs(y - h1.y) > 12) B = { x, y };
        const deB = TableVision.voit(carte, op, [{ x: B.x, y: B.y, nuit: 0 }], [], 'jour');
        const occupee = (i) => T.table().pions.some((p) => p.carte === carte.id && p.y * W + p.x === i);
        const cible = [...a.masque].map((c, i) => (c === '1' ? i : -1)).find((i) => i >= 0 && !deB.has(i) && TableGrille.libre(carte, i % W, Math.floor(i / W)) && !occupee(i));
        const m = jeu.donnees.monstres_jdr.monstres_jdr[0];
        const r = T.agir({ type: 'pion_poser', monstre: m.id, x: cible % W, y: Math.floor(cible / W) });
        const vuAvant = v().pions.some((p) => p.id === r.pion.id);
        for (const p of T.table().pions.filter((q) => q.sorte === 'heros')) { p.x = B.x; p.y = B.y; }
        const b = v();
        const ici = b.masque[r.pion.y * W + r.pion.x];
        return { brouillard: a.brouillard, avant, derriere: derriere >= 0, vuAvant, ici, vuApres: b.pions.some((p) => p.id === r.pion.id), mj: TableEtat.vue(jeu, partie, { mj: true }, ctxv).pions.some((p) => p.id === r.pion.id) };
      });
      vrai(jour.brouillard && jour.avant > 20 && jour.derriere, `en plein jour, les héros voient loin (${jour.avant} cases), pas derrière les murs`);
      egal([jour.vuAvant, jour.ici, jour.vuApres, jour.mj], [true, '2', false, true], 'une case vue reste explorée, sans le monstre qui s\'y tient ; le MJ le voit toujours');

      // Dans le noir : à tâtons, puis une torche, puis la vision dans le noir du nain.
      const noir = await page.evaluate(() => {
        const T = App.moteur.table, jeu = T.jeu(), partie = T.partie(), carte = T.carte();
        const ctxv = { carte, presents: [] };
        T.agir({ type: 'vision', valeur: 'sombre' });
        T.agir({ type: 'vision_oublier' });
        const heros = T.table().pions.filter((q) => q.sorte === 'heros');
        heros.forEach((p, k) => { p.x = Math.floor(carte.largeur / 2) + k; p.y = Math.floor(carte.hauteur / 2) + 2; });
        for (const p of heros) T.agir({ type: 'nuit', pion: p.id, metres: 0 });
        const voit = () => [...TableEtat.vue(jeu, partie, { mj: false, perso: null }, ctxv).masque].filter((c) => c === '1').length;
        const tatons = voit();
        T.agir({ type: 'lumiere', pion: heros[0].id, metres: 9 });
        const torche = voit();
        T.agir({ type: 'lumiere', pion: heros[0].id, metres: '' });
        T.agir({ type: 'nuit', pion: heros[0].id, metres: '' });
        const nain = voit();
        const auto = TableVision.visionNuit(jeu, TableEtat.membreDe(partie, heros[0]));
        return { tatons, torche, nain, auto };
      });
      vrai(noir.tatons <= 18 && noir.torche > noir.tatons && noir.nain > noir.tatons && noir.auto === 18,
        `dans le noir : à tâtons ${noir.tatons}, avec une lanterne ${noir.torche}, vision dans le noir de son origine (${noir.auto} m) ${noir.nain}`);
      // Ce que voit l'écran d'un joueur, avec une torche.
      await page.evaluate(() => { const T = App.moteur.table; const h = T.table().pions.find((q) => q.sorte === 'heros'); T.agir({ type: 'lumiere', pion: h.id, metres: 6 }); T.agir({ type: 'nuit', pion: h.id, metres: 0 }); T.apercu = { mj: false, perso: null }; });
      await page.waitForTimeout(500);
      if (process.env.CAPTURES) await page.screenshot({ path: `${process.env.CAPTURES}/1-vision-noir.png` });
      await page.evaluate(() => { App.moteur.table.apercu = null; });
      // Le panneau du MJ : la lumière et la vision des pions, dans l'onglet Pions.
      await page.locator('.table-onglet[title="Pions"]').click();
      vrai(await page.locator('.table-carte-pion select[title^="La lumière"]').count() >= 2, 'chaque pion a sa lumière');
      vrai(await page.locator('.table-carte-pion select[title^="Jusqu"]').count() === 2, 'chaque héros a sa vision dans le noir');
      if (process.env.CAPTURES) { await page.waitForTimeout(300); await page.screenshot({ path: `${process.env.CAPTURES}/2-vision-mj.png` }); }
      sansErreur(erreurs, 'Saga');
    },
  },
  {
    nom: 'Tafl : une tuile transparente (bloque le pas, pas la vue) s\'enregistre (Tafl 1.39)',
    async faire(ctx) {
      const t = await ouvrirTafl(ctx.navigateur, ctx);
      await nouveauJeu(t.page, 'jdr', { taille: 32 });
      await t.page.evaluate(() => { const d = App.doc; Doc.change(d, 'essai', () => { d.tiles[0] = { ...d.tiles[0], passage: 'bloque', transparent: true }; }); });
      const fichiers = await fichiersDuJeu(t.page);
      const cle = Object.keys(fichiers).find((k) => { try { return Array.isArray(JSON.parse(fichiers[k]).tiles); } catch { return false; } });
      const json = JSON.parse(fichiers[cle] || '{}');
      egal([json.tiles?.[0]?.transparent, json.tiles?.[1]?.transparent], [true, undefined], 'la tuile garde « transparente »');
      sansErreur(t.erreurs, 'Tafl');
    },
  },
];
