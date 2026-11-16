// Saga 1.33 : le relais (relais/relais.js) et Saga qui passe par lui (moteur/relais-client.js) : un ami
// ouvre le lien d'invitation dans son navigateur, attend l'accord de l'hôte, reçoit son flux et parle,
// sans que l'hôte ouvre un port. Tout tourne ici : le relais sur 127.0.0.1, le serveur de la partie
// (moteur/reseau.js) comme dans Saga.
const path = require('node:path');
const { RACINE } = require('../lib/tafl');
const { egal, vrai } = require('../lib/verifier');

const MOTEUR = path.join(RACINE, 'moteur');

module.exports = [
  {
    nom: 'Saga : un ami rejoint par le relais, sans port ouvert (Saga 1.33)',
    async faire(ctx) {
      process.env.RELAIS_CLE = 'cle-essai';
      delete require.cache[require.resolve(path.join(RACINE, 'relais', 'relais.js'))];
      const { serveur: relaisSrv } = require(path.join(RACINE, 'relais', 'relais.js'));
      await new Promise((r) => relaisSrv.listen(0, '127.0.0.1', r));
      const adresseRelais = `http://127.0.0.1:${relaisSrv.address().port}`;
      const actions = [];
      const Reseau = require(path.join(MOTEUR, 'reseau.js'));
      const reseau = Reseau.creer({
        moteur: MOTEUR, version: 'essai',
        lireJeuPublic: async () => ({ dossier: 'reseau', jeu: '{}', tuiles: null, cartes: {}, donnees: {}, scripts: {} }),
        lireSon: async () => Buffer.alloc(0), versHote: (a) => actions.push(a), clientsChanges: () => {},
      });
      const Relais = require(path.join(MOTEUR, 'relais-client.js'));
      const relais = Relais.creer();
      try {
        await reseau.ouvrir({ port: 7840, mode: 'table', nom: 'MJ', titre: 'Essai relais' });
        // Une mauvaise clé est refusée.
        let refus = '';
        await relais.ouvrir({ adresse: adresseRelais, cle: 'mauvaise', port: reseau.port, secretLocal: reseau.secretRelais }).catch((e) => { refus = e.message; });
        vrai(/clé/.test(refus), `mauvaise clé : « ${refus} »`);
        const { lien } = await relais.ouvrir({ adresse: adresseRelais, cle: 'cle-essai', port: reseau.port, secretLocal: reseau.secretRelais });
        const infos = reseau.passerInternet({ adresse: lien, methode: 'relais' });
        egal(infos.internet.methode, 'relais', 'la partie passe par le relais');
        vrai(/^http:\/\/127\.0\.0\.1:\d+\/p\/[A-Za-z0-9_-]+\/$/.test(lien), `le lien : ${lien}`);

        // L'ami ouvre le lien (avec le code) : la page de Saga, ses scripts sous /p/<salle>/.
        const page = await ctx.navigateur.newPage();
        ctx.pages.push(page);
        // Saga 1.33.1 : aucun fichier de l'interface ne doit manquer (perso-base.js manquait).
        const manques = [], erreurs = [];
        page.on('response', (r) => { if (r.request().method() === 'GET' && r.status() >= 400 && !r.url().endsWith('/favicon.ico')) manques.push(`${r.status()} ${r.url()}`); });
        page.on('pageerror', (e) => erreurs.push(e.message));
        await page.goto(`${lien}?code=${encodeURIComponent(infos.code)}`);
        await page.waitForSelector('form.reseau-carte');
        vrai(!(await page.$('#reseau-chargement')), 'le voile de chargement est parti');
        egal(manques.join(' | '), '', 'aucun fichier manquant');
        egal(await page.inputValue('form.reseau-carte input[name=code]'), infos.code, 'le code pris dans le lien');
        await page.fill('form.reseau-carte input[name=nom]', 'Lou');
        await page.click('form.reseau-carte button[type=submit]');
        // Venu par le relais : il attend l'accord de l'hôte.
        for (let i = 0; i < 40 && !reseau.infos().attente.length; i++) await page.waitForTimeout(100);
        const a = reseau.infos().attente[0];
        egal(a?.nom, 'Lou', 'la demande de Lou attend l\'hôte');
        reseau.accepter(a.id, true);
        // Admis : son flux passe par le relais (la liste des joueurs arrive), et son message remonte.
        await page.waitForFunction(() => window.App && document.querySelector('.ecran-joueurs, body.mode-table'), null, { timeout: 15000 });
        for (let i = 0; i < 40 && !reseau.infos().joueurs.some((j) => j.nom === 'Lou' && j.connecte); i++) await page.waitForTimeout(100);
        vrai(reseau.infos().joueurs.some((j) => j.nom === 'Lou' && j.connecte), 'Lou est connecté par le relais');
        await page.evaluate(() => window.saga.tableDemander({ type: 'ping', x: 1, y: 2 }));
        for (let i = 0; i < 30 && !actions.some((x) => x.type === 'ping'); i++) await page.waitForTimeout(100);
        const ping = actions.find((x) => x.type === 'ping');
        vrai(Boolean(ping?.client), 'la demande de Lou arrive à l\'hôte');
        await page.evaluate(() => PersoBase.planches); // le personnage de base est bien là
        egal(erreurs.join(' | '), '', 'aucune erreur dans la page de Lou');
        egal(ping && reseau.infos().clients.find((c) => c.id === ping.client)?.nom, 'Lou', 'de la part de Lou');
      } finally {
        relais.fermer();
        reseau.fermer();
        relaisSrv.closeAllConnections?.();
        relaisSrv.close();
      }
    },
  },
];
