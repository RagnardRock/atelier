// Saga 1.47 + Tafl 1.41 : les scripts JS du jeu réagissent au mode table (le chat, les tours, les jets) et
// agissent comme le MJ (saga.table : dire, pv, marque). Le modèle « Réactions à la table » de Tafl.
const fs = require('node:fs');
const path = require('node:path');
const { RACINE, ouvrirTafl, nouveauJeu, fichiersDuJeu, suivreErreurs } = require('../lib/tafl');
const { exporter } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

const MOTEUR = path.join(RACINE, 'moteur');

module.exports = [
  {
    nom: 'Saga : un script réagit au chat et aux tours de la table (Saga 1.47, Tafl 1.41)',
    async faire(ctx) {
      // Le jeu : le modèle JDR, avec le script « Réactions à la table » de Tafl.
      const t = await ouvrirTafl(ctx.navigateur, ctx);
      await nouveauJeu(t.page, 'jdr', { taille: 32 });
      const code = await t.page.evaluate(() => ScriptsTafl.modeles(App.doc).find((m) => m.id === 'table')?.code || '');
      vrai(code.includes("quand('table_chat'"), 'Tafl propose le modèle « Réactions à la table » pour un JDR');
      const fichiers = await fichiersDuJeu(t.page);
      sansErreur(t.erreurs, 'Tafl');
      await t.page.context().close();
      const jeu = JSON.parse(fichiers['jeu.json']);
      jeu.scripts = [{ fichier: 'scripts/table.js', actif: true }];
      fichiers['jeu.json'] = JSON.stringify(jeu);
      fichiers['scripts/table.js'] = code;
      const html = await exporter(fichiers, 'jdr-scripts');

      const page = await (await ctx.navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      ctx.pages.push(page);
      const erreurs = suivreErreurs(page);
      const Reseau = require(path.join(MOTEUR, 'reseau.js'));
      const versPage = (nom, d) => page.evaluate(([n, x]) => window[n]?.(x), [nom, d]).catch(() => {});
      const reseau = Reseau.creer({
        moteur: MOTEUR, version: 'essai',
        lireJeuPublic: async () => Reseau.jeuPublic({ jeu: fichiers['jeu.json'], tuiles: fichiers['tuiles.tafl'] || '', cartes: {}, donnees: {}, scripts: {} }),
        lireSon: async () => null,
        versHote: (a) => versPage('__surAction', a), clientsChanges: (l) => versPage('__surClients', l),
      });
      await page.exposeFunction('__pont', (sorte, ...args) => {
        if (sorte === 'ouvrir') return reseau.ouvrir({ port: 7863, ...args[0] }).then(() => reseau.infos());
        if (sorte === 'infos') return reseau.infos();
        if (sorte === 'fermer') { reseau.fermer(); return reseau.infos(); }
        if (sorte === 'envoyer') return reseau.envoyer(...args);
        if (sorte === 'dire') return reseau.dire(...args);
        return null;
      });
      await page.addInitScript(() => {
        const plus = {
          reseauOuvrir: (o) => window.__pont('ouvrir', o), reseauInfos: () => window.__pont('infos'), reseauFermer: () => window.__pont('fermer'),
          reseauEnvoyer: (id, s, j) => { window.__pont('envoyer', id, s, j); }, reseauDire: (t, p, j) => { window.__pont('dire', t, p, j); },
          onReseauAction: (cb) => { window.__surAction = cb; }, onReseauClients: (cb) => { window.__surClients = cb; },
        };
        let saga;
        Object.defineProperty(window, 'saga', { configurable: true, get: () => saga, set: (v) => { saga = Object.assign(v, plus); } });
      });
      try {
        await page.goto(`file://${html}`);
        await page.waitForFunction(() => typeof App !== 'undefined' && App?.moteur);
        await page.getByText('Mode table (MJ)').click();
        await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
        for (const n of ['Thorgrim', 'Elaria']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(500); }
        await page.waitForFunction(() => App.moteur.table.vue(), null, { timeout: 8000 });
        await page.evaluate(() => App.moteur.multi.ouvrir({ mode: 'table', nom: 'MJ', titre: 'Brumeval' }));

        // « !soin Thorgrim 5 » dans le chat du MJ : le script rend 5 PV et le dit.
        const avant = await page.evaluate(() => {
          const T = App.moteur.table;
          const p = T.table().pions.find((q) => q.sorte === 'heros' && T.nomPion(q) === 'Thorgrim');
          T.changerPv(p.id, { delta: -8 });
          return T.pourScript().pions.find((q) => q.id === p.id).pv;
        });
        await page.evaluate(() => window.saga.reseauDire('!soin Thorgrim 5', 'tous'));
        await page.waitForFunction(() => App.moteur.multi.lignes.some((l) => /récupère 5 PV/.test(l.texte)), null, { timeout: 6000 });
        const apres = await page.evaluate(() => { const T = App.moteur.table; return T.pourScript().pions.find((q) => q.nom === 'Thorgrim').pv; });
        egal(apres - avant, 5, 'le script soigne le pion nommé dans le chat');

        // Un tour : celui qui joue, à moins de la moitié de ses PV, reçoit la marque rouge.
        const marque = await page.evaluate(async () => {
          const T = App.moteur.table;
          const p = T.table().pions.find((q) => q.sorte === 'heros' && T.nomPion(q) === 'Elaria');
          T.changerPv(p.id, { valeur: 1 });
          T.jeterInitiative();
          for (let i = 0; i < 8 && !(p.marques || []).includes('c-rouge'); i++) {
            T.passerInitiative(1);
            await new Promise((ok) => setTimeout(ok, 250));
          }
          return (p.marques || []).includes('c-rouge');
        });
        vrai(marque, 'à son tour, un héros à moins de la moitié de ses PV reçoit la marque rouge');
        sansErreur(erreurs, 'Saga');
      } finally {
        reseau.fermer();
      }
    },
  },
];
