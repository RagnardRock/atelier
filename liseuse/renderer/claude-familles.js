// Les familles d'actions de Loki dans Kenning (voir ../commun/claude-panneau.js, ClaudePanneau.familles).
// Quand Loki demande la permission, « Ne plus demander » vaut pour toute la famille de l'action :
// pendant la conversation, ou pour de bon (Réglages de Kenning, ou le bouclier du panneau Loki).
// Lire la bibliothèque et les livres ne demande jamais (actions « lecture »).

ClaudePanneau.familles({
  surligner: {
    libelle: 'Surligner des passages et y écrire des notes',
    actions: ['surligner'],
  },
  ranger: {
    libelle: 'Ranger les livres et corriger leurs fiches',
    actions: ['ranger', 'modifier_fiche'],
  },
  affichage: {
    libelle: 'Changer les réglages de lecture (thème, police, taille)',
    actions: ['reglages_lecture'],
  },
});
