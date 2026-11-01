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
//     textes: { cle: [défaut, libellé] },  (Saga 1.13) les mots de ses écrans, que le jeu peut changer
//                                          (Tafl les montre ; vide dans le jeu : le défaut)
//   }
//
// Le premier module est « gestion » (Saga 1.5, Tafl 1.3).

const ModulesJeu = (() => {
  const CATALOGUE = {
    // Saga 1.5, Tafl 1.3 : moteur/renderer/moteur/modules/gestion/.
    gestion: {
      nom: 'Gestion',
      description: 'Un stock commun, des bâtiments à construire qui produisent chaque nuit (quand le joueur dort), et des habitants qui y logent, mangent et y travaillent. Des bâtiments de repos soignent le groupe et lui donnent un bonus pour les combats ; le butin peut aller au stock. Les ressources et les bâtiments sont des données du jeu.',
      donnees: ['ressources', 'batiments'],
      moments: {
        gestion_termine: { nom: 'Un chantier est terminé (pendant la nuit)', infos: { batiment: 'L\'id du type de bâtiment' } },
        gestion_arrivee: { nom: 'Des habitants arrivent (pendant la nuit)', infos: { nombre: 'Combien sont arrivés', habitants: 'Combien vivent maintenant au domaine' } },
        gestion_depart: { nom: 'Un habitant part, après trop de nuits de faim', infos: { nombre: 'Combien sont partis', habitants: 'Combien vivent maintenant au domaine' } },
      },
      commandes: {
        gestion_construire: { nom: 'Construire un bâtiment' },
        gestion_placer: { nom: 'Placer un bâtiment (le joueur choisit où)' },
        gestion_stock: { nom: 'Ajouter ou retirer une ressource du stock' },
        gestion_deposer: { nom: 'Déposer le sac au stock' },
        gestion_habitants: { nom: 'Des habitants arrivent ou partent' },
        gestion_sortir: { nom: 'Ressortir du bâtiment (devant sa porte)' },
        gestion_domaine: { nom: 'Ouvrir l\'écran du domaine' },
        gestion_repos: { nom: 'Se reposer dans un bâtiment de repos (soin et bonus)' },
      },
      conditions: {
        gestion_batiment: { nom: 'Un bâtiment est construit' },
        gestion_chantier: { nom: 'Un chantier est en cours' },
        gestion_stock: { nom: 'Le stock a assez d\'une ressource' },
        gestion_habitants: { nom: 'Le domaine a assez d\'habitants' },
      },
      // Saga 1.13 : les mots des écrans du domaine (modules_reglages.gestion.textes). produit, mange,
      // utilise et perdu prennent un s tout seuls quand il y en a plusieurs.
      textes: {
        stock: ['Stock', 'Écran du domaine : la section du stock'],
        habitants: ['Habitants', 'Écran du domaine : la section des habitants'],
        groupe: ['Le groupe', 'Écran du domaine : la section des bonus du groupe'],
        batiments: ['Bâtiments', 'Écran du domaine : la section des bâtiments'],
        loges: ['Logés', 'Les habitants logés'],
        travail: ['Au travail', 'Les habitants au travail'],
        repas: ['Repas de ce soir', 'Ce que mangeront les habitants'],
        termine: ['Terminé', 'Un bâtiment fini'],
        chantier: ['en chantier', 'Un bâtiment pas encore fini'],
        fini_demain: ['fini demain matin', 'Un chantier qui finit cette nuit'],
        cette_nuit: ['cette nuit', 'La prévision sous une ressource'],
        vide: ['Aucun pour l\'instant', 'Aucun bâtiment, aucune ressource'],
        rapport_stock: ['Le stock', 'Rapport du matin : la section du bilan'],
        rapport_domaine: ['', 'Rapport du matin : la section du reste (vide : le nom du domaine)'],
        produit: ['produit', 'Bilan : ce qui a été produit'],
        mange: ['mangé', 'Bilan : ce qui a été mangé'],
        utilise: ['utilisé', 'Bilan : ce que les bâtiments ont utilisé'],
        perdu: ['perdu', 'Bilan : ce qui a été perdu (stock plein)'],
      },
    },
  };

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
