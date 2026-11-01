// Les règles du jeu, vues par le moteur (Saga 0.3, packs multiples depuis Saga 0.8).
//
// Le moteur (cartes, déplacements, scripts, sauvegarde, menus) ne connaît pas les règles des combats ni
// des personnages qui se battent : il passe toujours par cet objet `Regles`. Chaque pack de règles est un
// dossier (regles/pokemon/, regles/jrpg/) qui fournit un objet `pack` avec les fonctions ci-dessous. Le
// jeu choisit le sien dans Tafl (Données du jeu › Réglages › Règles, reglages.regles) ; un pack inconnu
// de Saga retombe sur « pokemon ».
//
// La documentation complète, avec les formes des données et un exemple de pack : REGLES.md, à côté.
//
// Un pack est un objet tout simple, sans DOM ni accès au disque : il reçoit les données du jeu (`jeu`)
// et la partie (`partie`), et ne parle au joueur que par l'objet `ui` qu'on lui prête. C'est ce qui
// permettra plus tard d'écrire un pack (ou d'en remplacer un morceau) dans un script du jeu.
//
// Ce qu'un pack doit fournir (« → » : ce que la fonction rend) :
//   nom                             son identifiant ('pokemon', 'jrpg')
//   capacites                       ce que ses jeux savent faire (voir CAPACITES ci-dessous)
//   menus                           la forme des menus par défaut (voir la forme ci-dessous)
//   existe(jeu, id)                 → le combattant `id` existe-t-il dans les données ?
//   creer(jeu, id, niveau)          → un nouveau membre pour la partie (équipe, boîte, adversaire)
//   completer(jeu, c)               → un membre lu dans une sauvegarde, remis à jour (ou null)
//   soigner(jeu, c)                 soin complet (centre, auberge, défaite)
//   resume(jeu, c)                  → { nom, niveau, pv, pvMax, statut, image } pour les listes et le carnet
//   rencontre(jeu, zone, partie)    → ce qu'on rencontre en marchant dans une zone (les options de
//                                   combattre : { sauvage } ou { groupe }), ou null
//   combattre({ jeu, partie, ui, sauvage, dresseur, groupe, fond }) → { issue }
//                                   issue : 'victoire', 'defaite', 'fuite' ou 'capture'
//   utilisable(jeu, objet)          → l'objet s'utilise-t-il depuis le sac, hors combat ?
//   utiliserObjet({ jeu, partie, ui, id }) → true s'il a servi
//   ecranEv({ jeu, partie, ui })    l'écran de la commande ecran_ev (les EV de Pokémon)
//   prixCreature(jeu, c)            → ce qu'une boutique paie pour ce membre
//   fiche(jeu, c)                   → le résumé d'un membre (menu Équipe, PC), voir pokemon/fiches.js
//   dex(jeu)                        → { nom, especes: [{ id, numero, nom, image }] } dans l'ordre
//   ficheEspece(jeu, id, { pris, vus }) → la page d'une espèce dans l'encyclopédie (ou null)
// Et, s'il en a besoin (sinon le moteur fait sans) :
//   ecran                           'duel' (un contre un, ecran-combat.js, par défaut) ou 'groupe'
//                                   (plusieurs contre plusieurs, ecran-groupe.js)
//   nouvellePartie(jeu, partie)     prépare une partie toute neuve (le héros rejoint le groupe…)
//   actionsMembre(jeu, c)           → [[id, nom]] : les actions en plus sur un membre dans le menu Équipe
//   agirMembre({ jeu, partie, ui, c, id }) fait l'une de ces actions
//   rejoindre(jeu, partie, id, niveau) → un membre qui rejoint le joueur (commande groupe), ou null
//   sauvage(jeu, partie, id, niveau, { min, max }) → une créature sauvage (Saga 0.7 ; sinon creer)
//   plafond(jeu, partie)            → le niveau maximum de l'équipe, montré dans le menu Équipe (Saga 0.7)
//   evolutionsEnAttente({ jeu, partie, ui }) après un script : ce qui évolue maintenant (Saga 0.7)
//   marcher(jeu, partie)            après chaque pas du joueur (Pokémon : l'amitié monte) (Saga 0.7)
// Saga 0.13 (pack JDR), toutes facultatives :
//   commandes                       { type: async ({ jeu, partie, ui, c, jouer, narrer, ranger }) → résultat }
//                                   les commandes des événements propres au pack (test, sauvegarde…)
//   condition(jeu, cond, partie)    → vrai, faux, ou undefined (une condition que le pack ne connaît pas)
//   debut({ jeu, partie, ui, ranger }) au début d'une nouvelle partie, quand le joueur est libre
//   actionsPause(jeu)               → [[id, nom, icône]] : des choix en plus dans le menu de pause
//   agirPause({ jeu, partie, ui, id }) fait l'un de ces choix
//   pourScript(jeu, partie)         → ce qu'un script JS lit des membres (saga.fiche)
// Saga 1.0 (l'écran « compose ton équipe »), toutes facultatives :
//   attaquesPossibles(jeu, id, niveau) → [{ id, nom, type, couleur, categorie, puissance, pp }]
//   attaquesDefaut(jeu, id, niveau) → [id] : les quatre cochées au départ
//   objetsTenables(jeu)             → [{ id, nom, description, icone }] (capacité « tenir »)
// Saga 1.11 (les bonus du groupe, moteur/bonus.js), facultatif :
//   statsBonus                      { stat: nom } : les statistiques de combat que le pack multiplie par
//                                   Bonus.mult(partie, stat) pour le groupe du joueur

