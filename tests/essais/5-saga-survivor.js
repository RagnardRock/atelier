// Saga : le mode survivor (Saga 1.30) joué pour de vrai dans « Le petit survivor » : le portail du camp mène
// à l'arène, la horde arrive, les armes frappent toutes seules, une montée de niveau fait choisir une arme ou
// un passif, beaucoup d'ennemis à la fois ne font pas tomber les images par seconde, et la partie se termine
// par une défaite (retour au camp) puis par une victoire (le boss final vaincu).
const fs = require('node:fs/promises');
const path = require('node:path');
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

// Les captures (pour la PR) : SURVIVOR_CAPTURES=dossier node lancer.js survivor
const CAPTURES = process.env.SURVIVOR_CAPTURES || '';
async function capture(saga, nom) {
  if (!CAPTURES) return;
  await fs.mkdir(CAPTURES, { recursive: true });
  await saga.capture(path.join(CAPTURES, nom));
}

async function entrerDansLArene(ctx) {
  const ouvert = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'survivor'), { ctx });
  const { page, saga } = ouvert;
  await saga.attendreLibre();
  await auPortail(page, saga);
  return ouvert;
}
// En temps réel, le héros glisse au pixel près : on tient la flèche jusqu'à la case voulue, sous le portail.
async function auPortail(page, saga) {
  // Sans un clic, le Chromium sans fenêtre ne garde pas une touche tenue (la page n'a pas la main).
  // (et on laisse passer les réactions des scripts à l'arrivée sur la carte, qui oublient les touches tenues).
  await page.mouse.click(640, 300);
  await page.waitForTimeout(600);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => App.moteur.position().y <= 4, null, { timeout: 5000 }).finally(() => page.keyboard.up('ArrowUp'));
  await saga.agir({ reponses: [0] });
  await page.waitForFunction(() => App.moteur.position().carte === 'champ' && window.SagaSurvivor?.run, null, { timeout: 8000 });
  await saga.attendreLibre();
}
// Tourner en rond (une touche puis l'autre), pour que le héros ne reste pas planté au milieu de la horde.
async function bouger(page, ms) {
  const touches = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
  for (let t = 0, k = 0; t < ms; t += 400, k++) {
    await page.keyboard.down(touches[k % 4]);
    await page.waitForTimeout(400);
    await page.keyboard.up(touches[k % 4]);
  }
}
// Le héros ne meurt pas pendant qu'on regarde (ses PV remis au maximum).
const immortel = (page) => page.evaluate(() => SagaSurvivor.hote?.soigner());

