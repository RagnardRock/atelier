# Tafl ᛏ : tuiles et cartes en pixel art, façon Pokémon

Tafl est le troisième outil d'Atelier, à côté de Rune et Skald. Il sert à dessiner les **tuiles** d'un jeu en vue de dessus façon Pokémon (herbe, hautes herbes, chemins, eau, arbres…), à les ranger dans un **jeu de tuiles**, à les essayer sur une **carte**, puis à tout exporter dans les formats que lisent les moteurs de jeu. Il reprend la direction artistique des autres outils (mode sombre, verre dépoli, mêmes icônes).

Le nom vient du *tafl* (hnefatafl), le jeu de plateau des Vikings, qui se joue case par case sur une grille. Sa rune est ᛏ (Tiwaz, le « T »).

## Lancer Tafl depuis le clone

```bat
cd tuiles
npm install
npm start
```

`npm install` télécharge Electron dans `tuiles/node_modules/`. `npm start` ouvre la fenêtre. `Ctrl+R` recharge l'interface après une modification, `F12` ouvre les outils de développement.

## Installer Tafl (Windows)

Le plus simple : depuis **Atelier**, colonne Outils, bouton Installer sur la carte de Tafl.

Sinon, comme pour Skald : sur chaque pull request qui touche `tuiles/`, GitHub fabrique `Tafl-Setup-<version>.exe` (onglet **Checks** de la PR, rubrique « Artifacts »). Quand la PR est fusionnée sur `main` avec une nouvelle version dans `tuiles/package.json`, GitHub crée l'étiquette `tafl-v<version>` et publie l'installeur dans les **Releases**, sans la marquer « Latest » (Rune utilise la Release « Latest » pour ses propres mises à jour).

L'installeur associe les fichiers `.tafl` à Tafl : un double-clic sur un jeu de tuiles l'ouvre.

**Ouvrir un dossier.** `Tafl.exe D:\Projets\mon-jeu` ouvre Tafl avec la fenêtre « Ouvrir » placée dans ce dossier. Depuis le clone : `npm start -- D:\Projets\mon-jeu`.

## Mettre Tafl à jour

Le bouton nuage en haut à droite, comme dans Rune et Skald. Installé, Tafl cherche la Release `tafl-vX.Y.Z` la plus récente, télécharge son installeur, se ferme, s'installe sans fenêtre et se relance. Lancé depuis le clone, il lance `tuiles/mettre-a-jour.bat` (git pull, puis npm install). Il propose d'enregistrer avant de fermer. Réglages et journal dans `%APPDATA%\atelier-tuiles`.

## Ce que fait Tafl (v0.1)

**Un jeu de tuiles** (`Ctrl+N`) : un nom, une taille de tuile (8 × 8 façon Game Boy, **16 × 16 façon Pokémon GBA et DS**, 32 × 32 façon RPG Maker…), une palette et une taille de carte. Tu peux partir de **tuiles d'exemple** (herbe, hautes herbes, chemin, eau, fleur) et d'une petite carte qui les utilise, pour voir tout de suite comment ça marche.

**Deux modes**, en haut de la zone de dessin (`Tab` passe de l'un à l'autre) :

- **Tuile** : la tuile choisie, très agrandie, pixel par pixel, avec sa grille et des repères au milieu.
  - **Mosaïque** (`Ctrl+M`) : la tuile est répétée tout autour. Dessiner sur une copie dessine sur la tuile, et un trait qui sort d'un côté revient de l'autre. C'est ce qu'il faut pour des tuiles qui se raccordent sans couture (l'herbe, l'eau, les chemins).
  - **Miroir ↔ / ↕** : ce que tu dessines d'un côté se dessine aussi de l'autre (arbres, rochers, bâtiments symétriques).
- **Carte** : tu poses les tuiles sur une carte pour voir ce qu'elles donnent ensemble. Deux calques : **Sol** (herbe, chemins, eau) et **Décor** par-dessus (fleurs, panneaux, arbres), chacun masquable, avec l'option d'atténuer celui sur lequel tu ne travailles pas. Taille réglable jusqu'à 256 × 256 cases.

**Outils** (les mêmes dans les deux modes ; en mode Carte, une case vaut une tuile) :

| Outil | Touche | En mode Tuile | En mode Carte |
|---|---|---|---|
| Crayon | B | Clic gauche : couleur principale, clic droit : secondaire. Maj+clic : ligne droite depuis le dernier point. Alt+clic : pipette. | Pose la tuile choisie ; clic droit efface. |
| Gomme | E | Rend les pixels transparents. | Vide les cases du calque. |
| Pot de peinture | G | Remplit la zone de même couleur (en mosaïque, il passe d'un bord à l'autre). | Remplit la zone de cases identiques. |
| Pipette | I | Prend une couleur (clic droit : la secondaire). | Reprend la tuile d'une case. |
| Ligne | L | Ligne droite. | Ligne de tuiles. |
| Rectangle | U | Plein ou contour. | Couvre un rectangle de tuiles. |
| Décalage | M | Fait glisser toute la tuile en boucle, pour voir et retoucher les raccords. | |

