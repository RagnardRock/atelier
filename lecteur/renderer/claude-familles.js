// Les familles d'actions de Claude dans Mímir (voir ../commun/claude-panneau.js, ClaudePanneau.familles).
// Quand Claude demande la permission, « Ne plus demander » vaut pour toute la famille de l'action :
// pendant la conversation, ou pour de bon (Réglages de Mímir, ou le bouclier du panneau Claude).
// Lire et regarder les documents ne demande jamais (actions « lecture »).

ClaudePanneau.familles({
  annoter: {
    libelle: 'Surligner et écrire sur les PDF',
    actions: ['surligner', 'ecrire_texte'],
  },
  formulaires: {
    libelle: 'Remplir les formulaires PDF',
    actions: ['remplir_champs'],
  },
  enregistrer_pdf: {
    libelle: 'Enregistrer les PDF',
    actions: ['enregistrer'],
  },
  documents: {
    libelle: 'Ouvrir des documents',
    actions: ['ouvrir_document'],
  },
});
