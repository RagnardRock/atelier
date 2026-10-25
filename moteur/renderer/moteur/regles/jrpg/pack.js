// Le pack JRPG classique (Saga 0.8) : un groupe de héros avec des classes, des PV et des PM, des
// compétences et de l'équipement, contre des groupes de monstres, au tour par tour. Ce fichier
// rassemble ses morceaux (heros.js, combat.js, hors-combat.js, fiches.js) dans l'objet que la façade
// `Regles` attend (voir regles.js et REGLES.md).

const Jrpg = (() => {
  const H = JrpgHeros;
  const pack = {
    nom: 'jrpg',
    ecran: 'groupe',
    capacites: { capture: false, relacher: false, ev: false, vendre: false, groupe: true },
    menus: {
      equipe: 'Groupe', dex: 'Bestiaire', dex_visible: true, pc: 'Réserve', boite: 'Réserve',
      places: 12, colonnes: 4, forme_boites: 'liste',
      pages: ['infos', 'stats', 'equipement', 'competences'],
      toutes_pages: [['infos', 'Infos'], ['stats', 'Statistiques'], ['equipement', 'Équipement'], ['competences', 'Compétences']],
      dex_pris: 'Vaincus', dex_pris_un: 'vaincu',
      dex_vide: 'Tu n\'as encore croisé aucun monstre. Ceux que tu rencontres en combat s\'inscrivent ici.',
    },
    existe: (jeu, id) => jeu.personnages.has(id),
    creer: (jeu, id, niveau) => H.creer(jeu, id, niveau),
    completer: (jeu, c) => H.completer(jeu, c),
    soigner: (jeu, c) => H.soigner(jeu, c),
    resume(jeu, c) {
      return {
        nom: H.nom(jeu, c), niveau: c.niveau, pv: c.pv, pvMax: H.pvMax(jeu, c), pm: c.pm, pmMax: H.pmMax(jeu, c),
        statut: H.COURTS[c.statut] || '', image: H.portrait(jeu, c), apparence: H.apparence(jeu, c),
      };
    },
    // Une zone de rencontres : un groupe de monstres tiré selon les chances (des poids).
    rencontre(jeu, zone) {
      const possibles = (zone.rencontres || []).filter((r) => H.trouver(jeu, 'groupes', r.groupe));
      const total = possibles.reduce((s, r) => s + Math.max(0, Number(r.chance) || 0), 0);
      if (!possibles.length || total <= 0) return null;
      let tirage = Math.random() * total;
      const r = possibles.find((q) => (tirage -= Math.max(0, Number(q.chance) || 0)) < 0) || possibles[0];
      return { groupe: r.groupe };
    },
    combattre: (o) => JrpgCombat.lancer(o),
    utilisable: (jeu, objet) => JrpgHorsCombat.utilisable(objet),
    utiliserObjet: (o) => JrpgHorsCombat.utiliserObjet(o),
    ecranEv: async ({ ui }) => { await ui.dire('(Ce jeu n\'a pas de points d\'effort : c\'est une commande des jeux Pokémon.)'); },
    prixCreature: () => 0,
    fiche: (jeu, c) => JrpgFiches.fiche(jeu, c),
    dex: (jeu) => ({ nom: 'Bestiaire', especes: JrpgFiches.especes(jeu) }),
    ficheEspece: (jeu, id, etat) => JrpgFiches.ficheEspece(jeu, id, etat),
    // Une partie neuve : le héros principal (s'il a une classe) est déjà dans le groupe.
    nouvellePartie(jeu, partie) {
      const h = jeu.heros;
      if (!h || !h.classe || partie.equipe.some((c) => c.creature === h.id)) return;
      const c = H.creer(jeu, h.id);
      if (c) partie.equipe.push(c);
    },
    actionsMembre: (jeu, c) => JrpgHorsCombat.actionsMembre(jeu, c),
    agirMembre: (o) => JrpgHorsCombat.agirMembre(o),
    // La commande groupe › rejoindre : un héros parti revient comme il était (partie.partis).
    rejoindre(jeu, partie, id, niveau) {
      const parti = partie.partis?.[id];
      if (parti) { delete partie.partis[id]; return H.completer(jeu, parti); }
      return H.creer(jeu, id, niveau);
    },
  };
  return { pack };
})();
