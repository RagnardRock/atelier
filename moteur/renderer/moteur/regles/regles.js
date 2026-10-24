// Les règles du jeu, vues par le moteur (Saga 0.3).
//
// Le moteur (cartes, déplacements, scripts, sauvegarde) ne connaît pas les règles des combats ni des
// créatures : il passe toujours par cet objet `Regles`. Chaque pack de règles est un dossier
// (regles/pokemon/ pour l'instant) qui fournit les mêmes fonctions. Le jeu choisit le sien dans Tafl
// (Tafl 0.16 : reglages.regles) ; un pack inconnu de Saga retombe sur « pokemon ». L'écran de combat
// (ecran-combat.js) reste le même : il montre ce qu'on lui dit.
//
// Ce qu'un jeu de règles doit fournir :
//   existe(jeu, id)                 la créature `id` existe-t-elle dans les données ?
//   creer(jeu, id, niveau)          une nouvelle créature pour la partie (équipe, boîte, adversaire)
//   completer(jeu, c)               remet à jour une créature lue dans une sauvegarde (ou null)
//   soigner(jeu, c)                 soin complet (centre, défaite)
//   resume(jeu, c)                  { nom, niveau, pv, pvMax, statut, sprite } pour le carnet
//   combattre({ jeu, partie, ui, sauvage, dresseur, fond }) → { issue }
//                                   issue : 'victoire', 'defaite', 'fuite' ou 'capture'
//   utilisable(jeu, objet)          l'objet s'utilise-t-il depuis le sac, hors combat ?
//   utiliserObjet({ jeu, partie, ui, id }) → true s'il a servi (ui : dire, liste, quantite, ev)
//   ecranEv({ jeu, partie, ui })    l'écran où le joueur répartit les EV (commande ecran_ev)
//   prixCreature(jeu, c)            ce qu'une boutique paie pour cette créature
//   fiche(jeu, c)                   le résumé d'une créature (menu Équipe, PC), voir pokemon/fiches.js
//   dex(jeu)                        { nom, especes: [{ id, numero, nom, image }] } dans l'ordre du Pokédex
//   ficheEspece(jeu, id, { pris, vus }) la page d'une espèce dans le Pokédex (ou null)
//   menus                           la forme des menus par défaut (voir FORME ci-dessous) : le jeu peut
//                                   la changer dans Tafl › Réglages › Interface › Menus (Saga 0.6)
//
// Facultatif (Saga 0.7) : un pack qui ne les a pas garde le comportement simple écrit entre parenthèses.
//   sauvage(jeu, partie, id, niveau, { min, max })   une créature sauvage des herbes (creer tel quel)
//   plafond(jeu, partie)            le niveau maximum de l'équipe, montré dans le menu Équipe (aucun)
//   evolutionsEnAttente({ jeu, partie, ui })        après un script : ce qui évolue maintenant (rien)
//   marcher(jeu, partie)            après chaque pas du joueur (Pokémon : l'amitié monte) (rien)

const Regles = (() => {
  // La forme des menus : leurs noms, le Pokédex montré ou non, la taille et la forme des boîtes du PC,
  // les pages du résumé d'une créature (des ids de pages que la fiche du pack sait faire).
  //   { equipe, dex, dex_visible, pc, boite, places, colonnes, forme_boites: 'grille' | 'liste',
  //     pages: [id], toutes_pages: [[id, nom]] }
  const pokemon = {
    menus: {
      equipe: 'Équipe', dex: 'Pokédex', dex_visible: true, pc: 'PC', boite: 'Boîte',
      places: 30, colonnes: 6, forme_boites: 'grille',
      pages: ['infos', 'stats', 'attaques'],
      toutes_pages: [['infos', 'Infos'], ['stats', 'Statistiques'], ['attaques', 'Attaques']],
    },
    nom: 'pokemon',
    existe: (jeu, id) => Boolean(Creatures.trouver(jeu, 'creatures', id)),
    creer: (jeu, id, niveau) => Creatures.creer(jeu, id, niveau),
    completer: (jeu, c) => Creatures.completer(jeu, c),
    soigner: (jeu, c) => Creatures.soigner(jeu, c),
    resume(jeu, c) {
      return {
        nom: Creatures.nom(jeu, c), niveau: c.niveau, pv: c.pv, pvMax: Creatures.pvMax(jeu, c),
        statut: c.statut ? Combat.NOMS_STATUTS[c.statut] || '' : '', espece: Creatures.espece(jeu, c),
      };
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
    sauvage: (jeu, partie, id, niveau, o) => Creatures.sauvage(jeu, partie, id, niveau, o),
    plafond: (jeu, partie) => Creatures.plafond(jeu, partie),
    evolutionsEnAttente: (o) => HorsCombat.evolutionsEnAttente(o),
    marcher: (jeu, partie) => HorsCombat.marcher(jeu, partie),
  };
  const PACKS = { pokemon };
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
      ...d,
      equipe: texte(m.equipe, d.equipe), dex: texte(m.dex, d.dex), pc: texte(m.pc, d.pc), boite: texte(m.boite, d.boite),
      dex_visible: m.dex_visible === false ? false : d.dex_visible,
      places: entier(m.places, d.places, 1, 120), colonnes: entier(m.colonnes, d.colonnes, 1, 12),
      forme_boites: ['grille', 'liste'].includes(m.forme_boites) ? m.forme_boites : d.forme_boites,
      pages: pages.length ? pages : d.pages,
    };
  }
  // Chaque fonction va au pack du jeu (le jeu est toujours le premier argument, ou dans l'objet de combattre).
  return {
    packs: () => Object.keys(PACKS),
    menus,
    nom: (jeu) => pack(jeu).nom,
    existe: (jeu, ...a) => pack(jeu).existe(jeu, ...a),
    creer: (jeu, ...a) => pack(jeu).creer(jeu, ...a),
    completer: (jeu, ...a) => pack(jeu).completer(jeu, ...a),
    soigner: (jeu, ...a) => pack(jeu).soigner(jeu, ...a),
    resume: (jeu, ...a) => pack(jeu).resume(jeu, ...a),
    combattre: (o) => pack(o.jeu).combattre(o),
    utilisable: (jeu, ...a) => pack(jeu).utilisable(jeu, ...a),
    utiliserObjet: (o) => pack(o.jeu).utiliserObjet(o),
    ecranEv: (o) => pack(o.jeu).ecranEv(o),
    prixCreature: (jeu, ...a) => pack(jeu).prixCreature(jeu, ...a),
    // Le résumé : seulement les pages choisies, dans leur ordre.
    fiche(jeu, ...a) {
      const f = pack(jeu).fiche(jeu, ...a), ordre = menus(jeu).pages;
      const pages = ordre.map((id) => f.pages.find((p) => p.id === id)).filter(Boolean);
      return { ...f, pages: pages.length ? pages : f.pages };
    },
    dex: (jeu) => ({ ...pack(jeu).dex(jeu), nom: menus(jeu).dex }),
    ficheEspece: (jeu, ...a) => pack(jeu).ficheEspece(jeu, ...a),
    sauvage: (jeu, partie, id, niveau, o) => (pack(jeu).sauvage ? pack(jeu).sauvage(jeu, partie, id, niveau, o) : pack(jeu).creer(jeu, id, niveau)),
    plafond: (jeu, partie) => (pack(jeu).plafond ? pack(jeu).plafond(jeu, partie) : null),
    evolutionsEnAttente: async (o) => { await pack(o.jeu).evolutionsEnAttente?.(o); },
    marcher: (jeu, partie) => { pack(jeu).marcher?.(jeu, partie); },
  };
})();
