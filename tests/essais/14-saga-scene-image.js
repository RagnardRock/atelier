// Saga 1.42 + Tafl 1.37 : une scène image (une battlemap, un lieu) : une image en fond, une grille dessus.
// Le MJ y emmène le groupe depuis l'onglet Scène ; les pions s'y posent comme ailleurs.
const { ouvrirTafl, nouveauJeu, fichiersDuJeu } = require('../lib/tafl');
const { exporter, ouvrirSaga } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

module.exports = [
  {
    nom: 'Saga : une scène image dans le mode table (Saga 1.42, Tafl 1.37)',
    async faire(ctx) {
      // Tafl : une scène, faite comme le menu Carte › Nouvelle scène (sans la fenêtre du fichier).
      const t = await ouvrirTafl(ctx.navigateur, ctx);
      await nouveauJeu(t.page, 'jdr', { taille: 32 });
      const tafl = await t.page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 640; c.height = 384;
        const g = c.getContext('2d');
        const d = g.createLinearGradient(0, 0, 640, 384);
        d.addColorStop(0, '#3a5f3a'); d.addColorStop(1, '#8a6a3a');
        g.fillStyle = d; g.fillRect(0, 0, 640, 384);
        g.fillStyle = '#d8cfa8'; g.fillRect(260, 0, 120, 384); // un chemin
        g.fillStyle = '#2b4a8a'; g.beginPath(); g.arc(120, 120, 70, 0, 7); g.fill(); // un étang
        const fond = c.toDataURL('image/jpeg', 0.85);
        const doc = App.doc;
        Doc.change(doc, 'Nouvelle scène', () => Doc.addMap(doc, { name: 'La clairière', width: 20, height: 12, interieur: true }));
        doc.maps[doc.mapIndex] = { ...doc.map, fond };
        Doc.selectMap(doc, doc.mapIndex);
        return { id: doc.map.id, fond: Boolean(doc.map.fond) };
      });
      vrai(tafl.fond, 'Tafl garde l\'image de fond de la scène');
      const fichiers = await fichiersDuJeu(t.page);
      const json = JSON.parse(Object.entries(fichiers).find(([k]) => k.endsWith(`cartes/${tafl.id}.json`))?.[1] || '{}');
      vrai(/^data:image\/jpeg;base64,/.test(json.fond?.image || ''), 'la carte enregistrée a son fond');
      await t.page.context().close();

      // Saga : le MJ emmène le groupe sur la scène.
      const { page, erreurs } = await ouvrirSaga(ctx.navigateur, await exporter(fichiers, 'scene'), { ctx });
      await page.getByText('Mode table (MJ)').click();
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      for (const n of ['Thorgrim', 'Elaria']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(400); }
      const avant = await page.evaluate((id) => ({ fond: Boolean(App.moteur.table.jeu().cartes.get(id)?.fond), ici: App.moteur.table.carte().id }), tafl.id);
      vrai(avant.fond, 'Saga lit la scène et son image');
      await page.locator('.table-onglet[title="Scène"]').click();
      await page.locator('.table-section-titre', { hasText: 'Cartes et scènes' }).click();
      const bouton = page.locator('.table-ligne', { hasText: 'La clairière' }).getByRole('button', { name: 'Y aller' });
      await bouton.click();
      await page.waitForFunction((id) => App.moteur.table.carte().id === id && !App.moteur.table.occupe(), tafl.id, { timeout: 8000 });
      await page.waitForTimeout(600);
      const apres = await page.evaluate((id) => {
        const T = App.moteur.table;
        const heros = T.table().pions.filter((p) => p.sorte === 'heros');
        return { pions: heros.filter((p) => p.carte === id).length, total: heros.length, image: T.carte().fond.img.complete && T.carte().fond.img.naturalWidth > 0 };
      }, tafl.id);
      egal(apres.pions, apres.total, 'les pions du groupe arrivent sur la scène');
      vrai(apres.image, 'l\'image de la scène est chargée');
      // Les jetons : une image importée pour Thorgrim, un personnage du jeu (son sprite) pour Elaria, puis retour par défaut.
      const jetons = await page.evaluate(() => {
        const T = App.moteur.table;
        const [thor, ela] = T.table().pions.filter((p) => p.sorte === 'heros');
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const g = c.getContext('2d'); g.fillStyle = '#7a4a2a'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#e8c27a'; g.beginPath(); g.arc(64, 54, 30, 0, 7); g.fill();
        const image = c.toDataURL('image/png');
        const r1 = T.agir({ type: 'jeton', pion: thor.id, image });
        const perso = [...T.jeu().personnages.values()].find((x) => x.id !== 'aventurier') || [...T.jeu().personnages.values()][0];
        const r2 = perso ? T.agir({ type: 'jeton', pion: ela.id, personnage: perso.id }) : { ok: false };
        const refus = T.agir({ type: 'jeton', pion: thor.id, image: 'data:text/html;base64,AAAA' });
        const vue = T.vuePour ? T.vuePour({ mj: false, perso: null }) : null;
        return {
          ok: [r1.ok, r2.ok, refus.ok], images: Object.keys(T.table().jetons).length,
          thor: thor.jeton, ela: ela.jeton, perso: perso?.id || '',
          vue: vue ? vue.pions.filter((p) => p.jeton).length : -1,
        };
      });
      egal(jetons.ok, [true, true, false], 'le MJ donne un jeton image, un jeton personnage ; une fausse image est refusée');
      vrai(/^jeton-/.test(jetons.thor?.image || '') && jetons.images === 1, 'l\'image du jeton est gardée une fois dans la table');
      egal(jetons.ela, { personnage: jetons.perso }, 'le jeton d\'Elaria est le sprite d\'un personnage du jeu');
      await page.waitForTimeout(500);
      if (process.env.CAPTURES) await page.screenshot({ path: `${process.env.CAPTURES}/2-scene-image.png` });
      const vide = await page.evaluate(() => { const T = App.moteur.table; const thor = T.table().pions.find((p) => p.sorte === 'heros'); T.agir({ type: 'jeton', pion: thor.id }); return [thor.jeton, Object.keys(T.table().jetons).length]; });
      egal(vide, [undefined, 0], 'retour au jeton par défaut : l\'image inutile s\'en va');
      sansErreur(erreurs, 'Saga');
    },
  },
];
