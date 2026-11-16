// Saga 1.38 : la salle de campagne. Le MJ ouvre sa campagne par le relais (relais/relais.js, sur 127.0.0.1) :
// le lien est celui de la campagne, et il reste le même à la séance suivante. Lou rejoint et relie son
// téléphone. À la fin de la séance, Saga dépose sur le relais la copie de Lou (chiffrée : le relais ne lit
// pas « Thorgrim ») ; le téléphone la relit hors séance (fiche, documents), même rouvert plus tard, et Lou y
// change un champ de sa fiche : une proposition, que le MJ accepte à la séance suivante. Le téléphone revient
// en direct sans nouveau QR. Couper le téléphone vide sa boîte sur le relais.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { devices } = require('playwright');
const { RACINE, suivreErreurs } = require('../lib/tafl');
const { jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

const MOTEUR = path.join(RACINE, 'moteur');
const CAPTURES = process.env.CAPTURES || '';
const capture = async (p, nom) => { if (CAPTURES) { fs.mkdirSync(CAPTURES, { recursive: true }); await p.screenshot({ path: `${CAPTURES}/${nom}.png` }); } };

// Une fiche du jeu avec deux champs à soi (une jauge de Destin, un carnet), que le joueur peut changer.
const FICHE = {
  active: true, colonnes: 1,
  blocs: [{ type: 'entete' }, { type: 'champs', titre: 'Destinée', champs: ['destin', 'carnet'] }, { type: 'caracs' }],
  champs: [
    { id: 'destin', nom: 'Points de destin', type: 'jauge', max: 3, depart: 3, modifiable: 'joueur' },
    { id: 'carnet', nom: 'Carnet', type: 'texte', depart: 'Le meunier ment.', modifiable: 'joueur' },
  ],
};

module.exports = [
  {
    nom: 'Saga : la salle de campagne, hors séance sur le téléphone (Saga 1.38)',
    async faire(ctx) {
      // Le relais, avec ses campagnes dans un dossier jetable.
      const donnees = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-campagnes-'));
      process.env.RELAIS_CLE = 'cle-essai';
      process.env.DONNEES = donnees;
      const cheminRelais = path.join(RACINE, 'relais', 'relais.js');
      delete require.cache[require.resolve(cheminRelais)];
      const { serveur: relaisSrv } = require(cheminRelais);
      await new Promise((r) => relaisSrv.listen(0, '127.0.0.1', r));
      const adresseRelais = `http://127.0.0.1:${relaisSrv.address().port}`;

      const html = await jeuDuModele(ctx, 'jdr', { taille: 32 });
      const contexte = await ctx.navigateur.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
      const page = await contexte.newPage();
      ctx.pages.push(page);
      const erreurs = suivreErreurs(page);

      // Le serveur de la partie, le relais et le coffre, reliés à la page comme le font main.js et preload.js.
      const Reseau = require(path.join(MOTEUR, 'reseau.js'));
      const Relais = require(path.join(MOTEUR, 'relais-client.js'));
      const Coffre = require(path.join(MOTEUR, 'coffre.js'));
      const versPage = (nom, d) => page.evaluate(([n, x]) => window[n]?.(x), [nom, d]).catch(() => {});
      const relais = Relais.creer();
      const coffre = Coffre.creer();
      const retirees = [];
      const reseau = Reseau.creer({
        moteur: MOTEUR, version: 'essai',
        lireJeuPublic: async () => {
          const d = path.dirname(html);
          const lireDir = (sous) => Object.fromEntries((fs.existsSync(path.join(d, sous)) ? fs.readdirSync(path.join(d, sous)) : []).map((f) => [`${sous}/${f}`, fs.readFileSync(path.join(d, sous, f), 'utf8')]));
          return Reseau.jeuPublic({ jeu: fs.readFileSync(path.join(d, 'jeu.json'), 'utf8'), tuiles: fs.readFileSync(path.join(d, 'tuiles.tafl'), 'utf8'), cartes: lireDir('cartes'), donnees: lireDir('donnees'), scripts: {} });
        },
        lireSon: async () => Buffer.alloc(0),
        versHote: (a) => versPage('__surAction', a), clientsChanges: (l) => versPage('__surClients', l),
        campagneChange: (c) => {
          versPage('__surCampagne', { code: c.code, telephones: c.telephones, cles: c.cles });
          for (const boite of c.retirer || []) retirees.push(coffre.retirer({ base: adresseRelais, campagne: reseau.campagneRelais, boite }));
        },
      });
      const lesCoffres = () => ({ base: adresseRelais, campagne: reseau.campagneRelais });
      await page.exposeFunction('__pont', async (sorte, ...args) => {
        if (sorte === 'ouvrir') return reseau.ouvrir({ port: 7862, ...args[0] }).then(() => reseau.infos());
        if (sorte === 'infos') return reseau.infos();
        if (sorte === 'fermer') { reseau.fermer(); await new Promise((r) => setTimeout(r, 400)); relais.fermer(); return reseau.infos(); }
        if (sorte === 'envoyer') return reseau.envoyer(...args);
        if (sorte === 'dire') return reseau.dire(...args);
        if (sorte === 'documents') return reseau.documents(args[0]);
        if (sorte === 'campagne') return reseau.campagne(args[0]);
        if (sorte === 'accepter') { reseau.accepter(...args); return reseau.infos(); }
        if (sorte === 'internet') {
          const campagne = reseau.campagneRelais;
          const { lien, fixe } = await relais.ouvrir({ adresse: adresseRelais, cle: 'cle-essai', port: reseau.port, secretLocal: reseau.secretRelais, campagne });
          if (campagne && fixe) setTimeout(() => coffre.relever({ ...lesCoffres(), boites: reseau.boites() }).then((l) => l.length && versPage('__surPropositions', l)), 300);
          return { ...reseau.passerInternet({ adresse: lien, methode: 'relais' }), echec: null, campagne: campagne ? { fixe } : null };
        }
        if (sorte === 'deposer') {
          const parNom = new Map(Object.entries(reseau.boites()).map(([boite, b]) => [b.nom.toLowerCase(), { boite, cle: b.cle }]));
          const copies = args[0].filter((c) => parNom.has(c.nom.toLowerCase())).map((c) => ({ ...c, ...parNom.get(c.nom.toLowerCase()) }));
          return coffre.deposer({ ...lesCoffres(), copies });
        }
        if (sorte === 'oublierTel') return reseau.oublierTelephone(args[0]);
        return null;
      });
      await page.addInitScript(() => {
        const plus = {
          reseauOuvrir: (o) => window.__pont('ouvrir', o), reseauInfos: () => window.__pont('infos'), reseauFermer: () => window.__pont('fermer'),
          reseauEnvoyer: (id, s, j) => { window.__pont('envoyer', id, s, j); }, reseauDire: (t, p, j) => { window.__pont('dire', t, p, j); },
          tableDocuments: (l) => { window.__pont('documents', l); }, reseauAccepter: (id, oui) => window.__pont('accepter', id, oui),
          reseauInternet: (v) => window.__pont('internet', v), reseauCampagne: (c) => { window.__pont('campagne', c); },
          reseauDeposer: (l) => window.__pont('deposer', l), reseauOublierTelephone: (j) => window.__pont('oublierTel', j),
          onReseauAction: (cb) => { window.__surAction = cb; }, onReseauClients: (cb) => { window.__surClients = cb; },
          onReseauCampagne: (cb) => { window.__surCampagne = cb; }, onReseauPropositions: (cb) => { window.__surPropositions = cb; },
        };
        let saga;
        Object.defineProperty(window, 'saga', { configurable: true, get: () => saga, set: (v) => { saga = Object.assign(v, plus); } });
      });
      const onglet = (p, nom) => p.locator(`.table-onglet[title="${nom}"]`).click();
      // Un ami arrive par le lien de la campagne ; le MJ l'accepte.
      async function rejoindre(ami, lien, nom) {
        await ami.goto(`${lien}?code=${encodeURIComponent(reseau.infos().code)}`);
        await ami.waitForSelector('form.reseau-carte');
        await ami.fill('form.reseau-carte input[name=nom]', nom);
        await ami.click('form.reseau-carte button[type=submit]');
        for (let i = 0; i < 50 && !reseau.infos().attente.length; i++) await ami.waitForTimeout(100);
        reseau.accepter(reseau.infos().attente[0].id, true);
        await ami.waitForSelector('.ti-haut', { timeout: 15000 });
      }
      const fichiers = () => (fs.existsSync(donnees) ? fs.readdirSync(donnees, { recursive: true }).map(String) : []);
      let tel = null;
      try {
        await page.goto(`file://${html}`);
        await page.waitForFunction(() => typeof App !== 'undefined' && App?.moteur);
        await page.getByText('Mode table (MJ)').click();
        await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe()); for (const n of ['Thorgrim', 'Elaria', 'Pip']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(600); }
        await page.waitForFunction(() => App.moteur.table.actif && App.moteur.table.vue());
        await page.evaluate((f) => {
          const r = App.moteur.table.jeu().donnees.reglages.reglages;
          r.jdr = { ...(r.jdr || {}), fiche: f };
          App.moteur.table.table().campagne.nom = 'Les ombres de Brumeval';
        }, FICHE);
        const camp = await page.evaluate(() => ({ id: App.moteur.table.table().campagne.id, secret: App.moteur.table.table().campagne.secret }));
        vrai(/^[A-Za-z0-9_-]{16}$/.test(camp.id) && camp.secret.length >= 30, 'la campagne a son identité (gardée dans la partie)');

        // --- Séance 1 : par le relais, le lien de la campagne ---
        await page.evaluate(() => App.moteur.multi.ouvrir({ mode: 'table', nom: 'MJ', titre: 'Brumeval' }));
        await page.evaluate(() => App.moteur.multi.internet('relais'));
        const infos1 = reseau.infos();
        const lien1 = infos1.internet.adresse;
        egal(lien1, `${adresseRelais}/p/${camp.id}/`, 'le lien est celui de la campagne');
        vrai(/^[A-Z]{4}-[A-Z]{4}$/.test(infos1.code), `un code de campagne (${infos1.code})`);
        await page.waitForFunction((c) => App.moteur.table.table().campagne.code === c, infos1.code);

        // Lou rejoint et joue Thorgrim.
        const c2 = await ctx.navigateur.newContext({ viewport: { width: 1280, height: 800 } });
        const ami = await c2.newPage();
        ctx.pages.push(ami);
        const erreursAmi = suivreErreurs(ami);
        await rejoindre(ami, lien1, 'Lou');
        await page.evaluate(() => { const T = App.moteur.table; const c = T.partie().equipe.find((x) => x.jdr && /Thorgrim/.test(x.nom || x.creature)); T.donnerRole('Lou', T.cleDe(c)); });

        // Son téléphone (par le relais) : relié, il reçoit sa boîte et sa clé.
        const qr = await ami.evaluate(() => window.saga.reseau.compagnon());
        vrai(qr.url.startsWith(`${lien1}compagnon/?lien=`), `le QR mène au compagnon de la campagne (${qr.url})`);
        const ctel = await ctx.navigateur.newContext({ ...devices['Pixel 7'] });
        tel = await ctel.newPage();
        ctx.pages.push(tel);
        const erreursTel = suivreErreurs(tel);
        await tel.goto(qr.url);
        await tel.waitForFunction(() => window.Compagnon?.vue?.fiche && window.Compagnon.liaison?.boite, null, { timeout: 15000 });
        await page.waitForFunction(() => App.moteur.table.table().campagne.telephones.length === 1 && App.moteur.table.table().campagne.cles.lou);
        egal(await page.evaluate(() => App.moteur.table.table().campagne.telephones[0].nom), 'Lou', 'le téléphone de Lou est gardé dans la campagne');

        // Saga 1.38.1 : Lou ouvre aussi son compagnon dans un onglet de son PC (Compagnon › Ouvrir sur ce PC).
        await ami.evaluate(() => document.querySelector('.ti-bouton[title^="Un QR code"]')?.click());
        await ami.waitForSelector('.multi-qr-pc button');
        const [pc] = await Promise.all([c2.waitForEvent('page'), ami.locator('.multi-qr-pc button').click()]);
        ctx.pages.push(pc);
        const erreursPc = suivreErreurs(pc);
        await pc.waitForFunction(() => window.Compagnon?.vue?.fiche && window.Compagnon.liaison?.boite, null, { timeout: 15000 });
        await pc.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => App.moteur.table.table().campagne.telephones.length === 2);
        await ami.keyboard.press('Escape');

        // Le MJ donne à Lou une carte (une image) et une lettre.
        const image = await page.evaluate(() => {
          const c = document.createElement('canvas'); c.width = 900; c.height = 600;
          const x = c.getContext('2d');
          x.fillStyle = '#d9c393'; x.fillRect(0, 0, 900, 600);
          x.strokeStyle = '#6b4a22'; x.lineWidth = 6; x.setLineDash([14, 10]); x.beginPath(); x.moveTo(90, 500); x.bezierCurveTo(300, 120, 560, 560, 760, 170); x.stroke();
          x.setLineDash([]); x.strokeStyle = '#8b1d12'; x.lineWidth = 10; x.beginPath(); x.moveTo(735, 145); x.lineTo(785, 195); x.moveTo(785, 145); x.lineTo(735, 195); x.stroke();
          x.fillStyle = '#4a3418'; x.font = 'bold 54px Georgia'; x.fillText('Le moulin', 60, 90);
          return c.toDataURL('image/jpeg', 0.85);
        });
        await page.evaluate((img) => {
          const T = App.moteur.table;
          T.docAgir({ type: 'doc_nouveau', titre: 'Carte du moulin', image: img, pour: ['Lou'] });
          T.docAgir({ type: 'doc_nouveau', titre: 'Lettre du baron', texte: 'Venez seuls. Ce qui dort sous le moulin s\'éveille à la nouvelle lune.\n\n— Baron Aldric', pour: 'tous' });
        }, image);
        await tel.waitForFunction(() => window.Compagnon.vue?.documents?.length === 2, null, { timeout: 8000 });

        // Le MJ dépose les copies (onglet Joueurs) : un fichier chiffré sur le relais, illisible pour lui.
        await onglet(page, 'Joueurs');
        await page.waitForSelector('.table-campagne .table-bouton:has-text("Déposer maintenant"):not([disabled])');
        await page.locator('.table-campagne .table-bouton', { hasText: 'Déposer maintenant' }).click();
        await page.waitForFunction(() => App.moteur.table.table().campagne.depot > 0, null, { timeout: 8000 });
        const boite = await page.evaluate(() => App.moteur.table.table().campagne.cles.lou.boite);
        const fichierCopie = path.join(donnees, camp.id, `${boite}.copie`);
        vrai(fs.existsSync(fichierCopie), 'la copie de Lou est sur le relais');
        const brut = fs.readFileSync(fichierCopie);
        vrai(brut.length > 20000, `avec l'image (${Math.round(brut.length / 1024)} Ko)`);
        vrai(!brut.includes('Thorgrim') && !brut.includes('Baron'), 'chiffrée : le relais ne lit ni la fiche ni la lettre');
        egal(fs.readFileSync(path.join(donnees, 'campagnes.json'), 'utf8').includes(camp.secret), false, 'seulement son empreinte');
        await capture(page, '1-mj-campagne');

        // Un autre MJ ne prend pas la salle de cette campagne.
        const vol = await fetch(`${adresseRelais}/hote/ouvrir?cle=cle-essai&campagne=${camp.id}&cs=${'x'.repeat(32)}`);
        egal(vol.status, 403, 'un mauvais secret de campagne est refusé');

        // --- Fin de la séance : la copie est redéposée, le téléphone passe hors séance ---
        await page.evaluate(() => App.moteur.multi.fermer());
        await tel.waitForFunction(() => window.Compagnon.horsLigne && window.Compagnon.copie, null, { timeout: 10000 });
        vrai((await tel.locator('.tete .etat-co').textContent()).includes('hors séance'), 'le téléphone dit « hors séance »');
        await tel.evaluate(() => Compagnon.aller('fiche'));
        await tel.waitForSelector('.fiche .fp-champ.jauge');
        vrai((await tel.locator('.fiche').textContent()).includes('Points de destin'), 'la fiche se lit hors séance');
        await capture(tel, '2-tel-hors-seance-fiche');
        await tel.evaluate(() => Compagnon.aller('documents'));
        await tel.waitForFunction(() => document.querySelectorAll('.docs .doc').length === 2 && [...document.querySelectorAll('.docs .doc img')].every((i) => i.naturalWidth > 0), null, { timeout: 5000 });
        vrai(await tel.evaluate(() => document.querySelector('.docs .doc img').src.startsWith('data:image/jpeg')), 'l\'image vient de la copie');
        await capture(tel, '3-tel-hors-seance-docs');

        // Sur le PC de Lou : le lien de la partie mène au compagnon, qui montre la copie hors séance.
        const redir = await fetch(lien1, { redirect: 'manual' });
        egal(redir.status, 302, 'entre deux séances, la page de la partie redirige');
        vrai((redir.headers.get('location') || '').endsWith(`/p/${camp.id}/compagnon/`), 'vers le compagnon');
        await pc.close();
        const pc2 = await c2.newPage();
        ctx.pages.push(pc2);
        await pc2.goto(lien1);
        await pc2.waitForFunction(() => window.Compagnon?.horsLigne && window.Compagnon.copie, null, { timeout: 10000 });
        await pc2.evaluate(() => Compagnon.aller('fiche'));
        await pc2.waitForSelector('.fiche .fp-champ.jauge');
        vrai((await pc2.locator('.fiche').textContent()).includes('Points de destin'), 'sur le PC aussi, la fiche se lit hors séance');
        vrai(await pc2.evaluate(() => document.fonts.ready.then(() => [...document.fonts].some((f) => /codicon/.test(f.family) && f.status === 'loaded'))), 'les icônes aussi, depuis le cache');
        await capture(pc2, '7-pc-hors-seance');
        sansErreur(erreursPc, 'compagnon du PC');

        // Lou dépense un point de destin et note quelque chose, hors séance : deux propositions pour le MJ.
        await tel.evaluate(() => Compagnon.aller('fiche'));
        await tel.locator('.fp-champ.jauge .fp-bouton', { hasText: '−' }).click();
        await tel.locator('.fp-champ.texte input').fill('Le meunier ment. Le baron aussi ?');
        await tel.locator('.fp-champ.texte input').press('Enter');
        await tel.locator('.fp-champ.texte input').evaluate((i) => i.blur());
        await tel.waitForFunction(() => window.Compagnon.liaison.attente?.length === 2 && window.Compagnon.liaison.attente.every((x) => x.envoye), null, { timeout: 8000 });
        vrai(fs.existsSync(path.join(donnees, camp.id, `${boite}.prop.json`)), 'les propositions attendent sur le relais');
        vrai((await tel.locator('.fp-champ.jauge').textContent()).includes('2 / 3'), 'le téléphone montre le changement');
        await tel.waitForSelector('.attente-mj');
        await capture(tel, '4-tel-proposition');

        // Le téléphone rouvert plus tard (la séance fermée) : la page vient du cache, la copie aussi.
        await tel.reload();
        await tel.waitForFunction(() => window.Compagnon?.horsLigne && window.Compagnon.copie, null, { timeout: 12000 });
        await tel.evaluate(() => Compagnon.aller('fiche'));
        await tel.waitForSelector('.fiche .fp-champ.jauge');
        vrai((await tel.locator('.fp-champ.jauge').textContent()).includes('2 / 3'), 'rouvert, le changement en attente est toujours là');

        // --- Séance 2 : le même lien, le même code ; les propositions arrivent au MJ ---
        await page.evaluate(() => App.moteur.multi.ouvrir({ mode: 'table', nom: 'MJ', titre: 'Brumeval' }));
        await page.evaluate(() => App.moteur.multi.internet('relais'));
        egal(reseau.infos().internet.adresse, lien1, 'le lien de la campagne n\'a pas changé');
        egal(reseau.infos().code, infos1.code, 'le code non plus');
        await page.waitForFunction(() => App.moteur.table.table().campagne.propositions.length === 2, null, { timeout: 8000 });
        await onglet(page, 'Joueurs');
        await page.waitForSelector('.table-proposition');
        await capture(page, '5-mj-propositions');
        await page.locator('.table-campagne .table-bouton', { hasText: 'Tout accepter' }).click();
        const champs = await page.evaluate(() => { const T = App.moteur.table; const c = T.partie().equipe.find((x) => x.jdr && /Thorgrim/.test(x.nom || x.creature)); return c.champs; });
        egal(champs, { destin: 2, carnet: 'Le meunier ment. Le baron aussi ?' }, 'les changements de Lou sont sur sa fiche');
        vrai(!fs.existsSync(path.join(donnees, camp.id, `${boite}.prop.json`)), 'relevées, elles quittent le relais');

        // Le téléphone de Lou, sans nouveau QR : sa séance est ouverte, mais Lou n'est pas encore là.
        await tel.reload();
        await tel.waitForFunction(() => window.Compagnon?.moi?.absent && window.Compagnon.horsLigne, null, { timeout: 12000 });
        // Lou revient (son navigateur) : le téléphone passe en direct, avec sa fiche à jour.
        await rejoindre(ami, lien1, 'Lou');
        await tel.waitForFunction(() => window.Compagnon && !window.Compagnon.horsLigne && window.Compagnon.vue?.fiche?.champs?.find((x) => x.id === 'destin')?.valeur === 2, null, { timeout: 12000 });
        await tel.evaluate(() => Compagnon.aller('fiche'));
        await tel.waitForSelector('.tete .etat-co.oui');
        await capture(tel, '6-tel-retour-en-direct');

        // Saga 1.38.1 : Mia, sans PC, rejoint depuis le compagnon (prénom et code), puis prend un héros libre.
        const manifeste = await (await fetch(`${lien1}compagnon/manifest.webmanifest`)).json();
        egal([manifeste.scope, manifeste.id], ['/p/', '/p/compagnon'], 'une seule appli pour les campagnes du relais');
        const cmia = await ctx.navigateur.newContext({ ...devices['Pixel 7'] });
        const mia = await cmia.newPage();
        ctx.pages.push(mia);
        const erreursMia = suivreErreurs(mia);
        await mia.goto(`${lien1}compagnon/`);
        await mia.waitForSelector('form.rejoindre:not(.autre) input');
        await mia.locator('form.rejoindre:not(.autre) input').first().fill('Mia');
        await mia.locator('form.rejoindre:not(.autre) input').nth(1).fill(reseau.infos().code);
        await mia.locator('form.rejoindre:not(.autre) button[type=submit]').click();
        for (let i = 0; i < 80 && !reseau.infos().attente.length; i++) await mia.waitForTimeout(100);
        vrai((await mia.locator('.rejoindre-etat').textContent()).includes('MJ'), 'le téléphone attend l\'accord du MJ');
        reseau.accepter(reseau.infos().attente[0].id, true);
        await mia.waitForFunction(() => window.Compagnon?.liaison?.boite && window.Compagnon.vue, null, { timeout: 15000 });
        await mia.evaluate(() => Compagnon.aller('fiche'));
        await mia.waitForSelector('.libres .libre');
        await capture(mia, '8-tel-choisir-heros');
        await mia.locator('.libres .libre', { hasText: 'Elaria' }).click();
        await mia.waitForFunction(() => window.Compagnon.vue?.fiche, null, { timeout: 8000 });
        egal(await page.evaluate(() => { const T = App.moteur.table; const c = T.partie().equipe.find((x) => /Elaria/.test(x.nom || x.creature)); return T.cleRole('Mia') === T.cleDe(c); }), true, 'Mia joue Elaria, choisie sur son téléphone');
        sansErreur(erreursMia, 'compagnon de Mia');

        // Couper le téléphone (onglet Joueurs) : il est délié, sa boîte est vidée sur le relais.
        await onglet(page, 'Joueurs');
        await page.locator('.table-telephones .table-bouton').first().click();
        await tel.waitForFunction(() => !window.Compagnon?.liaison, null, { timeout: 8000 });
        await Promise.all(retirees);
        vrai(!fs.existsSync(fichierCopie), 'la boîte de Lou est vidée');
        // Le compagnon du PC de Lou reste relié ; l'ancienne clé est oubliée (une nouvelle, avec une nouvelle boîte,
        // lui sera donnée quand il revient en séance).
        const apres = await page.evaluate(() => { const c = App.moteur.table.table().campagne; return [c.telephones.length, c.cles.lou?.boite || '']; });
        egal(apres[0], 2, 'il reste le compagnon du PC de Lou et le téléphone de Mia');
        vrai(apres[1] !== boite, 'l\'ancienne clé de Lou ne sert plus');

        // L'état de la campagne, pour la pastille « en direct » de l'accueil du compagnon.
        const etat = await fetch(`${adresseRelais}/campagne/${camp.id}/etat`).then((r) => r.json());
        egal(etat.direct, true, 'le relais dit que la séance est ouverte');

        egal(erreursTel.join(' | '), '', 'aucune erreur sur le téléphone');
        egal(erreursAmi.join(' | '), '', 'aucune erreur chez Lou');
        egal(erreurs.join(' | '), '', 'aucune erreur chez le MJ');
      } finally {
        relais.fermer();
        reseau.fermer();
        relaisSrv.closeAllConnections?.();
        relaisSrv.close();
        delete process.env.DONNEES;
        fs.rmSync(donnees, { recursive: true, force: true });
      }
    },
  },
];
