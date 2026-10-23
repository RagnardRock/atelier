// Les familles d'actions de Claude dans Brokk (voir ../commun/claude-panneau.js, ClaudePanneau.familles).
// Quand Claude demande la permission, « Ne plus demander » vaut pour toute la famille de l'action :
// pendant la conversation, ou pour de bon (Réglages de Brokk, ou le bouclier du panneau Claude).
// Une action qui n'est dans aucune famille va dans « Les autres actions de Brokk ».

ClaudePanneau.familles({
  assets: {
    libelle: 'Ajouter, régler et retirer des assets',
    actions: ['ajouter_asset', 'regler_asset', 'dupliquer_asset', 'retirer_asset'],
  },
  export_brokk: {
    libelle: 'Exporter (et surveiller les fichiers sources)',
    actions: ['exporter', 'surveillance'],
  },
  projet: {
    libelle: 'Ouvrir un projet',
    actions: ['ouvrir_projet'],
  },
});
