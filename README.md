# Atelier

Un ensemble d'outils pour le travail de tous les jours (web, graphisme, bureautique) et pour créer des jeux, réunis dans un seul dépôt. Tous les outils sont des applications Windows (Electron), en français, en mode sombre, réglables depuis leurs menus, et ils partagent le même assistant, **Loki**.

## Les outils

| Outil | Rôle | Dossier | Version |
|---|---|---|---|
| **Atelier** ᚨ | Le hub : lance, installe, met à jour et désinstalle les outils, avec des widgets (notes, projets récents, presse-papiers et couleurs, minuteurs, calendrier, calculatrice, Loki) | [`hub/`](hub/README.md) | 0.19.1 |
| **Rune** ᚱ | IDE : Monaco, terminal, serveurs SSH, Git, aperçu Go Live, Vue, Emmet, Prettier | [`ide/`](ide/README.md) | 1.1.0 |
| **Skald** ᛋ | Retouche d'images et de logos, à la Photoshop (calques, PSD) | [`retouche/`](retouche/README.md) | 1.1.3 |
| **Brokk** ᛒ | Export d'assets : un PSD ou un logo vers toutes les tailles web d'un projet (favicons, responsive, Open Graph) | [`export/`](export/README.md) | 1.1.0 |
| **Tafl** ᛏ | Éditeur de jeu : tuiles, cartes, événements, scripts JS, données, packs de règles et modules | [`tuiles/`](tuiles/README.md) | 1.22.2 |
| **Saga** ᛃ | Moteur qui fait tourner les jeux décrits dans Tafl, avec export web et .exe | [`moteur/`](moteur/README.md) | 1.20.2 |
| **Mímir** ᛗ | Lecteur de documents : PDF (annoter, signer, remplir les formulaires), EPUB, BD (CBZ/CBR), Word, images, textes | [`lecteur/`](lecteur/README.md) | 0.3.0 |
| **Kenning** ᚲ | Liseuse d'eBooks avec bibliothèque (couvertures, collections, progression) : EPUB, MOBI, AZW3, FB2, surlignages et notes | [`liseuse/`](liseuse/README.md) | 0.2.0 |
| **Reikna** ᛞ | Tableur : xlsx, xls, ods, CSV, formules en français, graphiques, mise en forme conditionnelle | [`tableur/`](tableur/README.md) | 0.4.3 |
| **Edda** ᛖ | Traitement de texte : docx, odt, RTF, Markdown, HTML, texte, avec images, vidéos et sons dans la page | [`texte/`](texte/README.md) | 0.4.0 |

Dans Atelier, les outils sont rangés par catégorie (développement, graphisme, bureautique, jeu) avec un filtre Tous / Installés / Mises à jour.

## Loki, l'assistant commun

**Loki** ᛚ est le panneau d'assistant présent dans chaque outil (code commun dans [`commun/`](commun/LISEZMOI.md)).

