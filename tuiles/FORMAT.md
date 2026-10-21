# Format d'un dossier de jeu Tafl (version 1)

Ce fichier décrit ce que Tafl enregistre quand tu crées un **jeu** (Fichier › Nouveau jeu, `Ctrl+Maj+J`). Il est écrit pour toi, et pour le **moteur** du jeu (Saga, dans `atelier/moteur` : le bouton « Jouer » de Tafl l’y lance), qui lit ces fichiers sans rien savoir de Tafl.

Tafl copie ce `FORMAT.md` dans le dossier du jeu à chaque enregistrement : il décrit toujours la version de Tafl qui a écrit les fichiers.

L'idée : **Tafl décrit le jeu, le moteur le fait tourner.** Tout est en JSON lisible, que tu peux ouvrir dans Rune et suivre avec Git.

## Le dossier

```
MonJeu/
  jeu.json              le jeu : titre, liste des cartes, départ du joueur
  tuiles.tafl           les tuiles, partagées par toutes les cartes
  cartes/
    bourg-palette.json  une carte par fichier, nommé par l'id de la carte (avec ses événements)
    route-1.json
  donnees/
    personnages.json    les personnages, avec leurs portraits (Tafl 0.7)
    quetes.json         les quêtes et leurs étapes
    interrupteurs.json  les faits de l'histoire que retiennent les scripts
    types.json          les types et leur table d'efficacité (Tafl 0.8)
    talents.json        les talents
    attaques.json       les attaques
    creatures.json      les créatures (le Pokédex), avec leurs sprites
    objets.json         les objets, avec leurs icônes
    dresseurs.json      les dresseurs et leur équipe
    boutiques.json      les boutiques et ce qui débloque leurs articles
    reglages.json       argent, niveau maximum, niveau des dresseurs
  FORMAT.md             ce fichier
```

Chaque fichier a un champ `format` (son type) et un champ `version` (sa version). Si un jour le format change, la version augmente. Le moteur doit refuser poliment une version plus grande que celle qu'il connaît.

## Repères

- Les cases d'une carte se comptent **à partir de 0**, depuis le coin **en haut à gauche** : `x` vers la droite (colonne), `y` vers le bas (rangée).
- Les grilles (cases d'un calque, passage, collisions) sont des listes de `largeur × hauteur` nombres, **rangée par rangée** : la case `(x, y)` est à l'indice `y × largeur + x`.
- La taille d'une case en pixels est `tailleTuiles` (16 pour un jeu façon Pokémon GBA, mais elle est libre). Le joueur avance **d'une case à la fois**.
- Les directions sont `"bas"`, `"haut"`, `"gauche"` ou `"droite"`.

## `jeu.json`

```json
{
  "format": "tafl-jeu",
  "version": 1,
  "titre": "Mon jeu",
  "tailleTuiles": 16,
  "tuiles": "tuiles.tafl",
  "cartes": [
    { "id": "bourg-palette", "nom": "Bourg Palette", "fichier": "cartes/bourg-palette.json" },
    { "id": "maison", "nom": "Maison", "fichier": "cartes/maison.json" }
  ],
  "depart": { "carte": "bourg-palette", "x": 9, "y": 7, "direction": "bas" },
  "donnees": {
    "personnages": "donnees/personnages.json",
    "quetes": "donnees/quetes.json",
    "interrupteurs": "donnees/interrupteurs.json",
    "types": "donnees/types.json",
    "creatures": "donnees/creatures.json",
    "...": "une entrée par fichier de donnees/"
  }
}
```

| Champ | Sens |
|---|---|
| `titre` | Le titre du jeu. |
| `tailleTuiles` | Côté d'une tuile (et d'une case) en pixels. |
| `tuiles` | Le fichier des tuiles, à côté de `jeu.json`. |
| `cartes` | Les cartes, dans l'ordre du panneau Cartes de Tafl. `id` ne change jamais (même si tu renommes la carte) : c'est lui que les téléporteurs utilisent. |
| `depart` | Où le joueur commence une nouvelle partie, ou `null` s'il n'est pas encore placé. |
| `donnees` | Les fichiers des données du jeu, par sorte (voir « Données du jeu »). Absent dans un jeu enregistré par Tafl 0.6 : pas encore de données. |

## `tuiles.tafl`

Le même format que les fichiers `.tafl` de Tafl, sans les cartes :

```json
{
  "format": "tafl",
  "version": 1,
  "name": "Mon jeu",
  "tileSize": 16,
  "columns": 8,
  "palette": ["#38a048", "..."],
  "tiles": [
    { "name": "herbe", "png": "data:image/png;base64,..." },
    { "name": "eau", "png": "data:image/png;base64,...", "frames": ["data:...", "data:..."], "duration": 300, "passage": "bloque" }
  ]
}
```

