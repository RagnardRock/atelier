// Saga 1.44 + Tafl 1.38 : l'initiative réglable : glisser, retarder, agir maintenant, l'ordre libre (aussi dans un
// combat de Saga, où le MJ choisit qui agit), le réglage du jeu dans Tafl.
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { ouvrirTafl, nouveauJeu } = require('../lib/tafl');
const { egal, vrai, sansErreur } = require('../lib/verifier');

module.exports = [
  {
    nom: 'Saga : initiative réglable, retarder, agir maintenant, ordre libre (Saga 1.44)',
    async faire(ctx) {
      const { page, erreurs } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'jdr', { taille: 32 }), { ctx });
      await page.getByText('Mode table (MJ)').click();
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      for (const n of ['Thorgrim', 'Elaria']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(500); }
      await page.waitForFunction(() => App.moteur.table.vue(), null, { timeout: 8000 });

      // L'initiative à la main : quatre lignes, A B C D.
      const main = await page.evaluate(() => {
        const T = App.moteur.table;
        for (const [nom, init] of [['A', 20], ['B', 15], ['C', 10], ['D', 5]]) T.agir({ type: 'init_ajouter', nom, init });
        const l = () => T.table().initiative.liste;
        const id = (n) => l().find((x) => x.nom === n).id;
        const actif = () => l().find((x) => x.id === T.table().initiative.actif)?.nom;
        const out = { debut: actif() };
        // B retarde (avant son tour) : Suivant saute B.
        T.agir({ type: 'init_retarder', id: id('B') });
        T.passerInitiative(1);
        out.saute = actif();
        // B agit maintenant : il passe avant C (le tour en cours) et joue.
        T.agirMaintenant(id('B'));
        out.agit = [actif(), l().map((x) => x.nom).join(''), Boolean(l().find((x) => x.nom === 'B').attend)];
        T.passerInitiative(1);
        out.ensuite = actif();
        // Glisser D en tête.
        T.agir({ type: 'init_placer', id: id('D'), index: 0 });
        out.glisse = l().map((x) => x.nom).join('');
        // L'ordre libre : pas de Suivant, « Agir » sur n'importe qui ; les joueurs le voient.
        T.ordreLibre(true);
        T.agirMaintenant(id('A'));
        out.libre = [actif(), l().map((x) => x.nom).join('')];
        const r = { mj: false, perso: null };
        out.joueur = TableEtat.vue(T.jeu(), T.partie(), r, { carte: T.carte(), presents: [] }).initiative.libre;
        return out;
      });
      egal(main, { debut: 'A', saute: 'C', agit: ['B', 'ABCD', false], ensuite: 'C', glisse: 'DABC', libre: ['A', 'DABC'], joueur: true },
        'retarder saute la ligne ; agir maintenant la place où l\'on en est ; glisser ; l\'ordre libre ne bouge rien');
      await page.locator('.table-onglet[title="Scène"]').click();
      await page.locator('.table-section-titre', { hasText: 'Initiative à la main' }).click();
      vrai(await page.locator('.ti-ordre .ti-init-libre').isVisible(), 'la barre du haut dit « Ordre libre »');
      // Glisser une ligne dans le panneau (C sur la première place).
      // Le panneau se redessine un peu après le clic (au plus 5 fois par seconde) : un glisser commencé sur une
      // ligne qui vient d'être remplacée ne tombe nulle part. On laisse le panneau se poser, et on reprend le geste
      // (jusqu'à trois fois) s'il a été perdu ; l'ordre attendu reste le même.
      const ordre = () => page.evaluate(() => App.moteur.table.table().initiative.liste.map((x) => x.nom).join(''));
      await page.locator('.table-init', { hasText: 'C' }).first().waitFor();
      for (let essai = 0; essai < 3 && (await ordre()) === 'DABC'; essai++) {
        await page.waitForTimeout(500);
        await page.locator('.table-init', { hasText: 'C' }).first().dragTo(page.locator('.table-init').first());
        await page.waitForFunction(() => App.moteur.table.table().initiative.liste.map((x) => x.nom).join('') !== 'DABC', null, { timeout: 1500 }).catch(() => {});
      }
      const apres = await ordre();
      egal(apres, 'CDAB', 'glisser une ligne du panneau la place');
      await page.evaluate(() => App.moteur.table.agir({ type: 'init_vider' }));

      // Saga 1.44 : une image déposée sur le plateau devient un pion ; un monstre du jeu posé en pleine séance.
      const depot = await page.evaluate(async () => {
        const T = App.moteur.table;
        const p = T.table().pions.find((q) => q.sorte === 'heros');
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 64);
        const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'garde_du_pont.png', { type: 'image/png' }));
        const q = T.pointDe(p.x + 2, p.y + 2);
        const cv = document.querySelector('canvas.table-plateau');
        cv.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: q.x, clientY: q.y, bubbles: true, cancelable: true }));
        await new Promise((ok) => setTimeout(ok, 600));
        const image = T.table().pions.find((x) => x.nom === 'garde du pont');
        const m = T.jeu().donnees.monstres_jdr.monstres_jdr[0];
        const r = T.agir({ type: 'pion_poser', monstre: m.id, x: p.x - 2, y: p.y, visible: 'mj' });
        const vj = TableEtat.vue(T.jeu(), T.partie(), { mj: false, perso: null }, { carte: T.carte(), presents: [] });
        return {
          image: image ? [image.x - p.x, image.y - p.y, /^jeton-/.test(image.jeton?.image || '')] : null,
          monstre: r.ok && r.pion.monstre === m.id && r.pion.pv === Math.max(1, Number(m.pv) || 4),
          cache: !vj.pions.some((x) => x.id === r.pion.id),
          refus: TableEtat.agir(T.jeu(), T.partie(), { mj: false, perso: null }, { type: 'pion_poser', monstre: m.id, x: 1, y: 1 }, { carte: T.carte(), presents: [] }).ok,
        };
      });
      egal(depot, { image: [2, 2, true], monstre: true, cache: true, refus: false }, 'l\'image déposée devient un pion à sa case ; un monstre du jeu se pose, caché ; un joueur ne pose rien');
      await page.waitForTimeout(300);
      if (process.env.CAPTURES) await page.screenshot({ path: `${process.env.CAPTURES}/2-pions-ajoutes.png` });

      // Un combat de Saga en ordre libre : le MJ choisit qui agit.
      await page.evaluate(() => { const T = App.moteur.table; const g = T.jeu().donnees.groupes.groupes; const p = T.table().pions.find((q) => q.sorte === 'heros'); T.agir({ type: 'groupe', groupe: g[0].id, x: p.x + 3, y: p.y }); });
      await page.waitForTimeout(300);
      const posees = await page.evaluate(() => { const T = App.moteur.table; const r = T.rencontresPosees(); T.lancerRencontres(r.map((x) => x.id)); T.ordreLibre(true); return r.length; });
      egal(posees, 1, 'une rencontre posée');
      await page.waitForSelector('#scene > .table-combat:not([hidden])');
      for (let i = 0; i < 15 && !(await page.locator('.table-combat-titre', { hasText: 'Ordre libre' }).count()); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(500); }
      const options = await page.locator('.table-combat-option').allTextContents();
      vrai(options.length >= 3, `le MJ choisit parmi tous (${options.length})`);
      if (process.env.CAPTURES) {
        // Les dés de l'initiative s'effacent d'eux-mêmes : la capture montre le choix du MJ.
        await page.waitForTimeout(8000);
        await page.screenshot({ path: `${process.env.CAPTURES}/1-ordre-libre.png` });
      }
      const dernier = options[options.length - 1].trim();
      await page.locator('.table-combat-option').last().click();
      await page.waitForTimeout(400);
      const choisi = await page.evaluate(() => { const c = App.moteur.table.combat; return c.ordre.find((o) => o.id === c.actif)?.nom || ''; });
      egal(choisi, dernier, 'celui que le MJ a choisi agit');
      // Retour à l'ordre fixe, et « agir maintenant » sur celui qui n'a pas joué : il sera le prochain.
      const fixe = await page.evaluate(() => {
        const T = App.moteur.table, c = T.combat;
        T.ordreLibre(false);
        const id = c.attente[c.attente.length - 1];
        T.agirMaintenant(id);
        const a = c.ordre.findIndex((o) => o.id === c.actif);
        return { libre: c.libre, place: c.ordre.findIndex((o) => o.id === id) === a + 1 };
      });
      egal(fixe, { libre: false, place: true }, 'agir maintenant, en combat : juste après celui qui joue');
      sansErreur(erreurs, 'Saga');
    },
  },
  {
    nom: 'Tafl : l\'ordre des tours (fixe ou libre) dans les mécaniques (Tafl 1.38)',
    async faire(ctx) {
      const t = await ouvrirTafl(ctx.navigateur, ctx);
      await nouveauJeu(t.page, 'jdr', { taille: 32 });
      const r = await t.page.evaluate(() => {
        const m = DonneesJdr.normMeca({ initiative: { mode: 'jet', ordre: 'libre' } });
        const n = DonneesJdr.normMeca({ initiative: { ordre: 'nimporte' } });
        return [m.initiative.ordre, n.initiative.ordre];
      });
      egal(r, ['libre', ''], 'l\'ordre libre se garde ; une valeur inconnue redevient fixe');
      sansErreur(t.erreurs, 'Tafl');
    },
  },
];
