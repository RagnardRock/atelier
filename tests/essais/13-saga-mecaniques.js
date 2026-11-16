// Saga 1.41 : les mécaniques d'un jeu JDR réglées dans Tafl, sans code (reglages.jdr.mecaniques) : une
// défense à la place de la CA, une armure qui absorbe, des paliers de santé avec malus, une table de
// blessures tirée en entrant dans un palier, et des jets pour tenir à chaque tour. Un vrai combat du pack
// (JdrCombat) les joue, avec une interface qui choisit toute seule.
const { ouvrirSaga, jeuDuModele } = require('../lib/saga');
const { egal, vrai, sansErreur } = require('../lib/verifier');

// Le cas d'essai de Ragna : toucher = jet contre couverture + esquive ; l'armure retire ses points aux dégâts ;
// ≥ 80 % en forme, 40-80 % malus, < 40 % blessure permanente (table), < 10 % jets pour tenir (5 % ne laisse aucun PV à un héros de niveau 1) à chaque tour.
const MECANIQUES = {
  active: true, defense: 'couverture + esquive', absorption: 'armure', degat_min: 0,
  paliers: [
    { nom: 'Blessé', sous: 80, malus: -2 },
    { nom: 'Gravement blessé', sous: 40, malus: -4, table: 'blessures' },
    { nom: 'Mourant', sous: 10, malus: -6, jets: true },
  ],
  tables: [{ id: 'blessures', nom: 'Blessure permanente', de: '1d4', lignes: [
    { min: 1, max: 1, texte: 'Une vilaine cicatrice', malus: 0 }, { min: 2, max: 2, texte: 'Un doigt en moins', malus: -1 },
    { min: 3, max: 3, texte: 'Boiteux', malus: -1 }, { min: 4, max: 4, texte: 'Un œil crevé', malus: -2 },
  ] }],
  jets: { formule: '1d20', seuil: 10, reussites: 3, echecs: 3 },
};
const CHAMPS = [
  { id: 'couverture', nom: 'Couverture', type: 'nombre', depart: 4, modifiable: 'mj' },
  { id: 'esquive', nom: 'Esquive', type: 'nombre', depart: 6, modifiable: 'joueur' },
  { id: 'armure', nom: 'Armure', type: 'nombre', depart: 3, modifiable: 'mj' },
];