- Le **numéro** d'une tuile est sa place dans `tiles` (la première vaut 0). Les cartes posent des numéros de tuile.
- `png` : l'image de la tuile (PNG encodé en texte). Une tuile **animée** a aussi `frames` (toutes ses images, dans l'ordre) et `duration` (durée de chaque image, en millisecondes). Toutes les tuiles animées partagent la même horloge, pour que toute l'eau ondule en même temps.
- `passage` (facultatif) : `"libre"` ou `"bloque"`, ce que fait la tuile partout où elle est posée. Absent = `"auto"` (elle ne décide rien). Voir « Passage et collisions ».
- `categorie` (facultatif) : le nom de la catégorie où la tuile est rangée dans Tafl (« Herbe », « Maisons »…). Elle ne sert qu'à s'y retrouver dans l'éditeur : le moteur peut l'ignorer.
- `tampons` (facultatif, Tafl 0.10) : les objets de plusieurs tuiles qu'on pose d'un clic dans Tafl (`{ "nom", "largeur", "hauteur", "dessus", "cases" }`, `cases` = un numéro de tuile par case, rangée par rangée, `-1` = rien ; `dessus` = combien de rangées du haut vont sur le calque au-dessus du joueur). **Le moteur peut l'ignorer** : une fois posés, ce sont des tuiles ordinaires sur les calques de la carte.

Astuce pour le moteur : charger chaque `png` (et chaque image de `frames`) comme une petite texture, ou les recoller dans une planche au chargement.

## Une carte (`cartes/<id>.json`)

```json
{
  "format": "tafl-carte",
  "version": 1,
  "id": "bourg-palette",
  "nom": "Bourg Palette",
  "largeur": 20,
  "hauteur": 15,
  "tailleTuiles": 16,
  "calques": [
    { "nom": "Sol", "visible": true, "profondeur": "dessous", "opacite": 1, "fusion": "normal", "parallaxe": { "x": 1, "y": 1 }, "cases": [0, 0, 2, -1, "..."] },
    { "nom": "Décor", "visible": true, "profondeur": "joueur", "opacite": 1, "fusion": "normal", "parallaxe": { "x": 1, "y": 1 }, "cases": ["..."] },
    { "nom": "Au-dessus", "visible": true, "profondeur": "dessus", "opacite": 1, "fusion": "normal", "parallaxe": { "x": 1, "y": 1 }, "cases": ["..."] }
  ],
  "passage": [0, 0, 2, 0, "..."],
  "collisions": [1, 1, 2, 1, "..."],
  "zones": [
    { "id": "zone-1", "nom": "Herbes hautes", "type": "herbes", "x": 2, "y": 9, "largeur": 5, "hauteur": 4, "objetRequis": null,
      "taux": 10, "rencontres": [{ "creature": "roucool", "niveau_min": 2, "niveau_max": 4, "chance": 60 }, { "creature": "rattata", "niveau_min": 2, "niveau_max": 3, "chance": 40 }] },
    { "id": "zone-2", "nom": "Mare", "type": "eau", "x": 13, "y": 9, "largeur": 5, "hauteur": 4, "objetRequis": "planche-de-surf", "taux": 10, "rencontres": [] }
  ],
  "ambiance": { "meteo": "pluie", "intensite": 60, "teinte": "#4a5a7a", "force": 35 },
  "teleporteurs": [
    { "id": "tp-1", "x": 4, "y": 3, "vers": { "carte": "maison", "x": 5, "y": 6, "direction": "haut" } }
  ],
  "evenements": [
    { "id": "ev-1", "nom": "Maman", "type": "pnj", "x": 6, "y": 4, "...": "voir « Événements »" }
  ],
  "groupe": "Bourg Palette",
  "interieur": false,
  "monde": { "x": 0, "y": 30 }
}
```

### Calques

Autant de calques que tu veux, **du dessous vers le dessus** (le premier de la liste est dessiné en premier). Dans le panneau Calques de Tafl, la liste est montrée à l'envers, comme dans Photoshop : le calque du haut de la liste est celui du dessus.

