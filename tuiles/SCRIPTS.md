# Les scripts JS d'un jeu (Tafl 0.31, Saga 0.12 ; pack JDR : Tafl 0.32, Saga 0.13)

Les blocs des événements (Dire, Choix, Si…) suffisent pour la plupart des histoires. Un **script JS**
sert quand il faut plus : lancer des dés, calculer, retenir des nombres, changer une règle du pack
(« règles maison »), ou réagir à un moment du jeu (une nouvelle partie, une carte, après un combat).

Ce fichier est copié dans chaque dossier de jeu à l'enregistrement. Le format des fichiers est dans
FORMAT.md (à côté), les packs de règles dans `moteur/renderer/moteur/regles/REGLES.md`.

## Où ils vivent

- Dans Tafl : espace **Événements** (Alt+4), section **Scripts JS** sous la liste des événements.
  Le **+** propose des modèles adaptés au pack du jeu. Chaque script s'ouvre dans un éditeur de code
  (complétion automatique de toute l'API, erreurs soulignées), avec **Essayer** (Ctrl+Entrée).
- Sur le disque : `scripts/<nom>.js` dans le dossier du jeu, listés dans `jeu.json` (`scripts`).
  Un script **coupé** (case Actif décochée) reste dans le dossier mais Saga ne le charge pas.
- Un script se lit une fois, au lancement du jeu. Il **déclare** ce qu'il apporte avec trois
  fonctions : `commande()`, `formule()` et `quand()`. Le reste du fichier (variables, fonctions
  d'aide) est à lui, partagé par tout ce qu'il déclare.

## La boîte fermée (bac à sable)

Les scripts tournent à part, dans un *Web Worker* (`commun/bac-a-sable.js`) :

- pas de fichiers, pas de réseau, pas de page, pas de `setTimeout` : un script ne peut rien abîmer ;
- il ne touche **jamais** la partie directement : il **demande** (`saga.donner(…)`, `saga.dire(…)`)
  et Saga joue la demande comme le bloc correspondant. C'est ce qui rendra le multijoueur possible :
  l'hôte de la partie décide, les scripts ne font que proposer ;
- un script qui calcule plus de 0,6 s sans rendre la main (une boucle sans fin) est **arrêté** ; le
  jeu continue, et l'erreur est dite ;
- une erreur dans un script ne casse jamais le jeu : dans Tafl et en test elle s'affiche avec le
  fichier et la ligne ; dans un jeu exporté elle est notée dans la console ;
- le hasard passe par `des` (et `Math.random`, qui est le même) : il part d'une **graine** gardée
  dans la sauvegarde. Recharger une sauvegarde rejoue les mêmes dés : pas de « sauvegarde puis
  réessaie jusqu'au critique ».

Les fonctions des scripts peuvent être `async` : tout ce qui parle au joueur ou change le jeu rend
une promesse qu'on attend avec `await`.

## 1. `commande(nom, reglages, fn)` : une commande pour le bloc Script

```js
commande('cadeau', {
  objet: { type: 'objet', nom: 'Objet offert', defaut: 'potion' },
  nombre: { type: 'nombre', nom: 'Combien', defaut: 1, min: 1, max: 99 },
}, async (saga, params) => {
  if (saga.local()) return saga.dire('Reviens plus tard, {joueur} !', '@evenement');
  const r = await saga.choisir(['Oui, merci !', 'Non, ça va']);
  if (r === 0) {
    await saga.donner(params.objet, params.nombre);
    await saga.local(true);
  }
});
```

- `nom` : minuscules, chiffres, `-` ou `_`. Deux scripts ne peuvent pas déclarer la même commande.
- `reglages` (facultatif) : ce que Tafl demande dans le formulaire du bloc **Script JS**. Chaque
  réglage : `{ type, nom, defaut, choix, min, max, aide }`. Types : `nombre`, `texte`, `oui_non`,
  `liste` (avec `choix: ['a', 'b']`), et des listes du jeu : `objet`, `personnage`, `carte`,
  `interrupteur`, `variable`, `quete`, `creature`. Un réglage peut aussi être une simple valeur
  (`{ degats: 10 }` = un nombre, 10 par défaut).
- `fn(saga, params)` : ce que fait la commande. `params` contient les réglages choisis dans le bloc
  (ou leur défaut).
- Dans un événement : bloc **Script JS** (groupe Scripts), choisir la commande, régler. Le script
  de l'événement attend la fin de la commande avant de passer au bloc suivant. `saga.fin()` arrête
  aussi le script de l'événement (comme le bloc « Arrêter le script ici »).
- En JSON (FORMAT.md) : `{ "type": "script", "nom": "cadeau", "params": { "objet": "potion" } }`.

## 2. `formule(nom, fn)` : une règle maison

Remplace un calcul du pack de règles. La fonction reçoit les valeurs du calcul et `des`, et rend un
nombre. `valeurs.normal` est toujours le résultat du pack : une règle maison peut simplement
l'ajuster.

```js
// Les coups critiques font le triple (le pack JRPG fait le double).
formule('degats', (v) => (v.critique ? Math.round(v.normal * 1.5) : v.normal));

// Fuir est toujours possible au troisième essai.
formule('fuite', (v) => (v.essais >= 2 ? 100 : v.normal));
```

Une formule doit être rapide et **sans effet** : pas de `saga` ici, seulement un calcul. Si elle
rend autre chose qu'un nombre, ou a une erreur, Saga garde la formule du pack et le dit.
Dans Tafl, **Données › Réglages › Règles maison** liste les formules remplacées et permet d'en
couper une sans toucher au script (`reglages.scripts.formules_coupees`).

### Pack JDR (`reglages.regles = "jdr"`, Saga 0.13)

| Formule | Rend | Valeurs |
|---|---|---|
| `attaque` | le bonus ajouté au d20 d'une attaque | `naturel` (le d20), `bonus` (modificateur + maîtrise + magie de l'arme), `magie`, `sort`, `distance` |
| `degats` | PV perdus, avant les résistances (au moins 1 pour une arme) | `des` (déjà doublés sur un critique), `mod`, `critique`, `type` (`"tranchant"`, `"feu"`…), `sort` |
| `critique` | le d20 naturel à partir duquel c'est un critique (20) | `niveau` (0 pour un monstre), `classe` |
| `test` | le total d'un test, comparé au DD | `naturel`, `bonus`, `dd`, `competence`, `carac`, `maitrise` |
| `sauvegarde` | le total d'une sauvegarde | `naturel`, `bonus`, `dd`, `carac`, `maitrise` |
| `initiative` | le total d'initiative | `naturel`, `dex` |
| `pv_niveau` | PV gagnés en montant de niveau, sans la Con | `de` (6 à 12), `con`, `jet` (0 si on prend la moyenne), `niveau` |
| `soin` | PV rendus par un sort | `des`, `mod`, `sort` (son id) |
| `experience` | XP de chaque héros après une victoire | `total`, `heros` |

```js
// Règle maison : un 1 au d20 d'un test compte comme un 5 (« pas de catastrophe »).
formule('test', (v) => (v.naturel === 1 ? 5 + v.bonus : v.normal));
// Les critiques font le maximum des dés en plus.
formule('degats', (v) => (v.critique ? v.normal + Math.round(v.des / 2) : v.normal));
```

### Pack action (`reglages.regles = "action"`, Saga 1.12)

| Formule | Rend | Valeurs |
|---|---|---|
| `degats` | PV perdus par un coup (épée, coup d'un ennemi ou contact ; au moins 0) | `A` (attaque de celui qui frappe), `D` (défense de celui qui est touché), `puissance` (1 pour l'épée et le contact) |

### Pack JRPG (`reglages.regles = "jrpg"`)

| Formule | Rend | Valeurs |
|---|---|---|
| `degats` | PV perdus (au moins 1, sauf immunité) | `A`, `D`, `puissance`, `element` (multiplicateur : 2 faiblesse, 0,5 résistance, 0 immunité), `critique`, `defend`, `physique` |
| `soin` | PV rendus | `soin` (puissance de soin), `magie` |
| `touche` | chance de toucher, en % | `precision`, `agiliteA`, `agiliteD`, `aveugle` |
| `critique` | chance de critique, en % | `chance`, `paliers` |
| `fuite` | chance de fuir, en % | `agiliteHeros`, `agiliteMonstres`, `essais` (ratés) |
| `experience` | XP pour chaque héros debout | `total`, `heros` |

### Pack Pokémon (par défaut)

| Formule | Rend | Valeurs |
|---|---|---|
| `degats` | PV perdus (au moins 1) | `niveau`, `A`, `D`, `puissance`, `multiplicateur` (efficacité × STAB × critique × brûlure), `critique` |
| `capture` | chance (en %) que la créature reste dans la balle | `pv`, `pvMax`, `taux`, `balle`, `statut` |
| `fuite` | chance de fuir, en % | `vitesse`, `vitesseAdverse`, `essais` |
| `experience` | XP de chaque créature qui a combattu | `base`, `niveau`, `dresseur`, `participants` |

Toutes ont aussi `normal`. Une chance en % est bornée de 0 à 100 par Saga.

## 3. `quand(moment, fn)` : réagir à un moment du jeu

```js
// Une prime toutes les 10 victoires.
quand('apres_combat', async (saga, infos) => {
  if (infos.issue !== 'victoire') return;
  await saga.ajouter('victoires', 1);
  if (saga.variable('victoires') % 10 === 0) {
    await saga.annoncer('Prime !', '10 victoires de plus');
    await saga.argent(100);
  }
});
```

| Moment | Quand | `infos` |
|---|---|---|
| `nouvelle_partie` | une nouvelle partie commence | — |
| `carte` | le joueur arrive sur une carte | `carte`, `depuis` (`''` au début) |
| `apres_combat` | après un combat | `issue` (`victoire`, `defaite`, `fuite`, `capture`), `sorte` (`sauvage`, `dresseur`, `groupe`) |
| `moment` | le moment de la journée change (horloge du jeu) | `moment` (`matin`, `jour`, `soir`, `nuit`) |
| `pas` | le joueur fait un pas (reste court !) | `x`, `y` |
| `fin_de_journee` | (Saga 1.5) le joueur a dormi : le jour est fini (après le calcul des modules) | `jour` (celui qui vient de finir) |
| `matin` | (Saga 1.5) le joueur se réveille au jour suivant | `jour` (le nouveau) |
| `ennemi_vaincu` | (Saga 1.12, temps réel) un ennemi est vaincu | `ennemi` (son id), `x`, `y` |
| `heros_touche` | (Saga 1.12, temps réel) le héros perd des PV | `degats`, `pv` (ce qui reste) |
| `defaite` | (Saga 1.12, temps réel) le héros n'a plus de vie, avant son réveil | |

Les réactions se jouent quand le joueur est libre (pas pendant un dialogue), dans l'ordre des
fichiers. Plusieurs scripts peuvent écouter le même moment.

Les **modules** du jeu (Réglages › Règles du jeu › Modules, Saga 1.4) peuvent annoncer leurs propres
moments : ils sont listés dans la documentation de chaque module, et le vérificateur de Tafl les
connaît quand le module est actif. Le module **gestion** (Saga 1.5) annonce `gestion_termine`
(`infos.batiment` : le type du bâtiment dont le chantier vient de finir, pendant la nuit), et depuis Saga 1.6 `gestion_arrivee` (`infos.nombre` : combien d'habitants viennent d'arriver, `infos.habitants` : combien vivent maintenant au domaine), et depuis Saga 1.6.1 `gestion_depart` (un habitant part après trop de nuits de faim, si le jeu l'a choisi ; mêmes `infos`). Le module **roguelite** (Saga 1.14) annonce `roguelite_debut` (`infos.graine`), `roguelite_etage` (`infos.etage` : l'étage où l'on arrive), `roguelite_salle` (une salle vient d'être vidée : `infos.type`, `infos.etage`), `roguelite_perk` (`infos.perk`, `infos.niveau`), `roguelite_amelioration` (`infos.amelioration`, `infos.niveau`) et `roguelite_fin` (`infos.issue` : `victoire`, `defaite` ou `abandon` ; `infos.etage` ; `infos.monnaie` : ce que la partie a rapporté).

```js
// Une lettre arrive deux jours après la décision du conseil.
quand('matin', async (saga, infos) => {
  const decide = saga.variable('jour_decision');
  if (decide && infos.jour === decide + 2) await saga.dire('Un messager t\'attend à la porte.');
});
```

## 4. `comportement(nom, fn)` : les ennemis du temps réel

Avec le pack action (Saga 1.12), un ennemi au comportement **Script** (Tafl › Données › Ennemis) suit
la fonction déclarée sous le nom choisi. Saga l'appelle quelques fois par seconde ; elle reçoit ce que
voit l'ennemi et rend sa décision. Elle ne bouge rien elle-même : Saga va vers `but` par le plus court
chemin (A*, en 8 directions), recule, ou lance le coup.

```js
// Une chauve-souris qui arrive de biais au lieu de foncer droit.
comportement('papillonner', (e, des) => {
  if (e.distance > e.vue) return { etat: 'vol', but: { x: e.depart.x + des.d(5) - 3, y: e.depart.y } };
  return { etat: 'chasse', but: { x: Math.round(e.joueur.x) + 1, y: Math.round(e.joueur.y) - 1 } };
});
```

| `e.` | Sens |
|---|---|
| `comportement`, `etat` | `"script"`, et ce qu'il faisait (le dernier `etat` rendu) |
| `x`, `y`, `depart` | où il est (en cases, à virgule) et `{ x, y }` où il est apparu |
| `joueur`, `distance` | `{ x, y }` du joueur, et la distance jusqu'à lui (en cases) |
| `vue`, `portee`, `pret` | sa vue, sa portée, et `true` quand il peut frapper (recharge finie) |
| `pv`, `pvMax`, `hasard` | sa vie, et un nombre entre 0 et 1 tiré pour cet appel |
| `but` | le but qu'il suivait |

Elle rend `{ etat, but, fuir, frapper }` : `etat` un mot libre (montré par F3), `but` une case
`{ x, y }` ou `null` pour rester, `fuir: true` pour s'éloigner du joueur, `frapper: true` pour lancer
son coup (si `portee` > 0 et `pret`). Elle peut être `async`. Tant qu'elle n'a pas répondu, l'ennemi
garde sa décision d'avant ; si elle plante ou si le nom n'existe pas, il patrouille. Comme les
formules, elle doit rester pure : elle lit `e` et rend une décision, sans rien changer d'autre.

## L'objet `saga`

Ce qui **lit** rend tout de suite une valeur ; ce qui **agit** rend une promesse (`await`).

### Lire

| | |
|---|---|
| `saga.partie` | une copie de la partie (lecture seule) : `nom`, `argent`, `sac`, `interrupteurs`, `variables`, `quetes`, `badges`… (FORMAT.md › Sauvegardes). Elle se met à jour après chaque action. Saga 1.11 : `saga.partie.bonus`, les bonus du groupe en cours (`[{ id, nom, stats: { defense: 15 }, combats, nuit }]`) ; pour en donner un : `await saga.commande({ type: 'bonus', nom: 'Thé à la menthe', stats: [{ stat: 'esprit', pourcent: 10 }], combats: 2 })`. |
| `saga.carte` | `{ id, nom }` de la carte du joueur |
| `saga.evenement` | `{ id, nom, x, y }` de l'événement qui a lancé la commande (`null` pour une réaction) |
| `saga.joueur` | `{ nom, x, y, direction }` |
| `saga.interrupteur(id)` | `true` ou `false` |
| `saga.local()` | l'interrupteur « déjà fait » de l'événement |
| `saga.variable(id)` | la valeur d'une variable (0 si elle n'a jamais été réglée) |
| `saga.combien(objet)` | combien le joueur en a |
| `saga.argent()` | l'argent du joueur |
| `saga.etatQuete(id)` | `pas_commencee`, `en_cours` ou `finie` |
| `saga.fiche(i)` | (pack JDR) la fiche du membre `i` du groupe (0 = le premier), ou `null` : `nom`, `personnage`, `joueur`, `origine`, `classe`, `niveau`, `xp`, `pv`, `pvMax`, `pv_temp`, `ca`, `maitrise`, `vitesse`, `caracteristiques`, `modificateurs`, `sauvegardes` et `competences` (les bonus, par id), `maitrises`, `perception_passive`, `etats`, `sorts`, `dd_sorts`, `mort` |
| `saga.fiches` | (pack JDR) toutes les fiches du groupe |
| `saga.jour` | (Saga 1.5) le numéro du jour : 1 au début, +1 à chaque commande « Dormir » |
| `saga.modules` | (Saga 1.4) ce que les **modules** du jeu donnent à lire, par id de module (voir la documentation de chaque module). `{}` sans module. Le module **gestion** (Saga 1.5) : `saga.modules.gestion.stock` (`{ bois: 12 }`), `.capacite` (0 = sans limite), `.batiments` (`[{ id, type, etat: 'chantier' \| 'fini', reste }]`) ; Saga 1.6 : `.habitants`, `.logement` (la place dans les bâtiments finis) et `.ouvriers` (`{ demandes, libres }`). Pour agir sur lui, ses commandes : `await saga.commande({ type: 'gestion_stock', action: 'ajouter', ressource: 'bois', nombre: 5 })` (FORMAT.md › Le module gestion). Le module **roguelite** (Saga 1.14) : `saga.modules.roguelite.en_partie`, `.etage`, `.graine`, `.salle` (`{ type, vide }` ou `null`), `.perks` (`{ lame: 2 }`, ceux de la partie en cours), `.monnaie` (gardée entre les parties), `.ameliorations` (`{ entrainement: 1 }`), `.parties`, `.victoires`, `.record` (l'étage le plus profond atteint). |

### Parler au joueur

| | |
|---|---|
| `await saga.dire(texte, qui, expression)` | une boîte de dialogue. `qui` : id d'un personnage, `'@evenement'` ou `''` (texte seul). `{joueur}` = son nom. |
| `await saga.choisir(['Oui', 'Non'])` | 1 à 4 réponses ; rend le numéro choisi (0 = la première) |
| `await saga.annoncer(titre, texte)` | un bandeau en haut de l'écran |
| `await saga.attendre(ms)` | une pause |

### Agir

| | |
|---|---|
| `saga.interrupteur(id, true/false)` | allumer ou éteindre |
| `saga.local(true/false)` | marquer l'événement « déjà fait » |
| `saga.variable(id, valeur)` | régler une variable (nombre ou texte) |
| `saga.ajouter(id, n)` | ajouter `n` à une variable (`-n` pour retirer) |
| `saga.donner(objet, n)`, `saga.retirer(objet, n)` | le sac |
| `saga.argent(montant)` | donner (ou retirer si négatif) de l'argent |
| `saga.quete(id, action, etape)` | `commencer`, `etape` (avec son numéro), `finir` |
| `saga.badge(id)` | donner un badge |
| `saga.soigner()` | soigner l'équipe ou le groupe |
| `saga.teleporter(carte, x, y, direction)` | déplacer le joueur |
| `saga.creature(id, niveau)` | donner une créature (pack Pokémon) |
| `saga.groupe(personnage, 'rejoindre'/'quitter', niveau)` | le groupe (pack JRPG) |
| `await saga.combattre({ creature, niveau })`, `({ dresseur })`, `({ groupe })` | un combat ; rend l'issue (`'victoire'`…). Perdu : le script s'arrête, comme avec les blocs. |
| `saga.boutique(id)` | ouvrir une boutique |
| `saga.musique(fichier)`, `saga.son(fichier)` | `'sons/…'` ; `'aucune'` = silence, `''` = la musique de la carte |
| `saga.heure(h, 'regler'/'avancer')` | l'horloge du jeu |
| `await saga.test({ competence, dd, qui, avantage, desavantage, quoi })` | (pack JDR) un test, comme le bloc Test (`qui` : `choix`, `meilleur`, `premier`, `tous`, `groupe`) ; rend `{ reussi, total, membre, naturel }` (`annule: true` si le joueur a refusé de choisir) |
| `await saga.sauvegarde({ carac, dd, qui, degats, type_degats, moitie, etat, quoi })` | (pack JDR) une sauvegarde du groupe ; rend `{ reussi, reussis, total }` (`reussi` : tous ont réussi) |
| `await saga.oppose({ competence, monstre, competence_adverse, contre, nom_adverse, qui })` | (pack JDR) un test opposé ; rend `{ reussi, total, adverse }` |
| `await saga.jet('2d6+3', 'Dégâts du piège')` | (pack JDR) un jet montré sur le plateau de dés et noté au journal ; rend `{ total, des }` |
| `saga.repos('court'/'long')`, `saga.xp(montant)`, `saga.etat(etat, 'ajouter'/'retirer', qui)` | (pack JDR) un repos, de l'XP pour chaque héros, un état |
| `saga.commande({ type: …, … })` | n'importe quelle commande des blocs (FORMAT.md › Commandes) |
| `saga.fin()` | arrêter le script de l'événement ici |

## Les dés : `des`

| | |
|---|---|
| `des.d(20)` | un dé à 20 faces (1 à 20) |
| `des.lancer('2d6+3')` | le total d'un jet |
| `des.jet('2d6+3')` | le détail : `{ formule, des: [{ faces, valeur, signe }], bonus, total }` |
| `des.hasard(min, max)` | un entier de `min` à `max` compris |
| `des.chance(30)` | `true` 30 fois sur 100 |
| `des.choisir(liste)` | un élément au hasard |
| `des.aleatoire()` | un nombre de 0 à 1 (comme `Math.random()`) |

## Les données du jeu : `donnees`

`donnees` contient les données du jeu en lecture seule, sans les images : `donnees.objets`,
`donnees.personnages`, `donnees.quetes`, `donnees.variables`, `donnees.reglages`, et celles du pack
(`creatures`, `attaques`, `dresseurs`… ou `classes`, `monstres`, `groupes`). Elles sont prêtes
quand une commande, une formule ou une réaction s'exécute (pas pendant la lecture du fichier).

```js
commande('prix', async (saga) => {
  const potion = donnees.objets.find((o) => o.id === 'potion');
  await saga.dire(`Une potion coûte ${potion?.prix ?? '?'} pièces.`);
});
```

## `console`

`console.log(…)` écrit dans la console de la page du script (Essayer) et dans celle de Saga ;
`console.error(…)` est montré comme une erreur.

## Les variables

**Données › Variables** déclare les variables du jeu : un nom, un id, une valeur de départ (un
nombre ou un texte court). Elles sont dans la sauvegarde (`partie.variables`). Les blocs **Variable**
(régler, ajouter, retirer) et la condition **Une variable** (=, ≠, >, ≥, <, ≤) les utilisent aussi :
pas besoin de script pour un simple compteur.

## Le vérificateur

**Jeu › Vérifier le jeu** (Ctrl+Maj+V) signale aussi : les erreurs des scripts (fichier et ligne),
les blocs Script qui appellent une commande qu'aucun script actif ne déclare, les réglages qui citent
un id inconnu, les variables qui n'existent pas, les `formule()` que le pack n'a pas et les
`quand()` d'un moment inconnu.

## Loki

Loki (le panneau Claude de Tafl) lit les scripts (`scripts`), les écrit (`script`), les essaie
(`essayer_script`) et crée les variables (`variable`). Comme toujours, chaque action demande
Autoriser / Refuser et s'annule avec Ctrl+Z.

## Pas encore

- un pack de règles entier écrit en script (avec le pack TTRPG) ;
- des conditions écrites en script ;
- des comportements en temps réel (ennemis qui poursuivent, etc.).
