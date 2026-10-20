# Format d'un dossier de jeu Tafl (version 1)

Ce fichier décrit ce que Tafl enregistre quand tu crées un **jeu** (Fichier › Nouveau jeu, `Ctrl+Maj+J`). Il est écrit pour toi, et pour le futur **moteur** du jeu, qui lira ces fichiers sans rien savoir de Tafl.

Tafl copie ce `FORMAT.md` dans le dossier du jeu à chaque enregistrement : il décrit toujours la version de Tafl qui a écrit les fichiers.

L'idée : **Tafl décrit le jeu, le moteur le fait tourner.** Tout est en JSON lisible, que tu peux ouvrir dans Rune et suivre avec Git.

## Le dossier

```
MonJeu/
  jeu.json              le jeu : titre, liste des cartes, départ du joueur
  tuiles.tafl           les tuiles, partagées par toutes les cartes
  cartes/
    bourg-palette.json  une carte par fichier, nommé par l'id de la carte
    route-1.json
  FORMAT.md             ce fichier
```

Prévus pour la suite (Tafl 0.7 et 0.8) : `donnees/` (personnages, quêtes, créatures, attaques, objets, dresseurs, boutiques) et `sprites/` (images des personnages et des créatures).

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
  "depart": { "carte": "bourg-palette", "x": 9, "y": 7, "direction": "bas" }
}
```

| Champ | Sens |
|---|---|
| `titre` | Le titre du jeu. |
| `tailleTuiles` | Côté d'une tuile (et d'une case) en pixels. |
| `tuiles` | Le fichier des tuiles, à côté de `jeu.json`. |
| `cartes` | Les cartes, dans l'ordre du panneau Cartes de Tafl. `id` ne change jamais (même si tu renommes la carte) : c'est lui que les téléporteurs utilisent. |
| `depart` | Où le joueur commence une nouvelle partie, ou `null` s'il n'est pas encore placé. |

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
    { "id": "zone-1", "nom": "Herbes hautes", "type": "herbes", "x": 2, "y": 9, "largeur": 5, "hauteur": 4, "objetRequis": null },
    { "id": "zone-2", "nom": "Mare", "type": "eau", "x": 13, "y": 9, "largeur": 5, "hauteur": 4, "objetRequis": "planche-de-surf" }
  ],
  "teleporteurs": [
    { "id": "tp-1", "x": 4, "y": 3, "vers": { "carte": "maison", "x": 5, "y": 6, "direction": "haut" } }
  ]
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

Prévu pour Tafl 0.8 : `rencontres`, la table des créatures qu'on y croise (créature, niveaux, chance).

### Téléporteurs

Une case `(x, y)` qui mène ailleurs : marcher dessus emmène le joueur sur la case `(vers.x, vers.y)` de la carte `vers.carte` (son `id`), tourné vers `vers.direction`. C'est une porte, un escalier, une bouche de grotte, ou le bord d'une route qui continue sur la carte suivante.

Conseil pour une porte : l'arrivée sur le paillasson à l'intérieur, et le téléporteur du retour juste derrière lui (Tafl peut le créer tout seul : case « Créer aussi le téléporteur du retour »). Ainsi, le joueur qui arrive ne repart pas aussitôt.

## Exemple de lecture (JavaScript)

```js
const jeu = await (await fetch('MonJeu/jeu.json')).json();
const carte = await (await fetch(`MonJeu/${jeu.cartes.find((c) => c.id === jeu.depart.carte).fichier}`)).json();
const bloque = (x, y) => x < 0 || y < 0 || x >= carte.largeur || y >= carte.hauteur || carte.collisions[y * carte.largeur + x] === 2;
const teleporteur = (x, y) => carte.teleporteurs.find((t) => t.x === x && t.y === y);
```

## Historique du format

- **Version 1** (Tafl 0.6) : dossier de jeu, plusieurs cartes, calques avec profondeur, opacité, fusion et parallaxe, passage et collisions, zones, téléporteurs, départ du joueur.