| Champ | Sens |
|---|---|
| `cases` | Un numéro de tuile par case, `-1` = case vide. |
| `visible` | `false` : calque masqué dans Tafl. Le moteur peut l'ignorer (calque de travail). |
| `profondeur` | `"dessous"` : sous le joueur (sol, chemins, eau). `"joueur"` : à la hauteur du joueur (arbres, rochers, maisons : ce dans quoi il se cogne), dessiné sous lui. `"dessus"` : devant le joueur (toits, cimes des arbres, ponts vus d'en dessous). Ordre de dessin conseillé : les calques `dessous` et `joueur` dans l'ordre de la liste, puis les personnages, puis les calques `dessus`. |
| `opacite` | De 0 (invisible) à 1 (opaque). |
| `fusion` | Mode de fusion, les noms de `globalCompositeOperation` du canvas (et des `blendMode` de Phaser ou PixiJS) : `"normal"`, `"multiply"` (ombres), `"screen"` (lumières douces), `"overlay"`, `"soft-light"`, `"lighter"` (addition : lueurs), `"color"` (teinte). |
| `parallaxe` | Vitesse de défilement par rapport à la caméra : `1` = suit la carte, `0.5` = deux fois plus lent (fond lointain), `0` = immobile à l'écran (brume, filtre de couleur), plus de 1 = premier plan qui défile plus vite. Tafl la garde ; c'est le moteur qui l'applique. |

### Passage et collisions

Deux grilles, une valeur par case :

| Code | Sens |
|---|---|
| 0 | Auto : la case suit ses tuiles (seulement dans `passage`) |
| 1 | Libre |
| 2 | Bloqué |
| 3 | Rebord vers le bas : on le saute en allant vers le bas, on ne peut pas remonter |
| 4 | Rebord vers le haut |
| 5 | Rebord vers la gauche |
| 6 | Rebord vers la droite |

- `passage` : ce que tu as **peint à la main** dans Tafl (ligne Passage du panneau Calques). `0` partout = rien de peint.
- `collisions` : le **passage final** de chaque case, recalculé par Tafl à chaque enregistrement. **C'est celui que le moteur lit.** Il ne contient jamais `0`.

Comment Tafl calcule `collisions` pour une case :

1. si `passage` vaut autre chose que 0, c'est lui ;
2. sinon, on regarde les tuiles de la case, du calque le plus haut au plus bas, **en sautant les calques `dessus`** (un toit ne bloque pas) : la première tuile dont le `passage` est `"libre"` ou `"bloque"` décide ;
3. sinon, la case est libre.

Le bord de la carte bloque toujours (sauf téléporteur).

### Zones

Des rectangles de cases (`x`, `y`, `largeur`, `hauteur`), qui peuvent se chevaucher.

| `type` | Sens |
|---|---|
| `"herbes"` | Herbes hautes : des créatures sauvages peuvent surgir quand le joueur y marche. |
| `"eau"` | On y navigue (surf). |
| `"grotte"` | Rencontres dans une grotte (même hors des herbes). |
| `"autre"` | À toi de dire ce qu'elle fait. |

`objetRequis` : l'identifiant d'un objet qu'il faut posséder pour entrer dans la zone (par exemple `"planche-de-surf"` pour l'eau), ou `null`. C'est ce qui remplace les CS : pas de capacité à apprendre, un objet suffit. Avec un objet requis, le moteur laisse entrer dans la zone même si ses cases sont bloquées (l'eau est bloquée à pied).

`rencontres` (Tafl 0.8) : les créatures sauvages qu'on y croise. Pour chacune, son `id` dans `creatures.json`, ses niveaux (`niveau_min` à `niveau_max`, tirés au hasard) et sa `chance` en %. Si les chances ne font pas 100, le moteur les ramène à 100 (ce sont des poids). `taux` : la chance, en %, qu'une rencontre arrive à chaque pas dans la zone (10 par défaut).

### Ambiance

