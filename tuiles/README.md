# Tafl ᛏ : tuiles et cartes en pixel art, façon Pokémon

Tafl est le quatrième outil d'Atelier, à côté de Rune, Skald et Brokk. Il sert à dessiner les **tuiles** d'un jeu en vue de dessus façon Pokémon (herbe, hautes herbes, chemins, eau, arbres…), à les ranger dans un **jeu de tuiles**, à construire les **cartes** du jeu, puis à tout exporter dans les formats que lisent les moteurs de jeu. Depuis Tafl 0.6, c'est aussi l'**éditeur du jeu** : il décrit tout ce que contient le jeu (cartes, passage, zones, téléporteurs, et depuis 0.7 les personnages, leurs dialogues, les scripts et les quêtes) dans un **dossier de jeu** que le futur moteur lira (voir [FORMAT.md](FORMAT.md)). Il reprend la direction artistique des autres outils (mode sombre, verre dépoli, mêmes icônes).

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
- **Importer une planche** (`Ctrl+I`, ou glisser un PNG sur la fenêtre) : une image est découpée en tuiles. C'est ainsi qu'on reprend des tuiles dessinées dans **Skald** (ou Photoshop) : exporter en PNG, puis importer. Une image de la taille d'une tuile donne une seule tuile. Options : ignorer les cases vides, ne garder qu'une fois chaque tuile identique, et **refaire l'image en carte** (pratique pour reprendre une capture d'écran de carte : Tafl en tire les tuiles uniques et la carte qui les utilise). Depuis Tafl 0.10 : aperçu, fond en damier rendu transparent, marge, espacement, zone et tampons (voir « Importer des planches et poser des objets »).
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
  cartes/*.json   une carte par fichier (cartes/bourg-palette.json…), avec ses événements
  donnees/*.json  personnages, quêtes, interrupteurs (Tafl 0.7)
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

## Les événements et l'histoire (Tafl 0.7)

**Événements** (outil Événement, `N`) : tout ce qui vit sur une case. Clic sur une case vide : un menu propose un **personnage**, un **panneau**, un **coffre**, un **objet au sol** ou un **déclencheur** (une case invisible qui lance une scène quand le joueur marche dessus). Chacun arrive avec un script de départ (le coffre sait déjà dire « vide » une fois ouvert). Clic sur un événement pour l'ouvrir, glisser pour le déplacer, clic droit pour le dupliquer ou le supprimer. Sur la carte : sa tuile, ou un petit symbole par type, et son nom au survol. Le panneau **Événements** (mode Carte) les liste tous, même les invisibles.

**L'éditeur d'un événement**, une grande fenêtre :
- **À gauche**, ce qu'il est : nom, type, case, personnage (son nom et ses portraits pour les dialogues), tuile qui le montre, direction, s'il bouge, comment il se lance (on lui parle, on le touche, ou tout seul à l'arrivée sur la carte), si on passe à travers.
- **À droite**, ses **pages**. Chaque page a des **conditions** et un **script**. Le jeu joue la **dernière page dont toutes les conditions sont vraies** : la page 1 sans condition, c'est d'habitude ; les pages suivantes prennent le relais quand l'histoire avance (« quête finie », « rival battu », « déjà fait »…). Une page peut aussi rendre l'événement **absent** (l'objet ramassé disparaît).
- **Le script** se lit de haut en bas. `+ Ajouter une commande` ouvre la liste : dialogue (avec l'aperçu de la boîte, le portrait et le nom en couleur), choix (chaque réponse a ses propres commandes, en retrait), si… sinon, interrupteurs, objets, créatures, combats, téléporter, quêtes, soigner, boutique, écran des EV, attendre, fin, note. Au survol d'une ligne : monter, descendre, modifier (ou double-clic), dupliquer, supprimer.
- `Ctrl+Entrée` valide, `Échap` ferme (Tafl demande avant de jeter des changements). Valider s'annule d'un seul `Ctrl+Z`.

**Jeu › Données du jeu** (`Ctrl+Maj+D`, ou l'icône du panneau Événements), avec trois onglets :
- **Personnages** : nom, description (rôle et personnalité : pour toi, et pour Claude quand il écrit les dialogues), le **héros** (un seul : le joueur, qui parle et a sa personnalité), la couleur de son nom dans les dialogues, et ses **portraits, un par expression** (normal, content, triste, colère, surpris…). Dessine-les dans Skald ou Photoshop, puis « Importer un portrait… » : un fichier `maman-triste.png` devient tout seul l'expression « triste ».
- **Quêtes** : titre, description, histoire principale ou **secondaire**, la **suite** (la quête qui suit, pour le fil rouge), les **personnages** qu'on y croise (les personnages récurrents), et les **étapes** dans l'ordre.
- **Interrupteurs** : les faits que retient l'histoire (« rival battu au labo »). Ils se créent aussi tout seuls quand un script en nomme un nouveau.
- Chaque fiche dit **où elle est utilisée** dans les scripts. L'identifiant d'une fiche suit son nom tant qu'elle est neuve, puis ne change plus.

Ta liste d'envies, et comment le faire avec Tafl 0.7 :
- **Le héros qui parle** : un personnage coché « héros », que les dialogues font parler comme les autres.
- **Des légendaires au bout des quêtes** : une page avec la condition « quête finie », et la commande « Combat contre une créature ».
- **Des boutiques débloquées par la progression** : la condition « compteur » (captures, dresseurs battus, évolutions, badges) devant la commande « Ouvrir une boutique ».
- **Les EV au centre de soins** : la commande « Écran des EV » dans le script de l'infirmière.
- **Pas de CS** : les zones ont un objet requis, et la condition « le joueur a un objet » ouvre le reste (un arbre coupé avec une scie, par exemple).
- **Deux rivaux, des personnages récurrents, des quêtes reliées** : des personnages, des quêtes avec leur suite et leurs personnages.

Tout est décrit pour le futur moteur dans [FORMAT.md](FORMAT.md) (« Événements » et « Données du jeu »).

## Les bases de données du jeu (Tafl 0.8)

**Jeu › Données du jeu** (`Ctrl+Maj+D`) a maintenant une colonne d'onglets : **Histoire** (personnages, quêtes, interrupteurs), **Combat** (types, talents, attaques, créatures, objets) et **Monde** (dresseurs, boutiques, réglages). Chaque liste a sa recherche (par nom, id ou numéro du Pokédex).

**Importer les données officielles** (en bas de la colonne d'onglets) : les 18 types et leur table, les talents, les attaques, les 1025 créatures (statistiques, EV donnés, talents, taux de capture, croissance, évolutions, attaques par niveau et par CT, Pokédex), les objets (soins, balles, vitamines, menthes, capsules, baies, pierres…), en français, depuis [PokeAPI](https://pokeapi.co). Tu choisis les générations, et si tu veux les images de face et de dos des créatures et les icônes des objets. Il faut Internet, une minute environ. Rien n'est gardé tant que tu ne valides pas, et `Ctrl+Z` annule tout d'un coup.
- **Tes créatures et objets à toi** se créent à côté (bouton `+`), avec leurs sprites importés depuis Skald ou Photoshop. Réimporter ne touche jamais à ce que tu as créé ; les éléments déjà importés sont mis à jour (ou pas, au choix) et gardent leur identifiant, que les scripts utilisent.
- Les noms, images et créatures officiels appartiennent à Nintendo, Game Freak et The Pokémon Company : très bien pour ton jeu perso, à remplacer par les tiens avant de partager ou vendre le jeu.

Les onglets :
- **Types** : la couleur, et la **table des types** en entier (en ligne l'attaque, en colonne le défenseur) : un clic sur une case la fait passer de ×1 à ×2, ×½, ×0.
- **Attaques** : type, catégorie, puissance, précision, PP, priorité, cible, et les effets : statut infligé et sa chance, peur, changements de statistiques (sur soi ou la cible), drain, soin, critique, coups multiples.
- **Créatures** : sprites de face et de dos (en gros pixels), numéro, espèce, types, rareté (légendaire, fabuleuse), Pokédex, **statistiques de base avec leurs barres et leur total**, EV donnés, **faiblesses et résistances calculées** depuis la table des types, talents, capture, croissance, sexe, taille, poids, **évolutions** (niveau, objet, échange, amitié, quête…), **attaques par niveau** et **par CT**.
- **Objets** : icône, catégorie, prix, description, et **ce qu'il fait** : soin, statut, rappel, PP, EV, niveau, **IV au maximum (capsule)**, **menthe** (l'effet d'une nature), balle, évolution, repousse, **ouvrir un passage** (à la place des CS).
- **Dresseurs** : classe, personnage (son portrait), argent gagné, équipe de 6 (niveau, nature, objet tenu, attaques), si son niveau **suit la progression du joueur**, et ses trois dialogues.
- **Boutiques** : les articles (objets ou **créatures**), leur prix, et **ce qui débloque chacun** : 10 captures, 5 dresseurs battus, une quête finie… Une boutique peut racheter les objets et **acheter et vendre des créatures**.
- **Réglages** : monnaie, argent de départ, taille de l'équipe, **niveau maximum selon les badges**, comment les dresseurs **s'ajustent au niveau** du joueur, chance d'un chromatique, et le tableau des 25 natures.

**Les zones** ont leurs **rencontres** : la table des créatures sauvages (niveaux et chance de chacune) et la chance d'une rencontre à chaque pas.

**L'ambiance d'une carte** (panneau Cartes › `…` › Ambiance) : pluie, orage, neige, brouillard, feuilles qui tombent, lucioles, avec leur intensité, et une **teinte** posée sur toute la carte (bleu sombre pour la nuit ou l'orage, orangé pour un coucher de soleil). Tafl en montre l'aperçu, qui bouge quand l'animation est lancée (`P`) ; case « Ambiance » de la barre pour la cacher.

Dans les scripts, les champs créature, objet, dresseur et boutique proposent la liste du jeu, et Tafl refuse un script de Claude qui en nomme un qui n'existe pas.

## Jouer (Tafl 0.9)

Le bouton **Jouer** de la barre de titre (ou `F5`, ou Jeu › Jouer) lance le jeu dans **Saga**, le moteur (`moteur/`, voir [moteur/README.md](../moteur/README.md)). Tafl enregistre d'abord le jeu s'il a des modifications : Saga lit les fichiers du dossier de jeu.

- `F5` : depuis le départ du joueur.
- `Maj+F5` (ou Maj+clic sur Jouer) : depuis **la case sous la souris**, sur la carte affichée. Pratique pour essayer tout de suite le coin qu'on vient de dessiner.
- Saga déjà ouvert : il recharge le jeu dans sa fenêtre, avec ce que Tafl vient d'enregistrer.
- Lancé depuis le clone (`npm start`), Tafl lance le Saga du clone (`moteur/`, après un `npm install` dans `moteur`) ; installé, il lance le Saga installé (depuis Atelier).

## Vérifier le jeu et test rapide (Tafl 0.27, avec Saga 0.10)

**Jeu › Vérifier le jeu** (`Ctrl+Maj+V`) lit tout le jeu, même ce qui n'est pas encore enregistré, et liste ce qui empêcherait de jouer ou de finir l'histoire. Les **erreurs** (rouge) sont à corriger ; les lignes **à vérifier** (jaune) sont peut-être voulues. Un clic sur une ligne ferme la liste, ouvre la carte et fait clignoter la case ; la notification propose d'ouvrir l'événement ou de revoir la liste.

- **Téléporteurs** : une carte d'arrivée qui n'existe plus, une case hors de la carte, bloquée, sous un PNJ ou d'où l'on ne peut aller nulle part, un téléporteur posé sur une case bloquée, et ceux d'où on ne revient jamais (un trou peut être voulu). Les commandes « téléporter » des scripts aussi.
- **Cartes et personnages inaccessibles** : Tafl marche depuis le départ du joueur comme Saga (passage, rebords, PNJ qui bloquent, téléporteurs, scripts qui téléportent) et signale les cartes où l'on ne va jamais et les personnages, panneaux, coffres ou obstacles qu'on ne peut pas atteindre (aucune case libre devant eux).
- **Quêtes et conditions impossibles** : une quête que rien ne commence ou ne finit (ou seulement un événement inaccessible), une étape jamais atteinte, une page qui attend un interrupteur jamais allumé, un objet que personne ne donne ni ne vend, un badge jamais donné, une quête jamais finie. Pareil pour les articles de boutique, les zones et les obstacles.
- **Ids qui n'existent pas** : un personnage, objet, créature, dresseur, boutique, quête, badge ou groupe de monstres nommé dans un script ou une donnée, mais absent des données.

Le vérificateur est optimiste : il suppose que le joueur obtient tout ce que le jeu donne ou vend quelque part, et qu'un PNJ qui peut disparaître ne bloque pas. Ce qu'il signale reste donc impossible même dans le meilleur des cas. Loki peut le lancer aussi (action `verifier`).

**Jeu › Test rapide** (`Ctrl+F5`) lance Saga avec un **état de départ choisi** : la case de départ (le départ du jeu, ou une case : par défaut celle sous la souris), l'équipe et ses niveaux (les héros du groupe pour le pack JRPG), les objets du sac, l'argent, les badges, les interrupteurs allumés et l'avancée de chaque quête. Pour essayer l'arène 2 sans rejouer le début.

- Donne un nom à l'état (« Avant l'arène 2 ») et **Enregistrer l'état** : il reste dans la liste de gauche (gardé dans `jeu.json`, champ `tests`). Double-clic sur un état : le lancer. `Ctrl+Entrée` : lancer.
- Saga démarre une **partie neuve** avec cet état, affiche un badge **Test** dans sa barre de titre, et **sauvegarde ces parties à part** : ta vraie partie n'est jamais écrasée.

## Importer des planches et poser des objets (Tafl 0.10)

Pour reprendre des planches de tuiles trouvées sur Internet ou extraites d'un jeu, même « sales ».

**La fenêtre d'import** (`Ctrl+I`, ou glisser l'image sur Tafl) montre l'image à gauche, avec la grille des tuiles par-dessus, et les réglages à droite. Tout se met à jour en direct.

- **Le fond peint dans l'image** : beaucoup de planches ont un damier (ou une couleur unie) dessiné dans l'image, au lieu d'une vraie transparence. Tafl le reconnaît tout seul (il cherche les une ou deux couleurs qui forment de grands carrés unis) et le rend transparent. Seuls les grands morceaux de ces couleurs disparaissent : un reflet de la même couleur au milieu d'un objet est gardé (case « Garder les petits morceaux », à décocher si besoin). Si Tafl se trompe : « Une couleur choisie », ou **Alt+clic** sur le fond dans l'aperçu. « Garder l'image telle quelle » ne touche à rien.
- **Taille, marge, espacement** : la taille des tuiles (16 px pour Pokémon), la marge autour de la planche et l'espace entre deux tuiles (souvent 1 px sur les planches téléchargées). La grille de l'aperçu montre tout de suite si c'est juste.
- **La zone** : **glisse sur l'aperçu** pour ne prendre qu'une partie de l'image (par exemple sans les maquettes de pièces à droite d'une planche d'intérieur) ; le reste est assombri. Double-clic : toute l'image. Elle se règle aussi en nombres (colonne, rangée, largeur, hauteur, en tuiles).
- **Tampons** : chaque objet de plusieurs tuiles (un arbre, un lampadaire, une fontaine, un étal…) devient un **tampon**, entouré de pointillés jaunes dans l'aperçu. Tafl les trouve par leurs pixels : entre deux objets voisins, il reste toujours un peu de fond. Deux objets qui se touchent vraiment (des feuillages qui se chevauchent) font un seul tampon : on le découpe ensuite (voir plus bas).
- En bas : le nombre de cases, de cases vides, de tuiles différentes et de tampons.

Une ombre dessinée par-dessus le damier garde le damier assombri (ce sont des pixels opaques, mélange d'ombre et de damier) : à retoucher dans Skald si elle gêne.

**L'outil Tampon** (`S`, mode Carte) et le panneau **Tampons** :

- Clic sur un tampon du panneau : il est choisi avec l'outil Tampon. Sur la carte, il suit la souris en transparence ; **clic** = le poser (son coin en haut à gauche sur la case), **glisser** = en poser d'autres côte à côte (une rangée d'arbres, une forêt), **clic droit** = l'effacer. Les cases vides du tampon laissent voir ce qu'il y a dessous.
- **Rangées au-dessus du joueur** (double-clic sur le tampon) : pour un arbre ou une maison, les rangées du haut (la cime, le toit) vont sur le calque « au-dessus du joueur » (Au-dessus), le reste sur le calque choisi. Le joueur passe alors derrière l'arbre. Un trait pointillé jaune les sépare sur la carte.
- **Créer un tampon soi-même** : outil Tampon, **Maj+glisser** sur la carte : les tuiles du rectangle (calque choisi) deviennent un nouveau tampon. C'est aussi comme ça qu'on découpe un tampon trop grand : on le pose, on Maj+glisse sur la partie voulue, puis on supprime le grand.
- Clic droit sur un tampon : réglages, ordre, supprimer (ses tuiles restent dans le jeu, et sur la carte).
- Les tampons sont enregistrés avec les tuiles (dans le `.tafl`, ou le `tuiles.tafl` d'un dossier de jeu), et `Ctrl+Z` annule tout. Le moteur n'en a pas besoin : sur la carte, ce sont des tuiles comme les autres.

## Groupes de cartes et carte monde (Tafl 0.11)

**Ranger les cartes en groupes.** Quand un jeu a beaucoup de cartes (chaque ville avec ses maisons, son centre, sa boutique…), le panneau Cartes les range en **groupes** repliables, comme des dossiers.

- Clic droit sur une carte › **Mettre dans un groupe…** : choisis un groupe existant ou écris un nouveau nom (« Ville 1 », « Routes »…). Vide = sans groupe. La fenêtre **Nouvelle carte** propose aussi le groupe (celui de la carte affichée, par défaut).
- **Glisser-déposer** : glisse une carte sur le titre d'un groupe pour l'y ranger, ou sur une autre carte pour la placer juste à côté (elle prend son groupe).
- Clic sur le titre d'un groupe : le replier ou le déplier (Tafl s'en souvient). Replié, il montre quand même la carte affichée. Double-clic : renommer. Clic droit : renommer, défaire le groupe (les cartes restent).
- Le groupe est enregistré dans chaque carte (`groupe`). Il ne change ni l'id ni le fichier de la carte.

**La carte monde** (bouton globe du panneau Cartes, Carte › Carte monde, ou `Ctrl+Maj+M`) : une grande vue de toutes les **cartes extérieures** posées ensemble, comme vues d'avion : ville 1, route 1, ville 2, route 2…

- **Les intérieurs n'y sont pas** : maisons, centres, grottes… Une carte est un intérieur si on coche « Intérieur » en la créant, avec clic droit › **Carte intérieure**, ou en la décochant dans la liste à gauche de la carte monde. Les intérieurs ont une petite maison dans le panneau Cartes.
- **Placement automatique** : Tafl pose les cartes d'après les **téléporteurs** entre elles. Une route dont le bord droit mène au bord gauche d'une ville se pose juste à gauche de la ville, alignée sur le passage. Un bâtiment de passage entre deux routes (un intérieur relié aux deux) compte aussi.
- **À la main** : glisse une carte pour la déplacer (case par case). Glisse le fond pour te déplacer, molette pour zoomer, double-clic sur une carte pour l'ouvrir. **Replacer tout seul** recommence le placement automatique.
- **Repères** : un point vert = un passage entre deux cartes dont les bords se touchent ; en pointillés orange, les deux bouts du passage ne se touchent pas (la carte est mal placée, ou le téléporteur mène loin). Un bord rouge = deux cartes qui se chevauchent.
- **Exporter en image…** : toute la région en un seul PNG (pour un écran « carte de la région » dans le jeu, ou pour le montrer).
- **Valider** garde les places (`monde` dans chaque carte, en cases) ; `Ctrl+Z` annule. Le moteur pourra s'en servir pour enchaîner les cartes voisines sans écran noir.

## Les sprites des personnages (Tafl 0.12)

Avant, un personnage n'avait qu'**une tuile** sur la carte : la même image, qu'il regarde en haut, en bas ou de côté. Maintenant il a un **sprite** : 4 directions (face, gauche, droite, dos) et sa marche.

Dans **Jeu › Données du jeu › Personnages**, partie **Sprite sur la carte** :

- **Créer le sprite** : choisis la taille d'une image (une case, ou une case et la tête au-dessus, 16 × 32, comme dans Pokémon) et le nombre d'images par direction (3 : debout, pied gauche, pied droit). S'il avait une tuile, elle sert de point de départ dans chaque image.
- **Dessiner** : clique une image dans la grille (une rangée par direction), puis dessine sur la grande image. Clic : crayon, clic droit : gomme, `Alt` + clic : prendre une couleur, et le seau pour remplir. Les couleurs sont celles de la palette du jeu, plus le sélecteur. Sur un pas, l'image debout apparaît en transparence pour caler le personnage. Le cadre violet, c'est la case du jeu : les pieds vont dedans.
- **Gagner du temps** : « Droite = Gauche en miroir » (on ne dessine qu'un côté), « Copier l'image debout ici » (puis on ne change que les jambes), « Annuler » (dans le sprite).
- **L'aperçu** à côté de la grille fait marcher le personnage dans la direction choisie, comme dans le jeu.
- **Importer une planche…** faite dans Skald ou Photoshop : 4 rangées (face, gauche, droite, dos), et dans chaque rangée l'image debout puis les pas. Tafl devine la découpe. **Exporter la planche…** pour la retoucher ailleurs.
- Sur la carte de Tafl, les PNJ apparaissent avec leur sprite, tournés vers leur direction. Dans Saga (0.2.1 ou plus), le héros et les PNJ marchent avec.
- **Claude** dessine aussi les sprites, image par image (`dessiner_sprite`, avec le miroir pour l'autre côté), les regarde (`voir_sprite`) et importe une planche du projet (`personnage`, action `sprite`).

Le format est décrit dans `FORMAT.md` (`sprite` dans `personnages.json`).

## Ranger et trier les tuiles (Tafl 0.13)

Le panneau **Tuiles** sait maintenant ranger un jeu de plusieurs centaines de tuiles.

- **Catégories** : clic droit sur une tuile › *Ranger dans une catégorie…* (`Ctrl+G`), puis choisis une catégorie existante ou écris un nouveau nom (« Herbe », « Eau », « Maisons »…). Les tuiles se rangent sous un titre qu'on replie d'un clic (comme les groupes de cartes). Double-clic sur le titre : renommer ; clic droit : choisir toutes ses tuiles, la trier, la défaire.
- **Les planches importées** arrivent rangées dans une catégorie au nom du fichier (`foret.png` → « foret »).
- **Plusieurs tuiles à la fois** : `Ctrl+clic` en ajoute ou en retire une, `Maj+clic` prend toutes celles entre deux, `Ctrl+A` toutes celles affichées. On les glisse ensemble, on les range ou on les supprime d'un coup.
- **Glisser-déposer** : sur une autre tuile, la ou les tuiles se placent à côté (et prennent sa catégorie) ; sur un titre, elles rejoignent cette catégorie ; sur « Sans catégorie », elles en sortent.
- **Chercher** (`Ctrl+F`) : le champ au-dessus des tuiles filtre par nom, catégorie ou numéro. `Échap` le vide.
- **Trier** (bouton à droite du champ, ou menu Tuile) : par nom, par couleur, par utilisation (les plus posées d'abord), les animées d'abord, ou grouper par catégorie. Avec plusieurs tuiles choisies, seules elles changent de place entre elles ; sinon tout le jeu, chaque catégorie restant groupée.
- **Faire le ménage** : *Fusionner les tuiles en double* (les tuiles aux pixels identiques n'en font plus qu'une, la carte utilise celle gardée) et *Supprimer les tuiles inutilisées* (posées nulle part : ni carte, ni tampon, ni événement, ni personnage ; on peut aussi juste les choisir pour les regarder d'abord).
- **La carte suit toujours** : ranger ou trier change les numéros des tuiles, mais Tafl met à jour les cartes, les tampons, les événements et les personnages. Rien ne bouge à l'écran du jeu. `Ctrl+Z` annule chaque rangement.
- **Claude** range aussi (`ranger_tuiles`) : catégories, tris, doublons, tuiles inutilisées ; `voir_tuiles` lui donne les catégories.
- La catégorie est enregistrée dans le `.tafl` (champ `categorie` de chaque tuile, voir `FORMAT.md`). Saga l'ignore.

## Des panneaux à la bonne taille (Tafl 0.14)

Sur un grand écran, le panneau de droite ne reste plus coincé à 300 px :

- **Largeur** : glisse le bord gauche du panneau (entre la carte et lui). Double-clic : largeur par défaut. Sur un écran large, il démarre à 560 px.
- **Deux colonnes** : dès qu'il est assez large, à gauche Cartes, Calques, Événements ; à droite Tampons et Tuiles, sur toute la hauteur. Réglable (Automatique, Toujours une, Toujours deux) dans les réglages.
- **Replier** un panneau : clic sur son titre. **Hauteur** d'un panneau : glisse son bord du bas (double-clic : automatique). Les tuiles prennent toute la place qui reste.
- **Taille du texte et des boutons** des panneaux (80 à 160 %) et **taille des vignettes** (28 à 128 px) dans les réglages (Ctrl+,). Raccourci : Ctrl+molette sur le panneau, ou sur les tuiles et les tampons pour les vignettes. Aussi dans Affichage : Panneaux plus grands / plus petits, Disposition des panneaux par défaut.

## L'interface du jeu (Tafl 0.15)

Dans **Jeu › Données du jeu › Réglages**, partie **Interface du jeu** :

- **Thème** : **Verre** (plaques sombres et floues, coins arrondis, le combat flotte sur le décor) ou **Pixel** (police pixel, cadres nets à double bordure, comme sur Game Boy Advance). Saga (0.4 ou plus) l'applique aux dialogues, aux choix, aux annonces, au carnet et au combat.
- **Couleur d'accent** : la couleur des noms dans les dialogues, des curseurs, de la barre d'XP. « Celle de Saga » revient à l'orange par défaut.
- Le joueur peut toujours forcer un thème dans les réglages de Saga.
- **Claude** le règle aussi (action `donnee`, sorte `reglages`, `interface`).

## Progression, héros et règles (Tafl 0.16)

- **Badges** : dans **Jeu › Données du jeu › Réglages**, partie **Badges**, la liste des badges du jeu (nom, icône : clic pour importer un PNG, clic droit pour la retirer). La commande **Donner un badge** (groupe Progression) les donne ; la condition **Le joueur a un badge** les teste (un garde qui ne laisse passer qu'avec le badge de la ville). Leur nombre fait monter le **niveau maximum** de l'équipe et celui des dresseurs qui s'ajustent : avant, rien ne donnait de badge, donc ces plafonds restaient bloqués.
- **Argent** : la commande **Donner ou retirer de l'argent** (une récompense, un péage) et la condition **Le joueur a assez d'argent**.
- **Personnaliser le héros** : dans la fiche du héros (Personnages, case « C'est le héros » cochée), la partie **Tenues** : chaque tenue a son nom et son sprite (4 directions et la marche), en partant d'une copie de la tenue de base pour ne changer que les couleurs. La commande **Personnaliser le héros** ouvre dans le jeu l'écran où le joueur tape son nom et choisit sa tenue ; **Changer la tenue du héros** lui en met une pour l'histoire.
- **Pack de règles** : dans Réglages, partie **Règles du jeu**. Pour l'instant : Pokémon. Ce choix dit au moteur quelles règles de combat, de capture et de statistiques suivre ; un autre pack pourra venir plus tard sans toucher aux cartes, aux événements ni aux quêtes.
- **Claude** sait tout faire aussi : commandes `argent`, `badge`, `personnaliser`, `tenue` dans les scripts, `personnage` action `tenue` (et `retirer_tenue`), `voir_sprite` et `dessiner_sprite` avec `tenue`, les badges et le pack dans `donnee` sorte `reglages`.
- Saga lira ces nouveautés dans sa prochaine version.

## De plus belles tuiles par Claude (Tafl 0.17)

Claude dessinait pixel par pixel, en texte : ses tuiles étaient justes mais plates. Il a maintenant les outils et les réflexes d'un pixel artiste :

- **Des consignes de pixel art** (dans ses instructions de départ) : rampes de couleurs, lumière en haut à gauche, contours de la teinte la plus sombre plutôt que noirs, textures en amas sans pixels isolés, sols qui se raccordent, profondeur. Il suit la méthode : rampes → base → formes et volumes → détails → regarder → corriger.
- **Palette « Brume (16 bits sombre, en rampes) »** : d'après ta référence (verts éteints, ardoises, bois, pluie), rangée en rampes du plus sombre au plus clair.
- **`rampe`** : à partir d'une couleur, 3 à 8 teintes avec le décalage de teinte (les ombres vers le bleu violet, les lumières vers le jaune), ajoutées à la palette.
- **`peindre_tuile`** : peint une tuile par opérations — remplir, rectangle, ellipse, ligne, pot, dégradé tramé façon 16 bits, taches douces, nettoyer (enlève les pixels isolés), marques (amas, brins, touffes d'herbe, traits, espacées ; se raccordent d'un bord à l'autre), contour, ombrage selon la lumière, ombre portée, pixels, symétrie, remplacer, décaler.
- **`dessiner_objet`** : un grand objet d'un seul tenant (sapin, maison, falaise…) sur plusieurs tuiles, avec les mêmes opérations plus `polygone` (silhouettes nettes, dents de scie) et `repeter` (un motif soigné posé en rangées). L'image est découpée en tuiles et devient un tampon prêt à poser ; Claude peut la reprendre et la retoucher.
- **`animer_tuile`** : fabrique toutes les images d'une animation à partir d'une seule — défilement (eau qui coule), cycle de couleurs (reflets), balancement (herbes au vent), scintillement.
- **Il voit son résultat** : après chaque dessin, il reçoit la tuile, toutes ses images et une mosaïque 3 × 3 (pour les raccords), avec un regard critique (nombre de couleurs, agitation — au-delà d'un tiers ça fait brouillon —, pixels isolés, contraste, raccords visibles). La consigne : un sol calme, le détail sur les objets et les bordures. `voir_tuile` le montre aussi.
- **Variantes** : `poser_tuiles` accepte `variantes` (d'autres versions de la même herbe…) mélangées au hasard pour casser la répétition.

## Le PC (Tafl 0.21)

- Nouvelle commande d'événement **PC : les boîtes du joueur** (`ecran_boites`, groupe Services) : à mettre sur l'ordinateur du centre de soins. Dans Saga 0.6, elle ouvre le PC, où le joueur range ses créatures dans des boîtes de 30 places. Claude la connaît aussi.
- **Jeu › Données du jeu › Réglages › Menus du jeu** : la forme des menus dans Saga. Le pack de règles en donne une (Pokémon : Équipe, Pokédex, PC, boîtes de 30 places en grille de 6, résumé Infos / Statistiques / Attaques), en gris ; tu peux renommer les menus, cacher le Pokédex, changer la taille et la forme des boîtes (grille ou liste) et choisir les pages du résumé.
- Saga 0.6 garde maintenant les boîtes et le Pokédex (espèces vues et attrapées) dans la sauvegarde (voir `FORMAT.md`).

## Les planches nommées (Tafl 0.20)

Nommer les tuiles d'une planche (à la main ou par Claude) se fait une fois, puis sert dans tous les jeux :

- **Fichier › Exporter la planche nommée (PNG + noms)…** : les tuiles (toutes, ou une catégorie, souvent une planche importée) en PNG, et juste à côté `planche.tuiles.json` : le nom, le passage et la catégorie de chaque tuile, les autres images des tuiles animées, et les tampons.
- **Importer ce PNG** (Ctrl+I) dans n'importe quel jeu : Tafl trouve le `.tuiles.json` et reprend tout. Si les tuiles sont déjà dans le jeu sans nom, « Une seule fois chaque tuile identique » les reconnaît et leur donne leur nom (les noms que tu as déjà donnés ne sont jamais remplacés).
- Claude a l'action `exporter_planche_nommee`, et `importer_planche` relit les noms tout seul.
- L'export Tiled donne aussi le nom (la classe de la tuile dans Tiled) et le passage des tuiles nommées.

## Claude consomme moins (Tafl 0.19)

Une démo de villes avec les planches de DeviantArt épuisait la limite d'utilisation. La mesure (4 planches, 2 589 tuiles) a montré pourquoi : chaque action de Claude relit **toute** la conversation, et certaines réponses étaient énormes. `infos` listait les 2 589 tuiles une par une (~22 000 jetons, relus à chaque action suivante), `voir_tuiles` rendait une planche de 25 px de large (illisible, donc Claude regardait les tuiles une à une), `voir_carte` renvoyait toujours une image et toutes les cases, et une ville se posait en centaines de petites actions.

- **Le catalogue** (`catalogue`) : les tuiles par catégorie et par nom, en plages (« 120-131 herbe haute [libre] »), et les tampons. Claude le lit au lieu de regarder des images. `infos` ne liste plus les tuiles au-delà de 40 (un résumé de ~500 jetons au lieu de ~22 000).
- **`nommer`** : Claude décrit d'un coup beaucoup de tuiles et de tampons (nom, passage). Les noms sont gardés dans le jeu : la planche importée est regardée **une fois**, les conversations suivantes lisent le catalogue.
- **`voir_tuiles` par pages** : 16 tuiles par rangée, numérotées (le numéro de la rangée à gauche, la colonne en haut), 256 au plus (~400 jetons l'image).
- **`plan_carte`** : toute une ville en un appel. Claude écrit un plan, un caractère par case, et une légende (« = » le chemin, « M » la maison (un tampon), « ~ » l'eau qui bloque…), avec un fond (l'herbe partout). Ça crée la carte si besoin, pose tuiles, variantes, tampons et passage, et s'annule d'un seul `Ctrl+Z`. Les tuiles et tampons se désignent par leur nom.
- **Images sur demande** : `voir_carte` donne du texte compressé (« 12*5 » = 5 fois la tuile 12, jusqu'à 64 × 64 cases, `x`, `y` pour lire une partie), l'image seulement avec `image: true` ; `voir_tampons` par pages, `voir_tuile` ne donne plus de pixels en texte quand ils seraient tous « ? ».
- **Le compteur de jetons** : sous chaque réponse, le panneau Claude affiche ce qu'elle a coûté (jetons lus, dont en cache, écrits, nombre d'appels, taille de la conversation). Au-delà de 80 000 jetons, il conseille de commencer une nouvelle conversation.
- **Des consignes d'économie** pour Claude : texte d'abord, nommer les planches une fois, un plan puis `plan_carte`, une carte après l'autre.

(Claude Code met déjà en cache les instructions et la conversation : c'est la part « en cache » du compteur. Ce qui coûte, c'est le nombre d'actions multiplié par la taille de la conversation.)

## Générer des tuiles avec ComfyUI (Tafl 0.22)

Tafl fait dessiner des tuiles par **ComfyUI**, sur ta carte graphique (une RTX 4070 suffit), **sans que tu voies ComfyUI** et sans dépenser de jetons Claude.

**Comment ça marche.** ComfyUI, c'est un moteur en Python (qui calcule sur la carte graphique) et une page web avec des nœuds. Tafl n'utilise que le moteur : à la première génération, il le démarre **en arrière-plan, sans fenêtre**, sur ton ordinateur seulement (127.0.0.1, port 8189), et il l'arrête quand tu fermes Tafl. Si l'application ComfyUI est déjà ouverte, Tafl se sert d'elle et ne la ferme pas.

**Installer (une fois)** : menu **Générer › Installation et réglages de ComfyUI…**. Tafl cherche tout seul ComfyUI Desktop (`%LOCALAPPDATA%\Comfy-Desktop`, `%USERPROFILE%\ComfyUI-Installs`, `%APPDATA%\ComfyUI\config.json`…), la version portable, son Python et le dossier des modèles. La fenêtre montre ce qui est trouvé, et pour chaque chose qui manque un bouton : télécharger ComfyUI (site officiel), choisir son dossier, son `python.exe` ou son dossier `models`, **télécharger Pixel Art XL** (un LoRA de 170 Mo qui donne un vrai pixel art aux modèles SDXL), ou n'importe quel modèle depuis une adresse Hugging Face ou Civitai (le lien de la page suffit). Beaucoup de modèles Civitai demandent d'être connecté : colle ta clé Civitai gratuite (bouton « Créer ma clé Civitai », rubrique API Keys de ton compte) ; elle reste sur ton ordinateur, dans les réglages de Tafl. Les modèles pixel art **Pixel Art Diffusion XL** et **Nova Pixels XL** sont reconnus à leur nom de fichier : Tafl ajoute leurs mots-clés, règle étapes et CFG, et ne leur ajoute pas le LoRA Pixel Art XL. Pixel Art Diffusion XL est choisi d'office pour le style Pixel art. Elle montre aussi l'état du moteur et ses dernières lignes, en cas de souci.

**Générer** : **Générer › Générer des tuiles avec ComfyUI…** (`Ctrl+Maj+G`).

- **Description** : en français ou en anglais. Les modèles comprennent mal le français : Tafl traduit les mots courants (herbe, sapin, maison, toit, pavés, neige…) et affiche la phrase envoyée au modèle.
- **Style** : pixel art, peint à la main, dessin (cel shading), réaliste, ou libre (seulement ta description). Pas seulement du pixel art : chaque style choisit le modèle qui lui va (DreamShaper XL Lightning, rapide, pour le pixel art et le peint ; Juggernaut XL pour le réaliste) et le LoRA Pixel Art XL s'il est installé.
- **Sorte** : un **sol qui se répète** (les bords sont fondus pour raccorder sans couture : le résultat est montré répété 2 × 2) ou un **objet détouré** (le fond uni est retiré, l'objet est posé en bas de sa case).
- **Taille** en tuiles, **1 à 4 variantes** côte à côte (la petite vignette dans le coin : l'image brute de ComfyUI). Clique sur la meilleure puis **Ajouter au jeu** : la fenêtre d'import habituelle s'ouvre (découpe en tuiles, catégorie « ia-… », tampon pour un objet).
- **Détails** : fidèle (par défaut : l'image de ComfyUI telle quelle, à l'échelle des tuiles), plus calme ou très calme (la phrase demande moins de détails, et Tafl lisse et retire les couleurs rares : les petits détails disparaissent).
- **Pixel art** : Tafl mesure la grille des « gros pixels » de l'image de ComfyUI (environ 8 pixels avec Pixel Art XL, mais pas exactement, et décalée), prend un pixel au milieu de chaque case, puis la taille voulue sans la tasser ; chaque bloc prend sa couleur dominante (des aplats nets, pas de flou), puis les couleurs sont ramenées à la **palette du jeu ouvert** (ou à 8 à 32 couleurs), la transparence est franche et les pixels isolés sont retirés. Les autres styles gardent leurs nuances.
- Pendant le calcul : une barre de progression (démarrage, chargement du modèle, dessin en %), le temps écoulé, une carte animée par variante attendue, et le bouton Arrêter.
- **Partir de la tuile choisie** (sol, jeu ouvert) : la tuile est répétée et donnée au modèle, qui la redessine (« image vers image ») avec plus ou moins de liberté. Le résultat garde le calme et les couleurs du jeu.
- **Aperçu** : la tuile telle qu'elle sera ; « Aperçu répété 2 × 2 » pour vérifier les raccords. Clic sur la vignette du coin : l'image de ComfyUI en grand.
- **Réglages avancés** : modèle, LoRA, à éviter, graine (pour refaire la même image), étapes, fidélité.

**Claude** a l'action `generer_tuiles` : il écrit la description, ComfyUI dessine, les tuiles arrivent dans le jeu. Seul le texte de l'appel coûte des jetons.

Le moteur garde ses modèles dans la mémoire de la carte graphique : **Générer › Libérer la carte graphique** la rend (pour jouer, ou pour Photoshop), **Arrêter ComfyUI** l'arrête tout de suite.

Pas encore : Flux Kontext (déjà dans tes modèles) pour **retoucher** une tuile ou une planche existante à partir d'une image.

## Combats, boutiques et obstacles (Tafl 0.24, pour Saga 0.7)

- **Événement « Obstacle »** (outil Événement N, type Obstacle) : un arbre à couper, un rocher à briser ou à pousser, avec l'objet qu'il faut (Hache, Marteau, Gants de force proposés), son message, et « repousse quand le joueur quitte la carte ». Donne-lui une tuile ; sa page 1 se joue juste après le passage (un objet caché sous le rocher). Un rocher poussé sur un déclencheur le lance : de quoi faire des énigmes. C'est la suite des zones « objet requis » (l'eau et la planche de surf) : plus de CS, des objets.
- **Réglages › Niveau des créatures sauvages** (facultatif) : elles peuvent suivre l'équipe ou le plafond des badges, avec un écart. Deux cases facultatives : les dresseurs, et les sauvages, ajustés évoluent avec leur niveau.
- **Réglages › Amitié** : le seuil des évolutions « Par amitié » (220). L'amitié part du « Bonheur de départ » de chaque créature.
- **Objets** : nouveaux effets « Empêche d'évoluer, tenu (Pierre Stase) » et « Fait monter l'amitié ».
- **Boutiques** : colonne « Grisé avant » dans les articles (l'article se montre grisé avec son déblocage au lieu d'être caché).
- **Compteurs** : créatures sauvages battues, espèces vues, espèces attrapées, quêtes finies, en plus des captures, dresseurs battus, évolutions, badges et pas.
- Loki connaît tout ça (actions `evenement` avec `obstacle`, `donnee`).

## Exporter le jeu (Tafl 0.26, avec Saga 0.9)

Jeu › **Exporter le jeu (web, Windows)…** (aussi dans Fichier) : Tafl enregistre le jeu, puis demande à Saga (installé, ou celui du clone) d'en faire une **version web** (`index.html`, à ouvrir dans un navigateur ou à mettre sur itch.io) et/ou une **version Windows** (`MonJeu.exe`, rien à installer). Chacune donne un dossier et un `.zip` à envoyer aux testeurs, qui n'ont besoin ni de Tafl ni de Saga. Voir le README de Saga pour le détail.

## Copier-coller, annuler partout, scripts en blocs (Tafl 0.28)

- **Outil Sélection (R)**, en mode Carte : glisse un rectangle. `Ctrl+C` le copie, `Ctrl+X` le coupe, `Suppr` le vide, `Ctrl+A` prend toute la carte, `Échap` désélectionne. Glisser l'intérieur de la sélection la **déplace**.
- **Coller (`Ctrl+V`)**, aussi dans une autre carte du jeu : le morceau suit la souris, un clic le pose, clic droit ou `Échap` annule. Les cases vides du morceau ne recouvrent rien (un arbre se colle sur l'herbe).
- **Ce qu'on emporte** (barre d'options de l'outil) : le calque choisi ou **tous les calques** (collés sur les calques de même nom, sinon de même rang), et en plus, si tu coches : le passage peint, les zones (recoupées aux bords), les événements et les téléporteurs (ils remplacent ceux déjà sur la case). Tout est aussi dans le menu **Édition**.
- **Historique (`Ctrl+H`** ou le bouton horloge de la barre de titre) : la liste des dernières actions ; un clic ramène le jeu à cette étape, et on peut ensuite refaire. Montrer ou cacher un calque s'annule aussi.
- **`Ctrl+Z` / `Ctrl+Y` dans les fenêtres** de l'événement et des Données du jeu (sprites des personnages compris) : chaque changement s'annule un par un, avant même de valider. Dans une case de texte, `Ctrl+Z` reste celui du texte.
- **Le script en blocs** (fenêtre de l'événement, bouton **Blocs** / **Liste**) : chaque commande est un bloc coloré par famille, reliés de haut en bas ; un choix s'ouvre en une branche par réponse, un « si » en deux branches (alors, sinon), qui se rejoignent. Glisse un bloc sur un trait pour le déplacer (même d'une branche à l'autre), glisse une commande de la palette de gauche pour l'ajouter, ou clique le `+` d'un trait. Double-clic : modifier. Le format du script ne change pas : Saga le lit comme avant.
- **Aperçu du dialogue** : un clic sur un dialogue ou un choix montre la boîte comme dans Saga (portrait, nom dans sa couleur, texte qui s'écrit, réponses), au thème **Verre** ou **Pixel** du jeu. Les flèches passent d'une boîte à l'autre (une ligne vide dans un texte fait une nouvelle boîte, comme dans le jeu).

## Ambiance : musique, jour et nuit, lumières (Tafl 0.29, pour Saga 0.11)

- **Sons du jeu** : les fichiers du dossier `sons/` du jeu (MP3, OGG, WAV…). Partout où on choisit un son, une liste, ▶ pour l'écouter, + pour en ajouter (Tafl le copie dans `sons/`).
- **Carte › Ambiance** : en plus de la météo et de la teinte, la musique de la carte (ou « celle d'avant continue », ou le silence), un fond sonore en boucle (ou la pluie de la météo, faite par Saga) avec son volume, et « Suit le jour et la nuit ».
- **Tuiles** (clic droit › Lumière de la tuile…) : une tuile qui éclaire, avec sa couleur, sa portée, sa force et « elle vacille ». Un point lumineux la marque dans la liste des tuiles. Plusieurs tuiles choisies : la même lumière pour toutes.
- **Événements** : une section Lumière (un feu de camp, un PNJ avec une lanterne).
- **Données du jeu › Réglages** : Jour et nuit (aucune horloge, horloge du jeu avec la durée d'une journée et l'heure de départ, ou heure réelle du PC), Musique et sons (musique des combats, contre un dresseur, fanfare de victoire, et chaque bruitage : celui de Saga, aucun, ou un fichier), Sauvegarde auto (en changeant de carte, toutes les N minutes).
- **Commandes** : Changer la musique, Jouer un son, Changer l'heure (avancer ou mettre à une heure) ; **condition** « Le moment de la journée » (matin, jour, soir, nuit).
- **Test rapide** : l'heure de départ du test, quand le jeu a une horloge.
- Loki connaît tout ça (action `ambiance`, commandes et conditions des scripts).

## Les espaces de travail (Tafl 0.30)

Tafl est devenu un éditeur de jeu : son interface est rangée en **espaces**, des onglets en haut de la fenêtre.

- **Accueil** (`Alt+1`) : sans jeu ouvert, l'écran de bienvenue. Avec un jeu : son nom, son pack de règles, quelques chiffres, la **carte du monde** (un clic ouvre la carte cliquée), le **vérificateur** (un clic montre le problème), des raccourcis, les jeux récents et les dernières modifications.
- **Tuiles** (`Alt+2`) et **Cartes** (`Alt+3`) : les deux modes d'avant. `Tab` passe toujours de l'un à l'autre.
- **Événements** (`Alt+4`) : tous les événements du jeu, rangés par carte, avec une recherche ; l'éditeur d'événement en pleine page. Modifier un événement depuis la carte (outil Événement, double-clic dans le panneau) l'ouvre ici ; un nouvel événement est posé tout de suite (Ctrl+Z l'enlève).
- **Données** (`Alt+5`, ou `Ctrl+Maj+D`) : les données du jeu en pleine page. Les listes suivent le **pack de règles du jeu ouvert** (Pokémon : types, talents, attaques, créatures, dresseurs ; JRPG : éléments, compétences, classes, monstres, groupes) ; personnages, quêtes, objets et boutiques sont communs.
- **Jeu** (`Alt+6`) : jouer, test rapide, exporter, pack de règles et réglages, carte monde, titre et dossier, et le vérificateur complet (`Ctrl+Maj+V`).
- `Ctrl+Tab` : l'espace suivant.

Dans Événements et Données, on travaille sur une copie, comme dans les fenêtres d'avant : **Appliquer** (`Ctrl+Entrée`) la met dans le jeu, **Annuler les changements** la jette. Rien ne se perd : ce qui est en cours s'applique tout seul en changeant d'espace ou d'événement, en enregistrant, en jouant, et avant une action de Loki (la page se redessine ensuite avec ce qu'il a fait).

**Chercher partout** (`Ctrl+K`, ou la case « Chercher… ») : un espace, une carte, un événement (par son nom ou une phrase de ses dialogues), une donnée du pack du jeu, une tuile, un tampon, ou une commande des menus. `↑` `↓` pour choisir, `Entrée` pour y aller.

Les menus d'avant (Fichier, Édition, Tuile, Carte, Jeu, Générer, Affichage) sont derrière le bouton **☰**, à gauche du logo. `Ctrl+B` (ou le bouton à côté d'Enregistrer) cache les panneaux de droite pour dessiner en grand.

Sur un écran classique, la barre se resserre : sous 1500 px de large les petits textes partent, sous 1280 px les onglets ne gardent que leur icône. L'accueil passe sur deux colonnes.

## Les scripts JS (Tafl 0.31, pour Saga 0.12)

Quand les blocs ne suffisent pas (des dés, des calculs, une règle du pack à changer, une réaction à un moment du jeu), un jeu peut avoir ses propres **scripts JavaScript**. Tout ce qu'un script peut faire est dans [SCRIPTS.md](SCRIPTS.md), copié dans chaque dossier de jeu.

- **Où** : espace **Événements**, section **Scripts JS** sous la liste des événements. Le `+` propose des modèles qui suivent le pack du jeu (une commande avec dialogue, un jet de dés, des dégâts maison, une réaction aux victoires). Chaque script est un fichier `scripts/<nom>.js` du dossier de jeu.
- **L'éditeur** : le même que dans Rune (Monaco), avec la complétion de toute l'API (y compris les ids du jeu : objets, personnages, cartes…), les erreurs soulignées à la bonne ligne, et une colonne qui montre ce que le script déclare. **Essayer** (`Ctrl+Entrée`) le fait tourner sur une fausse partie et raconte ce qu'il fait : dialogues, objets donnés, dés lancés ; Tafl demande la réponse quand le script pose une question.
- **Trois façons de s'en servir** : `commande()` crée une commande pour le nouveau bloc **Script JS** (groupe Scripts), avec un formulaire pour ses réglages ; `formule()` remplace une formule du pack (dégâts, capture, fuite, expérience…) : ce sont les **règles maison**, qu'on peut couper une par une dans **Données › Réglages › Règles maison** ; `quand()` réagit à une nouvelle partie, à l'arrivée sur une carte, après un combat, au changement de moment de la journée ou à chaque pas.
- **Sans danger** : un script tourne dans une boîte fermée (un *Web Worker*), sans fichiers, réseau ni page. Il ne change le jeu qu'en le demandant à Saga (`saga.donner`, `saga.dire`…), ce qui le rend prêt pour le multijoueur. Une boucle sans fin est arrêtée au bout de 0,6 s, et une erreur ne casse jamais le jeu : elle est dite avec le fichier et la ligne.
- **Les dés** passent par `des` (`des.d(20)`, `des.lancer('2d6+3')`), avec une graine gardée dans la sauvegarde : recharger ne change pas le résultat.
- **Les variables** : nouvel onglet **Données › Variables** (un nombre ou un texte, avec sa valeur de départ), nouveau bloc **Variable** (régler, ajouter, retirer) et nouvelle condition **Une variable** (=, ≠, >, ≥, <, ≤). Pas besoin de script pour un compteur.
- **Le vérificateur** signale aussi les erreurs des scripts, les blocs Script qui appellent une commande inconnue et les variables qui n'existent pas ; un clic ouvre le script à la bonne ligne. **Ctrl+K** trouve un script par son nom, ses commandes ou un bout de son code.
- **Loki** lit, écrit et essaie les scripts (actions `scripts`, `script`, `essayer_script`) et crée les variables (`variable`), toujours avec Autoriser / Refuser et `Ctrl+Z`.

## Les modules de jeu (Tafl 1.2, pour Saga 1.4)

**Données › Réglages › Règles du jeu › Modules** : en plus de son pack de règles (un seul), un jeu peut activer des **modules**, qui ajoutent au monde une chose que le jeu sait faire en plus, quel que soit le pack. Aucun module n'est encore livré (le premier prévu est « gestion ») : la section le dit.

- Tafl garde maintenant tel quel tout fichier de `donnees/` qu'il ne sait pas éditer (les données d'un module, ou d'un Tafl plus récent) et le réécrit à l'enregistrement.
- Le vérificateur signale un module activé que Tafl ne connaît pas, et accepte dans `quand()` les moments des modules actifs.
- Le contrat des modules : `moteur/renderer/moteur/modules/MODULES.md` ; leur description commune à Tafl et Saga : `commun/modules.js`.

## Les journées et le module gestion (Tafl 1.3, pour Saga 1.5)

- **Dormir** : la commande « Dormir (passer au jour suivant) » (groupe Ambiance), avec l'heure du réveil et le soin du groupe ; la condition « Le numéro du jour ». Pour tous les jeux.
- **Le module gestion** (Réglages › Règles du jeu › Modules › Gestion) : ses réglages juste sous sa case (nom du domaine, capacité du stock, stock de départ, écran dans le carnet), et un groupe **Gestion** dans les Données : **Ressources** (nom, icône, l'objet du sac qui la représente) et **Bâtiments** (coût, nuits de chantier, production et consommation par nuit, nombre maximum). Ces onglets, ses commandes et ses conditions n'apparaissent que si le jeu active le module.
- **Le placement libre** : le type de zone **Constructible** (là où le joueur peut poser ses bâtiments), et pour chaque bâtiment une section **Sur la carte** : son tampon (son apparence et sa taille), celui du chantier, sa taille sans tampon, et sa porte. La commande « Placer un bâtiment (le joueur choisit où) », avec ses branches réussi / raté, et la case « Construire depuis le carnet » dans les réglages du module.
- Le vérificateur signale une ressource, un bâtiment ou un tampon qui n'existe pas, une page qui attend un bâtiment que rien ne construit (un bâtiment que le joueur peut poser librement compte comme construit), et « Placer un bâtiment » sans aucune zone constructible.

## Les habitants et les récoltes (Tafl 1.4, pour Saga 1.6)

- **Repousse après N nuits** (fenêtre d'un événement, pour tous les jeux) : son « déjà fait » s'éteint tout seul après ce nombre de nuits, et il revient à sa page 1. Pour une récolte : page 1 « donner l'objet + déjà fait », page 2 avec la condition « déjà fait » et la case « absent ».
- **Les habitants** (module gestion) : dans un bâtiment, **Logement** (combien il loge) et **Ouvriers** (combien il lui faut pour produire) ; dans les réglages du module, les habitants au départ, les arrivées par nuit le repas d'un habitant, et ce que fait la faim (Tafl 1.4.1 : rien, bloquer les arrivées, ou des départs après N nuits ; ils travaillent toujours). La commande « Des habitants arrivent ou partent » et la condition « Le domaine a assez d'habitants ».
- **Tafl 1.4.1 : le passage d'un bâtiment à la souris.** Dans la fiche du bâtiment, l'image du tampon avec une couleur par case : choisis un pinceau (Bloque, Libre, Porte) et clique. Le passage proposé d'office laisse libres le toit, les cases vides et les tuiles surtout transparentes (les ombres). La porte peut mener à une carte (l'intérieur), et la commande « Ressortir du bâtiment » ramène devant elle. Le choix **Intérieur** dit si chaque bâtiment posé a le sien (par défaut) ou si tous partagent le même (une boutique).
- Le vérificateur signale une ressource de repas qui n'existe pas, et un bâtiment qui demande des ouvriers alors qu'aucun habitant ne peut venir.
- **Tafl 1.4.2 : le modèle « Le petit domaine »** (Fichier › Nouveau jeu › Partir de) : une clairière avec un pré constructible, une bâtisseuse qui explique, un lit de camp, du bois et du blé qui repoussent, et trois bâtiments (la maison et son intérieur, un par maison ; la ferme, qui a besoin d'un ouvrier ; le grenier, au même intérieur pour tous). Pour essayer tout le module gestion en quelques minutes. Le vérificateur compte maintenant les intérieurs des bâtiments comme accessibles. (Tafl 1.4.3 : sa monnaie est l'écu, et l'on commence sans argent.)
- **Tafl 1.7 : les habitants qu'on voit marcher et leurs sentiers** (Réglages › Modules › Gestion) : « On voit les habitants » (leur apparence : un personnage du jeu, ou un petit bonhomme), et « Leurs pas creusent des sentiers » : la tuile d'herbe tassée et celle du sentier (ou une terre battue dessinée par Saga), après combien de passages, et combien l'herbe repousse chaque nuit. Le petit domaine s'en sert.
- **Tafl 1.8 : la journée des habitants** (Réglages › Règles du jeu › Modules › Gestion) : « Ils suivent l'heure », avec les heures du lever, du travail et du coucher. Il faut une horloge (Réglages › Ambiance). Le petit domaine en a une, et une journée y dure 16 minutes.
- **Tafl 1.9 : le domaine et les combats** (pour Saga 1.11). Dans la fiche d'un bâtiment, la section **Repos** : « Lieu de repos » (quand on vient s'y reposer, ou chaque matin), soigne ou non, un bonus en % sur des statistiques de combat du groupe (selon le pack : Force, Défense…), pendant combien de combats, et le coût d'une visite. La commande « Se reposer » (groupe Gestion) va sur un bassin, un lit, un comptoir de l'intérieur. Dans les réglages du module : « Le butin va au stock » et « Défaite : le stock perd N % ». Pour tous les jeux : la commande « Donner un bonus au groupe » et la condition « Le groupe a un bonus ». Le petit domaine a maintenant un **sous-bois** au sud (trois monstres qui laissent des herbes des bois), des **bains chauds** (soin, Défense et Esprit +15 % pour 3 combats, une herbe par bain) et un **potager** (Force +10 % chaque matin).

## Le pack action : le temps réel (Tafl 1.10, pour Saga 1.12)

- **Réglages › Règles du jeu › Pack « Action (temps réel) »** : un jeu façon Zelda. Le héros se déplace librement et frappe à l'épée ; les ennemis se battent sur la carte, sans écran de combat. Ses réglages : cœurs, PV par cœur, attaque, défense, vitesse, invincibilité, recul, ce que donne un niveau.
- **Données › Ennemis** : la vie, l'attaque, la vitesse, la vue, le **comportement** (patrouiller, suivre, garder, fuir, immobile, ou un script JS), la portée et la recharge de son coup, le contact, le poids (le recul), l'XP, l'argent, la chance de laisser un cœur, le butin, « boss » (il ne revient pas).
- **Les zones** : leurs rencontres deviennent « tel ennemi × combien ».
- **Dans un personnage** : ses animations (repos, attaque, coup reçu, mort ; « Partir du sprite de marche » pour commencer), son corps et la zone de son coup, dessinés sur un aperçu.
- **Scripts** : `comportement('nom', (e) => ({ but, fuir, frapper }))` pour un ennemi au comportement Script, et les moments `ennemi_vaincu`, `heros_touche`, `defaite` (SCRIPTS.md).
- **Le modèle « Le petit donjon »** (Fichier › Nouveau jeu › Partir de) : une forêt avec des slimes et des chauves-souris (au comportement écrit en JS), la cabane d'Arne qui donne des potions, et une crypte avec des squelettes et leur gardien.

## Jouer à plusieurs (Tafl 1.0, pour Saga 1.0)

Saga sait ouvrir une partie aux amis sur le réseau de la maison (menu de pause › **Jouer à plusieurs**) ; ils
rejoignent depuis leur navigateur, avec un code. Ce que Tafl ajoute pour ça :

- **Données › Réglages › Partie › Multijoueur** : les joueurs peuvent-ils **échanger** (une créature, un
  objet, de l'argent) et se **défier** (duel amical) ? Pour une partie de table (pack JDR) : les joueurs
  voient-ils les **PV exacts** des autres héros, ou seulement leur état (indemne, blessé, en sang) ?
- **Nouveau bloc « Composer son équipe »** (pack Pokémon) : le joueur choisit lui-même jusqu'à six créatures
  du jeu, au niveau écrit dans le bloc. L'équipe d'avant part au PC, rien n'est perdu.
- **Nouveau modèle de jeu « Arène de duel »** (Fichier › Nouveau jeu › Partir de) : une carte d'arène, deux
  bornes d'équipe, un terrain. Deux amis se rejoignent, prennent six créatures chacun et s'affrontent. Les
  créatures viennent des données officielles, à importer une fois avec Loki.

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
- **Depuis Tafl 0.7, il écrit l'histoire** : il crée les personnages (avec leurs portraits, depuis une image du projet), les quêtes et leurs étapes, les interrupteurs, et pose les événements avec leur script complet (dialogues, choix, conditions, objets, combats, quêtes…). Tafl vérifie chaque script avant de l'accepter et lui dit précisément ce qui ne va pas. Il relit tout avec `donnees` et `evenement` (voir), et voit les portraits.
- **Depuis Tafl 0.8, il remplit les bases de données** : il cherche et lit les créatures, attaques, objets… (`voir_donnees`), en ajoute, modifie ou supprime (`donnee`), met un sprite ou une icône depuis une image du projet, lance l'import officiel, règle les rencontres des zones et l'ambiance des cartes.
- **Depuis Tafl 0.10, il pose les objets** : il importe une planche avec tous les nouveaux réglages (fond, marge, espacement, zone, tampons), regarde les tampons (`voir_tampons`), en pose ou en efface sur la carte, en crée (depuis des numéros de tuiles ou un rectangle de la carte), les renomme et règle leurs rangées au-dessus du joueur.
- **Depuis Tafl 0.12, il dessine les sprites des personnages** : une image à la fois (direction, debout ou pas), avec le miroir gauche/droite, et il voit la planche agrandie avec `voir_sprite`.
- **Depuis Tafl 0.11, il range les cartes** : il les met en groupes, marque les intérieurs, regarde la carte monde (une image de toute la région avec la place de chaque carte, action `carte_monde`), place une carte ou relance le placement automatique.
- **Depuis Tafl 0.5, il a accès à tout** : toutes les commandes des menus (les fenêtres de réglages se remplissent et se valident toutes seules), l'animation des tuiles (ajouter ou supprimer une image, la durée, l'ordre), déplacer une tuile ou la décaler d'une demi-tuile, la palette (changer de modèle, remplacer une couleur partout), les calques de la carte (remplir, vider, afficher, masquer), ouvrir et enregistrer sous dans le projet, importer une planche, exporter les tuiles séparées et la carte pour Tiled dans le projet, rétablir.

## La suite

Le plan (validé avec Ragna le 20/10/2026) :

1. ~~**Tafl 0.7, les événements**~~ : fait (voir plus haut).
2. ~~**Tafl 0.8, les bases de données**~~ : fait (voir plus haut).
3. ~~**Le moteur**, un outil à part, qui lit le dossier de jeu, avec un bouton **Jouer** dans Tafl~~ : commencé, c'est **Saga** (voir plus haut).

Et toujours : tuiles automatiques (bords de chemin et de mare posés tout seuls), lien direct avec Skald. Plus tard peut-être : des liens libres entre les blocs d'un script (des « aller à »), qui demanderaient aussi un changement dans Saga.

## Comment c'est construit

Même organisation que Skald : Electron, sans framework ni bundler, tout le dessin dans des `<canvas>`.

| Fichier | Rôle |
|---|---|
| `main.js` | Processus principal : fenêtre, fichiers (Tafl n'écrit que là où tu as choisi d'enregistrer, et dans un dossier de jeu seulement ses fichiers à lui), réglages, journal `tafl.log`, mise à jour. |
| `preload.js` | Le pont : les seules fonctions accessibles à l'interface, sous `window.tafl`. |
| `renderer/doc.js` | Le jeu en mémoire (tuiles, cartes, calques, passage, zones, téléporteurs, départ) et l'historique d'annulation (copie à l'écriture : annuler remet simplement les anciens tableaux). |
| `renderer/stage.js` | La zone de dessin, ses deux modes et les outils, écrits une seule fois pour une « grille de cases » (pixels d'une tuile, cases d'un calque ou passage), plus les outils Zone, Téléporteur, Événement et Départ. |
| `renderer/panels.js` | Palette, tuiles, aperçu, cartes, calques, événements. |
| `renderer/events.js` | Les événements et leurs scripts (commandes, conditions, vérification), l'éditeur d'un événement et la fenêtre Données du jeu (personnages, quêtes, interrupteurs). |
| `renderer/presse-papiers.js` | Tafl 0.28 : copier, couper, vider et coller un morceau de carte (calques, passage, zones, événements, téléporteurs). |
| `renderer/blocs.js` | Tafl 0.28 : le script d'un événement en blocs reliés (palette, glisser-déposer) et l'aperçu des dialogues comme dans Saga. |
| `renderer/polices/` | La police pixel de Saga (Jersey 10, licence SIL OFL) pour l'aperçu des dialogues au thème Pixel. |
| `renderer/sprites.js` | Les sprites des personnages (Tafl 0.12) : lire et assembler les planches, l'éditeur pixel par pixel de la fiche du personnage, et le dessin sur la carte. |
| `renderer/io.js` | Le format `.tafl`, le dossier de jeu (jeu.json, cartes/*.json, donnees/*.json), la fenêtre d'import de planches et les exports (PNG, Tiled). |
| `comfy.js` | Tafl 0.22 : trouver ComfyUI, démarrer son moteur caché (sans fenêtre), lui envoyer une recette, télécharger des modèles, l'arrêter avec Tafl. |
| `renderer/comfy.js` | Les fenêtres Générer et Installation de ComfyUI, les styles, la traduction des mots courants et la recette (le graphe) envoyée au moteur. |
| `renderer/post-traitement.js` | Rendre une image de ComfyUI utilisable : détourage, réduction (moyenne ou couleur dominante), raccord sans couture, palette, nettoyage. |
| `renderer/planche.js` | Le découpage d'une planche : détection du fond peint et transparence, marge, espacement, zone, recherche des objets (tampons), et l'aperçu de la fenêtre d'import. |
| `FORMAT.md` | La description des fichiers d'un dossier de jeu, pour le futur moteur (copiée dans chaque dossier de jeu). |
| `renderer/palettes.js` | Les palettes proposées : une ligne par palette, facile à compléter. |
| `renderer/samples.js` | Les tuiles d'exemple, dessinées en texte (une lettre par pixel). |
| `renderer/espaces.js` | Tafl 0.30 : les espaces de travail (onglets), l'accueil d'un jeu, l'espace Jeu, et les éditeurs d'événement et de données en pleine page. |
| `renderer/recherche.js` | Tafl 0.30 : chercher partout (Ctrl+K). |
| `renderer/scripts-js.js` | Tafl 0.31 : les scripts JS du jeu : la page d'un script (Monaco, Essayer), les modèles, l'inventaire de ce qu'ils déclarent (calculé dans le bac à sable de `../commun/bac-a-sable.js`). |
| `SCRIPTS.md` | Tafl 0.31 : l'aide des scripts JS (copiée dans chaque dossier de jeu). |
| `renderer/app.js` | L'état, les menus (☰), les raccourcis, les réglages et l'écran de bienvenue. |
| `build/icon.svg` | L'icône (et `icon.png` / `icon.ico` qui en sont tirés). |
| `../.github/workflows/tafl.yml` | La fabrication et la publication de l'installeur. |
