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
    variables.json      les nombres et textes que retient le jeu (Tafl 0.31)
    types.json          les types et leur table d'efficacité (Tafl 0.8)
    talents.json        les talents
    attaques.json       les attaques
    creatures.json      les créatures (le Pokédex), avec leurs sprites
    objets.json         les objets, avec leurs icônes
    dresseurs.json      les dresseurs et leur équipe
    boutiques.json      les boutiques et ce qui débloque leurs articles
    reglages.json       argent, niveau maximum, niveau des dresseurs
    classes.json, monstres.json, groupes.json      le pack JRPG (Tafl 0.25)
    caracteristiques.json, competences.json, etats.json, origines.json,
    classes_jdr.json, sorts.json, monstres_jdr.json  le pack JDR (Tafl 0.32)
  sons/                 musiques, bruitages et fonds sonores (MP3, OGG, WAV…), Tafl 0.29
  scripts/              les scripts JS du jeu, un fichier par script (Tafl 0.31, voir SCRIPTS.md)
    cadeau.js
  FORMAT.md             ce fichier
  SCRIPTS.md            l'aide des scripts JS (Tafl 0.31)
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
  },
  "scripts": [{ "fichier": "scripts/cadeau.js", "actif": true }]
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
| `tests` | (Tafl 0.27) Les états de départ enregistrés du **test rapide** de Tafl (voir « Test rapide » plus bas). Le moteur n'en a pas besoin pour jouer. |
| `scripts` | (Tafl 0.31) Les scripts JS du jeu, dans l'ordre où le moteur les charge : `fichier` (`scripts/<nom>.js` : minuscules, chiffres et tirets) et `actif` (`false` : le moteur ne le charge pas). Ce qu'un script peut faire est dans SCRIPTS.md. Absent : pas de script. |

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
- `lumiere` (facultatif, Tafl 0.29) : la tuile éclaire (un lampadaire, une fenêtre allumée, un feu), partout où elle est posée. Voir « Lumières » plus bas.
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

Pack JRPG (Tafl 0.25, `reglages.regles` = `"jrpg"`) : `rencontres` liste des **groupes de monstres** au lieu de créatures, `[{ "groupe": "slimes", "chance": 60 }]` (`groupe` : un id de `groupes.json` ; les chances sont des poids, comme ci-dessus).

### Ambiance