`ambiance` (Tafl 0.8) : la météo et la lumière de la carte. Tafl en montre un aperçu (Affichage › Montrer l'ambiance) ; c'est le moteur qui la joue.

| Champ | Sens |
|---|---|
| `meteo` | `"aucune"`, `"pluie"`, `"orage"` (pluie et éclairs), `"neige"`, `"brouillard"`, `"feuilles"` (feuilles qui tombent), `"lucioles"`. |
| `intensite` | De 0 à 100 : combien de gouttes, de flocons… |
| `teinte` | Une couleur `#rrggbb` posée en « produit » (`multiply`) sur toute la carte, comme une couche de lumière : bleu sombre pour la nuit ou l'orage, orangé pour un coucher de soleil. `""` = aucune. |
| `force` | De 0 à 100 : l'opacité de la teinte. |

### Téléporteurs

Une case `(x, y)` qui mène ailleurs : marcher dessus emmène le joueur sur la case `(vers.x, vers.y)` de la carte `vers.carte` (son `id`), tourné vers `vers.direction`. C'est une porte, un escalier, une bouche de grotte, ou le bord d'une route qui continue sur la carte suivante.

Conseil pour une porte : l'arrivée sur le paillasson à l'intérieur, et le téléporteur du retour juste derrière lui (Tafl peut le créer tout seul : case « Créer aussi le téléporteur du retour »). Ainsi, le joueur qui arrive ne repart pas aussitôt.

### Groupe, intérieur et carte monde

Ajoutés par Tafl 0.11. Une carte d'un fichier plus ancien se lit comme `"groupe": ""`, `"interieur": false`, `"monde": null`.

| Champ | Sens |
|---|---|
| `groupe` | Le groupe de la carte dans le panneau Cartes de Tafl (« Ville 1 », « Routes »…), `""` = aucun. Seulement pour ranger : le moteur peut l'ignorer. |
| `interieur` | `true` pour un intérieur (maison, centre, grotte…) : il n'est pas sur la carte monde. `false` pour une ville, une route… |
| `monde` | La place de la carte sur la carte monde : la case `{ "x", "y" }` de son coin en haut à gauche, en cases (une case de la carte = une case du monde). `null` pour un intérieur, ou une carte que Tafl n'a pas encore placée. Deux cartes extérieures dont les bords se touchent sur la carte monde sont voisines : le moteur peut les enchaîner sans écran noir, et dessiner un écran « carte de la région ». |

### Événements

Ce qui vit sur une case : un personnage à qui parler, un panneau, un coffre, un objet au sol, ou une case invisible qui lance une scène. **Un événement par case.** Ce qu'il fait est écrit dans ses **pages**.

```json
{
  "id": "ev-1",
  "nom": "Prof. Chêne",
  "type": "pnj",
  "x": 3, "y": 3,
  "apparence": { "personnage": "prof-chene", "tuile": -1 },
  "direction": "bas",
  "deplacement": "regarde",
  "traversable": false,
  "declenchement": "parler",
  "pages": [
    {
      "conditions": [],
      "cache": false,
      "commandes": [
        { "type": "dire", "qui": "@evenement", "expression": "normal", "texte": "Ah, {joueur} ! Tu tombes bien." },
        { "type": "choix", "options": [
          { "texte": "Je veux un compagnon !", "commandes": [
            { "type": "creature", "creature": "starter-feu", "niveau": 5 },
            { "type": "quete", "quete": "le-premier-compagnon", "action": "etape", "etape": 2 },
            { "type": "local", "valeur": true }
          ] },
          { "texte": "Plus tard.", "commandes": [] }
        ] }
      ]
    },
    {
      "conditions": [{ "type": "local", "valeur": true }],
      "cache": false,
      "commandes": [
        { "type": "dire", "qui": "@evenement", "expression": "content", "texte": "Prends bien soin de lui !" }
      ]
    }
  ]
}
```

| Champ | Sens |
|---|---|
| `id` | Unique **dans la carte** (`ev-1`, `ev-2`…). Avec l'id de la carte, il désigne l'événement dans tout le jeu (pour son interrupteur « déjà fait »). |
| `type` | `"pnj"` (personnage), `"panneau"`, `"coffre"`, `"objet"` (objet au sol), `"declencheur"` (case invisible). Il sert surtout à Tafl ; le moteur suit les autres champs. |
| `apparence` | `personnage` : l'id d'un personnage (`""` = aucun) ; `tuile` : un numéro de tuile à montrer (`-1` = aucune). Le moteur montre la tuile, sinon le sprite du personnage (tourné vers `direction`), sinon sa tuile, sinon rien (un déclencheur est invisible). |
| `direction` | Où il regarde au départ. |
| `deplacement` | `"fixe"`, `"regarde"` (se tourne vers le joueur qui lui parle), `"aleatoire"` (marche au hasard autour de sa case), `"tourne"` (regarde autour de lui). |
| `traversable` | `false` : il bloque sa case comme un mur. `true` : on passe à travers (un déclencheur). |
| `declenchement` | `"parler"` : le joueur, devant lui et tourné vers lui, appuie sur A. `"toucher"` : le joueur marche sur sa case (ou se cogne contre lui s'il n'est pas traversable). `"auto"` : la page se joue toute seule dès que le joueur arrive sur la carte (une scène d'arrivée : pense à une condition pour qu'elle ne se rejoue pas). |
| `pages` | Au moins une. **Le moteur prend la DERNIÈRE page dont toutes les conditions sont vraies** (une page sans condition est toujours vraie). Si aucune ne l'est, l'événement est absent. `cache: true` : sur cette page, l'événement est absent (invisible, on ne peut ni lui parler ni le toucher, il ne bloque pas). Le moteur refait ce choix après chaque script et à chaque changement de carte. |

Le moteur joue les `commandes` de la page dans l'ordre. Pendant un script, le joueur ne bouge pas.

#### Commandes

| `type` | Champs | Ce que fait le moteur |
|---|---|---|
| `dire` | `qui`, `expression`, `texte` | Une boîte de dialogue. `qui` : l'id d'un personnage (son nom s'affiche, dans sa `couleur`, avec son portrait pour `expression`) ; `"@evenement"` : le personnage de l'événement ; `""` : texte seul (panneau, narration). Dans `texte`, `{joueur}` est remplacé par le nom du joueur ; une ligne vide coupe le texte en plusieurs boîtes. Sans portrait pour cette expression, prendre `normal`, sinon le premier. |
| `choix` | `options: [{ texte, commandes }]` | 2 à 4 réponses ; le joueur en choisit une, le moteur joue ses `commandes`, puis continue après le choix. |
| `si` | `condition`, `alors`, `sinon` | Une condition (mêmes formes que celles des pages) : joue `alors` si elle est vraie, sinon `sinon`. |
| `commentaire` | `texte` | Rien : une note pour l'auteur. |
| `fin` | | Arrête le script ici. |
| `interrupteur` | `id`, `valeur` | Allume (`true`) ou éteint (`false`) un interrupteur du jeu. |
| `local` | `valeur` | L'interrupteur « déjà fait » **de cet événement** (coffre ouvert, objet ramassé, dresseur battu). |
| `attendre` | `ms` | Une pause. |
| `objet` | `action` (`"donner"` ou `"retirer"`), `objet`, `nombre` | Ajoute ou retire des objets du sac (`objet` : un id de `objets.json`). |
| `creature` | `creature`, `niveau` | Donne une créature au joueur (le starter, un cadeau). |
| `combat_sauvage` | `creature`, `niveau` | Un combat contre une créature précise, qu'on peut capturer (un légendaire au bout d'une quête). |
| `combat_dresseur` | `dresseur` | Un combat contre un dresseur de `dresseurs.json`. |
| `teleporter` | `carte`, `x`, `y`, `direction` | Emmène le joueur ailleurs. |
| `quete` | `quete`, `action` (`"commencer"`, `"etape"`, `"finir"`), `etape` | Fait avancer une quête. `etape` : le numéro de l'étape (à partir de 1), pour `"etape"`. Commencer met la quête à l'étape 1. |
| `soigner` | | Soigne toute l'équipe (le centre de soins). |
| `boutique` | `boutique` | Ouvre une boutique de `boutiques.json`. |
| `ecran_ev` | | Ouvre l'écran où le joueur répartit les points d'effort (EV) de ses créatures. |

Un type inconnu (écrit par une version plus récente de Tafl) doit être ignoré par le moteur, sans planter.

#### Conditions

| `type` | Champs | Vraie quand |
|---|---|---|
| `interrupteur` | `id`, `valeur` | l'interrupteur vaut `valeur`. Au début d'une partie, tous les interrupteurs sont éteints. |
| `local` | `valeur` | l'interrupteur « déjà fait » de l'événement vaut `valeur`. |
| `objet` | `objet`, `min` | le joueur a au moins `min` fois cet objet. |
| `quete` | `quete`, `etat`, `etape` | la quête est `"pas_commencee"`, `"en_cours"` ou `"finie"`. Pour `"en_cours"`, `etape` > 0 demande en plus d'être au moins à cette étape. |
| `compteur` | `compteur`, `min` | un compteur du joueur vaut au moins `min` : `"captures"` (créatures capturées), `"dresseurs_battus"`, `"evolutions"` (évolutions vues), `"badges"`, `"pas"`. Pour débloquer des boutiques ou des personnages au fil de la progression. |

#### Ce que le moteur garde dans une sauvegarde

Les interrupteurs du jeu (allumés), les interrupteurs « déjà fait » (par carte et id d'événement), l'état et l'étape de chaque quête, les compteurs, le sac, l'équipe, la carte et la case du joueur.

## Données du jeu (`donnees/`)

Un fichier par sorte, chacun avec son `format` et sa `version`. Tous les `id` sont en minuscules, sans accents ni espaces (`prof-chene`), et ne changent jamais : les scripts s'en servent.

### `donnees/personnages.json`

```json
{
  "format": "tafl-personnages",
  "version": 1,
  "personnages": [
    {
      "id": "prof-chene",
      "nom": "Prof. Chêne",
      "description": "Le professeur du bourg, bavard et distrait.",
      "heros": false,
      "couleur": "#5ec8ff",
      "tuile": -1,
      "portraits": [
        { "expression": "normal", "png": "data:image/png;base64,..." },
        { "expression": "content", "png": "data:image/png;base64,..." }
      ],
      "sprite": { "largeur": 16, "hauteur": 32, "images": 3, "planche": "data:image/png;base64,..." }
    }
  ]
}
```

- `heros` : le personnage que joue le joueur (un seul). Il parle dans les dialogues comme les autres ; `{joueur}` reste le nom choisi par le joueur.
- `couleur` : la couleur de son nom dans les boîtes de dialogue (`""` = celle par défaut).
- `tuile` : la tuile qui le montre sur la carte quand il n'a pas de sprite (`-1` = aucune). Une seule image, quelle que soit sa direction.
- `sprite` (Tafl 0.12, facultatif, `null` = aucun) : le personnage sur la carte, dans les 4 directions, avec sa marche. `planche` est une image PNG encodée en texte, découpée en **4 rangées** (de haut en bas : `bas` = de face, `gauche`, `droite`, `haut` = de dos) de **`images` images** chacune, toutes de `largeur` × `hauteur` pixels (la planche fait donc `largeur × images` sur `hauteur × 4`).
  - Dans chaque rangée, l'image **0** est le personnage **debout** ; les suivantes sont les **pas**. Avec 3 images (le cas courant) : debout, pied gauche, pied droit.
  - **Marche** : pendant un pas d'une case, le moteur montre l'image de pas suivante (1, 2, …, `images - 1`, puis il recommence à 1) pendant la première moitié du pas, puis l'image 0. Avec une seule image, le personnage ne s'anime pas.
  - **Placement** : l'image est centrée sur la case, ses pieds (le bas de l'image) en bas de la case. Un sprite plus haut qu'une case (16 × 32, comme dans Pokémon) dépasse vers le haut, sur la case du dessus.
  - Le moteur montre le sprite s'il y en a un, sinon la `tuile`, sinon ce qu'il veut (Saga dessine un petit bonhomme à la `couleur` du personnage).
- `portraits` : un visage par expression (`normal`, `content`, `rire`, `triste`, `colere`, `surpris`, `inquiet`, `gene`, `determine`, ou d'autres noms), en image encodée en texte comme les tuiles. Taille libre.

### `donnees/quetes.json`

```json
{
  "format": "tafl-quetes",
  "version": 1,
  "quetes": [
    {
      "id": "le-premier-compagnon",
      "titre": "Le premier compagnon",
      "description": "Le prof confie un compagnon au héros.",
      "secondaire": false,
      "suivante": "legende-du-lac",
      "personnages": ["prof-chene"],
      "etapes": [{ "texte": "Aller au labo" }, { "texte": "Choisir un compagnon" }, { "texte": "Battre le rival" }]
    }
  ]
}
```

- `secondaire` : `false` pour l'histoire principale, `true` pour une quête secondaire.
- `suivante` : l'id de la quête qui suit (le fil rouge), ou `""`. Le moteur peut la montrer comme « nouvelle quête » quand celle-ci finit ; c'est un script qui la commence vraiment.
- `personnages` : les personnages qu'on y croise (pour suivre les personnages récurrents).
- `etapes` : dans l'ordre ; l'étape n° 1 est la première. Le journal des quêtes du jeu montre le texte de l'étape en cours.

### `donnees/interrupteurs.json`

```json
{
  "format": "tafl-interrupteurs",
  "version": 1,
  "interrupteurs": [{ "id": "rival-battu-au-labo", "nom": "Rival battu au labo", "description": "" }]
}
```

La liste sert à Tafl (des noms lisibles) ; le moteur accepte aussi un interrupteur qui n'y est pas (il est éteint au départ).

### Les bases de données de Tafl 0.8

Elles peuvent venir de l'**import des données officielles** (Jeu › Données du jeu › Importer les données officielles, depuis [PokeAPI](https://pokeapi.co), en français), être créées à la main, ou les deux. Un élément importé a un champ `officiel` : son nom anglais dans PokeAPI (`"charmander"`). C'est lui qui retrouve l'élément quand on réimporte, même si tu l'as renommé ; les éléments sans `officiel` sont les tiens, et l'import n'y touche jamais. Le moteur peut ignorer ce champ.

Les noms, les images et les créatures officiels appartiennent à Nintendo, Game Freak et The Pokémon Company : ils conviennent à un jeu perso, pas à un jeu partagé ou vendu.

Les statistiques s'appellent partout `pv`, `attaque`, `defense`, `att_spe`, `def_spe`, `vitesse` (et `precision`, `esquive` pour les changements en combat).

#### `donnees/types.json`

```json
{ "format": "tafl-types", "version": 1, "types": [
  { "id": "feu", "nom": "Feu", "couleur": "#ee8130", "efficace": ["plante", "glace", "insecte", "acier"], "peu_efficace": ["feu", "eau", "roche", "dragon"], "sans_effet": [], "officiel": "fire" }
] }
```

Ce que fait une attaque de ce type contre un défenseur : ×2 s'il est dans `efficace`, ×0,5 dans `peu_efficace`, ×0 dans `sans_effet`, ×1 sinon. Contre un défenseur à deux types, on multiplie les deux.

#### `donnees/talents.json`

`{ "id": "brasier", "nom": "Brasier", "description": "…", "officiel": "blaze" }`. Le moteur décide de leurs effets d'après leur `officiel` ou leur `id`.

#### `donnees/attaques.json`

```json
{ "format": "tafl-attaques", "version": 1, "attaques": [
  { "id": "flammeche", "nom": "Flammèche", "type": "feu", "categorie": "speciale", "puissance": 40, "precision": 100, "pp": 25, "priorite": 0,
    "cible": "adversaire", "statut": "brulure", "chance_statut": 10, "peur": 0, "stats": [], "stats_cible": "adversaire", "chance_stats": 0,
    "drain": 0, "soin": 0, "critique": 0, "coups_min": 1, "coups_max": 1, "effet": "A une chance de brûler la cible.", "description": "…", "officiel": "ember" }
] }
```

| Champ | Sens |
|---|---|
| `categorie` | `"physique"` (Attaque contre Défense), `"speciale"` (Att. Spé. contre Déf. Spé.) ou `"statut"` (pas de dégâts). |
| `puissance` | 0 = pas de dégâts directs. |
| `precision` | En %, `0` = touche toujours. |
| `priorite` | Plus elle est haute, plus l'attaque passe tôt dans le tour (+1 Vive-Attaque). |
| `cible` | `"adversaire"`, `"adversaires"`, `"soi"`, `"allie"`, `"equipe"`, `"tous"`, `"terrain"`. |
| `statut`, `chance_statut` | Le statut infligé (`"brulure"`, `"paralysie"`, `"poison"`, `"poison_grave"`, `"sommeil"`, `"gel"`, `"confusion"`, `"attraction"`, `"piege"`, `"baillement"`, `"vampigraine"`, ou `""`) et sa chance en % (0 = toujours). |
| `peur` | Chance en % d'apeurer la cible. |
| `stats`, `stats_cible`, `chance_stats` | Les changements de statistiques `[{ "stat": "attaque", "etages": -1 }]` (de −6 à +6), sur qui (`"soi"` ou `"adversaire"`), et leur chance en % (0 = toujours). |
| `drain`, `soin` | En % : PV repris sur les dégâts infligés (négatif = contrecoup), PV du lanceur soignés. |
| `critique` | Paliers de coup critique en plus. |
| `coups_min`, `coups_max` | Nombre de coups (2 à 5 pour Combo-Griffe). |
| `effet` | L'effet en une phrase (pour ce qui n'entre pas dans les champs). |

#### `donnees/creatures.json`

```json
{ "format": "tafl-creatures", "version": 1, "creatures": [
  { "id": "salameche", "nom": "Salamèche", "numero": 4, "espece": "Pokémon Lézard", "types": ["feu"],
    "stats": { "pv": 39, "attaque": 52, "defense": 43, "att_spe": 60, "def_spe": 50, "vitesse": 65 }, "ev_donnes": { "vitesse": 1 },
    "talents": ["brasier"], "talent_cache": "force-soleil", "taux_capture": 45, "xp_base": 62, "croissance": "parabolique", "bonheur": 70,
    "male": 87.5, "legendaire": "", "taille": 0.6, "poids": 8.5,
    "evolutions": [{ "vers": "reptincel", "mode": "niveau", "niveau": 16, "objet": "", "quete": "", "condition": "" }],
    "attaques": [{ "niveau": 1, "attaque": "griffe" }, { "niveau": 4, "attaque": "flammeche" }], "ct": ["lance-flammes", "abri"],
    "description": "Depuis sa naissance, une petite flamme brûle au bout de sa queue…",
    "sprites": { "face": "data:image/png;base64,...", "dos": "data:image/png;base64,..." }, "generation": 1, "officiel": "charmander" }
] }
```

| Champ | Sens |
|---|---|
| `numero` | Le numéro dans le Pokédex du jeu. |
| `types` | Un ou deux types (ids de `types.json`). |
| `stats` | Les statistiques de base (1 à 255). |
| `ev_donnes` | Les EV que gagne le joueur en battant cette créature (seulement les stats non nulles). |
| `talents`, `talent_cache` | Un ou deux talents possibles, et le talent caché (`""` = aucun). |
| `taux_capture` | 1 (très dur) à 255 (facile). |
| `croissance` | La courbe d'expérience : `"rapide"`, `"moyenne"`, `"parabolique"`, `"lente"`, `"erratique"`, `"fluctuante"` (les courbes officielles). |
| `male` | % de mâles ; `-1` = asexué. |
| `legendaire` | `""`, `"legendaire"` ou `"fabuleux"`. Un légendaire s'obtient d'habitude au bout d'une quête (commande `combat_sauvage`). |
| `evolutions` | `mode` : `"niveau"` (au `niveau`), `"objet"` (avec l'`objet`, par exemple une pierre), `"echange"` (en tenant `objet` s'il y en a un), `"amitie"`, `"quete"` (quand la quête `quete` est finie), `"autre"` (`condition` dit laquelle). Le moteur peut aussi faire évoluer en plein combat. |
| `attaques` | Apprises au niveau `niveau` (0 = en évoluant). |
| `ct` | Les attaques qu'elle peut apprendre par CT ou par un maître des capacités. |
| `sprites` | Face (vue par le joueur) et dos (sa propre créature en combat), en image encodée en texte. `""` = pas encore d'image. |

#### `donnees/objets.json`

```json
{ "format": "tafl-objets", "version": 1, "objets": [
  { "id": "potion", "nom": "Potion", "categorie": "soin", "prix": 200, "description": "…", "effet": { "type": "soin", "valeur": 20 }, "icone": "data:image/png;base64,...", "officiel": "potion" },
  { "id": "aromate-solo", "nom": "Aromate Solo", "categorie": "menthe", "prix": 20, "effet": { "type": "menthe", "nature": "solo" }, "icone": "" },
  { "id": "planche-de-surf", "nom": "Planche de surf", "categorie": "cle", "prix": 0, "effet": { "type": "passage" }, "icone": "" }
] }
```

`categorie` : `soin`, `balle`, `vitamine`, `menthe`, `ivs`, `baie`, `tenu`, `combat`, `evolution`, `tresor`, `cle`, `autre`.

| `effet.type` | Ce qu'il fait |
|---|---|
| `aucun` | Rien d'automatique (sa description dit ce qu'il fait). |
| `soin` | Soigne `valeur` PV (9999 = tous) ; `statut` en plus s'il soigne aussi un statut. |
| `soin_statut` | Soigne le `statut` (`"tous"` = tous). |
| `rappel` | Ranime une créature K.O. avec `valeur` % de ses PV. |
| `pp`, `pp_toutes`, `pp_max` | Rend `valeur` PP à une attaque, à toutes (99 = tous), ou augmente les PP max de `valeur` paliers. |
| `ev` | Donne `valeur` EV en `stat`. |
| `niveau` | Fait monter de `valeur` niveaux (Super Bonbon). |
| `ivs` | Met les IV de `stat` (`"choix"` : au choix du joueur, `"tous"` : toutes) à `valeur` (31 = parfait) : la capsule. |
| `menthe` | L'effet de la nature sur les statistiques devient celui de `nature` (la nature elle-même ne change pas). |
| `balle` | Capture, avec `valeur` × la chance de base (255 = toujours, Master Ball). |
| `evolution` | Fait évoluer les créatures dont une évolution a `mode: "objet"` et cet `objet`. |
| `repousse` | Pas de rencontres pendant `valeur` pas. |
| `passage` | Ouvre un passage : un objet requis de zone, à la place des CS. |

