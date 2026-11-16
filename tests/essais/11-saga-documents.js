// Saga 1.37 : les documents du MJ. Le MJ prépare une lettre (un brouillon), la donne à Lou seul et l'ouvre
// sur son écran ; il donne une carte (une image) à tous et la montre. Lou la voit, la garde dans son onglet
// Docs ; Mia (une autre amie) n'a pas la lettre, et le serveur refuse de lui en servir l'image. Le téléphone
// du MJ prend une photo et la donne ; celui de Lou reçoit le tout, avec une vibration et « Nouveau ».
const fs = require('node:fs');
const path = require('node:path');
const { devices } = require('playwright');
const { RACINE, suivreErreurs } = require('../lib/tafl');
const { jeuDuModele } = require('../lib/saga');
const { egal, vrai } = require('../lib/verifier');

const MOTEUR = path.join(RACINE, 'moteur');
const CAPTURES = process.env.CAPTURES || '';
const capture = async (p, nom) => { if (CAPTURES) { fs.mkdirSync(CAPTURES, { recursive: true }); await p.screenshot({ path: `${CAPTURES}/${nom}.png` }); } };

// Une « carte au trésor » dessinée ici (un parchemin, des chemins, une croix), en JPEG.
function dessinerCarte(l, h) {
  const c = document.createElement('canvas'); c.width = l; c.height = h;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, l, h); g.addColorStop(0, '#e9d7ad'); g.addColorStop(1, '#c9ad78');
  x.fillStyle = g; x.fillRect(0, 0, l, h);
  x.strokeStyle = 'rgba(90,60,25,.55)'; x.lineWidth = 5; x.setLineDash([16, 12]);
  x.beginPath(); x.moveTo(l * 0.1, h * 0.8); x.bezierCurveTo(l * 0.3, h * 0.2, l * 0.6, h * 0.9, l * 0.82, h * 0.3); x.stroke();
  x.setLineDash([]); x.strokeStyle = '#8b1d12'; x.lineWidth = 10;
  x.beginPath(); x.moveTo(l * 0.79, h * 0.25); x.lineTo(l * 0.85, h * 0.35); x.moveTo(l * 0.85, h * 0.25); x.lineTo(l * 0.79, h * 0.35); x.stroke();
  x.fillStyle = 'rgba(70,45,20,.8)'; x.font = `bold ${Math.round(h / 12)}px Georgia`; x.fillText('Brumeval', l * 0.08, h * 0.15);
  for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(40,90,40,.55)'; x.beginPath(); x.arc(l * (0.15 + i * 0.08), h * (0.55 + Math.sin(i) * 0.1), h / 22, 0, 7); x.fill(); }
  return c.toDataURL('image/jpeg', 0.85);
}