Molette : zoom autour de la souris. Espace ou bouton du milieu : déplacer la vue. `Ctrl+0` : ajuster. `X` : échanger les couleurs.

**Palette** (panneau de droite) : clic = couleur principale, clic droit = secondaire, la case à damier = transparent. **Double-clic** pour modifier une couleur : elle change aussi **dans toutes les tuiles**, comme les palettes des vieux jeux (changer le vert de l'herbe change toute l'herbe). `Ctrl+clic` la retire, `+` ajoute la couleur principale. « Changer… » remplace la palette par une autre (Nature façon GBA, Game Boy, Game Boy Color, PICO-8, Sweetie 16, libre) ou par les couleurs déjà utilisées dans tes tuiles. Tes tuiles ne changent pas.

**Tuiles** (panneau de droite) : clic pour choisir, double-clic (ou `F2`) pour renommer, glisser pour changer l'ordre (la carte suit), clic droit pour le menu. Boutons : nouvelle (`Ctrl+Maj+N`), dupliquer (`Ctrl+D`), supprimer (Tafl prévient si la tuile est posée sur la carte). Menu Tuile : miroir horizontal / vertical (`Maj+H`, `Maj+V`), pivoter (`Maj+R`), décaler d'une demi-tuile (`Maj+D`, pour voir les raccords au milieu), effacer. Les flèches du clavier passent d'une tuile à l'autre.

**Aperçu 3 × 3** : la tuile en cours répétée, agrandie comme dans le jeu, mise à jour pendant que tu dessines.

**Annuler / rétablir** : `Ctrl+Z`, `Ctrl+Y`, pour tout (dessin, carte, palette, ajout, suppression ou ordre des tuiles).

**Fichiers**
- **Enregistrer** (`Ctrl+S`) : un fichier `.tafl`. C'est du JSON lisible (taille, palette, chaque tuile en petite image PNG avec son nom, la carte), que tu peux ouvrir dans Rune.
- **Importer une planche** (`Ctrl+I`, ou glisser un PNG sur la fenêtre) : une image est découpée en tuiles. Options : ignorer les cases vides, ne garder qu'une fois chaque tuile identique, et **refaire l'image en carte** (pratique pour reprendre une capture d'écran de carte : Tafl en tire les tuiles uniques et la carte qui les utilise).
- **Exporter la planche** (`Ctrl+E`) : toutes les tuiles dans un seul PNG, en grille (nombre de colonnes, agrandissement, espace entre tuiles). C'est le format que lisent Tiled, Godot, Phaser, Unity, RPG Maker…
- **Exporter les tuiles séparées** : un PNG par tuile (`00-herbe.png`, `01-hautes-herbes.png`…).
- **Exporter la carte pour Tiled** (`Ctrl+Maj+E`) : dans un dossier, `<nom>.tmj` (la carte au format de [Tiled](https://www.mapeditor.org), avec ses deux calques), `<nom>-tuiles.png` (la planche) et `<nom>-carte.png` (l'image de la carte). Phaser et Godot savent charger ce `.tmj` directement : c'est la passerelle vers le futur jeu.
- **Exporter la carte en image** : un PNG, agrandi ×1 à ×4.

**Réglages** (`Ctrl+,` ou l'engrenage) : couleur d'accent, verre dépoli, flou de Windows 11, taille de tuile et palette par défaut, grilles, nombre d'annulations gardées.

## Pas encore

Tuiles animées (eau qui ondule, fleurs qui bougent), tuiles automatiques (bords de chemin et de mare posés tout seuls), calques supplémentaires, collisions et zones (hautes herbes = rencontres), sélection et copier-coller de zones, lien direct avec Skald.

## Comment c'est construit

Même organisation que Skald : Electron, sans framework ni bundler, tout le dessin dans des `<canvas>`.

| Fichier | Rôle |
|---|---|
| `main.js` | Processus principal : fenêtre, fichiers (Tafl n'écrit que là où tu as choisi d'enregistrer), réglages, journal `tafl.log`, mise à jour. |
| `preload.js` | Le pont : les seules fonctions accessibles à l'interface, sous `window.tafl`. |
| `renderer/doc.js` | Le jeu de tuiles en mémoire et l'historique d'annulation (copie à l'écriture : annuler remet simplement les anciens tableaux de pixels). |
| `renderer/stage.js` | La zone de dessin, ses deux modes et les outils, écrits une seule fois pour une « grille de cases » (pixels d'une tuile ou cases de la carte). |
| `renderer/panels.js` | Palette, tuiles, aperçu. |
| `renderer/io.js` | Le format `.tafl`, l'import de planches et les exports (PNG, Tiled). |
| `renderer/palettes.js` | Les palettes proposées : une ligne par palette, facile à compléter. |
| `renderer/samples.js` | Les tuiles d'exemple, dessinées en texte (une lettre par pixel). |
| `renderer/app.js` | L'état, les menus, les raccourcis, les réglages et l'accueil. |
| `build/icon.svg` | L'icône (et `icon.png` / `icon.ico` qui en sont tirés). |
| `../.github/workflows/tafl.yml` | La fabrication et la publication de l'installeur. |
