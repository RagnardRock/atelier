// Les familles d'actions de Claude dans Skald (voir ../commun/claude-panneau.js, ClaudePanneau.familles).
// Quand Claude demande la permission, « Ne plus demander » vaut pour toute la famille de l'action :
// pendant la conversation, ou pour de bon (Réglages de Skald, ou le bouclier du panneau Claude).
// Une action qui n'est dans aucune famille va dans « Les autres actions de Skald ».

ClaudePanneau.familles({
  dessin: {
    libelle: 'Peindre et dessiner (pinceau, remplissage, dégradé, formes, texte)',
    actions: ['peindre', 'remplir', 'degrade', 'forme', 'texte', 'couleurs'],
  },
  retouche: {
    libelle: 'Retoucher l\'image et ses calques (taille, recadrage, sélection…)',
    actions: ['redimensionner', 'zone_de_travail', 'recadrer', 'rogner_vide', 'retoucher', 'calque', 'regler_calque', 'selection'],
  },
  fichiers_skald: {
    libelle: 'Ouvrir, enregistrer et exporter',
    actions: ['nouvelle_image', 'ouvrir', 'onglet', 'enregistrer', 'enregistrer_sous', 'exporter', 'pack_icones'],
  },
  menus: {
    libelle: 'Les commandes des menus, annuler et rétablir',
    actions: ['menu', 'annuler', 'retablir'],
  },
});
