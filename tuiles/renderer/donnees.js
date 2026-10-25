// Les bases de données du jeu (Tafl 0.8) : types, talents, attaques, créatures, objets, dresseurs,
// boutiques et réglages ; et, pour le pack JRPG (Tafl 0.25), classes, monstres et groupes de monstres. Elles vivent dans doc.data, à côté des personnages, quêtes et interrupteurs
// de Tafl 0.7, et suivent la même règle : on remplace doc.data en entier, jamais sur place.
//
// Chaque sorte a son fichier dans le dossier du jeu (donnees/creatures.json…), décrit dans
// ../FORMAT.md, « Données du jeu ». Les données officielles Pokémon s'importent à la demande
// (../officiel.js) ; chaque élément importé garde son nom anglais dans « officiel », pour être retrouvé
// quand on réimporte. Les éléments qu'on crée soi-même n'ont pas ce champ, et l'import n'y touche jamais.
//
// Ce module donne aussi les onglets de la fenêtre Jeu › Données du jeu (Events.editData) :
// chaque onglet dit comment créer, résumer et modifier un élément de sa sorte, et pour quels packs de
// règles il sert (packs : sinon tous). Les types et les attaques servent aux deux packs : le pack JRPG
// les appelle Éléments et Compétences.

const Donnees = (() => {
  // Tafl 0.32 : les sortes du pack JDR viennent de donnees-jdr.js (DonneesJdr), lu juste avant.
  const J = typeof DonneesJdr !== 'undefined' ? DonneesJdr : null;
  const SORTES = ['types', 'talents', 'attaques', 'creatures', 'objets', 'dresseurs', 'boutiques', 'classes', 'monstres', 'groupes', ...(J ? J.SORTES : []), 'reglages'];
  const STATS = [['pv', 'PV'], ['attaque', 'Attaque'], ['defense', 'Défense'], ['att_spe', 'Attaque Spé.'], ['def_spe', 'Défense Spé.'], ['vitesse', 'Vitesse']];
  const STATS_COMBAT = [...STATS.slice(1), ['precision', 'Précision'], ['esquive', 'Esquive']];
  // Les 25 natures officielles : [identifiant, nom, stat augmentée de 10 %, stat baissée de 10 %].
  const NATURES = [
    ['hardi', 'Hardi', '', ''], ['solo', 'Solo', 'attaque', 'defense'], ['brave', 'Brave', 'attaque', 'vitesse'], ['rigide', 'Rigide', 'attaque', 'att_spe'], ['mauvais', 'Mauvais', 'attaque', 'def_spe'],
    ['assure', 'Assuré', 'defense', 'attaque'], ['docile', 'Docile', '', ''], ['relax', 'Relax', 'defense', 'vitesse'], ['malin', 'Malin', 'defense', 'att_spe'], ['lache', 'Lâche', 'defense', 'def_spe'],
    ['timide', 'Timide', 'vitesse', 'attaque'], ['presse', 'Pressé', 'vitesse', 'defense'], ['serieux', 'Sérieux', '', ''], ['jovial', 'Jovial', 'vitesse', 'att_spe'], ['naif', 'Naïf', 'vitesse', 'def_spe'],
    ['modeste', 'Modeste', 'att_spe', 'attaque'], ['doux', 'Doux', 'att_spe', 'defense'], ['discret', 'Discret', 'att_spe', 'vitesse'], ['pudique', 'Pudique', '', ''], ['foufou', 'Foufou', 'att_spe', 'def_spe'],
    ['calme', 'Calme', 'def_spe', 'attaque'], ['gentil', 'Gentil', 'def_spe', 'defense'], ['malpoli', 'Malpoli', 'def_spe', 'vitesse'], ['prudent', 'Prudent', 'def_spe', 'att_spe'], ['bizarre', 'Bizarre', '', ''],
  ];
  const CATEGORIES_ATTAQUE = [['physique', 'Physique'], ['speciale', 'Spéciale'], ['statut', 'Statut']];
  const CIBLES = [['adversaire', 'Un adversaire'], ['adversaires', 'Tous les adversaires'], ['soi', 'Le lanceur'], ['allie', 'Un allié'], ['equipe', 'Le lanceur et ses alliés'], ['tous', 'Tout le monde sauf le lanceur'], ['terrain', 'Le terrain (météo, champ…)']];
  const STATUTS = [['', 'Aucun'], ['brulure', 'Brûlure'], ['paralysie', 'Paralysie'], ['poison', 'Poison'], ['poison_grave', 'Poison grave'], ['sommeil', 'Sommeil'], ['gel', 'Gel'], ['confusion', 'Confusion'], ['attraction', 'Attraction'], ['piege', 'Piégé'], ['baillement', 'Bâillement'], ['vampigraine', 'Vampigraine']];
  const CROISSANCES = [['rapide', 'Rapide (800 000 XP au niveau 100)'], ['moyenne', 'Moyenne (1 000 000)'], ['parabolique', 'Parabolique (1 059 860)'], ['lente', 'Lente (1 250 000)'], ['erratique', 'Erratique (600 000)'], ['fluctuante', 'Fluctuante (1 640 000)']];
  const RARETES = [['', 'Normale'], ['legendaire', 'Légendaire'], ['fabuleux', 'Fabuleuse']];
  const MODES_EVOLUTION = [['niveau', 'Au niveau'], ['objet', 'Avec un objet'], ['echange', 'Par échange'], ['amitie', 'Par amitié'], ['quete', 'Quand une quête est finie'], ['autre', 'Autre (condition écrite)']];
  const CATEGORIES_OBJET = [['soin', 'Soin'], ['balle', 'Balle'], ['vitamine', 'Vitamine, Super Bonbon'], ['menthe', 'Menthe (nature)'], ['ivs', 'Capsule (IV)'], ['baie', 'Baie'], ['tenu', 'Objet tenu'], ['combat', 'Combat'], ['evolution', 'Évolution'], ['tresor', 'Trésor (à revendre)'], ['cle', 'Objet clé'], ['arme', 'Arme'], ['bouclier', 'Bouclier'], ['casque', 'Casque'], ['armure', 'Armure'], ['accessoire', 'Accessoire'], ['autre', 'Autre']];
  // Ce que fait un objet, et les champs qui comptent pour chaque effet.
  const EFFETS_OBJET = [
    ['aucun', 'Rien (seulement sa description)', []],
    ['soin', 'Soigne des PV', ['valeur', 'statut']],
    ['soin_statut', 'Soigne un statut', ['statut']],
    ['rappel', 'Ranime une créature K.O.', ['valeur']],
    ['pp', 'Rend des PP à une attaque', ['valeur']],
    ['pp_toutes', 'Rend des PP à toutes les attaques', ['valeur']],
    ['pp_max', 'Augmente les PP max', ['valeur']],
    ['ev', 'Donne des EV', ['stat', 'valeur']],
    ['niveau', 'Fait monter de niveau', ['valeur']],
    ['ivs', 'Met des IV au maximum (capsule)', ['stat', 'valeur']],
    ['menthe', 'Change l\'effet de la nature (menthe)', ['nature']],
    ['balle', 'Capture une créature', ['valeur']],
    ['evolution', 'Fait évoluer (voir les évolutions des créatures)', []],
    ['repousse', 'Repousse les créatures sauvages', ['valeur']],
    ['soin_pm', 'Rend des PM (pack JRPG)', ['valeur']],
    ['passage', 'Ouvre un passage (à la place des CS)', []],
    ['stase', 'Empêche d\'évoluer, tenu (Pierre Stase)', []],
    ['amitie', 'Fait monter l\'amitié', ['valeur']],
  ];
  const UNITES_EFFET = { soin_pm: 'PM (9999 = tous)', soin: 'PV (9999 = tous)', rappel: '% des PV', pp: 'PP (99 = tous)', pp_toutes: 'PP (99 = tous)', pp_max: 'paliers (1 à 3)', ev: 'EV', niveau: 'niveaux', ivs: 'valeur des IV (31 = parfait)', balle: '× la chance de capture (255 = toujours)', repousse: 'pas', amitie: 'points d\'amitié (sur 255)' };
  const AJUSTEMENTS = [['aucun', 'Jamais : chaque dresseur garde ses niveaux'], ['equipe', 'Sur l\'équipe du joueur (son meilleur niveau)'], ['badges', 'Sur le niveau maximum des badges du joueur']];
  // Tafl 0.24 (Saga 0.7) : les créatures sauvages peuvent suivre aussi.
  const AJUSTEMENTS_SAUVAGES = [['aucun', 'Jamais : les niveaux écrits dans chaque zone'], ['equipe', 'Sur l\'équipe du joueur (son meilleur niveau)'], ['badges', 'Sur le niveau maximum des badges du joueur']];
  const COULEUR_TYPE = '#8a8f98';

  // --- Le pack JRPG classique (Tafl 0.25, Saga 0.8 : moteur/renderer/moteur/regles/jrpg/) ---
  const STATS_JRPG = [['pv', 'PV'], ['pm', 'PM'], ['force', 'Force'], ['magie', 'Magie'], ['defense', 'Défense'], ['esprit', 'Esprit'], ['agilite', 'Agilité'], ['chance', 'Chance']];
  // Ce qu'une compétence peut monter ou baisser en combat (±4 crans au plus).
  const ETAGES_JRPG = STATS_JRPG.filter(([k]) => ['force', 'magie', 'defense', 'esprit', 'agilite'].includes(k));
  const STATUTS_JRPG = [['', 'Aucun'], ['poison', 'Poison (reste après le combat)'], ['sommeil', 'Sommeil'], ['paralysie', 'Paralysie'], ['silence', 'Silence (plus de magie)'], ['cecite', 'Cécité (rate ses coups)']];
  const CATEGORIES_JRPG = [['physique', 'Physique (Force contre Défense)'], ['speciale', 'Magie (Magie contre Esprit)'], ['statut', 'Soutien (sans dégâts)']];
  const CIBLES_JRPG = CIBLES.filter(([k]) => k !== 'terrain');
  const PLACES = [['arme', 'Arme'], ['bouclier', 'Bouclier'], ['casque', 'Casque'], ['armure', 'Armure'], ['accessoire', 'Accessoire']];
  const COURBES_XP = [['rapide', 'Rapide (×0,7)'], ['normale', 'Normale (10 × (niveau − 1)²)'], ['lente', 'Lente (×1,4)']];
  const TAILLES = [['petit', 'Petit'], ['moyen', 'Moyen'], ['grand', 'Grand']];
  // Une classe ou un monstre sans statistique écrite : ce que Saga prend (heros.js › DEFAUTS, GAINS).
  const STATS_CLASSE = { pv: 30, pm: 6, force: 9, magie: 7, defense: 7, esprit: 7, agilite: 8, chance: 6 };
  const GAINS_CLASSE = { pv: 8, pm: 2, force: 2, magie: 2, defense: 1.5, esprit: 1.5, agilite: 1.5, chance: 1 };
  const STATS_MONSTRE = { pv: 20, pm: 0, force: 7, magie: 5, defense: 5, esprit: 4, agilite: 6, chance: 3 };
  // Le pack de règles d'un jeu (ses données, ou le doc entier).
  const packDe = (data) => (data?.data || data)?.reglages?.regles || 'pokemon';

  const str = (v, d = '') => (v === undefined || v === null ? d : String(v));
  const num = (v, d = 0, min = -Infinity, max = Infinity) => {
    const n = Number(v);
    return Number.isFinite(n) && v !== '' && v !== null ? clamp(n, min, max) : d;
  };
  const int = (v, d = 0, min = -Infinity, max = Infinity) => Math.round(num(v, d, min, max));
  const pick = (v, list, d) => (list.some(([k]) => k === v) ? v : d);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const ids = (v) => [...new Set(arr(v).map((x) => Doc.slug(x, '')).filter(Boolean))];
  const image = (v) => (/^data:image\/(png|gif|webp|jpeg|bmp);base64,/.test(v) ? v : '');
  const statsDe = (o, d = 0, max = 255) => Object.fromEntries(STATS.map(([k]) => [k, int(o?.[k], d, 0, max)]));
  const officiel = (o) => (o?.officiel ? { officiel: str(o.officiel) } : {});

  // --- Normaliser (fichiers, Claude, import) ---
  const NORMES = {
    types: (t, i) => ({ id: Doc.slug(t?.id || t?.nom, `type-${i + 1}`), nom: str(t?.nom || t?.id, `Type ${i + 1}`), couleur: normalizeHex(t?.couleur) || '', efficace: ids(t?.efficace), peu_efficace: ids(t?.peu_efficace), sans_effet: ids(t?.sans_effet), ...officiel(t) }),
    talents: (t, i) => ({ id: Doc.slug(t?.id || t?.nom, `talent-${i + 1}`), nom: str(t?.nom || t?.id, `Talent ${i + 1}`), description: str(t?.description), ...officiel(t) }),
    attaques: (a, i) => ({
      id: Doc.slug(a?.id || a?.nom, `attaque-${i + 1}`),
      nom: str(a?.nom || a?.id, `Attaque ${i + 1}`),
      type: Doc.slug(a?.type, ''),
      categorie: pick(a?.categorie, CATEGORIES_ATTAQUE, 'physique'),
      puissance: int(a?.puissance, 0, 0, 999),
      precision: int(a?.precision, 100, 0, 100),
      pp: int(a?.pp, 10, 1, 99),
      priorite: int(a?.priorite, 0, -7, 7),
      cible: pick(a?.cible, CIBLES, 'adversaire'),
      statut: pick(str(a?.statut), [...STATUTS, ...STATUTS_JRPG], ''),
      chance_statut: int(a?.chance_statut, 0, 0, 100),
      peur: int(a?.peur, 0, 0, 100),
      stats: arr(a?.stats).filter((s) => [...STATS_COMBAT, ...ETAGES_JRPG].some(([k]) => k === s?.stat)).map((s) => ({ stat: s.stat, etages: int(s.etages, 1, -6, 6) })),
      stats_cible: a?.stats_cible === 'soi' ? 'soi' : 'adversaire',
      chance_stats: int(a?.chance_stats, 0, 0, 100),
      drain: int(a?.drain, 0, -100, 100),
      soin: int(a?.soin, 0, -100, 999), // Pokémon : % des PV du lanceur ; JRPG : la puissance du soin (+ Magie)
      critique: int(a?.critique, 0, 0, 6),
      coups_min: int(a?.coups_min, 1, 1, 10),
      coups_max: Math.max(int(a?.coups_min, 1, 1, 10), int(a?.coups_max, 1, 1, 10)),
      effet: str(a?.effet),
      description: str(a?.description),
      // Pack JRPG : son coût en PM, ranimer un allié K.O., les statuts qu'elle guérit ('tous' : tous).
      cout_pm: int(a?.cout_pm, 0, 0, 999),
      ranime: Boolean(a?.ranime),
      guerit: [...new Set(arr(a?.guerit).map((x) => str(x)).filter((x) => x === 'tous' || STATUTS_JRPG.some(([k]) => k && k === x)))],
      ...officiel(a),
    }),
    creatures: (c, i) => ({
      id: Doc.slug(c?.id || c?.nom, `creature-${i + 1}`),
      nom: str(c?.nom || c?.id, `Créature ${i + 1}`),
      numero: int(c?.numero, i + 1, 0, 99999),
      espece: str(c?.espece),
      types: ids(c?.types).slice(0, 2),
      stats: statsDe(c?.stats, 50),
      ev_donnes: Object.fromEntries(STATS.map(([k]) => [k, int(c?.ev_donnes?.[k], 0, 0, 3)]).filter(([, v]) => v)),
      talents: ids(c?.talents).slice(0, 2),
      talent_cache: Doc.slug(c?.talent_cache, ''),
      taux_capture: int(c?.taux_capture, 45, 1, 255),
      xp_base: int(c?.xp_base, 64, 0, 999),
      croissance: pick(c?.croissance, CROISSANCES, 'moyenne'),
      bonheur: int(c?.bonheur, 70, 0, 255),
      male: num(c?.male, 50, -1, 100),
      legendaire: pick(str(c?.legendaire), RARETES, ''),
      taille: num(c?.taille, 0, 0, 999),
      poids: num(c?.poids, 0, 0, 9999),
      evolutions: arr(c?.evolutions).filter((e) => e?.vers).map((e) => ({ vers: Doc.slug(e.vers, ''), mode: pick(e.mode, MODES_EVOLUTION, 'niveau'), niveau: int(e.niveau, 0, 0, 100), objet: Doc.slug(e.objet, ''), quete: Doc.slug(e.quete, ''), condition: str(e.condition) })),
      attaques: arr(c?.attaques).filter((a) => a?.attaque).map((a) => ({ niveau: int(a.niveau, 1, 0, 100), attaque: Doc.slug(a.attaque, '') })).sort((a, b) => a.niveau - b.niveau),
      ct: ids(c?.ct),
      description: str(c?.description),
      sprites: { face: image(c?.sprites?.face), dos: image(c?.sprites?.dos) },
      generation: int(c?.generation, 0, 0, 99),
      ...officiel(c),
    }),
    objets: (o, i) => {
      const effet = o?.effet || {};
      return {
        id: Doc.slug(o?.id || o?.nom, `objet-${i + 1}`),
        nom: str(o?.nom || o?.id, `Objet ${i + 1}`),
        categorie: pick(o?.categorie, CATEGORIES_OBJET, 'autre'),
        prix: int(o?.prix, 0, 0, 9999999),
        description: str(o?.description),
        effet: {
          type: pick(effet.type, EFFETS_OBJET, 'aucun'),
          ...(effet.valeur !== undefined ? { valeur: num(effet.valeur, 0, 0, 99999) } : {}),
          ...(effet.stat ? { stat: str(effet.stat) } : {}),
          ...(effet.statut ? { statut: str(effet.statut) } : {}),
          ...(effet.nature ? { nature: pick(effet.nature, NATURES, 'hardi') } : {}),
          ...(J?.des(effet.des) ? { des: J.des(effet.des) } : {}), // pack JDR : une potion soigne aux dés (2d4+2)
        },
        icone: image(o?.icone),
        // Pack JRPG : un objet qu'un héros porte (arme, armure…), ses bonus et les classes qui le peuvent.
        ...(o?.equipement && PLACES.some(([k]) => k === o.equipement.place) ? { equipement: {
          place: o.equipement.place,
          bonus: Object.fromEntries(STATS_JRPG.map(([k]) => [k, int(o.equipement.bonus?.[k], 0, -999, 999)]).filter(([, v]) => v)),
          element: Doc.slug(o.equipement.element, ''),
          classes: ids(o.equipement.classes),
        } } : {}),
        // Pack JDR (Tafl 0.32) : une arme ou une armure (voir donnees-jdr.js).
        ...(J?.normObjet(o?.jdr) ? { jdr: J.normObjet(o.jdr) } : {}),
        ...officiel(o),
      };
    },
    dresseurs: (d, i) => ({
      id: Doc.slug(d?.id || d?.nom, `dresseur-${i + 1}`),
      nom: str(d?.nom || d?.id, `Dresseur ${i + 1}`),
      classe: str(d?.classe),
      personnage: Doc.slug(d?.personnage, ''),
      equipe: arr(d?.equipe).filter((m) => m?.creature).slice(0, 6).map((m) => ({
        creature: Doc.slug(m.creature, ''), niveau: int(m.niveau, 5, 1, 100), nature: m.nature ? pick(m.nature, NATURES, '') : '', objet: Doc.slug(m.objet, ''), attaques: ids(m.attaques).slice(0, 4),
      })),
      argent: int(d?.argent, 0, 0, 9999999),
      ajuste: d?.ajuste !== false,
      dialogue_avant: str(d?.dialogue_avant),
      dialogue_victoire: str(d?.dialogue_victoire),
      dialogue_defaite: str(d?.dialogue_defaite),
    }),
    boutiques: (b, i) => ({
      id: Doc.slug(b?.id || b?.nom, `boutique-${i + 1}`),
      nom: str(b?.nom || b?.id, `Boutique ${i + 1}`),
      description: str(b?.description),
      rachete: b?.rachete !== false,
      achete_creatures: Boolean(b?.achete_creatures),
      articles: arr(b?.articles).filter((a) => a?.id).map((a) => ({
        sorte: a.sorte === 'creature' ? 'creature' : 'objet',
        id: Doc.slug(a.id, ''),
        ...(a.sorte === 'creature' ? { niveau: int(a.niveau, 5, 1, 100) } : {}),
        prix: int(a.prix, 0, 0, 9999999),
        condition: a.condition && typeof a.condition === 'object' ? Events.normCondition(a.condition) : null,
        verrouille_visible: Boolean(a.verrouille_visible),
      })),
    }),
    // --- Pack JRPG ---
    // Une classe : ses statistiques au niveau 1, ce qu'elle gagne à chaque niveau, ses compétences.
    classes: (k, i) => ({
      id: Doc.slug(k?.id || k?.nom, `classe-${i + 1}`),
      nom: str(k?.nom || k?.id, `Classe ${i + 1}`),
      description: str(k?.description),
      couleur: normalizeHex(k?.couleur) || '',
      stats: Object.fromEntries(STATS_JRPG.map(([s]) => [s, int(k?.stats?.[s], STATS_CLASSE[s], 0, 9999)])),
      gains: Object.fromEntries(STATS_JRPG.map(([s]) => [s, num(k?.gains?.[s], GAINS_CLASSE[s], 0, 999)])),
      competences: arr(k?.competences).filter((c) => c?.competence).map((c) => ({ niveau: int(c.niveau, 1, 1, 999), competence: Doc.slug(c.competence, '') })).sort((a, b) => a.niveau - b.niveau),
    }),
    monstres: (m, i) => ({
      id: Doc.slug(m?.id || m?.nom, `monstre-${i + 1}`),
      nom: str(m?.nom || m?.id, `Monstre ${i + 1}`),
      numero: int(m?.numero, i + 1, 0, 99999),
      description: str(m?.description),
      image: image(m?.image),
      taille: pick(m?.taille, TAILLES, 'moyen'),
      boss: Boolean(m?.boss),
      niveau: int(m?.niveau, 1, 1, 999),
      stats: Object.fromEntries(STATS_JRPG.map(([s]) => [s, int(m?.stats?.[s], STATS_MONSTRE[s], 0, 99999)])),
      faiblesses: ids(m?.faiblesses),
      resistances: ids(m?.resistances),
      immunites: ids(m?.immunites),
      statuts_immunises: [...new Set(arr(m?.statuts_immunises).map((x) => str(x)).filter((x) => STATUTS_JRPG.some(([k]) => k && k === x)))],
      // Ce qu'il fait à son tour : l'attaque de base (poids_attaque) ou une compétence, au hasard selon les poids.
      poids_attaque: int(m?.poids_attaque, 50, 0, 100),
      competences: arr(m?.competences).filter((c) => c?.competence).map((c) => ({ competence: Doc.slug(c.competence, ''), poids: int(c.poids, 25, 0, 100) })),
      xp: int(m?.xp, 5, 0, 9999999),
      or: int(m?.or, 3, 0, 9999999),
      butin: arr(m?.butin).filter((b) => b?.objet).map((b) => ({ objet: Doc.slug(b.objet, ''), chance: int(b.chance, 10, 1, 100) })),
    }),
    // Un groupe de monstres : ce qu'on affronte ensemble (8 monstres au plus).
    groupes: (g, i) => ({
      id: Doc.slug(g?.id || g?.nom, `groupe-${i + 1}`),
      nom: str(g?.nom || g?.id, `Groupe ${i + 1}`),
      monstres: arr(g?.monstres).filter((x) => x?.monstre).slice(0, 8).map((x) => ({ monstre: Doc.slug(x.monstre, ''), nombre: int(x.nombre, 1, 1, 8) })),
      fuite: g?.fuite !== false,
    }),
    ...(J ? J.NORMES : {}),
  };
  const reglagesVides = () => ({
    monnaie: 'Pokédollars', argent_depart: 3000, equipe_max: 6,
    plafonds: [{ badges: 0, niveau: 15 }, { badges: 1, niveau: 20 }, { badges: 2, niveau: 25 }, { badges: 3, niveau: 30 }, { badges: 4, niveau: 35 }, { badges: 5, niveau: 40 }, { badges: 6, niveau: 45 }, { badges: 7, niveau: 50 }, { badges: 8, niveau: 100 }],
    ajustement: 'badges', ecart: 0, ajustement_sauvages: 'aucun', ecart_sauvages: -2, evolution_dresseurs: false, evolution_sauvages: false, seuil_amitie: 220, chance_chromatique: 4096,
    interface: { theme: 'verre', accent: '', menus: menusVides() },
    regles: 'pokemon', badges: [],
    niveau_max: 99, courbe_xp: 'normale',
    temps: tempsVide(), audio: audioVide(), sauvegarde_auto: { active: false, carte: true, minutes: 5 },
    scripts: { formules_coupees: [] }, // Tafl 0.31 : les règles maison des scripts JS coupées (Saga 0.12)
    ...(J ? { jdr: J.normRegles({}) } : {}), // Tafl 0.32 : les règles maison du pack JDR
  });
  // Tafl 0.29 (Saga 0.11) : l'horloge du jeu, la musique des combats et les bruitages, la sauvegarde auto.
  const HORLOGES = [['aucune', 'Aucune : il fait toujours jour'], ['jeu', 'Horloge du jeu (elle avance quand on joue)'], ['reelle', 'Heure réelle du PC (comme Pokémon Or et Argent)']];
  const SONS_INTEGRES = [['curseur', 'Curseur (changer de choix)'], ['valider', 'Valider'], ['retour', 'Retour, annuler'], ['texte', 'Texte qui s\'écrit'], ['porte', 'Porte, téléporteur'], ['sauvegarde', 'Partie sauvegardée'], ['choc', 'Se cogner à un mur']];
  function tempsVide() { return { horloge: 'aucune', duree_jour: 24, heure_depart: 8 }; }
  function audioVide() { return { musique_combat: '', musique_dresseur: '', musique_victoire: '', sons: Object.fromEntries(SONS_INTEGRES.map(([k]) => [k, ''])) }; }
  // Un son du dossier sons/ du jeu, ou un des mots permis ; sinon ''.
  const son = (v, mots = []) => {
    const t = str(v).replace(/\\/g, '/');
    if (mots.includes(t)) return t;
    return /^sons\/[^/]+$/.test(t) && !t.includes('..') ? t : '';
  };
  function normTemps(t) {
    return { horloge: pick(t?.horloge, HORLOGES, 'aucune'), duree_jour: int(t?.duree_jour, 24, 1, 1440), heure_depart: int(t?.heure_depart, 8, 0, 23) };
  }
  function normAudio(a) {
    return {
      musique_combat: son(a?.musique_combat), musique_dresseur: son(a?.musique_dresseur), musique_victoire: son(a?.musique_victoire),
      sons: Object.fromEntries(SONS_INTEGRES.map(([k]) => [k, son(a?.sons?.[k], ['aucun'])])),
    };
  }
  // Le pack de règles du jeu (Tafl 0.16) : ce qui décide des combats, des captures, des statistiques.
  // Saga choisit regles/<nom>/ d'après lui (voir moteur/renderer/moteur/regles/REGLES.md).
  const REGLES = [
    ['pokemon', 'Pokémon : types, créatures, captures, natures, EV et IV, badges'],
    ['jrpg', 'JRPG classique : un groupe de héros (classes, PV, PM, équipement) contre des groupes de monstres'],
    ['jdr', 'JDR (D&D 5e et règles maison) : création de personnages, tests au d20, sorts, combats à l\'initiative'],
  ];
  // La monnaie par défaut de chaque pack (Tafl 0.32.1) : elle suit le pack tant qu'on ne l'a pas renommée.
  const MONNAIES_PACK = { pokemon: 'Pokédollars', jrpg: 'Or', jdr: 'po' };
  // La forme des menus que chaque pack donne par défaut dans Saga 0.6 (regles.js › menus) : Tafl la
  // montre en gris ; ce que le jeu règle dans Interface › Menus passe par-dessus (vide = celle du pack).
  const FORMES_MENUS = {
    pokemon: {
      equipe: 'Équipe', dex: 'Pokédex', pc: 'PC', boite: 'Boîte', places: 30, colonnes: 6, forme_boites: 'grille',
      pages: [['infos', 'Infos'], ['stats', 'Statistiques'], ['attaques', 'Attaques']],
    },
    jrpg: {
      equipe: 'Groupe', dex: 'Bestiaire', pc: 'Réserve', boite: 'Réserve', places: 12, colonnes: 4, forme_boites: 'liste',
      pages: [['infos', 'Infos'], ['stats', 'Statistiques'], ['equipement', 'Équipement'], ['competences', 'Compétences']],
    },
    jdr: {
      equipe: 'Groupe', dex: 'Bestiaire', pc: 'Réserve', boite: 'Réserve', places: 12, colonnes: 4, forme_boites: 'liste',
      pages: [['infos', 'Infos'], ['caracteristiques', 'Caractéristiques'], ['competences', 'Compétences'], ['combat', 'Combat'], ['sorts', 'Sorts'], ['inventaire', 'Inventaire'], ['traits', 'Aptitudes et traits']],
    },
  };
  const FORMES_BOITES = [['', 'Celle du pack de règles'], ['grille', 'Grille (des cases, comme les PC Pokémon)'], ['liste', 'Liste (une ligne par créature, avec son nom)']];
  function menusVides() { return { equipe: '', dex: '', pc: '', boite: '', dex_visible: true, places: 0, colonnes: 0, forme_boites: '', pages: [] }; }
  function normMenus(m) {
    const d = menusVides();
    if (!m || typeof m !== 'object') return d;
    const court = (v) => str(v).trim().slice(0, 20);
    return {
      equipe: court(m.equipe), dex: court(m.dex), pc: court(m.pc), boite: court(m.boite),
      dex_visible: m.dex_visible !== false,
      places: int(m.places, 0, 0, 120), colonnes: int(m.colonnes, 0, 0, 12),
      forme_boites: pick(m.forme_boites, FORMES_BOITES, ''),
      pages: [...new Set(arr(m.pages).map((x) => str(x)).filter((x) => /^[a-z0-9_-]+$/.test(x)))],
    };
  }
  // L'interface en jeu (Tafl 0.15, lue par Saga 0.4) : le thème des dialogues, du combat et des menus.
  const THEMES = [['verre', 'Verre : sombre et flou, coins arrondis'], ['pixel', 'Pixel : police pixel, cadres nets, rétro']];
  function normReglages(r) {
    const d = reglagesVides();
    if (!r || typeof r !== 'object') return d;
    const regles = typeof r.regles === 'string' && /^[a-z0-9-]+$/.test(r.regles) ? r.regles : 'pokemon';
    // Tafl 0.32.1 : une seule monnaie. Un jeu JRPG ou JDR resté sur « Pokédollars » prend celle de son pack ;
    // le JDR n'a plus son choix « pièces d'or ou monnaie du jeu » (jdr.monnaie vaut toujours « unique »).
    let monnaie = str(r.monnaie, d.monnaie) || d.monnaie;
    if (regles !== 'pokemon' && monnaie === MONNAIES_PACK.pokemon) monnaie = MONNAIES_PACK[regles] || monnaie;
    return {
      monnaie,
      argent_depart: int(r.argent_depart, d.argent_depart, 0, 9999999),
      equipe_max: int(r.equipe_max, 6, 1, 12),
      plafonds: Array.isArray(r.plafonds) ? r.plafonds.map((p) => ({ badges: int(p?.badges, 0, 0, 99), niveau: int(p?.niveau, 100, 1, 100) })).sort((a, b) => a.badges - b.badges) : d.plafonds,
      ajustement: pick(r.ajustement, AJUSTEMENTS, d.ajustement),
      ecart: int(r.ecart, 0, -20, 20),
      ajustement_sauvages: pick(r.ajustement_sauvages, AJUSTEMENTS_SAUVAGES, d.ajustement_sauvages),
      ecart_sauvages: int(r.ecart_sauvages, d.ecart_sauvages, -20, 20),
      evolution_dresseurs: Boolean(r.evolution_dresseurs),
      evolution_sauvages: Boolean(r.evolution_sauvages),
      seuil_amitie: int(r.seuil_amitie, 220, 1, 255),
      chance_chromatique: int(r.chance_chromatique, 4096, 0, 100000),
      interface: {
        theme: pick(r.interface?.theme, THEMES, 'verre'),
        accent: /^#[0-9a-f]{6}$/i.test(r.interface?.accent || '') ? r.interface.accent.toLowerCase() : '',
        menus: normMenus(r.interface?.menus),
      },
      // Un pack inconnu (écrit à la main, ou par un Tafl plus récent) est gardé tel quel.
      regles,
      niveau_max: int(r.niveau_max, 99, 1, 999),
      courbe_xp: pick(r.courbe_xp, COURBES_XP, 'normale'),
      temps: normTemps(r.temps),
      audio: normAudio(r.audio),
      sauvegarde_auto: { active: Boolean(r.sauvegarde_auto?.active), carte: r.sauvegarde_auto?.carte !== false, minutes: int(r.sauvegarde_auto?.minutes, 5, 0, 120) },
      ...(J ? { jdr: { ...J.normRegles(r.jdr), monnaie: 'unique' } } : {}),
      scripts: { formules_coupees: [...new Set(arr(r.scripts?.formules_coupees).map((x) => str(x)).filter((x) => /^[a-z0-9_][a-z0-9_-]{0,59}$/.test(x)))] },
      badges: (() => {
        const out = [];
        arr(r.badges).filter((b) => b && typeof b === 'object').forEach((b, i) => {
          const n = { id: Doc.slug(b.id || b.nom, `badge-${i + 1}`), nom: str(b.nom || b.id, `Badge ${i + 1}`), icone: /^data:image\/(png|gif|webp);base64,/.test(b.icone || '') ? b.icone : '' };
          n.id = Events.ident(n.id, out, n.id);
          out.push(n);
        });
        return out;
      })(),
    };
  }
  const vides = () => ({ types: [], talents: [], attaques: [], creatures: [], objets: [], dresseurs: [], boutiques: [], classes: [], monstres: [], groupes: [], ...Object.fromEntries((J ? J.SORTES : []).map((k) => [k, []])), reglages: reglagesVides() });
  // Normalise toutes les sortes de Tafl 0.8 (les identifiants deviennent uniques dans leur sorte).
  function normer(d) {
    const out = {};
    for (const k of SORTES) {
      if (k === 'reglages') { out.reglages = normReglages(d?.reglages); continue; }
      const liste = [];
      arr(d?.[k]).forEach((o, i) => { const n = NORMES[k](o, i); n.id = Events.ident(n.id, liste, n.id); liste.push(n); });
      out[k] = liste;
    }
    return out;
  }
  const normElement = (sorte, o, i = 0) => (sorte === 'reglages' ? normReglages(o) : NORMES[sorte](o, i));

  // --- Retrouver ---
  const trouver = (doc, sorte, id) => (doc.data[sorte] || []).find((o) => o.id === id) || null;
  const nomDe = (doc, sorte, id) => trouver(doc, sorte, id)?.nom || id;
  // Multiplicateur d'un type d'attaque contre un type de défenseur (1, 2, 0.5 ou 0).
  function efficacite(type, defenseur) {
    if (!type) return 1;
    if (type.sans_effet.includes(defenseur)) return 0;
    if (type.efficace.includes(defenseur)) return 2;
    if (type.peu_efficace.includes(defenseur)) return 0.5;
    return 1;
  }
  const nature = (id) => NATURES.find(([k]) => k === id) || null;
  const libelleStat = (k) => STATS_COMBAT.find(([x]) => x === k)?.[1] || k;

  // Où une donnée de Tafl 0.8 est utilisée : [« Bourg › Infirmière », « Créature Salamèche (évolution) »…].
  function utilisations(doc, sorte, id) {
    const out = new Set();
    const d = doc.data;
    Events.parcourirJeu(doc, ({ commande, condition, ev, map, page }) => {
      const c = commande || condition;
      const ici = `${map.name} › ${ev.nom || ev.id}${ev.pages.length > 1 ? ` (page ${page + 1})` : ''}`;
      if (sorte === 'creature' && (c.type === 'creature' || c.type === 'combat_sauvage') && c.creature === id) out.add(ici);
      if (sorte === 'objet' && c.type === 'objet' && c.objet === id) out.add(ici);
      if (sorte === 'dresseur' && c.type === 'combat_dresseur' && c.dresseur === id) out.add(ici);
      if (sorte === 'boutique' && c.type === 'boutique' && c.boutique === id) out.add(ici);
      if (sorte === 'groupe' && c.type === 'combat_groupe' && c.groupe === id) out.add(ici);
    });
    for (const m of doc.maps) {
      for (const z of m.zones) {
        if (sorte === 'objet' && z.objet === id) out.add(`${m.name} › zone ${z.name || z.id} (objet requis)`);
        if (sorte === 'creature' && (z.rencontres || []).some((r) => r.creature === id)) out.add(`${m.name} › zone ${z.name || z.id} (rencontres)`);
        if (sorte === 'groupe' && (z.rencontres || []).some((r) => r.groupe === id)) out.add(`${m.name} › zone ${z.name || z.id} (rencontres)`);
      }
    }
    for (const c of d.creatures) {
      if (sorte === 'type' && c.types.includes(id)) out.add(`Créature ${c.nom}`);
      if (sorte === 'talent' && (c.talents.includes(id) || c.talent_cache === id)) out.add(`Créature ${c.nom}`);
      if (sorte === 'attaque' && (c.attaques.some((a) => a.attaque === id) || c.ct.includes(id))) out.add(`Créature ${c.nom}`);
      if (sorte === 'creature' && c.evolutions.some((e) => e.vers === id)) out.add(`Créature ${c.nom} (évolution)`);
      if (sorte === 'objet' && c.evolutions.some((e) => e.objet === id)) out.add(`Créature ${c.nom} (évolution)`);
    }
    if (sorte === 'type') for (const a of d.attaques) if (a.type === id) out.add(`Attaque ${a.nom}`);
    for (const t of d.dresseurs) {
      if (sorte === 'creature' && t.equipe.some((m) => m.creature === id)) out.add(`Dresseur ${t.nom}`);
      if (sorte === 'attaque' && t.equipe.some((m) => m.attaques.includes(id))) out.add(`Dresseur ${t.nom}`);
      if (sorte === 'objet' && t.equipe.some((m) => m.objet === id)) out.add(`Dresseur ${t.nom}`);
    }
    for (const b of d.boutiques) if (b.articles.some((a) => a.id === id && a.sorte === sorte)) out.add(`Boutique ${b.nom}`);
    // Pack JRPG.
    for (const k of d.classes || []) if (sorte === 'attaque' && k.competences.some((c) => c.competence === id)) out.add(`Classe ${k.nom}`);
    for (const m of d.monstres || []) {
      if (sorte === 'attaque' && m.competences.some((c) => c.competence === id)) out.add(`Monstre ${m.nom}`);
      if (sorte === 'objet' && m.butin.some((b) => b.objet === id)) out.add(`Monstre ${m.nom} (butin)`);
      if (sorte === 'type' && [...m.faiblesses, ...m.resistances, ...m.immunites].includes(id)) out.add(`Monstre ${m.nom}`);
    }
    for (const g of d.groupes || []) if (sorte === 'monstre' && g.monstres.some((x) => x.monstre === id)) out.add(`Groupe ${g.nom}`);
    for (const p of d.personnages || []) {
      if (sorte === 'classe' && p.classe === id) out.add(`Personnage ${p.nom}`);
      if (sorte === 'objet' && Object.values(p.equipement || {}).includes(id)) out.add(`Personnage ${p.nom} (équipement)`);
    }
    if (sorte === 'type') for (const o of d.objets) if (o.equipement?.element === id) out.add(`Objet ${o.nom} (élément de l'arme)`);
    if (sorte === 'classe') for (const o of d.objets) if (o.equipement?.classes.includes(id)) out.add(`Objet ${o.nom}`);
    J?.utilisations(doc, sorte, id, out);
    return [...out];
  }

  // --- Les données officielles (Jeu › Données du jeu › Importer) ---
  // Met l'import dans les données : les éléments déjà importés sont retrouvés par leur nom officiel
  // (ils gardent leur identifiant, que les scripts utilisent), les nouveaux s'ajoutent, et ceux qu'on a
  // créés soi-même ne bougent pas. maj = false : seulement ajouter ce qui manque.
  function fusionner(data, imp, { maj = true } = {}) {
    const champsRef = { types: 'types', talents: 'talents', attaques: 'attaques', creatures: 'creatures', objets: 'objets' };
    const out = { ...data };
    const corresp = {};
    const bilan = {};
    // 1. L'identifiant final de chaque élément importé.
    for (const k of Object.keys(champsRef)) {
      const list = arr(imp[k]);
      const existants = new Map(data[k].filter((o) => o.officiel).map((o) => [o.officiel, o]));
      const pris = data[k].map((o) => ({ id: o.id }));
      corresp[k] = new Map();
      for (const o of list) {
        const deja = existants.get(o.officiel);
        const id = deja ? deja.id : Events.ident(o.id, pris, o.id);
        if (!deja) pris.push({ id });
        corresp[k].set(o.id, id);
      }
    }
    const re = (k, id) => corresp[k].get(id) || id;
    // 2. Les références entre données suivent ces identifiants.
    const refaire = {
      types: (t) => ({ ...t, efficace: t.efficace.map((x) => re('types', x)), peu_efficace: t.peu_efficace.map((x) => re('types', x)), sans_effet: t.sans_effet.map((x) => re('types', x)) }),
      talents: (t) => t,
      attaques: (a) => ({ ...a, type: re('types', a.type) }),
      objets: (o) => o,
      creatures: (c) => ({
        ...c,
        types: c.types.map((x) => re('types', x)),
        talents: c.talents.map((x) => re('talents', x)),
        talent_cache: c.talent_cache ? re('talents', c.talent_cache) : '',
        attaques: c.attaques.map((a) => ({ ...a, attaque: re('attaques', a.attaque) })),
        ct: c.ct.map((x) => re('attaques', x)),
        evolutions: c.evolutions.map((e) => ({ ...e, vers: re('creatures', e.vers), objet: e.objet ? re('objets', e.objet) : '' })),
      }),
    };
    for (const k of Object.keys(champsRef)) {
      const list = arr(imp[k]);
      const next = [...data[k]];
      let ajoutes = 0, misAJour = 0;
      list.forEach((o, i) => {
        const n = refaire[k](NORMES[k](o, i));
        n.id = corresp[k].get(o.id);
        const at = data[k].findIndex((x) => x.officiel && x.officiel === o.officiel);
        if (at >= 0) {
          if (!maj) return;
          // Une image qu'on avait importée, ou mise soi-même, n'est pas effacée par un import sans images.
          if (k === 'creatures') n.sprites = { face: n.sprites.face || next[at].sprites.face, dos: n.sprites.dos || next[at].sprites.dos };
          if (k === 'objets') n.icone = n.icone || next[at].icone;
          next[at] = n;
          misAJour++;
        } else { next.push(n); ajoutes++; }
      });
      out[k] = next;
      bilan[k] = { ajoutes, misAJour };
    }
    return { data: out, bilan };
  }

  // La fenêtre d'import : ce qu'on prend, puis le téléchargement (avec sa progression).
  async function demanderImport() {
    const gens = el('div', { className: 'chips' });
    const coches = [];
    for (let g = 1; g <= 9; g++) {
      const c = el('input', { type: 'checkbox', checked: true });
      coches.push(c);
      gens.append(el('label', { className: 'chip chip-check' }, [c, el('span', { textContent: `${g}G` })]));
    }
    const v = await Dialogs.form({
      title: 'Importer les données officielles',
      okLabel: 'Importer',
      width: 560,
      fields: [
        { type: 'info', text: 'Les 18 types et leurs faiblesses, les talents, les attaques, les créatures (statistiques, évolutions, attaques par niveau et par CT, talents, taux de capture…), les objets (soins, balles, menthes, capsules, pierres…), en français, depuis PokeAPI. Il faut Internet. Tu pourras tout modifier, et ajouter tes créatures et objets à toi à côté.' },
        { type: 'element', element: el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Générations' }), gens]) },
        { key: 'sprites', label: 'Images des créatures (face et dos)', type: 'checkbox', value: true },
        { key: 'icones', label: 'Icônes des objets', type: 'checkbox', value: true },
        { key: 'maj', label: 'Déjà importées : les mettre à jour', type: 'select', value: 'oui', choices: [['oui', 'Oui (les changements que tu leur as faits sont remplacés)'], ['non', 'Non, ajouter seulement ce qui manque']] },
        { type: 'info', text: 'Les noms, les images et les créatures officiels appartiennent à Nintendo, Game Freak et The Pokémon Company : parfait pour ton jeu perso, mais à remplacer par tes créatures à toi avant de partager ou vendre le jeu.' },
      ],
    });
    if (!v) return null;
    const generations = coches.map((c, i) => (c.checked ? i + 1 : 0)).filter(Boolean);
    if (!generations.length) { notify('Choisis au moins une génération.', 'error'); return null; }
    return { generations, sprites: v.sprites, icones: v.icones, maj: v.maj === 'oui' };
  }
  let progresBranche = false;
  async function telechargerOfficiel(options) {
    const barre = el('div', { className: 'import-progress' }, [el('span', { className: 'import-label', textContent: 'Connexion à PokeAPI…' }), el('div', { className: 'import-bar' }, [el('div', { className: 'import-fill' })])]);
    const voile = el('div', { className: 'import-overlay' }, [barre]);
    document.body.append(voile);
    if (!progresBranche) {
      progresBranche = true;
      window.tafl.onImportProgres((p) => {
        const v = document.querySelector('.import-overlay');
        if (!v) return;
        v.querySelector('.import-label').textContent = `${p.etape} : ${p.fait} / ${p.total}`;
        v.querySelector('.import-fill').style.width = `${Math.round((p.fait / Math.max(1, p.total)) * 100)}%`;
      });
    }
    try {
      return await window.tafl.importerOfficiel({ generations: options.generations, sprites: options.sprites, icones: options.icones });
    } finally { voile.remove(); }
  }

  // --- Les rencontres d'une zone (herbes hautes, eau, grotte) : la fenêtre de la zone ---
  // Rend l'élément à mettre dans Dialogs.form ; la liste est modifiée sur place (c'est une copie).
  function tableRencontres(doc, rencontres) {
    listes(doc.data);
    if (['jrpg', 'jdr'].includes(packDe(doc))) return tableGroupes(doc, rencontres);
    const total = el('p', { className: 'modal-info' });
    const majTotal = () => {
      const t = rencontres.reduce((n, r) => n + (r.chance || 0), 0);
      total.textContent = rencontres.length ? `Total des chances : ${t} %${t !== 100 ? ' (le moteur les ramène à 100 %)' : ''}.` : 'Aucune créature : rien ne surgit ici.';
    };
    const box = table(rencontres, [
      ['Créature', (r) => refInfo(r, 'creature', 'tafl-creatures', 'roucool', descNom(doc.data.creatures)), true],
      ['Niveau min', (r) => nombreIn(r, 'niveau_min', 1, 100)],
      ['max', (r) => nombreIn(r, 'niveau_max', 1, 100)],
      ['Chance %', (r) => nombreIn(r, 'chance', 1, 100, 1, majTotal)],
    ], () => ({ creature: '', niveau_min: rencontres.at(-1)?.niveau_min || 2, niveau_max: rencontres.at(-1)?.niveau_max || 4, chance: 20 }), { ajouter: '+ Créature', max: 20 });
    box.addEventListener('click', () => setTimeout(majTotal));
    majTotal();
    return el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Créatures sauvages' }), box, total]);
  }
  // Pack JRPG : des groupes de monstres (au lieu de créatures et de niveaux), tirés selon leurs chances.
  function tableGroupes(doc, rencontres) {
    const total = el('p', { className: 'modal-info' });
    const majTotal = () => {
      const t = rencontres.reduce((n, r) => n + (r.chance || 0), 0);
      total.textContent = rencontres.length ? `Total des chances : ${t} % (chaque groupe a sa part du total).` : 'Aucun groupe : rien ne surgit ici.';
    };
    const box = table(rencontres, [
      ['Groupe de monstres', (r) => refInfo(r, 'groupe', 'tafl-groupes', 'slimes-x3', (id) => { const g = doc.data.groupes.find((x) => x.id === id); return g ? el('span', { textContent: `${g.nom} (${resumeGroupe(doc.data, g)})` }) : null; }), true],
      ['Chance %', (r) => nombreIn(r, 'chance', 1, 100, 1, majTotal)],
    ], () => ({ groupe: '', chance: 20 }), { ajouter: '+ Groupe', max: 20 });
    box.addEventListener('click', () => setTimeout(majTotal));
    majTotal();
    return el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Groupes de monstres' }), box, total]);
  }
  // Les monstres d'un groupe : ceux du pack JDR (monstres_jdr), sinon ceux du pack JRPG.
  const monstresDe = (d) => (packDe(d) === 'jdr' ? d.monstres_jdr || [] : d.monstres || []);
  const resumeGroupe = (d, g) => g.monstres.map((x) => `${monstresDe(d).find((m) => m.id === x.monstre)?.nom || x.monstre}${x.nombre > 1 ? ` ×${x.nombre}` : ''}`).join(', ') || 'vide';
  const normRencontres = (list) => arr(list).filter((r) => r?.creature || r?.groupe).slice(0, 20).map((r) => {
    if (!r.creature) return { groupe: Doc.slug(r.groupe, ''), chance: int(r.chance, 10, 1, 100) };
    const min = int(r.niveau_min, 2, 1, 100);
    return { creature: Doc.slug(r.creature, ''), niveau_min: min, niveau_max: Math.max(min, int(r.niveau_max, min, 1, 100)), chance: int(r.chance, 10, 1, 100) };
  });

  // --- L'ambiance d'une carte : météo et teinte (l'aperçu est dessiné par stage.js) ---
  const METEOS = [['aucune', 'Aucune'], ['pluie', 'Pluie'], ['orage', 'Orage'], ['neige', 'Neige'], ['brouillard', 'Brouillard'], ['feuilles', 'Feuilles qui tombent'], ['lucioles', 'Lucioles']];
  // Tafl 0.29 : la musique de la carte ('' = celle d'avant continue, 'aucune' = silence), son fond sonore
  // en boucle ('' = selon la météo : Saga fait la pluie et l'orage lui-même, 'aucun' = silence), et le jour
  // et la nuit (une carte extérieure suit l'horloge du jeu, sauf si on le décoche).
  const ambianceVide = () => ({ meteo: 'aucune', intensite: 50, teinte: '', force: 30, musique: '', fond_sonore: '', volume_fond: 70, jour_nuit: true });
  const normAmbiance = (a) => ({
    meteo: pick(a?.meteo, METEOS, 'aucune'), intensite: int(a?.intensite, 50, 0, 100), teinte: normalizeHex(a?.teinte) || '', force: int(a?.force, 30, 0, 100),
    musique: son(a?.musique, ['aucune']), fond_sonore: son(a?.fond_sonore, ['aucun']), volume_fond: int(a?.volume_fond, 70, 0, 100), jour_nuit: a?.jour_nuit !== false,
  });
  // Une lumière (Tafl 0.29) : sur une tuile (un lampadaire, une fenêtre, un feu) ou sur un événement.
  // Saga la fait briller quand il fait sombre (la nuit, ou une carte teintée sombre).
  const lumiereVide = () => ({ couleur: '#ffd890', rayon: 3, intensite: 80, scintille: false });
  const normLumiere = (l) => (l && typeof l === 'object'
    ? { couleur: normalizeHex(l.couleur) || '#ffd890', rayon: num(l.rayon, 3, 0.5, 16), intensite: int(l.intensite, 80, 0, 100), scintille: Boolean(l.scintille) }
    : null);

  // --- Les onglets de Jeu › Données du jeu ---
  // ctx (donné par Events.editData) : { doc, work, form, input, zone, coche, nombre, idLigne, usages,
  // render, renderListe, choisirImage, couleurType, ligne }.
  // Texte sombre sur les couleurs claires (Électrik, Glace…), clair sur les autres.
  const clair = (hex) => { const [r, g, b] = hexToRgba(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 170; };
  const pastille = (couleur, texte) => el('span', { className: `type-pill${clair(couleur || COULEUR_TYPE) ? ' sombre' : ''}`, textContent: texte, style: { background: couleur || COULEUR_TYPE } });
  const typePill = (work, id) => { const t = work.types.find((x) => x.id === id); return pastille(t?.couleur, t?.nom || id || '?'); };
  const datalist = (id, valeurs) => {
    let dl = document.getElementById(id);
    if (!dl) { dl = el('datalist', { id }); document.body.append(dl); }
    dl.replaceChildren(...valeurs.map(([v, l]) => el('option', { value: v, label: l })));
  };
  // Les listes proposées dans les champs (créatures, attaques, objets…), d'après les données en cours.
  function listes(data) {
    datalist('tafl-creatures', data.creatures.map((c) => [c.id, c.nom]));
    datalist('tafl-attaques', data.attaques.map((a) => [a.id, a.nom]));
    datalist('tafl-talents', data.talents.map((a) => [a.id, a.nom]));
    datalist('tafl-dresseurs', data.dresseurs.map((a) => [a.id, a.nom]));
    datalist('tafl-boutiques', data.boutiques.map((a) => [a.id, a.nom]));
    datalist('tafl-donnees-objets', data.objets.map((a) => [a.id, a.nom]));
    datalist('tafl-quetes', data.quetes.map((a) => [a.id, a.titre]));
    datalist('tafl-classes', (data.classes || []).map((a) => [a.id, a.nom]));
    datalist('tafl-monstres', (data.monstres || []).map((a) => [a.id, a.nom]));
    datalist('tafl-groupes', (data.groupes || []).map((a) => [a.id, a.nom]));
    J?.listes(data);
  }
  const choixTypes = (work, vide = 'Aucun') => [['', vide], ...work.types.map((t) => [t.id, t.nom])];
  const COURT = { attaque: 'Att', defense: 'Déf', att_spe: 'Att.Spé', def_spe: 'Déf.Spé', vitesse: 'Vit' };
  const choixNatures = (vide) => [...(vide ? [['', vide]] : []), ...NATURES.map(([k, n, p, m]) => [k, p ? `${n} (+${COURT[p]} −${COURT[m]})` : `${n} (neutre)`])];
  const ref = (o, key, list, placeholder, after) => {
    const i = el('input', { type: 'text', value: o[key] || '', list, placeholder, className: 'ref-input' });
    i.oninput = () => { o[key] = Doc.slug(i.value, ''); after?.(); };
    i.onchange = () => { i.value = o[key]; };
    return i;
  };
  // Un champ de référence suivi de ce qu'il désigne (le nom, le type…), mis à jour en tapant.
  const refInfo = (o, key, list, placeholder, decrire) => {
    const out = el('span', { className: 'ref-info' });
    const maj = () => { const d = o[key] ? decrire(o[key]) : null; out.replaceChildren(...(d ? [].concat(d) : o[key] ? [el('span', { className: 'ref-inconnu', textContent: 'inconnu' })] : [])); };
    const i = ref(o, key, list, placeholder, maj);
    maj();
    return el('span', { className: 'ref-wrap' }, [i, out]);
  };
  const descAttaque = (work) => (id) => { const a = work.attaques.find((x) => x.id === id); return a ? [typePill(work, a.type), el('span', { textContent: `${a.nom}${a.puissance ? ` · ${a.puissance}` : ''}` })] : null; };
  const descNom = (liste) => (id) => { const o = liste.find((x) => x.id === id); return o ? el('span', { textContent: o.nom }) : null; };
  const sel = (choices, value, onchange) => {
    const s = el('select');
    for (const [k, l] of choices) s.add(new Option(l, k));
    s.value = String(value ?? '');
    s.onchange = () => onchange(s.value);
    return s;
  };
  const petitBouton = (ic, title, run) => {
    const b = el('button', { className: 'icon-button', title }, [icon(ic)]);
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); run(e); };
    return b;
  };
  const section = (text, ...extra) => el('div', { className: 'editor-section' }, [el('span', { textContent: text }), ...extra]);
  const info = (text) => el('p', { className: 'modal-info', textContent: text });
  const champ = (label, input, unit = '') => (input.type === 'checkbox'
    ? el('label', { className: 'field checkbox-row' }, [el('span', { className: 'field-label' }, [label, unit ? el('span', { className: 'unit', textContent: ` (${unit})` }) : null]), input])
    : el('label', { className: 'field' }, [el('span', { className: 'field-label', textContent: label }), input, unit ? el('span', { className: 'unit', textContent: unit }) : null]));
  // Une petite table éditable : lignes de champs, ↑ ↓ et poubelle, et « + Ajouter ».
  function table(items, colonnes, nouveau, { ajouter = '+ Ajouter', max = Infinity, vide = '', change = null } = {}) {
    const box = el('div', { className: 'mini-table' });
    const rendre = () => {
      box.replaceChildren();
      // Une colonne marquée « ligne2 » passe sur une deuxième ligne, toute la largeur (les attaques d'un membre d'équipe).
      const haut = colonnes.filter((c) => !c[3]), bas = colonnes.filter((c) => c[3]);
      if (colonnes.length) box.append(el('div', { className: 'mini-row mini-head' }, [...haut.map(([titre, , large]) => el('span', { textContent: titre, className: large ? 'large' : '' })), el('span', { className: 'mini-actions' })]));
      items.forEach((it, k) => {
        box.append(el('div', { className: `mini-row${bas.length ? ' mini-card' : ''}` }, [
          ...haut.map(([, f, large]) => el('span', { className: large ? 'large' : '' }, [f(it, k, rendre)])),
          el('span', { className: 'mini-actions' }, [petitBouton('trash', 'Retirer', () => { items.splice(k, 1); rendre(); change?.(); })]),
          ...bas.map(([titre, f]) => el('span', { className: 'ligne2' }, [el('span', { className: 'ligne2-titre', textContent: titre }), f(it, k, rendre)])),
        ]));
      });
      if (!items.length && vide) box.append(el('p', { className: 'chips-empty', textContent: vide }));
      if (items.length < max) {
        const add = el('button', { className: 'cmd-add', textContent: ajouter });
        add.onclick = (e) => { e.preventDefault(); items.push(nouveau()); rendre(); change?.(); box.querySelectorAll('.mini-row:not(.mini-head)')[items.length - 1]?.querySelector('input, select')?.focus(); };
        box.append(add);
      }
    };
    rendre();
    return box;
  }
  const nombreIn = (o, key, min, max, step = 1, after = null) => {
    const i = el('input', { type: 'number', value: o[key], min, max, step, className: 'num-input' });
    i.oninput = () => { if (i.value !== '') { o[key] = clamp(Number(i.value), min, max); after?.(); } };
    return i;
  };
  const texteIn = (o, key, placeholder = '') => {
    const i = el('input', { type: 'text', value: o[key] || '', placeholder });
    i.oninput = () => { o[key] = i.value; };
    return i;
  };

  // Une image (sprite, icône) : aperçu en gros pixels, importer, remplacer, retirer.
  function blocImage(ctx, o, cle, titre, sousCle) {
    const get = () => (sousCle ? o[cle][sousCle] : o[cle]);
    const set = (v) => { if (sousCle) o[cle] = { ...o[cle], [sousCle]: v }; else o[cle] = v; };
    const img = el('img', { alt: titre });
    const dim = el('span', { className: 'portrait-size' });
    const vue = el('div', { className: 'sprite-img checker' }, [img, dim]);
    const maj = () => { const v = get(); img.src = v || ''; img.hidden = !v; dim.textContent = v ? '' : 'Aucune image'; };
    img.onload = () => { dim.textContent = `${img.naturalWidth} × ${img.naturalHeight}`; };
    maj();
    const importer = async () => {
      const f = await window.tafl.openFile({ kind: 'image', titre: `${titre} : ${o.nom}` });
      if (!f) return;
      try { set((await Events.imagePortrait(f)).png); maj(); ctx.renderListe(); } catch (err) { notify(cleanError(err), 'error'); }
    };
    return el('div', { className: 'sprite' }, [
      vue,
      el('div', { className: 'portrait-bar' }, [
        el('span', { className: 'sprite-title', textContent: titre }),
        petitBouton('folder-opened', 'Importer une image (PNG, fond transparent)', importer),
        petitBouton('trash', 'Retirer l\'image', () => { set(''); maj(); ctx.renderListe(); }),
      ]),
    ]);
  }

  function formType(t, ctx) {
    const { work, form } = ctx;
    const idl = ctx.idLigne(t);
    const couleur = el('input', { type: 'color', value: t.couleur || COULEUR_TYPE });
    couleur.oninput = () => { t.couleur = couleur.value; ctx.renderListe(); dessiner(); };
    // La table des types : en ligne le type qui attaque, en colonne celui qui défend. Un clic change
    // l'efficacité : ×1 → ×2 → ×½ → ×0 → ×1.
    const tableau = el('div', { className: 'type-matrix-wrap' });
    const valeurs = [1, 2, 0.5, 0];
    const texte = { 1: '', 2: '×2', 0.5: '½', 0: '0' };
    function dessiner() {
      const tab = el('table', { className: 'type-matrix' });
      const tete = el('tr', {}, [el('th', { className: 'coin', textContent: 'Attaque ↓  Défense →' })]);
      for (const d of work.types) tete.append(el('th', { className: d === t ? 'actif' : '', title: d.nom }, [el('span', { className: 'vertical', textContent: d.nom, style: { color: d.couleur || '' } })]));
      tab.append(tete);
      for (const a of work.types) {
        const tr = el('tr', { className: a === t ? 'actif' : '' }, [el('th', { className: 'ligne' }, [pastille(a.couleur, a.nom)])]);
        for (const d of work.types) {
          const v = efficacite(a, d.id);
          const td = el('td', { className: `eff eff-${String(v).replace('.', '')}`, textContent: texte[v], title: `${a.nom} contre ${d.nom} : ×${v === 0.5 ? '½' : v}` });
          td.onclick = () => {
            const n = valeurs[(valeurs.indexOf(v) + 1) % valeurs.length];
            a.efficace = a.efficace.filter((x) => x !== d.id);
            a.peu_efficace = a.peu_efficace.filter((x) => x !== d.id);
            a.sans_effet = a.sans_effet.filter((x) => x !== d.id);
            if (n === 2) a.efficace = [...a.efficace, d.id];
            if (n === 0.5) a.peu_efficace = [...a.peu_efficace, d.id];
            if (n === 0) a.sans_effet = [...a.sans_effet, d.id];
            dessiner();
          };
          tr.append(td);
        }
        tab.append(tr);
      }
      tableau.replaceChildren(tab);
    }
    dessiner();
    const resume = (liste, mot) => (liste.length ? `${mot} ${liste.map((x) => work.types.find((y) => y.id === x)?.nom || x).join(', ')}` : '');
    const faiblesses = work.types.filter((a) => efficacite(a, t.id) === 2).map((a) => a.nom);
    form.append(
      champ('Nom', ctx.input(t, 'nom', 'Feu, Eau, Lumière…', idl.maj)),
      idl.el,
      el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Couleur' }), couleur, el('span', { className: 'unit', textContent: 'des étiquettes et des boutons de combat' })]),
      info([resume(t.efficace, 'Super efficace contre'), resume(t.peu_efficace, 'Peu efficace contre'), resume(t.sans_effet, 'Sans effet sur'), faiblesses.length ? `Craint ${faiblesses.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Neutre contre tout le monde pour l\'instant.'),
      section('La table des types'),
      info('Chaque case : ce que fait le type de la ligne (l\'attaque) au type de la colonne (le défenseur). Clique pour changer : ×1, ×2, ×½, ×0. La ligne du type choisi est mise en avant.'),
      tableau,
      section('Utilisation'),
      ctx.usages('type', t.id),
    );
  }

  function formTalent(t, ctx) {
    const idl = ctx.idLigne(t);
    ctx.form.append(
      champ('Nom', ctx.input(t, 'nom', 'Brasier, Torrent…', idl.maj)),
      idl.el,
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(t, 'description', 3, 'Ce que fait le talent (le moteur du jeu s\'occupera des effets).')]),
      t.officiel ? info(`Talent officiel (${t.officiel}).`) : null,
      section('Utilisation'),
      ctx.usages('talent', t.id),
    );
  }

  // Des cases à cocher (statuts guéris, classes qui portent un objet…) : la liste `cle` de o change.
  function cases(o, cle, choix, vide = '') {
    const box = el('div', { className: 'chips' });
    for (const [k, nom] of choix) {
      const c = el('input', { type: 'checkbox', checked: o[cle].includes(k) });
      c.onchange = () => { o[cle] = c.checked ? [...o[cle], k] : o[cle].filter((x) => x !== k); };
      box.append(el('label', { className: 'chip chip-check' }, [c, el('span', { textContent: nom })]));
    }
    if (!choix.length && vide) box.append(el('span', { className: 'chips-empty', textContent: vide }));
    return box;
  }
  // Les statistiques d'une classe ou d'un monstre, en grille (cle : stats, gains).
  const grilleStats = (o, cle, max, step = 1) => el('div', { className: 'field-grid' }, STATS_JRPG.map(([k, nom]) => {
    const v = { x: o[cle][k] };
    return champ(nom, nombreIn(v, 'x', 0, max, step, () => { o[cle] = { ...o[cle], [k]: v.x }; }));
  }));

  // Une compétence du pack JRPG : PM, élément, dégâts ou soin, statuts, crans de statistiques.
  function formCompetence(a, ctx) {
    const { work, form } = ctx;
    const idl = ctx.idLigne(a);
    a.cible = CIBLES_JRPG.some(([k]) => k === a.cible) ? a.cible : 'adversaire';
    form.append(
      champ('Nom', ctx.input(a, 'nom', 'Feu, Soin, Coup double…', idl.maj)),
      idl.el,
      el('div', { className: 'field-grid' }, [
        champ('Élément', sel(choixTypes(work, 'Aucun (neutre)'), a.type, (v) => { a.type = v; ctx.renderListe(); })),
        champ('Sorte', sel(CATEGORIES_JRPG, a.categorie, (v) => { a.categorie = v; ctx.renderListe(); })),
        champ('Coût', nombreIn(a, 'cout_pm', 0, 999), 'PM'),
        champ('Puissance', nombreIn(a, 'puissance', 0, 999), '100 = une attaque normale, 0 = pas de dégâts'),
        champ('Précision', nombreIn(a, 'precision', 0, 100), '% (100 = la magie ne rate pas)'),
        champ('Cible', sel(CIBLES_JRPG, a.cible, (v) => { a.cible = v; })),
      ]),
      section('Soins'),
      el('div', { className: 'field-grid' }, [
        champ('Soigne', nombreIn(a, 'soin', 0, 999), 'puissance du soin (+ la Magie du lanceur)'),
        champ('Ranime un allié K.O.', ctx.coche(a, 'ranime')),
      ]),
      champ('Guérit', cases(a, 'guerit', [...STATUTS_JRPG.slice(1), ['tous', 'Tous les statuts']])),
      section('Effets'),
      el('div', { className: 'field-grid' }, [
        champ('Statut infligé', sel(STATUTS_JRPG, a.statut, (v) => { a.statut = v; })),
        champ('Chance du statut', nombreIn(a, 'chance_statut', 0, 100), '% (0 = toujours)'),
        champ('Coup critique', nombreIn(a, 'critique', 0, 6), 'paliers en plus (+10 % chacun)'),
      ]),
      section('Crans de statistiques (±4 au plus en combat)'),
      table(a.stats, [
        ['Statistique', (st) => sel(ETAGES_JRPG, st.stat, (v) => { st.stat = v; }), true],
        ['Crans', (st) => nombreIn(st, 'etages', -4, 4)],
      ], () => ({ stat: 'force', etages: 1 }), { ajouter: '+ Statistique', max: 5, vide: 'Aucun.' }),
      el('div', { className: 'field-grid' }, [
        champ('Sur', sel([['adversaire', 'La cible'], ['soi', 'Le lanceur']], a.stats_cible, (v) => { a.stats_cible = v; })),
        champ('Chance', nombreIn(a, 'chance_stats', 0, 100), '% (0 = toujours)'),
      ]),
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(a, 'description', 2, 'Le texte montré dans le menu Compétences.')]),
      info('Physique : Force contre Défense, peut faire un coup critique, l\'élément de l\'arme compte pour l\'attaque de base. Magie : Magie contre Esprit, impossible sous Silence. Une compétence de soin (Soigne, Ranime, Guérit) sur un allié s\'utilise aussi hors combat, depuis le menu du groupe.'),
      section('Utilisation'),
      ctx.usages('attaque', a.id),
    );
  }

  function formAttaque(a, ctx) {
    if (packDe(ctx.work) === 'jrpg') { formCompetence(a, ctx); return; }
    const { work, form } = ctx;
    const idl = ctx.idLigne(a);
    const effets = el('div', { className: 'effets-box' });
    const majEffets = () => {
      effets.replaceChildren(
        el('div', { className: 'field-grid' }, [
          champ('Statut infligé', sel(STATUTS, a.statut, (v) => { a.statut = v; majEffets(); })),
          a.statut ? champ('Chance', nombreIn(a, 'chance_statut', 0, 100), '% (0 = toujours)') : null,
          champ('Apeure', nombreIn(a, 'peur', 0, 100), '% de chance'),
          champ('Coup critique', nombreIn(a, 'critique', 0, 6), 'paliers en plus'),
          champ('Frappe au moins', nombreIn(a, 'coups_min', 1, 10), 'fois'),
          champ('Frappe au plus', nombreIn(a, 'coups_max', 1, 10), 'fois'),
          champ('Draine', nombreIn(a, 'drain', -100, 100), '% des dégâts (négatif = contrecoup)'),
          champ('Soigne', nombreIn(a, 'soin', -100, 100), '% des PV du lanceur'),
        ]),
        section('Changements de statistiques'),
        table(a.stats, [
          ['Statistique', (s) => sel(STATS_COMBAT, s.stat, (v) => { s.stat = v; }), true],
          ['Étages', (s) => nombreIn(s, 'etages', -6, 6)],
        ], () => ({ stat: 'attaque', etages: -1 }), { ajouter: '+ Statistique', max: 8, vide: 'Aucun : l\'attaque ne change pas de statistique.' }),
        el('div', { className: 'field-grid' }, [
          champ('Sur', sel([['adversaire', 'La cible'], ['soi', 'Le lanceur']], a.stats_cible, (v) => { a.stats_cible = v; })),
          champ('Chance', nombreIn(a, 'chance_stats', 0, 100), '% (0 = toujours)'),
        ]),
      );
    };
    majEffets();
    const typeSel = sel(choixTypes(work, 'Sans type'), a.type, (v) => { a.type = v; ctx.renderListe(); });
    form.append(
      champ('Nom', ctx.input(a, 'nom', 'Flammèche, Charge…', idl.maj)),
      idl.el,
      el('div', { className: 'field-grid' }, [
        champ('Type', typeSel),
        champ('Catégorie', sel(CATEGORIES_ATTAQUE, a.categorie, (v) => { a.categorie = v; ctx.renderListe(); })),
        champ('Puissance', nombreIn(a, 'puissance', 0, 999), '0 = pas de dégâts'),
        champ('Précision', nombreIn(a, 'precision', 0, 100), '% (0 = touche toujours)'),
        champ('PP', nombreIn(a, 'pp', 1, 99)),
        champ('Priorité', nombreIn(a, 'priorite', -7, 7), '+1 : frappe en premier'),
        champ('Cible', sel(CIBLES, a.cible, (v) => { a.cible = v; })),
      ]),
      section('Effets'),
      effets,
      champ('Effet en une phrase', ctx.input(a, 'effet', 'A 10 % de chance de brûler la cible.')),
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(a, 'description', 2, 'Le texte montré dans le jeu.')]),
      section('Utilisation'),
      ctx.usages('attaque', a.id),
    );
  }

  function formCreature(c, ctx) {
    const { work, form } = ctx;
    const idl = ctx.idLigne(c);
    // Les statistiques de base, avec leurs barres et leur total.
    const statsBox = el('div', { className: 'stats-box' });
    const majStats = () => {
      statsBox.replaceChildren(...STATS.map(([k, l]) => {
        const v = c.stats[k];
        const bar = el('div', { className: 'stat-bar' }, [el('div', { className: 'stat-fill', style: { width: `${Math.min(100, (v / 200) * 100)}%`, background: `hsl(${Math.min(140, v * 0.9)}, 60%, 50%)` } })]);
        const i = el('input', { type: 'number', value: v, min: 1, max: 255, className: 'num-input' });
        i.oninput = () => { c.stats = { ...c.stats, [k]: clamp(Number(i.value) || 1, 1, 255) }; majStats(); statsBox.querySelector(`[data-k=${k}]`)?.focus(); };
        i.dataset.k = k;
        const ev = el('input', { type: 'number', value: c.ev_donnes[k] || 0, min: 0, max: 3, className: 'num-input ev-input', title: `EV donnés en ${l} quand on bat cette créature` });
        ev.oninput = () => { const n = clamp(Number(ev.value) || 0, 0, 3); const e = { ...c.ev_donnes }; if (n) e[k] = n; else delete e[k]; c.ev_donnes = e; };
        return el('div', { className: 'stat-row' }, [el('span', { className: 'stat-name', textContent: l }), i, bar, ev]);
      }), el('div', { className: 'stat-row stat-total' }, [el('span', { className: 'stat-name', textContent: 'Total' }), el('strong', { textContent: STATS.reduce((s, [k]) => s + c.stats[k], 0) }), el('span'), el('span', { className: 'unit', textContent: 'EV donnés' })]));
    };
    majStats();
    const type2 = () => sel(choixTypes(work, 'Aucun'), c.types[1] || '', (v) => { c.types = [c.types[0] || v, ...(v ? [v] : [])].filter(Boolean).slice(0, 2); ctx.renderListe(); });
    const types = el('div', { className: 'field' }, [
      el('span', { className: 'field-label', textContent: 'Types' }),
      sel(choixTypes(work, 'Aucun'), c.types[0] || '', (v) => { c.types = [v, ...c.types.slice(1)].filter(Boolean); ctx.renderListe(); }),
      type2(),
    ]);
    const talents = el('div', { className: 'field' }, [
      el('span', { className: 'field-label', textContent: 'Talents' }),
      ...[0, 1].map((k) => {
        const o = { v: c.talents[k] || '' };
        const i = ref(o, 'v', 'tafl-talents', k ? 'second talent' : 'talent', () => { const t = [...c.talents]; t[k] = o.v; c.talents = t.filter(Boolean); });
        return i;
      }),
      ref(c, 'talent_cache', 'tafl-talents', 'talent caché'),
    ]);
    // Les faiblesses calculées depuis la table des types.
    const def = work.types.map((a) => [a, c.types.reduce((m, t) => m * efficacite(a, t), 1)]).filter(([, m]) => m !== 1);
    const faiblesses = el('div', { className: 'chips' }, def.length ? def.sort((x, y) => y[1] - x[1]).map(([a, m]) => el('span', { className: 'chip faiblesse' }, [pastille(a.couleur, a.nom), el('span', { textContent: `×${m === 0.5 ? '½' : m === 0.25 ? '¼' : m}` })])) : [el('span', { className: 'chips-empty', textContent: work.types.length ? 'Aucune faiblesse ni résistance.' : 'Ajoute des types (onglet Types, ou l\'import officiel) pour voir ses faiblesses.' })]);
    const ct = el('div', { className: 'chips' });
    const majCt = () => {
      ct.replaceChildren(...c.ct.map((id) => el('span', { className: 'chip' }, [el('span', { textContent: work.attaques.find((a) => a.id === id)?.nom || id }), petitBouton('close', 'Retirer', () => { c.ct = c.ct.filter((x) => x !== id); majCt(); })])));
      const o = { v: '' };
      const i = ref(o, 'v', 'tafl-attaques', '+ attaque par CT');
      i.onchange = () => { if (o.v && !c.ct.includes(o.v)) { c.ct = [...c.ct, o.v]; majCt(); ct.querySelector('input')?.focus(); } };
      ct.append(i);
    };
    majCt();
    form.append(
      el('div', { className: 'creature-head' }, [
        blocImage(ctx, c, 'sprites', 'Face', 'face'),
        blocImage(ctx, c, 'sprites', 'Dos', 'dos'),
        el('div', { className: 'creature-id' }, [
          champ('Nom', ctx.input(c, 'nom', 'Flamiot', idl.maj)),
          idl.el,
          el('div', { className: 'field-grid' }, [
            champ('N° du Pokédex', nombreIn(c, 'numero', 0, 99999)),
            champ('Espèce', ctx.input(c, 'espece', 'Pokémon Lézard')),
          ]),
          types,
          champ('Rareté', sel(RARETES, c.legendaire, (v) => { c.legendaire = v; ctx.renderListe(); }), 'un légendaire s\'obtient au bout d\'une quête'),
        ]),
      ]),
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Pokédex' }), ctx.zone(c, 'description', 2, 'Sa description dans le Pokédex.')]),
      section('Statistiques de base'),
      statsBox,
      section('Faiblesses et résistances'),
      faiblesses,
      section('Talents et capture'),
      talents,
      el('div', { className: 'field-grid' }, [
        champ('Taux de capture', nombreIn(c, 'taux_capture', 1, 255), '3 = très dur, 255 = facile'),
        champ('XP donnée', nombreIn(c, 'xp_base', 0, 999)),
        champ('Croissance', sel(CROISSANCES, c.croissance, (v) => { c.croissance = v; })),
        champ('Bonheur de départ', nombreIn(c, 'bonheur', 0, 255)),
        champ('Mâles', nombreIn(c, 'male', -1, 100, 0.5), '% (−1 = asexué)'),
        champ('Taille', nombreIn(c, 'taille', 0, 999, 0.1), 'm'),
        champ('Poids', nombreIn(c, 'poids', 0, 9999, 0.1), 'kg'),
      ]),
      section('Évolutions'),
      table(c.evolutions, [
        ['Évolue en', (e) => refInfo(e, 'vers', 'tafl-creatures', 'créature', descNom(work.creatures)), true],
        ['Comment', (e, k, rendre) => sel(MODES_EVOLUTION, e.mode, (v) => { e.mode = v; rendre(); })],
        ['Détail', (e) => (e.mode === 'objet' || e.mode === 'echange' ? ref(e, 'objet', 'tafl-donnees-objets', e.mode === 'echange' ? 'objet tenu (facultatif)' : 'pierre-feu')
          : e.mode === 'quete' ? ref(e, 'quete', 'tafl-quetes', 'quête') : e.mode === 'niveau' ? nombreIn(e, 'niveau', 1, 100) : texteIn(e, 'condition', e.mode === 'amitie' ? 'la nuit, le jour…' : 'condition')), true],
      ], () => ({ vers: '', mode: 'niveau', niveau: 16, objet: '', quete: '', condition: '' }), { ajouter: '+ Évolution', vide: 'N\'évolue pas.' }),
      section('Attaques apprises par niveau'),
      table(c.attaques, [
        ['Niveau', (a) => nombreIn(a, 'niveau', 0, 100)],
        ['Attaque', (a) => refInfo(a, 'attaque', 'tafl-attaques', 'charge', descAttaque(work)), true],
      ], () => ({ niveau: (c.attaques.at(-1)?.niveau || 0) + 3, attaque: '' }), { ajouter: '+ Attaque', vide: 'Aucune attaque. Niveau 0 : apprise en évoluant.' }),
      section('Attaques par CT'),
      ct,
      section('Utilisation'),
      ctx.usages('creature', c.id),
    );
  }

  // Pack JRPG : les effets qui ont un sens, et l'équipement (sa place, ses bonus, qui peut le porter).
  const EFFETS_JRPG = ['aucun', 'soin', 'soin_pm', 'soin_statut', 'rappel', 'repousse', 'passage'];
  function blocEquipement(o, ctx) {
    const box = el('div');
    const rendre = () => {
      const e = o.equipement;
      box.replaceChildren(
        champ('Se porte comme', sel([['', 'Ne se porte pas'], ...PLACES], e?.place || '', (v) => {
          if (!v) delete o.equipement;
          else o.equipement = { place: v, bonus: { ...(e?.bonus || {}) }, element: e?.element || '', classes: [...(e?.classes || [])] };
          if (v && o.categorie !== v && ['arme', 'bouclier', 'casque', 'armure', 'accessoire', 'autre'].includes(o.categorie)) o.categorie = v;
          rendre(); ctx.renderListe();
        })),
        ...(e ? [
          el('div', { className: 'field-grid' }, STATS_JRPG.map(([k, nom]) => {
            const v = { x: e.bonus[k] || 0 };
            return champ(nom, nombreIn(v, 'x', -999, 999, 1, () => { if (v.x) e.bonus[k] = v.x; else delete e.bonus[k]; }));
          })),
          e.place === 'arme' ? champ('Élément de l\'arme', sel(choixTypes(ctx.work, 'Aucun'), e.element, (v) => { e.element = v; }), 'ses attaques de base sont de cet élément') : null,
          champ('Classes qui peuvent le porter', cases(e, 'classes', ctx.work.classes.map((k) => [k.id, k.nom]), 'Aucune classe pour l\'instant.'), 'rien de coché = toutes'),
        ] : []),
      );
    };
    rendre();
    return box;
  }

  function formObjet(o, ctx) {
    const idl = ctx.idLigne(o);
    const jrpg = packDe(ctx.work) === 'jrpg';
    const effet = el('div', { className: 'field-grid' });
    const majEffet = () => {
      const champs = EFFETS_OBJET.find(([k]) => k === o.effet.type)?.[2] || [];
      const e = o.effet;
      if (champs.includes('valeur') && e.valeur === undefined) e.valeur = { soin_pm: 20, soin: 20, rappel: 50, pp: 10, pp_toutes: 10, pp_max: 1, ev: 10, niveau: 1, ivs: 31, balle: 1, repousse: 100 }[e.type] ?? 1;
      effet.replaceChildren(
        champ('Effet', sel(EFFETS_OBJET.filter(([k]) => !jrpg || EFFETS_JRPG.includes(k) || k === e.type).map(([k, l]) => [k, l]), e.type, (v) => { o.effet = { type: v }; majEffet(); })),
        champs.includes('valeur') ? champ('Valeur', nombreIn(e, 'valeur', 0, 99999, e.type === 'balle' ? 0.5 : 1), UNITES_EFFET[e.type] || '') : null,
        champs.includes('stat') ? champ('Statistique', sel([...(e.type === 'ivs' ? [['choix', 'Au choix du joueur'], ['tous', 'Toutes']] : []), ...STATS], e.stat || (e.type === 'ivs' ? 'choix' : 'pv'), (v) => { e.stat = v; })) : null,
        champs.includes('statut') ? champ('Statut', sel([['', e.type === 'soin' ? 'Aucun' : 'Tous'], ...(jrpg ? STATUTS_JRPG : STATUTS).slice(1), ['tous', 'Tous']], e.statut || '', (v) => { if (v) e.statut = v; else delete e.statut; })) : null,
        champs.includes('nature') ? champ('Nature', sel(choixNatures(), e.nature || 'hardi', (v) => { e.nature = v; })) : null,
      );
      if (champs.includes('stat') && !e.stat) e.stat = e.type === 'ivs' ? 'choix' : 'pv';
      if (champs.includes('nature') && !e.nature) e.nature = 'hardi';
    };
    majEffet();
    ctx.form.append(
      el('div', { className: 'creature-head' }, [
        blocImage(ctx, o, 'icone', 'Icône'),
        el('div', { className: 'creature-id' }, [
          champ('Nom', ctx.input(o, 'nom', 'Potion, Planche de surf…', idl.maj)),
          idl.el,
          el('div', { className: 'field-grid' }, [
            champ('Catégorie', sel(CATEGORIES_OBJET, o.categorie, (v) => { o.categorie = v; ctx.renderListe(); })),
            champ('Prix', nombreIn(o, 'prix', 0, 9999999), '0 = pas à vendre'),
          ]),
        ]),
      ]),
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(o, 'description', 2, 'Le texte du sac.')]),
      section('Ce qu\'il fait'),
      effet,
      ...(packDe(ctx.work) === 'jdr' && J ? J.formObjet(o, ctx) : []),
      ...(jrpg ? [section('Équipement'), blocEquipement(o, ctx), info('Un objet porté (arme, bouclier, casque, armure, accessoire) ajoute ses bonus aux statistiques du héros. Le joueur le met dans le menu du groupe › Équipement ; un personnage peut aussi commencer avec (onglet Personnages).')] : []),
      jrpg || packDe(ctx.work) === 'jdr' ? null : info('Une menthe change l\'effet de la nature sur les statistiques ; une capsule met des IV au maximum ; une vitamine donne des EV. Un objet « Ouvre un passage » remplace les CS : mets-le comme objet requis d\'une zone (eau, rocher, arbre…).'),
      section('Utilisation'),
      ctx.usages('objet', o.id),
    );
  }

  function formDresseur(d, ctx) {
    const { work, form } = ctx;
    const idl = ctx.idLigne(d);
    form.append(
      champ('Nom', ctx.input(d, 'nom', 'Léo, Gamin Théo…', idl.maj)),
      idl.el,
      el('div', { className: 'field-grid' }, [
        champ('Classe', ctx.input(d, 'classe', 'Gamin, Montagnard, Champion…')),
        champ('Personnage', sel([['', 'Aucun'], ...work.personnages.map((p) => [p.id, p.nom])], d.personnage, (v) => { d.personnage = v; }), 'son portrait et sa couleur'),
        champ('Argent gagné', nombreIn(d, 'argent', 0, 9999999), work.reglages.monnaie),
      ]),
      champ('Son équipe suit le niveau du joueur', ctx.coche(d, 'ajuste'), `réglages : ${AJUSTEMENTS.find(([k]) => k === work.reglages.ajustement)?.[1] || ''}`),
      section('Équipe (6 au plus)'),
      table(d.equipe, [
        ['Créature', (m) => refInfo(m, 'creature', 'tafl-creatures', 'créature', descNom(work.creatures)), true],
        ['Niveau', (m) => nombreIn(m, 'niveau', 1, 100)],
        ['Nature', (m) => sel(choixNatures('Au hasard'), m.nature, (v) => { m.nature = v; })],
        ['Objet tenu', (m) => ref(m, 'objet', 'tafl-donnees-objets', 'aucun')],
        ['Attaques (vide : celles de son niveau)', (m) => {
          const box = el('span', { className: 'attaques-4' });
          for (let k = 0; k < 4; k++) {
            const o = { v: m.attaques[k] || '' };
            box.append(ref(o, 'v', 'tafl-attaques', `attaque ${k + 1}`, () => { const a = [...m.attaques]; a[k] = o.v; m.attaques = a.filter(Boolean); }));
          }
          return box;
        }, false, true],
      ], () => ({ creature: '', niveau: d.equipe.at(-1)?.niveau || 5, nature: '', objet: '', attaques: [] }), { ajouter: '+ Créature', max: 6, vide: 'Pas encore de créature.', change: ctx.renderListe }),
      section('Dialogues'),
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Avant le combat' }), ctx.zone(d, 'dialogue_avant', 2, 'Hé ! Nos regards se sont croisés !')]),
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Quand le joueur gagne' }), ctx.zone(d, 'dialogue_victoire', 2, 'Quoi ? J\'ai perdu ?')]),
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Quand le joueur perd' }), ctx.zone(d, 'dialogue_defaite', 2, 'Reviens quand tu seras plus fort !')]),
      info('Un événement lance le combat avec la commande « Combat contre un dresseur ». Chaque victoire compte dans le compteur « Dresseurs battus », qui peut débloquer des articles en boutique.'),
      section('Utilisation'),
      ctx.usages('dresseur', d.id),
    );
  }

  function formBoutique(b, ctx) {
    const { doc, work, form } = ctx;
    const idl = ctx.idLigne(b);
    const prixDe = (a) => (a.sorte === 'objet' ? work.objets.find((o) => o.id === a.id)?.prix : null);
    form.append(
      champ('Nom', ctx.input(b, 'nom', 'Boutique du bourg', idl.maj)),
      idl.el,
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(b, 'description', 2, 'Pour t\'en souvenir.')]),
      champ('Rachète les objets du joueur (à moitié prix)', ctx.coche(b, 'rachete')),
      champ('Achète et vend des créatures', ctx.coche(b, 'achete_creatures'), 'le joueur peut y vendre les siennes'),
      section('Articles'),
      table(b.articles, [
        ['Sorte', (a, k, rendre) => sel([['objet', 'Objet'], ['creature', 'Créature']], a.sorte, (v) => { a.sorte = v; a.id = ''; if (v === 'creature') a.niveau = 5; else delete a.niveau; rendre(); })],
        ['Article', (a) => refInfo(a, 'id', a.sorte === 'creature' ? 'tafl-creatures' : 'tafl-donnees-objets', a.sorte === 'creature' ? 'créature' : 'potion', descNom(a.sorte === 'creature' ? work.creatures : work.objets)), true],
        ['Niveau', (a) => (a.sorte === 'creature' ? nombreIn(a, 'niveau', 1, 100) : el('span', { className: 'unit', textContent: '' }))],
        ['Prix', (a) => { const i = nombreIn(a, 'prix', 0, 9999999); i.placeholder = String(prixDe(a) ?? ''); i.title = '0 = le prix de l\'objet'; if (!a.prix) i.value = ''; return i; }],
        ['En vente', (a, k, rendre) => {
          const b2 = el('button', { className: `chip cond-chip${a.condition ? ' on' : ''}`, textContent: a.condition ? Events.resumeCondition({ ...doc, data: work }, a.condition) : 'Toujours' });
          b2.onclick = async (e) => {
            e.preventDefault();
            const choix = await Events.choisir([
              { label: 'Toujours en vente', value: 'aucune' },
              null,
              ...Object.entries(Events.CONDITIONS).filter(([k2]) => k2 !== 'local').map(([k2, d2]) => ({ label: `Débloqué si : ${d2.nom}`, value: k2 })),
            ], e.clientX, e.clientY);
            if (!choix) return;
            if (choix === 'aucune') { a.condition = null; rendre(); return; }
            const c = await Events.formCondition({ ...doc, data: work }, a.condition?.type === choix ? a.condition : Events.CONDITIONS[choix].nouveau({ ...doc, data: work }));
            if (c) { a.condition = c; rendre(); }
          };
          return b2;
        }, true],
        ['Grisé avant', (a) => { const c = ctx.coche(a, 'verrouille_visible'); c.title = 'Avant son déblocage, l\'article se montre grisé avec ce qui le débloque (« Après 10 captures ») au lieu d\'être caché'; return c; }],
      ], () => ({ sorte: 'objet', id: '', prix: 0, condition: null, verrouille_visible: false }), { ajouter: '+ Article', vide: 'Boutique vide.', change: ctx.renderListe }),
      info('Un article peut attendre un déblocage : un nombre de captures, de dresseurs battus ou de créatures sauvages battues, d\'évolutions, d\'espèces vues ou attrapées, de quêtes finies (compteurs), une quête, un badge, un interrupteur… « Grisé avant » : le joueur le voit déjà, grisé, avec ce qu\'il lui manque ; sinon il apparaît d\'un coup. Dans Saga, un article tout juste débloqué porte « Nouveau ! ». Une boutique de créatures cachée derrière une quête : un article « créature » avec la condition « quête finie ».'),
      section('Utilisation'),
      ctx.usages('boutique', b.id),
    );
  }

  // --- Pack JRPG : classes, monstres, groupes ---
  // Les statistiques d'un héros au niveau n : celles du niveau 1 + ce qu'il gagne à chaque niveau.
  const aNiveau = (k, n) => Object.fromEntries(STATS_JRPG.map(([s]) => [s, Math.floor(k.stats[s] + k.gains[s] * (n - 1))]));
  function formClasse(k, ctx) {
    const { work, form } = ctx;
    const idl = ctx.idLigne(k);
    const couleur = el('input', { type: 'color', value: k.couleur || '#8a8f98' });
    couleur.oninput = () => { k.couleur = couleur.value; };
    const apercu = el('p', { className: 'modal-info' });
    const majApercu = () => {
      const max = work.reglages.niveau_max || 99;
      apercu.textContent = [10, 30, max].map((n) => `Niveau ${n} : ${STATS_JRPG.map(([s, nom]) => `${nom} ${aNiveau(k, n)[s]}`).join(' · ')}`).join('\n');
      apercu.style.whiteSpace = 'pre-line';
    };
    majApercu();
    form.append(
      champ('Nom', ctx.input(k, 'nom', 'Guerrier, Mage blanc, Voleur…', idl.maj)),
      idl.el,
      el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Couleur' }), couleur, el('span', { className: 'unit', textContent: 'son étiquette dans les menus' })]),
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(k, 'description', 2, 'Ce qu\'elle fait de mieux.')]),
      section('Statistiques au niveau 1'),
      grilleStats(k, 'stats', 9999),
      section('Gagné à chaque niveau'),
      grilleStats(k, 'gains', 999, 0.1),
      apercu,
      el('div', { className: 'field' }, [el('button', { className: 'button small', textContent: 'Recalculer l\'aperçu', onclick: (e) => { e.preventDefault(); majApercu(); } })]),
      section('Compétences apprises par niveau'),
      table(k.competences, [
        ['Niveau', (c) => nombreIn(c, 'niveau', 1, 999)],
        ['Compétence', (c) => refInfo(c, 'competence', 'tafl-attaques', 'soin', descAttaque(work)), true],
      ], () => ({ niveau: (k.competences.at(-1)?.niveau || 0) + 3, competence: '' }), { ajouter: '+ Compétence', vide: 'Aucune : elle ne fait qu\'attaquer.' }),
      info('Un personnage avec cette classe (onglet Personnages) peut rejoindre le groupe (commande « Le groupe : un héros rejoint ou part »). Ses statistiques montent à chaque niveau ; l\'équipement s\'ajoute par-dessus.'),
      section('Utilisation'),
      ctx.usages('classe', k.id),
    );
  }
  function formMonstre(m, ctx) {
    const { work, form } = ctx;
    const idl = ctx.idLigne(m);
    const elements = (cle, titre) => champ(titre, cases(m, cle, work.types.map((t) => [t.id, t.nom]), 'Ajoute des éléments (onglet Éléments).'));
    form.append(
      el('div', { className: 'creature-head' }, [
        blocImage(ctx, m, 'image', 'Image'),
        el('div', { className: 'creature-id' }, [
          champ('Nom', ctx.input(m, 'nom', 'Slime, Gobelin, Dragon…', idl.maj)),
          idl.el,
          el('div', { className: 'field-grid' }, [
            champ('N° du Bestiaire', nombreIn(m, 'numero', 0, 99999)),
            champ('Niveau', nombreIn(m, 'niveau', 1, 999), 'montré dans le Bestiaire'),
            champ('Taille', sel(TAILLES, m.taille, (v) => { m.taille = v; })),
          ]),
          champ('Boss (plus grand, insensible au sommeil et à la paralysie)', ctx.coche(m, 'boss')),
        ]),
      ]),
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Bestiaire' }), ctx.zone(m, 'description', 2, 'Sa description, montrée une fois vaincu.')]),
      section('Statistiques'),
      grilleStats(m, 'stats', 99999),
      section('Éléments'),
      elements('faiblesses', 'Faible contre (×2)'),
      elements('resistances', 'Résiste à (×½)'),
      elements('immunites', 'Insensible à (×0)'),
      champ('Insensible aux statuts', cases(m, 'statuts_immunises', STATUTS_JRPG.slice(1))),
      section('Ce qu\'il fait à son tour'),
      champ('Attaque de base', nombreIn(m, 'poids_attaque', 0, 100), 'poids (chance relative)'),
      table(m.competences, [
        ['Compétence', (c) => refInfo(c, 'competence', 'tafl-attaques', 'feu', descAttaque(work)), true],
        ['Poids', (c) => nombreIn(c, 'poids', 0, 100)],
      ], () => ({ competence: '', poids: 25 }), { ajouter: '+ Compétence', vide: 'Seulement l\'attaque de base.' }),
      section('Récompenses'),
      el('div', { className: 'field-grid' }, [
        champ('Expérience', nombreIn(m, 'xp', 0, 9999999), 'pour chaque héros debout'),
        champ('Or', nombreIn(m, 'or', 0, 9999999), work.reglages.monnaie),
      ]),
      table(m.butin, [
        ['Objet laissé', (b) => refInfo(b, 'objet', 'tafl-donnees-objets', 'potion', descNom(work.objets)), true],
        ['Chance %', (b) => nombreIn(b, 'chance', 1, 100)],
      ], () => ({ objet: '', chance: 10 }), { ajouter: '+ Butin', max: 6, vide: 'Il ne laisse rien.' }),
      section('Utilisation'),
      ctx.usages('monstre', m.id),
    );
  }
  function formGroupe(g, ctx) {
    const { work, form } = ctx;
    const idl = ctx.idLigne(g);
    form.append(
      champ('Nom', ctx.input(g, 'nom', '3 slimes, Gobelins de la forêt…', idl.maj)),
      idl.el,
      champ('On peut fuir', ctx.coche(g, 'fuite'), 'décoche pour un boss'),
      section('Monstres (8 au plus en tout)'),
      table(g.monstres, [
        ['Monstre', (x) => (packDe(work) === 'jdr' ? refInfo(x, 'monstre', 'tafl-monstres-jdr', 'gobelin', (id) => { const m = (work.monstres_jdr || []).find((o) => o.id === id); return m ? el('span', { textContent: `${m.nom} · FP ${m.fp}` }) : null; }) : refInfo(x, 'monstre', 'tafl-monstres', 'slime', descNom(work.monstres))), true],
        ['Combien', (x) => nombreIn(x, 'nombre', 1, 8)],
      ], () => ({ monstre: g.monstres.at(-1)?.monstre || '', nombre: 1 }), { ajouter: '+ Monstre', max: 8, vide: 'Groupe vide.', change: ctx.renderListe }),
      info('Un groupe surgit dans les zones (herbes, grottes : leur table de rencontres) ou par la commande « Combat contre un groupe de monstres » (un boss, une embuscade).'),
      section('Utilisation'),
      ctx.usages('groupe', g.id),
    );
  }

  // La couleur d'accent : un nuancier, et « Celle de Saga » pour revenir à l'orange par défaut.
  function couleurAccent(r, ctx) {
    const entree = el('input', { type: 'color', value: r.interface.accent || '#ffb347' });
    const defaut = el('button', { className: 'button', type: 'button', textContent: 'Celle de Saga (orange)' });
    const maj = () => { defaut.disabled = !r.interface.accent; entree.style.opacity = r.interface.accent ? '1' : '0.45'; };
    entree.addEventListener('input', () => { r.interface.accent = entree.value; maj(); ctx.change?.(); });
    defaut.addEventListener('click', () => { r.interface.accent = ''; entree.value = '#ffb347'; maj(); ctx.change?.(); });
    maj();
    return el('div', { className: 'accent-jeu' }, [entree, defaut]);
  }
  // Les badges : icône (clic = importer), nom, identifiant (il suit le nom tant qu'aucun script ne s'en sert).
  function tableBadges(r, ctx) {
    const sert = (id) => { let oui = false; Events.parcourirJeu(ctx.doc, ({ commande, condition }) => { const c = commande || condition; if (c?.type === 'badge' && c.badge === id) oui = true; }); return oui; };
    return table(r.badges, [
      ['Icône', (b, k, rendre) => {
        const bouton = el('button', { className: 'badge-icone', title: b.icone ? 'Remplacer l\'icône (clic droit : retirer)' : 'Importer une icône (PNG, fond transparent)' }, [b.icone ? el('img', { src: b.icone, alt: '' }) : icon('add')]);
        bouton.onclick = async (e) => {
          e.preventDefault();
          const f = await window.tafl.openFile({ kind: 'image', titre: `Icône du badge ${b.nom}` });
          if (!f) return;
          try { b.icone = (await Events.imagePortrait(f)).png; rendre(); } catch (err) { notify(cleanError(err), 'error'); }
        };
        bouton.oncontextmenu = (e) => { e.preventDefault(); b.icone = ''; rendre(); };
        return bouton;
      }],
      ['Nom', (b) => {
        const code = el('code', { className: 'unit', textContent: b.id });
        const i = el('input', { type: 'text', value: b.nom, placeholder: 'Badge Roche' });
        i.oninput = () => {
          b.nom = i.value;
          const id = Doc.slug(i.value, '');
          if (id && !sert(b.id) && !r.badges.some((o) => o !== b && o.id === id)) { b.id = id; code.textContent = id; }
        };
        return el('span', { className: 'ref-wrap' }, [i, code]);
      }, true],
    ], () => { const nom = `Badge ${r.badges.length + 1}`; return { id: Events.ident(nom, r.badges, 'badge'), nom, icone: '' }; }, { ajouter: '+ Badge', vide: 'Aucun badge pour l\'instant.' });
  }
  // La forme des menus (Saga 0.6) : leurs noms, l'encyclopédie (Pokédex, Bestiaire), les boîtes, les pages du résumé.
  // Chaque champ vide garde ce que donne le pack de règles (montré en gris).
  function formMenus(r, ctx) {
    const m = r.interface.menus, d = FORMES_MENUS[r.regles] || FORMES_MENUS.pokemon;
    const nombre = (key, max) => {
      const i = el('input', { type: 'number', value: m[key] || '', min: 0, max, placeholder: String(d[key]), className: 'num-input' });
      i.oninput = () => { m[key] = i.value === '' ? 0 : clamp(Math.round(Number(i.value)), 0, max); };
      return i;
    };
    const visible = el('input', { type: 'checkbox', checked: m.dex_visible });
    visible.onchange = () => { m.dex_visible = visible.checked; };
    // Les pages du résumé : cochées et dans l'ordre ; rien de coché = celles du pack.
    const pages = el('div', { className: 'menus-pages' });
    const choisies = () => (m.pages.length ? m.pages : d.pages.map(([id]) => id));
    const rendrePages = () => {
      pages.replaceChildren(...d.pages.map(([id, nom]) => {
        const c = el('input', { type: 'checkbox', checked: choisies().includes(id) });
        c.onchange = () => {
          const l = choisies().filter((x) => x !== id);
          if (c.checked) l.push(id);
          // L'ordre est celui du pack ; au moins une page.
          const ordre = d.pages.map(([k]) => k).filter((k) => l.includes(k));
          m.pages = ordre.length ? ordre : [id];
          rendrePages();
        };
        return el('label', { className: 'checkbox-row menus-page' }, [c, el('span', { textContent: nom })]);
      }));
    };
    rendrePages();
    // Tafl 0.32.1 : les mots du pack (Pokédex et PC pour Pokémon ; Bestiaire et Réserve pour un groupe de héros).
    const pokemon = r.regles === 'pokemon';
    const forme = m.forme_boites || d.forme_boites;
    const colonnes = champ('Colonnes (grille)', nombre('colonnes', 12));
    colonnes.hidden = forme !== 'grille';
    const formes = pokemon ? FORMES_BOITES : [['', 'Celle du pack de règles'], ['liste', 'Liste (une ligne par héros)'], ['grille', 'Grille (des cases)']];
    return [
      section('Noms des menus'),
      info('Les noms que Saga affiche. Vide = celui que donne le pack de règles (en gris).'),
      el('div', { className: 'field-grid' }, pokemon ? [
        champ('Menu de l\'équipe', ctx.input(m, 'equipe', d.equipe)),
        champ('Encyclopédie', ctx.input(m, 'dex', d.dex)),
        champ('Ordinateur', ctx.input(m, 'pc', d.pc)),
        champ('Nom d\'une boîte', ctx.input(m, 'boite', d.boite), '« Boîte 1 », « Boîte 2 »…'),
      ] : [
        champ('Le groupe', ctx.input(m, 'equipe', d.equipe)),
        champ('Le bestiaire', ctx.input(m, 'dex', d.dex)),
        champ('Les héros en attente', ctx.input(m, 'pc', d.pc)),
      ]),
      champ(`Montrer le ${m.dex || d.dex} (menu de pause et carnet)`, visible),
      section(pokemon ? 'Les boîtes du PC' : `La ${m.pc || d.pc}`),
      el('div', { className: 'field-grid' }, [
        champ('Forme', sel(formes, m.forme_boites, (v) => { m.forme_boites = v; colonnes.hidden = (v || d.forme_boites) !== 'grille'; })),
        champ(pokemon ? 'Places par boîte' : 'Places', nombre('places', 120)),
        colonnes,
      ]),
      section(pokemon ? 'Pages du résumé d\'une créature' : 'Pages de la fiche d\'un héros'),
      champ('Montrées dans Saga', pages),
    ];
  }
  // Tafl 0.31 : les formules du pack que les scripts JS remplacent (formule() dans Événements › Scripts).
  // Une case les coupe sans toucher au code : Saga reprend alors la formule du pack.
  function formReglesMaison(r, ctx) {
    const formules = BacASable.formulesDuPack(r.regles);
    const inv = ScriptsTafl.connu(ctx.doc);
    const lignes = Object.entries(formules).map(([nom, f]) => {
      const par = inv.formules.find((x) => x.nom === nom);
      const coupee = r.scripts.formules_coupees.includes(nom);
      const c = el('input', { type: 'checkbox', checked: Boolean(par) && !coupee, disabled: !par });
      c.onchange = () => {
        const l = r.scripts.formules_coupees.filter((x) => x !== nom);
        r.scripts.formules_coupees = c.checked ? l : [...l, nom];
        ctx.change?.();
      };
      return el('label', { className: `checkbox-row regle-maison${par ? '' : ' sans'}`, title: f.rend }, [c, el('span', { className: 'regle-maison-nom', textContent: f.nom }),
        el('span', { className: 'unit', textContent: par ? `${coupee ? 'coupée · ' : ''}${par.fichier.replace(/^scripts\//, '')}` : 'formule du pack, pas de script' })]);
    });
    return [
      section('Règles maison (scripts JS)'),
      info(inv.formules.length
        ? 'Ces formules du pack sont remplacées par tes scripts (formule() dans Événements › Scripts). Décoche pour revenir à la formule du pack sans effacer le code.'
        : 'Un script peut remplacer une formule du pack (les dégâts, la fuite, l\'expérience…) : Événements › Scripts › + › « Règle de dégâts maison ». Elles s\'affichent ici, avec une case pour les couper.'),
      el('div', { className: 'regles-maison' }, lignes),
    ];
  }
  // Tafl 0.32.1 : les Réglages en 4 onglets, et seulement ce que le pack de règles du jeu utilise.
  // Les valeurs cachées ne sont pas effacées : revenir au pack les retrouve.
  const ONGLETS_REGLAGES = [['regles', 'Règles du jeu', 'law'], ['partie', 'Partie', 'play'], ['interface', 'Interface', 'symbol-color'], ['ambiance', 'Ambiance', 'color-mode']];
  const PACKS_COURTS = { pokemon: ['Pokémon', 'Créatures à capturer, types, natures, badges, dresseurs.'], jrpg: ['JRPG classique', 'Un groupe de héros (classes, PV, PM, équipement) contre des groupes de monstres.'], jdr: ['JDR (D&D 5e)', 'Création de personnages, tests au d20, sorts, combats à l\'initiative.'] };
  const nomPack = (k) => PACKS_COURTS[k]?.[0] || k;
  let ongletReglages = (() => { try { return localStorage.getItem('tafl.reglagesOnglet') || 'regles'; } catch { return 'regles'; } })();
  function formReglages(r, ctx) {
    if (!ONGLETS_REGLAGES.some(([k]) => k === ongletReglages)) ongletReglages = 'regles';
    const barre = el('div', { className: 'reglages-onglets', role: 'tablist' }, [
      ...ONGLETS_REGLAGES.map(([k, label, ic]) => {
        const b = el('button', { type: 'button', role: 'tab', className: `reglages-onglet${k === ongletReglages ? ' active' : ''}`, ariaSelected: String(k === ongletReglages) }, [icon(ic), el('span', { textContent: label })]);
        b.onclick = (e) => {
          e.preventDefault();
          ongletReglages = k;
          try { localStorage.setItem('tafl.reglagesOnglet', k); } catch { /* sans stockage : l'onglet est oublié */ }
          ctx.form.replaceChildren();
          formReglages(r, ctx);
        };
        return b;
      }),
      el('span', { className: 'reglages-pack', title: 'Le pack de règles du jeu (onglet Règles du jeu)', textContent: `Pack : ${nomPack(r.regles)}` }),
    ]);
    const contenu = { regles: ongletRegles, partie: ongletPartie, interface: ongletInterface, ambiance: ongletAmbiance }[ongletReglages](r, ctx);
    ctx.form.append(barre, ...contenu.filter(Boolean));
    ctx.form.scrollTop = 0;
  }
  function choixPack(r, ctx) {
    const connus = Object.keys(PACKS_COURTS);
    const cartes = [...connus, ...(connus.includes(r.regles) ? [] : [r.regles])].map((k) => {
      const [nom, texte] = PACKS_COURTS[k] || [k, 'Inconnu de ce Tafl (écrit à la main, ou par un Tafl plus récent).'];
      const b = el('button', { type: 'button', className: `pack-carte${k === r.regles ? ' active' : ''}`, ariaPressed: String(k === r.regles) }, [el('span', { className: 'pack-carte-nom', textContent: nom }), el('span', { className: 'pack-carte-texte', textContent: texte })]);
      b.onclick = (e) => {
        e.preventDefault();
        if (k === r.regles) return;
        const avant = r.regles;
        r.regles = k;
        // Un groupe JRPG ou JDR se bat à 4 ; Pokémon à 6.
        if (k !== 'pokemon' && r.equipe_max === 6) r.equipe_max = 4;
        if (k === 'pokemon' && r.equipe_max === 4) r.equipe_max = 6;
        if (!r.monnaie || r.monnaie === MONNAIES_PACK[avant]) r.monnaie = MONNAIES_PACK[k] || r.monnaie;
        ctx.render();
      };
      return b;
    });
    return [
      section('Le pack de règles'),
      info('Il décide des combats, des personnages qui se battent et des statistiques ; Saga le suit. Les onglets du groupe Combat et les réglages ci-dessous changent avec lui. Changer de pack ne touche ni aux cartes, ni aux événements, ni aux quêtes, et ne perd aucun réglage.'),
      el('div', { className: 'pack-cartes' }, cartes),
    ];
  }
  function ongletRegles(r, ctx) {
    const groupe = r.regles !== 'pokemon';
    const out = [...choixPack(r, ctx)];
    if (r.regles === 'pokemon') out.push(...reglesPokemon(r, ctx));
    if (groupe && PACKS_COURTS[r.regles]) {
      out.push(
        section('Le groupe de héros'),
        el('div', { className: 'field-grid' }, [
          champ('Héros qui se battent', nombreIn(r, 'equipe_max', 1, 8), 'les autres attendent dans la Réserve'),
          champ('Niveau maximum', r.regles === 'jdr' ? niveauMaxJdr(r) : nombreIn(r, 'niveau_max', 1, 999), r.regles === 'jdr' ? '20 au plus' : ''),
        ]),
        r.regles === 'jrpg' ? champ('Expérience', sel(COURBES_XP, r.courbe_xp, (v) => { r.courbe_xp = v; }), 'ce qu\'il faut pour chaque niveau') : null,
      );
    }
    if (r.regles === 'jrpg') {
      out.push(
        info('Les héros sont dans l\'onglet Personnages (classe, niveau, équipement de départ) ; ils rejoignent et quittent le groupe par la commande « Le groupe ». Pas de capture : le Bestiaire se remplit en battant les monstres.'),
        el('div', { className: 'field' }, [el('button', { className: 'button small', textContent: 'Ajouter des données d\'exemple (4 classes, 16 compétences, 10 monstres, équipement)', onclick: (e) => { e.preventDefault(); const n = ajouterExemple(ctx.work); ctx.render(); notify(n ? `${n} éléments d'exemple ajoutés : à modifier ou supprimer comme tu veux. Valide pour les garder.` : 'Les données d\'exemple sont déjà là.', 'success'); } })]),
      );
    }
    if (r.regles === 'jdr' && J) out.push(...J.formRegles(r, ctx));
    out.push(...formReglesMaison(r, ctx));
    return out;
  }
  // Le JDR s'arrête au niveau 20 (Saga borne niveau_max) : on montre ce que Saga utilisera, sans toucher au 99 des autres packs.
  function niveauMaxJdr(r) {
    const i = el('input', { type: 'number', value: Math.min(20, r.niveau_max), min: 1, max: 20, className: 'num-input' });
    i.oninput = () => { if (i.value !== '') r.niveau_max = clamp(Math.round(Number(i.value)), 1, 20); };
    return i;
  }
  // Tout ce qui ne sert qu'au pack Pokémon : l'équipe, les badges et le niveau maximum, dresseurs, sauvages, amitié, natures.
  function reglesPokemon(r, ctx) {
    const natures = el('table', { className: 'natures' }, [
      el('tr', {}, [el('th', { textContent: 'Nature' }), el('th', { textContent: '+10 %' }), el('th', { textContent: '−10 %' })]),
      ...NATURES.map(([, n, p, m]) => el('tr', {}, [el('td', { textContent: n }), el('td', { textContent: p ? libelleStat(p) : '—' }), el('td', { textContent: m ? libelleStat(m) : '—' })])),
    ]);
    return [
      section('L\'équipe'),
      el('div', { className: 'field-grid' }, [
        champ('Créatures dans l\'équipe', nombreIn(r, 'equipe_max', 1, 12), 'les autres vont dans le PC'),
        champ('Chance d\'une chromatique', nombreIn(r, 'chance_chromatique', 0, 100000), '1 sur… (0 = jamais)'),
        champ('Amitié pour évoluer', nombreIn(r, 'seuil_amitie', 1, 255), 'sur 255 (220 dans les jeux officiels)'),
      ]),
      info('Chaque créature a une amitié de 0 à 255 : elle monte en gagnant des niveaux, en marchant avec le joueur, avec les vitamines et les objets « Fait monter l\'amitié », et baisse un peu quand la créature tombe K.O. Une évolution « Par amitié » se fait à la montée de niveau quand l\'amitié atteint ce seuil.'),
      section('Badges'),
      info('Les badges que le joueur gagne (commande « Donner un badge »). Saga les montre dans le carnet, avec leur icône. Leur nombre fait monter le niveau maximum de l\'équipe et celui des dresseurs qui s\'ajustent.'),
      tableBadges(r, ctx),
      section('Niveau maximum selon les badges'),
      info('Les créatures du joueur ne dépassent pas ce niveau tant qu\'il n\'a pas assez de badges : l\'aventure reste un défi.'),
      table(r.plafonds, [
        ['Badges', (p) => nombreIn(p, 'badges', 0, 99)],
        ['Niveau max', (p) => nombreIn(p, 'niveau', 1, 100)],
      ], () => ({ badges: (r.plafonds.at(-1)?.badges ?? -1) + 1, niveau: Math.min(100, (r.plafonds.at(-1)?.niveau || 10) + 5) }), { ajouter: '+ Palier', vide: 'Aucun plafond : jusqu\'au niveau 100.' }),
      section('Niveau des dresseurs'),
      el('div', { className: 'field-grid' }, [
        champ('Les dresseurs s\'ajustent', sel(AJUSTEMENTS, r.ajustement, (v) => { r.ajustement = v; })),
        champ('Écart', nombreIn(r, 'ecart', -20, 20), 'niveaux en plus (ou en moins)'),
      ]),
      info('Pour les dresseurs qui ont « son équipe suit le niveau du joueur » : leur niveau devient celui de la référence (+ l\'écart), sans jamais descendre sous le niveau écrit dans leur équipe.'),
      champ('Ils évoluent avec leur niveau', ctx.coche(r, 'evolution_dresseurs'), 'un Bulbizarre monté au niveau 40 devient Florizarre'),
      section('Niveau des créatures sauvages'),
      el('div', { className: 'field-grid' }, [
        champ('Les sauvages s\'ajustent', sel(AJUSTEMENTS_SAUVAGES, r.ajustement_sauvages, (v) => { r.ajustement_sauvages = v; })),
        champ('Écart', nombreIn(r, 'ecart_sauvages', -20, 20), 'le haut de la fourchette vaut la référence plus cet écart'),
      ]),
      info('« Jamais » par défaut. Toute la fourchette d\'une zone monte (une zone 3 à 5, référence 20, écart −2 : niveaux 16 à 18), sans descendre sous ce qu\'écrit la zone. Un combat contre une créature précise (un légendaire) garde son niveau.'),
      champ('Elles évoluent avec leur niveau', ctx.coche(r, 'evolution_sauvages'), 'un Rattata monté au niveau 25 devient Rattatac'),
      section('Les 25 natures'),
      el('details', { className: 'reglages-details' }, [
        el('summary', { textContent: 'Celles du jeu officiel : voir le tableau' }),
        info('Une menthe (objet « Change l\'effet de la nature ») remplace l\'effet sur les statistiques, comme dans les jeux récents.'),
        natures,
      ]),
    ];
  }
  function ongletPartie(r, ctx) {
    const pokemon = r.regles === 'pokemon';
    const out = [
      info('Ce que le joueur a en commençant une partie, et comment Saga la sauvegarde.'),
      section('Argent'),
      el('div', { className: 'field-grid' }, [
        champ('Monnaie', ctx.input(r, 'monnaie', MONNAIES_PACK[r.regles] || 'Or'), r.regles === 'jdr' ? 'les boutiques, le butin des monstres, les commandes' : ''),
        champ('Argent de départ', nombreIn(r, 'argent_depart', 0, 9999999)),
      ]),
    ];
    // Un jeu d'un autre pack qui a déjà des badges les garde (la commande « Donner un badge » reste là).
    if (!pokemon && r.badges.length) {
      out.push(
        section('Badges'),
        info(`Ton jeu a des badges, mais le pack ${nomPack(r.regles)} ne s'en sert pas pour les niveaux : ce sont de simples récompenses, montrées dans le carnet. Retire-les tous pour ne plus les voir.`),
        tableBadges(r, ctx),
      );
    }
    out.push(...formSauvegarde(r, ctx));
    return out;
  }
  function ongletInterface(r, ctx) {
    return [
      info('L\'allure du jeu quand on joue dans Saga. Le joueur peut aussi forcer le thème dans les réglages de Saga.'),
      section('Style'),
      champ('Thème', sel(THEMES, r.interface.theme, (v) => { r.interface.theme = v; ctx.change?.(); })),
      champ('Couleur d\'accent', couleurAccent(r, ctx), 'les noms dans les dialogues, les curseurs, la barre d\'XP'),
      ...formMenus(r, ctx),
    ];
  }
  function ongletAmbiance(r, ctx) { return formAmbiance(r, ctx); }


  // Réglages › Jour et nuit, Musique et sons, Sauvegarde auto (Tafl 0.29, joués par Saga 0.11).
  function formAmbiance(r, ctx) {
    const t = r.temps, a = r.audio;
    const doc = ctx.doc;
    const lignesTemps = el('div', { className: 'field-grid' }, [
      champ('Une journée dure', nombreIn(t, 'duree_jour', 1, 1440), 'minutes de jeu'),
      champ('Heure au départ', nombreIn(t, 'heure_depart', 0, 23), 'h'),
    ]);
    const majTemps = () => { lignesTemps.hidden = t.horloge !== 'jeu'; };
    majTemps();
    const musique = (cle, label, aide) => champ(label, Sons.choix(doc, a[cle], { mots: [['', aide]], change: (v) => { a[cle] = v; } }).element);
    return [
      section('Jour et nuit'),
      info('Saga assombrit les cartes extérieures la nuit (bleu nuit), les dore à l\'aube et au couchant. Les intérieurs ne changent pas ; une carte peut aussi ne pas suivre le jour et la nuit (Carte › Ambiance). Les tuiles et les événements qui ont une lumière brillent quand il fait sombre. Les pages et les « si » peuvent dépendre du moment (condition « Le moment de la journée »).'),
      champ('Horloge', sel(HORLOGES, t.horloge, (v) => { t.horloge = v; majTemps(); })),
      lignesTemps,
      section('Musique et sons'),
      info('Les sons sont des fichiers du dossier sons/ du jeu (MP3, OGG, WAV…) : + en ajoute, ▶ en écoute un. La musique de chaque carte se choisit dans Carte › Ambiance. Sans fichier, Saga joue ses propres bruitages (des petits « bips ») ; « Aucun » les fait taire.'),
      musique('musique_combat', 'Musique des combats', 'Aucune (la musique de la carte continue)'),
      r.regles === 'pokemon' ? musique('musique_dresseur', 'Contre un dresseur', 'Celle des combats') : null,
      musique('musique_victoire', 'Fanfare de victoire', 'Aucune'),
      ...SONS_INTEGRES.map(([k, label]) => champ(label, Sons.choix(doc, a.sons[k], { mots: [['', 'Son intégré de Saga'], ['aucun', 'Aucun']], change: (v) => { a.sons[k] = v; } }).element)),
    ].filter(Boolean);
  }
  // Réglages › Partie › Sauvegarde auto.
  function formSauvegarde(r, ctx) {
    const auto = r.sauvegarde_auto;
    const lignesAuto = el('div', { className: 'field-grid' }, [
      champ('En changeant de carte', ctx.coche(auto, 'carte')),
      champ('Toutes les', nombreIn(auto, 'minutes', 0, 120), 'minutes (0 = jamais)'),
    ]);
    const cocheAuto = ctx.coche(auto, 'active');
    const majAuto = () => { lignesAuto.hidden = !auto.active; };
    cocheAuto.addEventListener('change', majAuto);
    majAuto();
    return [
      section('Sauvegarde auto'),
      info('Saga sauvegarde tout seul, dans une place à part : la sauvegarde du joueur (Ctrl+S, la pause) n\'est jamais écrasée. Il attend que le joueur soit libre (pas en plein dialogue ni en combat). À l\'ouverture du jeu, il propose la plus récente des deux.'),
      champ('Sauvegarder tout seul', cocheAuto),
      lignesAuto,
    ];
  }

  // --- Pack JRPG : des données d'exemple pour commencer (Réglages › bouton) ---
  // Des petits monstres en pixel art 16 × 16, dessinés en 32 × 32 : o contour, b corps, l reflet,
  // e blanc de l'œil, p pupille, w ventre ou pied.
  const DESSINS = {
    blob: ['', '', '', '', '......oooo', '....oobbbboo', '...obllbbbbbo', '..oblbbbbbbbbo', '..obbeebbbeebo', '.obbbepbbbepbbo', '.obbbbbbbbbbbbo', '.obbbbboobbbbbo', '.obbbbbbbbbbbbo', '..obbbbbbbbbbo', '...oooooooooo'],
    ailes: ['', '', '', 'o..............o', 'oo....o..o....oo', 'obo...oooo...obo', 'obbo.obbbbo.obbo', 'obbbobeppebobbbo', 'obbbbbbbbbbbbbbo', '.obbbbbbbbbbbbo', '..obbobbbbobbo', '...oo.obbo.oo', '......oooo'],
    humain: ['', '.....oooooo', '....obbbbbbo', '....obepbepo', '....obbbbbbo', '....obboobbo', '.....oobboo', '...oowwwwwwoo', '..obowwwwwwobo', '..obowwwwwwobo', '..oo.owwwwo.oo', '.....obbbbo', '.....obooboo', '.....obo.obo', '.....obo.obo', '.....oo...oo'],
    bete: ['', '', '............oo', '...........obbo', '...oooooooobbbo', '..obbbbbbbbbpebo', '.obbbbbbbbbbbbbo', 'obbbbbbbbbbbooo', '.obwwwwwwwwbo', '..obbbbbbbbbo', '..obo.obo.obo', '..obo.obo.obo', '..oo..oo..oo'],
    champignon: ['', '.....oooooo', '...oobbbbbboo', '..obblbbbblbbo', '.obbbbbbbbbbbbo', '.oblbbbbbblbbbo', '.oooooooooooooo', '....owwwwwwo', '....owepwepo', '....owwwwwwo', '....owwoowwo', '....owwwwwwo', '.....oooooo'],
  };
  const teinte = (hex, k) => { const [r, g, b] = hexToRgba(hex); const f = (v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)).toString(16).padStart(2, '0'); return `#${f(r)}${f(g)}${f(b)}`; };
  function dessinMonstre(forme, couleur) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    const couleurs = { o: teinte(couleur, -0.6), b: couleur, l: teinte(couleur, 0.45), e: '#ffffff', p: '#16161c', w: teinte(couleur, 0.6) };
    DESSINS[forme].forEach((ligne, y) => [...ligne.padEnd(16, '.').slice(0, 16)].forEach((ch, x) => {
      if (!couleurs[ch]) return;
      g.fillStyle = couleurs[ch];
      g.fillRect(x * 2, y * 2, 2, 2);
    }));
    return c.toDataURL('image/png');
  }
  const EXEMPLE = {
    types: [
      { id: 'feu', nom: 'Feu', couleur: '#f0803c' }, { id: 'glace', nom: 'Glace', couleur: '#78c8f0' },
      { id: 'foudre', nom: 'Foudre', couleur: '#f8d030' }, { id: 'lumiere', nom: 'Lumière', couleur: '#f4f0c8' },
      { id: 'tenebres', nom: 'Ténèbres', couleur: '#705898' },
    ],
    attaques: [
      { id: 'brasier', nom: 'Brasier', type: 'feu', categorie: 'speciale', puissance: 90, cout_pm: 4, description: 'Une boule de feu sur un ennemi.' },
      { id: 'glacier', nom: 'Glacier', type: 'glace', categorie: 'speciale', puissance: 90, cout_pm: 4, description: 'Des éclats de glace sur un ennemi.' },
      { id: 'eclair', nom: 'Éclair', type: 'foudre', categorie: 'speciale', puissance: 90, cout_pm: 4, description: 'La foudre frappe un ennemi.' },
      { id: 'fournaise', nom: 'Fournaise', type: 'feu', categorie: 'speciale', puissance: 70, cout_pm: 10, cible: 'adversaires', description: 'Le feu sur tous les ennemis.' },
      { id: 'lumiere-sacree', nom: 'Lumière sacrée', type: 'lumiere', categorie: 'speciale', puissance: 110, cout_pm: 8, description: 'Terrible contre les morts-vivants.' },
      { id: 'soin', nom: 'Soin', categorie: 'statut', puissance: 0, cout_pm: 4, cible: 'allie', soin: 30, description: 'Rend des PV à un allié.' },
      { id: 'soin-groupe', nom: 'Soin de groupe', categorie: 'statut', puissance: 0, cout_pm: 12, cible: 'equipe', soin: 25, description: 'Rend des PV à tout le groupe.' },
      { id: 'resurrection', nom: 'Résurrection', categorie: 'statut', puissance: 0, cout_pm: 15, cible: 'allie', ranime: true, soin: 20, description: 'Ranime un allié K.O.' },
      { id: 'purification', nom: 'Purification', categorie: 'statut', puissance: 0, cout_pm: 3, cible: 'allie', guerit: ['tous'], description: 'Guérit tous les statuts d\'un allié.' },
      { id: 'protection', nom: 'Protection', categorie: 'statut', puissance: 0, cout_pm: 5, cible: 'allie', stats: [{ stat: 'defense', etages: 2 }], description: 'Monte la Défense d\'un allié.' },
      { id: 'berceuse', nom: 'Berceuse', categorie: 'statut', puissance: 0, precision: 80, cout_pm: 5, cible: 'adversaires', statut: 'sommeil', chance_statut: 60, description: 'Endort les ennemis.' },
      { id: 'mutisme', nom: 'Mutisme', categorie: 'statut', puissance: 0, precision: 90, cout_pm: 4, statut: 'silence', chance_statut: 80, description: 'Empêche un ennemi de lancer des sorts.' },
      { id: 'cri-de-guerre', nom: 'Cri de guerre', categorie: 'statut', puissance: 0, cout_pm: 4, cible: 'soi', stats: [{ stat: 'force', etages: 2 }], stats_cible: 'soi', description: 'Monte sa Force.' },
      { id: 'frappe-lourde', nom: 'Frappe lourde', categorie: 'physique', puissance: 160, precision: 85, cout_pm: 6, critique: 1, description: 'Un coup puissant, un peu moins précis.' },
      { id: 'tourbillon', nom: 'Tourbillon', categorie: 'physique', puissance: 70, cout_pm: 8, cible: 'adversaires', description: 'Frappe tous les ennemis.' },
      { id: 'lame-empoisonnee', nom: 'Lame empoisonnée', categorie: 'physique', puissance: 90, cout_pm: 3, statut: 'poison', chance_statut: 50, description: 'Peut empoisonner.' },
      { id: 'morsure-venin', nom: 'Morsure venimeuse', categorie: 'physique', puissance: 80, statut: 'poison', chance_statut: 30 },
      { id: 'souffle-ardent', nom: 'Souffle ardent', type: 'feu', categorie: 'speciale', puissance: 60, cout_pm: 3, cible: 'adversaires' },
      { id: 'spores', nom: 'Spores', categorie: 'statut', puissance: 0, precision: 75, cout_pm: 2, statut: 'sommeil', chance_statut: 70 },
      { id: 'encre', nom: 'Nuage d\'encre', categorie: 'statut', puissance: 0, precision: 85, statut: 'cecite', chance_statut: 80 },
    ],
    classes: [
      { id: 'guerrier', nom: 'Guerrier', couleur: '#d05040', description: 'Solide et fort, il protège le groupe.', stats: { pv: 45, pm: 4, force: 13, magie: 4, defense: 11, esprit: 5, agilite: 7, chance: 6 }, gains: { pv: 11, pm: 1, force: 2.5, magie: 0.5, defense: 2, esprit: 1, agilite: 1.2, chance: 1 },
        competences: [{ niveau: 2, competence: 'cri-de-guerre' }, { niveau: 4, competence: 'frappe-lourde' }, { niveau: 8, competence: 'tourbillon' }] },
      { id: 'mage-noir', nom: 'Mage noir', couleur: '#6a5acd', description: 'Fragile, mais sa magie frappe fort.', stats: { pv: 26, pm: 14, force: 5, magie: 14, defense: 5, esprit: 10, agilite: 8, chance: 6 }, gains: { pv: 6, pm: 3.5, force: 0.8, magie: 2.8, defense: 1, esprit: 2, agilite: 1.4, chance: 1 },
        competences: [{ niveau: 1, competence: 'brasier' }, { niveau: 3, competence: 'glacier' }, { niveau: 5, competence: 'eclair' }, { niveau: 7, competence: 'mutisme' }, { niveau: 10, competence: 'fournaise' }] },
      { id: 'mage-blanc', nom: 'Mage blanc', couleur: '#f0f0f0', description: 'Elle soigne, protège et ranime.', stats: { pv: 30, pm: 14, force: 6, magie: 12, defense: 6, esprit: 12, agilite: 7, chance: 7 }, gains: { pv: 7, pm: 3.2, force: 1, magie: 2.4, defense: 1.2, esprit: 2.4, agilite: 1.2, chance: 1 },
        competences: [{ niveau: 1, competence: 'soin' }, { niveau: 3, competence: 'purification' }, { niveau: 4, competence: 'protection' }, { niveau: 6, competence: 'lumiere-sacree' }, { niveau: 8, competence: 'soin-groupe' }, { niveau: 12, competence: 'resurrection' }] },
      { id: 'voleur', nom: 'Voleur', couleur: '#40a060', description: 'Rapide et chanceux : il frappe le premier.', stats: { pv: 34, pm: 6, force: 10, magie: 6, defense: 7, esprit: 6, agilite: 13, chance: 12 }, gains: { pv: 8, pm: 1.5, force: 2, magie: 0.8, defense: 1.4, esprit: 1, agilite: 2.6, chance: 2 },
        competences: [{ niveau: 2, competence: 'lame-empoisonnee' }, { niveau: 5, competence: 'berceuse' }] },
    ],
    objets: [
      { id: 'potion', nom: 'Potion', categorie: 'soin', prix: 50, description: 'Rend 50 PV.', effet: { type: 'soin', valeur: 50 } },
      { id: 'ether', nom: 'Éther', categorie: 'soin', prix: 150, description: 'Rend 20 PM.', effet: { type: 'soin_pm', valeur: 20 } },
      { id: 'queue-de-phenix', nom: 'Queue de phénix', categorie: 'soin', prix: 300, description: 'Ranime un héros K.O. avec un quart de ses PV.', effet: { type: 'rappel', valeur: 25 } },
      { id: 'antidote', nom: 'Antidote', categorie: 'soin', prix: 40, description: 'Guérit le poison.', effet: { type: 'soin_statut', statut: 'poison' } },
      { id: 'remede', nom: 'Remède', categorie: 'soin', prix: 120, description: 'Guérit tous les statuts.', effet: { type: 'soin_statut', statut: 'tous' } },
      { id: 'epee-courte', nom: 'Épée courte', categorie: 'arme', prix: 120, equipement: { place: 'arme', bonus: { force: 5 }, classes: ['guerrier', 'voleur'] } },
      { id: 'epee-de-flamme', nom: 'Épée de flamme', categorie: 'arme', prix: 900, equipement: { place: 'arme', bonus: { force: 10 }, element: 'feu', classes: ['guerrier'] } },
      { id: 'dague', nom: 'Dague', categorie: 'arme', prix: 90, equipement: { place: 'arme', bonus: { force: 3, agilite: 2 }, classes: ['voleur', 'mage-noir'] } },
      { id: 'baton', nom: 'Bâton', categorie: 'arme', prix: 80, equipement: { place: 'arme', bonus: { force: 1, magie: 4 }, classes: ['mage-noir', 'mage-blanc'] } },
      { id: 'bouclier-de-bois', nom: 'Bouclier de bois', categorie: 'bouclier', prix: 60, equipement: { place: 'bouclier', bonus: { defense: 3 }, classes: ['guerrier'] } },
      { id: 'casque-de-cuir', nom: 'Casque de cuir', categorie: 'casque', prix: 50, equipement: { place: 'casque', bonus: { defense: 1, pv: 5 } } },
      { id: 'chapeau-pointu', nom: 'Chapeau pointu', categorie: 'casque', prix: 70, equipement: { place: 'casque', bonus: { magie: 2, esprit: 2 }, classes: ['mage-noir', 'mage-blanc'] } },
      { id: 'tunique', nom: 'Tunique', categorie: 'armure', prix: 60, equipement: { place: 'armure', bonus: { defense: 3 } } },
      { id: 'cotte-de-mailles', nom: 'Cotte de mailles', categorie: 'armure', prix: 400, equipement: { place: 'armure', bonus: { defense: 8, agilite: -1 }, classes: ['guerrier'] } },
      { id: 'robe-de-soie', nom: 'Robe de soie', categorie: 'armure', prix: 250, equipement: { place: 'armure', bonus: { defense: 3, esprit: 4, pm: 5 }, classes: ['mage-noir', 'mage-blanc'] } },
      { id: 'anneau-de-vitesse', nom: 'Anneau de vitesse', categorie: 'accessoire', prix: 500, equipement: { place: 'accessoire', bonus: { agilite: 5 } } },
    ],
    // [id, nom, forme du dessin, couleur, taille, autres champs]
    monstres: [
      ['slime', 'Slime', 'blob', '#5cc85c', 'petit', { niveau: 1, stats: { pv: 18, force: 7, defense: 4, agilite: 5 }, xp: 4, or: 3, faiblesses: ['feu'], butin: [{ objet: 'potion', chance: 15 }], description: 'Une goutte gluante et curieuse.' }],
      ['chauve-souris', 'Chauve-souris', 'ailes', '#8a60b0', 'petit', { niveau: 2, stats: { pv: 16, force: 8, defense: 3, agilite: 12 }, xp: 5, or: 4, faiblesses: ['foudre'], competences: [{ competence: 'encre', poids: 15 }], description: 'Elle aveugle ses proies avant de mordre.' }],
      ['gobelin', 'Gobelin', 'humain', '#7aa040', 'moyen', { niveau: 3, stats: { pv: 30, force: 10, defense: 6, agilite: 7, chance: 5 }, xp: 8, or: 12, butin: [{ objet: 'dague', chance: 8 }, { objet: 'potion', chance: 20 }], description: 'Petit voleur des bois.' }],
      ['loup', 'Loup gris', 'bete', '#8c8c98', 'moyen', { niveau: 4, stats: { pv: 34, force: 12, defense: 6, agilite: 11 }, xp: 10, or: 6, faiblesses: ['feu'], description: 'Il chasse en meute.' }],
      ['champignon', 'Champi-dodo', 'champignon', '#d04848', 'petit', { niveau: 3, stats: { pv: 26, force: 8, magie: 8, defense: 6, esprit: 6, agilite: 4 }, xp: 7, or: 5, faiblesses: ['feu'], competences: [{ competence: 'spores', poids: 30 }], butin: [{ objet: 'antidote', chance: 25 }], description: 'Ses spores endorment.' }],
      ['serpent', 'Serpent des marais', 'bete', '#4a9a70', 'moyen', { niveau: 5, stats: { pv: 38, force: 13, defense: 7, agilite: 10 }, xp: 13, or: 9, faiblesses: ['glace'], competences: [{ competence: 'morsure-venin', poids: 35 }], butin: [{ objet: 'antidote', chance: 30 }], description: 'Sa morsure empoisonne.' }],
      ['feu-follet', 'Feu follet', 'blob', '#f09030', 'petit', { niveau: 6, stats: { pv: 32, pm: 30, force: 6, magie: 14, defense: 5, esprit: 12, agilite: 12 }, xp: 15, or: 14, faiblesses: ['glace'], immunites: ['feu'], competences: [{ competence: 'brasier', poids: 40 }], poids_attaque: 20, butin: [{ objet: 'ether', chance: 15 }], description: 'Une flamme qui danse… et qui brûle.' }],
      ['squelette', 'Squelette', 'humain', '#e8e4d8', 'moyen', { niveau: 7, stats: { pv: 48, force: 15, defense: 10, esprit: 4, agilite: 6 }, xp: 18, or: 16, faiblesses: ['lumiere', 'feu'], resistances: ['glace'], statuts_immunises: ['poison', 'sommeil'], butin: [{ objet: 'casque-de-cuir', chance: 10 }], description: 'Un mort qui ne veut pas dormir.' }],
      ['golem', 'Golem', 'humain', '#a08870', 'grand', { niveau: 9, stats: { pv: 120, force: 20, defense: 18, esprit: 6, agilite: 3 }, xp: 40, or: 50, faiblesses: ['foudre'], resistances: ['feu', 'glace'], statuts_immunises: ['poison'], competences: [{ competence: 'frappe-lourde', poids: 20 }], butin: [{ objet: 'cotte-de-mailles', chance: 15 }], description: 'Lent, mais il frappe comme un rocher.' }],
      ['dragon', 'Dragon rouge', 'bete', '#d03028', 'grand', { niveau: 15, boss: true, stats: { pv: 600, pm: 99, force: 26, magie: 22, defense: 16, esprit: 14, agilite: 10, chance: 8 }, xp: 300, or: 500, faiblesses: ['glace'], immunites: ['feu'], competences: [{ competence: 'souffle-ardent', poids: 35 }, { competence: 'cri-de-guerre', poids: 10 }], poids_attaque: 55, butin: [{ objet: 'epee-de-flamme', chance: 100 }], description: 'Le gardien de la montagne.' }],
    ],
    groupes: [
      { id: 'slime', nom: 'Un slime', monstres: [{ monstre: 'slime', nombre: 1 }] },
      { id: 'slimes', nom: 'Trois slimes', monstres: [{ monstre: 'slime', nombre: 3 }] },
      { id: 'chauves-souris', nom: 'Chauves-souris', monstres: [{ monstre: 'chauve-souris', nombre: 2 }] },
      { id: 'gobelins', nom: 'Gobelins et slime', monstres: [{ monstre: 'gobelin', nombre: 2 }, { monstre: 'slime', nombre: 1 }] },
      { id: 'meute', nom: 'Meute de loups', monstres: [{ monstre: 'loup', nombre: 3 }] },
      { id: 'foret', nom: 'Forêt profonde', monstres: [{ monstre: 'champignon', nombre: 2 }, { monstre: 'serpent', nombre: 1 }] },
      { id: 'crypte', nom: 'Crypte', monstres: [{ monstre: 'squelette', nombre: 2 }, { monstre: 'feu-follet', nombre: 1 }] },
      { id: 'golem', nom: 'Golem', monstres: [{ monstre: 'golem', nombre: 1 }] },
      { id: 'dragon', nom: 'Le dragon (boss)', monstres: [{ monstre: 'dragon', nombre: 1 }], fuite: false },
    ],
    // Trois compagnons ; le héros, s'il n'a pas de classe, devient guerrier.
    personnages: [
      { id: 'mira', nom: 'Mira', description: 'Mage blanche, douce et têtue.', couleur: '#f4a6c8', classe: 'mage-blanc', niveau: 1, equipement: { arme: 'baton', armure: 'tunique' } },
      { id: 'kael', nom: 'Kael', description: 'Mage noir un peu trop sûr de lui.', couleur: '#8c7ae6', classe: 'mage-noir', niveau: 1, equipement: { arme: 'baton', casque: 'chapeau-pointu' } },
      { id: 'sly', nom: 'Sly', description: 'Voleur au grand cœur.', couleur: '#5cd68a', classe: 'voleur', niveau: 1, equipement: { arme: 'dague', armure: 'tunique' } },
    ],
  };
  // Ajoute à `work` (les données en cours) ce qui manque de l'exemple ; rend le nombre d'éléments ajoutés.
  function ajouterExemple(work) {
    let n = 0;
    const ajouter = (sorte, o, norme) => {
      if (work[sorte].some((x) => x.id === o.id)) return;
      work[sorte].push(norme(o, work[sorte].length));
      n++;
    };
    for (const sorte of ['types', 'attaques', 'classes', 'objets', 'groupes']) for (const o of EXEMPLE[sorte]) ajouter(sorte, o, NORMES[sorte]);
    EXEMPLE.monstres.forEach(([id, nom, forme, couleur, taille, reste], k) => ajouter('monstres', { id, nom, numero: k + 1, taille, image: dessinMonstre(forme, couleur), ...reste }, NORMES.monstres));
    for (const p of EXEMPLE.personnages) {
      if (work.personnages.some((x) => x.id === p.id)) continue;
      work.personnages.push({ description: '', heros: false, tuile: -1, portraits: [], sprite: null, tenues: [], ...p });
      n++;
    }
    const heros = work.personnages.find((p) => p.heros);
    if (heros && !heros.classe) { heros.classe = 'guerrier'; heros.niveau = heros.niveau || 1; heros.equipement = { arme: 'epee-courte', bouclier: 'bouclier-de-bois', armure: 'tunique' }; n++; }
    return n;
  }

  const leadImage = (src) => el('img', { className: 'row-portrait pixel', src, alt: '' });
  const ONGLETS = [
    { key: 'types', packs: ['pokemon', 'jrpg'], groupe: 'Combat', label: 'Types', labels: { jrpg: 'Éléments' }, icon: 'symbol-color', kind: 'type', base: 'Nouveau type', nouveau: (id) => NORMES.types({ id, nom: 'Nouveau type' }), meta: () => '', lead: (t) => el('span', { className: 'row-dot', style: { background: t.couleur || COULEUR_TYPE } }), vide: 'Aucun type. Le plus simple : « Importer les données officielles » (les 18 types et leur table).', form: formType },
    { key: 'talents', packs: ['pokemon'], groupe: 'Combat', label: 'Talents', icon: 'sparkle', kind: 'talent', base: 'Nouveau talent', nouveau: (id) => NORMES.talents({ id, nom: 'Nouveau talent' }), meta: () => '', vide: 'Aucun talent.', form: formTalent },
    { key: 'attaques', packs: ['pokemon', 'jrpg'], groupe: 'Combat', label: 'Attaques', labels: { jrpg: 'Compétences' }, icon: 'flame', kind: 'attaque', base: 'Nouvelle attaque', nouveau: (id) => NORMES.attaques({ id, nom: 'Nouvelle attaque', puissance: 40 }), meta: (a, work) => (packDe(work) === 'jrpg' ? [work.types.find((t) => t.id === a.type)?.nom || '', `${a.cout_pm} PM`].filter(Boolean).join(' · ') : [work.types.find((t) => t.id === a.type)?.nom || '', a.puissance || ''].filter(Boolean).join(' · ')), vide: 'Aucune attaque.', form: formAttaque },
    { key: 'creatures', packs: ['pokemon'], groupe: 'Combat', label: 'Créatures', icon: 'bug', kind: 'creature', base: 'Nouvelle créature', nouveau: (id, work) => NORMES.creatures({ id, nom: 'Nouvelle créature', numero: Math.max(0, ...work.creatures.map((c) => c.numero)) + 1, types: work.types[0] ? [work.types[0].id] : [] }), meta: (c) => `#${String(c.numero).padStart(3, '0')}${c.legendaire ? ' ★' : ''}`, lead: (c) => (c.sprites.face ? leadImage(c.sprites.face) : null), vide: 'Aucune créature. Importe les officielles, ou crée les tiennes : sprites de face et de dos, types, statistiques, évolutions, attaques.', form: formCreature },
    { key: 'objets', groupe: 'Combat', label: 'Objets', icon: 'package', kind: 'objet', base: 'Nouvel objet', nouveau: (id) => NORMES.objets({ id, nom: 'Nouvel objet', prix: 100 }), meta: (o) => CATEGORIES_OBJET.find(([k]) => k === o.categorie)?.[1] || '', lead: (o) => (o.icone ? leadImage(o.icone) : null), vide: 'Aucun objet.', form: formObjet },
    { key: 'classes', packs: ['jrpg'], groupe: 'Combat', label: 'Classes', icon: 'shield', kind: 'classe', base: 'Nouvelle classe', nouveau: (id) => NORMES.classes({ id, nom: 'Nouvelle classe' }), meta: (k) => `${k.competences.length} compétence(s)`, lead: (k) => el('span', { className: 'row-dot', style: { background: k.couleur || COULEUR_TYPE } }), vide: 'Aucune classe. Guerrier, mage, voleur… (ou le bouton « données d\'exemple » des Réglages).', form: formClasse },
    { key: 'monstres', packs: ['jrpg'], groupe: 'Combat', label: 'Monstres', icon: 'bug', kind: 'monstre', base: 'Nouveau monstre', nouveau: (id, work) => NORMES.monstres({ id, nom: 'Nouveau monstre', numero: Math.max(0, ...work.monstres.map((m) => m.numero)) + 1 }), meta: (m) => `N.${m.niveau}${m.boss ? ' · boss' : ''}`, lead: (m) => (m.image ? leadImage(m.image) : null), vide: 'Aucun monstre. Chacun : son image, ses statistiques, ses faiblesses, ses compétences et son butin.', form: formMonstre },
    { key: 'groupes', packs: ['jrpg'], groupe: 'Combat', label: 'Groupes de monstres', icon: 'organization', kind: 'groupe', base: 'Nouveau groupe', nouveau: (id) => NORMES.groupes({ id, nom: 'Nouveau groupe' }), meta: (g) => `${g.monstres.reduce((n, x) => n + x.nombre, 0)} monstre(s)`, vide: 'Aucun groupe. Les zones et la commande « Combat contre un groupe » en tirent un.', form: formGroupe },
    { key: 'dresseurs', packs: ['pokemon'], groupe: 'Monde', label: 'Dresseurs', icon: 'person-add', kind: 'dresseur', base: 'Nouveau dresseur', nouveau: (id) => NORMES.dresseurs({ id, nom: 'Nouveau dresseur', classe: 'Gamin', argent: 200 }), meta: (d) => `${d.equipe.length} créature(s)`, vide: 'Aucun dresseur. Les deux rivaux, les champions, les gamins des routes…', form: formDresseur },
    { key: 'boutiques', groupe: 'Monde', label: 'Boutiques', icon: 'tag', kind: 'boutique', base: 'Nouvelle boutique', nouveau: (id) => NORMES.boutiques({ id, nom: 'Nouvelle boutique' }), meta: (b) => `${b.articles.length} article(s)`, vide: 'Aucune boutique.', form: formBoutique },
    { key: 'reglages', groupe: 'Monde', label: 'Réglages', icon: 'settings-gear', unique: true, form: formReglages },
  ];

  // Une ligne de texte par élément (pour Claude).
  function resumer(doc, sorte, o) {
    const d = doc.data;
    const jdr = J?.resumer(doc, sorte, o);
    if (jdr) return jdr;
    if (sorte === 'types') return `${o.id} « ${o.nom} » ×2 contre [${o.efficace.join(', ')}], ×½ [${o.peu_efficace.join(', ')}], ×0 [${o.sans_effet.join(', ')}]`;
    if (sorte === 'talents') return `${o.id} « ${o.nom} » : ${o.description}`;
    if (sorte === 'attaques') return `${o.id} « ${o.nom} » ${o.type} ${o.categorie} puissance ${o.puissance} précision ${o.precision || '—'} PP ${o.pp}${o.priorite ? ` priorité ${o.priorite}` : ''}${o.statut ? `, ${o.statut} ${o.chance_statut || 100} %` : ''}${o.stats.length ? `, stats ${o.stats_cible} ${o.stats.map((s) => `${s.stat} ${s.etages > 0 ? '+' : ''}${s.etages}`).join(' ')}` : ''}${o.effet ? ` : ${o.effet}` : ''}`;
    if (sorte === 'creatures') return `${o.id} « ${o.nom} » #${o.numero} [${o.types.join('/')}] ${STATS.map(([k]) => o.stats[k]).join('/')}${o.legendaire ? ` ${o.legendaire}` : ''}${o.evolutions.length ? `, évolue en ${o.evolutions.map((e) => `${e.vers} (${e.mode}${e.mode === 'niveau' ? ` ${e.niveau}` : e.objet ? ` ${e.objet}` : ''})`).join(', ')}` : ''}${o.sprites.face ? '' : ', sans sprite'}`;
    if (sorte === 'objets') return `${o.id} « ${o.nom} » ${o.categorie} ${o.prix} ${d.reglages.monnaie}, effet ${o.effet.type}${o.effet.valeur !== undefined ? ` ${o.effet.valeur}` : ''}${o.effet.des ? ` ${o.effet.des}` : ''}${o.effet.stat ? ` ${o.effet.stat}` : ''}${o.effet.nature ? ` ${o.effet.nature}` : ''}${o.jdr ? ` jdr ${JSON.stringify(o.jdr)}` : ''}`;
    if (sorte === 'dresseurs') return `${o.id} « ${o.nom} » ${o.classe}${o.personnage ? ` (personnage ${o.personnage})` : ''} : ${o.equipe.map((m) => `${m.creature} niv. ${m.niveau}`).join(', ') || 'équipe vide'}${o.ajuste ? ', s\'ajuste' : ''}`;
    if (sorte === 'classes') return `${o.id} « ${o.nom} » N.1 ${STATS_JRPG.map(([k]) => `${k} ${o.stats[k]}`).join(' ')} ; par niveau ${STATS_JRPG.map(([k]) => `${k} +${o.gains[k]}`).join(' ')} ; compétences ${o.competences.map((c) => `${c.competence} (N.${c.niveau})`).join(', ') || 'aucune'}`;
    if (sorte === 'monstres') return `${o.id} « ${o.nom} » N°${o.numero} N.${o.niveau}${o.boss ? ' boss' : ''} ${STATS_JRPG.map(([k]) => `${k} ${o.stats[k]}`).join(' ')}${o.faiblesses.length ? `, faible ${o.faiblesses.join('/')}` : ''}${o.resistances.length ? `, résiste ${o.resistances.join('/')}` : ''}${o.immunites.length ? `, insensible ${o.immunites.join('/')}` : ''}, compétences ${o.competences.map((c) => `${c.competence} (${c.poids})`).join(', ') || 'aucune'}, xp ${o.xp}, or ${o.or}${o.butin.length ? `, butin ${o.butin.map((b) => `${b.objet} ${b.chance} %`).join(', ')}` : ''}${o.image ? '' : ', sans image'}`;
    if (sorte === 'groupes') return `${o.id} « ${o.nom} » : ${resumeGroupe(d, o)}${o.fuite ? '' : ', on ne peut pas fuir'}`;
    if (sorte === 'attaques' && packDe(d) === 'jrpg') return `${o.id} « ${o.nom} » ${o.type || 'neutre'} ${o.categorie} puissance ${o.puissance} ${o.cout_pm} PM cible ${o.cible}${o.soin ? ` soin ${o.soin}` : ''}${o.ranime ? ' ranime' : ''}${o.guerit.length ? ` guérit ${o.guerit.join('/')}` : ''}${o.statut ? `, ${o.statut} ${o.chance_statut || 100} %` : ''}${o.stats.length ? `, crans ${o.stats_cible} ${o.stats.map((s) => `${s.stat} ${s.etages > 0 ? '+' : ''}${s.etages}`).join(' ')}` : ''}`;
    if (sorte === 'objets' && o.equipement) return `${o.id} « ${o.nom} » ${o.equipement.place} ${o.prix} ${d.reglages.monnaie}, bonus ${Object.entries(o.equipement.bonus).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' ') || 'aucun'}${o.equipement.element ? `, élément ${o.equipement.element}` : ''}${o.equipement.classes.length ? `, classes ${o.equipement.classes.join('/')}` : ''}`;
    if (sorte === 'boutiques') return `${o.id} « ${o.nom} » : ${o.articles.map((a) => `${a.id}${a.sorte === 'creature' ? ` (créature niv. ${a.niveau})` : ''}${a.prix ? ` ${a.prix}` : ''}${a.condition ? ` [si ${Events.resumeCondition(doc, a.condition)}${a.verrouille_visible ? ', grisé avant' : ''}]` : ''}`).join(', ') || 'vide'}${o.achete_creatures ? ', achète les créatures' : ''}`;
    return JSON.stringify(o);
  }

  // Les petits outils des formulaires, pour donnees-jdr.js.
  const ui = { champ, section, info, sel, table, nombreIn, texteIn, ref, refInfo, cases, blocImage, descNom, petitBouton, datalist, dessinMonstre };
  // Les onglets du pack JDR : avec ceux du groupe Combat (les monstres) et les leurs à part.
  if (J) {
    ONGLETS.splice(ONGLETS.findIndex((o) => o.key === 'groupes'), 0, ...J.ONGLETS.filter((o) => o.groupe === 'Combat'));
    ONGLETS.unshift(...J.ONGLETS.filter((o) => o.groupe !== 'Combat'));
  }
  ONGLETS.find((o) => o.key === 'groupes').packs = ['jrpg', 'jdr'];
  ONGLETS.find((o) => o.key === 'groupes').labels = { jdr: 'Rencontres' };
  for (const o of ONGLETS) o.chercher = o.chercher || ((x) => `${x.nom} ${x.id} ${x.numero ?? ''} ${x.officiel || ''}`);

  return {
    ui, SORTES, REGLES, STATS_JRPG, STATUTS_JRPG, PLACES, packDe, ajouterExemple, STATS, STATS_COMBAT, NATURES, CATEGORIES_ATTAQUE, CIBLES, STATUTS, CROISSANCES, MODES_EVOLUTION, CATEGORIES_OBJET, EFFETS_OBJET, AJUSTEMENTS, ONGLETS,
    METEOS, ambianceVide, normAmbiance, lumiereVide, normLumiere, son, SONS_INTEGRES, HORLOGES, tableRencontres, normRencontres,
    vides, normer, normElement, reglagesVides, trouver, nomDe, efficacite, nature, utilisations, fusionner, demanderImport, telechargerOfficiel, listes, resumer, typePill,
  };
})();
