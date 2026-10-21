// Les bases de données du jeu (Tafl 0.8) : types, talents, attaques, créatures, objets, dresseurs,
// boutiques et réglages. Elles vivent dans doc.data, à côté des personnages, quêtes et interrupteurs
// de Tafl 0.7, et suivent la même règle : on remplace doc.data en entier, jamais sur place.
//
// Chaque sorte a son fichier dans le dossier du jeu (donnees/creatures.json…), décrit dans
// ../FORMAT.md, « Données du jeu ». Les données officielles Pokémon s'importent à la demande
// (../officiel.js) ; chaque élément importé garde son nom anglais dans « officiel », pour être retrouvé
// quand on réimporte. Les éléments qu'on crée soi-même n'ont pas ce champ, et l'import n'y touche jamais.
//
// Ce module donne aussi les onglets de la fenêtre Jeu › Données du jeu (Events.editData) :
// chaque onglet dit comment créer, résumer et modifier un élément de sa sorte.

const Donnees = (() => {
  const SORTES = ['types', 'talents', 'attaques', 'creatures', 'objets', 'dresseurs', 'boutiques', 'reglages'];
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
  const CATEGORIES_OBJET = [['soin', 'Soin'], ['balle', 'Balle'], ['vitamine', 'Vitamine, Super Bonbon'], ['menthe', 'Menthe (nature)'], ['ivs', 'Capsule (IV)'], ['baie', 'Baie'], ['tenu', 'Objet tenu'], ['combat', 'Combat'], ['evolution', 'Évolution'], ['tresor', 'Trésor (à revendre)'], ['cle', 'Objet clé'], ['autre', 'Autre']];
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
    ['passage', 'Ouvre un passage (à la place des CS)', []],
  ];
  const UNITES_EFFET = { soin: 'PV (9999 = tous)', rappel: '% des PV', pp: 'PP (99 = tous)', pp_toutes: 'PP (99 = tous)', pp_max: 'paliers (1 à 3)', ev: 'EV', niveau: 'niveaux', ivs: 'valeur des IV (31 = parfait)', balle: '× la chance de capture (255 = toujours)', repousse: 'pas' };
  const AJUSTEMENTS = [['aucun', 'Jamais : chaque dresseur garde ses niveaux'], ['equipe', 'Sur l\'équipe du joueur (son meilleur niveau)'], ['badges', 'Sur le niveau maximum des badges du joueur']];
  const COULEUR_TYPE = '#8a8f98';

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
      statut: pick(str(a?.statut), STATUTS, ''),
      chance_statut: int(a?.chance_statut, 0, 0, 100),
      peur: int(a?.peur, 0, 0, 100),
      stats: arr(a?.stats).filter((s) => STATS_COMBAT.some(([k]) => k === s?.stat)).map((s) => ({ stat: s.stat, etages: int(s.etages, 1, -6, 6) })),
      stats_cible: a?.stats_cible === 'soi' ? 'soi' : 'adversaire',
      chance_stats: int(a?.chance_stats, 0, 0, 100),
      drain: int(a?.drain, 0, -100, 100),
      soin: int(a?.soin, 0, -100, 100),
      critique: int(a?.critique, 0, 0, 6),
      coups_min: int(a?.coups_min, 1, 1, 10),
      coups_max: Math.max(int(a?.coups_min, 1, 1, 10), int(a?.coups_max, 1, 1, 10)),
      effet: str(a?.effet),
      description: str(a?.description),
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
        },
        icone: image(o?.icone),
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
      })),
    }),
  };
  const reglagesVides = () => ({
    monnaie: 'Pokédollars', argent_depart: 3000, equipe_max: 6,
    plafonds: [{ badges: 0, niveau: 15 }, { badges: 1, niveau: 20 }, { badges: 2, niveau: 25 }, { badges: 3, niveau: 30 }, { badges: 4, niveau: 35 }, { badges: 5, niveau: 40 }, { badges: 6, niveau: 45 }, { badges: 7, niveau: 50 }, { badges: 8, niveau: 100 }],
    ajustement: 'badges', ecart: 0, chance_chromatique: 4096,
    interface: { theme: 'verre', accent: '' },
  });
  // L'interface en jeu (Tafl 0.13, lue par Saga 0.4) : le thème des dialogues, du combat et des menus.
  const THEMES = [['verre', 'Verre : sombre et flou, coins arrondis'], ['pixel', 'Pixel : police pixel, cadres nets, rétro']];
  function normReglages(r) {
    const d = reglagesVides();
    if (!r || typeof r !== 'object') return d;
    return {
      monnaie: str(r.monnaie, d.monnaie) || d.monnaie,
      argent_depart: int(r.argent_depart, d.argent_depart, 0, 9999999),
      equipe_max: int(r.equipe_max, 6, 1, 12),
      plafonds: Array.isArray(r.plafonds) ? r.plafonds.map((p) => ({ badges: int(p?.badges, 0, 0, 99), niveau: int(p?.niveau, 100, 1, 100) })).sort((a, b) => a.badges - b.badges) : d.plafonds,
      ajustement: pick(r.ajustement, AJUSTEMENTS, d.ajustement),
      ecart: int(r.ecart, 0, -20, 20),
      chance_chromatique: int(r.chance_chromatique, 4096, 0, 100000),
      interface: {
        theme: pick(r.interface?.theme, THEMES, 'verre'),
        accent: /^#[0-9a-f]{6}$/i.test(r.interface?.accent || '') ? r.interface.accent.toLowerCase() : '',
      },
    };
  }
  const vides = () => ({ types: [], talents: [], attaques: [], creatures: [], objets: [], dresseurs: [], boutiques: [], reglages: reglagesVides() });
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
    });
    for (const m of doc.maps) {
      for (const z of m.zones) {
        if (sorte === 'objet' && z.objet === id) out.add(`${m.name} › zone ${z.name || z.id} (objet requis)`);
        if (sorte === 'creature' && (z.rencontres || []).some((r) => r.creature === id)) out.add(`${m.name} › zone ${z.name || z.id} (rencontres)`);
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
  const normRencontres = (list) => arr(list).filter((r) => r?.creature).slice(0, 20).map((r) => {
    const min = int(r.niveau_min, 2, 1, 100);
    return { creature: Doc.slug(r.creature, ''), niveau_min: min, niveau_max: Math.max(min, int(r.niveau_max, min, 1, 100)), chance: int(r.chance, 10, 1, 100) };
  });

  // --- L'ambiance d'une carte : météo et teinte (l'aperçu est dessiné par stage.js) ---
  const METEOS = [['aucune', 'Aucune'], ['pluie', 'Pluie'], ['orage', 'Orage'], ['neige', 'Neige'], ['brouillard', 'Brouillard'], ['feuilles', 'Feuilles qui tombent'], ['lucioles', 'Lucioles']];
  const ambianceVide = () => ({ meteo: 'aucune', intensite: 50, teinte: '', force: 30 });
  const normAmbiance = (a) => ({ meteo: pick(a?.meteo, METEOS, 'aucune'), intensite: int(a?.intensite, 50, 0, 100), teinte: normalizeHex(a?.teinte) || '', force: int(a?.force, 30, 0, 100) });

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

  function formAttaque(a, ctx) {
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

  function formObjet(o, ctx) {
    const idl = ctx.idLigne(o);
    const effet = el('div', { className: 'field-grid' });
    const majEffet = () => {
      const champs = EFFETS_OBJET.find(([k]) => k === o.effet.type)?.[2] || [];
      const e = o.effet;
      if (champs.includes('valeur') && e.valeur === undefined) e.valeur = { soin: 20, rappel: 50, pp: 10, pp_toutes: 10, pp_max: 1, ev: 10, niveau: 1, ivs: 31, balle: 1, repousse: 100 }[e.type] ?? 1;
      effet.replaceChildren(
        champ('Effet', sel(EFFETS_OBJET.map(([k, l]) => [k, l]), e.type, (v) => { o.effet = { type: v }; majEffet(); })),
        champs.includes('valeur') ? champ('Valeur', nombreIn(e, 'valeur', 0, 99999, e.type === 'balle' ? 0.5 : 1), UNITES_EFFET[e.type] || '') : null,
        champs.includes('stat') ? champ('Statistique', sel([...(e.type === 'ivs' ? [['choix', 'Au choix du joueur'], ['tous', 'Toutes']] : []), ...STATS], e.stat || (e.type === 'ivs' ? 'choix' : 'pv'), (v) => { e.stat = v; })) : null,
        champs.includes('statut') ? champ('Statut', sel([['', e.type === 'soin' ? 'Aucun' : 'Tous'], ...STATUTS.slice(1), ['tous', 'Tous']], e.statut || '', (v) => { if (v) e.statut = v; else delete e.statut; })) : null,
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
      info('Une menthe change l\'effet de la nature sur les statistiques ; une capsule met des IV au maximum ; une vitamine donne des EV. Un objet « Ouvre un passage » remplace les CS : mets-le comme objet requis d\'une zone (eau, rocher, arbre…).'),
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
            const c = await Events.formCondition({ ...doc, data: work }, a.condition?.type === choix ? a.condition : Events.CONDITIONS[choix].nouveau());
            if (c) { a.condition = c; rendre(); }
          };
          return b2;
        }, true],
      ], () => ({ sorte: 'objet', id: '', prix: 0, condition: null }), { ajouter: '+ Article', vide: 'Boutique vide.', change: ctx.renderListe }),
      info('Un article peut attendre un déblocage : un nombre de captures, de dresseurs battus ou d\'évolutions (compteurs), une quête finie, un interrupteur… Une boutique de créatures cachée derrière une quête : un article « créature » avec la condition « quête finie ».'),
      section('Utilisation'),
      ctx.usages('boutique', b.id),
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
  function formReglages(r, ctx) {
    const natures = el('table', { className: 'natures' }, [
      el('tr', {}, [el('th', { textContent: 'Nature' }), el('th', { textContent: '+10 %' }), el('th', { textContent: '−10 %' })]),
      ...NATURES.map(([, n, p, m]) => el('tr', {}, [el('td', { textContent: n }), el('td', { textContent: p ? libelleStat(p) : '—' }), el('td', { textContent: m ? libelleStat(m) : '—' })])),
    ]);
    ctx.form.append(
      section('Interface du jeu'),
      info('Le style des dialogues, du combat et des menus quand on joue dans Saga. Le joueur peut aussi le forcer dans les réglages de Saga.'),
      champ('Thème', sel(THEMES, r.interface.theme, (v) => { r.interface.theme = v; ctx.change?.(); })),
      champ('Couleur d\'accent', couleurAccent(r, ctx), 'les noms dans les dialogues, les curseurs, la barre d\'XP'),
      section('Argent et équipe'),
      el('div', { className: 'field-grid' }, [
        champ('Monnaie', ctx.input(r, 'monnaie', 'Pokédollars')),
        champ('Argent de départ', nombreIn(r, 'argent_depart', 0, 9999999)),
        champ('Créatures dans l\'équipe', nombreIn(r, 'equipe_max', 1, 12)),
        champ('Chance d\'une chromatique', nombreIn(r, 'chance_chromatique', 0, 100000), '1 sur… (0 = jamais)'),
      ]),
      section('Niveau maximum (selon les badges)'),
      info('Les créatures du joueur ne dépassent pas ce niveau tant qu\'il n\'a pas assez de badges : l\'aventure reste un défi.'),
      table(r.plafonds, [
        ['Badges', (p) => nombreIn(p, 'badges', 0, 99)],
        ['Niveau max', (p) => nombreIn(p, 'niveau', 1, 100)],
      ], () => ({ badges: (r.plafonds.at(-1)?.badges ?? -1) + 1, niveau: Math.min(100, (r.plafonds.at(-1)?.niveau || 10) + 5) }), { ajouter: '+ Palier', vide: 'Aucun plafond : jusqu\'au niveau 100.' }),
      section('Niveau des dresseurs'),
      champ('Les dresseurs s\'ajustent', sel(AJUSTEMENTS, r.ajustement, (v) => { r.ajustement = v; })),
      champ('Écart', nombreIn(r, 'ecart', -20, 20), 'niveaux en plus (ou en moins) que la référence'),
      info('Pour les dresseurs qui ont « son équipe suit le niveau du joueur » : leur niveau devient celui de la référence (+ l\'écart), sans jamais descendre sous le niveau écrit dans leur équipe.'),
      section('Les 25 natures'),
      info('Les natures sont celles du jeu officiel. Une menthe (objet « Change l\'effet de la nature ») remplace l\'effet sur les statistiques, comme dans les jeux récents.'),
      natures,
    );
  }

  const leadImage = (src) => el('img', { className: 'row-portrait pixel', src, alt: '' });
  const ONGLETS = [
    { key: 'types', groupe: 'Combat', label: 'Types', icon: 'symbol-color', kind: 'type', base: 'Nouveau type', nouveau: (id) => NORMES.types({ id, nom: 'Nouveau type' }), meta: () => '', lead: (t) => el('span', { className: 'row-dot', style: { background: t.couleur || COULEUR_TYPE } }), vide: 'Aucun type. Le plus simple : « Importer les données officielles » (les 18 types et leur table).', form: formType },
    { key: 'talents', groupe: 'Combat', label: 'Talents', icon: 'sparkle', kind: 'talent', base: 'Nouveau talent', nouveau: (id) => NORMES.talents({ id, nom: 'Nouveau talent' }), meta: () => '', vide: 'Aucun talent.', form: formTalent },
    { key: 'attaques', groupe: 'Combat', label: 'Attaques', icon: 'flame', kind: 'attaque', base: 'Nouvelle attaque', nouveau: (id) => NORMES.attaques({ id, nom: 'Nouvelle attaque', puissance: 40 }), meta: (a, work) => [work.types.find((t) => t.id === a.type)?.nom || '', a.puissance || ''].filter(Boolean).join(' · '), vide: 'Aucune attaque.', form: formAttaque },
    { key: 'creatures', groupe: 'Combat', label: 'Créatures', icon: 'bug', kind: 'creature', base: 'Nouvelle créature', nouveau: (id, work) => NORMES.creatures({ id, nom: 'Nouvelle créature', numero: Math.max(0, ...work.creatures.map((c) => c.numero)) + 1, types: work.types[0] ? [work.types[0].id] : [] }), meta: (c) => `#${String(c.numero).padStart(3, '0')}${c.legendaire ? ' ★' : ''}`, lead: (c) => (c.sprites.face ? leadImage(c.sprites.face) : null), vide: 'Aucune créature. Importe les officielles, ou crée les tiennes : sprites de face et de dos, types, statistiques, évolutions, attaques.', form: formCreature },
    { key: 'objets', groupe: 'Combat', label: 'Objets', icon: 'package', kind: 'objet', base: 'Nouvel objet', nouveau: (id) => NORMES.objets({ id, nom: 'Nouvel objet', prix: 100 }), meta: (o) => CATEGORIES_OBJET.find(([k]) => k === o.categorie)?.[1] || '', lead: (o) => (o.icone ? leadImage(o.icone) : null), vide: 'Aucun objet.', form: formObjet },
    { key: 'dresseurs', groupe: 'Monde', label: 'Dresseurs', icon: 'person-add', kind: 'dresseur', base: 'Nouveau dresseur', nouveau: (id) => NORMES.dresseurs({ id, nom: 'Nouveau dresseur', classe: 'Gamin', argent: 200 }), meta: (d) => `${d.equipe.length} créature(s)`, vide: 'Aucun dresseur. Les deux rivaux, les champions, les gamins des routes…', form: formDresseur },
    { key: 'boutiques', groupe: 'Monde', label: 'Boutiques', icon: 'tag', kind: 'boutique', base: 'Nouvelle boutique', nouveau: (id) => NORMES.boutiques({ id, nom: 'Nouvelle boutique' }), meta: (b) => `${b.articles.length} article(s)`, vide: 'Aucune boutique.', form: formBoutique },
    { key: 'reglages', groupe: 'Monde', label: 'Réglages', icon: 'settings-gear', unique: true, form: formReglages },
  ];
  for (const o of ONGLETS) o.chercher = o.chercher || ((x) => `${x.nom} ${x.id} ${x.numero ?? ''} ${x.officiel || ''}`);

  // Une ligne de texte par élément (pour Claude).
  function resumer(doc, sorte, o) {
    const d = doc.data;
    if (sorte === 'types') return `${o.id} « ${o.nom} » ×2 contre [${o.efficace.join(', ')}], ×½ [${o.peu_efficace.join(', ')}], ×0 [${o.sans_effet.join(', ')}]`;
    if (sorte === 'talents') return `${o.id} « ${o.nom} » : ${o.description}`;
    if (sorte === 'attaques') return `${o.id} « ${o.nom} » ${o.type} ${o.categorie} puissance ${o.puissance} précision ${o.precision || '—'} PP ${o.pp}${o.priorite ? ` priorité ${o.priorite}` : ''}${o.statut ? `, ${o.statut} ${o.chance_statut || 100} %` : ''}${o.stats.length ? `, stats ${o.stats_cible} ${o.stats.map((s) => `${s.stat} ${s.etages > 0 ? '+' : ''}${s.etages}`).join(' ')}` : ''}${o.effet ? ` : ${o.effet}` : ''}`;
    if (sorte === 'creatures') return `${o.id} « ${o.nom} » #${o.numero} [${o.types.join('/')}] ${STATS.map(([k]) => o.stats[k]).join('/')}${o.legendaire ? ` ${o.legendaire}` : ''}${o.evolutions.length ? `, évolue en ${o.evolutions.map((e) => `${e.vers} (${e.mode}${e.mode === 'niveau' ? ` ${e.niveau}` : e.objet ? ` ${e.objet}` : ''})`).join(', ')}` : ''}${o.sprites.face ? '' : ', sans sprite'}`;
    if (sorte === 'objets') return `${o.id} « ${o.nom} » ${o.categorie} ${o.prix} ${d.reglages.monnaie}, effet ${o.effet.type}${o.effet.valeur !== undefined ? ` ${o.effet.valeur}` : ''}${o.effet.stat ? ` ${o.effet.stat}` : ''}${o.effet.nature ? ` ${o.effet.nature}` : ''}`;
    if (sorte === 'dresseurs') return `${o.id} « ${o.nom} » ${o.classe}${o.personnage ? ` (personnage ${o.personnage})` : ''} : ${o.equipe.map((m) => `${m.creature} niv. ${m.niveau}`).join(', ') || 'équipe vide'}${o.ajuste ? ', s\'ajuste' : ''}`;
    if (sorte === 'boutiques') return `${o.id} « ${o.nom} » : ${o.articles.map((a) => `${a.id}${a.sorte === 'creature' ? ` (créature niv. ${a.niveau})` : ''}${a.prix ? ` ${a.prix}` : ''}${a.condition ? ` [si ${Events.resumeCondition(doc, a.condition)}]` : ''}`).join(', ') || 'vide'}${o.achete_creatures ? ', achète les créatures' : ''}`;
    return JSON.stringify(o);
  }

  return {
    SORTES, STATS, STATS_COMBAT, NATURES, CATEGORIES_ATTAQUE, CIBLES, STATUTS, CROISSANCES, MODES_EVOLUTION, CATEGORIES_OBJET, EFFETS_OBJET, AJUSTEMENTS, ONGLETS,
    METEOS, ambianceVide, normAmbiance, tableRencontres, normRencontres,
    vides, normer, normElement, reglagesVides, trouver, nomDe, efficacite, nature, utilisations, fusionner, demanderImport, telechargerOfficiel, listes, resumer, typePill,
  };
})();