module.exports = [
  {
    nom: 'Saga : les documents du MJ (Saga 1.37)',
    async faire(ctx) {
      const html = await jeuDuModele(ctx, 'jdr', { taille: 32 });
      const contexte = await ctx.navigateur.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
      const page = await contexte.newPage();
      ctx.pages.push(page);
      const erreurs = suivreErreurs(page);

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
        if (sorte === 'ouvrir') return reseau.ouvrir({ port: 7854, ...args[0] }).then(() => reseau.infos());
        if (sorte === 'infos') return reseau.infos();
        if (sorte === 'fermer') { reseau.fermer(); return reseau.infos(); }
        if (sorte === 'envoyer') return reseau.envoyer(...args);
        if (sorte === 'dire') return reseau.dire(...args);
        if (sorte === 'documents') return reseau.documents(args[0]);
        if (sorte === 'compagnon') return reseau.compagnonMj();
        return null;
      });
      await page.addInitScript(() => {
        const plus = {
          reseauOuvrir: (o) => window.__pont('ouvrir', o), reseauInfos: () => window.__pont('infos'), reseauFermer: () => window.__pont('fermer'),
          reseauEnvoyer: (id, s, j) => { window.__pont('envoyer', id, s, j); }, reseauDire: (t, p, j) => { window.__pont('dire', t, p, j); },
          reseauCompagnon: () => window.__pont('compagnon'), tableDocuments: (l) => { window.__pont('documents', l); },
          onReseauAction: (cb) => { window.__surAction = cb; }, onReseauClients: (cb) => { window.__surClients = cb; },
        };
        let saga;
        Object.defineProperty(window, 'saga', { configurable: true, get: () => saga, set: (v) => { saga = Object.assign(v, plus); } });
      });
      const onglet = (p, nom) => p.locator(`.table-onglet[title="${nom}"]`).click();
      const base = () => `http://127.0.0.1:${reseau.port}`;
      const poster = (chemin, corps, entetes = {}) => fetch(base() + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json', ...entetes }, body: JSON.stringify(corps) }).then((r) => r.json().catch(() => ({})));
      try {
        await page.goto(`file://${html}`);
        await page.waitForFunction(() => typeof App !== 'undefined' && App?.moteur);
        await page.getByText('Mode table (MJ)').click();
        await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe()); for (const n of ['Thorgrim', 'Elaria', 'Pip']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(600); }
        await page.waitForFunction(() => App.moteur.table.actif && App.moteur.table.vue());
        await page.evaluate(() => { App.moteur.table.table().campagne = { nom: 'Les ombres de Brumeval' }; });
        await page.evaluate(() => App.moteur.multi.ouvrir({ mode: 'table', nom: 'MJ', titre: 'Brumeval' }));

        // Lou rejoint dans son navigateur et joue Thorgrim ; Mia rejoint aussi (sans navigateur ici).
        const c2 = await ctx.navigateur.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
        const ami = await c2.newPage();
        ctx.pages.push(ami);
        const erreursAmi = suivreErreurs(ami);
        await ami.goto(`${base()}/?code=${encodeURIComponent(reseau.infos().code)}`);
        await ami.waitForSelector('form.reseau-carte');
        await ami.fill('form.reseau-carte input[name=nom]', 'Lou');
        await ami.click('form.reseau-carte button[type=submit]');
        await ami.waitForSelector('.ti-haut');
        await page.evaluate(() => { const T = App.moteur.table; const c = T.partie().equipe.find((x) => x.jdr && /Thorgrim/.test(x.nom || x.creature)); T.donnerRole('Lou', T.cleDe(c)); });
        const mia = await poster('/rejoindre', { code: reseau.infos().code, nom: 'Mia' });
        vrai(Boolean(mia.jeton), 'Mia rejoint');
        await page.waitForFunction(() => App.moteur.multi.joueurs.some((j) => j.nom === 'Mia'));

        // --- Le MJ prépare une lettre dans l'onglet Docs (un brouillon), puis la donne à Lou seul ---
        await onglet(page, 'Docs');
        await page.locator('.volet-docs .table-bouton', { hasText: 'Texte' }).click();
        await page.fill('.volet-docs input.table-champ', 'Lettre du baron');
        await page.fill('.volet-docs textarea', 'Mes amis,\n\nLa crypte sous le moulin n\'est pas vide. Ce qui dort sous Brumeval s\'éveille à chaque nouvelle lune.\nVenez seuls, et ne parlez de cette lettre à personne.\n\n— Baron Aldric');
        await page.locator('.volet-docs .table-bouton', { hasText: 'Créer' }).click();
        await page.waitForSelector('.doc-donner');
        const brouillon = await page.evaluate(() => App.moteur.table.documents()[0]);
        egal(brouillon.pour, [], 'une lettre créée est un brouillon');
        await page.waitForTimeout(400);
        egal(await ami.locator('.doc-visionneuse').count(), 0, 'Lou n\'a rien tant que c\'est un brouillon');
        await page.locator('.doc-donner label', { hasText: 'Lou' }).locator('input').check();
        await capture(page, '1-mj-donner');
        await page.locator('.doc-donner .table-bouton', { hasText: 'Donner' }).click();
        egal(await page.evaluate(() => App.moteur.table.documents()[0].pour), ['Lou'], 'la lettre est à Lou');
        // Elle s'ouvre chez Lou (« L'ouvrir tout de suite » était coché).
        await ami.waitForSelector('.doc-visionneuse .doc-carte.lettre', { timeout: 6000 });
        vrai((await ami.locator('.doc-texte').textContent()).includes('Baron Aldric'), 'Lou lit la lettre');
        await capture(ami, '2-ami-lettre');
        await ami.keyboard.press('Escape');
        await ami.waitForSelector('.doc-visionneuse', { state: 'detached' });

        // --- Une carte (une image), donnée à tous et montrée ---
        const image = await page.evaluate(dessinerCarte.toString().replace(/^function dessinerCarte/, '(function') + ')(1200, 800)');
        await page.evaluate((img) => App.moteur.table.docAgir({ type: 'doc_nouveau', titre: 'Carte de la crypte', texte: 'Trouvée sur le cadavre du garde, près du puits.', image: img, pour: 'tous', montrer: true }), image);
        await ami.waitForSelector('.doc-visionneuse .doc-image', { timeout: 6000 });
        await ami.waitForFunction(() => document.querySelector('.doc-visionneuse .doc-image')?.naturalWidth > 0, null, { timeout: 6000 });
        await capture(ami, '3-ami-carte-montree');
        // Le zoom (Saga 1.37.1) : la molette agrandit vers le pointeur, le double-clic revient.
        const boite = await ami.locator('.doc-image-cadre').boundingBox();
        await ami.mouse.move(boite.x + boite.width * 0.7, boite.y + boite.height * 0.3);
        for (let i = 0; i < 4; i++) await ami.mouse.wheel(0, -120);
        await ami.waitForFunction(() => /scale\(/.test(document.querySelector('.doc-image').style.transform));
        await capture(ami, '3b-ami-carte-zoom');
        await ami.mouse.dblclick(boite.x + boite.width / 2, boite.y + boite.height / 2);
        await ami.waitForFunction(() => !document.querySelector('.doc-image').style.transform);
        await ami.keyboard.press('Escape');
        // L'onglet Docs de Lou : ses deux documents.
        await onglet(ami, 'Docs');
        await ami.waitForFunction(() => document.querySelectorAll('.volet-documents .doc-ligne').length === 2, null, { timeout: 5000 });
        await ami.waitForFunction(() => document.querySelector('.volet-documents .doc-vignette img')?.naturalWidth > 0, null, { timeout: 5000 });
        await capture(ami, '4-ami-docs');

        // Le serveur : Mia a la carte (à tous), pas la lettre (à Lou) ; sans jeton, rien.
        const [lettre, carte] = await page.evaluate(() => App.moteur.table.documents().map((d) => d.id));
        // (la lettre reçoit une image, pour vérifier que le serveur la refuse à Mia)
        await page.evaluate(([id, img]) => App.moteur.table.docAgir({ type: 'doc_modifier', id, image: img }), [lettre, image]);
        await page.waitForTimeout(500);
        const statut = (id, jeton) => fetch(`${base()}/document?id=${id}${jeton ? `&jeton=${jeton}` : ''}`).then((r) => r.status);
        egal(await statut(carte, mia.jeton), 200, 'Mia reçoit l\'image de la carte');
        egal(await statut(lettre, mia.jeton), 404, 'Mia ne reçoit pas l\'image de la lettre de Lou');
        egal(await statut(carte, ''), 401, 'sans jeton : rien');

        await onglet(page, 'Docs');
        await page.waitForTimeout(300);
        await capture(page, '5-mj-docs');

        // --- Le téléphone du MJ : la liste, et une photo qui devient un document ---
        const lien = reseau.compagnonMj();
        const ctel = await ctx.navigateur.newContext({ ...devices['Pixel 7'] });
        const tel = await ctel.newPage();
        ctx.pages.push(tel);
        const erreursTel = suivreErreurs(tel);
        await tel.goto(`${base()}/compagnon/#lien=${lien.code}`);
        await tel.waitForFunction(() => window.Compagnon?.vue?.documents?.length === 2, null, { timeout: 10000 });
        await tel.evaluate(() => Compagnon.aller('documents'));
        await tel.waitForSelector('.docs .doc');
        const photo = await page.evaluate(() => {
          const c = document.createElement('canvas'); c.width = 1800; c.height = 1350;
          const x = c.getContext('2d');
          x.fillStyle = '#3a2c22'; x.fillRect(0, 0, 1800, 1350);
          x.fillStyle = '#f2e6c8'; x.save(); x.translate(900, 675); x.rotate(-0.06); x.fillRect(-620, -440, 1240, 880);
          x.fillStyle = '#2d2014'; x.font = 'italic 64px Georgia'; x.fillText('Le plan griffonné', -540, -320);
          x.strokeStyle = '#2d2014'; x.lineWidth = 8; x.strokeRect(-480, -200, 420, 300); x.strokeRect(80, -120, 360, 380); x.beginPath(); x.moveTo(-60, -50); x.lineTo(80, 40); x.stroke();
          for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; x.fillRect(-620 + Math.random() * 1240, -440 + Math.random() * 880, 3, 3); }
          x.restore();
          return c.toDataURL('image/jpeg', 0.92).split(',')[1];
        });
        await tel.locator('label.btn.photo input[type=file]').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo, 'base64') });
        await tel.waitForSelector('.edition .apercu');
        await tel.fill('.edition input.champ', 'Le plan griffonné');
        await tel.locator('.puce', { hasText: 'Tous' }).click();
        await tel.locator('.puce', { hasText: 'Lou' }).click();
        await tel.waitForTimeout(200);
        await capture(tel, '6-tel-mj-photo');
        const n0 = await page.evaluate(() => App.moteur.table.documents().length);
        await tel.locator('.edition .btn', { hasText: 'Donner' }).click();
        await page.waitForFunction((n) => App.moteur.table.documents().length === n + 1, n0, { timeout: 15000 });
        const neuf = await page.evaluate(() => { const d = App.moteur.table.documents().at(-1); return { titre: d.titre, pour: d.pour, image: /^data:image\/jpeg;base64,/.test(d.image) && d.image.length > 20000 }; });
        egal(neuf, { titre: 'Le plan griffonné', pour: ['Lou'], image: true }, 'la photo du téléphone est un document, à Lou');
        await tel.waitForFunction(() => document.querySelectorAll('.docs .doc').length === 3, null, { timeout: 5000 });
        await tel.waitForFunction(() => [...document.querySelectorAll('.docs .doc img')].every((i) => i.naturalWidth > 0), null, { timeout: 5000 });
        await capture(tel, '7-tel-mj-docs');

        // --- Le téléphone de Lou : ses trois documents, « Nouveau » sur ce qu'il n'a pas ouvert ---
        const lienLou = await ami.evaluate(() => window.saga.reseau.compagnon());
        const ctel2 = await ctx.navigateur.newContext({ ...devices['Pixel 7'] });
        const tel2 = await ctel2.newPage();
        ctx.pages.push(tel2);
        const erreursTel2 = suivreErreurs(tel2);
        await tel2.goto(`${base()}/compagnon/#lien=${lienLou.code}`);
        await tel2.waitForFunction(() => window.Compagnon?.vue?.documents?.length === 3, null, { timeout: 10000 });
        // Un document qui arrive pendant qu'il regarde : la pastille, puis « Nouveau » dans la liste.
        await tel2.evaluate(() => { window.__vibre = 0; navigator.vibrate = () => { window.__vibre++; return true; }; });
        await page.evaluate(() => App.moteur.table.docAgir({ type: 'doc_nouveau', titre: 'Indice : le sceau', texte: 'Le sceau de cire porte une chouette, l\'emblème de la famille Morvan.', pour: ['Lou'] }));
        await tel2.waitForSelector('.nav .pastille', { timeout: 5000 });
        vrai(await tel2.evaluate(() => window.__vibre > 0), 'le téléphone vibre');
        await tel2.evaluate(() => Compagnon.aller('documents'));
        await tel2.waitForFunction(() => document.querySelectorAll('.docs .doc').length === 4 && document.querySelector('.docs .doc.neuf'), null, { timeout: 5000 });
        await tel2.waitForFunction(() => [...document.querySelectorAll('.docs .doc img')].every((i) => i.naturalWidth > 0), null, { timeout: 5000 });
        await capture(tel2, '8-tel-lou-docs');
        await tel2.locator('.docs .doc', { hasText: 'Carte de la crypte' }).click();
        await tel2.waitForFunction(() => document.querySelector('.visionneuse img')?.naturalWidth > 0, null, { timeout: 5000 });
        await capture(tel2, '9-tel-lou-carte');
        // Double toucher : zoom sur le téléphone.
        const cadreTel = await tel2.locator('.vis-cadre').boundingBox();
        await tel2.waitForSelector('.vis-cadre.zoom-cadre');
        // (deux touchers rapprochés, envoyés d'un coup : deux tap() de Playwright peuvent être trop espacés)
        await tel2.evaluate(([x, y]) => {
          const c = document.querySelector('.vis-cadre');
          for (let i = 0; i < 2; i++) for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, { pointerId: 7 + i, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
        }, [cadreTel.x + cadreTel.width / 2, cadreTel.y + cadreTel.height / 2]);
        await tel2.waitForFunction(() => /scale\(/.test(document.querySelector('.vis-cadre img').style.transform), null, { timeout: 3000 });
        await tel2.locator('.vis-tete .icone-bouton').click();

        // --- Le MJ reprend la lettre : elle disparaît chez Lou ---
        // (par le bouton du panneau : il se redessine tout de suite, Saga 1.37.1)
        await onglet(page, 'Docs');
        await page.locator('.volet-docs .doc-ligne', { hasText: 'Lettre du baron' }).locator('.table-bouton[title^="Supprimer"]').click();
        await page.waitForFunction(() => ![...document.querySelectorAll('.volet-docs .doc-ligne')].some((l) => l.textContent.includes('Lettre du baron')), null, { timeout: 3000 });
        await tel2.waitForFunction(() => document.querySelectorAll('.docs .doc').length === 3, null, { timeout: 5000 });
        await ami.waitForFunction(() => document.querySelectorAll('.volet-documents .doc-ligne').length === 3, null, { timeout: 5000 });
        egal(await statut(lettre, mia.jeton), 404, 'la lettre retirée n\'est plus servie');

        // L'écran des joueurs (la télé) : seulement ce qui est à tous, et ce que le MJ montre.
        const tele = await page.evaluate(() => TableDocuments.vue(App.moteur.table.table(), '', false, App.moteur.table.montre));
        egal(tele.documents.map((d) => d.titre), ['Carte de la crypte'], 'la télé ne voit que la carte');
        // Les documents restent dans la partie (la sauvegarde).
        vrai(await page.evaluate(() => JSON.stringify(App.moteur.table.partie()).includes('Le plan griffonné')), 'gardés avec la partie');

        egal(erreursTel.join(' | '), '', 'aucune erreur sur le téléphone du MJ');
        egal(erreursTel2.join(' | '), '', 'aucune erreur sur le téléphone de Lou');
        egal(erreursAmi.join(' | '), '', 'aucune erreur chez Lou');
        egal(erreurs.join(' | '), '', 'aucune erreur dans Saga');
      } finally {
        reseau.fermer();
      }
    },
  },
];
