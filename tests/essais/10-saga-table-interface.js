// Saga 1.35 : la table en verre. Chez le MJ : le panneau à onglets (Chat, Pions, Scène, Joueurs),
// la barre des macros (touches 1 à 9), le pion choisi et ses PV, le tapis de dés (D), la largeur du panneau
// retenue. Chez un ami (son navigateur, par moteur/reseau.js) : la même table, sa fiche, ses macros, le chat.
const fs = require('node:fs');
const path = require('node:path');
const { RACINE, suivreErreurs } = require('../lib/tafl');
const { jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

const MOTEUR = path.join(RACINE, 'moteur');
const CAPTURES = process.env.CAPTURES || '';
const capture = async (p, nom) => { if (CAPTURES) await p.screenshot({ path: `${CAPTURES}/${nom}.png` }); };

module.exports = [
  {
    nom: 'Saga : la table en verre du MJ et d\'un ami (Saga 1.35)',
    async faire(ctx) {
      const html = await jeuDuModele(ctx, 'jdr', { taille: 32 });
      const contexte = await ctx.navigateur.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
      const page = await contexte.newPage();
      ctx.pages.push(page);
      const erreurs = suivreErreurs(page);

      // Le serveur de la partie, relié à la page comme le font main.js et preload.js dans Saga.
      const Reseau = require(path.join(MOTEUR, 'reseau.js'));
      const versPage = (nom, d) => page.evaluate(([n, x]) => window[n]?.(x), [nom, d]).catch(() => {});
      const reseau = Reseau.creer({
        moteur: MOTEUR, version: 'essai',
        lireJeuPublic: async () => {
          const d = path.dirname(html);
          const lireDir = (sous) => Object.fromEntries((fs.existsSync(path.join(d, sous)) ? fs.readdirSync(path.join(d, sous)) : []).map((f) => [`${sous}/${f}`, fs.readFileSync(path.join(d, sous, f), 'utf8')]));
          return Reseau.jeuPublic({ jeu: fs.readFileSync(path.join(d, 'jeu.json'), 'utf8'), tuiles: fs.readFileSync(path.join(d, 'tuiles.tafl'), 'utf8'), cartes: lireDir('cartes'), donnees: lireDir('donnees'), scripts: {} });
        },
        lireSon: async () => Buffer.alloc(0),
        versHote: (a) => versPage('__surAction', a), clientsChanges: (l) => versPage('__surClients', l),
      });
      await page.exposeFunction('__pont', (sorte, ...args) => {
        if (sorte === 'ouvrir') return reseau.ouvrir({ port: 7853, ...args[0] }).then(() => reseau.infos());
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
      const onglet = (p, nom) => p.locator(`.table-onglet[title="${nom}"]`).click();
      const dernier = () => page.evaluate(() => { const l = App.moteur.table.partie().jdr.journal.at(-1); return l ? { qui: l.qui, quoi: l.quoi, total: l.total, cache: Boolean(l.cache), n: l.n } : null; });
      try {
        await page.goto(`file://${html}`);
        await page.waitForFunction(() => typeof App !== 'undefined' && App?.moteur);
        await page.getByText('Mode table (MJ)').click();
        await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe()); for (const n of ['Thorgrim', 'Elaria', 'Pip']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(600); }
        await page.waitForFunction(() => App.moteur.table.actif && App.moteur.table.vue(), null, { timeout: 8000 });
        await page.waitForTimeout(400);

        // --- Le MJ ---
        egal(await page.locator('.table-onglet').allTextContents(), ['Chat', 'Pions', 'Scène', 'Docs', 'Joueurs'], 'les onglets du MJ');
        vrai(await page.locator('.ti-haut').isVisible() && await page.locator('.table-outils').isVisible(), 'la barre du haut et le rail d\'outils');
        await page.evaluate(() => {
          const T = App.moteur.table;
          T.table().campagne = { nom: 'Les ombres de Brumeval' };
          T.agir({ type: 'macro_ajouter', nom: 'Init monstres', formule: '1d20+2' });
          T.agir({ type: 'macro_ajouter', nom: 'Embuscade', formule: '/gr 1d20+6' });
          T.agir({ type: 'macro_ajouter', nom: 'Piège à fosse', formule: '2d6' });
        });
        await page.waitForSelector('.ti-macro >> nth=2');
        vrai((await page.locator('.ti-titre b').textContent()).includes('Brumeval'), 'le nom de la campagne en haut');
        // La touche 1 : la première macro ; le jet tombe sur le tapis et dans le chat.
        await page.keyboard.press('1');
        await page.waitForFunction(() => App.moteur.table.partie().jdr.journal.length === 1);
        const j1 = await dernier();
        egal(j1.quoi, 'Init monstres', 'la touche 1 lance la macro');
        await page.waitForSelector('.des-tapis:not([hidden])');
        await page.waitForFunction((t) => document.querySelector('.des-tapis-total')?.textContent === String(t), j1.total, { timeout: 8000 });
        await onglet(page, 'Chat');
        egal(await page.locator('.table-fil .table-jet-total').last().textContent(), String(j1.total), 'le jet en carte dans le chat');
        // Le chat lance aussi : un jet caché reste marqué.
        await page.fill('.table-ecrire-champ', '/gr 1d20+6 Discrétion du gobelin');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => App.moteur.table.partie().jdr.journal.length === 2);
        vrai((await dernier()).cache, '/gr dans le chat : un jet caché');
        await page.waitForSelector('.table-fil .table-jet.cache');
        // Le tapis ouvert à la main (D) : deux d6, Lancer.
        await page.locator('.table-plateau').click({ position: { x: 300, y: 500 } });
        await page.keyboard.press('d');
        await page.waitForSelector('.des-tapis-puce');
        await page.locator('.des-tapis-puce', { hasText: 'd6' }).click({ clickCount: 2 });
        egal(await page.inputValue('.des-tapis-formule'), '2d6', 'les puces composent la formule');
        await page.click('.des-tapis-lancer');
        await page.waitForFunction(() => App.moteur.table.partie().jdr.journal.length === 3);
        const j3 = await dernier();
        await page.waitForFunction((t) => document.querySelector('.des-tapis-total')?.textContent === String(t), j3.total, { timeout: 8000 });
        await capture(page, '1-mj-tapis');
        // Le tapis se déplace par son haut et change de taille par son coin ; c'est retenu (Saga 1.35.1).
        const th = await page.locator('.des-tapis-haut').boundingBox();
        await page.mouse.move(th.x + 60, th.y + 12); await page.mouse.down(); await page.mouse.move(th.x - 60, th.y + 62, { steps: 4 }); await page.mouse.up();
        const tc = await page.locator('.des-tapis-coin').boundingBox();
        await page.mouse.move(tc.x + 9, tc.y + 9); await page.mouse.down(); await page.mouse.move(tc.x - 91, tc.y - 51, { steps: 4 }); await page.mouse.up();
        const place = await page.evaluate(() => JSON.parse(localStorage.getItem('saga:des-tapis:place')));
        const tb = await page.locator('.des-tapis').boundingBox();
        vrai(place && Math.abs(tb.x - (th.x - 120)) < 30 && Math.abs(tb.width - place.l) < 2 && place.l < th.width + 44, 'le tapis déplacé et rétréci, place retenue');
        await page.locator('.des-tapis-haut').dblclick();
        vrai(await page.evaluate(() => localStorage.getItem('saga:des-tapis:place')) === null, 'double-clic : le tapis revient au centre');
        await page.click('.des-tapis-fermer');
        // Un pion choisi : sa carte en bas, ses PV aux boutons.
        const pion = await page.evaluate(() => { const T = App.moteur.table; const p = T.vue().pions.find((x) => x.sorte === 'heros'); T.selection = p.id; return { id: p.id, pv: p.pv }; });
        await page.waitForSelector('.ti-pion:not([hidden]) .ti-pv-bouton');
        await page.locator('.ti-pion .ti-pv-bouton[title^="Blesser"]').click();
        await page.waitForFunction(([id, pv]) => App.moteur.table.vue().pions.find((x) => x.id === id).pv === pv, [pion.id, pion.pv - 1], { timeout: 3000 }).catch(() => vrai(false, 'le bouton − de la carte enlève un PV'));
        await capture(page, '2-mj-chat');
        // Les autres onglets se dessinent.
        await onglet(page, 'Pions');
        vrai(await page.locator('.table-carte-pion').count() >= 3, 'les pions en cartes');
        await capture(page, '3-mj-pions');
        await onglet(page, 'Scène');
        vrai(await page.locator('.volet-scene .table-section').count() >= 3, 'les sections de la scène');
        await capture(page, '4-mj-scene');
        // La largeur du panneau : glisser la poignée, elle est retenue.
        const pg = await page.locator('.table-poignee').boundingBox();
        await page.mouse.move(pg.x + 4, pg.y + 200);
        await page.mouse.down();
        await page.mouse.move(pg.x - 76, pg.y + 200, { steps: 4 });
        await page.mouse.up();
        egal(await page.evaluate(() => localStorage.getItem('saga:table:largeur')), '420', 'la largeur du panneau est retenue');
        await page.evaluate(() => localStorage.setItem('saga:table:largeur', '340'));

        // --- Un ami, dans son navigateur ---
        await onglet(page, 'Joueurs');
        await page.evaluate(() => App.moteur.multi.ouvrir({ mode: 'table', nom: 'MJ', titre: 'Brumeval' }));
        const c2 = await ctx.navigateur.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
        const ami = await c2.newPage();
        ctx.pages.push(ami);
        const erreursAmi = suivreErreurs(ami);
        await ami.goto(`http://127.0.0.1:${reseau.port}/?code=${encodeURIComponent(reseau.infos().code)}`);
        await ami.waitForSelector('form.reseau-carte');
        await ami.fill('form.reseau-carte input[name=nom]', 'Lou');
        await ami.click('form.reseau-carte button[type=submit]');
        await ami.waitForSelector('.ti-haut');
        await page.waitForFunction(() => App.moteur.multi.joueurs.some((j) => j.nom === 'Lou'));
        await capture(page, '5-mj-joueurs');
        await page.evaluate(() => { const T = App.moteur.table; const c = T.partie().equipe.find((x) => x.jdr && /Thorgrim/.test(x.nom || x.creature)); T.donnerRole('Lou', T.cleDe(c)); });
        await ami.waitForSelector('.ti-pion:not([hidden])');
        egal(await ami.locator('.table-onglet').allTextContents(), ['Chat', 'Journal', 'Fiche', 'Docs', 'Joueurs'], 'les onglets de l\'ami');
        vrai((await ami.locator('.ti-titre b').textContent()).includes('Brumeval'), 'l\'ami voit le nom de la campagne');
        vrai((await ami.locator('.ti-pion-nom b').textContent()).includes('Thorgrim'), 'son héros en bas');
        // Ses macros, la touche 1, et le jet qui arrive chez lui et chez le MJ.
        await ami.evaluate(() => { for (const [nom, formule] of [['Hache', '1d20+@for+@maitrise'], ['Dégâts hache', '1d12+@for'], ['Discrétion', '/gr 1d20+@dex']]) window.saga.tableDemander({ type: 'macro_ajouter', nom, formule }); });
        await ami.waitForSelector('.ti-macro >> nth=2');
        vrai(/^1d20\+\d+\+\d+$/.test(await ami.locator('.ti-macro code').first().textContent()), 'la formule calculée sur la tuile');
        const avant = (await dernier()).n;
        await ami.keyboard.press('1');
        await page.waitForFunction((n) => App.moteur.table.partie().jdr.journal.at(-1).n > n, avant);
        const jl = await dernier();
        egal(jl.quoi, 'Hache', 'la touche 1 de l\'ami lance sa macro');
        await ami.waitForFunction((t) => document.querySelector('.table-fil .table-jet:last-of-type .table-jet-total')?.textContent === String(t), jl.total);
        await ami.waitForFunction((t) => document.querySelector('.des-tapis-total')?.textContent === String(t), jl.total, { timeout: 8000 });
        // La discussion : le MJ écrit, l'ami lit et répond.
        await page.evaluate(() => App.moteur.multi.dire('La porte grince. Qui écoute ?', 'tous'));
        await ami.waitForSelector('.table-fil .table-dit');
        await ami.fill('.table-ecrire-champ', 'Moi, à la porte.');
        await ami.keyboard.press('Enter');
        await page.waitForFunction(() => App.moteur.multi.lignes.some((l) => l.texte === 'Moi, à la porte.'));
        await capture(ami, '6-ami-chat');
        // Sa fiche, dans le panneau.
        await onglet(ami, 'Fiche');
        vrai(await ami.locator('.volet-fiche .joueurs-fiche').isVisible(), 'la fiche dans son onglet');
        await ami.waitForSelector('.des-tapis[hidden]', { state: 'attached', timeout: 9000 });
        await capture(ami, '7-ami-fiche');
        await onglet(ami, 'Joueurs');
        vrai(await ami.locator('.volet-joueurs .multi-compagnon').isVisible(), 'relier son téléphone, dans l\'onglet Joueurs');
        // Le tapis à la main : un d20, le jet part chez l'hôte.
        const avant2 = (await dernier()).n;
        await ami.keyboard.press('d');
        await ami.locator('.des-tapis-puce', { hasText: 'd20' }).click();
        await ami.click('.des-tapis-lancer');
        await page.waitForFunction((n) => App.moteur.table.partie().jdr.journal.at(-1).n > n, avant2);
        await capture(ami, '8-ami-tapis');
        await ami.click('.des-tapis-fermer');
        // Un combat : pas d'onglet à part. Le menu du tour est un encart près du plateau, l'initiative en haut,
        // et les phrases du combat tombent dans le chat, chez le MJ comme chez l'ami.
        await onglet(page, 'Chat');
        await onglet(ami, 'Chat');
        // Deux rencontres posées sur la carte : on coche celles qui combattent ensemble (Saga 1.35.1).
        const posees = await page.evaluate(() => {
          const T = App.moteur.table, g = T.jeu().donnees.groupes.groupes;
          T.agir({ type: 'groupe', groupe: g[0].id, x: 9, y: 3 });
          T.agir({ type: 'groupe', groupe: g[1].id, x: 12, y: 3 });
          return T.rencontresPosees();
        });
        egal(posees.length, 2, 'deux rencontres posées sur la carte');
        await onglet(page, 'Scène');
        await page.waitForSelector('.table-rencontre >> nth=1');
        for (const c of await page.locator('.table-rencontre input').all()) await c.check();
        await page.getByRole('button', { name: /Lancer le combat \(2 rencontres\)/ }).click();
        await onglet(page, 'Chat');
        await page.waitForSelector('#scene > .table-combat:not([hidden])');
        for (let i = 0; i < 12 && !(await page.locator('.ti-ordre .ti-init').count()); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(700); }
        egal(await page.locator('.ti-ordre .ti-init.monstre').count(), posees[0].n + posees[1].n, 'les monstres des deux rencontres combattent, pas un de plus');
        vrai(await page.locator('.ti-etat-combat').isVisible(), 'l\'état du combat dans la barre du haut');
        vrai(await page.locator('.table-panneau .table-combat').count() === 0, 'le menu du tour n\'est plus dans le panneau');
        await page.waitForSelector('.table-fil .table-dit.recit');
        await ami.waitForSelector('.table-fil .table-dit.recit');
        await ami.waitForSelector('.ti-ordre .ti-init');
        await page.waitForTimeout(2500);
        await capture(page, '9-mj-combat');
        await capture(ami, '10-ami-combat');
        // En combat, Échap ouvre quand même le menu du jeu (rien à annuler), et le referme.
        await page.locator('.table-plateau').click({ position: { x: 200, y: 700 } });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        vrai(await page.locator('#pause').isVisible(), 'Échap ouvre le menu du jeu en plein combat');
        await capture(page, '11-mj-menu');
        await page.keyboard.press('Escape');
        vrai(await page.locator('#pause').isHidden(), 'Échap referme le menu');
        sansErreur(erreurs);
        sansErreur(erreursAmi);
      } finally {
        reseau.fermer();
      }
    },
  },
];