module.exports = [
  {
    nom: 'Saga : survivor, la horde arrive et les armes frappent toutes seules (Saga 1.30)',
    async faire(ctx) {
      const { page, erreurs, saga } = await entrerDansLArene(ctx);
      await page.waitForTimeout(400);
      await capture(saga, '1-arrivee.png');
      // Les premiers ennemis arrivent du bord de l'écran : on tourne jusqu'à ce que la dague en touche un.
      for (let i = 0; i < 20 && !(await saga.lire(() => SagaSurvivor.run.tues)); i++) { await bouger(page, 1200); await immortel(page); }
      const r = await saga.lire(() => ({ vivants: SagaSurvivor.horde.vivants, tues: SagaSurvivor.run.tues, temps: SagaSurvivor.run.temps, armes: SagaSurvivor.run.armes }));
      vrai(r.vivants + r.tues > 3, `la horde n'arrive pas (${r.vivants} ennemis, ${r.tues} vaincus)`);
      vrai(r.tues > 0, 'la dague ne tue personne');
      vrai(r.temps > 4, `le chrono n'avance pas (${r.temps})`);
      egal(r.armes, { dague: 1 }, 'l\'arme de départ');
      await capture(saga, '2-horde.png');
      sansErreur(erreurs, 'dans l\'arène');
    },
  },
  {
    nom: 'Saga : survivor, monter de niveau fait choisir parmi trois',
    async faire(ctx) {
      const { page, erreurs, saga } = await entrerDansLArene(ctx);
      await page.waitForTimeout(300);
      await page.evaluate(() => { SagaSurvivor.attente.niveaux = 2; SagaSurvivor.run.niveau = 3; });
      await page.waitForFunction(() => App.moteur.enScript, null, { timeout: 3000 });
      await page.waitForTimeout(300);
      const lignes = await page.locator('.combat-liste-ligne:visible').count();
      egal(lignes, 3, 'les choix proposés');
      await capture(saga, '3-niveau.png');
      const avant = await saga.lire(() => SagaSurvivor.run.temps);
      await saga.touche('Space', 400);
      await saga.touche('ArrowDown', 150);
      await saga.touche('Space', 400);
      await saga.attendreLibre();
      const r = await saga.lire(() => ({ n: Object.keys(SagaSurvivor.run.armes).length + Object.keys(SagaSurvivor.run.passifs).length, niveaux: Object.values(SagaSurvivor.run.armes).reduce((s, x) => s + x, 0) + Object.values(SagaSurvivor.run.passifs).reduce((s, x) => s + x, 0), temps: SagaSurvivor.run.temps }));
      egal(r.niveaux, 3, 'deux choix pris (dague niveau 1 + 2)');
      vrai(r.temps - avant < 0.5, 'le chrono a tourné pendant le choix');
      sansErreur(erreurs, 'en montant de niveau');
    },
  },
  {
    nom: 'Saga : survivor, 300 ennemis à l\'écran restent fluides',
    async faire(ctx) {
      const { page, erreurs, saga } = await entrerDansLArene(ctx);
      // À la fin du chrono, toutes les vagues donnent ; et toutes les armes au niveau 4.
      await page.evaluate(() => {
        const r = SagaSurvivor.run;
        r.temps = 4.5 * 60;
        Object.assign(r.armes, { dague: 4, hache: 4, ail: 4, foudre: 4, fouet: 4 });
      });
      // Et 300 ennemis d'un coup, sur les cases libres autour du héros.
      await page.evaluate(() => {
        const h = SagaSurvivor.horde, t = h.t, def = { id: 'slime', nom: 'Slime', personnage: 'slime', couleur: '#4cc35a', pv: 30, defense: 0, vitesse: 1.4, xp: 1, poids: 1 };
        for (let n = 0, essai = 0; n < 300 && essai < 5000; essai++) {
          const x = h.heros.x + (Math.random() - 0.5) * t * 30, y = h.heros.y + (Math.random() - 0.5) * t * 20;
          if (h.bloquee(Math.floor(x / t), Math.floor(y / t)) || Math.hypot(x - h.heros.x, y - h.heros.y) < t * 3) continue;
          h.ajouter(def, 30, x, y).ligne = -1; n++;
        }
      });
      await immortel(page);
      for (let i = 0; i < 6; i++) { await bouger(page, 1000); await immortel(page); }
      const r = await saga.lire(() => ({ vivants: SagaSurvivor.horde.vivants, fps: App.moteur.infos().fps, tues: SagaSurvivor.run.tues }));
      await capture(saga, '4-foule.png');
      vrai(r.vivants >= 200, `pas assez d'ennemis pour l'essai (${r.vivants})`);
      vrai(r.fps >= 40, `${r.fps} images par seconde avec ${r.vivants} ennemis`);
      console.log(`      (${r.vivants} ennemis, ${r.fps} images/s, ${r.tues} vaincus)`);
      sansErreur(erreurs, 'avec la foule');
    },
  },
  {
    nom: 'Saga : survivor, une défaite ramène au camp, puis une victoire contre le boss final',
    async faire(ctx) {
      const { page, erreurs, saga } = await entrerDansLArene(ctx);
      await page.waitForTimeout(500);
      // Défaite : plus qu'un PV, et les ennemis tout autour.
      // Défaite : des squelettes collés au héros (on prend le premier choix d'une montée de niveau).
      for (let i = 0; i < 60 && (await saga.lire(() => App.moteur.position().carte)) !== 'camp'; i++) {
        if (await saga.enScript()) { await saga.touche('Space', 300); continue; }
        await page.evaluate(() => {
          const h = SagaSurvivor.horde;
          if (!h) return;
          const def = { id: 'squelette', nom: 'Squelette', personnage: '', couleur: '#d8d4c8', pv: 999, defense: 0, vitesse: 2, xp: 0, poids: 1 };
          for (let k = 0; k < 4; k++) h.ajouter(def, 999, h.heros.x + (k - 1.5) * 4, h.heros.y + 6).ligne = -1;
        }).catch(() => {});
        await page.waitForTimeout(500);
      }
      egal((await saga.position()).carte, 'camp', 'après la défaite, la carte');
      await saga.finir();
      const apres = await saga.lire(() => App.moteur.partie().modules.survivor);
      egal(apres.parties, 1, 'les parties jouées');
      vrai(apres.record.champ >= 1, `le record (${apres.record.champ})`);
      vrai(!(await saga.lire(() => window.SagaSurvivor.run)), 'la partie est finie');
      // Victoire : on revient, le chrono est au bout, le boss final arrive ; on l'affaiblit.
      await auPortail(page, saga);
      await page.evaluate(() => { SagaSurvivor.run.temps = 5 * 60 - 0.5; SagaSurvivor.run.armes.ail = 6; });
      await page.waitForFunction(() => SagaSurvivor.run?.bossFinal, null, { timeout: 5000 });
      await page.evaluate(() => { for (const e of SagaSurvivor.horde.ennemis) if (e.actif && e.final) { e.pv = 1; e.x = SagaSurvivor.horde.heros.x + 8; e.y = SagaSurvivor.horde.heros.y; } });
      await immortel(page);
      await page.waitForFunction(() => App.moteur.enScript, null, { timeout: 15000 });
      await page.waitForTimeout(300);
      await capture(saga, '5-victoire.png');
      await saga.touche('Space', 400);
      await page.waitForFunction(() => App.moteur.position().carte === 'camp', null, { timeout: 8000 });
      await saga.finir();
      const fin = await saga.lire(() => App.moteur.partie().modules.survivor);
      egal(fin.victoires, { champ: 1 }, 'les victoires');
      egal(fin.parties, 2, 'les parties jouées');
      sansErreur(erreurs, 'en finissant une partie');
    },
    duree: 150000,
  },
];