`ambiance` (Tafl 0.8) : la météo et la lumière de la carte. Tafl en montre un aperçu (Affichage › Montrer l'ambiance) ; c'est le moteur qui la joue.

| Champ | Sens |
|---|---|
| `meteo` | `"aucune"`, `"pluie"`, `"orage"` (pluie et éclairs), `"neige"`, `"brouillard"`, `"feuilles"` (feuilles qui tombent), `"lucioles"`. |
| `intensite` | De 0 à 100 : combien de gouttes, de flocons… |
| `teinte` | Une couleur `#rrggbb` posée en « produit » (`multiply`) sur toute la carte, comme une couche de lumière : bleu sombre pour la nuit ou l'orage, orangé pour un coucher de soleil. `""` = aucune. |
| `force` | De 0 à 100 : l'opacité de la teinte. |
| `musique` | (Tafl 0.29) La musique de la carte : un fichier du dossier `sons/` (`"sons/bourg.ogg"`), `"aucune"` (le silence), ou `""` : la musique d'avant continue (celle de la ville quand on entre dans une maison). Le moteur passe d'une musique à l'autre en fondu enchaîné, et ne recommence pas un morceau qui joue déjà. |
| `fond_sonore` | (Tafl 0.29) Un son en boucle sous la musique (vent, ruisseau, foule) : un fichier de `sons/`, `"aucun"`, ou `""` : selon la météo (le moteur fait lui-même la pluie de `"pluie"` et `"orage"`, avec le tonnerre après chaque éclair). |
| `volume_fond` | (Tafl 0.29) De 0 à 100 : le volume du fond sonore. |
| `jour_nuit` | (Tafl 0.29) `true` (par défaut) : la carte suit le jour et la nuit de l'horloge du jeu (voir `reglages.temps`). `false` : elle garde toujours sa lumière. Un intérieur (`interieur: true`) ne suit jamais le jour et la nuit. |

#### Musique et sons

(Tafl 0.29, joués par Saga 0.11.) Les sons sont des fichiers du dossier `sons/` du jeu, à côté de `jeu.json` : MP3, OGG, WAV, M4A, OPUS, FLAC. Tafl les y copie (bouton + à côté d'une liste de sons) ; les champs qui en parlent donnent leur chemin, `"sons/<nom du fichier>"`, sans sous-dossier. Les sons choisis : la `musique` et le `fond_sonore` de chaque carte, la musique des combats et les bruitages (`reglages.audio`), et les commandes `musique` et `son`. Un son introuvable est sauté (le moteur le signale une fois).

Sans fichier, le moteur a ses propres bruitages, fabriqués à la volée : un « bip » pour le curseur, la validation, le retour, le texte qui s'écrit, une porte, la sauvegarde et le choc contre un mur, et la pluie et le tonnerre de la météo. Le joueur règle le volume de la musique et celui des sons dans les options de Saga.

#### Lumières

(Tafl 0.29, jouées par Saga 0.11.) Une tuile (`lumiere` dans `tuiles.tafl`) ou un événement (`lumiere` dans l'événement) peut éclairer :

```json
"lumiere": { "couleur": "#ffd890", "rayon": 3, "intensite": 80, "scintille": false }
```

| Champ | Sens |
|---|---|
| `couleur` | La couleur de la lumière, `"#rrggbb"`. |
| `rayon` | Jusqu'où elle porte, en cases (0,5 à 16). |
| `intensite` | De 0 à 100 : sa force. |
| `scintille` | `true` : elle vacille un peu (une flamme, une bougie). |

Le moteur pose sur la carte une seule couche de lumière, en « produit » : la teinte de la carte, multipliée par la lumière du ciel (la nuit, l'aube, le couchant : voir `reglages.temps`), puis éclaircie autour de chaque lumière (un halo qui rend ses vraies couleurs à la carte, avec une lueur de sa couleur). Il fait jour : les lumières ne changent rien. Une carte teintée sombre (une grotte) les montre même de jour. La lumière d'un événement suit l'événement (un PNJ avec une lanterne qui se promène) et vaut pour toutes ses pages, tant qu'il est présent.

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
| `type` | `"pnj"` (personnage), `"panneau"`, `"coffre"`, `"objet"` (objet au sol), `"declencheur"` (case invisible), `"obstacle"` (Tafl 0.24 : arbre ou rocher, voir « Obstacles » plus bas). Il sert surtout à Tafl ; le moteur suit les autres champs, sauf pour un obstacle. |
| `apparence` | `personnage` : l'id d'un personnage (`""` = aucun) ; `tuile` : un numéro de tuile à montrer (`-1` = aucune). Le moteur montre la tuile, sinon le sprite du personnage (tourné vers `direction`), sinon sa tuile, sinon rien (un déclencheur est invisible). |
| `direction` | Où il regarde au départ. |
| `deplacement` | `"fixe"`, `"regarde"` (se tourne vers le joueur qui lui parle), `"aleatoire"` (marche au hasard autour de sa case), `"tourne"` (regarde autour de lui). |
| `traversable` | `false` : il bloque sa case comme un mur. `true` : on passe à travers (un déclencheur). |
| `declenchement` | `"parler"` : le joueur, devant lui et tourné vers lui, appuie sur A. `"toucher"` : le joueur marche sur sa case (ou se cogne contre lui s'il n'est pas traversable). `"auto"` : la page se joue toute seule dès que le joueur arrive sur la carte (une scène d'arrivée : pense à une condition pour qu'elle ne se rejoue pas). |
| `pages` | Au moins une. **Le moteur prend la DERNIÈRE page dont toutes les conditions sont vraies** (une page sans condition est toujours vraie). Si aucune ne l'est, l'événement est absent. `cache: true` : sur cette page, l'événement est absent (invisible, on ne peut ni lui parler ni le toucher, il ne bloque pas). Le moteur refait ce choix après chaque script et à chaque changement de carte. |

Le moteur joue les `commandes` de la page dans l'ordre. Pendant un script, le joueur ne bouge pas.

#### Obstacles

(Tafl 0.24, joués par Saga 0.7.) À la place des CS : un objet du sac ouvre le chemin. Un événement de `type: "obstacle"` a en plus :

```json
"obstacle": { "sorte": "couper", "objet": "hache", "message": "", "repousse": false }
```

| Champ | Ce qu'il veut dire |
|---|---|
| `sorte` | `"couper"` (un petit arbre) ou `"briser"` (un rocher fissuré) : avec l'objet, le joueur appuie sur A devant lui, le moteur demande s'il veut l'utiliser, puis l'obstacle disparaît (son interrupteur « déjà fait » s'allume). `"pousser"` : avec l'objet, le joueur pousse le rocher d'une case en marchant contre lui. |
| `objet` | L'id de l'objet qu'il faut avoir (Tafl propose `hache`, `marteau`, `gants-de-force`). Sans lui, le moteur dit lequel il faudrait. `""` = l'obstacle ne s'ouvre jamais (un décor qui parle). |
| `message` | Ce que le moteur dit quand le joueur le regarde (`""` : une phrase par défaut selon la sorte). |
| `repousse` | `true` : l'arbre (ou le rocher) revient quand le joueur quitte la carte puis y revient, comme dans les jeux officiels. Pour `"pousser"` : un rocher poussé revient toujours à sa place quand le joueur quitte la carte. |

Le moteur gère tout seul la question et la disparition : la page 1 (la page active) est le script joué **juste après** le passage (vide d'habitude, ou un objet trouvé sous le rocher). Un rocher poussé ne va pas sur une case bloquée, un rebord, un téléporteur ni sur un autre événement qui bloque ; s'il s'arrête sur un événement `"toucher"` traversable (un déclencheur), celui-ci se lance : un interrupteur au sol pour une énigme. Sans `apparence.tuile` ni personnage, le moteur dessine un petit arbre ou un rocher tout simple.

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
| `musique` | `fichier` | (Tafl 0.29) Change la musique : un fichier de `sons/`, `"aucune"` (le silence), ou `""` (la musique de la carte). Elle reste jusqu'à la carte suivante qui a sa propre musique. |
| `son` | `fichier` | (Tafl 0.29) Joue un bruitage de `sons/` (une porte qui grince, une cloche). Le script continue sans attendre la fin du son. |
| `heure` | `action` (`"avancer"` ou `"regler"`), `heures` | (Tafl 0.29) L'horloge du jeu (`reglages.temps.horloge = "jeu"`) avance de `heures` heures (une nuit à l'auberge), ou se met à `heures` heures (0 à 23). Sans effet avec l'heure réelle ou sans horloge. |
| `quete` | `quete`, `action` (`"commencer"`, `"etape"`, `"finir"`), `etape` | Fait avancer une quête. `etape` : le numéro de l'étape (à partir de 1), pour `"etape"`. Commencer met la quête à l'étape 1. |
| `soigner` | | Soigne toute l'équipe (le centre de soins). |
| `boutique` | `boutique` | Ouvre une boutique de `boutiques.json`. |
| `ecran_ev` | | Ouvre l'écran où le joueur répartit les points d'effort (EV) de ses créatures. |
| `ecran_boites` | | (Tafl 0.21) Ouvre le PC : le joueur range ses créatures dans des boîtes (30 places pour Pokémon, voir `reglages.interface.menus`), en prend dans son équipe, en dépose, en relâche, renomme ses boîtes. Une créature reçue quand l'équipe est pleine part toute seule dans la première place libre. |
| `argent` | `action` (`"donner"` ou `"retirer"`), `montant` | (Tafl 0.16) Ajoute ou retire de l'argent. Retirer ne descend jamais sous 0 : s'il n'a pas assez, le joueur tombe à 0 et le script continue. Pour un péage, teste d'abord avec la condition `argent`. |
| `badge` | `badge` | (Tafl 0.16) Donne au joueur le badge `badge` (un id de `reglages.badges`). Un badge déjà reçu ne compte pas deux fois. Le compteur `badges` vaut toujours le nombre de badges différents reçus : c'est lui qui fait monter les `plafonds` et le niveau des dresseurs qui s'ajustent. |
| `personnaliser` | `nom` (`true`/`false`), `tenue` (`true`/`false`) | (Tafl 0.16) Ouvre l'écran où le joueur tape son nom (`nom`) et/ou choisit la tenue du héros parmi sa tenue de base et ses `tenues` (`tenue`). Le nom devient `{joueur}` dans les dialogues. |
| `tenue` | `tenue` | (Tafl 0.16) Met au héros la tenue `tenue` (un id de ses `tenues`), ou `""` pour sa tenue de base. Pour l'histoire : un uniforme pour s'infiltrer, une combinaison de plongée… |
| `groupe` | `action` (`"rejoindre"` ou `"quitter"`), `personnage`, `niveau` | (Tafl 0.25, pack JRPG) Le personnage rejoint le groupe du joueur (dans la Réserve si le groupe est complet), avec sa `classe`, son `niveau` de départ (ou `niveau` s'il n'est pas 0) et son `equipement` de départ porté ; ou il le quitte. Un héros parti puis revenu retrouve son niveau, son expérience et son équipement. Le dernier héros du groupe ne peut pas partir. Sans effet dans un jeu Pokémon. |
| `combat_groupe` | `groupe` | (Tafl 0.25, pack JRPG) Un combat contre un groupe de `groupes.json` (un boss, une embuscade). Perdu : le script s'arrête, comme pour les autres combats. |
| `variable` | `id`, `action` (`"regler"`, `"ajouter"` ou `"retirer"`), `valeur` | (Tafl 0.31) Change une variable de `variables.json`. `regler` : `valeur` est un nombre ou un texte ; `ajouter` et `retirer` : un nombre (une variable qui contient un texte compte pour 0). |
| `script` | `nom`, `params` | (Tafl 0.31) Joue la commande `nom` déclarée par un script JS actif (`commande('nom', …)`, voir SCRIPTS.md), avec ses réglages `params` (un objet ; un réglage absent prend son défaut). Le script de l'événement attend qu'elle finisse ; elle peut l'arrêter (`saga.fin()`). Une commande que personne ne déclare, ou une erreur dans le script, est signalée et le script de l'événement continue. |
| `test` | `competence`, `dd`, `qui`, `avantage`, `desavantage`, `quoi`, `variable`, `reussi`, `rate` | (Tafl 0.32, pack JDR) Un test d20 + bonus contre le DD (1 à 40). `competence` : l'id d'une compétence de `competences.json`, ou d'une caractéristique (`"dex"` : un test de Dextérité pure). `qui` : `"choix"` (le joueur choisit qui le tente), `"meilleur"` (le meilleur bonus du groupe), `"premier"` (le héros), `"tous"` (chacun lance, réussi si l'un réussit) ou `"groupe"` (test de groupe : réussi si la moitié réussit). `quoi` : le titre montré sur le plateau de dés (« Forcer la grille »). `variable` : une variable de `variables.json` qui reçoit le total. Puis le moteur joue la branche `reussi` ou `rate` (deux listes de commandes). |
| `sauvegarde` | `carac`, `dd`, `qui`, `quoi`, `degats`, `type_degats`, `moitie`, `etat`, `reussi`, `rate` | (Tafl 0.32, pack JDR) Un jet de sauvegarde pour chaque personnage visé : `qui` vaut `"tous"`, `"premier"` ou `"choix"`. `degats` (facultatif, `"2d6"`) : les dégâts d'un piège, la moitié pour ceux qui réussissent si `moitie` ; hors combat, le dernier debout ne descend jamais sous 1 PV. `etat` : l'état mis à ceux qui ratent (`"empoisonne"`). La branche `reussi` se joue si tous ont réussi, sinon `rate`. |
| `test_oppose` | `competence`, `qui`, `nom_adverse`, `monstre`, `competence_adverse`, `contre`, `reussi`, `rate` | (Tafl 0.32, pack JDR) Un test opposé : la `competence` d'un héros contre celle d'un adversaire. Adversaire : un `monstre` de `monstres_jdr.json` (sa compétence `competence_adverse`, ou la même), ou un PNJ décrit par un bonus `contre` (−10 à 30). `nom_adverse` : son nom sur le plateau de dés. Égalité : celui qui tente échoue. |
| `jet` | `formule`, `quoi`, `variable` | (Tafl 0.32, pack JDR) Un jet de dés libre (`"1d20"`, `"2d6+3"`, `"d100"`), montré sur le plateau et noté dans le journal des jets. `variable` reçoit le total. |
| `repos` | `sorte` (`"court"` ou `"long"`) | (Tafl 0.32, pack JDR) Le groupe se repose. Court : chacun peut dépenser des dés de vie, certaines aptitudes reviennent. Long : tous les PV, la moitié des dés de vie, les emplacements de sorts et les aptitudes reviennent. La durée affichée suit `reglages.jdr.repos`. |
| `xp` | `montant`, `jalon` | (Tafl 0.32, pack JDR) Chaque héros gagne `montant` XP ; ceux qui peuvent monter de niveau le font depuis le menu du groupe. `jalon: true` : un jalon de l'histoire, tout le groupe monte d'un niveau tout de suite (pour la progression `"jalons"`). |
| `etat` | `action` (`"ajouter"` ou `"retirer"`), `etat`, `qui` | (Tafl 0.32, pack JDR) Met ou enlève un état de `etats.json` (`"empoisonne"`, `"a_terre"`…) aux personnages visés (`qui` : comme pour `sauvegarde`). |
| `creer_personnage` | | (Tafl 0.32, pack JDR) Ouvre la création de personnage : un nouveau membre rejoint le groupe (ou la Réserve si le groupe est complet). Le joueur peut annuler. |

Un type inconnu (écrit par une version plus récente de Tafl) doit être ignoré par le moteur, sans planter.

#### Conditions

| `type` | Champs | Vraie quand |
|---|---|---|
| `interrupteur` | `id`, `valeur` | l'interrupteur vaut `valeur`. Au début d'une partie, tous les interrupteurs sont éteints. |
| `local` | `valeur` | l'interrupteur « déjà fait » de l'événement vaut `valeur`. |
| `objet` | `objet`, `min` | le joueur a au moins `min` fois cet objet. |
| `quete` | `quete`, `etat`, `etape` | la quête est `"pas_commencee"`, `"en_cours"` ou `"finie"`. Pour `"en_cours"`, `etape` > 0 demande en plus d'être au moins à cette étape. |
| `compteur` | `compteur`, `min` | un compteur du joueur vaut au moins `min` : `"captures"` (créatures capturées), `"dresseurs_battus"`, `"sauvages_battus"` (créatures sauvages battues, Tafl 0.24), `"evolutions"` (évolutions vues), `"especes_vues"` et `"especes_prises"` (les espèces différentes vues et attrapées, comptées sur le Pokédex, Tafl 0.24), `"quetes_finies"` (Tafl 0.24), `"badges"`, `"pas"`, `"monstres_vaincus"` (pack JRPG, Tafl 0.25). Pour débloquer des boutiques ou des personnages au fil de la progression. |
| `argent` | `min` | (Tafl 0.16) le joueur a au moins `min` d'argent. |
| `badge` | `badge` | (Tafl 0.16) le joueur a reçu ce badge. |
| `membre` | `personnage` | (Tafl 0.25, pack JRPG) ce personnage est avec le joueur : dans le groupe ou dans la Réserve. |
| `moment` | `moment` | (Tafl 0.29) c'est ce moment de la journée, selon l'horloge du jeu (`reglages.temps`) : `"matin"` (6 h à 10 h), `"jour"` (6 h à 20 h), `"soir"` (17 h à 20 h) ou `"nuit"` (20 h à 6 h). Sans horloge, il est toujours midi : seul `"jour"` est vrai. Le moteur refait le choix des pages quand le moment change. |
| `variable` | `id`, `comparaison`, `valeur` | (Tafl 0.31) la variable compare à `valeur` : `comparaison` vaut `"=="`, `"!="`, `">"`, `">="`, `"<"` ou `"<="`. Deux nombres se comparent comme des nombres, sinon comme des textes (`"=="` et `"!="` seulement ont du sens). Une variable jamais changée vaut son `defaut`. |
| `jdr_perception` | `min` | (Tafl 0.32, pack JDR) un héros du groupe a une Perception passive (10 + son bonus de Perception) d'au moins `min` : il remarque le piège ou le passage secret sans jet. |
| `jdr_maitrise` | `competence` | (Tafl 0.32, pack JDR) un héros maîtrise cette compétence. |
| `jdr_etat` | `etat`, `valeur` | (Tafl 0.32, pack JDR) `valeur: true` : un héros a cet état ; `false` : personne ne l'a. |
| `jdr_classe` | `classe` | (Tafl 0.32, pack JDR) un héros est de cette classe (`classes_jdr.json`). |
| `jdr_origine` | `origine` | (Tafl 0.32, pack JDR) un héros est de cette origine (`origines.json`). |
| `jdr_niveau` | `min` | (Tafl 0.32, pack JDR) un héros est au moins au niveau `min`. |

#### Ce que le moteur garde dans une sauvegarde

Les interrupteurs du jeu (allumés), les interrupteurs « déjà fait » (par carte et id d'événement), l'état et l'étape de chaque quête, les compteurs, le sac, l'équipe, l'argent, la carte et la case du joueur. Depuis Tafl 0.16 : le nom choisi par le joueur, les badges reçus (leurs ids) et la tenue du héros (`""` = sa tenue de base). Depuis Tafl 0.21 (Saga 0.6) : les boîtes du PC (`boites` : `[{ nom, creatures: [une place par case, null = vide] }]`) et le Pokédex (`dex` : les ids des espèces vues et attrapées). Depuis Tafl 0.24 (Saga 0.7) : l'objet tenu de chaque créature (`objet`), les articles de boutique déjà vus (`boutiques_vues`, pour le « Nouveau ! ») et le compteur `sauvages_battus`. Depuis Tafl 0.25 (Saga 0.8, pack JRPG) : les héros partis du groupe (`partis` : par id de personnage, le héros tel qu'il était), et dans `dex` les monstres vus et vaincus. Depuis Tafl 0.29 (Saga 0.11) : l'heure de l'horloge du jeu (`temps`, en minutes depuis minuit) et la musique en cours (`musique`). Depuis Tafl 0.31 (Saga 0.12) : les variables (`variables` : par id, leur valeur) et la graine du hasard des scripts (`graine`, un entier : recharger une partie rejoue les mêmes dés).

Saga 0.11 garde aussi une **sauvegarde auto** (`reglages.sauvegarde_auto`), à part : elle n'écrase jamais la sauvegarde du joueur.

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
      "sprite": { "largeur": 16, "hauteur": 32, "images": 3, "planche": "data:image/png;base64,..." },
      "tenues": [],
      "classe": "", "niveau": 1, "equipement": {}
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
- `tenues` (Tafl 0.16, pour le héros) : ses autres apparences, `[{ "id": "hiver", "nom": "Hiver", "sprite": { … } }]`, chacune avec un `sprite` au même format que ci-dessus (ou `null`). Le joueur en choisit une (commande `personnaliser`), ou l'histoire la lui met (commande `tenue`) ; le moteur montre alors le sprite de la tenue à la place du sien. Les portraits ne changent pas.
- `classe`, `niveau`, `equipement` (Tafl 0.25, pack JRPG) : ce qu'il est quand il rejoint le groupe. `classe` : un id de `classes.json` (`""` = aucune) ; `niveau` : son niveau de départ (1 par défaut) ; `equipement` : ce qu'il porte au départ, `{ "arme": "epee-courte", "armure": "tunique" }` (places `arme`, `bouclier`, `casque`, `armure`, `accessoire` ; des ids d'objets avec `equipement`). Le héros (`heros: true`) qui a une classe est dans le groupe dès le début d'une partie ; les autres le rejoignent par la commande `groupe`.
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

### `donnees/variables.json`

(Tafl 0.31)

```json
{
  "format": "tafl-variables",
  "version": 1,
  "variables": [{ "id": "victoires", "nom": "Victoires", "description": "Combats gagnés", "defaut": 0 }]
}
```

Une variable retient un nombre ou un texte court (`defaut` : sa valeur au début d'une partie). La commande `variable` la change, la condition `variable` la teste, les scripts JS la lisent (`saga.variable(id)`) et l'écrivent (`saga.variable(id, valeur)`, `saga.ajouter(id, n)`). Le moteur accepte aussi une variable qui n'est pas dans la liste (elle vaut 0 au départ).

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
| `evolutions` | `mode` : `"niveau"` (au `niveau`), `"objet"` (avec l'`objet`, par exemple une pierre), `"echange"` (en tenant `objet` s'il y en a un), `"amitie"` (quand son amitié atteint `seuil_amitie` des réglages), `"quete"` (quand la quête `quete` est finie), `"autre"` (`condition` dit laquelle). Le moteur peut aussi faire évoluer en plein combat. Saga 0.7 joue `"niveau"` (en combat, avec le Super Bonbon), `"objet"` (pierre utilisée depuis le sac) `"amitie"` (à la montée de niveau) et `"quete"` (dès que la quête finit, ou à la montée de niveau suivante) ; le joueur peut arrêter une évolution au niveau ou de quête (touche Retour pendant l'animation), et une créature qui tient un objet `stase` n'évolue pas. |
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
| `passage` | Ouvre un passage : un objet requis de zone ou d'obstacle, à la place des CS. |
| `amitie` | (Tafl 0.24) Fait monter l'amitié de `valeur` points (sur 255). |
| `stase` | (Tafl 0.24) Tenu par une créature, il l'empêche d'évoluer (la Pierre Stase ; l'objet officiel `everstone` importé compte aussi). Dans Saga, le menu Équipe › Faire tenir un objet. |

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
      { "sorte": "objet", "id": "super-ball", "prix": 0, "condition": { "type": "compteur", "compteur": "captures", "min": 10 }, "verrouille_visible": true },
      { "sorte": "creature", "id": "evoli", "niveau": 10, "prix": 5000, "condition": { "type": "quete", "quete": "la-pension", "etat": "finie", "etape": 0 } }
    ] }
] }
```

- `prix` : `0` = le prix de l'objet dans `objets.json`.
- `condition` : `null` = toujours en vente, sinon une condition des événements (voir « Conditions ») : un compteur (captures, dresseurs battus, évolutions, badges, espèces…), une quête, un interrupteur, un objet. L'article apparaît quand elle est vraie. Le moteur marque « Nouveau ! » un article à condition que le joueur n'a pas encore vu en vente.
- `verrouille_visible` (Tafl 0.24) : `true` = avant d'être débloqué, l'article se montre grisé avec ce qui le débloque (« Après 10 captures (4/10) », « Après la quête … », « Avec le Badge Roche » ; un interrupteur se dit « Plus tard dans l'aventure »). `false` ou absent : il reste caché.
- `rachete` : le joueur peut y revendre ses objets (à moitié prix). `achete_creatures` : il peut y vendre ses créatures.

#### `donnees/reglages.json`

```json
{ "format": "tafl-reglages", "version": 1, "reglages": {
  "monnaie": "Pokédollars", "argent_depart": 3000, "equipe_max": 6,
  "plafonds": [{ "badges": 0, "niveau": 15 }, { "badges": 1, "niveau": 20 }, { "badges": 8, "niveau": 100 }],
  "ajustement": "badges", "ecart": 0, "ajustement_sauvages": "aucun", "ecart_sauvages": -2, "evolution_dresseurs": false, "evolution_sauvages": false, "seuil_amitie": 220, "chance_chromatique": 4096,
  "interface": { "theme": "verre", "accent": "#ffb347", "menus": { "equipe": "", "dex": "", "pc": "", "boite": "", "dex_visible": true, "places": 0, "colonnes": 0, "forme_boites": "", "pages": [] } },
  "regles": "pokemon",
  "badges": [{ "id": "badge-roche", "nom": "Badge Roche", "icone": "data:image/png;base64,..." }]
} }
```

Dans Tafl (0.32.1), **Données › Réglages** a quatre onglets (Règles du jeu, Partie, Interface, Ambiance) et ne montre que ce que le pack de règles utilise : `plafonds`, `ajustement*`, `evolution_*`, `seuil_amitie`, `chance_chromatique` et `badges` sont réservés au pack Pokémon (un jeu d'un autre pack qui a déjà des badges les garde, dans l'onglet Partie). Les valeurs cachées sont gardées. `monnaie` vaut par défaut celle du pack (`Pokédollars`, `Or`, `po`) ; un jeu JRPG ou JDR resté sur `Pokédollars` prend celle de son pack.

- `plafonds` : le niveau maximum des créatures du joueur selon ses badges. Au plafond, elles ne gagnent plus d'expérience ; Saga 0.7 le dit quand elles l'atteignent et le montre dans le menu Équipe (« Niv. max 20 »).
- `ajustement` : comment les dresseurs `ajuste: true` règlent leur niveau : `"aucun"`, `"equipe"` (le meilleur niveau de l'équipe du joueur), `"badges"` (le plafond des badges du joueur). Leur niveau devient cette référence plus `ecart`, sans descendre sous celui écrit dans leur équipe.
- `ajustement_sauvages` (Tafl 0.24) : pareil pour les créatures sauvages des zones (`"aucun"` par défaut). Toute la fourchette de la zone monte pour que son haut vaille la référence plus `ecart_sauvages`, sans descendre sous ce qu'écrit la zone (zone 3 à 5, référence 20, écart −2 : niveaux 16 à 18). Les commandes `combat_sauvage` gardent leur niveau.
- `evolution_dresseurs` et `evolution_sauvages` (Tafl 0.24, `false` par défaut) : une créature montée par l'ajustement (dresseur, ou sauvage) prend la forme de son niveau en suivant les évolutions `"niveau"` (un Bulbizarre de dresseur monté au niveau 40 devient Florizarre). Ses attaques sont celles de ce niveau, sauf si le dresseur en a choisi.
- `seuil_amitie` (Tafl 0.24) : l'amitié qu'il faut pour une évolution `"amitie"` (sur 255, 220 par défaut). L'amitié d'une créature part du `bonheur` de son espèce ; elle monte en gagnant des niveaux (+5, +3 au-dessus de 100, +2 au-dessus de 200), en marchant (tous les 128 pas), avec les vitamines et les objets d'effet `amitie` ; elle baisse de 1 quand la créature tombe K.O. L'évolution se fait à la montée de niveau (au `niveau` de l'évolution au moins, s'il est donné).
- `chance_chromatique` : une rencontre sur combien est chromatique (0 = jamais).
- `regles` (Tafl 0.16) : le pack de règles du jeu, c'est-à-dire ce qui décide des combats, des captures et des statistiques. `"pokemon"` (les types, talents, attaques, créatures, objets et dresseurs de `donnees/` sont ses données) ou, depuis Tafl 0.25, `"jrpg"` (voir « Le pack JRPG » plus bas), ou, depuis Tafl 0.32, `"jdr"` (voir « Le pack JDR » plus bas). Saga en décrit chaque fonction dans `moteur/renderer/moteur/regles/REGLES.md`. Le moteur choisit ses règles d'après lui ; s'il ne connaît pas ce pack, il prend `"pokemon"`. Les cartes, événements, quêtes et personnages ne dépendent pas des règles.
- `temps` (Tafl 0.29, lu par Saga 0.11) : l'horloge du jeu, `{ "horloge": "aucune", "duree_jour": 24, "heure_depart": 8 }`. `horloge` : `"aucune"` (il fait toujours jour), `"jeu"` (une horloge à part, gardée dans la partie, qui avance quand le joueur est sur la carte : une journée dure `duree_jour` minutes réelles ; une partie neuve commence à `heure_depart` heures) ou `"reelle"` (l'heure du PC du joueur). Les cartes extérieures s'assombrissent la nuit, se dorent à l'aube et au couchant (voir `ambiance.jour_nuit`), et les lumières brillent. Le carnet du jeu montre l'heure.
- `audio` (Tafl 0.29) : `{ "musique_combat": "", "musique_dresseur": "", "musique_victoire": "", "sons": { "curseur": "", "valider": "", "retour": "", "texte": "", "porte": "", "sauvegarde": "", "choc": "" } }`. `musique_combat` : la musique des combats (`""` = la musique de la carte continue) ; `musique_dresseur` : contre un dresseur (`""` = celle des combats) ; `musique_victoire` : une fanfare jouée une fois après une victoire, puis la musique de la carte revient. `sons` : chaque bruitage du moteur, `""` = le son intégré, `"aucun"` = rien, ou un fichier de `sons/`.
- `sauvegarde_auto` (Tafl 0.29) : `{ "active": false, "carte": true, "minutes": 5 }`. Avec `active`, le moteur sauvegarde tout seul en changeant de carte (`carte`) et/ou toutes les `minutes` minutes (`0` = jamais), dans une place à part ; il attend que le joueur soit libre (pas pendant un dialogue, un combat ou un fondu), et au plus une fois toutes les 20 secondes. À l'ouverture du jeu, il propose la plus récente des deux sauvegardes.
- `scripts` (Tafl 0.31, lu par Saga 0.12) : `{ "formules_coupees": ["degats"] }`. Les formules du pack que les scripts JS ne remplacent **pas**, même si un script déclare `formule('degats', …)` (Réglages › Règles maison dans Tafl). Absent ou vide : toutes les formules déclarées par un script sont utilisées.
- `badges` (Tafl 0.16) : les badges du jeu, dans l'ordre où on les gagne d'habitude. `icone` : une image PNG encodée en texte, ou `""`. La commande `badge` les donne ; le carnet du jeu les montre.
- `interface` : le style de l'interface en jeu (dialogues, combat, carnet). `theme` : `"verre"` (sombre, flou, coins arrondis) ou `"pixel"` (police pixel, cadres nets à double bordure). `accent` : la couleur des noms, curseurs et barres (`"#rrggbb"`), ou `""` pour celle du moteur. Le joueur peut forcer un thème dans les réglages de Saga. `menus` (Tafl 0.21, lu par Saga 0.6) : la forme des menus. Le pack de règles en donne une par défaut (Pokémon : « Équipe », « Pokédex », « PC », « Boîte », 30 places par boîte en grille de 6 colonnes, résumé en pages `infos`, `stats`, `attaques`) ; chaque champ la remplace s'il n'est pas vide : `equipe`, `dex`, `pc`, `boite` (les noms ; une boîte s'appelle « Boîte 1 », « Boîte 2 »…), `dex_visible` (`false` cache le Pokédex), `places` et `colonnes` (`0` = ceux du pack), `forme_boites` (`"grille"`, `"liste"` ou `""`), `pages` (les pages du résumé, dans l'ordre ; `[]` = celles du pack).

### Le pack JRPG (Tafl 0.25, Saga 0.8)

Quand `reglages.regles` vaut `"jrpg"` : un groupe de héros (les personnages qui ont une `classe`) se bat au tour par tour contre des groupes de monstres. Il n'y a pas de capture, ni de natures, d'EV, d'IV, de talents ou de dresseurs. Les fichiers servent ainsi :

- `types.json` : les **éléments** (feu, glace…). Seuls `id`, `nom` et `couleur` comptent ; les faiblesses sont écrites sur chaque monstre.
- `attaques.json` : les **compétences** (sorts, techniques), voir ci-dessous.
- `objets.json`, `boutiques.json` : comme pour Pokémon, plus l'équipement.
- `classes.json`, `monstres.json`, `groupes.json` : propres à ce pack.

Les statistiques s'appellent `pv`, `pm`, `force`, `magie`, `defense`, `esprit`, `agilite`, `chance`. Les statuts : `poison` (perd 1/12 de ses PV max à chaque tour, et reste après le combat), `sommeil` (2 à 4 tours, une chance sur deux de se réveiller quand on le frappe), `paralysie` (1 à 3 tours), `silence` (plus de compétences magiques), `cecite` (deux fois moins de chances de toucher avec les attaques physiques). Les autres statuts s'effacent à la fin du combat.

#### Les compétences (`attaques.json`)

Les champs de Pokémon, avec ce sens et trois champs en plus :

| Champ | Sens |
|---|---|
| `type` | Son élément (`""` = neutre). |
| `categorie` | `"physique"` (Force contre Défense, peut faire un critique), `"speciale"` (magie : Magie contre Esprit, impossible sous Silence), `"statut"` (soutien, sans dégâts). |
| `puissance` | 100 = une attaque normale ; 0 = pas de dégâts. |
| `precision` | En %. Une compétence magique à 100 ne rate jamais. |
| `cible` | `"adversaire"`, `"adversaires"` (tous), `"allie"`, `"equipe"` (tout le groupe du lanceur), `"soi"`, `"tous"`. |
| `cout_pm` | Son coût en PM. |
| `soin` | La puissance du soin : PV rendus ≈ `soin` + Magie du lanceur. |
| `ranime` | `true` : ranime un allié K.O. (avec `soin`, sinon un quart de ses PV). |
| `guerit` | Les statuts qu'elle guérit : `["poison", "silence"]`, ou `["tous"]`. |
| `statut`, `chance_statut` | Le statut infligé, et sa chance en % (0 = toujours). |
| `stats`, `stats_cible`, `chance_stats` | Des crans sur `force`, `magie`, `defense`, `esprit` ou `agilite` (±4 au plus en combat ; n crans font ×(2 + n) / 2 en hausse, ×2 / (2 − n) en baisse). |
| `critique` | Des paliers de coup critique en plus (+10 % chacun). |

Une compétence de soin (`soin`, `ranime` ou `guerit`) qui vise `allie`, `equipe` ou `soi` s'utilise aussi hors combat, depuis le menu du groupe.

#### Les objets (`objets.json`)

- `effet.type` : `"soin"` (PV), `"soin_pm"` (PM, Tafl 0.25), `"rappel"` (ranime avec `valeur` % des PV), `"soin_statut"` (`statut` ou `"tous"`), `"repousse"`, `"passage"`. `valeur` 9999 = tout.
- `equipement` (facultatif) : un objet qu'un héros porte.

```json
{ "id": "epee-de-flamme", "nom": "Épée de flamme", "categorie": "arme", "prix": 900,
  "effet": { "type": "aucun" },
  "equipement": { "place": "arme", "bonus": { "force": 10 }, "element": "feu", "classes": ["guerrier"] } }
```

`place` : `arme`, `bouclier`, `casque`, `armure` ou `accessoire`. `bonus` : ce qu'il ajoute aux statistiques (négatif pour un malus). `element` (arme) : l'élément de l'attaque de base. `classes` : celles qui peuvent le porter (`[]` = toutes). Un objet porté quitte le sac ; retiré, il y revient.

#### `donnees/classes.json`

```json
{ "format": "tafl-classes", "version": 1, "classes": [
  { "id": "mage-blanc", "nom": "Mage blanc", "description": "Elle soigne, protège et ranime.", "couleur": "#f0f0f0",
    "stats": { "pv": 30, "pm": 14, "force": 6, "magie": 12, "defense": 6, "esprit": 12, "agilite": 7, "chance": 7 },
    "gains": { "pv": 7, "pm": 3.2, "force": 1, "magie": 2.4, "defense": 1.2, "esprit": 2.4, "agilite": 1.2, "chance": 1 },
    "competences": [{ "niveau": 1, "competence": "soin" }, { "niveau": 12, "competence": "resurrection" }] }
] }
```

La statistique d'un héros au niveau n vaut `stats` + `gains` × (n − 1), arrondi en dessous, plus les `bonus` de son équipement. Il connaît les `competences` de sa classe jusqu'à son niveau.

#### `donnees/monstres.json`

```json
{ "format": "tafl-monstres", "version": 1, "monstres": [
  { "id": "slime", "nom": "Slime", "numero": 1, "description": "Une goutte gluante et curieuse.", "image": "data:image/png;base64,...",
    "taille": "petit", "boss": false, "niveau": 1,
    "stats": { "pv": 18, "pm": 0, "force": 7, "magie": 5, "defense": 4, "esprit": 4, "agilite": 5, "chance": 3 },
    "faiblesses": ["feu"], "resistances": [], "immunites": [], "statuts_immunises": [],
    "poids_attaque": 50, "competences": [{ "competence": "spores", "poids": 30 }],
    "xp": 4, "or": 3, "butin": [{ "objet": "potion", "chance": 15 }] }
] }
```

- `image` : le monstre en combat (PNG encodé en texte, fond transparent), tourné vers la droite (les héros sont à droite). `taille` : `"petit"`, `"moyen"` ou `"grand"` ; un `boss` est dessiné plus grand, et ne s'endort ni ne se paralyse jamais.
- `faiblesses` (×2), `resistances` (×½), `immunites` (×0) : des ids d'éléments. `statuts_immunises` : les statuts qui ne le touchent pas.
- À son tour, il tire au hasard l'attaque de base (`poids_attaque`) ou une de ses `competences` (selon les `poids`, parmi celles qu'il a assez de PM pour lancer).
- `xp` et `or` : ce que rapporte sa défaite (l'expérience va entière à chaque héros debout). `butin` : les objets qu'il peut laisser (`chance` en %).
- `numero` : son ordre dans le Bestiaire (qui montre son nom et son image une fois vu, tout le reste une fois vaincu).

#### `donnees/groupes.json`

```json
{ "format": "tafl-groupes", "version": 1, "groupes": [
  { "id": "gobelins", "nom": "Gobelins et slime", "monstres": [{ "monstre": "gobelin", "nombre": 2 }, { "monstre": "slime", "nombre": 1 }], "fuite": true }
] }
```

Huit monstres au plus en tout. `fuite: false` : on ne peut pas fuir (un boss).

#### Dans `reglages.json`

`niveau_max` (99 par défaut) et `courbe_xp` : l'expérience totale qu'il faut pour le niveau n vaut 10 × (n − 1)², fois 0,7 (`"rapide"`), 1 (`"normale"`) ou 1,4 (`"lente"`). `equipe_max` : le nombre de héros qui se battent (4 conseillé) ; les autres attendent dans la Réserve. `plafonds`, `ajustement`, `ecart` et `chance_chromatique` ne servent pas.

### Le pack JDR (Tafl 0.32, Saga 0.13)

Quand `reglages.regles` vaut `"jdr"` : un jeu de rôle sur table façon D&D 5e (le SRD 5.1, en français), pour accompagner de vraies parties. Les joueurs créent leurs personnages (ou prennent un pré-tiré), font des tests au d20 contre un DD, et se battent au tour par tour contre des rencontres de monstres. Les distances sont écrites en mètres (1,5 m = une case). Il n'y a ni capture, ni types, ni dresseurs.

Chaque fichier ci-dessous peut rester vide : Saga prend alors la liste de la 5e (six caractéristiques, 18 compétences, 15 états), pour qu'un jeu tout neuf marche déjà. Dans Tafl, **Données › Réglages › Règles du jeu › Charger le modèle D&D 5e** ajoute ce qui manque : les listes de la 5e, 9 origines, 12 classes (niveaux 1 à 20), des sorts, des monstres, des rencontres, des armes, des armures et des potions (contenu du SRD 5.1, sous licence CC-BY-4.0 : `reglages.jdr.attribution` en garde la mention). Les ids gardent les « _ » (`a_terre`, `attaque_sournoise`) : Saga les connaît ainsi.

Les fichiers servent ainsi :

- `caracteristiques.json`, `competences.json`, `etats.json` : les listes de base.
- `origines.json`, `classes_jdr.json`, `sorts.json` : ce qui fait un personnage.
- `monstres_jdr.json` : les monstres ; `groupes.json` : les **rencontres** (mêmes champs que pour le pack JRPG, `monstre` est alors un id de `monstres_jdr.json`). Les `rencontres` des zones visent ces groupes, comme pour le pack JRPG.
- `objets.json`, `boutiques.json` : comme pour Pokémon, plus les armes et armures (`jdr`).
- `personnages.json` : l'apparence des personnages (sprite, portraits) ; un personnage avec une fiche `jdr` est un **pré-tiré**.

#### `donnees/caracteristiques.json`, `competences.json`, `etats.json`

```json
{ "format": "tafl-caracteristiques", "version": 1, "caracteristiques": [{ "id": "for", "nom": "Force", "court": "FOR" }] }
{ "format": "tafl-competences", "version": 1, "competences": [{ "id": "athletisme", "nom": "Athlétisme", "carac": "for" }] }
{ "format": "tafl-etats", "version": 1, "etats": [
  { "id": "empoisonne", "nom": "Empoisonné", "description": "Désavantage aux attaques et aux tests.", "effets": ["desavantage_attaques", "desavantage_tests"] }
] }
```

`court` : 4 lettres au plus. Les `effets` d'un état sont ceux que Saga sait jouer : `incapable` (ne peut ni agir ni réagir), `desavantage_attaques`, `avantage_attaques`, `avantage_contre` (on l'attaque avec avantage), `desavantage_contre`, `desavantage_tests`, `echec_for_dex` (rate ses sauvegardes de Force et de Dextérité), `critique_contact` (un coup au contact est critique), `desavantage_sauvegardes_dex`. Un état sans effet reste un texte sur la fiche.

#### `donnees/origines.json`

```json
{ "format": "tafl-origines", "version": 1, "origines": [
  { "id": "nain", "nom": "Nain des collines", "description": "…", "bonus": { "con": 2, "sag": 1 }, "vitesse": 7.5, "taille": "moyenne",
    "langues": "Commun, nain", "pv_bonus_niveau": 1, "resistances": ["poison"],
    "maitrises": { "armes": ["hache-d-armes", "marteau-de-guerre"], "competences": [], "armures": [] },
    "competences_choix": { "nombre": 0 },
    "traits": [{ "nom": "Vision dans le noir", "description": "…" }] }
] }
```

`bonus` : ce qu'elle ajoute aux caractéristiques. `vitesse` en mètres. `taille` : `tres_petite`, `petite`, `moyenne`, `grande`, `tres_grande` ou `gigantesque`. `pv_bonus_niveau` : des PV en plus à chaque niveau (0 à 5). `resistances` : des types de dégâts. `competences_choix.nombre` : des compétences au choix à la création (le demi-elfe). Les `traits` sont du texte sur la fiche.

#### `donnees/classes_jdr.json`

```json
{ "format": "tafl-classes_jdr", "version": 1, "classes_jdr": [
  { "id": "magicien", "nom": "Magicien", "couleur": "#6f8cff", "description": "…", "de_vie": 6, "carac_principale": "int",
    "sauvegardes": ["int", "sag"], "maitrises": { "armures": [], "armes": ["dague", "baton"] },
    "competences_choix": { "nombre": 2, "parmi": ["arcanes", "histoire", "intuition", "investigation", "medecine", "religion"] },
    "equipement_depart": [{ "objet": "baton", "nombre": 1 }], "or_depart": "4d4*10",
    "lanceur": { "type": "complet", "carac": "int", "tours": 3, "prepare": true },
    "ameliorations": [4, 8, 12, 16, 19],
    "niveaux": [
      { "niveau": 1, "aptitudes": [{ "nom": "Restauration arcanique", "effet": "recuperation_arcanique", "description": "…" }] },
      { "niveau": 2, "aptitudes": [{ "nom": "Tradition arcanique", "description": "…" }] }
    ] }
] }
```

- `de_vie` : 6, 8, 10 ou 12. Au niveau 1, le héros a le maximum du dé + son modificateur de Constitution ; ensuite, selon `reglages.jdr.pv_niveau`.
- `carac_principale` : un id, ou une liste (`["for", "dex"]`). `sauvegardes` : les sauvegardes maîtrisées.
- `maitrises.armures` : `legere`, `intermediaire`, `lourde`, `bouclier` ; `maitrises.armes` : `courante`, `guerre`, ou des ids d'objets.
- `or_depart` : une formule de dés (le `*10` est permis), à la place de l'équipement si le joueur le choisit.
- `lanceur` (facultatif) : `type` vaut `complet` (clerc, magicien…), `demi` (paladin, rôdeur, à partir du niveau 2) ou `occultiste` (magie de pacte : peu d'emplacements, tous au plus haut niveau, rendus au repos court). `carac` : la caractéristique de magie. `tours` : le nombre de sorts mineurs (niveau 0) connus. `prepare` : il prépare ses sorts chaque jour (sinon il les connaît, autant que `connus[niveau − 1]`). Les emplacements suivent la table de la 5e.
- `ameliorations` : les niveaux où il gagne +2 à répartir (ou un don ; défaut 4, 8, 12, 16, 19).
- `niveaux[].aptitudes` : ce qu'il gagne à chaque niveau. Une aptitude avec un `effet` est jouée par Saga, avec sa `valeur` si elle en a une : `rage` (valeur : bonus aux dégâts), `defense_sans_armure_barbare`, `defense_sans_armure_moine`, `attaque_supplementaire`, `attaque_sournoise` (valeur : les dés, `"2d6"`), `ruse`, `second_souffle`, `sursaut`, `critique_ameliore` (valeur : 19), `style_defense`, `style_archerie`, `style_duel`, `style_deux_armes`, `arts_martiaux` (valeur : le dé), `ki`, `chatiment_divin`, `imposition_des_mains`, `inspiration_bardique` (valeur : le dé), `canalisation`, `sorcellerie`, `recuperation_arcanique`. Les autres sont du texte sur la fiche.

#### `donnees/sorts.json`

```json
{ "format": "tafl-sorts", "version": 1, "sorts": [
  { "id": "boule-de-feu", "nom": "Boule de feu", "niveau": 3, "ecole": "evocation", "classes": ["ensorceleur", "magicien"],
    "temps": "1 action", "portee": "45 m", "duree": "instantanée", "composantes": "V, S, M", "concentration": false, "rituel": false,
    "description": "…",
    "effet": { "type": "sauvegarde", "cibles": "zone", "sauvegarde": "dex", "degats": "8d6", "type_degats": "feu", "moitie": true, "niveau_sup": "1d6" } }
] }
```

`niveau` : 0 (un sort mineur, sans emplacement) à 9. `ecole` : `abjuration`, `divination`, `enchantement`, `evocation`, `illusion`, `invocation`, `necromancie` ou `transmutation`. `effet` dit à Saga comment le jouer en combat :

| `effet.type` | Ce que fait le sort | Champs |
|---|---|---|
| `aucun` | rien en combat : seulement sa description (un sort d'exploration) | |
| `attaque` | un jet d'attaque de sort contre la CA | `degats`, `type_degats`, `etat`, `tours` |
| `sauvegarde` | la cible fait une sauvegarde contre le DD des sorts du lanceur | `sauvegarde` (la caractéristique), `degats`, `type_degats`, `moitie` (la moitié si réussi), `etat`, `tours` |
| `auto` | touche toujours (Projectile magique) | `degats`, `type_degats` |
| `soin` | rend des PV | `soin` (les dés), `ajouter_mod` (ajoute le modificateur de magie ; vrai par défaut) |
| `pv_temp` | donne des PV temporaires | `soin`, `ajouter_mod` |
| `bonus` | un bonus pour un temps | `bonus_ca`, `bonus_attaque`, `bonus_sauvegarde` (un nombre ou un dé, `"1d4"`), `tours` |
| `etat` | met un état à ceux qui ratent leur sauvegarde | `sauvegarde`, `etat`, `tours` |
| `sommeil` | endort des PV de créatures, des plus faibles aux plus fortes | `soin` (les dés de PV) |

Pour tous : `cibles` vaut `un`, `plusieurs`, `zone` (tous les adversaires), `allie`, `allies` ou `soi` ; `niveau_sup` : ce qui s'ajoute par niveau d'emplacement au-dessus du sien ; `action: "bonus"` : il se lance avec l'action bonus. Les sorts à `concentration` s'arrêtent quand le lanceur en lance un autre, ou rate sa sauvegarde de Constitution en prenant des coups.

#### `donnees/monstres_jdr.json`

```json
{ "format": "tafl-monstres_jdr", "version": 1, "monstres_jdr": [
  { "id": "gobelin", "nom": "Gobelin", "numero": 1, "image": "data:image/png;base64,...",
    "fp": "1/4", "type": "humanoïde", "taille": "petite", "ca": 15, "ca_texte": "armure de cuir, bouclier", "pv_des": "2d6", "pv": 7, "vitesse": 9,
    "carac": { "for": 8, "dex": 14, "con": 10, "int": 10, "sag": 8, "cha": 8 },
    "sauvegardes": {}, "competences": { "discretion": 6 }, "sens": "vision dans le noir 18 m", "langues": "commun, gobelin",
    "resistances_degats": [], "vulnerabilites_degats": [], "immunites_degats": [], "immunites_etats": [],
    "multiattaque": 0, "boss": false, "or": "1d6", "butin": [{ "objet": "dague", "chance": 20 }],
    "traits": [{ "nom": "Fuite agile", "description": "…" }],
    "actions": [
      { "nom": "Cimeterre", "attaque": 4, "degats": "1d6+2", "type_degats": "tranchant" },
      { "nom": "Arc court", "attaque": 4, "degats": "1d6+2", "type_degats": "perforant", "distance": true },
      { "nom": "Souffle", "sauvegarde": { "carac": "dex", "dd": 12, "moitie": true }, "degats": "4d6", "type_degats": "feu", "zone": true, "recharge": "5-6" }
    ],
    "description": "…" }
] }
```

- `fp` : le facteur de puissance (`"0"`, `"1/8"`, `"1/4"`, `"1/2"`, `"1"` à `"30"`) ; il donne l'XP du monstre (table de la 5e : 50 XP pour 1/4, 200 pour 1…) et son bonus de maîtrise.
- `pv` : ses PV (si `pv_des` est donné et `pv` absent, la moyenne des dés). `vitesse` en mètres.
- `sauvegardes` et `competences` : les bonus écrits sur sa fiche ; les autres se calculent depuis `carac`.
- `actions` : une attaque (`attaque` : le bonus pour toucher) ou une sauvegarde (`sauvegarde`). `etat`, `tours` et `etat_sauvegarde` (`{ carac, dd }`) : un état en plus quand ça touche (la morsure qui empoisonne). `distance`, `zone` (tous les héros), `repete` (fait partie de la multiattaque), `recharge` (`"5-6"` : revient sur un d6 de 5 ou 6), `poids` (sa chance d'être choisie, 0 à 100).
- `multiattaque` : le nombre d'attaques `repete` par tour. Un `boss` est dessiné plus grand.
- `image`, `numero` : comme pour le pack JRPG (le Bestiaire).

#### Les objets (`objets.json`)

Une arme ou une armure a une partie `jdr` ; un objet de soin peut lancer des dés (`effet.des`) :

```json
{ "id": "epee-longue", "nom": "Épée longue", "categorie": "arme", "prix": 15, "effet": { "type": "aucun" },
  "jdr": { "arme": { "categorie": "guerre", "degats": "1d8", "type": "tranchant", "proprietes": ["polyvalente"], "polyvalente": "1d10" } } }
{ "id": "cotte-de-mailles", "nom": "Cotte de mailles", "categorie": "armure", "prix": 75, "effet": { "type": "aucun" },
  "jdr": { "armure": { "type": "lourde", "ca": 16, "discretion": true, "force": 13 } } }
{ "id": "potion-de-soins", "nom": "Potion de soins", "categorie": "soin", "prix": 50, "effet": { "type": "soin", "valeur": 0, "des": "2d4+2" } }
```

- `arme.categorie` : `courante` ou `guerre`. `type` : le type de dégâts (`contondant`, `perforant`, `tranchant`, `acide`, `feu`, `froid`, `foudre`, `force`, `necrotique`, `poison`, `psychique`, `radiant`, `tonnerre`). `proprietes` : `finesse` (Force ou Dextérité), `legere` (combat à deux armes), `lourde`, `deux_mains`, `polyvalente` (avec le dé à deux mains), `lancer`, `munitions`, `chargement`, `allonge`. `distance: true` avec sa `portee` en mètres.
- `armure.type` : `legere` (CA + Dex), `intermediaire` (CA + Dex, 2 au plus), `lourde` (CA sans Dex) ou `bouclier` (+`ca`). `discretion` : désavantage en Discrétion. `force` : la Force qu'il faut pour ne pas être ralenti.
- Un héros porte `arme`, `seconde` (la main gauche : une arme légère ou un bouclier) et `armure`. Un objet porté quitte le sac.

#### Dans `personnages.json` : les pré-tirés

```json
{ "id": "thorgrim", "nom": "Thorgrim", "jdr": { "origine": "nain", "classe": "guerrier", "niveau": 1,
  "carac": { "for": 16, "dex": 12, "con": 15, "int": 8, "sag": 13, "cha": 10 },
  "competences": ["athletisme", "intimidation"], "expertises": [], "sorts": [],
  "equipement": { "arme": "hache-d-armes", "seconde": "bouclier", "armure": "cotte-de-mailles" } } }
```

`carac` : les valeurs avant le bonus d'origine. À la création, le joueur peut prendre un pré-tiré tel quel (si `reglages.jdr.creation.pretires`). Le personnage `heros` donne son apparence au premier personnage ; les autres choisissent la leur parmi les personnages du jeu.

#### Dans `reglages.json` : `jdr`

```json
"jdr": {
  "creation": { "active": true, "methodes": ["standard", "points", "des"], "niveau_depart": 1, "nombre": 1, "pretires": true },
  "pv_niveau": "moyenne", "critiques": "doubler", "echec_critique": true, "progression": "xp", "repos": "normal", "repos_menu": true,
  "morts": "jets", "potion_bonus": false, "tenaille": false, "unite": "m", "monnaie": "po", "mj_decide": false, "animation_des": "normale",
  "attribution": "Ce jeu utilise le SRD 5.1 (CC-BY-4.0)…"
}
```

Les règles maison, réglées dans Tafl (**Données › Réglages › Règles du jeu**) :

| Champ | Valeurs |
|---|---|
| `creation` | `active` : la création au début d'une nouvelle partie (sinon le groupe commence avec le héros pré-tiré) ; `methodes` : `standard` (15, 14, 13, 12, 10, 8), `points` (27 points), `des` (4d6, on garde les 3 meilleurs) ; `niveau_depart` (1 à 20) ; `nombre` : les personnages à créer (1 à 6) ; `pretires` : proposer les pré-tirés. |
| `pv_niveau` | `moyenne` (la moyenne du dé de vie, arrondie au-dessus), `jet` (on lance le dé), `choix` (le joueur choisit à chaque niveau). |
| `critiques` | `doubler` (on lance deux fois les dés de dégâts, la règle officielle) ou `max` (le maximum des dés, plus un jet). |
| `echec_critique` | `true` : un 1 naturel rate toujours une attaque. |
| `progression` | `xp` (les combats en donnent) ou `jalons` (on monte aux moments clés, avec la commande `xp` et `jalon: true`). |
| `repos` | `normal` (court 1 h, long 8 h), `heroique` (5 min, 1 h), `realiste` (8 h, 7 jours) : le texte montré au joueur. `repos_menu` : se reposer depuis le menu de pause. |
| `morts` | `jets` (jets contre la mort : 3 réussites ou 3 échecs) ou `ko` (simplement K.O. jusqu'à la fin du combat). |
| `potion_bonus` | `true` : boire une potion est une action bonus. |
| `tenaille` | `true` : la prise en tenaille : avantage au contact contre une cible qu'un allié a déjà frappée au contact ce tour-ci. |
| `unite` | `m` (mètres), `cases` (1,5 m = une case) ou `pieds` : l'affichage des distances (les données restent en mètres). |
| `monnaie` | Depuis Tafl 0.32.1, toujours `unique` : le jeu n'a qu'une monnaie, `reglages.monnaie` (`po` par défaut en JDR). Saga lit encore `po` (pièces d'or) dans un ancien jeu. |
| `mj_decide` | `true` : après chaque test, le MJ garde le jet ou force la réussite ou l'échec. |
| `animation_des` | `normale`, `rapide` ou `aucune` : le plateau de dés. |
| `attribution` | la mention de licence du contenu SRD (écrite par le modèle D&D 5e). |

Pour un jeu JDR, Tafl met aussi `equipe_max` à 4 et `argent_depart` à 0 au chargement du modèle. `niveau_max` vaut au plus 20.

#### Ce que le moteur garde dans une sauvegarde

`partie.jdr` : `graine` (le hasard des dés : recharger rejoue les mêmes jets) et `journal` (les 200 derniers jets : `{ n, qui, quoi, formule, des: [{ faces, valeur, garde }], bonus, total, contre, resultat, cache }`). Chaque membre du groupe garde sa fiche : `origine`, `classe`, `niveau`, `xp`, `carac`, `competences`, `expertises`, `pv`, `pv_temp`, `pv_niveaux`, `des_vie`, `equipement`, `sorts`, `emplacements`, `ressources`, `etats`, `mort`, et `joueur` (vide pour l'instant : l'ami à qui appartient la fiche, pour le multijoueur). La CA, les bonus et les PV max se recalculent depuis les données, pour qu'un changement fait dans Tafl se voie aussitôt.

## Test rapide

(Tafl 0.27, joué par Saga 0.10.) Jeu › Test rapide lance le moteur avec un **état de départ** : une partie neuve, puis cet état posé par-dessus. Tafl le passe en ligne de commande, dans un fichier : `Saga.exe <dossier> --test=<fichier.json>`. Les états enregistrés vont dans `jeu.json`, champ `tests` (une liste).

```json
{
  "nom": "Avant l'arène 2",
  "depart": { "carte": "route-3", "x": 4, "y": 9, "direction": "haut" },
  "equipe": [{ "id": "salameche", "niveau": 30 }, { "id": "carapuce", "niveau": 12 }],
  "objets": { "potion": 5, "super-ball": 2 },
  "argent": 4000,
  "badges": ["badge-roche"],
  "interrupteurs": ["rival-battu-au-labo"],
  "quetes": { "le-premier-compagnon": { "etat": "finie", "etape": 3 }, "legende-du-lac": { "etat": "en_cours", "etape": 2 } }
}
```

| Champ | Sens |
|---|---|
| `depart` | Où commencer, ou `null` : le départ du jeu. |
| `equipe` | Les membres de l'équipe, à la place de celle de départ : des ids de `creatures.json` (Pokémon) ou de personnages qui ont une `classe` (pack JRPG), avec leur niveau. Au-delà de la taille de l'équipe, ils vont dans les boîtes (ou la Réserve). Vide : l'équipe d'une partie neuve. |
| `objets` | Le sac : id d'objet → nombre. |
| `argent` | L'argent, ou `null` : `argent_depart` des réglages. |
| `heure` | (Tafl 0.29) L'heure de l'horloge du jeu au départ (0 à 23), ou `null` : `temps.heure_depart`. |
| `badges` | Les ids des badges reçus (le compteur `badges` suit). |
| `interrupteurs` | Les interrupteurs allumés au départ. |
| `quetes` | L'état des quêtes : `{ "etat": "en_cours", "etape": n }` ou `{ "etat": "finie" }`. Les absentes ne sont pas commencées. |

Le moteur sauvegarde une partie de test à part, pour ne pas écraser la vraie partie du joueur.

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
- **Version 1, ajouts de Tafl 0.15** : `interface` dans les réglages (thème verre ou pixel, couleur d'accent). Un champ en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.16** : les commandes `argent`, `badge`, `personnaliser` et `tenue`, les conditions `argent` et `badge`, `tenues` dans les personnages, `regles` et `badges` dans les réglages. Des champs en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.21** : la commande `ecran_boites` et `interface.menus` dans les réglages. Des champs en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.24** : le type d'événement `obstacle` et son champ `obstacle`, les compteurs `sauvages_battus`, `especes_vues`, `especes_prises` et `quetes_finies`, les effets d'objet `stase` et `amitie`, `verrouille_visible` dans les articles de boutique, `ajustement_sauvages`, `ecart_sauvages`, `evolution_dresseurs`, `evolution_sauvages` et `seuil_amitie` dans les réglages, l'`amitie` de chaque créature dans la sauvegarde. Des champs en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.25** : le pack de règles `"jrpg"` : les fichiers `classes.json`, `monstres.json` et `groupes.json`, `cout_pm`, `ranime` et `guerit` dans les attaques, `equipement` et l'effet `soin_pm` dans les objets, `classe`, `niveau` et `equipement` dans les personnages, `niveau_max` et `courbe_xp` dans les réglages, les rencontres de groupes dans les zones, les commandes `groupe` et `combat_groupe`, la condition `membre`, le compteur `monstres_vaincus`. Des champs en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.27** : `tests` dans `jeu.json` (les états du test rapide) et l'option `--test` du moteur. Des champs en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.29** : le dossier `sons/`, `musique`, `fond_sonore`, `volume_fond` et `jour_nuit` dans l'ambiance des cartes, `lumiere` dans les tuiles et les événements, `temps`, `audio` et `sauvegarde_auto` dans les réglages, les commandes `musique`, `son` et `heure`, la condition `moment`, `heure` dans les états du test rapide, `temps` et `musique` dans la sauvegarde. Des champs en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.31** : le dossier `scripts/` et `scripts` dans `jeu.json` (les scripts JS, voir SCRIPTS.md), `donnees/variables.json`, les commandes `variable` et `script`, la condition `variable`, `scripts.formules_coupees` dans les réglages, `variables` et `graine` dans la sauvegarde. Des champs en plus, donc la version reste 1.
- **Version 1, ajouts de Tafl 0.32** : le pack de règles `"jdr"` : les fichiers `caracteristiques.json`, `competences.json`, `origines.json`, `classes_jdr.json`, `sorts.json`, `monstres_jdr.json` et `etats.json`, `jdr` dans les objets (arme, armure) et `effet.des`, `jdr` dans les personnages (pré-tirés), `reglages.jdr` (création et règles maison), les rencontres de groupes de ce pack, les commandes `test`, `sauvegarde`, `test_oppose`, `jet`, `repos`, `xp`, `etat` et `creer_personnage` (les trois premières ont deux branches, `reussi` et `rate`), les conditions `jdr_perception`, `jdr_maitrise`, `jdr_etat`, `jdr_classe`, `jdr_origine` et `jdr_niveau`, `jdr` dans la sauvegarde. Des champs en plus, donc la version reste 1.
