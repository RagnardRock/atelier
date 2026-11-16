// Saga 1.34 : le compagnon, la page du téléphone (moteur/compagnon/). Le MJ ouvre la partie (le serveur
// moteur/reseau.js tourne ici, relié à la page de Saga comme le fait main.js), montre son QR, le
// téléphone (un Pixel simulé) l'ouvre et devient le MJ : il reçoit la vue, lance des dés (le résultat
// vient du journal de Saga), lance une macro, change les PV d'un monstre, et montre le fond choisi.
const fs = require('node:fs/promises');
const path = require('node:path');
const { devices } = require('playwright');
const { RACINE, suivreErreurs } = require('../lib/tafl');
const { jeuDuModele } = require('../lib/saga');
const { egal, vrai } = require('../lib/verifier');

const MOTEUR = path.join(RACINE, 'moteur');
const CAPTURES = process.env.CAPTURES || '';
// Une image de fond de 2×2 pixels (violet), en PNG.
const FOND = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNsaOhgYGBgYmBgYGBgAAAJ4AE8x+Nq2QAAAABJRU5ErkJggg==';

module.exports = [
  {
    nom: 'Saga : le compagnon sur un téléphone (Saga 1.34)',
    async faire(ctx) {
      const html = await jeuDuModele(ctx, 'jdr', { taille: 32 });
      const contexte = await ctx.navigateur.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await contexte.newPage();
      ctx.pages.push(page);
      const erreurs = suivreErreurs(page);

      // Le serveur de la partie, et le pont vers la page (ce que font main.js et preload.js dans Saga).
      const Reseau = require(path.join(MOTEUR, 'reseau.js'));
      const versPage = (nom, d) => page.evaluate(([n, x]) => window[n]?.(x), [nom, d]).catch(() => {});
      const reseau = Reseau.creer({
        moteur: MOTEUR, version: 'essai',
        lireJeuPublic: async () => ({ dossier: 'reseau', jeu: '{}', tuiles: null, cartes: {}, donnees: {}, scripts: {} }),
        lireSon: async () => Buffer.alloc(0),
        versHote: (a) => versPage('__surAction', a), clientsChanges: (l) => versPage('__surClients', l),
      });
      await page.exposeFunction('__pont', (sorte, ...args) => {
        if (sorte === 'ouvrir') return reseau.ouvrir({ port: 7851, ...args[0] }).then(() => reseau.infos());
        if (sorte === 'infos') return reseau.infos();
        if (sorte === 'fermer') { reseau.fermer(); return reseau.infos(); }
        if (sorte === 'envoyer') return reseau.envoyer(...args);
        if (sorte === 'dire') return reseau.dire(...args);
        if (sorte === 'fond') return reseau.fondCompagnon(args[0]);
        if (sorte === 'compagnon') return reseau.compagnonMj();
        return null;
      });
      await page.addInitScript(() => {
        const plus = {
          reseauOuvrir: (o) => window.__pont('ouvrir', o), reseauInfos: () => window.__pont('infos'), reseauFermer: () => window.__pont('fermer'),
          reseauEnvoyer: (id, s, j) => { window.__pont('envoyer', id, s, j); }, reseauDire: (t, p, j) => { window.__pont('dire', t, p, j); },
          reseauFond: (u) => { window.__pont('fond', u); }, reseauCompagnon: () => window.__pont('compagnon'),
          onReseauAction: (cb) => { window.__surAction = cb; }, onReseauClients: (cb) => { window.__surClients = cb; },
        };
        let saga;
        Object.defineProperty(window, 'saga', { configurable: true, get: () => saga, set: (v) => { saga = Object.assign(v, plus); } });
      });
      let tel = null;
      try {
        await page.goto(`file://${html}`);
        await page.waitForFunction(() => typeof App !== 'undefined' && App?.moteur);
        await page.getByText('Mode table (MJ)').click();
        for (const n of ['Thorgrim', 'Elaria', 'Pip']) { await page.getByText(n).first().click(); await page.waitForTimeout(600); }
        await page.waitForFunction(() => App.moteur.table.actif && App.moteur.table.vue(), null, { timeout: 8000 });
        // Le MJ nomme la campagne et choisit le fond des téléphones, puis ouvre la partie.
        await page.evaluate((fond) => { const t = App.moteur.table.table(); t.campagne = { nom: 'Les brumes', fond }; }, FOND);
        await page.evaluate(() => App.moteur.multi.ouvrir({ mode: 'table', nom: 'MJ', titre: 'Brumeval' }));
        // Le bouton « Relier mon téléphone » montre le QR (la fenêtre reste ouverte jusqu'à Fermer).
        await page.evaluate(() => { App.moteur.multi.compagnon(); });
        await page.waitForSelector('.multi-qr svg', { timeout: 5000 });
        await page.waitForTimeout(500);
        if (CAPTURES) { await fs.mkdir(CAPTURES, { recursive: true }); await page.screenshot({ path: `${CAPTURES}/1-qr.png` }); }
        await page.keyboard.press('Escape');
        // Le code du QR (un nouveau remplace l'ancien : un seul valable à la fois par personne).
        const lien = reseau.compagnonMj();
        vrai(/#lien=[A-Za-z0-9_-]{16,}$/.test(lien?.url || ''), `l'adresse du QR : ${lien?.url}`);

        // Le téléphone ouvre l'adresse du QR.
        const ctel = await ctx.navigateur.newContext({ ...devices['Pixel 7'] });
        tel = await ctel.newPage();
        ctx.pages.push(tel);
        const erreursTel = suivreErreurs(tel);
        const manques = [];
        tel.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) manques.push(`${r.status()} ${r.url()}`); });
        await tel.goto(`http://127.0.0.1:${reseau.port}/compagnon/#lien=${lien.code}`);
        await tel.waitForFunction(() => window.Compagnon?.vue?.pions, null, { timeout: 10000 });
        const moi = await tel.evaluate(() => ({ mj: Compagnon.moi.mj, hash: location.hash, campagne: document.querySelector('.tete b')?.textContent }));
        egal(moi, { mj: true, hash: '', campagne: 'Les brumes' }, 'le téléphone est le MJ, le lien a servi');
        egal(reseau.infos().joueurs.find((j) => j.hote)?.compagnons, 1, 'Saga voit un téléphone relié au MJ');
        await tel.waitForFunction(() => /fond\?/.test(document.getElementById('fond').style.backgroundImage), null, { timeout: 5000 });

        // Les dés : le téléphone demande, Saga lance, le journal revient et les dés se posent sur son résultat.
        const avant = await page.evaluate(() => App.moteur.table.partie().jdr.journal.length);
        await tel.evaluate(() => Compagnon.lancer('2d6+3 Épée'));
        await page.waitForFunction((n) => App.moteur.table.partie().jdr.journal.length > n, avant, { timeout: 5000 });
        const jet = await page.evaluate(() => App.moteur.table.partie().jdr.journal.at(-1));
        await tel.waitForFunction((t) => document.querySelector('.tapis .res b')?.textContent === String(t), jet.total, { timeout: 8000 });
        const poses = await tel.evaluate(() => Compagnon.plateau.des.map((d) => d.valeur).sort());
        egal(poses, jet.des.map((d) => d.valeur).sort(), 'les dés du téléphone montrent ceux de Saga');
        await tel.waitForFunction(() => Compagnon.plateau.des.every((d) => d.arret), null, { timeout: 8000 });
        if (CAPTURES) await tel.screenshot({ path: `${CAPTURES}/2-des.png` });

        // Une macro du MJ, lancée du téléphone.
        await page.evaluate(() => App.moteur.table.agir({ type: 'macro_ajouter', nom: 'Init gobelins', formule: '1d20+2' }));
        await tel.evaluate(() => Compagnon.aller('macros'));
        await tel.waitForSelector('.mac b');
        await tel.locator('.mac', { hasText: 'Init gobelins' }).click();
        await page.waitForFunction(() => App.moteur.table.partie().jdr.journal.at(-1)?.quoi === 'Init gobelins', null, { timeout: 5000 });
        if (CAPTURES) await tel.screenshot({ path: `${CAPTURES}/3-macros.png` });

        // Les pions : le MJ retire des PV à un monstre depuis le téléphone.
        await tel.evaluate(() => Compagnon.aller('pions'));
        await tel.waitForSelector('.pion');
        const cible = await page.evaluate(() => App.moteur.table.vue().pions.filter((q) => typeof q.pv === 'number' && q.pv > 1).sort((a, b) => (a.sorte === 'monstre' ? -1 : 1))[0]);
        vrai(Boolean(cible), 'un pion avec des PV');
        await tel.evaluate((id) => document.querySelector(`.pion[data-id="${id}"] .pvs button`)?.click(), cible.id);
        await page.waitForFunction((c) => App.moteur.table.vue().pions.find((q) => q.id === c.id)?.pv < c.pv, cible, { timeout: 5000 });
        await tel.waitForFunction((c) => document.querySelector(`.pion[data-id="${c.id}"] small`)?.textContent.includes(` ${Math.max(0, c.pv - 5)} /`), cible, { timeout: 5000 });
        if (CAPTURES) await tel.screenshot({ path: `${CAPTURES}/4-pions.png` });

        // Le MJ coupe le lien : le téléphone le sait.
        reseau.couperCompagnons('hote');
        await tel.waitForFunction(() => !window.Compagnon?.vue || document.querySelector('.accueil'), null, { timeout: 5000 });
        egal(reseau.infos().joueurs.find((j) => j.hote)?.compagnons || 0, 0, 'plus de téléphone relié');
        egal(manques.join(' | '), '', 'aucun fichier manquant sur le téléphone');
        egal(erreursTel.join(' | '), '', 'aucune erreur sur le téléphone');
        egal(erreurs.join(' | '), '', 'aucune erreur dans Saga');
      } finally {
        reseau.fermer();
      }
    },
  },
];