module.exports = [
  {
    nom: 'Saga : les mécaniques du jeu sans code (Saga 1.41)',
    async faire(ctx) {
      const { page, erreurs, saga } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'jdr', { taille: 32 }), { ctx });
      await page.getByText('Mode table (MJ)').click();
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      for (const n of ['Thorgrim', 'Elaria', 'Pip']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(500); }
      await page.waitForFunction(() => App.moteur.table.partie().equipe.length === 3);

      const r = await saga.lire(async ({ MECANIQUES, CHAMPS }) => {
        const T = App.moteur.table, jeu = T.jeu(), partie = T.partie();
        const R = jeu.donnees.reglages.reglages;
        const fiche = FichePerso.defaut();
        fiche.champs = CHAMPS;
        fiche.blocs.splice(1, 0, { type: 'champs', titre: 'Défense', colonne: 1, champs: CHAMPS.map((c) => c.id) });
        R.jdr = { ...R.jdr, fiche, mecaniques: MECANIQUES };
        const [thor, elaria] = partie.equipe;
        const out = {};
        // Les formules lisent les champs de la fiche.
        out.defense = JdrMeca.defense(jeu, JdrMeca.varsHeros(jeu, thor), 99);
        out.absorption = JdrMeca.absorption(jeu, JdrMeca.varsHeros(jeu, thor));
        // Un monstre sans ces champs garde sa CA.
        const gob = JdrBase.trouver(jeu, 'monstres_jdr', 'gobelin');
        out.defenseGobelin = [JdrMeca.defense(jeu, JdrMeca.varsMonstre(gob, 7, 7), Number(gob.ca)), Number(gob.ca)];
        // Les paliers et leur malus.
        const max = JdrPerso.pvMax(jeu, thor);
        thor.pv = Math.floor(max * 0.7);
        out.palier70 = [JdrMeca.palier(jeu, thor.pv, max)?.nom, JdrMeca.malus(jeu, thor)];
        JdrMeca.suivre(jeu, partie, thor);
        thor.pv = Math.floor(max * 0.3);
        const s = JdrMeca.suivre(jeu, partie, thor);
        out.blessure = { palier: s?.entre?.nom, tiree: Boolean(s?.blessure?.texte), gardee: (thor.blessures || []).length, malus: JdrMeca.malus(jeu, thor) };
        // Un test au d20 prend le malus.
        const t = await JdrTests.test({ jeu, partie, ui: { des: async () => {}, message: async () => {} }, c: thor, competence: 'athletisme', montrerJet: false });
        out.test = [t.bonus, JdrPerso.bonusCompetence(jeu, thor, 'athletisme') + JdrMeca.malus(jeu, thor)];
        // Les jets pour tenir.
        thor.pv = 1;
        JdrMeca.suivre(jeu, partie, thor);
        out.doitJeter = JdrMeca.doitJeter(jeu, thor);
        let n = 0, fin = '';
        while (!fin && n < 10) { fin = JdrMeca.jetRepete(jeu, partie, thor, 'Thorgrim').fini; n++; }
        out.jets = { fin, n };
        thor.pv = max; delete thor.jets; thor.blessures = []; JdrMeca.suivre(jeu, partie, thor);

        // Un vrai combat du pack : les héros attaquent, les gobelins répondent ; l'interface choisit seule.
        const messages = [];
        const ui = new Proxy({}, { get: (o, k) => {
          if (k === 'commande') return async (i, items) => (items.find((x) => x.id === 'attaque' && !x.desactive) ? 'attaque' : (items.find((x) => x.id === 'fin') ? 'fin' : 'esquiver'));
          if (k === 'cible') return async ({ possibles }) => { const i = (possibles || []).findIndex(Boolean); return i < 0 ? null : i; };
          if (k === 'liste') return async () => 0;
          if (k === 'message') return async (t) => { messages.push(String(t)); };
          return async () => {};
        } });
        for (const h of partie.equipe) h.pv = Math.floor(JdrPerso.pvMax(jeu, h) * 0.45);
        const groupe = { id: 'essai', nom: 'Essai', monstres: [{ monstre: 'gobelin', nombre: 4 }], fuite: false };
        const debut = partie.jdr.journal.length;
        const issue = await JdrCombat.lancer({ jeu, partie, ui, groupe });
        const journal = partie.jdr.journal.slice(debut);
        out.combat = {
          issue: issue?.issue || String(issue),
          defense: journal.some((l) => /^Défense \d+$/.test(l.contre || '')),
          armure: journal.some((l) => l.quoi === 'Armure'),
          paliers: messages.filter((m) => /blessé|Blessure permanente|mourant|tenir|lutte/i.test(m)).slice(0, 6),
        };
        return out;
      }, { MECANIQUES, CHAMPS });

      egal(r.defense, 10, 'la défense vaut couverture + esquive (4 + 6)');
      egal(r.absorption, 3, 'l\'armure absorbe 3');
      egal(r.defenseGobelin[0], r.defenseGobelin[1], 'un monstre sans ces champs garde sa CA');
      egal(r.palier70, ['Blessé', -2], 'à 70 % : Blessé, −2');
      egal(r.blessure.palier, 'Gravement blessé', 'à 30 % : Gravement blessé');
      vrai(r.blessure.tiree && r.blessure.gardee === 1, 'une blessure permanente tirée sur la table, gardée');
      vrai(r.blessure.malus <= -4, `le malus du palier et de la blessure (${r.blessure.malus})`);
      egal(r.test[0], r.test[1], 'un test au d20 prend le malus');
      vrai(r.doitJeter, 'à 1 PV : les jets pour tenir');
      vrai(['stable', 'mort'].includes(r.jets.fin) && r.jets.n >= 3 && r.jets.n <= 5, `trois réussites ou trois échecs (${r.jets.fin} en ${r.jets.n})`);
      vrai(['victoire', 'defaite'].includes(r.combat.issue), `le combat va au bout (${r.combat.issue})`);
      vrai(r.combat.defense, 'les attaques contre les héros visent leur Défense');
      vrai(r.combat.armure, 'l\'armure absorbe dans le combat');
      vrai(r.combat.paliers.length > 0, `les paliers parlent pendant le combat (${r.combat.paliers.join(' / ')})`);
      sansErreur(erreurs, 'Saga');
    },
  },
  {
    nom: 'Saga : un système de jeu à soi (résolution, parade, localisation, initiative, repos, états)',
    async faire(ctx) {
      const { page, erreurs, saga } = await ouvrirSaga(ctx.navigateur, await jeuDuModele(ctx, 'jdr', { taille: 32 }), { ctx });
      await page.getByText('Mode table (MJ)').click();
      await page.waitForFunction(() => App.moteur.table.actif && !App.moteur.table.occupe());
      for (const n of ['Thorgrim', 'Elaria']) { await page.evaluate(() => { App.moteur.table.preparerHeros(); }); await page.getByText(n).first().click(); await page.waitForTimeout(500); }
      await page.waitForFunction(() => App.moteur.table.partie().equipe.length === 2);

      const r = await saga.lire(async ({ CHAMPS }) => {
        const T = App.moteur.table, jeu = T.jeu(), partie = T.partie();
        const R = jeu.donnees.reglages.reglages;
        const fiche = FichePerso.defaut();
        fiche.champs = [...CHAMPS, { id: 'parade', nom: 'Parade', type: 'nombre', depart: 5, modifiable: 'mj' }];
        R.jdr = { ...R.jdr, fiche };
        const regler = (m) => { R.jdr.mecaniques = { active: true, ...m }; };
        const [thor] = partie.equipe;
        const ui = { des: async () => {}, message: async () => {} };
        const out = {};
        const essais = async (n, f) => { const l = []; for (let i = 0; i < n; i++) l.push(await f()); return l; };
        // d100 sous un score : le score lit la compétence en %.
        regler({ resolution: { type: 'd100', score: '60' } });
        const d100 = await essais(40, () => JdrTests.test({ jeu, partie, ui, c: thor, competence: 'athletisme', dd: 10, montrerJet: false }));
        out.d100 = { ok: d100.every((t) => t.reussi === (t.total <= 60)), formule: d100[0].ligne.formule, contre: d100[0].ligne.contre, des: d100.every((t) => t.total >= 1 && t.total <= 100) };
        // Une réserve de d6 : 4 dés, réussite sur 5+, il en faut 2.
        regler({ resolution: { type: 'reserve', des: '4', face: 5, reussites: '2' } });
        const res = await essais(30, () => JdrTests.test({ jeu, partie, ui, c: thor, competence: 'athletisme', dd: 10, montrerJet: false }));
        out.reserve = res.every((t) => t.ligne.des.length === 4 && t.total === t.ligne.des.filter((x) => x.valeur >= 5).length && t.reussi === (t.total >= 2));
        // 2d6 à paliers : 10+ réussite, 7-9 partielle.
        regler({ resolution: { type: '2d6', plein: '10', partiel: '7' } });
        const p2 = await essais(40, () => JdrTests.sauvegarde({ jeu, partie, ui, c: thor, carac: 'con', dd: 12, montrerJet: false }));
        out.deux = { ok: p2.every((t) => t.reussi === (t.total >= 7) && Boolean(t.partiel) === (t.total >= 7 && t.total < 10)), partiel: p2.some((t) => t.ligne.resultat === 'partiel') };
        // Les repos et les niveaux.
        regler({ repos: { court: 'niveau + 2', long: 'pv_max / 2' } });
        const max = JdrPerso.pvMax(jeu, thor);
        thor.pv = 1;
        await JdrHorsCombat.repos({ jeu, partie, ui: { dire: async () => {}, liste: async () => null }, sorte: 'court' });
        out.court = thor.pv - 1;
        thor.pv = 1;
        await JdrHorsCombat.repos({ jeu, partie, ui: { dire: async () => {} }, sorte: 'long' });
        out.long = [thor.pv, Math.min(max, 1 + Math.floor(max / 2))];
        thor.pv = max;
        regler({ niveau_pv: '7' });
        const avant = JdrPerso.pvMax(jeu, thor);
        thor.xp = 999999;
        await JdrHorsCombat.monterNiveau(jeu, partie, { dire: async () => {}, liste: async () => 0 }, thor, { jalon: true });
        out.niveau = JdrPerso.pvMax(jeu, thor) - avant - (Number(JdrPerso.origine(jeu, thor)?.pv_bonus_niveau) || 0); // le nain : +1 par niveau en plus
        // Un combat : la parade, la localisation, les héros d'abord, un état qui blesse à chaque tour.
        regler({
          parade: 'parade', localisation: 'lieux', initiative: { mode: 'heros' },
          tables: [{ id: 'lieux', nom: 'Localisation', de: '1d2', lignes: [{ min: 1, max: 1, texte: 'La tête', mult: 200 }, { min: 2, max: 2, texte: 'Le bras', mult: 50 }] }],
          etats: [{ id: 'empoisonne', malus: -2, degats: '1', fin_de: '1d20', fin_seuil: 30 }],
        });
        out.malusEtat = JdrMeca.malus(jeu, thor, ['empoisonne']);
        const messages = [];
        const uiC = new Proxy({}, { get: (o, k) => {
          if (k === 'commande') return async (i, items) => (items.find((x) => x.id === 'attaque' && !x.desactive) ? 'attaque' : (items.find((x) => x.id === 'fin') ? 'fin' : 'esquiver'));
          if (k === 'cible') return async ({ possibles }) => { const i = (possibles || []).findIndex(Boolean); return i < 0 ? null : i; };
          if (k === 'liste') return async () => 0;
          if (k === 'message') return async (t) => { messages.push(String(t)); };
          return async () => {};
        } });
        for (const h of partie.equipe) { h.pv = JdrPerso.pvMax(jeu, h); h.etats = ['empoisonne']; }
        // Un monstre avec ses champs : sa parade vient de lui.
        const gob = JdrBase.trouver(jeu, 'monstres_jdr', 'gobelin');
        gob.champs = { parade: 30 };
        const caGob = gob.ca;
        gob.ca = 1; // les héros touchent toujours : le gobelin doit parer
        const debut = partie.jdr.journal.length;
        const issue = await JdrCombat.lancer({ jeu, partie, ui: uiC, groupe: { id: 'essai', nom: 'Essai', monstres: [{ monstre: 'gobelin', nombre: 2 }], fuite: false } });
        delete gob.champs;
        gob.ca = caGob;
        const journal = partie.jdr.journal.slice(debut);
        const premier = journal.findIndex((l) => / contre /.test(l.quoi));
        out.combat = {
          issue: issue?.issue,
          paradeGobelin: journal.some((l) => l.quoi === 'Parade' && /Gobelin/i.test(l.qui) && l.resultat === 'reussi'),
          lieu: journal.some((l) => /^Localisation : (La tête \(×200 %\)|Le bras \(×50 %\))$/.test(l.quoi)),
          herosDabord: premier >= 0 && partie.equipe.some((h) => JdrPerso.nom(jeu, h) === journal[premier].qui),
          sansInit: !journal.some((l) => l.quoi === 'Initiative'),
          poison: journal.some((l) => l.quoi === JdrBase.nomEtat(jeu, 'empoisonne')),
        };
        return out;
      }, { CHAMPS });

      vrai(r.d100.ok && r.d100.des, 'd100 : réussi si le dé fait au plus le score');
      egal([r.d100.formule, r.d100.contre], ['d100', '≤ 60'], 'd100 : le journal le dit');
      vrai(r.reserve, 'réserve de d6 : on compte les 5 et les 6, il en faut deux');
      vrai(r.deux.ok && r.deux.partiel, '2d6 : réussite à 10, partielle de 7 à 9');
      vrai(r.court > 0 && r.court <= 4, `repos court : niveau + 2 PV (${r.court})`);
      egal(r.long[0], r.long[1], 'repos long : la moitié des PV max');
      egal(r.niveau, 7, 'un niveau donne 7 PV (et ce que donne son origine)');
      egal(r.malusEtat, -2, 'un état donne son malus');
      vrai(['victoire', 'defaite'].includes(r.combat.issue), `le combat va au bout (${r.combat.issue})`);
      vrai(r.combat.paradeGobelin, 'un gobelin pare avec la parade de ses champs');
      vrai(r.combat.lieu, 'la localisation multiplie les dégâts');
      vrai(r.combat.herosDabord && r.combat.sansInit, 'les héros jouent d\'abord, sans jet d\'initiative');
      vrai(r.combat.poison, 'le poison blesse à la fin du tour');
      sansErreur(erreurs, 'Saga');
    },
  },
];
