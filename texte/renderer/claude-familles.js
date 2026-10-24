// Les familles d'actions de Claude dans Edda (voir ../commun/claude-panneau.js, ClaudePanneau.familles).
// Quand Claude demande la permission, « Ne plus demander » vaut pour toute la famille de l'action :
// pendant la conversation, ou pour de bon (Réglages d'Edda, ou le bouclier du panneau Claude).
// Une action qui n'est dans aucune famille va dans « Les autres actions d'Edda ».

ClaudePanneau.familles({
  redaction: {
    libelle: 'Écrire et corriger dans les documents (annulable avec Ctrl+Z)',
    actions: ['inserer', 'remplacer_selection', 'remplacer_texte', 'ecrire_document', 'inserer_media', 'mise_en_page', 'nouveau_document'],
  },
  fichiers_edda: {
    libelle: 'Ouvrir et enregistrer des documents',
    actions: ['ouvrir_document', 'enregistrer', 'enregistrer_sous'],
  },
});
