// Les familles d'actions de Claude dans Tafl (voir ../commun/claude-panneau.js, ClaudePanneau.familles).
// Quand Claude demande la permission, « Ne plus demander » vaut pour toute la famille de l'action :
// pendant la conversation, ou pour de bon (Réglages de Tafl, ou le bouclier du panneau Claude).
// Une action qui n'est dans aucune famille va dans « Les autres actions de Tafl ».

ClaudePanneau.familles({
  tuiles: {
    libelle: 'Dessiner et ranger les tuiles',
    actions: ['dessiner_tuile', 'rampe', 'peindre_tuile', 'dessiner_objet', 'animer_tuile', 'tuile', 'ranger_tuiles', 'ajouter_couleurs', 'animation', 'palette', 'dessiner_sprite', 'nommer'],
  },
  cartes: {
    libelle: 'Construire les cartes',
    actions: ['poser_tuiles', 'plan_carte', 'tampon', 'ecrire_carte', 'taille_carte', 'calque_carte', 'cartes', 'carte_monde', 'peindre_passage', 'passage_tuile', 'zone', 'teleporteur', 'depart', 'ambiance'],
  },
  jeu: {
    libelle: 'Les données du jeu (événements, personnages, quêtes…)',
    actions: ['evenement', 'personnage', 'quete', 'interrupteur', 'donnee', 'image_donnee', 'importer_officiel'],
  },
  fichiers_tafl: {
    libelle: 'Ouvrir, enregistrer, importer et exporter',
    actions: ['nouveau_jeu', 'ouvrir', 'importer_planche', 'enregistrer', 'enregistrer_sous', 'enregistrer_jeu', 'exporter_planche', 'exporter_planche_nommee', 'exporter_carte', 'exporter_tuiles', 'exporter_tiled'],
  },
  menus: {
    libelle: 'Les commandes des menus, annuler et rétablir',
    actions: ['menu', 'annuler', 'retablir'],
  },
});
