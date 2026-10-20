# Atelier ᚨ

Le hub de mes outils : il **lance, installe et met à jour** Rune, Skald et les suivants, et réunit des **widgets** pour le quotidien (notes, projets, presse-papiers, minuteurs, calendrier).

Tout reste sur ton PC, dans `%APPDATA%\atelier-hub` : réglages (`config.json`), notes, couleurs, minuteurs, calendrier, et le journal `atelier.log`. La désinstallation ne les efface pas.

## Installer Atelier (Windows)

Comme Rune et Skald : télécharge le dernier `Atelier-Setup-….exe` dans l'onglet **Releases** du dépôt, double-clique-le (si Windows affiche « Windows a protégé votre ordinateur » : **Informations complémentaires**, puis **Exécuter quand même**). Atelier s'installe dans `%LOCALAPPDATA%\Programs\Atelier`, sans droits administrateur.

Ensuite, Atelier installe lui-même Rune et Skald : plus besoin d'aller dans les Releases.

## La colonne Outils

Une carte par outil, avec sa version installée et la dernière publiée sur GitHub. Le bouton change selon le cas :

- **Installer** : l'outil n'est pas sur ce PC. Atelier télécharge son installeur, vérifie qu'il n'est pas abîmé (empreinte sha512 de `latest.yml`), puis l'ouvre : tu choisis le dossier comme d'habitude.
- **Mettre à jour** : une version plus récente existe. Atelier montre ce qui change, vérifie que l'outil est fermé, puis installe la nouvelle version **en silence** à la place de l'ancienne. Tes réglages sont gardés.
- **Lancer** : ouvre l'outil (double-clic sur son icône aussi). L'icône dossier ouvre son dossier d'installation.

Le bouton ↻ redemande les dernières versions à GitHub. Au démarrage, Atelier le fait tout seul (réglable).

**Comment Atelier trouve les outils installés.** Les installeurs de Rune et Skald s'inscrivent dans le registre de Windows, à l'endroit que lit « Paramètres › Applications » (nom, version, dossier). Atelier lit cet endroit ; s'il n'y trouve rien, il regarde `%LOCALAPPDATA%\Programs\<nom>`.

**Comment Atelier trouve les nouvelles versions.** Toutes les versions de tous les outils sont des Releases du même dépôt. Atelier garde pour chaque outil la plus récente dont l'étiquette commence par son préfixe (`rune-v`, `skald-v`).

### Ajouter un futur outil

1. Une ligne de plus dans [`outils.js`](outils.js) : nom, rune, description, préfixe d'étiquette, nom du `.exe`.
2. Son icône dans `renderer/outils/`.
3. Son installeur doit s'appeler `<Nom>-Setup-<version>.exe`, avec `latest.yml` dans sa Release, et sa Release **ne doit pas** être marquée « Latest » (comme Skald et Atelier : Rune cherche ses mises à jour dans la Release « Latest »).

## Les widgets

Chaque widget s'affiche ou se cache dans les réglages (`Ctrl+,`). Sur un écran ultralarge ils tiennent tous côte à côte ; sur un écran plus petit la zone défile.

- **Notes** : la première ligne devient le titre. Tout s'enregistre une demi-seconde après la dernière frappe. `Ctrl+N` nouvelle note, `Ctrl+F` chercher, l'épingle garde une note en haut.
- **Projets récents** : les dossiers de ton dossier de projets (`D:\Projets` par défaut, réglable), du plus récent au plus ancien, avec leur type (Vue, Vite, Node, HTML…), leur branche Git, les fichiers modifiés (● jaune), les commits à pousser (↑) ou à récupérer (↓). **Un clic ouvre le projet dans Rune** (il faut Rune 0.12 ou plus).
- **Presse-papiers et couleurs** : l'historique de ce que tu copies (texte seulement, 40 éléments) ; un clic le recopie. En haut, ta palette : clic sur une pastille = copier en HEX, clic droit = copier en RGB ou HSL. La pipette prend une couleur n'importe où sur l'écran. Un code couleur copié s'affiche avec sa pastille et le bouton ⊕ l'ajoute à la palette. Par défaut, l'historique est oublié à la fermeture (un mot de passe copié ne doit pas finir dans un fichier) ; un réglage permet de le garder.
- **Minuteurs** : 5, 15, 25 minutes, Pomodoro (25 min de travail, 5 min de pause, grande pause de 15 min toutes les 4 séances, enchaînés tout seuls), ou durée au choix avec `+`. À la fin : un carillon, une notification de Windows, et l'icône d'Atelier clignote dans la barre des tâches. Ils continuent de compter si tu fermes Atelier.
- **Calendrier** : double-clic sur un jour pour ajouter un évènement (heure facultative), clic pour le modifier ou le supprimer. Sous la grille : le jour choisi puis les 14 prochains jours. Si Atelier est ouvert, il te prévient 10 minutes avant un évènement qui a une heure.

## Mettre Atelier à jour

Le bouton nuage en haut à droite, comme dans Rune et Skald :

- Atelier **installé** : il cherche la Release `atelier-vX.Y.Z` la plus récente, la télécharge, se ferme, s'installe en silence et se relance.
- Atelier **lancé depuis le clone** : il lance `hub/mettre-a-jour.bat` (git pull + npm install) dans sa propre fenêtre, puis se relance.

### Publier une nouvelle version d'Atelier

1. Monte la version dans `hub/package.json` et fusionne sur `main`.
2. Pose l'étiquette et pousse-la :
   ```bat
   git tag atelier-v0.1.0
   git push origin atelier-v0.1.0
   ```
3. GitHub fabrique `Atelier-Setup-0.1.0.exe` (fichier `.github/workflows/atelier.yml`) et le publie dans les Releases, sans la marquer « Latest ».

Sur chaque pull request qui touche `hub/`, l'installeur est aussi fabriqué sans être publié : il se télécharge depuis l'onglet **Checks** de la PR, rubrique « Artifacts ».

## Lancer Atelier depuis le clone

```bat
cd hub
npm install
npm start
```

`F12` ouvre les outils de développement, `Ctrl+R` recharge l'interface.

## Les fichiers

| Fichier | Rôle |
|---------|------|
| `main.js` | Processus principal : fenêtre, registre de Windows, GitHub, téléchargement et lancement des installeurs, presse-papiers, fichiers de données, mise à jour d'Atelier |
| `preload.js` | Le pont : la liste des fonctions que l'interface a le droit d'appeler (`window.atelier`) |
| `outils.js` | La liste des outils gérés par Atelier |
| `renderer/index.html`, `style.css` | L'interface et son style (verre sombre, comme Rune et Skald) |
| `renderer/app.js` | Démarrage, thème, réglages, widgets affichés |
| `renderer/outils.js` | La colonne Outils |
| `renderer/notes.js`, `projets.js`, `presse-papiers.js`, `minuteurs.js`, `calendrier.js` | Un fichier par widget |
| `renderer/base.js`, `notify.js`, `dialogs.js`, `update.js` | Petits outils communs : raccourcis, notifications, fenêtres de dialogue, bouton de mise à jour |
