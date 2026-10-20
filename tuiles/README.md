# Tafl ᛏ : tuiles et cartes en pixel art, façon Pokémon

Tafl est le quatrième outil d'Atelier, à côté de Rune, Skald et Brokk. Il sert à dessiner les **tuiles** d'un jeu en vue de dessus façon Pokémon (herbe, hautes herbes, chemins, eau, arbres…), à les ranger dans un **jeu de tuiles**, à construire les **cartes** du jeu, puis à tout exporter dans les formats que lisent les moteurs de jeu. Depuis Tafl 0.6, c'est aussi l'**éditeur du jeu** : il décrit tout ce que contient le jeu (cartes, passage, zones, téléporteurs…) dans un **dossier de jeu** que le futur moteur lira (voir [FORMAT.md](FORMAT.md)). Il reprend la direction artistique des autres outils (mode sombre, verre dépoli, mêmes icônes).

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

## Ce que fait Tafl (v0.2)

**Un jeu de tuiles** (`Ctrl+N`) : un nom, une taille de tuile (8 × 8 façon Game Boy, **16 × 16 façon Pokémon GBA et DS**, 32 × 32 façon RPG Maker…), une palette et une taille de carte. Tu peux partir de **tuiles d'exemple** (herbe, hautes herbes, chemin, eau, fleur) et d'une petite carte qui les utilise, pour voir tout de suite comment ça marche.

**Deux modes**, en haut de la zone de dessin (`Tab` passe de l'un à l'autre) :

- **Tuile** : la tuile choisie, très agrandie, pixel par pixel, avec sa grille et des repères au milieu.
  - **Mosaïque** (`Ctrl+M`) : la tuile est répétée tout autour. Dessiner sur une copie dessine sur la tuile, et un trait qui sort d'un côté revient de l'autre. C'est ce qu'il faut pour des tuiles qui se raccordent sans couture (l'herbe, l'eau, les chemins).
  - **Miroir ↔ / ↕** : ce que tu dessines d'un côté se dessine aussi de l'autre (arbres, rochers, bâtiments symétriques).
- **Carte** : tu poses les tuiles sur les cartes du jeu, sur autant de **calques** que tu veux (voir Tafl 0.6 plus bas). Taille réglable jusqu'à 256 × 256 cases.

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

**Animation** (panneau sous les tuiles, nouveau en v0.2) : une tuile peut avoir **jusqu'à 16 images**, pour l'eau qui ondule, les fleurs qui bougent, les torches… La tuile d'exemple « eau » en a déjà 4.
- `+` (ou `Ctrl+Maj+A`) ajoute une image, copie de celle en cours : tu n'as plus qu'à la retoucher. La corbeille retire l'image en cours.
- Clic sur une image pour la dessiner, glisser pour changer l'ordre. `,` et `;` passent à l'image précédente ou suivante.
- **Durée d'une image** en millisecondes (250 par défaut, de 30 à 5000), la même pour toutes les images de la tuile.
- **Pelure d'oignon** (barre d'options, visible quand la tuile est animée) : l'image précédente apparaît en transparence sous celle que tu dessines.
- Lecture / pause (`P`) : les vignettes, l'aperçu 3 × 3 et la carte s'animent comme dans le jeu. En pause, la carte montre la première image.
- Les outils de la tuile (miroir, pivoter, décaler, remplacer une couleur de la palette) s'appliquent à **toutes les images**. Effacer n'efface que l'image en cours.

**Taille des tuiles** (menu Tuile, « Taille des tuiles du jeu… », nouveau en v0.2) : passe tout le jeu de tuiles à une autre taille (8, 16, 24, 32, 48 ou 64 px), images des animations comprises. Deux méthodes :
- **Agrandir ou réduire les pixels** : le dessin garde son allure (16 → 32 : chaque pixel devient un carré de 2 × 2).
- **Ajouter ou couper des bords** : les pixels gardent leur taille, le dessin reste centré, avec du transparent autour ou des bords coupés.
`Ctrl+Z` annule.

**Annuler / rétablir** : `Ctrl+Z`, `Ctrl+Y`, pour tout (dessin, carte, palette, ajout, suppression ou ordre des tuiles).

