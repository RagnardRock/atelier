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

Et toujours : tuiles automatiques (bords de chemin et de mare posés tout seuls), sélection et copier-coller sur la carte, lien direct avec Skald.

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
| `renderer/sprites.js` | Les sprites des personnages (Tafl 0.12) : lire et assembler les planches, l'éditeur pixel par pixel de la fiche du personnage, et le dessin sur la carte. |
| `renderer/io.js` | Le format `.tafl`, le dossier de jeu (jeu.json, cartes/*.json, donnees/*.json), la fenêtre d'import de planches et les exports (PNG, Tiled). |
| `renderer/planche.js` | Le découpage d'une planche : détection du fond peint et transparence, marge, espacement, zone, recherche des objets (tampons), et l'aperçu de la fenêtre d'import. |
| `FORMAT.md` | La description des fichiers d'un dossier de jeu, pour le futur moteur (copiée dans chaque dossier de jeu). |
| `renderer/palettes.js` | Les palettes proposées : une ligne par palette, facile à compléter. |
| `renderer/samples.js` | Les tuiles d'exemple, dessinées en texte (une lettre par pixel). |
| `renderer/app.js` | L'état, les menus, les raccourcis, les réglages et l'accueil. |
| `build/icon.svg` | L'icône (et `icon.png` / `icon.ico` qui en sont tirés). |
| `../.github/workflows/tafl.yml` | La fabrication et la publication de l'installeur. |