Les 25 natures sont celles du jeu officiel (`hardi`, `solo`, `brave`, `rigide`, `mauvais`, `assure`, `docile`, `relax`, `malin`, `lache`, `timide`, `presse`, `serieux`, `jovial`, `naif`, `modeste`, `doux`, `discret`, `pudique`, `foufou`, `calme`, `gentil`, `malpoli`, `prudent`, `bizarre`) : +10 % sur une statistique, −10 % sur une autre (les cinq neutres ne changent rien).

#### `donnees/dresseurs.json`

```json
{ "format": "tafl-dresseurs", "version": 1, "dresseurs": [
  { "id": "mia", "nom": "Mia", "classe": "Rivale", "personnage": "mia", "argent": 300, "ajuste": true,
    "equipe": [{ "creature": "carapuce", "niveau": 6, "nature": "", "objet": "", "attaques": [] }],
    "dialogue_avant": "On se bat ?", "dialogue_victoire": "Bien joué…", "dialogue_defaite": "Reviens quand tu seras prêt !" }
] }
```

- `personnage` : son id dans `personnages.json` (portrait, couleur), ou `""`.
- `equipe` : 6 créatures au plus ; `nature` `""` = au hasard ; `attaques` vide = les dernières apprises à son niveau.
- `ajuste` : son niveau suit la progression du joueur (voir `reglages.json`).
- `argent` : ce que gagne le joueur. Chaque victoire compte dans le compteur `dresseurs_battus`.

