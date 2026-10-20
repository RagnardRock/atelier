# Atelier ᚨ

Le hub de mes outils : il **lance, installe et met à jour** Rune, Skald et les suivants, et réunit des **widgets** pour le quotidien (notes, projets, presse-papiers, minuteurs, calendrier, et Claude).

Tout reste sur ton PC, dans `%APPDATA%\atelier-hub` : réglages (`config.json`), notes, couleurs, minuteurs, calendrier, et le journal `atelier.log`. La désinstallation ne les efface pas.

## Installer Atelier (Windows)

Comme Rune et Skald : télécharge le dernier `Atelier-Setup-….exe` dans l'onglet **Releases** du dépôt, double-clique-le (si Windows affiche « Windows a protégé votre ordinateur » : **Informations complémentaires**, puis **Exécuter quand même**). Atelier s'installe dans `%LOCALAPPDATA%\Programs\Atelier`, sans droits administrateur.

Ensuite, Atelier installe lui-même Rune, Skald et Brokk : plus besoin d'aller dans les Releases.

## La colonne Outils

Une carte par outil, avec sa version installée et la dernière publiée sur GitHub. Le bouton change selon le cas :

- **Installer** : l'outil n'est pas sur ce PC. Atelier télécharge son installeur, vérifie qu'il n'est pas abîmé (empreinte sha512 de `latest.yml`), puis l'ouvre : tu choisis le dossier comme d'habitude.
- **Mettre à jour** : une version plus récente existe. Atelier montre ce qui change, vérifie que l'outil est fermé, puis installe la nouvelle version **en silence** à la place de l'ancienne. Tes réglages sont gardés.
- **Lancer** : ouvre l'outil (double-clic sur son icône aussi). L'icône dossier ouvre son dossier d'installation.

Le bouton ↻ redemande les dernières versions à GitHub. Au démarrage, Atelier le fait tout seul (réglable).

**Comment Atelier trouve les outils installés.** Les installeurs de Rune, Skald et Brokk s'inscrivent dans le registre de Windows, à l'endroit que lit « Paramètres › Applications » (nom, version, dossier). Atelier lit cet endroit ; s'il n'y trouve rien, il regarde `%LOCALAPPDATA%\Programs\<nom>`.

**Comment Atelier trouve les nouvelles versions.** Toutes les versions de tous les outils sont des Releases du même dépôt. Atelier garde pour chaque outil la plus récente dont l'étiquette commence par son préfixe (`rune-v`, `skald-v`, `brokk-v`).

### Ajouter un futur outil

1. Une ligne de plus dans [`outils.js`](outils.js) : nom, rune, description, préfixe d'étiquette, nom du `.exe`, et la version à partir de laquelle il sait ouvrir un dossier.
2. Son icône dans `renderer/outils/`.
3. Son installeur doit s'appeler `<Nom>-Setup-<version>.exe`, avec `latest.yml` dans sa Release, et sa Release **ne doit pas** être marquée « Latest » (comme Skald, Brokk et Atelier : Rune cherche ses mises à jour dans la Release « Latest »).

## Les widgets

Chaque widget s'affiche ou se cache dans les réglages (`Ctrl+,`). Sur un écran ultralarge ils tiennent tous côte à côte ; sur un écran plus petit la zone défile.

- **Notes** : la première ligne devient le titre. Tout s'enregistre une demi-seconde après la dernière frappe. `Ctrl+N` nouvelle note, `Ctrl+F` chercher, l'épingle garde une note en haut.
- **Projets récents** : les dossiers de ton dossier de projets (`D:\Projets` par défaut, réglable), du plus récent au plus ancien, avec leur type (Vue, Vite, Node, HTML, Images…), leur branche Git, les fichiers modifiés (● jaune), les commits à pousser (↑) ou à récupérer (↓).
  - **Un clic ouvre le projet avec son outil**, montré par la petite icône à gauche. Atelier le devine en comptant les fichiers : un projet surtout fait d'images (PSD, AI, PNG, SVG…) s'ouvre dans **Skald** (la fenêtre « Ouvrir » se place dans le dossier), le reste dans **Rune** (sur le dossier).
  - **Clic droit** : ouvrir avec Rune, Skald ou l'Explorateur, **« Exporter les assets avec Brokk »** (Brokk s'ouvre avec ce projet comme destination), et « Toujours ouvrir ce projet avec… » pour corriger la devinette. Ce choix est gardé dans les réglages d'Atelier, rien n'est ajouté au dossier du projet.
  - Il faut Rune 0.12 et Skald 0.3 ou plus : une version plus ancienne s'ouvrirait sur son dernier dossier, alors Atelier te propose plutôt de la mettre à jour.
