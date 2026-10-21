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

const Regles = (() => {
  const pokemon = {
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
  };
  const PACKS = { pokemon };
  const pack = (jeu) => PACKS[jeu?.donnees?.reglages?.reglages?.regles] || pokemon;
  // Chaque fonction va au pack du jeu (le jeu est toujours le premier argument, ou dans l'objet de combattre).
  return {
    packs: () => Object.keys(PACKS),
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
  };
})();
