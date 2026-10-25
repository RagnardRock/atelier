# Les packs de règles de Saga

Saga sépare **le monde** (cartes, déplacements, événements, scripts, sauvegarde, menus) et **les règles** (qui se bat, comment on gagne, comment on progresse). Le monde ne connaît pas les règles : il passe toujours par l'objet `Regles` (`regles.js`), qui envoie chaque appel au **pack de règles** choisi par le jeu.

Trois packs existent (Saga 0.13) :

| Pack | Dossier | Écran de combat | En bref |
|---|---|---|---|
| `pokemon` | `regles/pokemon/` | `duel` (`ecran-combat.js`) | Créatures, captures, types, natures, EV/IV, évolutions, dresseurs. Formules des jeux officiels. |
| `jrpg` | `regles/jrpg/` | `groupe` (`ecran-groupe.js`) | Un groupe de héros avec des classes, des PV et des PM, des compétences et de l'équipement, contre des groupes de monstres au tour par tour. |
| `jdr` | `regles/jdr/` | `groupe` (`ecran-groupe.js`) | Un jeu de rôle sur table façon D&D 5e (SRD 5.1) : création de personnage, tests au d20 contre un DD, sauvegardes, sorts et emplacements, jets contre la mort, règles maison. |

Le jeu choisit son pack dans Tafl (Données du jeu › Réglages › Règles), c'est-à-dire `donnees/reglages.json` › `reglages.regles`. Un pack que Saga ne connaît pas retombe sur `pokemon`. Les fichiers de données de chaque pack sont décrits dans `tuiles/FORMAT.md` (« Le pack JRPG » pour `jrpg`, « Le pack JDR » pour `jdr`).

Ce document décrit :