- **Presse-papiers et couleurs** : l'historique de ce que tu copies (texte seulement, 40 éléments) ; un clic le recopie. En haut, ta palette : clic sur une pastille = copier en HEX, clic droit = copier en RGB ou HSL. La pipette prend une couleur n'importe où sur l'écran. Un code couleur copié s'affiche avec sa pastille et le bouton ⊕ l'ajoute à la palette. Par défaut, l'historique est oublié à la fermeture (un mot de passe copié ne doit pas finir dans un fichier) ; un réglage permet de le garder.
- **Minuteurs** : 5, 15, 25 minutes, Pomodoro (25 min de travail, 5 min de pause, grande pause de 15 min toutes les 4 séances, enchaînés tout seuls), ou durée au choix avec `+`. À la fin : un carillon, une notification de Windows, et l'icône d'Atelier clignote dans la barre des tâches. Ils continuent de compter si tu fermes Atelier.
- **Calendrier** : double-clic sur un jour pour ajouter un évènement (heure facultative), clic pour le modifier ou le supprimer. Sous la grille : le jour choisi puis les 14 prochains jours. Si Atelier est ouvert, il te prévient 10 minutes avant un évènement qui a une heure.
- **Claude** : une conversation avec Claude Code (celui installé sur ton PC, avec ton compte : pas de clé API). Il connaît tes notes, ton calendrier et tes projets récents avec leurs commits des 30 derniers jours : avant chacun de tes messages, Atelier les écrit en Markdown dans `%APPDATA%\atelier-hub\claude` (bouton dossier du widget), et Claude les lit. Il ne modifie aucun fichier et ne lance aucune commande (outils Read, Glob, Grep), et ne voit jamais le presse-papiers. En revanche il peut **agir dans Atelier** : ajouter, modifier ou supprimer une note ou un évènement, lancer un minuteur, ouvrir un projet, lancer Rune ou Skald. Ces actions passent par un petit serveur MCP (`mcp-atelier.js`, le seul qu'il voit) et sont faites par les widgets eux-mêmes, qui se mettent à jour tout de suite. Avant chaque action, une carte te demande Autoriser ou Refuser ; « Toujours autoriser » ne demande plus pour cette famille d'actions (notes, calendrier, minuteurs, projets). Il a aussi une **mémoire par projet** : quand tu lui apprends quelque chose (hébergement, client, décision, étapes restantes…), il peut le retenir ; Atelier le garde dans `projets-memoire.json` et le lui redonne dans `projets.md` à chaque message. Un marque-page à côté du nom du projet, dans Projets récents, montre ce qu'il retient (clic droit › « Ce que Claude retient… » pour le modifier). Dans les réglages : le modèle, la commande `claude`, s'il peut lire les fichiers de tes projets, s'il peut agir, et les familles (notes, calendrier, minuteurs, projets, mémoire) d'actions qui ne demandent plus. La conversation est gardée et reprise au prochain démarrage ; `+` en commence une nouvelle.

## Mettre Atelier à jour

Le bouton nuage en haut à droite, comme dans Rune et Skald :

- Atelier **installé** : il cherche la Release `atelier-vX.Y.Z` la plus récente, la télécharge, se ferme, s'installe en silence et se relance.
- Atelier **lancé depuis le clone** : il lance `hub/mettre-a-jour.bat` (git pull + npm install) dans sa propre fenêtre, puis se relance.

### Publier une nouvelle version d'Atelier

Monte la version dans `hub/package.json` dans la PR. Quand elle est fusionnée sur `main`, GitHub fabrique `Atelier-Setup-<version>.exe` (fichier `.github/workflows/atelier.yml`), crée l'étiquette `atelier-v<version>` et publie la Release, sans la marquer « Latest ». Pas d'étiquette à poser à la main.

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
| `claude.js` | Widget Claude côté processus principal : lance Claude Code, lui prépare les fichiers de contexte (notes, calendrier, projets), gère les permissions et le canal des actions |
| `mcp-atelier.js` | Le serveur MCP qui donne à Claude ses actions dans Atelier (lancé par Electron en mode Node) |
| `renderer/index.html`, `style.css` | L'interface et son style (verre sombre, comme Rune et Skald) |
| `renderer/app.js` | Démarrage, thème, réglages, widgets affichés |
| `renderer/outils.js` | La colonne Outils |
| `renderer/notes.js`, `projets.js`, `presse-papiers.js`, `minuteurs.js`, `calendrier.js`, `claude.js` | Un fichier par widget |
| `renderer/base.js`, `notify.js`, `dialogs.js`, `update.js` | Petits outils communs : raccourcis, notifications, fenêtres de dialogue, bouton de mise à jour |
