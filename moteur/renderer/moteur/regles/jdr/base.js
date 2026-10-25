// Le pack JDR (Saga 0.13) : les règles d'un jeu de rôle sur table façon D&D 5e (SRD 5.1), pour
// accompagner de vraies parties autour d'une table. Ce fichier pose les bases : les listes par défaut
// (caractéristiques, compétences, états), les tables de la 5e (bonus de maîtrise, XP, emplacements de
// sorts), et les petits calculs que tout le reste utilise. Voir REGLES.md › « Le pack JDR » et
// tuiles/FORMAT.md › « Le pack JDR ».
//
// Les données du jeu (donnees/) : caracteristiques, competences, origines, classes_jdr, sorts,
// monstres_jdr, groupes (les rencontres), etats, objets (avec leur partie `jdr` : arme ou armure),
// personnages (les pré-tirés : leur partie `jdr`) et reglages.jdr (les règles maison). Une liste vide
// garde celle de la 5e, pour qu'un jeu JDR tout neuf marche déjà.

const JdrBase = (() => {
  // --- Les listes par défaut (celles du SRD 5.1, en français) ---
  const CARACTERISTIQUES = [
    { id: 'for', nom: 'Force', court: 'FOR' },
    { id: 'dex', nom: 'Dextérité', court: 'DEX' },
    { id: 'con', nom: 'Constitution', court: 'CON' },
    { id: 'int', nom: 'Intelligence', court: 'INT' },
    { id: 'sag', nom: 'Sagesse', court: 'SAG' },
    { id: 'cha', nom: 'Charisme', court: 'CHA' },
  ];
  const COMPETENCES = [
    ['acrobaties', 'Acrobaties', 'dex'], ['arcanes', 'Arcanes', 'int'], ['athletisme', 'Athlétisme', 'for'],
    ['discretion', 'Discrétion', 'dex'], ['dressage', 'Dressage', 'sag'], ['escamotage', 'Escamotage', 'dex'],
    ['histoire', 'Histoire', 'int'], ['intimidation', 'Intimidation', 'cha'], ['intuition', 'Intuition', 'sag'],
    ['investigation', 'Investigation', 'int'], ['medecine', 'Médecine', 'sag'], ['nature', 'Nature', 'int'],
    ['perception', 'Perception', 'sag'], ['persuasion', 'Persuasion', 'cha'], ['religion', 'Religion', 'int'],
    ['representation', 'Représentation', 'cha'], ['survie', 'Survie', 'sag'], ['tromperie', 'Tromperie', 'cha'],
  ].map(([id, nom, carac]) => ({ id, nom, carac }));
  // Les effets d'un état, que le combat et les tests savent appliquer :
  //   incapable            ne peut ni agir ni réagir
  //   desavantage_attaques ses attaques ont un désavantage      avantage_attaques  les siennes un avantage
  //   avantage_contre      on l'attaque avec avantage            desavantage_contre avec désavantage
  //   desavantage_tests    désavantage à ses tests de caractéristique
  //   echec_for_dex        rate automatiquement ses sauvegardes de Force et de Dextérité
  //   critique_contact     tout coup qui le touche est critique
  //   desavantage_sauvegardes_dex  désavantage aux sauvegardes de Dextérité
  const EFFETS_ETAT = ['incapable', 'desavantage_attaques', 'avantage_attaques', 'avantage_contre', 'desavantage_contre', 'desavantage_tests', 'echec_for_dex', 'critique_contact', 'desavantage_sauvegardes_dex'];
  const ETATS = [
    ['a_terre', 'À terre', 'Désavantage à ses attaques ; on l\'attaque avec avantage.', ['desavantage_attaques', 'avantage_contre']],
    ['agrippe', 'Agrippé', 'Sa vitesse tombe à 0.', []],
    ['assourdi', 'Assourdi', 'N\'entend plus rien et rate les tests qui demandent l\'ouïe.', []],
    ['aveugle', 'Aveuglé', 'Désavantage à ses attaques ; on l\'attaque avec avantage.', ['desavantage_attaques', 'avantage_contre']],
    ['charme', 'Charmé', 'Ne peut pas attaquer celui qui l\'a charmé.', []],
    ['effraye', 'Effrayé', 'Désavantage à ses tests et à ses attaques tant qu\'il voit ce qui l\'effraie.', ['desavantage_attaques', 'desavantage_tests']],
    ['empoisonne', 'Empoisonné', 'Désavantage à ses attaques et à ses tests de caractéristique.', ['desavantage_attaques', 'desavantage_tests']],
    ['entrave', 'Entravé', 'Vitesse 0 ; désavantage à ses attaques et aux sauvegardes de Dextérité ; on l\'attaque avec avantage.', ['desavantage_attaques', 'avantage_contre', 'desavantage_sauvegardes_dex']],
    ['etourdi', 'Étourdi', 'Incapable d\'agir ; rate ses sauvegardes de Force et de Dextérité ; on l\'attaque avec avantage.', ['incapable', 'echec_for_dex', 'avantage_contre']],
    ['incapable', 'Neutralisé', 'Ne peut ni agir ni réagir.', ['incapable']],
    ['inconscient', 'Inconscient', 'Incapable d\'agir, à terre ; rate ses sauvegardes de Force et de Dextérité ; tout coup au contact est critique.', ['incapable', 'echec_for_dex', 'avantage_contre', 'critique_contact']],
    ['invisible', 'Invisible', 'Avantage à ses attaques ; on l\'attaque avec désavantage.', ['avantage_attaques', 'desavantage_contre']],
    ['paralyse', 'Paralysé', 'Incapable d\'agir ; rate ses sauvegardes de Force et de Dextérité ; tout coup au contact est critique.', ['incapable', 'echec_for_dex', 'avantage_contre', 'critique_contact']],
    ['petrifie', 'Pétrifié', 'Changé en pierre : incapable d\'agir, résiste à tous les dégâts.', ['incapable', 'echec_for_dex', 'avantage_contre']],
    ['epuisement', 'Épuisement', 'Désavantage à ses tests de caractéristique (premier niveau d\'épuisement).', ['desavantage_tests']],
  ].map(([id, nom, description, effets]) => ({ id, nom, description, effets }));
  const TYPES_DEGATS = [
    ['contondant', 'Contondant'], ['perforant', 'Perforant'], ['tranchant', 'Tranchant'], ['acide', 'Acide'], ['feu', 'Feu'],
    ['froid', 'Froid'], ['foudre', 'Foudre'], ['tonnerre', 'Tonnerre'], ['poison', 'Poison'], ['necrotique', 'Nécrotique'],
    ['radiant', 'Radiant'], ['force', 'Force'], ['psychique', 'Psychique'],
  ];
  const ECOLES = [['abjuration', 'Abjuration'], ['divination', 'Divination'], ['enchantement', 'Enchantement'], ['evocation', 'Évocation'], ['illusion', 'Illusion'], ['invocation', 'Invocation'], ['necromancie', 'Nécromancie'], ['transmutation', 'Transmutation']];

  // --- Les tables de la 5e ---
  // L'expérience totale pour être au niveau n (SRD 5.1).
  const XP = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  // L'XP d'un monstre selon son facteur de puissance (FP).
  const XP_FP = { 0: 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
  // Les emplacements de sorts par niveau de personnage : [niv. 1, 2, … 9].
  const EMPLACEMENTS_COMPLET = [
    [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
    [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
  ];
  // Demi-lanceurs (paladin, rôdeur) : comme un lanceur complet de la moitié de leur niveau, dès le niveau 2.
  const emplacementsDemi = (n) => (n < 2 ? [] : EMPLACEMENTS_COMPLET[Math.ceil(n / 2)]);
  // Occultiste : peu d'emplacements, tous du même niveau, rendus par un repos court.
  const PACTE = [[0, 0], [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5]];
  // Les tours de magie connus (lanceurs complets) : 2 ou 3 au niveau 1, un de plus aux niveaux 4 et 10
  // (aucun pour une classe qui n'en a pas au niveau 1 : paladin, rôdeur).
  const toursConnus = (base, n) => (base > 0 ? base + (n >= 4 ? 1 : 0) + (n >= 10 ? 1 : 0) : 0);
  // L'achat de points (27 points) : le coût de chaque valeur de 8 à 15.
  const COUT_POINTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  const TABLEAU_STANDARD = [15, 14, 13, 12, 10, 8];
  const NIVEAUX_AMELIORATION = [4, 8, 12, 16, 19];

  // --- Les petits calculs ---
  const borne = (v, min, max) => Math.max(min, Math.min(max, v));
  const mod = (valeur) => Math.floor((Number(valeur) - 10) / 2);
  const signe = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
  const maitrise = (niveau) => 2 + Math.floor((borne(Number(niveau) || 1, 1, 30) - 1) / 4);
  // « 1/4 » → 0,25 (pour trier) ; l'XP d'un FP.
  const valeurFp = (fp) => (typeof fp === 'string' && fp.includes('/') ? Number(fp.split('/')[0]) / Number(fp.split('/')[1]) : Number(fp) || 0);
  const xpFp = (fp) => XP_FP[String(fp)] ?? 0;

  // --- Les données du jeu (un index par jeu, comme le pack JRPG) ---
  const liste = (jeu, sorte) => jeu.donnees[sorte]?.[sorte] || [];
  const index = new WeakMap();
  function trouver(jeu, sorte, id) {
    if (!id) return null;
    let parJeu = index.get(jeu);
    if (!parJeu) { parJeu = {}; index.set(jeu, parJeu); }
    if (!parJeu[sorte]) parJeu[sorte] = new Map(listeOuDefaut(jeu, sorte).map((o) => [o.id, o]));
    return parJeu[sorte].get(id) || null;
  }
  // Les listes qui ont une valeur par défaut : celle du jeu si elle n'est pas vide, sinon celle de la 5e.
  function listeOuDefaut(jeu, sorte) {
    const l = liste(jeu, sorte);
    if (l.length) return l;
    return { caracteristiques: CARACTERISTIQUES, competences: COMPETENCES, etats: ETATS }[sorte] || l;
  }
  const caracteristiques = (jeu) => listeOuDefaut(jeu, 'caracteristiques');
  const competences = (jeu) => listeOuDefaut(jeu, 'competences');
  const etats = (jeu) => listeOuDefaut(jeu, 'etats');
  const nomCarac = (jeu, id) => trouver(jeu, 'caracteristiques', id)?.nom || id;
  const courtCarac = (jeu, id) => trouver(jeu, 'caracteristiques', id)?.court || String(id).toUpperCase().slice(0, 3);
  const nomCompetence = (jeu, id) => trouver(jeu, 'competences', id)?.nom || nomCarac(jeu, id);
  const nomEtat = (jeu, id) => trouver(jeu, 'etats', id)?.nom || id;
  const nomDegats = (id) => TYPES_DEGATS.find(([k]) => k === id)?.[1] || id || '';

  // Les règles maison (Tafl › Données › Réglages › Règles du JDR), avec leurs valeurs par défaut.
  const DEFAUTS_REGLES = {
    creation: { active: true, methodes: ['standard', 'points', 'des'], niveau_depart: 1, nombre: 1, pretires: true },
    pv_niveau: 'moyenne',     // 'moyenne' | 'jet' | 'choix' (le joueur choisit à chaque niveau)
    critiques: 'doubler',     // 'doubler' (les dés sont lancés deux fois) | 'max' (le maximum des dés + un jet)
    echec_critique: true,     // un 1 naturel rate toujours une attaque
    progression: 'xp',        // 'xp' | 'jalons' (pas d'XP de combat : la commande « Donner de l'XP › jalon »)
    repos: 'normal',          // 'normal' | 'heroique' | 'realiste' (seulement le texte dit au joueur, et le repos depuis le menu)
    repos_menu: true,         // les repos se prennent depuis le menu du jeu
    morts: 'jets',            // 'jets' (jets contre la mort) | 'ko' (simplement K.O. jusqu'à la fin du combat)
    potion_bonus: false,      // boire une potion est une action bonus
    tenaille: false,          // un ennemi déjà frappé au contact par un allié ce tour-ci : avantage
    unite: 'm',               // 'm' (mètres) | 'cases' | 'pieds'
    monnaie: 'po',            // 'po' (pièces d'or) | 'unique' (la monnaie du jeu, reglages.monnaie)
    mj_decide: false,         // le « MJ » peut forcer un jet (réussi, raté) en vraie partie
    animation_des: 'normale', // 'normale' | 'rapide' | 'aucune'
  };
  function regles(jeu) {
    const r = jeu.donnees.reglages?.reglages?.jdr || {};
    return { ...DEFAUTS_REGLES, ...r, creation: { ...DEFAUTS_REGLES.creation, ...(r.creation || {}) } };
  }
  const monnaie = (jeu) => (regles(jeu).monnaie === 'unique' ? jeu.donnees.reglages?.reglages?.monnaie || 'po' : 'po');
  // Une distance des données (en mètres) dite dans l'unité du jeu : 9 m, 6 cases, 30 pieds.
  function distance(jeu, metres) {
    const m = Number(metres) || 0;
    const u = regles(jeu).unite;
    if (u === 'cases') return `${Math.round(m / 1.5)} case${Math.round(m / 1.5) > 1 ? 's' : ''}`;
    if (u === 'pieds') return `${Math.round(m / 0.3)} pieds`;
    return `${String(m).replace('.', ',')} m`;
  }

  // Les « dés » d'un texte : « 2d6+3 » → { n: 2, faces: 6, bonus: 3 } (une seule sorte de dé, plus un bonus).
  function lireDes(texte) {
    const t = String(texte ?? '').replace(/\s+/g, '').toLowerCase().replace(/−/g, '-');
    const m = t.match(/^(\d*)d(\d+)([+-]\d+)?$/);
    if (m) return { n: m[1] === '' ? 1 : Number(m[1]), faces: Number(m[2]), bonus: Number(m[3] || 0) };
    if (/^[+-]?\d+$/.test(t)) return { n: 0, faces: 0, bonus: Number(t) };
    return null;
  }
  // La moyenne d'un jet (« 2d6+3 » → 10).
  function moyenne(texte) {
    const d = lireDes(texte);
    return d ? Math.floor(d.n * (d.faces + 1) / 2 + d.bonus) : 0;
  }

  return {
    CARACTERISTIQUES, COMPETENCES, ETATS, EFFETS_ETAT, TYPES_DEGATS, ECOLES, XP, XP_FP, EMPLACEMENTS_COMPLET, PACTE,
    COUT_POINTS, TABLEAU_STANDARD, NIVEAUX_AMELIORATION, DEFAUTS_REGLES,
    borne, mod, signe, maitrise, valeurFp, xpFp, emplacementsDemi, toursConnus,
    liste, trouver, listeOuDefaut, caracteristiques, competences, etats, nomCarac, courtCarac, nomCompetence, nomEtat, nomDegats,
    regles, monnaie, distance, lireDes, moyenne,
  };
})();

if (typeof module !== 'undefined') module.exports = JdrBase;
