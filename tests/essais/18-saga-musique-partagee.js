// Saga 1.46 : la musique et les bruitages du MJ s'entendent chez les amis (dans leur navigateur), chacun avec son
// volume ; le MJ peut les garder pour lui.
const fs = require('node:fs');
const path = require('node:path');
const { RACINE, suivreErreurs } = require('../lib/tafl');
const { jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

const MOTEUR = path.join(RACINE, 'moteur');

// Un petit WAV : 0,2 s de silence (8 kHz, 8 bits).
function wav() {
  const n = 1600, b = Buffer.alloc(44 + n, 128);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
}

module.exports = [
  {
    nom: 'Saga : la musique du MJ chez un ami (Saga 1.46)',
    async faire(ctx) {
      const html = await jeuDuModele(ctx, 'jdr', { taille: 32 });
      const page = await (await ctx.navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      ctx.pages.push(page);
      const erreurs = suivreErreurs(page);
      const SON = wav();
      const demandes = [];
      const Reseau = require(path.join(MOTEUR, 'reseau.js'));
      const versPage = (nom, d) => page.evaluate(([n, x]) => window[n]?.(x), [nom, d]).catch(() => {});
      const reseau = Reseau.creer({
        moteur: MOTEUR, version: 'essai',
        lireJeuPublic: async () => {
          const d = path.dirname(html);
          const lireDir = (sous) => Object.fromEntries((fs.existsSync(path.join(d, sous)) ? fs.readdirSync(path.join(d, sous)) : []).map((f) => [`${sous}/${f}`, fs.readFileSync(path.join(d, sous, f), 'utf8')]));
          return Reseau.jeuPublic({ jeu: fs.readFileSync(path.join(d, 'jeu.json'), 'utf8'), tuiles: fs.readFileSync(path.join(d, 'tuiles.tafl'), 'utf8'), cartes: lireDir('cartes'), donnees: lireDir('donnees'), scripts: {} });
        },
        lireSon: async (chemin) => { demandes.push(chemin); return SON; },
        versHote: (a) => versPage('__surAction', a), clientsChanges: (l) => versPage('__surClients', l),
      });
      await page.exposeFunction('__pont', (sorte, ...args) => {
        if (sorte === 'ouvrir') return reseau.ouvrir({ port: 7861, ...args[0] }).then(() => reseau.infos());
        if (sorte === 'infos') return reseau.infos();
        if (sorte === 'fermer') { reseau.fermer(); return reseau.infos(); }
        if (sorte === 'envoyer') return reseau.envoyer(...args);
        if (sorte === 'dire') return reseau.dire(...args);
        return null;
      });
      await page.addInitScript((b64) => {
        window.SAGA_SONS = { 'sons/theme.wav': b64, 'sons/porte.wav': b64 };
        const plus = {
          reseauOuvrir: (o) => window.__pont('ouvrir', o), reseauInfos: () => window.__pont('infos'), reseauFermer: () => window.__pont('fermer'),
          reseauEnvoyer: (id, s, j) => { window.__pont('envoyer', id, s, j); }, reseauDire: (t, p, j) => { window.__pont('dire', t, p, j); },
          onReseauAction: (cb) => { window.__surAction = cb; }, onReseauClients: (cb) => { window.__surClients = cb; },
        };
        let saga;
        Object.defineProperty(window, 'saga', { configurable: true, get: () => saga, set: (v) => { saga = Object.assign(v, plus); } });
      }, SON.toString('base64'));
      try {
        await page.goto(`file://${html}`);
        await page.waitForFunction(() => typeof App !== 'undefined' && App?.moteur);
        await page.getByText('Mode table (MJ)').click();
        await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
        await page.evaluate(() => App.moteur.multi.ouvrir({ mode: 'table', nom: 'MJ', titre: 'Brumeval' }));
        const ami = await (await ctx.navigateur.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
        ctx.pages.push(ami);
        const erreursAmi = suivreErreurs(ami);
        await ami.goto(`http://127.0.0.1:${reseau.port}/?code=${encodeURIComponent(reseau.infos().code)}`);
        await ami.fill('form.reseau-carte input[name=nom]', 'Lou');
        await ami.click('form.reseau-carte button[type=submit]');
        await ami.waitForSelector('.ti-haut');
        await ami.mouse.click(400, 400); // un geste : le navigateur permet alors le son
        // Sa première vue est arrivée (le lieu s'affiche) : ce qui joue ensuite est nouveau pour lui.
        await ami.waitForFunction(() => document.querySelector('.ti-titre small')?.textContent.trim().length > 0, null, { timeout: 8000 });
        vrai(await ami.locator('.ti-son input[type=range]').count() === 1, 'l\'ami a son bouton de son et son volume');

        // Le MJ lance une musique et un bruitage : l'ami les demande au serveur et les joue.
        await page.evaluate(() => { const T = App.moteur.table; T.musique('sons/theme.wav'); T.son('sons/porte.wav'); });
        for (let i = 0; i < 20 && !(demandes.includes('sons/theme.wav') && demandes.includes('sons/porte.wav')); i++) await page.waitForTimeout(250);
        egal([demandes.includes('sons/theme.wav'), demandes.includes('sons/porte.wav')], [true, true], 'la musique et le bruitage du MJ arrivent chez l\'ami');
        // L'ami coupe le son chez lui ; le MJ garde le son pour lui.
        await ami.locator('.ti-son button').click();
        egal(await ami.evaluate(() => localStorage.getItem('saga:table-volume')), '0', 'l\'ami coupe le son chez lui, et c\'est retenu');
        const prive = await page.evaluate(() => { const T = App.moteur.table; T.agir({ type: 'audio', valeur: 'mj' }); const v = TableEtat.vue(T.jeu(), T.partie(), { mj: false, perso: null }, { carte: T.carte(), presents: [], audio: T.table().audio === 'mj' ? null : {} }); return [T.table().audio, v.audio]; });
        egal(prive, ['mj', null], 'le MJ peut garder la musique pour lui');
        // Le menu du jeu (Échap) en mode table : rien de ce qui sert à l'aventure seul.
        await page.keyboard.press('Escape');
        await page.waitForSelector('#pause:not([hidden])');
        const menu = await page.evaluate(() => ['[data-action="dex"]', '[data-page="sac"]', '[data-page="quetes"]', '[data-page="badges"]'].map((s) => document.querySelector(`.pause-choix${s}`).hidden)
          .concat([...document.querySelectorAll('#pause-actions .pause-choix')].some((b) => b.textContent.includes('Jets de dés'))));
        egal(menu, [true, true, true, true, false], 'le menu du MJ n\'a ni bestiaire, ni sac, ni quêtes, ni badges, ni jets de dés');
        await page.keyboard.press('Escape');
        sansErreur(erreurs, 'Saga (MJ)');
        sansErreur(erreursAmi, 'Saga (ami)');
      } finally {
        reseau.fermer();
      }
    },
  },
];