- **Avec Claude** : il fait tourner ton Claude Code installé, donc ton compte Claude, sans clé d'API.
- **En local** : il peut aussi tourner sur ton PC avec **Ollama** (Qwen3 14B par défaut, d'autres modèles au choix). Atelier installe et gère Ollama et les modèles (Réglages › IA locale…). Chaque outil a le choix **Claude / Local / Auto** : en Auto, Loki passe en local quand la limite Claude est atteinte. La carte graphique est partagée avec ComfyUI : le modèle est libéré avant une génération d'images.
- **Des actions dans chaque outil** : Loki peut agir dans l'outil (poser des tuiles dans Tafl, retoucher dans Skald, remplir un tableau dans Reikna…). Chaque action passe par une carte **Autoriser / Refuser**, s'annule, et peut être autorisée « pour cette conversation » ou « toujours » (révocable dans les réglages).
- **Une mémoire partagée** : les outils partagent le projet en cours, la mémoire du projet et les notes, dans `%APPDATA%\atelier-commun`.

## Créer des jeux : Tafl et Saga

Tafl décrit le jeu (des données), Saga le joue. Les règles sont rangées dans des **packs de règles** remplaçables, pour que l'éditeur et le moteur restent génériques.

- **Packs de règles** : Pokémon (combats, captures, évolutions, boutiques, badges), JRPG classique, **JDR** et **action** (temps réel). Le contrat d'un pack est décrit dans [REGLES.md](moteur/renderer/moteur/regles/REGLES.md).
- **Pack JDR** : fiches de personnage, caractéristiques, compétences, sorts, dés, tests hors combat, sur le modèle D&D 5e SRD avec règles maison réglables dans Tafl. Une aventure d'exemple, « La crypte de Brumeval », se crée depuis Nouveau jeu › Partir de.
- **Mode table** (JDR) : une table virtuelle pour les vraies parties autour d'une table. Plateau en grille, jetons, brouillard de guerre par pièces, vue MJ (tout voir, jets cachés puis révélés, musique et sons) et un écran joueurs séparé.
- **Multijoueur** : l'hôte fait tourner la partie et ses amis le rejoignent dans leur navigateur avec un code à 4 lettres, rien à installer. En réseau local ou sur Internet (ouverture automatique du port par UPnP). Chacun ne reçoit que ce que son rôle (MJ, joueur, spectateur) a le droit de voir. Sert au mode table JDR et à un monde partagé Pokémon/JRPG (se voir, chat, échanges, duels, modèle « Arène de duel »).
- **Temps réel** (pack action, façon Zelda) : ennemis, attaques, hitboxes, recul, animations et comportements réglables dans Tafl, chemins calculés en A*. Un donjon d'exemple est fourni.
- **Roguelite** (module) : des salles de donjon dessinées dans Tafl, assemblées au hasard par Saga à chaque partie selon une graine, avec étages, ennemis par étage, trésors, boutiques et boss. Se combine avec le pack action ou JRPG.
- **Scripts JS** : des scripts dans un bac à sable, pour ajouter des règles, des comportements d'ennemis ou des événements (voir [SCRIPTS.md](tuiles/SCRIPTS.md)).
- **Confort** : musique et sons, jour et nuit, lumières, manette, touches réglables, sauvegarde automatique, vérificateur et test rapide depuis Tafl.
- **Tuiles** : import de planches, tuiles animées, tampons, recettes de tuiles dessinées par Loki, génération d'images par ComfyUI (installable depuis Tafl). Le format des fichiers de jeu est décrit dans [FORMAT.md](tuiles/FORMAT.md).

## Installer (Windows)

1. Dans l'onglet **Releases** du dépôt, télécharge le dernier `Atelier-Setup-….exe`.
2. Double-clique-le. Windows peut afficher « Windows a protégé votre ordinateur » : l'installeur n'est pas signé par un certificat payant. Clique **Informations complémentaires**, puis **Exécuter quand même**.
3. Depuis Atelier, installe les outils que tu veux d'un clic. Atelier signale ensuite les mises à jour (et celles en cours de fabrication).

Chaque outil a aussi son propre installeur dans les Releases (`Rune-Setup-….exe`, `Tafl-Setup-….exe`…) et son propre bouton de mise à jour.

## Publier une nouvelle version

Les installeurs sont fabriqués par GitHub, sur un PC Windows à lui (un fichier par outil dans `.github/workflows/`). Il suffit de **monter la version** dans le `package.json` de l'outil, dans la PR :

1. Quand la PR est fusionnée dans `main`, GitHub voit que l'étiquette (par exemple `tafl-v1.23.0`) n'existe pas encore : il fabrique l'installeur, crée l'étiquette et publie la Release, avec la liste des commits de l'outil depuis la version précédente. Compte environ 3 minutes.
2. Atelier et l'outil installé la proposent ensuite.

| Outil | Fichier de version | Étiquette |
|---|---|---|
| Atelier | `hub/package.json` | `atelier-v…` |
| Rune | `ide/package.json` | `rune-v…` |
| Skald | `retouche/package.json` | `skald-v…` |
| Brokk | `export/package.json` | `brokk-v…` |
| Tafl | `tuiles/package.json` | `tafl-v…` |
| Saga | `moteur/package.json` | `saga-v…` |
| Mímir | `lecteur/package.json` | `mimir-v…` |
| Kenning | `liseuse/package.json` | `kenning-v…` |
| Reikna | `tableur/package.json` | `reikna-v…` |
| Edda | `texte/package.json` | `edda-v…` |

**Numéros de version** : le troisième chiffre (x.y.**Z**) pour les corrections et petits ajouts, le deuxième (x.**Y**.0) pour une vraie nouveauté visible (une seule fois par session de travail), le premier (**X**.0.0) quand l'outil fait ce pour quoi il est prévu, puis pour une étape majeure. On ne redescend jamais un numéro : Atelier compare les versions pour proposer les mises à jour. Deux PR en parallèle qui montent le même outil : la seconde remonte sa version après la fusion de la première.

Sur chaque PR, GitHub fabrique aussi l'installeur des outils touchés, sans le publier : il se télécharge depuis l'onglet **Checks** de la PR, rubrique « Artifacts ».

> Seul Rune publie la Release marquée « Latest » : Rune cherche ses mises à jour dans la dernière Release du dépôt. Les autres outils filtrent les Releases par leur étiquette.

## Développer

Prérequis : [Node.js](https://nodejs.org) 20 ou plus. Chaque outil se lance depuis son dossier :

```bat
cd tuiles
npm install
npm start
```

`mettre-a-jour.bat` (ou `mettre-a-jour.sh`) à la racine fait `git pull` puis `npm install`. Le détail de chaque outil (fonctions, réglages, construction) est dans son README, et celui de Rune dans [ide/README.md](ide/README.md).

Les notes de travail du projet (feuille de route, décisions, état de chaque outil) sont copiées dans [docs/](docs/README.md).

## Prochaines étapes

- Multijoueur coopératif en temps réel.
- Actions serveur en un clic dans Rune (déployer, logs, redémarrer).
- Plus tard : un tuteur de langues (polonais d'abord) construit sur Kenning, entièrement en local.
