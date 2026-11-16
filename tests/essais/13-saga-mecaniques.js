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
];
