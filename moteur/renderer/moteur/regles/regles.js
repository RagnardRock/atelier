// Les règles du jeu, vues par le moteur (Saga 0.3).
//
// Le moteur (cartes, déplacements, scripts, sauvegarde) ne connaît pas les règles des combats ni des
// créatures : il passe toujours par cet objet `Regles`. Les règles actuelles sont celles des jeux
// Pokémon (dossier regles/pokemon/). Pour un jeu avec d'autres règles, on écrira un autre dossier
// (regles/autre/) qui fournit les mêmes fonctions, et on le choisira ici (plus tard : par un réglage
// du jeu dans Tafl). L'écran de combat (ecran-combat.js) reste le même : il montre ce qu'on lui dit.
//
// Ce qu'un jeu de règles doit fournir :
//   existe(jeu, id)                 la créature `id` existe-t-elle dans les données ?
//   creer(jeu, id, niveau)          une nouvelle créature pour la partie (équipe, boîte, adversaire)
//   completer(jeu, c)               remet à jour une créature lue dans une sauvegarde (ou null)
//   soigner(jeu, c)                 soin complet (centre, défaite)
//   resume(jeu, c)                  { nom, niveau, pv, pvMax, statut, sprite } pour le carnet
//   combattre({ jeu, partie, ui, sauvage, dresseur, fond }) → { issue }
//                                   issue : 'victoire', 'defaite', 'fuite' ou 'capture'

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
  };
  return pokemon;
})();