#### `donnees/boutiques.json`

```json
{ "format": "tafl-boutiques", "version": 1, "boutiques": [
  { "id": "boutique-du-bourg", "nom": "Boutique du bourg", "description": "", "rachete": true, "achete_creatures": false,
    "articles": [
      { "sorte": "objet", "id": "potion", "prix": 0, "condition": null },
      { "sorte": "objet", "id": "super-ball", "prix": 0, "condition": { "type": "compteur", "compteur": "captures", "min": 10 } },
      { "sorte": "creature", "id": "evoli", "niveau": 10, "prix": 5000, "condition": { "type": "quete", "quete": "la-pension", "etat": "finie", "etape": 0 } }
    ] }
] }
```

- `prix` : `0` = le prix de l'objet dans `objets.json`.
- `condition` : `null` = toujours en vente, sinon une condition des événements (voir « Conditions ») : un compteur (captures, dresseurs battus, évolutions, badges), une quête, un interrupteur, un objet. L'article apparaît quand elle est vraie.
- `rachete` : le joueur peut y revendre ses objets (à moitié prix). `achete_creatures` : il peut y vendre ses créatures.

#### `donnees/reglages.json`

```json
{ "format": "tafl-reglages", "version": 1, "reglages": {
  "monnaie": "Pokédollars", "argent_depart": 3000, "equipe_max": 6,
  "plafonds": [{ "badges": 0, "niveau": 15 }, { "badges": 1, "niveau": 20 }, { "badges": 8, "niveau": 100 }],
  "ajustement": "badges", "ecart": 0, "chance_chromatique": 4096
} }
```

