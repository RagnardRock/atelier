// Le catalogue des modules de jeu, commun à Tafl et Saga (Saga 1.4, Tafl 1.2).
//
// Un jeu a UN pack de règles (reglages.regles : comment on se bat, comment on progresse) et ZÉRO, UN ou
// PLUSIEURS modules (reglages.modules : ce que le jeu sait faire en plus dans le monde, quel que soit son
// pack). Le contrat d'un module, côté Saga, est dans moteur/renderer/moteur/modules/MODULES.md.
//
// Ce fichier ne contient que la DESCRIPTION des modules : ce que Tafl doit savoir pour les proposer dans
// ses Réglages, garder leurs données et vérifier les scripts qui écoutent leurs moments. Le code qui fait
// tourner un module vit dans Saga (moteur/renderer/moteur/modules/<id>/).
//
// Une entrée du catalogue :
//   id: {
//     nom: 'Gestion',                      le nom montré dans Tafl
//     description: '…',                    une phrase : ce qu'il ajoute au jeu
//     donnees: ['batiments', …],           ses fichiers de donnees/ (Tafl les garde, Saga les lit)
//     moments: { nom: { nom, infos } },    les moments qu'il annonce aux scripts (quand(nom, fn))
//     commandes: { type: { nom } },        les commandes d'événement qu'il ajoute
//     conditions: { type: { nom } },       les conditions de page qu'il ajoute
//   }
//
// Le catalogue est vide tant qu'aucun module n'existe : le premier sera « gestion ».

const ModulesJeu = (() => {
  const CATALOGUE = {};

  // Un id de module : minuscules, chiffres et tirets, qui commence par une lettre.
  const ID = /^[a-z][a-z0-9-]{0,39}$/;

  // Les modules qu'un jeu active (reglages.modules), dans l'ordre, sans doublon. Un id inconnu de ce
  // catalogue est gardé (un Tafl ou un Saga plus récent le connaît peut-être) : Saga l'ignore et le dit.
  function actifs(reglages) {
    const liste = Array.isArray(reglages?.modules) ? reglages.modules : [];
    return [...new Set(liste.filter((id) => typeof id === 'string' && ID.test(id)))];
  }
  // Seulement ceux que ce catalogue connaît.
  const connus = (reglages) => actifs(reglages).filter((id) => Object.prototype.hasOwnProperty.call(CATALOGUE, id));
  // Les moments que les modules actifs annoncent aux scripts, à ajouter à ceux de Saga (BacASable.MOMENTS).
  const moments = (reglages) => Object.assign({}, ...connus(reglages).map((id) => CATALOGUE[id].moments || {}));
  // Les fichiers de donnees/ des modules actifs.
  const donnees = (reglages) => [...new Set(connus(reglages).flatMap((id) => CATALOGUE[id].donnees || []))];

  return { CATALOGUE, ID, actifs, connus, moments, donnees };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ModulesJeu;