**Fichiers**
- **Enregistrer** (`Ctrl+S`) : un fichier `.tafl`. C'est du JSON lisible (taille, palette, chaque tuile en petite image PNG avec son nom, ses images d'animation et leur durée, la carte), que tu peux ouvrir dans Rune. Les fichiers de la v0.1 s'ouvrent toujours.
- **Importer une planche** (`Ctrl+I`, ou glisser un PNG sur la fenêtre) : une image est découpée en tuiles. C'est ainsi qu'on reprend des tuiles dessinées dans **Skald** (ou Photoshop) : exporter en PNG, puis importer. Une image de la taille d'une tuile donne une seule tuile. Options : ignorer les cases vides, ne garder qu'une fois chaque tuile identique, et **refaire l'image en carte** (pratique pour reprendre une capture d'écran de carte : Tafl en tire les tuiles uniques et la carte qui les utilise).
- **Exporter la planche** (`Ctrl+E`) : toutes les tuiles dans un seul PNG, en grille (nombre de colonnes, agrandissement, espace entre tuiles). Une case à cocher ajoute à la fin les images des tuiles animées. C'est le format que lisent Tiled, Godot, Phaser, Unity, RPG Maker…
- **Exporter les tuiles séparées** : un PNG par tuile (`00-herbe.png`, `01-hautes-herbes.png`…), et un par image pour les tuiles animées (`03-eau-1.png`, `03-eau-2.png`…).
- **Exporter la carte pour Tiled** (`Ctrl+Maj+E`) : dans un dossier, `<nom>.tmj` (la carte au format de [Tiled](https://www.mapeditor.org), avec ses deux calques et les animations des tuiles, que Tiled, Phaser et Godot savent jouer), `<nom>-tuiles.png` (la planche) et `<nom>-carte.png` (l'image de la carte). Phaser et Godot savent charger ce `.tmj` directement : c'est la passerelle vers le futur jeu.
- **Exporter la carte en image** : un PNG, agrandi ×1 à ×4.

**Réglages** (`Ctrl+,` ou l'engrenage) : couleur d'accent, verre dépoli, flou de Windows 11, taille de tuile et palette par défaut, grilles, nombre d'annulations gardées.

## L'éditeur de jeu (Tafl 0.6)

Tafl **décrit** le jeu, le futur moteur le **fera tourner**. Tout ce que Tafl enregistre est en JSON lisible, décrit dans [FORMAT.md](FORMAT.md) (copié dans chaque dossier de jeu).

**Un dossier de jeu** (Fichier › Nouveau jeu, `Ctrl+Maj+J`, ou le bouton de l'accueil) : un titre, une taille de tuile (libre : 16 × 16 façon Pokémon, ou une autre) et une première carte. Au premier `Ctrl+S`, Tafl te demande le dossier du jeu, puis y écrit :

```
MonJeu/
  jeu.json        le titre, la liste des cartes, le départ du joueur
  tuiles.tafl     les tuiles, partagées par toutes les cartes
  cartes/*.json   une carte par fichier (cartes/bourg-palette.json…)
  FORMAT.md       la description de ces fichiers
```

- Pour l'ouvrir : Fichier › Ouvrir, puis son `jeu.json` (ou glisse le `jeu.json` sur la fenêtre). Il apparaît aussi dans les récents de l'accueil, avec le nom de son dossier. Quand Atelier ouvre Tafl sur un projet qui contient un `jeu.json`, le jeu s'ouvre directement.
- Un jeu de tuiles `.tafl` existant devient un jeu avec Fichier › **Enregistrer comme dossier de jeu…**. Les `.tafl` gardent aussi toutes leurs cartes (Tafl 0.5 et plus ancien n'y voient que la première).

En mode Carte, le panneau de droite montre les **Cartes** et les **Calques** (la palette et l'animation reviennent en mode Tuile).

**Cartes** : une par lieu (une ville, une route, l'intérieur d'une maison…), toutes avec les mêmes tuiles. `+` en crée une, puis dupliquer, renommer (double-clic), changer la taille, l'ordre, supprimer (clic droit ou `…`). Chaque carte a un identifiant tiré de son premier nom (« Bourg Palette » → `bourg-palette`) qui ne change plus : c'est le nom de son fichier, et ce que les téléporteurs utilisent. L'étiquette « départ » montre la carte où commence le joueur.

**Calques** : autant que tu veux. `+` ajoute un calque au-dessus de celui choisi ; flèches pour l'ordre ; l'œil pour masquer. Le calque du haut de la liste est dessiné par-dessus les autres, comme dans Photoshop. Une nouvelle carte en a trois : Sol, Décor, Au-dessus. Double-clic (ou l'icône réglages) pour les **réglages du calque**, avec aperçu en direct :
- **Profondeur** : sous le joueur (sol, chemins), au niveau du joueur (arbres, rochers, maisons) ou **au-dessus du joueur** (toits, cimes des arbres : il passe derrière). L'étiquette de couleur de chaque calque la rappelle.
- **Opacité** et **mode de fusion** (normal, produit pour les ombres, superposition claire, incrustation, lumière douce, addition pour les lueurs, couleur pour teinter) : Tafl les montre sur la carte, et le moteur fera pareil. De quoi poser une ombre douce sous les arbres, un halo autour des lampadaires, une teinte de soir sur toute la carte…
- **Parallaxe** : 1 = le calque défile avec la carte, 0,5 = deux fois plus lentement (un fond lointain), 0 = immobile à l'écran (brume). Tafl la garde dans le fichier ; c'est le moteur qui la fera bouger.

**Passage** (où le joueur peut marcher), en deux temps :
- **Par tuile** : menu Tuile › Passage (« laisse passer » ou « bloque »). Partout où un arbre est posé, sa case bloque. Un petit carré rouge (ou vert) le rappelle sur la vignette.
- **Case par case** : choisis la ligne **Passage** en haut du panneau Calques, puis peins avec le crayon, le pot, la ligne ou le rectangle. La barre du haut choisit ce qu'on peint : **Libre**, **Bloqué**, ou un **rebord** ↓ ↑ ← → (on le saute dans ce sens, sans pouvoir remonter, comme dans Pokémon). Clic droit (ou la gomme) remet « auto ». Ce qui est peint l'emporte sur les tuiles.
- Sur la carte : rouge = bloqué (plus marqué et barré quand c'est peint à la main), vert = libre peint, flèche jaune = rebord. Case « Passage » de la barre du haut pour le voir en permanence. Les calques « au-dessus du joueur » ne bloquent jamais.

**Zones** (outil Zone, `Z`) : glisse pour tracer un rectangle, puis choisis son type (**herbes hautes**, eau, grotte, autre), son nom, et un **objet requis** pour y entrer (par exemple `planche-de-surf` pour l'eau : c'est ce qui remplace les CS). Clic sur une zone pour la modifier ou la supprimer. Les tables de rencontres arriveront avec Tafl 0.8.

**Téléporteurs** (outil Téléporteur, `T`) : clic sur une case (une porte, un escalier, le bord d'une route), puis la carte d'arrivée, la case d'arrivée et la direction du joueur. « Créer aussi le téléporteur du retour » pose tout seul celui qui ramène, juste derrière l'arrivée. Survoler un téléporteur montre où il mène. Clic dessus pour le modifier ou le supprimer.

**Départ du joueur** (outil `J`) : clic sur la case où commence le jeu ; la barre du haut choisit où il regarde. Menu Jeu › Aller au départ du joueur.

**Menu Jeu** : le titre du jeu, aller au départ, afficher le dossier du jeu.

Les exports pour Tiled gardent l'opacité, la parallaxe, la profondeur et la fusion des calques (ces deux dernières en propriétés), pour la carte affichée. Tout s'annule avec `Ctrl+Z`.

## Claude dans Tafl (depuis Tafl 0.3)

Le bouton étincelle de la barre de titre (ou `Ctrl+Maj+K`) ouvre le **panneau Claude** à droite, le même que dans Skald, Tafl et Brokk (son code est dans `commun/`, voir `commun/LISEZMOI.md`).

- **Avec ton compte Claude, sans clé d'API** : Tafl fait tourner Claude Code, installé une fois sur ton PC (`npm install -g @anthropic-ai/claude-code`, puis `claude` pour te connecter).
- **Il continue le projet commencé dans Atelier** : il travaille dans le dossier du projet avec lequel Atelier a ouvert Tafl (sinon le dernier projet ouvert depuis Atelier, affiché en haut du panneau). Il lit la mémoire de ce projet (ce que le Claude d'Atelier ou de Rune a retenu) et tes notes, grâce au dossier partagé `%APPDATA%\atelier-commun` (Atelier 0.8 ou plus).
- **Toujours avec ta permission** : avant de modifier un fichier, de lancer une commande ou de retenir une info sur le projet, une carte te demande Autoriser ou Refuser. Ce qu'il retient apparaît aussitôt dans Atelier.
- **Conversations** : gardées par projet (bouton horloge), `+` en commence une nouvelle.
- **Réglages** : le modèle de Claude et la commande `claude` si elle n'est pas trouvée toute seule.

### Claude agit dans Tafl (depuis Tafl 0.4)

Claude **voit** le jeu de tuiles et **travaille dedans** avec les mêmes fonctions que les menus.

- **Regarder** (sans demander) : la planche, une tuile (en image agrandie et pixel par pixel), la carte et ses calques.
- **Agir** (avec ta permission) : créer un jeu, dessiner une tuile pixel par pixel, dupliquer, retourner, tourner, renommer une tuile, poser des tuiles ou écrire une zone de la carte, changer la taille de la carte, ajouter des couleurs à la palette, exporter la planche ou la carte en PNG, enregistrer, annuler.
- Les pixels s'échangent en texte, une ligne par rangée : `.` = transparent, puis un caractère par couleur de la palette (`0` à `9`, `a` à `z`…). C'est ce qui lui permet de dessiner une tuile précise.
- `Ctrl+Z` annule ce qu'il a fait.
- **Depuis Tafl 0.6, il construit aussi le jeu** : créer un dossier de jeu et l'enregistrer dans le projet, les cartes (nouvelle, dupliquer, renommer, supprimer, ordre), les calques (ajouter, supprimer, ordre, profondeur, opacité, fusion, parallaxe), peindre le passage, le passage des tuiles, les zones, les téléporteurs (avec le retour) et le départ du joueur. Il voit le passage final de chaque case dans `voir_carte`. Il peut ainsi relier toutes les maisons d'une ville à leur intérieur en une demande.
- **Depuis Tafl 0.5, il a accès à tout** : toutes les commandes des menus (les fenêtres de réglages se remplissent et se valident toutes seules), l'animation des tuiles (ajouter ou supprimer une image, la durée, l'ordre), déplacer une tuile ou la décaler d'une demi-tuile, la palette (changer de modèle, remplacer une couleur partout), les calques de la carte (remplir, vider, afficher, masquer), ouvrir et enregistrer sous dans le projet, importer une planche, exporter les tuiles séparées et la carte pour Tiled dans le projet, rétablir.

## La suite

Le plan (validé avec Ragna le 20/10/2026) :

1. **Tafl 0.7, les événements** : PNJ, panneaux, coffres posés sur la carte, avec leurs dialogues (portraits par expression, le héros qui parle) et des scripts simples (dire, donner, choix, si un interrupteur est allumé, téléporter, combat de dresseur), les personnages récurrents et les quêtes.
2. **Tafl 0.8, les bases de données** : types, attaques, créatures, objets, dresseurs, boutiques (débloquées par des compteurs : captures, dresseurs battus…), tables de rencontres des zones, réglages du niveau maximum.
3. **Le moteur**, un outil à part, qui lit le dossier de jeu, avec un bouton **Jouer** dans Tafl.

Et toujours : tuiles automatiques (bords de chemin et de mare posés tout seuls), sélection et copier-coller sur la carte, lien direct avec Skald.

## Comment c'est construit

Même organisation que Skald : Electron, sans framework ni bundler, tout le dessin dans des `<canvas>`.

| Fichier | Rôle |
|---|---|
| `main.js` | Processus principal : fenêtre, fichiers (Tafl n'écrit que là où tu as choisi d'enregistrer, et dans un dossier de jeu seulement ses fichiers à lui), réglages, journal `tafl.log`, mise à jour. |
| `preload.js` | Le pont : les seules fonctions accessibles à l'interface, sous `window.tafl`. |
| `renderer/doc.js` | Le jeu en mémoire (tuiles, cartes, calques, passage, zones, téléporteurs, départ) et l'historique d'annulation (copie à l'écriture : annuler remet simplement les anciens tableaux). |
| `renderer/stage.js` | La zone de dessin, ses deux modes et les outils, écrits une seule fois pour une « grille de cases » (pixels d'une tuile, cases d'un calque ou passage), plus les outils Zone, Téléporteur et Départ. |
| `renderer/panels.js` | Palette, tuiles, aperçu, cartes, calques. |
| `renderer/io.js` | Le format `.tafl`, le dossier de jeu (jeu.json, cartes/*.json), l'import de planches et les exports (PNG, Tiled). |
| `FORMAT.md` | La description des fichiers d'un dossier de jeu, pour le futur moteur (copiée dans chaque dossier de jeu). |
| `renderer/palettes.js` | Les palettes proposées : une ligne par palette, facile à compléter. |
| `renderer/samples.js` | Les tuiles d'exemple, dessinées en texte (une lettre par pixel). |
| `renderer/app.js` | L'état, les menus, les raccourcis, les réglages et l'accueil. |
| `build/icon.svg` | L'icône (et `icon.png` / `icon.ico` qui en sont tirés). |
| `../.github/workflows/tafl.yml` | La fabrication et la publication de l'installeur. |