- `plafonds` : le niveau maximum des créatures du joueur selon ses badges.
- `ajustement` : comment les dresseurs `ajuste: true` règlent leur niveau : `"aucun"`, `"equipe"` (le meilleur niveau de l'équipe du joueur), `"badges"` (le plafond des badges du joueur). Leur niveau devient cette référence plus `ecart`, sans descendre sous celui écrit dans leur équipe.
- `chance_chromatique` : une rencontre sur combien est chromatique (0 = jamais).

## Exemple de lecture (JavaScript)

```js
const jeu = await (await fetch('MonJeu/jeu.json')).json();
const carte = await (await fetch(`MonJeu/${jeu.cartes.find((c) => c.id === jeu.depart.carte).fichier}`)).json();
const bloque = (x, y) => x < 0 || y < 0 || x >= carte.largeur || y >= carte.hauteur || carte.collisions[y * carte.largeur + x] === 2;
const teleporteur = (x, y) => carte.teleporteurs.find((t) => t.x === x && t.y === y);

// La page active d'un événement : la dernière dont toutes les conditions sont vraies.
const pageActive = (ev, vraie) => [...ev.pages].reverse().find((p) => p.conditions.every(vraie)) || null;
```

## Historique du format

- **Version 1** (Tafl 0.6) : dossier de jeu, plusieurs cartes, calques avec profondeur, opacité, fusion et parallaxe, passage et collisions, zones, téléporteurs, départ du joueur.
- **Version 1, ajouts de Tafl 0.7** : `evenements` dans les cartes (pages, conditions, commandes), `donnees` dans `jeu.json`, et le dossier `donnees/` (personnages avec portraits, quêtes, interrupteurs). Ce sont des champs en plus : un fichier de Tafl 0.6 se lit pareil (sans événements ni données), donc la version reste 1.
- **Version 1, ajouts de Tafl 0.8** : les bases de données (`types`, `talents`, `attaques`, `creatures`, `objets`, `dresseurs`, `boutiques`, `reglages` dans `donnees/`), `rencontres` et `taux` dans les zones, `ambiance` dans les cartes. Des champs en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.11** : `groupe`, `interieur` et `monde` dans les cartes. Des champs en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.12** : `sprite` dans les personnages (planche de 4 directions avec la marche). Un champ en plus, donc la version reste 1.
