// Saga 1.32 : les outils de la séance au mode table (« La crypte de Brumeval ») : les jets tapés (/r, /gr),
// les macros et leurs @, les gabarits, le ping, les marques sur les pions, la règle à la souris. Et ce que
// chacun en voit : un jet secret ne sort pas chez les autres joueurs.
const fs = require('node:fs/promises');
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

const CAPTURES = process.env.CAPTURES || '';

module.exports = [
  {
    nom: 'Saga : les outils de la séance au mode table (Saga 1.32)',
    async faire(ctx) {
      const { page, erreurs, saga } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'jdr', { taille: 32 }), { ctx });
      // Un jeu JDR demande d'abord comment jouer : le mode table (le MJ).
      await page.getByText('Mode table (MJ)').click();
      // Saga 1.38 : le MJ commence sans héros ; il en prépare trois (pré-tirés) depuis le panneau.
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      vrai(await page.evaluate(() => !App.moteur.table.partie().equipe.length), 'le MJ commence sans héros');
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe()); for (const n of ['Thorgrim', 'Elaria', 'Pip']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(600); }
      await page.waitForFunction(() => App.moteur.table.actif && App.moteur.table.vue(), null, { timeout: 8000 });
      await page.waitForTimeout(500);

      // Le MJ lance des dés comme dans le chat.
      const jets = await saga.lire(() => {
        const T = App.moteur.table, j = () => T.partie().jdr.journal.at(-1);
        T.commande('/r 2d6+3 Épée longue');
        const a = j();
        T.commande('/gr d20 Perception du gobelin');
        const b = j();
        T.agir({ type: 'macro_ajouter', nom: 'Init', formule: '1d20+2' });
        T.commande('/m init');
        const c = j();
        return { a: [a.quoi, a.total >= 5 && a.total <= 15, a.des.length, a.cache], b: [b.quoi, b.cache], c: [c.quoi, c.formule], macros: T.table().macros.length };
      });
      egal(jets, { a: ['Épée longue', true, 2, false], b: ['Perception du gobelin', true], c: ['Init', '1d20+2'], macros: 1 }, 'les jets du MJ');

      // Un joueur : ses macros (avec ses @), son jet secret, que lui et le MJ voient, pas l'autre héros.
      const joueur = await saga.lire(() => {
        const T = App.moteur.table, jeu = T.jeu(), partie = T.partie();
        const [h1, h2] = partie.equipe.filter((c) => c.jdr);
        const r1 = { mj: false, perso: h1.creature, heros: h1.pion }, r2 = { mj: false, perso: h2?.creature, heros: h2?.pion };
        const ctxv = { carte: T.carte(), presents: [] };
        const ok = TableEtat.agir(jeu, partie, r1, { type: 'macro_ajouter', nom: 'Discrétion', formule: '1d20+@dex' }, ctxv).ok;
        const f = TableOutils.remplacer('1d20+@dex', TableOutils.refsHeros(jeu, h1));
        const mod = JdrBase.mod(JdrPerso.carac(jeu, h1, 'dex'));
        const l = JdrDes.noter(partie, { qui: 'h1', quoi: 'secret', formule: '1d20', des: [], total: 12, cache: true, voit: h1.pion });
        const voit = (r) => TableEtat.vue(jeu, partie, r, ctxv).journal.some((x) => x.n === l.n);
        return { ok, macros: TableEtat.vue(jeu, partie, r1, ctxv).macros.map((m) => m.nom), formule: f.formule === `1d20${mod >= 0 ? '+' : '-'}${Math.abs(mod)}`, lui: voit(r1), autre: h2 ? voit(r2) : false, mj: voit({ mj: true }) };
      });
      egal(joueur, { ok: true, macros: ['Discrétion'], formule: true, lui: true, autre: false, mj: true }, 'le jet secret d\'un joueur et ses macros');

      // Gabarits, ping, marques : vus de tous ; un joueur n'efface pas ceux des autres.
      const outils = await saga.lire(async () => {
        const T = App.moteur.table, jeu = T.jeu(), partie = T.partie();
        const h1 = partie.equipe.find((c) => c.jdr);
        const p = T.table().pions.find((q) => q.id === h1.pion);
        T.agir({ type: 'gabarit', forme: 'cone', x: p.x, y: p.y, vx: p.x + 4, vy: p.y, taille: 3, couleur: 'rouge' });
        T.agir({ type: 'gabarit', forme: 'cercle', x: p.x + 1, y: p.y - 3, taille: 1, couleur: 'bleu' });
        T.agir({ type: 'ping', x: p.x + 2, y: p.y });
        T.agir({ type: 'marque', pion: p.id, id: 'c-rouge' });
        T.agir({ type: 'marque', pion: p.id, id: (jeu.donnees.etats?.etats || [])[0]?.id || 'c-vert' });
        const r1 = { mj: false, perso: h1.creature, heros: h1.pion };
        const ctxv = { carte: T.carte(), presents: [] };
        const efface = TableEtat.agir(jeu, partie, r1, { type: 'gabarit_retirer' }, ctxv).ok;
        const v = TableEtat.vue(jeu, partie, r1, ctxv);
        await new Promise((r) => setTimeout(r, 150));
        const vmj = T.vue();
        return { gabarits: v.gabarits.length, mien: v.gabarits.some((g) => g.mien), efface, marques: v.pions.find((q) => q.id === p.id).marques.length, pings: vmj.pings.length, cone: TableOutils.casesGabarit(T.carte(), vmj.gabarits[0]).length > 3 };
      });
      egal(outils, { gabarits: 2, mien: false, efface: false, marques: 2, pings: 1, cone: true }, 'gabarits, ping et marques');

      // La règle : Maj + glisser sur le plateau mesure en cases et en mètres.
      const box = await page.locator('canvas.table-plateau').first().boundingBox();
      await page.keyboard.down('Shift');
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
      const regle = await saga.lire(() => App.moteur.table.outils.dessin()?.regle?.texte || '');
      vrai(/^\d+ cases? · [\d,]+ m$/.test(regle), `la règle dit « ${regle} »`);
      if (CAPTURES) { await fs.mkdir(CAPTURES, { recursive: true }); await page.screenshot({ path: `${CAPTURES}/1-mj-outils.png` }); }
      await page.mouse.up();
      await page.keyboard.up('Shift');
      // Un gabarit posé à la souris (outil G, un clic).
      await page.keyboard.press('g');
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35);
      await page.keyboard.press('Escape');
      // La vue est celle de la dernière image : on lui laisse le temps d'être redessinée (lent sur la CI).
      let n = 0;
      for (let i = 0; i < 30 && n !== 3; i++) { await page.waitForTimeout(100); n = await saga.lire(() => App.moteur.table.vue().gabarits.length); }
      egal(n, 3, 'le gabarit posé à la souris');
      sansErreur(erreurs, 'avec les outils de la table');

      // L'écran d'un joueur (Thorgrim) : il ne reçoit que sa vue ; sa barre de macros et ses outils envoient des demandes.
      const vueJoueur = await saga.lire(() => {
        const T = App.moteur.table, jeu = T.jeu(), partie = T.partie();
        const h1 = partie.equipe.find((c) => c.jdr);
        const r1 = { mj: false, perso: h1.creature, heros: h1.pion };
        TableEtat.agir(jeu, partie, r1, { type: 'gabarit', forme: 'ligne', x: 2, y: 8, vx: 9, vy: 8, taille: 6, couleur: 'violet' }, { carte: T.carte(), presents: [] });
        return JSON.stringify(TableEtat.vue(jeu, partie, r1, { carte: T.carte(), presents: [] }));
      });
      const html = await jeuDuModele(ctx, 'jdr', { taille: 32 });
      const ctx2 = await ctx.navigateur.newContext({ viewport: { width: 1280, height: 720 } });
      const pj = await ctx2.newPage();
      ctx.pages.push(pj);
      await pj.addInitScript(() => {
        let vrai = null;
        window.__demandes = [];
        Object.defineProperty(window, 'saga', {
          configurable: true,
          get: () => vrai,
          set: (v) => { vrai = Object.assign(v, { ecranJoueurs: { dossier: 'essai' }, onTableVue: (f) => { window.__vue = f; }, tableDemander: (a) => window.__demandes.push(a) }); },
        });
      });
      await pj.goto(`file://${html}`);
      await pj.waitForFunction(() => typeof window.__vue === 'function' && App?.jeu);
      await pj.evaluate((v) => window.__vue(v), vueJoueur);
      await pj.waitForTimeout(400);
      await pj.getByRole('button', { name: 'Discrétion' }).click();
      const pjBox = await pj.locator('canvas.table-plateau').boundingBox();
      await pj.keyboard.down('Alt');
      await pj.mouse.click(pjBox.x + pjBox.width / 2, pjBox.y + pjBox.height / 2);
      await pj.keyboard.up('Alt');
      const demandes = await pj.evaluate(() => window.__demandes.map((a) => a.type));
      egal(demandes, ['macro', 'ping'], 'les demandes de l\'écran du joueur');
      if (CAPTURES) await pj.screenshot({ path: `${CAPTURES}/2-pj.png` });
    },
  },
];
