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
        // (Le fond : un dégradé dessiné ici, en JPEG, comme une image choisie par le MJ.)
        await page.evaluate(() => {
          const c = document.createElement('canvas'); c.width = 360; c.height = 780;
          const x = c.getContext('2d');
          x.fillStyle = '#0b0916'; x.fillRect(0, 0, 360, 780);
          for (const [cx, cy, r, col] of [[40, 80, 300, 'rgba(255,150,60,.75)'], [350, 330, 320, 'rgba(140,90,255,.7)'], [110, 760, 320, 'rgba(40,180,200,.6)']]) {
            const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = g; x.fillRect(0, 0, 360, 780);
          }
          App.moteur.table.table().campagne = { nom: 'Les ombres de Brumeval', fond: c.toDataURL('image/jpeg', 0.85) };
        });
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
        // Comme derrière un relais d'avant Saga 1.35.1 : l'en-tête X-Compagnon n'arrive pas à la partie (le
        // téléphone se déliait au premier lancer) ; le jeton passe par l'adresse.
        await ctel.route('**/compagnon/**', (r) => { const e = { ...r.request().headers() }; delete e['x-compagnon']; r.continue({ headers: e }); });
        ctx.pages.push(tel);
        const erreursTel = suivreErreurs(tel);
        const manques = [];
        tel.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) manques.push(`${r.status()} ${r.url()}`); });
        await tel.goto(`http://127.0.0.1:${reseau.port}/compagnon/#lien=${lien.code}`);
        await tel.waitForFunction(() => window.Compagnon?.vue?.pions, null, { timeout: 10000 });
        const moi = await tel.evaluate(() => ({ mj: Compagnon.moi.mj, hash: location.hash, campagne: document.querySelector('.tete b')?.textContent }));
        egal(moi, { mj: true, hash: '', campagne: 'Les ombres de Brumeval' }, 'le téléphone est le MJ, le lien a servi');
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

        // Un ami, Lou, joue Thorgrim et relie son téléphone : ses macros (avec les @ de sa fiche) et sa fiche.
        const base = `http://127.0.0.1:${reseau.port}`;
        const poster = (chemin, corps, entetes = {}) => fetch(base + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json', ...entetes }, body: JSON.stringify(corps) }).then((r) => r.json().catch(() => ({})));
        const lou = await poster('/rejoindre', { code: reseau.infos().code, nom: 'Lou' });
        vrai(Boolean(lou.jeton), 'Lou rejoint la partie');
        const thorgrim = await page.evaluate(() => App.moteur.table.partie().equipe.find((c) => c.jdr && /Thorgrim/.test(c.nom || c.creature))?.pion);
        await poster('/action', { type: 'prendre', heros: thorgrim }, { 'X-Jeton': lou.jeton });
        for (const [nom, formule] of [['Hache d\'armes', '1d20+@for+@pb'], ['Dégâts hache', '1d8+@for'], ['Perception', '1d20+@sag+@pb'], ['Discrétion', '/gr 1d20+@dex'], ['Second souffle', '1d10+@niveau']]) {
          await poster('/action', { type: 'macro_ajouter', nom, formule }, { 'X-Jeton': lou.jeton });
        }
        const lienLou = await poster('/compagnon/lien', {}, { 'X-Jeton': lou.jeton });
        vrai(Boolean(lienLou.code), 'Lou a un code de compagnon');
        const ctel2 = await ctx.navigateur.newContext({ ...devices['Pixel 7'] });
        const tel2 = await ctel2.newPage();
        ctx.pages.push(tel2);
        const erreursTel2 = suivreErreurs(tel2);
        await tel2.goto(`${base}/compagnon/#lien=${lienLou.code}`);
        await tel2.waitForFunction(() => window.Compagnon?.vue?.macros?.length === 5, null, { timeout: 10000 });
        egal(await tel2.evaluate(() => Compagnon.moi.mj), false, 'le téléphone de Lou est Lou');
        await tel2.evaluate(() => Compagnon.aller('macros'));
        await tel2.waitForSelector('.mac .val');
        const vals = await tel2.$$eval('.mac', (l) => l.map((b) => [b.querySelector('b').textContent, b.querySelector('.val')?.textContent || '']));
        vrai(vals.every(([, v]) => v && !v.includes('@')), `les valeurs calculées : ${JSON.stringify(vals)}`);
        if (CAPTURES) await tel2.screenshot({ path: `${CAPTURES}/5-macros-joueur.png` });
        await tel2.evaluate(() => Compagnon.aller('fiche'));
        await tel2.waitForTimeout(400);
        if (CAPTURES) await tel2.screenshot({ path: `${CAPTURES}/6-fiche-joueur.png` });
        await tel2.evaluate(() => Compagnon.lancer('1d20+2d6+3'));
        await tel2.waitForFunction(() => Compagnon.plateau.des.length === 3 && Compagnon.plateau.des.every((d) => d.arret && d.valeur != null), null, { timeout: 8000 });
        if (CAPTURES) await tel2.screenshot({ path: `${CAPTURES}/7-des-joueur.png` });
        egal(erreursTel2.join(' | '), '', 'aucune erreur sur le téléphone de Lou');

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
