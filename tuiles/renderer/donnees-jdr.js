// Les données du pack JDR (Tafl 0.32, joué par Saga 0.13 : moteur/renderer/moteur/regles/jdr/) : un jeu
// de rôle sur table façon D&D 5e. Caractéristiques, compétences, origines, classes, sorts, monstres et
// états ; la partie `jdr` des objets (arme, armure) et des personnages (les pré-tirés) ; les règles
// maison (reglages.jdr). Le format est dans ../FORMAT.md › « Le pack JDR ».
//
// Ce fichier est lu avant donnees.js, qui prend ses sortes, ses normes et ses onglets (DonneesJdr.SORTES,
// NORMES, ONGLETS). Les formulaires utilisent les petits outils de donnees.js (Donnees.ui), pris au
// moment de les dessiner. Les normes gardent les champs qu'elles ne connaissent pas : un jeu écrit à la
// main, par Loki ou par un Tafl plus récent ne perd rien.

const DonneesJdr = (() => {
  const SORTES = ['caracteristiques', 'competences', 'origines', 'classes_jdr', 'sorts', 'monstres_jdr', 'etats'];

  // --- Les listes fixes ---
  const TYPES_DEGATS = [['contondant', 'Contondant'], ['perforant', 'Perforant'], ['tranchant', 'Tranchant'], ['acide', 'Acide'], ['feu', 'Feu'], ['froid', 'Froid'], ['foudre', 'Foudre'], ['tonnerre', 'Tonnerre'], ['poison', 'Poison'], ['necrotique', 'Nécrotique'], ['radiant', 'Radiant'], ['force', 'Force'], ['psychique', 'Psychique']];
  const ECOLES = [['abjuration', 'Abjuration'], ['divination', 'Divination'], ['enchantement', 'Enchantement'], ['evocation', 'Évocation'], ['illusion', 'Illusion'], ['invocation', 'Invocation'], ['necromancie', 'Nécromancie'], ['transmutation', 'Transmutation']];
  const TAILLES = [['tres_petite', 'Très petite'], ['petite', 'Petite'], ['moyenne', 'Moyenne'], ['grande', 'Grande'], ['tres_grande', 'Très grande'], ['gigantesque', 'Gigantesque']];
  const FP = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
  const XP_FP = { 0: 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
  const DES_VIE = [['6', 'd6'], ['8', 'd8'], ['10', 'd10'], ['12', 'd12']];
  const ARMURES = [['legere', 'Légère'], ['intermediaire', 'Intermédiaire'], ['lourde', 'Lourde'], ['bouclier', 'Bouclier']];
  const CATEGORIES_ARME = [['courante', 'Courante'], ['guerre', 'De guerre']];
  const PROPRIETES = [['finesse', 'Finesse (FOR ou DEX)'], ['legere', 'Légère (deux armes)'], ['lourde', 'Lourde'], ['deux_mains', 'À deux mains'], ['polyvalente', 'Polyvalente'], ['lancer', 'Lancer'], ['munitions', 'Munitions'], ['chargement', 'Chargement'], ['allonge', 'Allonge']];
  const LANCEURS = [['', 'Pas de sorts'], ['complet', 'Lanceur complet (clerc, magicien…)'], ['demi', 'Demi-lanceur (paladin, rôdeur)'], ['occultiste', 'Magie de pacte (occultiste)']];
  const EFFETS_ETAT = [
    ['incapable', 'Ne peut ni agir ni réagir'], ['desavantage_attaques', 'Désavantage à ses attaques'], ['avantage_attaques', 'Avantage à ses attaques'],
    ['avantage_contre', 'On l\'attaque avec avantage'], ['desavantage_contre', 'On l\'attaque avec désavantage'], ['desavantage_tests', 'Désavantage à ses tests'],
    ['echec_for_dex', 'Rate ses sauvegardes de FOR et DEX'], ['critique_contact', 'Un coup au contact est critique'], ['desavantage_sauvegardes_dex', 'Désavantage aux sauvegardes de DEX'],
  ];
  // Les aptitudes que Saga sait jouer (effet) : les autres sont du texte sur la fiche.
  const EFFETS_APTITUDE = [
    ['rage', 'Rage (barbare) : valeur = bonus aux dégâts'], ['defense_sans_armure_barbare', 'Défense sans armure (10 + DEX + CON)'], ['defense_sans_armure_moine', 'Défense sans armure (10 + DEX + SAG)'],
    ['attaque_supplementaire', 'Attaque supplémentaire'], ['attaque_sournoise', 'Attaque sournoise : valeur = dés (2d6…)'], ['ruse', 'Ruse (action bonus)'],
    ['second_souffle', 'Second souffle'], ['sursaut', 'Sursaut (une action de plus)'], ['critique_ameliore', 'Critique amélioré : valeur = 19'],
    ['style_defense', 'Style : défense (+1 CA)'], ['style_archerie', 'Style : archerie (+2 à distance)'], ['style_duel', 'Style : duel (+2 dégâts)'], ['style_deux_armes', 'Style : combat à deux armes'],
    ['arts_martiaux', 'Arts martiaux : valeur = dé (1d4…)'], ['ki', 'Ki (ressource)'], ['chatiment_divin', 'Châtiment divin'], ['imposition_des_mains', 'Imposition des mains (ressource)'],
    ['inspiration_bardique', 'Inspiration bardique : valeur = dé'], ['canalisation', 'Conduit divin (ressource)'], ['sorcellerie', 'Points de sorcellerie (ressource)'], ['recuperation_arcanique', 'Restauration arcanique'],
  ];
  const TYPES_SORT = [
    ['aucun', 'Hors combat (seulement sa description)'], ['attaque', 'Jet d\'attaque de sort'], ['sauvegarde', 'Sauvegarde de la cible'], ['auto', 'Touche toujours (projectile magique)'],
    ['soin', 'Soigne'], ['pv_temp', 'PV temporaires'], ['bonus', 'Bonus (CA, attaque, sauvegardes)'], ['etat', 'Met un état (sauvegarde)'], ['sommeil', 'Sommeil (des PV à endormir)'],
  ];
  const CIBLES_SORT = [['un', 'Un ennemi'], ['plusieurs', 'Plusieurs ennemis (nombre)'], ['zone', 'Tous les ennemis (zone)'], ['soi', 'Le lanceur'], ['allie', 'Un allié'], ['allies', 'Plusieurs alliés (nombre)']];
  const DEFAUTS_REGLES = {
    creation: { active: true, methodes: ['standard', 'points', 'des'], niveau_depart: 1, nombre: 1, pretires: true },
    pv_niveau: 'moyenne', critiques: 'doubler', echec_critique: true, progression: 'xp', repos: 'normal', repos_menu: true,
    morts: 'jets', potion_bonus: false, tenaille: false, unite: 'm', monnaie: 'po', mj_decide: false, animation_des: 'normale', attribution: '',
    case_m: 1.5, diagonales: 'simple', jets_mj_caches: false, // Tafl 0.33 : le mode table de Saga
  };
  const METHODES = [['standard', 'Tableau standard (15, 14, 13, 12, 10, 8)'], ['points', 'Achat de points (27 points)'], ['des', 'Aux dés (4d6, on garde les 3 meilleurs)']];

  // --- Normaliser ---
  const str = (v, d = '') => (v === undefined || v === null || typeof v === 'object' ? d : String(v));
  const num = (v, d = 0, min = -Infinity, max = Infinity) => { const n = Number(v); return v !== '' && v !== null && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
  const int = (v, d = 0, min = -Infinity, max = Infinity) => Math.round(num(v, d, min, max));
  const arr = (v) => (Array.isArray(v) ? v : []);
  const pick = (v, list, d) => (list.some(([k]) => k === v) ? v : d);
  const propre = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? JSON.parse(JSON.stringify(o)) : {});
  // Un identifiant qui garde les « _ » (a_terre, attaque_sournoise : Saga les connaît ainsi).
  const idJ = (v, d = '') => String(v ?? '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^[-_]+|[-_]+$/g, '') || d;
  const idsJ = (v) => [...new Set(arr(v).map((x) => idJ(x)).filter(Boolean))];
  const ids = (v) => [...new Set(arr(v).map((x) => Doc.slug(x, '')).filter(Boolean))];
  const image = (v) => (/^data:image\/(png|gif|webp|jpeg|bmp);base64,/.test(v || '') ? v : '');
  const des = (v) => { const t = str(v).trim().toLowerCase().replace(/\s+/g, ''); return /^(\d*d\d+([+-]\d+)?|\d+)([*x×]\d+)?$/.test(t) ? t : ''; };
  const moyenne = (t) => { const m = des(t).match(/^(\d*)d(\d+)([+-]\d+)?$/); return m ? Math.floor((m[1] === '' ? 1 : Number(m[1])) * (Number(m[2]) + 1) / 2 + Number(m[3] || 0)) : int(t, 0); };
  const nomDesc = (l) => arr(l).filter((x) => x && typeof x === 'object' && (x.nom || x.description)).map((x) => ({ ...propre(x), nom: str(x.nom), description: str(x.description) }));
  const parCarac = (o, min, max) => Object.fromEntries(Object.entries(propre(o)).map(([k, v]) => [idJ(k), int(v, 0, min, max)]).filter(([k, v]) => k && v));
  const parCaracTous = (o, d) => Object.fromEntries(['for', 'dex', 'con', 'int', 'sag', 'cha', ...Object.keys(propre(o))].map((k) => [idJ(k), int(o?.[k], d, 1, 30)]).filter(([k]) => k));

  const NORMES = {
    caracteristiques: (k, i) => {
      const nom = str(k?.nom || k?.id, `Caractéristique ${i + 1}`);
      return { id: idJ(k?.id || nom, `carac-${i + 1}`), nom, court: str(k?.court).trim().slice(0, 4) || nom.slice(0, 3).toUpperCase() };
    },
    competences: (k, i) => ({ id: idJ(k?.id || k?.nom, `competence-${i + 1}`), nom: str(k?.nom || k?.id, `Compétence ${i + 1}`), carac: idJ(k?.carac, 'for') }),
    etats: (e, i) => ({ id: idJ(e?.id || e?.nom, `etat-${i + 1}`), nom: str(e?.nom || e?.id, `État ${i + 1}`), description: str(e?.description), effets: [...new Set(arr(e?.effets).filter((x) => EFFETS_ETAT.some(([k]) => k === x)))] }),
    origines: (o, i) => ({
      ...propre(o),
      id: Doc.slug(o?.id || o?.nom, `origine-${i + 1}`),
      nom: str(o?.nom || o?.id, `Origine ${i + 1}`),
      description: str(o?.description),
      bonus: parCarac(o?.bonus, -10, 10),
      vitesse: num(o?.vitesse, 9, 0, 60),
      taille: pick(o?.taille, TAILLES, 'moyenne'),
      langues: str(o?.langues),
      pv_bonus_niveau: int(o?.pv_bonus_niveau, 0, 0, 5),
      resistances: idsJ(o?.resistances).filter((x) => TYPES_DEGATS.some(([k]) => k === x)),
      maitrises: { ...propre(o?.maitrises), armes: ids(o?.maitrises?.armes), competences: idsJ(o?.maitrises?.competences), armures: idsJ(o?.maitrises?.armures) },
      ...(int(o?.competences_choix?.nombre, 0, 0, 18) ? { competences_choix: { nombre: int(o.competences_choix.nombre, 0, 0, 18) } } : { competences_choix: undefined }),
      traits: nomDesc(o?.traits),
    }),
    classes_jdr: (k, i) => {
      const l = k?.lanceur;
      const lanceur = l && typeof l === 'object' && LANCEURS.some(([t]) => t && t === l.type)
        ? { ...propre(l), type: l.type, carac: idJ(l.carac, 'int'), tours: int(l.tours, 0, 0, 10), prepare: Boolean(l.prepare), ...(Array.isArray(l.connus) ? { connus: l.connus.map((n) => int(n, 0, 0, 99)) } : {}) }
        : undefined;
      return {
        ...propre(k),
        id: Doc.slug(k?.id || k?.nom, `classe-${i + 1}`),
        nom: str(k?.nom || k?.id, `Classe ${i + 1}`),
        couleur: /^#[0-9a-f]{6}$/i.test(k?.couleur || '') ? k.couleur.toLowerCase() : '',
        description: str(k?.description),
        de_vie: [6, 8, 10, 12].includes(Number(k?.de_vie)) ? Number(k.de_vie) : 8,
        carac_principale: Array.isArray(k?.carac_principale) ? idsJ(k.carac_principale) : idJ(k?.carac_principale, 'for'),
        sauvegardes: idsJ(k?.sauvegardes).slice(0, 6),
        maitrises: { ...propre(k?.maitrises), armures: idsJ(k?.maitrises?.armures), armes: ids(k?.maitrises?.armes) },
        competences_choix: { nombre: int(k?.competences_choix?.nombre, 2, 0, 18), parmi: idsJ(k?.competences_choix?.parmi) },
        equipement_depart: arr(k?.equipement_depart).filter((x) => x?.objet).map((x) => ({ objet: Doc.slug(x.objet, ''), nombre: int(x.nombre, 1, 1, 999) })),
        or_depart: des(k?.or_depart),
        lanceur,
        ameliorations: Array.isArray(k?.ameliorations) ? [...new Set(k.ameliorations.map((n) => int(n, 0, 1, 20)).filter(Boolean))].sort((a, b) => a - b) : undefined,
        niveaux: arr(k?.niveaux).filter((n) => n && typeof n === 'object').map((n) => ({
          niveau: int(n.niveau, 1, 1, 20),
          aptitudes: arr(n.aptitudes).filter((a) => a && typeof a === 'object' && (a.nom || a.effet)).map((a) => {
            const o = { ...propre(a), nom: str(a.nom || a.effet), description: str(a.description) };
            if (a.effet) o.effet = idJ(a.effet); else delete o.effet;
            if (a.valeur === undefined || a.valeur === '') delete o.valeur;
            else o.valeur = typeof a.valeur === 'number' ? a.valeur : (/^-?\d+$/.test(String(a.valeur).trim()) ? Number(a.valeur) : str(a.valeur).trim());
            return o;
          }),
        })).sort((a, b) => a.niveau - b.niveau),
      };
    },
    sorts: (s, i) => {
      const e = propre(s?.effet);
      return {
        ...propre(s),
        id: Doc.slug(s?.id || s?.nom, `sort-${i + 1}`),
        nom: str(s?.nom || s?.id, `Sort ${i + 1}`),
        niveau: int(s?.niveau, 1, 0, 9),
        ecole: pick(s?.ecole, ECOLES, 'evocation'),
        classes: ids(s?.classes),
        temps: str(s?.temps, '1 action') || '1 action',
        portee: str(s?.portee), duree: str(s?.duree, 'instantanée'), composantes: str(s?.composantes),
        concentration: Boolean(s?.concentration), rituel: Boolean(s?.rituel),
        description: str(s?.description),
        effet: { ...e, type: pick(e.type, TYPES_SORT, 'aucun') },
      };
    },
    monstres_jdr: (m, i) => {
      const fp = FP.includes(String(m?.fp)) ? String(m.fp) : '1/4';
      const pvDes = des(m?.pv_des);
      return {
        ...propre(m),
        id: Doc.slug(m?.id || m?.nom, `monstre-${i + 1}`),
        nom: str(m?.nom || m?.id, `Monstre ${i + 1}`),
        numero: int(m?.numero, i + 1, 0, 99999),
        image: image(m?.image),
        fp, type: str(m?.type, 'humanoïde'),
        taille: pick(m?.taille, TAILLES, 'moyenne'),
        ca: int(m?.ca, 12, 1, 40), ca_texte: str(m?.ca_texte),
        pv_des: pvDes,
        pv: int(m?.pv, pvDes ? moyenne(pvDes) : 10, 1, 9999),
        vitesse: num(m?.vitesse, 9, 0, 60),
        carac: parCaracTous(m?.carac, 10),
        sauvegardes: parCarac(m?.sauvegardes, -10, 30),
        competences: parCarac(m?.competences, -10, 30),
        sens: str(m?.sens), langues: str(m?.langues),
        resistances_degats: idsJ(m?.resistances_degats), vulnerabilites_degats: idsJ(m?.vulnerabilites_degats), immunites_degats: idsJ(m?.immunites_degats),
        immunites_etats: idsJ(m?.immunites_etats),
        multiattaque: int(m?.multiattaque, 0, 0, 8) || undefined,
        boss: Boolean(m?.boss) || undefined,
        or: des(m?.or),
        butin: arr(m?.butin).filter((b) => b?.objet).map((b) => ({ objet: Doc.slug(b.objet, ''), chance: int(b.chance, 10, 1, 100) })),
        traits: nomDesc(m?.traits),
        actions: arr(m?.actions).filter((a) => a && typeof a === 'object').map((a, k) => normAction(a, k)),
        description: str(m?.description),
      };
    },
  };
  // Une action de monstre : une attaque (bonus pour toucher, dégâts) ou une sauvegarde (souffle, toile).
  function normAction(a, k) {
    const o = { ...propre(a), nom: str(a.nom, `Action ${k + 1}`) };
    if (a.sauvegarde && typeof a.sauvegarde === 'object') {
      o.sauvegarde = { carac: idJ(a.sauvegarde.carac, 'dex'), dd: int(a.sauvegarde.dd, 12, 1, 40), moitie: Boolean(a.sauvegarde.moitie) };
      delete o.attaque;
    } else { o.attaque = int(a.attaque, 3, -5, 30); delete o.sauvegarde; }
    o.degats = des(a.degats);
    o.type_degats = idJ(a.type_degats);
    if (a.etat) { o.etat = idJ(a.etat); o.tours = int(a.tours, 1, 1, 100); } else { delete o.etat; delete o.tours; delete o.etat_sauvegarde; }
    if (o.etat && a.etat_sauvegarde && typeof a.etat_sauvegarde === 'object') o.etat_sauvegarde = { carac: idJ(a.etat_sauvegarde.carac, 'con'), dd: int(a.etat_sauvegarde.dd, 11, 1, 40) };
    for (const b of ['distance', 'zone', 'repete']) { if (a[b]) o[b] = true; else delete o[b]; }
    if (a.recharge && /^[1-6](-[1-6])?$/.test(String(a.recharge))) o.recharge = String(a.recharge); else delete o.recharge;
    if (a.poids !== undefined) o.poids = int(a.poids, 10, 0, 100);
    if (a.couleur && !/^#[0-9a-f]{6}$/i.test(a.couleur)) delete o.couleur;
    return o;
  }
  // La partie `jdr` d'un objet : une arme ou une armure (sinon rien).
  function normObjet(j) {
    if (!j || typeof j !== 'object') return undefined;
    const out = { ...propre(j) };
    if (j.arme && typeof j.arme === 'object') {
      const w = j.arme;
      out.arme = {
        ...propre(w), categorie: pick(w.categorie, CATEGORIES_ARME, 'courante'), degats: des(w.degats) || '1d4', type: pick(w.type, TYPES_DEGATS, 'contondant'),
        proprietes: [...new Set(arr(w.proprietes).filter((p) => PROPRIETES.some(([k]) => k === p)))],
      };
      if (w.distance) { out.arme.distance = true; out.arme.portee = num(w.portee, 24, 1, 600); } else { delete out.arme.distance; delete out.arme.portee; }
      if (des(w.polyvalente)) out.arme.polyvalente = des(w.polyvalente); else delete out.arme.polyvalente;
    } else delete out.arme;
    if (j.armure && typeof j.armure === 'object') {
      const a = j.armure;
      out.armure = { ...propre(a), type: pick(a.type, ARMURES, 'legere'), ca: int(a.ca, a.type === 'bouclier' ? 2 : 11, 0, 30) };
      if (a.discretion) out.armure.discretion = true; else delete out.armure.discretion;
      if (int(a.force, 0, 0, 30)) out.armure.force = int(a.force, 0, 0, 30); else delete out.armure.force;
    } else delete out.armure;
    return out.arme || out.armure || Object.keys(out).length ? out : undefined;
  }
  // La fiche d'un pré-tiré (personnages[].jdr) : son origine, sa classe, son niveau, ses valeurs.
  function normFiche(f) {
    if (!f || typeof f !== 'object') return undefined;
    return {
      ...propre(f),
      origine: Doc.slug(f.origine, ''), classe: Doc.slug(f.classe, ''),
      niveau: int(f.niveau, 1, 1, 20),
      carac: parCaracTous(f.carac, 10),
      competences: idsJ(f.competences), expertises: idsJ(f.expertises),
      sorts: ids(f.sorts),
      equipement: Object.fromEntries(['arme', 'seconde', 'armure'].map((k) => [k, Doc.slug(f.equipement?.[k], '')]).filter(([, v]) => v)),
    };
  }
  // Les règles maison (Réglages › Règles du JDR).
  function normRegles(r) {
    const d = DEFAUTS_REGLES;
    r = r && typeof r === 'object' ? r : {};
    const c = r.creation || {};
    const m = [...new Set(arr(c.methodes).filter((x) => METHODES.some(([k]) => k === x)))];
    return {
      creation: { active: c.active !== false, methodes: m.length ? m : [...d.creation.methodes], niveau_depart: int(c.niveau_depart, 1, 1, 20), nombre: int(c.nombre, 1, 1, 6), pretires: c.pretires !== false },
      pv_niveau: pick(r.pv_niveau, PV_NIVEAU, d.pv_niveau), critiques: pick(r.critiques, CRITIQUES, d.critiques), echec_critique: r.echec_critique !== false,
      progression: pick(r.progression, PROGRESSIONS, d.progression), repos: pick(r.repos, REPOS, d.repos), repos_menu: r.repos_menu !== false,
      morts: pick(r.morts, MORTS, d.morts), potion_bonus: Boolean(r.potion_bonus), tenaille: Boolean(r.tenaille),
      unite: pick(r.unite, UNITES, d.unite), monnaie: pick(r.monnaie, MONNAIES, d.monnaie), mj_decide: Boolean(r.mj_decide),
      animation_des: pick(r.animation_des, ANIMATIONS, d.animation_des), attribution: str(r.attribution),
      case_m: Math.round(num(r.case_m, d.case_m, 0.5, 30) * 10) / 10, diagonales: pick(r.diagonales, DIAGONALES, d.diagonales), jets_mj_caches: Boolean(r.jets_mj_caches),
    };
  }
  const PV_NIVEAU = [['moyenne', 'La moyenne du dé de vie (arrondie au-dessus)'], ['jet', 'Un jet du dé de vie'], ['choix', 'Le joueur choisit à chaque niveau']];
  const CRITIQUES = [['doubler', 'On lance deux fois les dés de dégâts (règle officielle)'], ['max', 'Le maximum des dés, plus un jet (plus brutal)']];
  const PROGRESSIONS = [['xp', 'Points d\'expérience (les combats en donnent)'], ['jalons', 'Jalons : on monte aux moments clés de l\'histoire']];
  const REPOS = [['normal', 'Normal (repos court 1 h, long 8 h)'], ['heroique', 'Héroïque (court 5 min, long 1 h)'], ['realiste', 'Réaliste (court 8 h, long 7 jours)']];
  const MORTS = [['jets', 'Jets contre la mort (3 réussites ou 3 échecs)'], ['ko', 'Simplement K.O. jusqu\'à la fin du combat']];
  const UNITES = [['m', 'Mètres (9 m)'], ['cases', 'Cases (6 cases de 1,5 m)'], ['pieds', 'Pieds (30 pieds)']];
  const DIAGONALES = [['simple', 'Une diagonale = 1 case (règle simple)'], ['alternees', '1 case, puis 2, en alternance (plus réaliste)']];
  const MONNAIES = [['po', 'Pièces d\'or (po)'], ['unique', 'La monnaie du jeu (Réglages › Argent)']];
  const ANIMATIONS = [['normale', 'Normale'], ['rapide', 'Rapide'], ['aucune', 'Aucune : le résultat tout de suite']];

  // --- Les listes du jeu (sinon celles de la 5e, dans modele-dnd5e.js) ---
  const defaut = { caracteristiques: () => ModeleDnd5e.CARACTERISTIQUES, competences: () => ModeleDnd5e.COMPETENCES, etats: () => ModeleDnd5e.ETATS };
  const liste = (work, sorte) => ((work[sorte] || []).length ? work[sorte] : defaut[sorte]?.() || []);
  const choix = (work, sorte) => liste(work, sorte).map((o) => [o.id, o.nom]);
  function listes(data) {
    const dl = Donnees.ui.datalist;
    dl('tafl-sorts', (data.sorts || []).map((s) => [s.id, `${s.nom} (${s.niveau ? `niv. ${s.niveau}` : 'tour de magie'})`]));
    dl('tafl-monstres-jdr', (data.monstres_jdr || []).map((m) => [m.id, `${m.nom} (FP ${m.fp})`]));
    dl('tafl-classes-jdr', (data.classes_jdr || []).map((k) => [k.id, k.nom]));
    dl('tafl-effets-aptitude', EFFETS_APTITUDE);
  }

  // --- Les formulaires ---
  const U = () => Donnees.ui;
  const zoneTexte = (ctx, o, cle, label, rows = 2, placeholder = '') => el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: label }), ctx.zone(o, cle, rows, placeholder)]);
  const desIn = (o, cle, placeholder) => {
    const i = el('input', { type: 'text', value: o[cle] || '', placeholder, className: 'des-input' });
    i.oninput = () => { o[cle] = i.value.trim().toLowerCase(); i.classList.toggle('invalide', Boolean(i.value.trim()) && !des(i.value)); };
    return i;
  };
  // Une grille d'une valeur par caractéristique (bonus d'une origine, valeurs d'un monstre…).
  function grilleCarac(work, o, cle, min, max, vide = 0) {
    if (!o[cle] || typeof o[cle] !== 'object') o[cle] = {};
    return el('div', { className: 'field-grid jdr-carac' }, liste(work, 'caracteristiques').map((k) => {
      const v = { x: o[cle][k.id] ?? vide };
      return U().champ(k.court || k.nom, U().nombreIn(v, 'x', min, max, 1, () => { o[cle] = { ...o[cle], [k.id]: v.x }; if (!vide && !v.x) delete o[cle][k.id]; }));
    }));
  }
  // Une liste de textes séparés par des virgules (les armes maîtrisées : « courante, guerre, arc-long »).
  function listeTexte(o, cle, placeholder) {
    const i = el('input', { type: 'text', value: arr(o[cle]).join(', '), placeholder });
    i.oninput = () => { o[cle] = i.value.split(',').map((x) => Doc.slug(x, '')).filter(Boolean); };
    return i;
  }
  const casesJ = (o, cle, l, vide) => { if (!Array.isArray(o[cle])) o[cle] = []; return U().cases(o, cle, l, vide); };
  const traits = (o, cle, ajouter, vide) => {
    if (!Array.isArray(o[cle])) o[cle] = [];
    const { table, texteIn } = U();
    return table(o[cle], [
      ['Nom', (t) => texteIn(t, 'nom', 'Vision dans le noir'), true],
      ['Description', (t) => { const z = el('textarea', { rows: 2, value: t.description || '' }); z.oninput = () => { t.description = z.value; }; return z; }, false, true],
    ], () => ({ nom: '', description: '' }), { ajouter, vide });
  };
  const signe = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

  function formCarac(k, ctx) {
    const { champ, info } = U();
    const idl = ctx.idLigne(k);
    ctx.form.append(
      champ('Nom', ctx.input(k, 'nom', 'Force, Dextérité…', idl.maj)), idl.el,
      champ('Abréviation', ctx.input(k, 'court', 'FOR'), 'sur les fiches'),
      info('Le jeu a six caractéristiques par défaut (celles de la 5e). Les compétences, les sauvegardes et les monstres s\'y réfèrent par leur identifiant : en changer le nom ne casse rien.'),
    );
  }
  function formCompetence(k, ctx) {
    const { champ, sel, info } = U();
    const idl = ctx.idLigne(k);
    ctx.form.append(
      champ('Nom', ctx.input(k, 'nom', 'Perception, Discrétion…', idl.maj)), idl.el,
      champ('Caractéristique', sel(choix(ctx.work, 'caracteristiques'), k.carac, (v) => { k.carac = v; ctx.renderListe(); })),
      info('Un héros qui maîtrise la compétence ajoute son bonus de maîtrise (+2 au niveau 1, +6 au niveau 17) au modificateur de sa caractéristique. Les blocs « Test » et les conditions s\'en servent.'),
    );
  }
  function formEtat(e, ctx) {
    const { champ, info } = U();
    const idl = ctx.idLigne(e);
    ctx.form.append(
      champ('Nom', ctx.input(e, 'nom', 'Empoisonné, À terre…', idl.maj)), idl.el,
      zoneTexte(ctx, e, 'description', 'Description', 3, 'Ce que l\'état fait, en clair (montré sur la fiche et en combat).'),
      champ('Ce que Saga applique', casesJ(e, 'effets', EFFETS_ETAT)),
      info('Les autres effets (vitesse 0, ne pas parler…) sont pour le joueur : la description les dit. Un sort, une action de monstre ou le bloc « Mettre un état » le donnent.'),
    );
  }
  function formOrigine(o, ctx) {
    const { champ, sel, section, info, nombreIn, table } = U();
    const { work } = ctx;
    const idl = ctx.idLigne(o);
    if (!o.maitrises) o.maitrises = { armes: [], competences: [], armures: [] };
    if (!o.competences_choix) o.competences_choix = { nombre: 0 };
    ctx.form.append(
      champ('Nom', ctx.input(o, 'nom', 'Nain des collines, Haut-elfe…', idl.maj)), idl.el,
      zoneTexte(ctx, o, 'description', 'Description', 3, 'Son peuple, en quelques lignes (montré à la création).'),
      section('Bonus de caractéristiques'),
      grilleCarac(work, o, 'bonus', -10, 10),
      el('div', { className: 'field-grid' }, [
        champ('Vitesse', nombreIn(o, 'vitesse', 0, 60, 1.5), 'mètres par tour'),
        champ('Taille', sel(TAILLES, o.taille, (v) => { o.taille = v; })),
        champ('PV en plus par niveau', nombreIn(o, 'pv_bonus_niveau', 0, 5)),
        champ('Compétences au choix', nombreIn(o.competences_choix, 'nombre', 0, 18), 'en plus de celles de la classe'),
      ]),
      champ('Langues', ctx.input(o, 'langues', 'commun, nain')),
      champ('Résistances', casesJ(o, 'resistances', TYPES_DEGATS)),
      champ('Compétences maîtrisées', casesJ(o.maitrises, 'competences', choix(work, 'competences'))),
      champ('Armes maîtrisées', listeTexte(o.maitrises, 'armes', 'hache-d-armes, marteau-de-guerre (identifiants d\'objets)')),
      section('Traits'),
      traits(o, 'traits', '+ Trait', 'Aucun trait.'),
      info('Les traits sont du texte sur la fiche ; les bonus, la vitesse, les PV, les résistances et les maîtrises sont appliqués par Saga.'),
      section('Utilisation'), ctx.usages('origine', o.id),
    );
  }
  function formClasse(k, ctx) {
    const { champ, sel, section, info, nombreIn, table, refInfo, descNom } = U();
    const { work } = ctx;
    const idl = ctx.idLigne(k);
    const couleur = el('input', { type: 'color', value: k.couleur || '#8a8f98' });
    couleur.oninput = () => { k.couleur = couleur.value; ctx.renderListe(); };
    const caracs = choix(work, 'caracteristiques');
    const lanceur = el('div');
    const majLanceur = () => {
      const l = k.lanceur;
      lanceur.replaceChildren(
        champ('Magie', sel(LANCEURS, l?.type || '', (v) => { k.lanceur = v ? { type: v, carac: l?.carac || 'int', tours: l?.tours ?? (v === 'demi' ? 0 : 3), prepare: l?.prepare ?? false, ...(l?.connus ? { connus: l.connus } : {}) } : undefined; majLanceur(); })),
        ...(l ? [el('div', { className: 'field-grid' }, [
          champ('Caractéristique des sorts', sel(caracs, l.carac, (v) => { l.carac = v; })),
          champ('Tours de magie au niveau 1', nombreIn(l, 'tours', 0, 10)),
          champ('Prépare ses sorts chaque jour', ctx.coche(l, 'prepare'), 'clerc, druide, magicien, paladin ; sinon il les connaît'),
        ]), info(l.prepare ? 'Il prépare chaque jour un nombre de sorts égal à son modificateur de caractéristique + son niveau (la moitié pour un demi-lanceur), pris dans la liste de sa classe (les sorts qui ont sa classe).' : `Il connaît un nombre fixe de sorts${l.connus ? ` (${l.connus.slice(0, 5).join(', ')}… du niveau 1 au 20)` : ''}, choisis à la création et à chaque niveau.`)] : []),
      );
    };
    majLanceur();
    if (!Array.isArray(k.niveaux)) k.niveaux = [];
    const niveaux = table(k.niveaux, [
      ['Niveau', (n) => nombreIn(n, 'niveau', 1, 20)],
      ['Aptitudes', (n) => {
        if (!Array.isArray(n.aptitudes)) n.aptitudes = [];
        return table(n.aptitudes, [
          ['Nom', (a) => U().texteIn(a, 'nom', 'Second souffle'), true],
          ['Effet dans Saga', (a) => { const i = el('input', { type: 'text', value: a.effet || '', list: 'tafl-effets-aptitude', placeholder: 'texte seul', className: 'ref-input' }); i.oninput = () => { a.effet = idJ(i.value); if (!a.effet) delete a.effet; }; return i; }],
          ['Valeur', (a) => { const i = el('input', { type: 'text', value: a.valeur ?? '', placeholder: '1d6, 2…', className: 'des-input' }); i.oninput = () => { const t = i.value.trim(); if (!t) delete a.valeur; else a.valeur = /^-?\d+$/.test(t) ? Number(t) : t; }; return i; }],
          ['Description', (a) => { const z = el('textarea', { rows: 2, value: a.description || '' }); z.oninput = () => { a.description = z.value; }; return z; }, false, true],
        ], () => ({ nom: '', description: '' }), { ajouter: '+ Aptitude' });
      }, true, true],
    ], () => ({ niveau: Math.min(20, (k.niveaux.at(-1)?.niveau || 0) + 1), aptitudes: [{ nom: '', description: '' }] }), { ajouter: '+ Niveau', vide: 'Aucune aptitude.' });
    const amelio = el('input', { type: 'text', value: arr(k.ameliorations).join(', '), placeholder: '4, 8, 12, 16, 19 (par défaut)' });
    amelio.oninput = () => { const l = amelio.value.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 20); k.ameliorations = l.length ? l : undefined; };
    ctx.form.append(
      champ('Nom', ctx.input(k, 'nom', 'Guerrier, Magicienne…', idl.maj)), idl.el,
      el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Couleur' }), couleur, el('span', { className: 'unit', textContent: 'son étiquette sur les fiches' })]),
      zoneTexte(ctx, k, 'description', 'Description', 2, 'Ce qu\'elle fait de mieux (montré à la création).'),
      el('div', { className: 'field-grid' }, [
        champ('Dé de vie', sel(DES_VIE, String(k.de_vie), (v) => { k.de_vie = Number(v); })),
        champ('Caractéristique principale', sel(caracs, Array.isArray(k.carac_principale) ? k.carac_principale[0] : k.carac_principale, (v) => { k.carac_principale = v; }), 'conseillée à la création'),
        champ('Or de départ', desIn(k, 'or_depart', '5d4*10'), 'des dés ; *10 multiplie'),
      ]),
      champ('Sauvegardes maîtrisées', casesJ(k, 'sauvegardes', caracs)),
      champ('Armures maîtrisées', casesJ(k.maitrises, 'armures', ARMURES)),
      champ('Armes maîtrisées', listeTexte(k.maitrises, 'armes', 'courante, guerre, ou des identifiants d\'armes')),
      section('Compétences'),
      champ('Au choix', nombreIn(k.competences_choix, 'nombre', 0, 18), 'parmi celles cochées'),
      casesJ(k.competences_choix, 'parmi', choix(work, 'competences')),
      section('Équipement de départ'),
      table(k.equipement_depart, [
        ['Objet', (x) => refInfo(x, 'objet', 'tafl-donnees-objets', 'epee-longue', descNom(work.objets)), true],
        ['Nombre', (x) => nombreIn(x, 'nombre', 1, 999)],
      ], () => ({ objet: '', nombre: 1 }), { ajouter: '+ Objet', vide: 'Rien : il part avec son or.' }),
      info('À la création, le joueur prend cet équipement (porté s\'il le peut) ou l\'or de départ à la place.'),
      section('Sorts'),
      lanceur,
      section('Aptitudes par niveau'),
      niveaux,
      champ('Niveaux d\'amélioration', amelio, '+2 à une caractéristique (ou +1 à deux)'),
      info('Une aptitude avec un « effet » connu de Saga est jouée (rage, attaque sournoise, second souffle…) ; les autres sont du texte sur la fiche. Une aptitude dont l\'effet est une ressource (ki, conduit divin…) a des utilisations rendues par les repos.'),
      section('Utilisation'), ctx.usages('classe_jdr', k.id),
    );
  }
  function formSort(s, ctx) {
    const { champ, sel, section, info, nombreIn } = U();
    const { work } = ctx;
    const idl = ctx.idLigne(s);
    const effet = el('div');
    const majEffet = () => {
      const e = s.effet;
      const t = e.type;
      const c = (cle, label, input, unit) => champ(label, input, unit);
      const coche = (cle) => { const i = el('input', { type: 'checkbox', checked: Boolean(e[cle]) }); i.onchange = () => { if (i.checked) e[cle] = true; else delete e[cle]; }; return i; };
      const texte = (cle, ph) => desIn(e, cle, ph);
      const cibles = ['attaque', 'sauvegarde', 'auto', 'etat', 'soin', 'pv_temp', 'bonus'].includes(t);
      effet.replaceChildren(
        champ('Effet en combat', sel(TYPES_SORT, t, (v) => { s.effet = { type: v, ...(v === 'aucun' ? {} : { cibles: ['soin', 'pv_temp', 'bonus'].includes(v) ? 'allie' : 'un' }) }; majEffet(); })),
        ...(t === 'aucun' ? [info('Le sort sert hors combat : le joueur le lit sur sa fiche, et le MJ (ou un événement) décide.')] : [
          el('div', { className: 'field-grid' }, [
            cibles ? c('cibles', 'Cibles', sel(CIBLES_SORT, e.cibles || 'un', (v) => { e.cibles = v; majEffet(); })) : null,
            ['plusieurs', 'allies'].includes(e.cibles) || t === 'auto' ? c('nombre', t === 'auto' ? 'Projectiles' : 'Combien', nombreIn(e, 'nombre', 1, 20)) : null,
            ['sauvegarde', 'etat'].includes(t) ? c('sauvegarde', 'Sauvegarde de', sel(choix(work, 'caracteristiques'), e.sauvegarde || 'dex', (v) => { e.sauvegarde = v; })) : null,
            t === 'attaque' ? c('attaque', 'Attaque', sel([['distance', 'À distance'], ['corps', 'Au contact']], e.attaque || 'distance', (v) => { e.attaque = v; })) : null,
            ['attaque', 'sauvegarde', 'auto'].includes(t) ? c('degats', 'Dégâts', texte('degats', '1d10')) : null,
            ['attaque', 'sauvegarde', 'auto'].includes(t) ? c('type_degats', 'Type', sel([['', '—'], ...TYPES_DEGATS], e.type_degats || '', (v) => { e.type_degats = v; })) : null,
            t === 'soin' ? c('soin', 'Soin', texte('soin', '1d8')) : null,
            t === 'pv_temp' ? c('soin', 'PV temporaires', texte('soin', '1d4+4')) : null,
            t === 'sommeil' ? c('degats', 'PV endormis', texte('degats', '5d8')) : null,
            t === 'bonus' ? c('bonus_ca', 'Bonus de CA', nombreIn(e, 'bonus_ca', 0, 10)) : null,
            t === 'bonus' ? c('bonus_attaque', 'Bonus d\'attaque', texte('bonus_attaque', '1d4')) : null,
            t === 'bonus' ? c('bonus_sauvegarde', 'Bonus aux sauvegardes', texte('bonus_sauvegarde', '1d4')) : null,
            ['etat', 'sauvegarde', 'attaque', 'bonus'].includes(t) ? c('etat', 'État', sel([['', 'Aucun'], ...choix(work, 'etats')], e.etat || '', (v) => { if (v) e.etat = v; else delete e.etat; })) : null,
            ['etat', 'bonus', 'sauvegarde', 'attaque'].includes(t) ? c('tours', 'Pendant', nombreIn(e, 'tours', 0, 100), 'tours (0 = la durée du sort)') : null,
            c('niveau_sup', 'Par niveau d\'emplacement en plus', texte('niveau_sup', '1d6 (vide : rien)')),
          ]),
          el('div', { className: 'field-grid' }, [
            t === 'sauvegarde' ? c('moitie', 'Réussi : la moitié des dégâts', coche('moitie')) : null,
            ['soin', 'pv_temp'].includes(t) ? c('ajouter_mod', 'Plus le modificateur du lanceur', coche('ajouter_mod')) : null,
            ['etat', 'sauvegarde'].includes(t) ? c('repete', 'Nouvelle sauvegarde à chaque tour', coche('repete')) : null,
            c('action', 'Action bonus', (() => { const i = el('input', { type: 'checkbox', checked: e.action === 'bonus' }); i.onchange = () => { if (i.checked) e.action = 'bonus'; else delete e.action; }; return i; })()),
          ]),
        ]),
      );
    };
    majEffet();
    ctx.form.append(
      champ('Nom', ctx.input(s, 'nom', 'Projectile magique, Soins…', idl.maj)), idl.el,
      el('div', { className: 'field-grid' }, [
        champ('Niveau', nombreIn(s, 'niveau', 0, 9), '0 = tour de magie (à volonté)'),
        champ('École', sel(ECOLES, s.ecole, (v) => { s.ecole = v; })),
        champ('Temps', ctx.input(s, 'temps', '1 action')),
        champ('Portée', ctx.input(s, 'portee', '36 m')),
        champ('Durée', ctx.input(s, 'duree', 'instantanée')),
        champ('Composantes', ctx.input(s, 'composantes', 'V, S, M')),
      ]),
      el('div', { className: 'field-grid' }, [champ('Concentration', ctx.coche(s, 'concentration')), champ('Rituel', ctx.coche(s, 'rituel'))]),
      zoneTexte(ctx, s, 'description', 'Description', 3, 'Ce qu\'il fait, en clair (montré au joueur).'),
      champ('Classes qui l\'apprennent', casesJ(s, 'classes', (work.classes_jdr || []).map((k) => [k.id, k.nom]), 'Crée d\'abord les classes (ou le modèle D&D 5e, Réglages › Règles du JDR).')),
      section('En combat'),
      effet,
      info('Saga calcule le jet d\'attaque (bonus de maîtrise + modificateur du lanceur) et le DD des sauvegardes (8 + les mêmes). Un tour de magie qui fait des dégâts en fait plus aux niveaux 5, 11 et 17.'),
      section('Utilisation'), ctx.usages('sort', s.id),
    );
  }
  function formMonstre(m, ctx) {
    const { champ, sel, section, info, nombreIn, table, refInfo, descNom, blocImage, texteIn } = U();
    const { work } = ctx;
    const idl = ctx.idLigne(m);
    const caracs = choix(work, 'caracteristiques');
    const pv = el('span', { className: 'unit' });
    const majPv = () => { pv.textContent = des(m.pv_des) ? `moyenne : ${moyenne(m.pv_des)} PV` : ''; };
    const pvDes = desIn(m, 'pv_des', '2d8+2');
    pvDes.addEventListener('input', () => { if (des(m.pv_des)) m.pv = moyenne(m.pv_des); majPv(); pvIn.value = m.pv; });
    const pvIn = nombreIn(m, 'pv', 1, 9999);
    majPv();
    // Bonus par compétence ou sauvegarde : des lignes { id, bonus }, remises en objet à chaque changement.
    const bonusTable = (cle, choixL, ajouter) => {
      const lignes = Object.entries(m[cle] || {}).map(([id, bonus]) => ({ id, bonus }));
      const ecrire = () => { m[cle] = Object.fromEntries(lignes.filter((l) => l.id).map((l) => [l.id, l.bonus])); };
      return table(lignes, [
        ['', (l) => sel([['', '…'], ...choixL], l.id, (v) => { l.id = v; ecrire(); }), true],
        ['Bonus', (l) => nombreIn(l, 'bonus', -10, 30, 1, ecrire)],
      ], () => ({ id: '', bonus: 2 }), { ajouter, change: ecrire });
    };
    if (!Array.isArray(m.actions)) m.actions = [];
    const actions = table(m.actions, [
      ['Nom', (a) => texteIn(a, 'nom', 'Morsure'), true],
      ['Pour toucher', (a, k, rendre) => {
        const s = sel([['attaque', 'Jet d\'attaque'], ['sauvegarde', 'Sauvegarde']], a.sauvegarde ? 'sauvegarde' : 'attaque', (v) => { if (v === 'sauvegarde') { a.sauvegarde = { carac: 'dex', dd: 12, moitie: true }; delete a.attaque; } else { delete a.sauvegarde; a.attaque = 4; } rendre(); });
        return s;
      }],
      ['', (a) => (a.sauvegarde
        ? el('span', { className: 'ref-wrap' }, [sel(caracs, a.sauvegarde.carac, (v) => { a.sauvegarde.carac = v; }), el('span', { className: 'unit', textContent: 'DD' }), nombreIn(a.sauvegarde, 'dd', 1, 40)])
        : el('span', { className: 'ref-wrap' }, [el('span', { className: 'unit', textContent: '+' }), nombreIn(a, 'attaque', -5, 30)]))],
      ['Dégâts', (a) => desIn(a, 'degats', '1d6+2')],
      ['Type', (a) => sel([['', '—'], ...TYPES_DEGATS], a.type_degats || '', (v) => { a.type_degats = v; })],
      ['Plus', (a, k, rendre) => {
        const c = (cle, titre) => { const i = el('input', { type: 'checkbox', checked: Boolean(cle === 'moitie' ? a.sauvegarde?.moitie : a[cle]) }); i.onchange = () => { if (cle === 'moitie') a.sauvegarde.moitie = i.checked; else if (i.checked) a[cle] = true; else delete a[cle]; }; return el('label', { className: 'chip chip-check', title: titre }, [i, el('span', { textContent: titre })]); };
        const recharge = el('input', { type: 'text', value: a.recharge || '', placeholder: 'recharge 5-6', className: 'des-input' });
        recharge.oninput = () => { const t = recharge.value.trim(); if (/^[1-6](-[1-6])?$/.test(t)) a.recharge = t; else delete a.recharge; };
        const etat = sel([['', 'Pas d\'état'], ...choix(work, 'etats')], a.etat || '', (v) => { if (v) { a.etat = v; a.tours = a.tours || 1; } else { delete a.etat; delete a.tours; delete a.etat_sauvegarde; } rendre(); });
        const poids = nombreIn(a, 'poids', 0, 100);
        poids.placeholder = 'poids';
        poids.title = 'Sa chance d\'être choisie (relative ; vide = 10)';
        return el('span', { className: 'chips' }, [
          c('distance', 'À distance'), c('zone', 'Tous les héros'), a.sauvegarde ? c('moitie', 'Moitié si réussi') : null, recharge, poids, etat,
          a.etat ? el('span', { className: 'ref-wrap' }, [el('span', { className: 'unit', textContent: 'pendant' }), nombreIn(a, 'tours', 1, 100), el('span', { className: 'unit', textContent: 'tours' })]) : null,
          a.etat && !a.sauvegarde ? (() => {
            const s = sel([['', 'Sans sauvegarde'], ...caracs.map(([k2, n]) => [k2, `Sauvegarde de ${n}`])], a.etat_sauvegarde?.carac || '', (v) => { if (v) a.etat_sauvegarde = { carac: v, dd: a.etat_sauvegarde?.dd || 11 }; else delete a.etat_sauvegarde; rendre(); });
            return el('span', { className: 'ref-wrap' }, [s, a.etat_sauvegarde ? el('span', { className: 'unit', textContent: 'DD' }) : null, a.etat_sauvegarde ? nombreIn(a.etat_sauvegarde, 'dd', 1, 40) : null]);
          })() : null,
        ]);
      }, false, true],
    ], () => ({ nom: '', attaque: 4, degats: '1d6+2', type_degats: 'tranchant' }), { ajouter: '+ Action', vide: 'Aucune action : il ne fait rien à son tour.' });
    const xp = el('span', { className: 'unit' });
    const majXp = () => { xp.textContent = `${XP_FP[m.fp] ?? 0} XP`; };
    majXp();
    ctx.form.append(
      el('div', { className: 'creature-head' }, [
        blocImage(ctx, m, 'image', 'Image'),
        el('div', { className: 'creature-id' }, [
          champ('Nom', ctx.input(m, 'nom', 'Gobelin, Loup…', idl.maj)), idl.el,
          el('div', { className: 'field-grid' }, [
            champ('FP', (() => { const s = sel(FP.map((f) => [f, f]), m.fp, (v) => { m.fp = v; majXp(); ctx.renderListe(); }); s.style.minWidth = '72px'; return el('span', { className: 'ref-wrap' }, [s, xp]); })(), 'facteur de puissance'),
            champ('Type', ctx.input(m, 'type', 'bête, humanoïde, mort-vivant…')),
            champ('Taille', sel(TAILLES, m.taille, (v) => { m.taille = v; })),
            champ('N° du Bestiaire', nombreIn(m, 'numero', 0, 99999)),
          ]),
          champ('Boss (on ne peut pas fuir, plus grand à l\'écran)', (() => { const i = el('input', { type: 'checkbox', checked: Boolean(m.boss) }); i.onchange = () => { if (i.checked) m.boss = true; else delete m.boss; ctx.renderListe(); }; return i; })()),
        ]),
      ]),
      zoneTexte(ctx, m, 'description', 'Bestiaire', 2, 'Sa description, montrée une fois vaincu.'),
      section('Défense'),
      el('div', { className: 'field-grid' }, [
        champ('Classe d\'armure', nombreIn(m, 'ca', 1, 40)),
        champ('Armure', ctx.input(m, 'ca_texte', 'armure de cuir, armure naturelle…')),
        champ('Dés de vie', pvDes),
        champ('PV', pvIn, ''), pv,
        champ('Vitesse', nombreIn(m, 'vitesse', 0, 60, 1.5), 'mètres par tour'),
      ]),
      section('Caractéristiques'),
      grilleCarac(work, m, 'carac', 1, 30, 10),
      el('div', { className: 'field-grid' }, [
        el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Sauvegardes maîtrisées' }), bonusTable('sauvegardes', caracs, '+ Sauvegarde')]),
        el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Compétences' }), bonusTable('competences', choix(work, 'competences'), '+ Compétence')]),
      ]),
      el('div', { className: 'field-grid' }, [champ('Sens', ctx.input(m, 'sens', 'vision dans le noir 18 m')), champ('Langues', ctx.input(m, 'langues', 'commun, gobelin'))]),
      champ('Résiste à', casesJ(m, 'resistances_degats', TYPES_DEGATS)),
      champ('Vulnérable à', casesJ(m, 'vulnerabilites_degats', TYPES_DEGATS)),
      champ('Insensible aux dégâts', casesJ(m, 'immunites_degats', TYPES_DEGATS)),
      champ('Insensible aux états', casesJ(m, 'immunites_etats', choix(work, 'etats'))),
      section('Ce qu\'il fait à son tour'),
      champ('Multiattaque', (() => { const v = { x: m.multiattaque || 0 }; return nombreIn(v, 'x', 0, 8, 1, () => { if (v.x > 1) m.multiattaque = v.x; else delete m.multiattaque; }); })(), 'attaques par tour (0 ou 1 : une seule)'),
      actions,
      info('Saga choisit une action selon son poids (et sa recharge : 5-6 = disponible de nouveau sur 5 ou 6 au d6). Une action « Tous les héros » touche tout le groupe (un souffle).'),
      section('Traits'),
      traits(m, 'traits', '+ Trait', 'Aucun trait.'),
      section('Récompenses'),
      champ('Or laissé', desIn(m, 'or', '2d6 (vide : rien)'), 'des dés'),
      table(m.butin, [
        ['Objet laissé', (b) => refInfo(b, 'objet', 'tafl-donnees-objets', 'dague', descNom(work.objets)), true],
        ['Chance %', (b) => nombreIn(b, 'chance', 1, 100)],
      ], () => ({ objet: '', chance: 10 }), { ajouter: '+ Butin', max: 6, vide: 'Il ne laisse rien.' }),
      info('L\'expérience vient du FP (partagée entre les héros debout).'),
      section('Utilisation'), ctx.usages('monstre_jdr', m.id),
    );
  }

  // La partie JDR d'un objet (formObjet de donnees.js) : arme, armure, ou rien.
  function formObjet(o, ctx) {
    const { champ, sel, section, info, nombreIn } = U();
    const box = el('div');
    const maj = () => {
      const j = o.jdr || {};
      const sorte = j.arme ? 'arme' : j.armure ? 'armure' : '';
      const out = [champ('C\'est', sel([['', 'Un objet (ni arme ni armure)'], ['arme', 'Une arme'], ['armure', 'Une armure ou un bouclier']], sorte, (v) => {
        o.jdr = v === 'arme' ? { arme: { categorie: 'courante', degats: '1d6', type: 'tranchant', proprietes: [] } } : v === 'armure' ? { armure: { type: 'legere', ca: 11 } } : undefined;
        if (v === 'arme' && o.categorie === 'autre') o.categorie = 'arme';
        if (v === 'armure' && o.categorie === 'autre') o.categorie = 'armure';
        maj(); ctx.renderListe();
      }))];
      if (j.arme) {
        const w = j.arme;
        const dist = el('input', { type: 'checkbox', checked: Boolean(w.distance) });
        dist.onchange = () => { if (dist.checked) { w.distance = true; w.portee = w.portee || 24; } else { delete w.distance; delete w.portee; } maj(); };
        out.push(el('div', { className: 'field-grid' }, [
          champ('Catégorie', sel(CATEGORIES_ARME, w.categorie, (v) => { w.categorie = v; })),
          champ('Dégâts', desIn(w, 'degats', '1d8')),
          champ('Type', sel(TYPES_DEGATS.slice(0, 3), w.type, (v) => { w.type = v; })),
          champ('À distance', dist),
          w.distance ? champ('Portée', nombreIn(w, 'portee', 1, 600), 'mètres') : null,
          (w.proprietes || []).includes('polyvalente') ? champ('À deux mains', desIn(w, 'polyvalente', '1d10'), 'polyvalente') : null,
        ]), champ('Propriétés', (() => { if (!Array.isArray(w.proprietes)) w.proprietes = []; const c = U().cases(w, 'proprietes', PROPRIETES); c.addEventListener('change', maj); return c; })()));
      }
      if (j.armure) {
        const a = j.armure;
        out.push(el('div', { className: 'field-grid' }, [
          champ('Type', sel(ARMURES, a.type, (v) => { a.type = v; maj(); })),
          champ(a.type === 'bouclier' ? 'Bonus de CA' : 'CA', nombreIn(a, 'ca', 0, 30), a.type === 'legere' ? '+ DEX' : a.type === 'intermediaire' ? '+ DEX (2 au plus)' : ''),
          a.type === 'lourde' ? champ('Force minimum', nombreIn(a, 'force', 0, 30), '0 = aucune') : null,
          a.type !== 'bouclier' ? champ('Désavantage en Discrétion', (() => { const i = el('input', { type: 'checkbox', checked: Boolean(a.discretion) }); i.onchange = () => { if (i.checked) a.discretion = true; else delete a.discretion; }; return i; })()) : null,
        ]));
      }
      if (o.effet?.type === 'soin') {
        out.push(champ('Soin aux dés', desIn(o.effet, 'des', '2d4+2'), 'remplace la valeur fixe (une potion de soins)'));
      }
      box.replaceChildren(...out);
    };
    maj();
    return [section('Dans le pack JDR'), box, info('Une arme ou une armure se porte (fiche › Inventaire) : Saga calcule le jet d\'attaque, les dégâts et la classe d\'armure. Une potion (effet « Soigne des PV ») peut soigner aux dés.')];
  }

  // La fiche d'un pré-tiré (onglet Personnages) : origine, classe, niveau, valeurs, compétences, sorts.
  function formPersonnage(p, work, render) {
    const { champ, sel, section, info, nombreIn, cases } = U();
    if (!p.jdr) {
      const b = el('button', { className: 'button small', textContent: 'En faire un pré-tiré (une fiche toute prête)' });
      b.onclick = (e) => { e.preventDefault(); p.jdr = normFiche({ classe: work.classes_jdr?.[0]?.id || '', origine: work.origines?.[0]?.id || '', niveau: 1 }); render(); };
      return [section('Pré-tiré (pack JDR)'), info('Un pré-tiré est un personnage tout prêt que le joueur peut choisir à la création (ou qui rejoint le groupe avec la commande « Le groupe »). Sans fiche, ce personnage n\'est qu\'un PNJ.'), el('div', { className: 'field' }, [b])];
    }
    const f = p.jdr;
    const k = (work.classes_jdr || []).find((x) => x.id === f.classe);
    const objets = (filtre) => [['', 'Rien'], ...work.objets.filter(filtre).map((o) => [o.id, o.nom])];
    const equip = (place, filtre) => sel(objets(filtre), f.equipement?.[place] || '', (v) => { f.equipement = { ...f.equipement }; if (v) f.equipement[place] = v; else delete f.equipement[place]; });
    const sorts = (work.sorts || []).filter((s) => !k || s.classes.includes(k.id)).sort((a, b) => a.niveau - b.niveau || a.nom.localeCompare(b.nom));
    const retirer = el('button', { className: 'button small', textContent: 'Retirer la fiche (redevient un PNJ)' });
    retirer.onclick = (e) => { e.preventDefault(); delete p.jdr; render(); };
    return [
      section('Pré-tiré (pack JDR)'),
      el('div', { className: 'field-grid' }, [
        champ('Origine', sel([['', '…'], ...(work.origines || []).map((o) => [o.id, o.nom])], f.origine, (v) => { f.origine = v; })),
        champ('Classe', sel([['', '…'], ...(work.classes_jdr || []).map((o) => [o.id, o.nom])], f.classe, (v) => { f.classe = v; render(); })),
        champ('Niveau', nombreIn(f, 'niveau', 1, 20)),
      ]),
      section('Valeurs (sans les bonus d\'origine)'),
      grilleCarac(work, f, 'carac', 1, 30, 10),
      champ('Compétences maîtrisées', cases(f, 'competences', choix(work, 'competences')), k ? `${k.competences_choix.nombre} au choix pour un ${k.nom.toLowerCase()}` : ''),
      champ('Expertises', cases(f, 'expertises', choix(work, 'competences')), 'double maîtrise (roublard, barde)'),
      ...(k?.lanceur ? [champ('Sorts', cases(f, 'sorts', sorts.map((s) => [s.id, `${s.nom}${s.niveau ? ` (${s.niveau})` : ''}`]), 'Aucun sort de cette classe.'))] : []),
      el('div', { className: 'field-grid' }, [
        champ('Arme', equip('arme', (o) => o.jdr?.arme)),
        champ('Main gauche', equip('seconde', (o) => o.jdr?.armure?.type === 'bouclier' || (o.jdr?.arme?.proprietes || []).includes('legere'))),
        champ('Armure', equip('armure', (o) => o.jdr?.armure && o.jdr.armure.type !== 'bouclier')),
      ]),
      info('Sans équipement choisi, il prend celui de départ de sa classe. Ses PV, sa CA, ses bonus et ses emplacements de sorts sont calculés par Saga.'),
      el('div', { className: 'field' }, [retirer]),
    ];
  }

  // Réglages › Règles du JDR : les règles maison, et le modèle D&D 5e.
  function formRegles(r, ctx) {
    const { champ, sel, section, info, nombreIn, cases } = U();
    if (!r.jdr) r.jdr = normRegles({});
    const j = r.jdr;
    const choixR = (cle, l, unit) => champ(LIBELLES[cle], sel(l, j[cle], (v) => { j[cle] = v; }), unit);
    const coche = (o, cle, label, unit) => { const i = el('input', { type: 'checkbox', checked: Boolean(o[cle]) }); i.onchange = () => { o[cle] = i.checked; }; return champ(label, i, unit); };
    const modele = el('button', { className: 'button small', textContent: 'Charger le modèle D&D 5e (SRD 5.1)' });
    // La taille d'une case, et ce que ça donne pour une vitesse de 9 m.
    const exemple = el('small', { className: 'field-unit' });
    const majExemple = () => { const n = Math.floor(9 / (Number(j.case_m) || 1.5) + 1e-9); exemple.textContent = `une vitesse de 9 m = ${n} case${n > 1 ? 's' : ''}`; };
    const caseM = el('span', { className: 'inline' }, [nombreIn(j, 'case_m', 0.5, 30, 0.5, majExemple), exemple]);
    majExemple();
    modele.onclick = (e) => {
      e.preventDefault();
      const n = chargerModele(ctx.work);
      ctx.render();
      notify(n ? `${n} éléments ajoutés (12 classes, 9 origines, 129 sorts, 45 monstres, 65 objets, 4 pré-tirés…) : à modifier comme tu veux. Valide pour les garder.` : 'Le modèle est déjà là.', 'success', 6000);
    };
    return [
      section('Règles du JDR'),
      info('Un jeu de rôle sur table façon D&D 5e : on crée ses personnages (origine, classe, caractéristiques), les tests se font au d20 contre un DD, les combats au tour par tour avec l\'initiative. Saga lance les dés à l\'écran et les note dans le journal des jets.'),
      el('div', { className: 'field' }, [modele]),
      info(`Le modèle ajoute ce qui manque, sans rien remplacer. ${typeof ModeleDnd5e !== 'undefined' ? ModeleDnd5e.ATTRIBUTION : ''}`),
      section('Création des personnages'),
      coche(j.creation, 'active', 'Le joueur crée ses personnages au début', 'sinon le héros et les pré-tirés'),
      el('div', { className: 'field-grid' }, [
        champ('Personnages à créer', nombreIn(j.creation, 'nombre', 1, 6), 'un par joueur autour de la table'),
        champ('Niveau de départ', nombreIn(j.creation, 'niveau_depart', 1, 20)),
      ]),
      champ('Caractéristiques', cases(j.creation, 'methodes', METHODES)),
      coche(j.creation, 'pretires', 'Proposer les pré-tirés', 'les personnages qui ont une fiche'),
      section('Règles maison'),
      choixR('pv_niveau', PV_NIVEAU),
      choixR('critiques', CRITIQUES),
      coche(j, 'echec_critique', 'Un 1 naturel rate toujours une attaque'),
      choixR('morts', MORTS),
      choixR('progression', PROGRESSIONS),
      choixR('repos', REPOS),
      coche(j, 'repos_menu', 'Se reposer depuis le menu du jeu', 'sinon seulement par les événements (une auberge, un feu de camp)'),
      coche(j, 'potion_bonus', 'Boire une potion est une action bonus'),
      coche(j, 'tenaille', 'Prise en tenaille', 'avantage contre un ennemi déjà frappé au contact par un allié ce tour-ci'),
      section('Affichage'),
      choixR('unite', UNITES, 'les distances écrites en mètres dans les données'),
      choixR('animation_des', ANIMATIONS),
      coche(j, 'mj_decide', 'Le MJ peut forcer un test', 'en vraie partie : après le jet, garder le résultat ou forcer la réussite ou l\'échec'),
      section('Mode table'),
      info('Dans Saga, le mode table fait jouer le jeu sur un plateau, avec un MJ : une case de la grille est une tuile de la carte. Les vitesses et les portées des données, en mètres, deviennent des cases selon la taille d\'une case.'),
      champ('Une case vaut', caseM, 'mètres'),
      choixR('diagonales', DIAGONALES),
      coche(j, 'jets_mj_caches', 'Les jets des monstres sont cachés aux joueurs', 'le MJ les voit, et peut les révéler'),
    ];
  }
  // « Visible par » (Tafl 0.33, le mode table de Saga) : tout le monde, le MJ seulement, ou le joueur
  // d'un personnage (un pré-tiré, ou le personnage dont part une création).
  function visibilites(work) {
    return [['tous', 'Tout le monde'], ['mj', 'Le MJ seulement'],
      ...(work?.personnages || []).filter((p) => p.jdr || p.heros).map((p) => [`perso:${p.id}`, `Le joueur de ${p.nom || p.id}`])];
  }
  const normVisible = (v, d = 'tous') => (['tous', 'mj'].includes(v) || /^perso:[a-z0-9_-]+$/.test(String(v || '')) ? v : d);

  const LIBELLES = { diagonales: 'Diagonales', pv_niveau: 'PV en montant de niveau', critiques: 'Coups critiques', morts: 'À 0 PV', progression: 'Progression', repos: 'Durée des repos', unite: 'Distances', monnaie: 'Monnaie', animation_des: 'Animation des dés' };

  // --- Le modèle D&D 5e (modele-dnd5e.js) ---
  // Une petite image en pixels pour chaque monstre, d'après son type (Donnees.ui.dessinMonstre).
  const FORMES = [[/bête|bete/, 'bete'], [/vase|élémentaire|elementaire|plante/, 'blob'], [/dragon/, 'bete'], [/champignon/, 'champignon'], [/chauve|oiseau|harpie|aigle/, 'ailes']];
  const COULEURS = { 'mort-vivant': '#c8c4b0', bête: '#8c7a5a', humanoïde: '#7aa040', dragon: '#d03028', vase: '#5cc85c', élémentaire: '#f09030', géant: '#a08870', démon: '#a03040', fiélon: '#a03040', aberration: '#8a60b0', monstruosité: '#6a8a9a', plante: '#4a9a50' };
  function imageMonstre(m) {
    const t = `${m.type} ${m.nom}`.toLowerCase();
    const forme = (FORMES.find(([re]) => re.test(t)) || [null, 'humain'])[1];
    const cle = Object.keys(COULEURS).find((k) => m.type?.toLowerCase().startsWith(k));
    let couleur = COULEURS[cle] || '#8a8f98';
    // Une teinte un peu différente par monstre, pour les distinguer.
    let h = 0;
    for (const ch of m.id) h = (h * 31 + ch.charCodeAt(0)) % 997;
    const [r, g, b] = hexToRgba(couleur);
    const d = (h % 50) - 25;
    couleur = `#${[r + d, g - d / 2, b + d / 3].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
    return U().dessinMonstre(forme, couleur);
  }
  // Ajoute à work ce qui manque du modèle (par identifiant) ; rend le nombre d'éléments ajoutés.
  function chargerModele(work) {
    const d = ModeleDnd5e.donnees();
    let n = 0;
    for (const sorte of [...SORTES, 'objets', 'groupes']) {
      if (!Array.isArray(work[sorte])) work[sorte] = [];
      for (const o of d[sorte] || []) {
        if (work[sorte].some((x) => x.id === o.id)) continue;
        const norme = sorte === 'objets' || sorte === 'groupes' ? Donnees.normElement(sorte, o, work[sorte].length) : NORMES[sorte](o, work[sorte].length);
        if (sorte === 'monstres_jdr' && !norme.image) norme.image = imageMonstre(norme);
        work[sorte].push(norme);
        n++;
      }
    }
    for (const p of d.personnages) {
      if (work.personnages.some((x) => x.id === p.id)) continue;
      work.personnages.push({ ...p, jdr: normFiche(p.jdr) });
      n++;
    }
    if (!work.reglages.jdr) work.reglages.jdr = normRegles({});
    work.reglages.jdr.attribution = ModeleDnd5e.ATTRIBUTION;
    if (work.reglages.equipe_max === 6) work.reglages.equipe_max = 4;
    if (work.reglages.argent_depart === 3000) work.reglages.argent_depart = 0; // l'or vient des classes
    return n;
  }

  // --- Les onglets (dans Jeu › Données du jeu, groupe « JDR ») ---
  const point = (couleur) => el('span', { className: 'row-dot', style: { background: couleur || '#8a8f98' } });
  const leadImage = (src) => el('img', { className: 'row-portrait pixel', src, alt: '' });
  const vide = (texte) => `${texte} Le plus simple : Réglages › Règles du JDR › « Charger le modèle D&D 5e ».`;
  const ONGLETS = [
    { key: 'caracteristiques', packs: ['jdr'], groupe: 'Règles du JDR', label: 'Caractéristiques', icon: 'symbol-numeric', kind: 'caracteristique', base: 'Nouvelle caractéristique',
      nouveau: (id) => NORMES.caracteristiques({ id, nom: 'Nouvelle caractéristique' }), meta: (k) => k.court, vide: 'Aucune : le jeu prend les six de la 5e (Force, Dextérité, Constitution, Intelligence, Sagesse, Charisme).', form: formCarac },
    { key: 'competences', packs: ['jdr'], groupe: 'Règles du JDR', label: 'Compétences', icon: 'mortar-board', kind: 'competence', base: 'Nouvelle compétence',
      nouveau: (id) => NORMES.competences({ id, nom: 'Nouvelle compétence' }), meta: (k, work) => liste(work, 'caracteristiques').find((c) => c.id === k.carac)?.court || k.carac, vide: 'Aucune : le jeu prend les 18 de la 5e.', form: formCompetence },
    { key: 'etats', packs: ['jdr'], groupe: 'Règles du JDR', label: 'États', icon: 'pulse', kind: 'etat', base: 'Nouvel état',
      nouveau: (id) => NORMES.etats({ id, nom: 'Nouvel état' }), meta: (e) => `${e.effets.length} effet(s)`, vide: 'Aucun : le jeu prend les 15 états de la 5e (à terre, empoisonné, paralysé…).', form: formEtat },
    { key: 'origines', packs: ['jdr'], groupe: 'Personnages du JDR', label: 'Origines', icon: 'globe', kind: 'origine', base: 'Nouvelle origine',
      nouveau: (id) => NORMES.origines({ id, nom: 'Nouvelle origine' }), meta: (o) => Object.entries(o.bonus).map(([k, v]) => `${k.toUpperCase()} ${signe(v)}`).join(' '), vide: vide('Aucune origine (nain, elfe, humain…).'), form: formOrigine },
    { key: 'classes_jdr', packs: ['jdr'], groupe: 'Personnages du JDR', label: 'Classes', icon: 'shield', kind: 'classe_jdr', base: 'Nouvelle classe',
      nouveau: (id) => NORMES.classes_jdr({ id, nom: 'Nouvelle classe' }), meta: (k) => `d${k.de_vie}${k.lanceur ? ' · sorts' : ''}`, lead: (k) => point(k.couleur), vide: vide('Aucune classe (guerrier, magicien…).'), form: formClasse },
    { key: 'sorts', packs: ['jdr'], groupe: 'Personnages du JDR', label: 'Sorts', icon: 'sparkle', kind: 'sort', base: 'Nouveau sort',
      nouveau: (id) => NORMES.sorts({ id, nom: 'Nouveau sort', niveau: 1 }), meta: (s) => (s.niveau ? `niv. ${s.niveau}` : 'tour'), vide: vide('Aucun sort.'), form: formSort,
      chercher: (s) => `${s.nom} ${s.id} ${s.ecole} ${s.classes.join(' ')} niv ${s.niveau}` },
    { key: 'monstres_jdr', packs: ['jdr'], groupe: 'Combat', label: 'Monstres', icon: 'bug', kind: 'monstre_jdr', base: 'Nouveau monstre',
      nouveau: (id, work) => NORMES.monstres_jdr({ id, nom: 'Nouveau monstre', numero: Math.max(0, ...(work.monstres_jdr || []).map((m) => m.numero)) + 1, actions: [{ nom: 'Coup', attaque: 3, degats: '1d6+1', type_degats: 'contondant' }] }),
      meta: (m) => `FP ${m.fp}${m.boss ? ' · boss' : ''}`, lead: (m) => (m.image ? leadImage(m.image) : null), vide: vide('Aucun monstre.'), form: formMonstre,
      chercher: (m) => `${m.nom} ${m.id} ${m.type} fp ${m.fp}` },
  ];

  // Une ligne de texte par élément (pour Loki).
  function resumer(doc, sorte, o) {
    if (sorte === 'caracteristiques') return `${o.id} « ${o.nom} » (${o.court})`;
    if (sorte === 'competences') return `${o.id} « ${o.nom} » (${o.carac})`;
    if (sorte === 'etats') return `${o.id} « ${o.nom} » : ${o.description}${o.effets.length ? ` [${o.effets.join(', ')}]` : ''}`;
    if (sorte === 'origines') return `${o.id} « ${o.nom} » ${Object.entries(o.bonus).map(([k, v]) => `${k} ${signe(v)}`).join(' ')}, vitesse ${o.vitesse} m${o.traits.length ? `, traits : ${o.traits.map((t) => t.nom).join(', ')}` : ''}`;
    if (sorte === 'classes_jdr') return `${o.id} « ${o.nom} » d${o.de_vie}, sauvegardes ${o.sauvegardes.join('/')}, ${o.competences_choix.nombre} compétences${o.lanceur ? `, sorts ${o.lanceur.type} (${o.lanceur.carac})` : ''}, aptitudes : ${o.niveaux.map((n) => `${n.niveau} ${n.aptitudes.map((a) => a.nom).join('/')}`).join(' ; ')}`;
    if (sorte === 'sorts') return `${o.id} « ${o.nom} » ${o.niveau ? `niv. ${o.niveau}` : 'tour de magie'} ${o.ecole}, ${o.temps}, ${o.portee}${o.concentration ? ', concentration' : ''} [${o.classes.join(', ')}] effet ${JSON.stringify(o.effet)}`;
    if (sorte === 'monstres_jdr') return `${o.id} « ${o.nom} » FP ${o.fp} ${o.type}, CA ${o.ca}, PV ${o.pv}${o.pv_des ? ` (${o.pv_des})` : ''}, ${Object.entries(o.carac).map(([k, v]) => `${k} ${v}`).join(' ')}, actions : ${o.actions.map((a) => `${a.nom} ${a.sauvegarde ? `DD ${a.sauvegarde.dd} ${a.sauvegarde.carac}` : `+${a.attaque}`} ${a.degats} ${a.type_degats}${a.etat ? ` ${a.etat}` : ''}`).join(', ')}${o.image ? '' : ', sans image'}`;
    return null;
  }
  // Où une donnée JDR est utilisée (Donnees.utilisations) : ajoute les endroits à `out`.
  function utilisations(doc, sorte, id, out) {
    const d = doc.data;
    Events.parcourirJeu(doc, ({ commande, condition, ev, map, page }) => {
      const c = commande || condition;
      const ici = `${map.name} › ${ev.nom || ev.id}${ev.pages.length > 1 ? ` (page ${page + 1})` : ''}`;
      if (sorte === 'competence' && ['test', 'test_oppose', 'jdr_maitrise'].includes(c.type) && (c.competence === id || c.competence_adverse === id)) out.add(ici);
      if (sorte === 'caracteristique' && ((c.type === 'sauvegarde' && c.carac === id) || (c.type === 'test' && c.competence === id))) out.add(ici);
      if (sorte === 'etat' && ['etat', 'sauvegarde', 'jdr_etat'].includes(c.type) && c.etat === id) out.add(ici);
      if (sorte === 'monstre_jdr' && c.type === 'test_oppose' && c.monstre === id) out.add(ici);
      if (sorte === 'classe_jdr' && c.type === 'jdr_classe' && c.classe === id) out.add(ici);
      if (sorte === 'origine' && c.type === 'jdr_origine' && c.origine === id) out.add(ici);
    });
    for (const p of d.personnages || []) {
      const f = p.jdr;
      if (!f) continue;
      if ((sorte === 'classe_jdr' && f.classe === id) || (sorte === 'origine' && f.origine === id) || (sorte === 'sort' && f.sorts.includes(id)) || (sorte === 'competence' && f.competences.includes(id))) out.add(`Pré-tiré ${p.nom}`);
      if (sorte === 'objet' && Object.values(f.equipement || {}).includes(id)) out.add(`Pré-tiré ${p.nom} (équipement)`);
    }
    for (const k of d.classes_jdr || []) {
      if (sorte === 'objet' && k.equipement_depart.some((x) => x.objet === id)) out.add(`Classe ${k.nom} (équipement de départ)`);
      if (sorte === 'competence' && k.competences_choix.parmi.includes(id)) out.add(`Classe ${k.nom}`);
      if (sorte === 'caracteristique' && k.sauvegardes.includes(id)) out.add(`Classe ${k.nom} (sauvegardes)`);
    }
    for (const s of d.sorts || []) {
      if (sorte === 'classe_jdr' && s.classes.includes(id)) out.add(`Sort ${s.nom}`);
      if (sorte === 'etat' && s.effet.etat === id) out.add(`Sort ${s.nom}`);
    }
    for (const m of d.monstres_jdr || []) {
      if (sorte === 'objet' && m.butin.some((b) => b.objet === id)) out.add(`Monstre ${m.nom} (butin)`);
      if (sorte === 'etat' && (m.actions.some((a) => a.etat === id) || m.immunites_etats.includes(id))) out.add(`Monstre ${m.nom}`);
    }
    for (const o of d.origines || []) if (sorte === 'competence' && o.maitrises.competences.includes(id)) out.add(`Origine ${o.nom}`);
    for (const k of d.competences || []) if (sorte === 'caracteristique' && k.carac === id) out.add(`Compétence ${k.nom}`);
    if (sorte === 'monstre_jdr') for (const g of d.groupes || []) if (g.monstres.some((x) => x.monstre === id)) out.add(`Rencontre ${g.nom}`);
  }

  return {
    SORTES, NORMES, ONGLETS, DEFAUTS_REGLES, TYPES_DEGATS, EFFETS_APTITUDE, normObjet, normFiche, normRegles, listes, resumer, utilisations,
    formObjet, formPersonnage, formRegles, chargerModele, imageMonstre, des, moyenne, visibilites, normVisible,
  };
})();