const Regles = (() => {
  // Ce que les jeux d'un pack savent faire : le moteur et Tafl cachent le reste.
  //   capture     on attrape des créatures (balles, compteur des captures)
  //   relacher    on peut relâcher un membre (PC)
  //   ev          l'écran des EV (commande ecran_ev)
  //   vendre      les boutiques achètent et vendent des membres
  //   groupe      des héros rejoignent et quittent le groupe (commande groupe)
  //   tenir       un membre tient un objet (menu Équipe › Faire tenir un objet)
  //   table       le mode table : un MJ, des pions sur la grille, le brouillard (Saga 0.14, pack JDR)
  //   tempsReel   le joueur bouge librement et se bat sur la carte (Saga 1.12, pack action, action/temps-reel.js)
  const CAPACITES = { capture: false, relacher: false, ev: false, vendre: false, groupe: false, tenir: false, table: false, tempsReel: false };

  // La forme des menus : leurs noms, l'encyclopédie montrée ou non, la taille et la forme des boîtes,
  // les pages du résumé d'un membre (des ids de pages que la fiche du pack sait faire), et les mots de
  // l'encyclopédie (dex_pris : « Attrapés » ou « Vaincus », dex_pris_un, dex_vide).
  //   { equipe, dex, dex_visible, pc, boite, places, colonnes, forme_boites: 'grille' | 'liste',
  //     pages: [id], toutes_pages: [[id, nom]], dex_pris, dex_pris_un, dex_vide }
  const pokemon = {
    // Saga 1.11 : les bonus du groupe touchent ces statistiques en combat.
    statsBonus: { attaque: 'Attaque', defense: 'Défense', att_spe: 'Att. Spé.', def_spe: 'Déf. Spé.', vitesse: 'Vitesse' },
    nom: 'pokemon',
    ecran: 'duel',
    capacites: { capture: true, relacher: true, ev: true, vendre: true, groupe: false, tenir: true },
    menus: {
      equipe: 'Équipe', dex: 'Pokédex', dex_visible: true, pc: 'PC', boite: 'Boîte',
      places: 30, colonnes: 6, forme_boites: 'grille',
      pages: ['infos', 'stats', 'attaques'],
      toutes_pages: [['infos', 'Infos'], ['stats', 'Statistiques'], ['attaques', 'Attaques']],
      dex_pris: 'Attrapés', dex_pris_un: 'attrapé',
      dex_vide: 'Tu n\'as encore vu aucune créature. Celles que tu croises en combat s\'inscrivent ici.',
    },
    existe: (jeu, id) => Boolean(Creatures.trouver(jeu, 'creatures', id)),
    creer: (jeu, id, niveau, o) => Creatures.creer(jeu, id, niveau, o),
    // Saga 1.0 : ce qu'une espèce peut apprendre à ce niveau (apprentissage, CT, capacités œufs), pour l'écran
    // « compose ton équipe » de l'arène. Les quatre premières sont celles qu'elle connaîtrait.
    attaquesPossibles(jeu, id, niveau) {
      const e = Creatures.trouver(jeu, 'creatures', id);
      if (!e) return [];
      const ids = [];
      for (const a of (e.attaques || []).slice().sort((x, y) => (x.niveau || 0) - (y.niveau || 0))) {
        if ((a.niveau || 0) <= niveau && !ids.includes(a.attaque)) ids.push(a.attaque);
      }
      for (const x of e.ct || []) if (!ids.includes(x)) ids.push(x);
      // Saga 1.7 : les capacités œufs comptent aussi pour l'arène (on choisit librement).
      for (const x of e.oeufs || []) if (!ids.includes(x)) ids.push(x);
      return ids.map((x) => Creatures.trouver(jeu, 'attaques', x)).filter(Boolean).map((a) => {
        const t = Creatures.trouver(jeu, 'types', a.type);
        return { id: a.id, nom: a.nom || a.id, type: t?.nom || '', couleur: t?.couleur || '#888', categorie: a.categorie || '', puissance: Number(a.puissance) || 0, pp: Number(a.pp) || 10 };
      });
    },
    attaquesDefaut: (jeu, id, niveau) => Creatures.attaquesAuNiveau(jeu, Creatures.trouver(jeu, 'creatures', id), niveau),
    // Les objets qu'un membre peut tenir (menu Équipe › Faire tenir, et l'écran de l'arène).
    objetsTenables: (jeu) => (jeu.donnees.objets?.objets || []).filter((o) => o && o.id).map((o) => ({ id: o.id, nom: o.nom || o.id, description: o.description || '', icone: o.icone || '' })),
    // Saga 1.7 : ce qu'on peut régler en détail sur un membre choisi (l'arène), avec ses limites.
    detailsPossibles(jeu, id) {
      const e = Creatures.trouver(jeu, 'creatures', id);
      if (!e) return null;
      const nomTalent = (t) => Creatures.trouver(jeu, 'talents', t)?.nom || t;
      return {
        natures: Object.keys(Creatures.NATURES).map((n) => {
          const [haut, bas] = Creatures.NATURES[n] || [];
          return [n, `${n[0].toUpperCase()}${n.slice(1)}${haut ? ` (+${Creatures.NOMS_STATS[haut]}, −${Creatures.NOMS_STATS[bas]})` : ' (neutre)'}`];
        }),
        talents: [...new Set([...(e.talents || []), e.talent_cache].filter(Boolean))].map((t) => [t, nomTalent(t)]),
        stats: Creatures.STATS.map((x) => [x, Creatures.NOMS_STATS[x]]),
        ivMax: 31, evMax: 252, evTotal: 510,
      };
    },
    completer: (jeu, c) => Creatures.completer(jeu, c),
    soigner: (jeu, c) => Creatures.soigner(jeu, c),
    resume(jeu, c) {
      const espece = Creatures.espece(jeu, c);
      return {
        nom: Creatures.nom(jeu, c), niveau: c.niveau, pv: c.pv, pvMax: Creatures.pvMax(jeu, c),
        statut: c.statut ? Combat.NOMS_STATUTS[c.statut] || '' : '', image: espece?.sprites?.face || '', espece,
      };
    },
    // Les hautes herbes : une créature tirée parmi celles de la zone (les chances sont des poids).
    // Saga 0.7 : son niveau peut suivre la progression du joueur (sauvage, Tafl › Réglages).
    rencontre(jeu, zone, partie) {
      const possibles = (zone.rencontres || []).filter((r) => Creatures.trouver(jeu, 'creatures', r.creature));
      const total = possibles.reduce((s, r) => s + Math.max(0, Number(r.chance) || 0), 0);
      if (!possibles.length || total <= 0) return null;
      let tirage = Math.random() * total;
      const r = possibles.find((q) => (tirage -= Math.max(0, Number(q.chance) || 0)) < 0) || possibles[0];
      const min = Number(r.niveau_min) || 2, max = Math.max(min, Number(r.niveau_max) || min);
      return { sauvage: Creatures.sauvage(jeu, partie, r.creature, min + Math.floor(Math.random() * (max - min + 1)), { min, max }) };
    },
    combattre: (o) => Combat.lancer(o),
    // Hors combat (Saga 0.5) : objets du sac sur la carte, écran des EV, prix d'une créature vendue.
    utilisable: (jeu, objet) => HorsCombat.utilisable(objet),
    utiliserObjet: (o) => HorsCombat.utiliserObjet(o),
    ecranEv: (o) => HorsCombat.ecranEv(o),
    prixCreature: (jeu, c) => HorsCombat.prixCreature(jeu, c),
    // Les menus (Saga 0.6) : résumé, Pokédex.
    fiche: (jeu, c, partie) => Fiches.fiche(jeu, c, partie),
    dex: (jeu) => ({ nom: 'Pokédex', especes: Fiches.especes(jeu) }),
    ficheEspece: (jeu, id, etat) => Fiches.ficheEspece(jeu, id, etat),
    // Saga 0.7 : les sauvages qui suivent le joueur, le plafond des badges, les évolutions de quête.
    // Saga 0.7 : facultatives (sans elles, le comportement simple).
    sauvage: (jeu, partie, id, niveau, o) => Creatures.sauvage(jeu, partie, id, niveau, o),
    plafond: (jeu, partie) => Creatures.plafond(jeu, partie),
    evolutionsEnAttente: (o) => HorsCombat.evolutionsEnAttente(o),
    marcher: (jeu, partie) => HorsCombat.marcher(jeu, partie),
  };
  const PACKS = { pokemon, ...(typeof Jrpg !== 'undefined' ? { jrpg: Jrpg.pack } : {}), ...(typeof Jdr !== 'undefined' ? { jdr: Jdr.pack } : {}), ...(typeof ActionRegles !== 'undefined' ? { action: ActionRegles.pack } : {}) };
  const pack = (jeu) => PACKS[jeu?.donnees?.reglages?.reglages?.regles] || pokemon;
  // La forme des menus du jeu : celle du pack, et par-dessus ce que le jeu a réglé dans Tafl (un champ
  // vide ou faux garde celui du pack).
  const texte = (v, d) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 20) : d);
  const entier = (v, d, min, max) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.max(min, Math.min(max, Math.round(Number(v)))) : d);
  function menus(jeu) {
    const d = pack(jeu).menus, m = jeu?.donnees?.reglages?.reglages?.interface?.menus || {};
    const connues = d.toutes_pages.map(([id]) => id);
    const pages = (Array.isArray(m.pages) ? m.pages : []).filter((x) => connues.includes(x));
    return {
      ...pokemon.menus,
      ...d,
      equipe: texte(m.equipe, d.equipe), dex: texte(m.dex, d.dex), pc: texte(m.pc, d.pc), boite: texte(m.boite, d.boite),
      dex_visible: m.dex_visible === false ? false : d.dex_visible,
      places: entier(m.places, d.places, 1, 120), colonnes: entier(m.colonnes, d.colonnes, 1, 12),
      forme_boites: ['grille', 'liste'].includes(m.forme_boites) ? m.forme_boites : d.forme_boites,
      pages: pages.length ? pages : d.pages,
    };
  }
  // Chaque fonction va au pack du jeu (le jeu est toujours le premier argument, ou dans l'objet passé).
  return {
    CAPACITES,
    packs: () => Object.keys(PACKS),
    menus,
    nom: (jeu) => pack(jeu).nom,
    ecran: (jeu) => (pack(jeu).ecran === 'groupe' ? 'groupe' : 'duel'),
    capacites: (jeu) => ({ ...CAPACITES, ...pack(jeu).capacites }),
    existe: (jeu, ...a) => pack(jeu).existe(jeu, ...a),
    creer: (jeu, ...a) => pack(jeu).creer(jeu, ...a),
    completer: (jeu, ...a) => pack(jeu).completer(jeu, ...a),
    soigner: (jeu, ...a) => pack(jeu).soigner(jeu, ...a),
    // Saga 1.14 : rendre seulement n PV au groupe (un vol de vie). Un pack qui ne le sait pas ne fait rien.
    soignerPv: (jeu, partie, n) => Boolean(pack(jeu).soignerPv?.(jeu, partie, n)),
    // Un résumé sans image mais avec une apparence (un personnage) : le moteur dessine sa vignette.
    resume(jeu, c) {
      const r = pack(jeu).resume(jeu, c);
      if (!r.image && r.apparence && typeof Sprites !== 'undefined') r.image = Sprites.vignette(jeu, r.apparence);
      return r;
    },
    rencontre: (jeu, zone, partie) => pack(jeu).rencontre?.(jeu, zone, partie) || null,
    combattre: (o) => pack(o.jeu).combattre(o),
    utilisable: (jeu, ...a) => pack(jeu).utilisable(jeu, ...a),
    utiliserObjet: (o) => pack(o.jeu).utiliserObjet(o),
    ecranEv: (o) => pack(o.jeu).ecranEv(o),
    prixCreature: (jeu, ...a) => pack(jeu).prixCreature(jeu, ...a),
    nouvellePartie: (jeu, partie) => pack(jeu).nouvellePartie?.(jeu, partie),
    actionsMembre: (jeu, c) => pack(jeu).actionsMembre?.(jeu, c) || [],
    agirMembre: (o) => pack(o.jeu).agirMembre?.(o),
    rejoindre: (jeu, ...a) => pack(jeu).rejoindre?.(jeu, ...a) || null,
    // Saga 1.0 : l'écran « compose ton équipe ». Sans elles, on ne choisit que les membres.
    attaquesPossibles: (jeu, id, niveau) => pack(jeu).attaquesPossibles?.(jeu, id, niveau) || [],
    attaquesDefaut: (jeu, id, niveau) => pack(jeu).attaquesDefaut?.(jeu, id, niveau) || [],
    objetsTenables: (jeu) => (Regles.capacites(jeu).tenir ? pack(jeu).objetsTenables?.(jeu) || [] : []),
    detailsPossibles: (jeu, id) => pack(jeu).detailsPossibles?.(jeu, id) || null,
    // Le résumé : seulement les pages choisies, dans leur ordre.
    fiche(jeu, ...a) {
      const f = pack(jeu).fiche(jeu, ...a), ordre = menus(jeu).pages;
      const pages = ordre.map((id) => f.pages.find((p) => p.id === id)).filter(Boolean);
      return { ...f, pages: pages.length ? pages : f.pages };
    },
    dex: (jeu) => ({ ...pack(jeu).dex(jeu), nom: menus(jeu).dex }),
    ficheEspece: (jeu, ...a) => pack(jeu).ficheEspece(jeu, ...a),
    // Saga 0.7 : facultatives (sans elles, le comportement simple).
    sauvage: (jeu, partie, id, niveau, o) => (pack(jeu).sauvage ? pack(jeu).sauvage(jeu, partie, id, niveau, o) : pack(jeu).creer(jeu, id, niveau)),
    plafond: (jeu, partie) => (pack(jeu).plafond ? pack(jeu).plafond(jeu, partie) : null),
    evolutionsEnAttente: async (o) => { await pack(o.jeu).evolutionsEnAttente?.(o); },
    marcher: (jeu, partie) => { pack(jeu).marcher?.(jeu, partie); },
    // Saga 0.13 : facultatives (le pack JDR).
    commande: (jeu, type) => (Object.prototype.hasOwnProperty.call(pack(jeu).commandes || {}, type) ? pack(jeu).commandes[type] : null),
    condition: (jeu, cond, partie) => pack(jeu).condition?.(jeu, cond, partie),
    debut: async (o) => { await pack(o.jeu).debut?.(o); },
    actionsPause: (jeu) => pack(jeu).actionsPause?.(jeu) || [],
    agirPause: async (o) => { await pack(o.jeu).agirPause?.(o); },
    pourScript: (jeu, partie) => pack(jeu).pourScript?.(jeu, partie) || [],
    // Saga 1.11 : les statistiques que les bonus du groupe (moteur/bonus.js) peuvent toucher, { id: nom }.
    // Un pack sans statsBonus ignore les bonus (ils restent dans la partie, sans effet).
    statsBonus: (jeu) => ({ ...(pack(jeu).statsBonus || {}) }),
  };
})();