1. [Le contrat d'un pack](#1-le-contrat-dun-pack) : chaque fonction, ce qu'elle reçoit et ce qu'elle rend.
2. [Les formes partagées](#2-les-formes-partagées) : `jeu`, `partie`, un membre, une fiche, les menus, les capacités.
3. [Parler au joueur](#3-parler-au-joueur--les-objets-ui) : les objets `ui` (hors combat, écran duel, écran groupe).
4. [Le pack JRPG](#4-le-pack-jrpg) : ses données en mémoire, ses formules, ses statuts.
5. [Le pack Pokémon](#5-le-pack-pokémon) : ce qui lui est propre.
6. [Écrire un pack](#6-écrire-un-pack--un-exemple-minimal) : un exemple minimal complet.
7. [Les scripts et les règles maison](#7-les-scripts-du-jeu-et-les-règles-maison-saga-012) : remplacer une formule du pack depuis un script du jeu (Saga 0.12), et ce qui est prévu ensuite.
8. [Le pack JDR](#8-le-pack-jdr-saga-013) : D&D 5e, ses ajouts au contrat, ses calculs, un combat, ses formules (Saga 0.13).

---

## 1. Le contrat d'un pack

Un pack est **un objet JavaScript tout simple**, sans DOM ni accès au disque. Il reçoit les données du jeu (`jeu`) et la partie en cours (`partie`), il modifie la partie sur place, et il ne parle au joueur que par l'objet `ui` qu'on lui prête. Toutes les fonctions qui attendent le joueur sont `async`.

La façade `Regles` ajoute le jeu en premier argument quand c'est utile et choisit le pack : on appelle toujours `Regles.creer(jeu, id, niveau)`, jamais le pack directement.

### 1.1 Les champs obligatoires

| Champ | Type | Rôle |
|---|---|---|
| `nom` | texte | L'identifiant du pack (`'pokemon'`, `'jrpg'`). C'est la valeur de `reglages.regles`. |
| `capacites` | objet | Ce que ses jeux savent faire (voir [2.5](#25-les-capacités)). Les clés absentes valent `false`. |
| `menus` | objet | La forme par défaut des menus du jeu (voir [2.4](#24-la-forme-des-menus)). |

### 1.2 Les fonctions obligatoires

Dans les signatures, « → » est ce que la fonction rend.

#### `existe(jeu, id)` → booléen
Le combattant `id` existe-t-il dans les données ? Pokémon : une espèce de `creatures.json`. JRPG : un personnage de `personnages.json`. Sert à vérifier les commandes des scripts (`creature`, `groupe`) avant d'agir.

#### `creer(jeu, id, niveau)` → membre ou `null`
Un nouveau membre tout neuf (pour l'équipe, une boîte, un adversaire). `niveau` peut valoir 0 : le pack choisit alors (JRPG : le niveau de départ du personnage). Rend `null` si `id` n'existe pas. Forme d'un membre : [2.3](#23-un-membre).

Appelée par : la commande `creature` (Pokémon), les boutiques qui vendent des créatures, `sauvage` quand le pack n'en a pas.

#### `completer(jeu, c)` → membre ou `null`
Un membre lu dans une sauvegarde (ou venu d'une ancienne version), remis à jour : les champs qui manquent sont ajoutés, les valeurs folles ramenées dans leurs bornes. Rend `null` si le membre ne peut plus exister (son espèce ou son personnage a été supprimé dans Tafl) : le moteur l'enlève alors de la partie.

Appelée par : le chargement d'une partie (`collection.js`), pour chaque membre de l'équipe et des boîtes.

#### `soigner(jeu, c)`
Soin complet, sur place : PV (et PM) au maximum, statut effacé. Appelée par la commande `soigner`, les centres et auberges, et après une défaite pour toute l'équipe.

#### `resume(jeu, c)` → `{ nom, niveau, pv, pvMax, statut, image, apparence? }`
Ce que les listes du moteur montrent d'un membre : le menu Équipe, les boîtes, les boutiques. `statut` est un texte court déjà prêt (`'PSN'`, `''`). Si `image` est vide mais qu'il y a une `apparence` (un personnage, avec un `sprite` ou une couleur), la façade dessine elle-même une vignette avec `Sprites.vignette`. Un pack peut ajouter des champs (JRPG : `pm`, `pmMax`).

#### `rencontre(jeu, zone, partie)` → options de combat, ou `null`
Ce que le joueur rencontre en marchant dans une zone de rencontres (`zone` : la zone de la carte, avec ses `rencontres` telles que Tafl les a écrites). Rend directement les options passées à `combattre` :

- Pokémon : `{ sauvage: membre }` (une créature tirée selon les chances, à un niveau entre `niveau_min` et `niveau_max`, ajusté par `sauvage` si le jeu le veut) ;
- JRPG : `{ groupe: 'id-du-groupe' }` (un groupe de `groupes.json` tiré selon les chances).

`null` : rien cette fois-ci (zone vide, chances à zéro). Le moteur a déjà décidé qu'il y avait une rencontre (pas de Repousse, tirage du pas réussi) avant d'appeler.

#### `combattre({ jeu, partie, ui, sauvage, dresseur, groupe, fond })` → `{ issue }`
Le combat lui-même, du début à la fin. Le pack ouvre l'écran (`ui.ouvrir`), mène le combat, change la partie sur place (PV, expérience, argent, sac, encyclopédie, compteurs) puis ferme l'écran (`ui.fermer`).

| Option | Sens |
|---|---|
| `sauvage` | Un membre adverse (Pokémon : une créature sauvage). |
| `dresseur` | Un dresseur de `dresseurs.json` (Pokémon). |
| `groupe` | Un id de `groupes.json` ou l'objet groupe lui-même (JRPG). |
| `fond` | Le décor : `'herbes'`, `'grotte'`, `'eau'`… (d'après la case du joueur). |
| `ui` | L'écran de combat que le pack a demandé (`ecran`), voir [3.2](#32-lécran-duel-ecran-combatjs) et [3.3](#33-lécran-groupe-ecran-groupejs). |

`issue` : `'victoire'`, `'defaite'`, `'fuite'` ou `'capture'`. Le moteur s'occupe de la suite : après une défaite, il soigne toute l'équipe (`soigner`) et ramène le joueur au dernier endroit où il s'est soigné ; une défaite dans un script arrête le script.

Une erreur lancée pendant le combat ne casse pas le jeu : le moteur ferme l'écran et montre l'erreur.

#### `utilisable(jeu, objet)` → booléen
L'objet (de `objets.json`) s'utilise-t-il depuis le sac, hors combat ? Le menu Sac grise les autres.

#### `utiliserObjet({ jeu, partie, ui, id })` → `true` s'il a servi
Utiliser l'objet `id` depuis le sac, hors combat. Le pack demande sur qui (`ui.liste`), applique l'effet, dit ce qui se passe (`ui.dire`) et retire l'objet du sac s'il a servi. `ui` est l'objet hors combat ([3.1](#31-hors-combat--scriptsui)).

#### `ecranEv({ jeu, partie, ui })`
L'écran de la commande `ecran_ev`. Pokémon : répartir les EV d'une créature. Un pack sans EV dit simplement que ce n'est pas possible (le pack JRPG le fait). Tafl cache cette commande si le pack n'a pas la capacité `ev`.

#### `prixCreature(jeu, c)` → nombre
Ce qu'une boutique paie pour ce membre (capacité `vendre`). Un pack qui ne vend pas de membres rend 0.

#### `fiche(jeu, c, partie)` → fiche
Le résumé d'un membre dans le menu Équipe et les boîtes. Forme : [2.6](#26-une-fiche). La façade ne garde que les pages choisies dans Tafl (`menus.pages`), dans leur ordre.

#### `dex(jeu)` → `{ nom, especes: [{ id, numero, nom, image }] }`
Toutes les entrées de l'encyclopédie (Pokédex, Bestiaire), dans l'ordre. `numero` est un texte prêt (`'N° 007'`). La façade remplace `nom` par celui réglé dans Tafl.

#### `ficheEspece(jeu, id, { pris, vus })` → fiche ou `null`
La page d'une entrée de l'encyclopédie. `pris` : le joueur l'a attrapée (Pokémon) ou vaincue (JRPG) ; `vus` : il l'a seulement croisée. Une entrée seulement vue montre peu de choses.

### 1.3 Les champs et fonctions facultatifs

Sans eux, le moteur fait sans (la façade donne la valeur entre parenthèses).

#### `ecran` : `'duel'` ou `'groupe'` (`'duel'`)
Quel écran de combat le pack reçoit dans `combattre`.

#### `nouvellePartie(jeu, partie)` (rien)
Prépare une partie toute neuve, juste après sa création. JRPG : le héros principal (le personnage `heros: true` qui a une classe) entre dans le groupe.

#### `actionsMembre(jeu, c)` → `[[id, nom]]` (`[]`)
Des actions en plus sur un membre dans le menu Équipe, entre « Résumé » et « Changer de place ». JRPG : `[['equipement', 'Équipement'], ['competences', 'Compétences']]`.

#### `agirMembre({ jeu, partie, ui, c, id })` (rien)
Fait l'action `id` choisie parmi `actionsMembre` sur le membre `c`. `ui` : l'objet hors combat.

#### `rejoindre(jeu, partie, id, niveau)` → membre ou `null` (`null`)
Un membre qui rejoint le joueur par la commande `groupe` › rejoindre (capacité `groupe`). Le moteur le range ensuite dans l'équipe, ou dans les boîtes si elle est pleine. JRPG : un héros parti (`partie.partis[id]`) revient tel qu'il était ; sinon il est créé avec `creer`.

#### `sauvage(jeu, partie, id, niveau, { min, max })` → membre (`creer(jeu, id, niveau)`)
Saga 0.7. Une créature sauvage, dont le niveau peut suivre la progression du joueur (Pokémon : réglage « Sauvages » de Tafl, d'après les badges ou le niveau de l'équipe). `min` et `max` sont les bornes écrites dans la zone.

#### `plafond(jeu, partie)` → nombre ou `null` (`null`)
Saga 0.7. Le niveau maximum de l'équipe pour l'instant, montré en haut du menu Équipe. Pokémon : d'après les badges (`reglages.plafonds`). `null` : pas de plafond affiché.

#### `evolutionsEnAttente({ jeu, partie, ui })` (rien)
Saga 0.7. Appelée à la fin de chaque script : ce qui doit changer maintenant à cause de ce que le script a fait (Pokémon : les évolutions « de quête », proposées au joueur). `ui` : l'objet hors combat.

#### `marcher(jeu, partie)` (rien)
Saga 0.7. Appelée après chaque pas du joueur (le compteur `partie.compteurs.pas` vient d'augmenter). Pokémon : l'amitié de l'équipe monte tous les 128 pas. Doit rester très rapide.

### 1.4 Ce que la façade ajoute

| Appel | Rend |
|---|---|
| `Regles.packs()` | Les noms des packs connus : `['pokemon', 'jrpg', 'jdr']`. |
| `Regles.nom(jeu)` | Le nom du pack du jeu. |
| `Regles.ecran(jeu)` | `'duel'` ou `'groupe'`. |
| `Regles.capacites(jeu)` | Toutes les capacités, `false` par défaut. |
| `Regles.menus(jeu)` | La forme des menus : celle du pack, puis ce que le jeu a réglé dans Tafl par-dessus. |
| `Regles.CAPACITES` | La liste des capacités, toutes à `false`. |

---

## 2. Les formes partagées

### 2.1 `jeu`

Le jeu chargé par Saga (lecture seule pour un pack) :

| Champ | Contenu |
|---|---|
| `jeu.donnees` | Chaque fichier de `donnees/` lu tel quel : `jeu.donnees.objets.objets`, `jeu.donnees.classes.classes`, `jeu.donnees.reglages.reglages`… |
| `jeu.personnages` | Une `Map` id → personnage de `personnages.json`. |
| `jeu.heros` | Le personnage `heros: true`, ou `null`. |
| `jeu.joueur` | Ce que le joueur a choisi dans la partie en cours : `{ nom, tenue }` (lu dans `partie.nom` et `partie.tenue`). |
| `jeu.cartes`, `jeu.depart` | Les cartes et la case de départ (le pack n'en a pas besoin). |

### 2.2 `partie`

La partie en cours, sauvegardée telle quelle (un pack la change sur place) :

| Champ | Contenu |
|---|---|
| `equipe` | Les membres avec le joueur, dans l'ordre (6 au plus en Pokémon, 4 en JRPG par défaut : `reglages.equipe_max`). |
| `boites` | `[{ nom, creatures: [membre ou null, …] }]` : le PC ou la Réserve. |
| `sac` | `{ idObjet: nombre }`. Un objet à 0 est retiré. |
| `argent` | Un nombre. |
| `compteurs` | `{ captures, dresseurs_battus, sauvages_battus, evolutions, pas, badges, monstres_vaincus, … }`. Un pack peut en ajouter ; les conditions `compteur` de Tafl les lisent. |
| `dex` | `{ vus: { id: true }, pris: { id: true } }` : l'encyclopédie. Pokémon : vues et attrapées ; JRPG : vus et vaincus. |
| `partis` | JRPG : les héros partis du groupe, par id de personnage (pour qu'ils reviennent tels quels). |
| `badges`, `quetes`, `interrupteurs`, `faits`… | Le monde : un pack n'y touche pas. |

Le moteur fournit aussi `Collection` (`collection.js`) pour ranger les membres : `Collection.toutes(partie)`, `Collection.ranger(jeu, partie, c)` (équipe, sinon boîte), `Collection.enlever(partie, c)`, `Collection.voir(partie, id)` et `Collection.prendre(partie, id)` (encyclopédie).

### 2.3 Un membre

Un objet que seul le pack comprend, sauf deux champs que le moteur lit :

| Champ | Sens |
|---|---|
| `creature` | L'id de ce qu'il est : une espèce (Pokémon), un personnage (JRPG). Le moteur s'en sert pour la condition `membre` et l'encyclopédie. |
| `pv` | Ses PV : à 0, il est K.O. (le moteur le compte comme hors combat). |
| `surnom` | `''` ou le surnom donné par le joueur (menu Équipe › Surnom). |

Tout le reste (niveau, statistiques, attaques, équipement…) appartient au pack. Ce qui se calcule (nom, statistiques finales, sprites) n'est **pas** gardé dans le membre mais relu dans `jeu` : un changement fait dans Tafl se voit aussitôt dans les parties en cours.

### 2.4 La forme des menus

```js
{
  equipe: 'Groupe',          // le nom du menu Équipe
  dex: 'Bestiaire',          // le nom de l'encyclopédie
  dex_visible: true,         // l'encyclopédie est-elle dans le menu ?
  pc: 'Réserve',             // le nom du PC
  boite: 'Réserve',          // le nom d'une boîte
  places: 12, colonnes: 4,   // les places d'une boîte et les colonnes de sa grille
  forme_boites: 'liste',     // 'grille' ou 'liste'
  pages: ['infos', 'stats', 'equipement', 'competences'],             // les pages du résumé, dans l'ordre
  toutes_pages: [['infos', 'Infos'], ['stats', 'Statistiques'], …],   // toutes celles que la fiche sait faire
  dex_pris: 'Vaincus', dex_pris_un: 'vaincu',                         // les mots de l'encyclopédie
  dex_vide: 'Tu n\'as encore croisé aucun monstre…',
}
```

Dans Tafl (Données du jeu › Réglages › Menus du jeu), le créateur du jeu peut changer les noms, les places, la forme des boîtes et les pages ; un champ vide garde celui du pack.

### 2.5 Les capacités

| Capacité | Ce qu'elle ouvre | `pokemon` | `jrpg` |
|---|---|---|---|
| `capture` | Les balles, le compteur des captures | oui | non |
| `relacher` | Relâcher un membre depuis le PC | oui | non |
| `ev` | La commande `ecran_ev` | oui | non |
| `vendre` | Les boutiques achètent et vendent des membres | oui | non |
| `groupe` | La commande `groupe` (rejoindre, quitter) | non | oui |
| `tenir` | Menu Équipe › Faire tenir un objet | oui | non |

Saga cache ce que le pack ne sait pas faire ; Tafl cache les commandes, conditions et onglets de données qui n'ont pas de sens pour le pack choisi.

### 2.6 Une fiche

Ce que rendent `fiche` et `ficheEspece`, et que `menus.js` dessine :

```js
{
  titre: 'Mira',
  sousTitre: 'N.3 · Mage blanc',
  image: 'data:image/png;base64,…',                  // portrait, sprite ou image
  etiquettes: [{ texte: 'Mage blanc', couleur: '#f0f0f0' }],
  pages: [
    { id: 'infos', nom: 'Infos', texte: 'Un paragraphe (facultatif).', lignes: [
      { nom: 'PV', valeur: '30 / 30', detail: 'texte gris en dessous', barre: 1, couleur: '#4cd964' },
    ] },
  ],
}
```

Une ligne : `nom` et `valeur` sont obligatoires ; `detail` (texte plus petit), `barre` (de 0 à 1, une jauge) et `couleur` (la jauge ou une pastille) sont facultatifs. Une page de fiche de membre a un `id` (celui de `menus.toutes_pages`) ; une page d'encyclopédie n'en a pas besoin.

---

## 3. Parler au joueur : les objets `ui`

Un pack ne touche jamais au DOM. Il reçoit un objet `ui` dont toutes les fonctions qui attendent le joueur rendent une promesse.

### 3.1 Hors combat : `scripts.ui`

Reçu par `utiliserObjet`, `ecranEv`, `agirMembre` et `evolutionsEnAttente`.

| Fonction | Rend | Sens |
|---|---|---|
| `dire(texte)` | — | Une phrase du jeu dans la boîte de dialogue, attendue jusqu'à la touche Action. Un texte long est coupé en plusieurs boîtes. |
| `liste({ titre, items, annulable, entete, note, depart, saut, large })` | index ou `null` | Une liste où choisir. `items` : `[{ texte, detail, image, pv, etiquette, desactive }]` (`pv` : une jauge de 0 à 1). `null` : le joueur a fait Retour (si `annulable`, vrai par défaut). |
| `quantite({ titre, prix, max, monnaie, verbe })` | nombre (0 ou `null` : annulé) | Combien ? Gauche/droite ±1, haut/bas ±10. |
| `ev({ titre, stats, evs, apercu, parStat, total })` | les EV choisis, ou `null` | L'écran des EV de Pokémon. `stats` : `[{ id, nom }]`, `evs` : `{ id: valeur }`, `apercu(evs)` → `{ id: texte }`. |

### 3.2 L'écran duel (`ecran-combat.js`)

Pour les packs avec `ecran: 'duel'` : un contre un, l'adversaire en haut à droite, le joueur en bas à gauche. Les côtés s'appellent `'adversaire'` et `'joueur'`.

| Fonction | Rend | Sens |
|---|---|---|
| `ouvrir({ fond, dresseur })` | — | Ouvre l'écran avec son flash d'entrée. `dresseur` : `{ nom, portrait }` ou `null`. |
| `creature(cote, vue)` | — | Montre ou met à jour la créature d'un côté. `vue` : `{ nom, niveau, sexe, pv, pvMax, statut, xp (0 à 1), image, chromatique, types: [{ nom, couleur }] }`. |
| `pv(cote, pv, pvMax)` | — | La barre de PV glisse vers sa nouvelle valeur. |
| `xp(ratio, niveaux)` | — | La barre d'expérience se remplit (`niveaux` fois en entier d'abord). |
| `animer(cote, nom)` | — | `entree`, `sortie`, `touche`, `ko`, `monte`, `baisse`, `capture`, `secoue`, `attrape`, `sort`. |
| `evolution(cote, image)` | `true` si elle a évolué | L'animation d'évolution ; Retour l'arrête. |
| `message(texte, { qui })` | — | Un message, attendu jusqu'à la touche Action. |
| `menu(nom, dresseur)` | `'attaque'`, `'sac'`, `'equipe'` ou `'fuite'` | Le menu principal en grille 2 × 2. |
| `attaques([{ nom, type, couleur, pp, ppMax }])` | index ou `null` | Le choix d'une attaque. |
| `liste(titre, items, annulable)` | index ou `null` | Une liste (équipe, sac). `items` comme hors combat. |
| `fermer()` | — | Ferme l'écran. |

### 3.3 L'écran groupe (`ecran-groupe.js`)

Pour les packs avec `ecran: 'groupe'` : les ennemis à gauche, les héros à droite vus de côté (leur sprite de carte tourné vers la gauche), les messages et le tableau du groupe en bas. Les camps s'appellent `'heros'` et `'ennemis'` ; un combattant est désigné par `(camp, i)`, `i` étant sa place dans la liste donnée à `ouvrir`.

| Fonction | Rend | Sens |
|---|---|---|
| `ouvrir({ jeu, fond, heros, ennemis, boss })` | — | Ouvre l'écran. `heros` : `[vueHeros]`, `ennemis` : `[vueEnnemi]`, `boss` : l'écran prend son allure de combat de boss. |
| `heros(i, vueHeros)` | — | Met à jour un héros (tableau et sprite). |
| `ennemi(i, vueEnnemi)` | — | Met à jour un ennemi. |
| `message(texte, { attendre, fanfare })` | — | Un message. `attendre` : jusqu'à la touche Action ; sinon il s'écrit puis passe tout seul après un court instant. `fanfare` : le petit son de victoire. |
| `bandeau(texte)` | — | Le nom de l'action en cours, en haut. `''` le cache. |
| `commande(i, items)` | id ou `null` | L'ordre du héros `i` (il s'avance et brille). `items` : `[{ id, texte, icone, desactive }]` (`icone` : un nom de codicon). `null` : Retour. |
| `liste(titre, items, annulable)` | index ou `null` | Une liste (compétences, objets). `items` : `[{ texte, detail, image, couleur, desactive }]`. |
| `cible({ camp, tous, possibles, depart })` | index, `-1` (tous) ou `null` | Choisir une cible dans un camp. `possibles` : un booléen par combattant ; `tous` : toute la rangée d'un coup ; `depart` : la place où commence le curseur. |
| `animer(camp, i, nom)` | — | `avance`, `recule`, `attaque`, `touche`, `esquive`, `ko`, `ranime`, `soin`, `hausse`, `baisse`. |
| `nombre(camp, i, texte, sorte)` | — | Un texte qui monte au-dessus du combattant (n'attend pas). `sorte` : `degats`, `critique`, `soin`, `pm`, `rate`, `info`, `hausse`, `baisse` (sa couleur). |
| `effet(cibles, couleur)` | — | L'éclat d'un sort sur `[[camp, i], …]`. |
| `fermer()` | — | Ferme l'écran. |

Les vues :

```js
vueHeros  = { nom, apparence, pv, pvMax, pm, pmMax, statut: 'PSN SOM', ko }
vueEnnemi = { nom: 'Slime A', image, taille: 'petit' | 'moyen' | 'grand', boss, ko }
```

`apparence` est ce que `Sprites.vignette` sait dessiner (un personnage avec `sprite`, `tuile` ou `couleur`). L'écran suit les thèmes verre et pixel, le clavier, la manette et la souris (clic droit = Retour) ; le moteur lui passe les touches (`touche(t)`) et le temps (`avancer(dt)`), le pack n'a pas à s'en occuper.

---

## 4. Le pack JRPG

Les fichiers : `jrpg/heros.js` (héros, classes, statistiques, équipement, expérience), `jrpg/combat.js` (le combat), `jrpg/hors-combat.js` (sac, équipement, compétences hors combat), `jrpg/fiches.js` (fiches et Bestiaire), `jrpg/pack.js` (l'objet `pack`). Les données (`classes.json`, `monstres.json`, `groupes.json`, compétences, équipement) sont décrites dans `tuiles/FORMAT.md` › « Le pack JRPG ».

### 4.1 Un héros dans la partie

```js
{
  creature: 'mira',            // l'id du personnage (personnages.json)
  heros: true,
  surnom: '',
  classe: 'mage-blanc',        // un id de classes.json
  niveau: 3, xp: 40,
  pv: 37, pm: 13,
  statut: '',                  // seul 'poison' reste hors combat
  equipement: { arme: 'baton', bouclier: '', casque: '', armure: 'robe', accessoire: '' },
  competences: [],             // apprises autrement que par la classe
}
```

Le nom, le sprite et les portraits se lisent dans le personnage ; les statistiques se calculent à partir de la classe, du niveau et de l'équipement.

### 4.2 Les statistiques

Huit statistiques : `pv`, `pm`, `force`, `magie`, `defense`, `esprit`, `agilite`, `chance`.

- **Au niveau n** : `floor(stats[s] + gains[s] × (n − 1))`, avec `stats` et `gains` de la classe. Sans classe (ou une valeur absente) : stats 30/6/9/7/7/7/8/6 et gains 8/2/2/2/1,5/1,5/1,5/1 dans cet ordre.
- **Avec l'équipement** : on ajoute les `bonus` de chaque objet porté. PV, Force et Magie valent au moins 1, les autres au moins 0.
- **En combat** : chaque statistique de combat (`force`, `magie`, `defense`, `esprit`, `agilite`) a un cran de −4 à +4. Le multiplicateur est `(2 + e) / 2` en hausse et `2 / (2 − e)` en baisse : +1 = ×1,5, +2 = ×2, +4 = ×3, −1 = ×0,67, −2 = ×0,5, −4 = ×0,33.
- **Monstres** : leurs `stats` sont écrites telles quelles (pas de gains). Une valeur absente vaut celle d'un petit monstre : 20/0/7/5/5/4/6/3.

### 4.3 L'expérience

- Expérience totale pour être au niveau n : `courbe × 10 × (n − 1)²`, arrondi. `courbe` vient de `reglages.courbe_xp` : `rapide` 0,7, `normale` 1, `lente` 1,4. Exemple en courbe normale : niveau 2 = 10, niveau 5 = 160, niveau 10 = 810, niveau 50 = 24 010.
- Le niveau maximum est `reglages.niveau_max` (99 par défaut, de 1 à 999).
- Après une victoire, **chaque héros debout** reçoit toute l'expérience du groupe de monstres (la somme de leurs `xp`), sans partage. Les héros K.O. ne reçoivent rien.
- À chaque niveau, les PV et PM gagnés s'ajoutent aux actuels (un héros K.O. le reste), et le héros apprend les compétences de sa classe dont le `niveau` est atteint.

### 4.4 Les formules du combat

Ces formules sont de petites fonctions exportées par `JrpgCombat` (`formuleDegats`, `formuleSoin`, `formuleTouche`, `formuleCritique`, `formuleFuite`). Depuis Saga 0.12, un script du jeu peut remplacer chacune d'elles (règles maison, voir la [partie 7](#7-les-scripts-du-jeu-et-les-règles-maison-saga-012)).

**Dégâts** (attaque de base et compétences avec `puissance` > 0) :

```
A, D   = Force et Défense (physique), ou Magie et Esprit (spéciale), crans compris
base   = A × A / (A + D) × 1,6 × puissance / 100
dégâts = base × élément × (critique ? 2 : 1) × (la cible se défend ? ½ : 1) × hasard(0,9 à 1,1)
```

Arrondi, au moins 1, sauf si la cible est immunisée à l'élément (0). Exemple : Force 20 contre Défense 10, puissance 100 → 20 × 20 / 30 × 1,6 ≈ 21.

**Élément** (contre un monstre) : ×2 si l'élément est dans ses `faiblesses`, ×½ dans ses `resistances`, ×0 dans ses `immunites`, sinon ×1. L'attaque de base prend l'élément de l'arme. Les héros n'ont pas de faiblesse.

**Toucher** (en %) : `precision − max(0, (Agilité de la cible − Agilité de l'attaquant) / 2)`, divisé par deux si l'attaquant est aveuglé (`cecite`, coups physiques seulement). Une compétence magique (`speciale`) à 100 de précision ne rate jamais. L'attaque de base a 95 de précision.

**Critique** (physique seulement) : `3 + Chance / 4 + 10 × critique` en %, où `critique` est le nombre de paliers de la compétence. Dégâts ×2.

**Soin** : `(soin + Magie du lanceur) × hasard(0,9 à 1,1)`, arrondi, au moins 1. `ranime` sans `soin` rend un quart des PV maximum.

**Ordre du tour** : tous les combattants debout, triés par `Agilité × hasard(0,75 à 1,25)`, du plus grand au plus petit.

**Fuite** (en %) : `50 + 2 × (Agilité moyenne des héros debout − Agilité moyenne des monstres debout) + 10 × essais ratés`, bornée entre 5 et 95. Une fuite ratée fait perdre le tour à tout le groupe. Un groupe avec `fuite: false` (un boss) interdit la fuite.

**Défendre** : jusqu'à la fin du tour, les dégâts reçus sont divisés par deux.

### 4.5 Les statuts

| Statut | Effet | Durée |
|---|---|---|
| `poison` | Perd 1/12 de ses PV max (au moins 1) à la fin de chaque tour. | Jusqu'à guérison ; **reste après le combat**. |
| `sommeil` | Ne peut pas agir. Un coup reçu le réveille une fois sur deux. | 2 à 4 tours. |
| `paralysie` | Ne peut pas agir. | 1 à 3 tours. |
| `silence` | Plus de compétences `speciale`. | Jusqu'à la fin du combat. |
| `cecite` | Deux fois moins de chances de toucher en physique. | Jusqu'à la fin du combat. |

Le tour où un héros se réveille ou se remet de la paralysie, il ne fait rien d'autre. Un monstre `boss` est toujours immunisé contre `sommeil` et `paralysie`, et `statuts_immunises` peut en ajouter d'autres. À la fin du combat, seul le poison reste.

### 4.6 Un tour de combat

1. **Les ordres** : le joueur donne un ordre à chaque héros qui peut agir (Attaquer, Compétences, Objet, Défendre, Fuir) ; Retour revient au héros d'avant. Les objets déjà promis à un héros ne sont plus proposés aux suivants.
2. **Les monstres** choisissent : l'attaque de base (poids `poids_attaque`, 50 par défaut) ou une de leurs `competences` (poids `poids`, 10 par défaut) qu'ils peuvent payer. Un soin ne sert que si un allié est sous la moitié de ses PV, un `ranime` que s'il y a un K.O. Leur cible : un héros au hasard, ou le plus blessé une fois sur quatre.
3. **Chacun agit** dans l'ordre du tour. Si sa cible est tombée entre-temps, il en prend une autre (un ennemi au hasard, l'allié le plus blessé).
4. **Fin du tour** : le poison, puis la garde tombe.
5. **Fin du combat** :
   - **Victoire** : l'expérience, l'or (somme des `or`), le butin (chaque monstre, chaque objet de son `butin` avec sa `chance` en %), `compteurs.monstres_vaincus`, et `dex.pris` pour chaque monstre vaincu (tous ceux croisés sont dans `dex.vus` dès le début).
   - **Défaite** : le groupe perd la moitié de son or ; le moteur soigne ensuite tout le monde et ramène le joueur au dernier soin.

### 4.7 Hors combat

- **Objets** : `soin` (PV), `soin_pm` (PM), `rappel` (ranime avec `valeur` % des PV), `soin_statut`, `repousse`. `valeur` 9999 = tout.
- **Menu Groupe › Équipement** : changer ce que porte un héros, place par place ; l'objet porté quitte le sac, l'ancien y revient. Seuls les objets de la bonne `place` et des bonnes `classes` sont proposés, avec l'écart de statistiques.
- **Menu Groupe › Compétences** : lancer une compétence de soin (`soin`, `ranime` ou `guerit`, cible `allie`, `equipe` ou `soi`) en payant ses PM.
- **Commande `groupe`** : rejoindre (dans le groupe, sinon la Réserve) ou quitter (le héros est gardé dans `partie.partis`). Le dernier héros du groupe ne peut pas partir.

---

## 5. Le pack Pokémon

Ses formules sont celles des jeux officiels (3e génération et suivantes) : statistiques avec natures, IV et EV, dégâts avec STAB et table des types, captures, évolutions, amitié. Elles sont commentées dans `pokemon/creatures.js` et `pokemon/combat.js`.

Une créature dans la partie :

```js
{
  creature: 'ratou', surnom: '', niveau: 5, xp: 135, pv: 19, statut: '', sommeil: 0,
  nature: 'hardi', talent: 'fuite', sexe: 'm', chromatique: false,
  ivs: { pv, attaque, defense, att_spe, def_spe, vitesse }, evs: { … },
  attaques: [{ id: 'charge', pp: 35, ppMax: 35 }],
  amitie: 70,     // Saga 0.7
  objet: '',      // l'objet tenu, Saga 0.7
}
```

---

## 6. Écrire un pack : un exemple minimal

Le plus petit pack utile : des « duellistes » (les personnages du jeu) qui se battent à pile ou face. Il montre ce qui est obligatoire, et rien d'autre.

```js
// regles/pile-ou-face/pack.js
const PileOuFace = (() => {
  const nomDe = (jeu, c) => c.surnom || jeu.personnages.get(c.creature)?.nom || c.creature;
  const PV = 3;

  const pack = {
    nom: 'pile-ou-face',
    ecran: 'duel',
    capacites: {},          // ni capture, ni EV, ni vente, ni groupe
    menus: {
      equipe: 'Duellistes', dex: 'Adversaires', dex_visible: true, pc: 'Banc', boite: 'Banc',
      places: 10, colonnes: 5, forme_boites: 'liste',
      pages: ['infos'], toutes_pages: [['infos', 'Infos']],
      dex_pris: 'Battus', dex_pris_un: 'battu', dex_vide: 'Personne pour l\'instant.',
    },

    existe: (jeu, id) => jeu.personnages.has(id),
    creer: (jeu, id) => (jeu.personnages.has(id) ? { creature: id, surnom: '', niveau: 1, pv: PV } : null),
    completer: (jeu, c) => (c && jeu.personnages.has(c.creature) ? { surnom: '', niveau: 1, ...c, pv: Math.max(0, Math.min(PV, Number(c.pv) || 0)) } : null),
    soigner: (jeu, c) => { c.pv = PV; },
    resume: (jeu, c) => ({ nom: nomDe(jeu, c), niveau: c.niveau, pv: c.pv, pvMax: PV, statut: '', image: '', apparence: jeu.personnages.get(c.creature) }),

    // Les zones de rencontres de ce pack listent des personnages : [{ personnage, chance }].
    rencontre(jeu, zone) {
      const l = (zone.rencontres || []).filter((r) => jeu.personnages.has(r.personnage));
      return l.length ? { sauvage: pack.creer(jeu, l[Math.floor(Math.random() * l.length)].personnage) } : null;
    },

    async combattre({ jeu, partie, ui, sauvage, fond }) {
      const moi = partie.equipe.find((c) => c.pv > 0);
      if (!moi || !sauvage) return { issue: 'fuite' };
      const vue = (c) => ({ nom: nomDe(jeu, c), niveau: c.niveau, pv: c.pv, pvMax: PV, statut: '', xp: 0, image: '', types: [] });
      partie.dex.vus[sauvage.creature] = true;
      await ui.ouvrir({ fond });
      ui.creature('adversaire', vue(sauvage)); await ui.animer('adversaire', 'entree');
      ui.creature('joueur', vue(moi)); await ui.animer('joueur', 'entree');
      while (moi.pv > 0 && sauvage.pv > 0) {
        const choix = await ui.menu(nomDe(jeu, moi), false);
        if (choix === 'fuite') { await ui.message('Tu files !'); ui.fermer(); return { issue: 'fuite' }; }
        if (choix !== 'attaque') { await ui.message('Pas ici !'); continue; }
        const perdant = Math.random() < 0.5 ? sauvage : moi;
        perdant.pv--;
        const cote = perdant === moi ? 'joueur' : 'adversaire';
        await ui.animer(cote, 'touche');
        await ui.pv(cote, perdant.pv, PV);
        await ui.message(`${perdant === moi ? 'Face' : 'Pile'} ! ${nomDe(jeu, perdant)} perd un point.`);
      }
      const gagne = moi.pv > 0;
      if (gagne) partie.dex.pris[sauvage.creature] = true;
      await ui.message(gagne ? 'Gagné !' : 'Perdu…');
      ui.fermer();
      return { issue: gagne ? 'victoire' : 'defaite' };
    },

    utilisable: () => false,
    utiliserObjet: async () => false,
    ecranEv: async ({ ui }) => { await ui.dire('Pas d\'EV ici.'); },
    prixCreature: () => 0,

    fiche: (jeu, c) => ({
      titre: nomDe(jeu, c), sousTitre: `N.${c.niveau}`, image: '', etiquettes: [],
      pages: [{ id: 'infos', nom: 'Infos', lignes: [{ nom: 'PV', valeur: `${c.pv} / ${PV}`, barre: c.pv / PV }] }],
    }),
    dex: (jeu) => ({ nom: 'Adversaires', especes: [...jeu.personnages.values()].map((p, i) => ({ id: p.id, numero: `N° ${i + 1}`, nom: p.nom, image: '' })) }),
    ficheEspece: (jeu, id, { pris }) => {
      const p = jeu.personnages.get(id);
      return p ? { titre: p.nom, sousTitre: pris ? 'Battu' : 'Vu', image: '', etiquettes: [], pages: [{ nom: 'Infos', lignes: [], texte: pris ? 'Tu l\'as battu.' : 'Tu l\'as croisé.' }] } : null;
    },
  };
  return { pack };
})();
```

Pour le brancher aujourd'hui (avant les scripts) :

1. Ajouter le fichier à `moteur/renderer/index.html`, avant `regles.js`.
2. L'ajouter à `PACKS` dans `regles.js` : `{ pokemon, jrpg: Jrpg.pack, 'pile-ou-face': PileOuFace.pack }`.
3. Dans Tafl, l'ajouter à la liste `REGLES` de `tuiles/renderer/donnees.js` (son nom dans Réglages › Règles), et dire quels onglets et commandes il montre (`packs` sur les onglets de `ONGLETS` et les commandes de `events.js`).

Les points d'attention :

- **Ne rien garder de calculé dans un membre** : relire les données du jeu à chaque fois, pour que Tafl et les vieilles sauvegardes restent d'accord.
- **`completer` doit tout accepter** : une sauvegarde peut venir d'une ancienne version, d'un autre pack ou avoir été modifiée à la main. Rendre `null` plutôt que planter.
- **Toujours fermer l'écran** (`ui.fermer()`) avant de rendre l'issue d'un combat.
- **Pas de DOM, pas de `window`, pas de disque** dans un pack : seulement `jeu`, `partie`, `ui` et les aides du moteur (`Collection`, `Sprites.vignette`).

---

## 7. Les scripts du jeu et les règles maison (Saga 0.12)

Depuis Tafl 0.31 et Saga 0.12, un jeu peut contenir ses propres fichiers JavaScript (`scripts/*.js`, écrits dans Tafl, espace Événements › Scripts JS). Saga les charge dans un **bac à sable** (`commun/bac-a-sable.js`) : un Web Worker fermé, sans fichiers, réseau ni page, arrêté s'il calcule trop longtemps. Tout ce qu'un script peut faire est dans `tuiles/SCRIPTS.md` (copié dans chaque dossier de jeu). Ce qui concerne les packs :

### 7.1 Les formules remplaçables : `Maison.formule`

Un pack n'appelle jamais une formule remplaçable directement, mais par la façade `Maison` (`moteur/scripts-js.js`) :

```js
const degats = await Maison.formule('degats', { A, D, puissance, element, critique, defend, physique }, formuleDegats);
```

- `Maison.formule(nom, valeurs, formuleDuPack)` calcule d'abord `normal = formuleDuPack(valeurs)` ;
- sans script qui déclare `formule(nom, …)`, ou si la formule est coupée (`reglages.scripts.formules_coupees`), elle rend `normal` ;
- sinon elle appelle le script avec `{ ...valeurs, normal }` et rend son nombre ; si le script rend autre chose qu'un nombre, a une erreur ou est arrêté, elle rend `normal` et l'erreur est signalée ;
- elle rend toujours une promesse quand un script existe : la fonction du pack qui l'appelle doit donc être `async` (les combats le sont déjà).

Le pack reste responsable des bornes : arrondir, au moins 1 PV de dégâts, une chance entre 0 et 100. Les valeurs doivent être simples (nombres, booléens, textes) : elles traversent le bac à sable en copie.

Les formules de chaque pack sont déclarées dans `BacASable.FORMULES` (nom, ce qu'elles rendent, leurs valeurs, un exemple pour le bouton Essayer de Tafl) : c'est cette liste que Tafl montre dans l'éditeur (complétion), dans Réglages › Règles maison, et que le vérificateur utilise.

| Pack | Formules |
|---|---|
| `jrpg` | `degats`, `soin` (en combat et hors combat), `touche`, `critique`, `fuite`, `experience` (voir 4.4 et 4.3) |
| `jdr` | `attaque`, `degats`, `critique`, `test`, `sauvegarde`, `initiative`, `pv_niveau`, `soin`, `experience` (voir 8.6) |
| `pokemon` | `degats`, `capture` (une chance en % ; Saga en tire les secousses : seuil `65536 × (p / 100)^¼` par secousse), `fuite` (en %), `experience` |

**Un nouveau pack** qui veut des règles maison : ajouter ses formules à `BacASable.FORMULES` sous l'id du pack, et les appeler par `Maison.formule`. Une formule qui n'y est pas ne peut pas être remplacée (Tafl prévient si un script en déclare une).

### 7.2 Pourquoi les packs étaient déjà prêts

- un pack n'utilise que `jeu`, `partie`, `ui` et quelques aides : rien qu'un bac à sable ne puisse prêter ;
- tout ce qui attend est une promesse, ce qui marche à travers un worker ;
- les formules sont de petites fonctions pures, remplaçables une par une ;
- la partie est un objet JSON simple : un script en reçoit une copie, et ses changements passent par des commandes (FORMAT.md › Commandes) que le moteur joue. Rien ne change la partie en dehors du moteur, ce qui servira au multijoueur.

### 7.3 Pas encore

- **Un pack entier écrit en script** (avec le pack TTRPG) : un objet qui suit le contrat de la [partie 1](#1-le-contrat-dun-pack), déclaré par un script et choisi dans Réglages › Règles. Il faudra prêter `ui` à travers le bac à sable et vérifier dans Tafl qu'il a toutes les fonctions obligatoires.
- **Des comportements** pour les genres en temps réel (machines à états des personnages et des ennemis).

---

## 8. Le pack JDR (Saga 0.13)

Le dossier `regles/jdr/` : un jeu de rôle sur table façon D&D 5e (SRD 5.1, en français), pour accompagner de vraies parties autour d'une table. Ses données sont décrites dans `tuiles/FORMAT.md` › « Le pack JDR ». Le pack est découpé en petits fichiers, chargés dans cet ordre :

| Fichier | Rôle |
|---|---|
| `base.js` | Les listes par défaut (6 caractéristiques, 18 compétences, 15 états), les tables de la 5e (bonus de maîtrise, XP par niveau et par FP, emplacements de sorts), les règles maison avec leurs défauts (`regles(jeu)`), l'affichage des distances et de la monnaie. |
| `des.js` | Tous les dés du pack, tirés depuis une graine gardée dans la partie (`partie.jdr.graine`), et le journal des jets (`partie.jdr.journal`, les 200 derniers). |
| `personnage.js` | Un personnage et tout ce qui s'en calcule : caractéristiques, bonus, CA, PV max, sorts, emplacements, repos, montée de niveau. Rien de calculé n'est gardé dans la partie. |
| `tests.js` | Les tests, sauvegardes, tests de groupe et tests opposés, hors combat comme en combat. |
| `combat.js` | Le combat au d20 sur l'écran de groupe. |
| `hors-combat.js` | Le sac, l'équipement, les sorts hors combat, les repos, la montée de niveau, le journal des jets. |
| `creation.js` | La création de personnage (neuf étapes). |
| `fiches.js` | La fiche du menu Groupe, le Bestiaire et ce qu'un script lit d'un personnage. |
| `pack.js` | L'objet que la façade attend, plus les commandes et conditions du pack. |

### 8.1 Les ajouts au contrat (facultatifs pour tous les packs)

Le pack JDR a demandé six nouveaux champs facultatifs. La façade les rend sans effet pour un pack qui ne les a pas.

| Champ | Ce que le moteur en fait |
|---|---|
| `commandes` | `{ type: async ({ jeu, partie, ui, c, jouer, narrer, ranger }) → résultat }`. Les commandes d'événement propres au pack. `scripts.js` demande d'abord `Regles.commande(jeu, c.type)` ; `jouer(liste)` joue une branche (`reussi`, `rate`), `narrer(texte)` dit une phrase, `ranger(membre)` le met dans l'équipe ou la Réserve. Le résultat, un objet simple, revient à un script JS (`saga.test(…)`). |
| `condition(jeu, cond, partie)` | Vrai, faux, ou `undefined` pour une condition que le pack ne connaît pas (le monde prend alors la sienne). |
| `debut({ jeu, partie, ui, ranger })` | Au début d'une nouvelle partie, dès que le joueur est libre : ici, la création des personnages. Un test rapide de Tafl qui a déjà mis un groupe la saute. |
| `actionsPause(jeu)` → `[[id, nom, icône]]` | Des choix en plus dans le menu de pause (JDR : « Jets de dés », « Se reposer »). |
| `agirPause({ jeu, partie, ui, id })` | Fait l'un de ces choix. |
| `pourScript(jeu, partie)` → `[fiche]` | Ce qu'un script JS lit de chaque membre (`saga.fiche(i)`, `saga.fiches`). Des valeurs simples, déjà calculées. |

`scripts.ui` (3.1) gagne aussi `texte({ titre, valeur, max })` (taper un texte : le nom du personnage), `repartir({ … })` (répartir des valeurs, l'achat de points) et `des({ titre, lignes })` (le plateau de dés, `des-ecran.js`, qui montre des jets **déjà tirés** et ne décide rien). Sur l'écran groupe, une vue de héros peut donner `info` (un texte à la place des PM : le pack JDR y met la CA).

### 8.2 Un personnage dans la partie

```js
{
  creature: 'aventurier', heros: true, jdr: true, nom: 'Thorgrim', joueur: '',
  origine: 'nain', classe: 'guerrier', niveau: 1, xp: 0,
  carac: { for: 16, dex: 12, con: 15, int: 8, sag: 13, cha: 10 },   // sans le bonus d'origine
  competences: ['athletisme', 'intimidation'], expertises: [],
  pv: 13, pv_temp: 0, pv_niveaux: [],      // les PV gagnés à chaque niveau après le 1er (sans la Con)
  des_vie: 1,                               // les dés de vie qui restent
  equipement: { arme: 'hache-d-armes', seconde: 'bouclier', armure: 'cotte-de-mailles' },
  sorts: [], emplacements: { 1: 0 }, pacte: 0, ressources: { second_souffle: 0 },
  etats: [], mort: { succes: 0, echecs: 0 }, stable: false, mort_definitive: false,
}
```

`creature` est le personnage de `personnages.json` qui prête son apparence. `joueur` dira plus tard à quel ami appartient la fiche (multijoueur) : vide pour l'instant.

### 8.3 Les calculs de base

- **Modificateur** d'une caractéristique : ⌊(valeur − 10) / 2⌋. **Bonus de maîtrise** : +2 aux niveaux 1 à 4, puis +1 tous les 4 niveaux (+6 au 17).
- **Test** : d20 + modificateur (+ maîtrise si la compétence est maîtrisée, deux fois avec l'expertise) contre un DD. **Avantage / désavantage** : 2d20, le meilleur / le pire ; les deux ensemble s'annulent.
- **CA** : 10 + Dex sans armure ; armure légère : sa CA + Dex ; intermédiaire : + Dex (2 au plus) ; lourde : sa CA ; + le bouclier ; Défense sans armure du barbare (10 + Dex + Con) ou du moine (10 + Dex + Sag) ; + Style défense.
- **PV max** : le maximum du dé de vie + Con au niveau 1, puis chaque niveau ce que donne `pv_niveau` (moyenne, jet ou choix) + Con (au moins 1), plus `pv_bonus_niveau` de l'origine.
- **Sorts** : DD = 8 + maîtrise + modificateur de magie ; bonus d'attaque de sort = maîtrise + modificateur. Les emplacements suivent la table de la 5e selon le niveau de lanceur (complet : son niveau ; demi : la moitié, à partir du niveau 2) ; la magie de pacte a sa propre table.
- **Perception passive** : 10 + bonus de Perception (condition `jdr_perception`).
- **XP** : la table de la 5e (300 pour le niveau 2, 900 pour le 3…, 355 000 pour le 20). Le niveau ne monte pas tout seul : le joueur choisit « Monter de niveau » dans le menu Groupe (PV, aptitudes, sorts, et +2 à répartir aux niveaux d'`ameliorations`).

### 8.4 Un combat

1. **L'initiative** : d20 + Dex pour chacun ; on joue du plus grand au plus petit.
2. **À son tour**, un héros a une action (Attaquer, Sort, Objet, Esquiver, Aider, Se cacher, Fuir) puis, s'il en a une, une action bonus (attaque de la main gauche, Second souffle, Rage, Ruse, sort à `action: "bonus"`, potion si `potion_bonus`).
3. **Une attaque** : d20 + bonus contre la CA. Un 20 naturel est un **critique** (seuil abaissé par `critique_ameliore`) : les dés de dégâts sont lancés deux fois (`critiques: "doubler"`) ou valent leur maximum plus un jet (`"max"`). Un 1 naturel rate toujours (`echec_critique`). Avec `tenaille`, avantage au contact contre une cible qu'un allié a déjà frappée au contact ce tour-ci.
4. **Les dégâts** : dés + modificateur, puis résistance (×½), vulnérabilité (×2) ou immunité (×0) de la cible selon le type.
5. **Un sort** : un emplacement dépensé (sauf un sort mineur), puis un jet d'attaque de sort, une sauvegarde contre le DD, ou un effet sûr (FORMAT.md › `sorts.json`). La concentration s'arrête avec un autre sort à concentration, ou une sauvegarde de Constitution ratée (DD 10 ou la moitié des dégâts) quand le lanceur est touché.
6. **Les monstres** choisissent une de leurs `actions` (selon `poids`, les `recharge` en plus), ou leur multiattaque.
7. **À 0 PV**, un héros tombe. Avec `morts: "jets"`, il fait un jet contre la mort au début de son tour (10 ou plus : une réussite ; 1 : deux échecs ; 20 : il se relève avec 1 PV) : 3 réussites, il est stable ; 3 échecs, il meurt. Frappé à terre : un échec (deux sur un critique). Des dégâts qui dépassent ses PV max d'un coup le tuent. Avec `"ko"`, il reste simplement K.O. jusqu'à la fin du combat.
8. **Fuir** : un test de groupe d'Acrobaties contre 10 + la meilleure Dex des monstres, plus facile de 2 à chaque essai raté. Impossible si le groupe a `fuite: false`.
9. **La fin** : tout le groupe à terre = défaite. Victoire : l'XP des monstres (leur `xp`, sinon celle de leur FP) partagée entre les héros vivants, leur or et leur butin, le Bestiaire. Les PV, ressources et emplacements dépensés restent dépensés jusqu'au prochain repos.

Tout ce qui ne vit que le temps du combat (l'initiative, le tour, les états de combat, les bonus des sorts) est rangé à part de l'écran : le futur mode « table » (pions, brouillard de guerre) reprendra ces règles telles quelles.

### 8.5 Hors combat

- **Repos court** : chacun peut dépenser ses dés de vie (dé + Con chacun) ; Second souffle, Fougue, Conduit divin, les points de ki et la magie de pacte reviennent. **Repos long** : tous les PV, la moitié des dés de vie (au moins 1), tous les emplacements et toutes les aptitudes ; les états partent (sauf l'épuisement) et les héros tombés se relèvent. La durée montrée suit `repos`.
- **Le journal des jets** (menu de pause › Jets de dés) : les derniers jets, et une barre pour lancer n'importe quelle formule (`2d6+3`) devant toute la table.
- **Le MJ décide** (`mj_decide`) : après chaque test d'événement, une liste « Garder le jet / Forcer la réussite / Forcer l'échec ». Une vraie table garde ainsi le dernier mot.

### 8.6 Les formules remplaçables

| Formule | Rend | Valeurs |
|---|---|---|
| `attaque` | le bonus ajouté au d20 d'une attaque | `naturel`, `bonus`, `magie`, `sort`, `distance` |
| `degats` | les PV perdus, avant les résistances | `des`, `mod`, `critique`, `type`, `sort` |
| `critique` | le d20 naturel à partir duquel c'est un critique | `niveau`, `classe` |
| `test` | le total d'un test | `naturel`, `bonus`, `dd`, `competence`, `carac`, `maitrise` |
| `sauvegarde` | le total d'une sauvegarde | `naturel`, `bonus`, `dd`, `carac`, `maitrise` |
| `initiative` | le total d'initiative | `naturel`, `dex` |
| `pv_niveau` | les PV gagnés en montant (sans la Con) | `de`, `con`, `jet`, `niveau` |
| `soin` | les PV rendus par un sort | `des`, `mod`, `sort` |
| `experience` | l'XP de chaque héros après une victoire | `total`, `heros` |

Toutes ont aussi `normal`. Elles sont décrites pour Tafl dans `BacASable.FORMULES.jdr`.

### 8.7 Prévu pour la suite

Le pack reste pur (une partie en entrée, une partie en sortie, les dés depuis la graine) pour le mode « table » et le multijoueur : `cache` dans une ligne du journal (un jet caché du MJ, toujours faux pour l'instant) et `joueur` sur chaque fiche sont déjà là.
