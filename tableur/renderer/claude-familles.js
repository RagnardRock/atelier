// Les familles d'actions de Claude dans Reikna (voir ../commun/claude-panneau.js, ClaudePanneau.familles).
// Quand Claude demande la permission, « Ne plus demander » vaut pour toute la famille de l'action :
// pendant la conversation, ou pour de bon (Réglages de Reikna, ou le bouclier du panneau Claude).
// Une action qui n'est dans aucune famille va dans « Les autres actions de Reikna ».

ClaudePanneau.familles({
  cellules: {
    libelle: 'Écrire dans les cellules (valeurs, formules, recopie, effacer)',
    actions: ['ecrire', 'recopier', 'effacer'],
  },
  mise_en_forme: {
    libelle: 'Mettre en forme (couleurs, formats, bordures, largeurs, fusions, volets, filtre, mise en forme conditionnelle)',
    actions: ['mettre_en_forme', 'largeur_colonnes', 'hauteur_lignes', 'fusionner', 'figer', 'filtre', 'mise_en_forme_conditionnelle', 'effacer_regles'],
  },
  structure: {
    libelle: 'Insérer, supprimer et trier des lignes ou des colonnes',
    actions: ['inserer', 'supprimer', 'trier'],
  },
  graphiques: {
    libelle: 'Insérer, modifier et supprimer des graphiques',
    actions: ['graphique', 'modifier_graphique', 'supprimer_graphique'],
  },
  feuilles: {
    libelle: 'Ajouter, renommer et supprimer des feuilles',
    actions: ['ajouter_feuille', 'renommer_feuille', 'supprimer_feuille'],
  },
  fichier: {
    libelle: 'Ouvrir, enregistrer ou commencer un classeur',
    actions: ['ouvrir', 'enregistrer', 'nouveau'],
  },
});
