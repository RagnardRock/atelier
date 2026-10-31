# Les modules de jeu de Saga (Saga 1.4, Tafl 1.2 ; `finDeJournee` et le module « gestion » : Saga 1.5, Tafl 1.3)

Tafl et Saga servent à beaucoup de jeux différents. Pour qu'un jeu puisse faire plus qu'un autre sans que Saga se remplisse de cas particuliers, il y a deux sortes d'extensions :

| | Pack de règles (`regles/`, voir REGLES.md) | Module (`modules/`, ce document) |
|---|---|---|
| Combien par jeu | **Exactement un** (`reglages.regles`) | **Zéro, un ou plusieurs** (`reglages.modules`) |
| Répond à | « Que se passe-t-il quand j'attaque, je capture, je monte de niveau ? » | « Qu'est-ce que ce jeu sait faire en plus dans le monde ? » |
| Touche à | L'équipe, le sac, l'or, l'expérience, l'encyclopédie | Son propre état (`partie.modules[id]`), et le monde : dessiner sur la carte, bloquer des cases, ajouter des commandes, des conditions, des choix au menu de pause |
| Voit la carte et l'écran | Non (pas de DOM, pas de carte) | Oui, par ce que le moteur lui prête |
| Exemples | `pokemon`, `jrpg`, `jdr` | `gestion` (Saga 1.5 : un stock et des bâtiments qui produisent chaque nuit, voir `gestion/`) |

Un pack et des modules se combinent librement : « JRPG + gestion », « Pokémon + gestion » (une pension de créatures), plus tard « action en temps réel + gestion ». Un module ne doit donc **jamais** supposer quel pack tourne avec lui.

Ce document décrit :

1. [Activer un module](#1-activer-un-module)
2. [Le contrat d'un module](#2-le-contrat-dun-module)
3. [Ce qu'un module a le droit de faire](#3-ce-quun-module-a-le-droit-de-faire)
4. [Les scripts JS et les modules](#4-les-scripts-js-et-les-modules)
5. [Tafl et les modules](#5-tafl-et-les-modules)
6. [Écrire un module : un exemple minimal](#6-écrire-un-module--un-exemple-minimal)
7. [Pas encore](#7-pas-encore)

---

## 1. Activer un module

Dans Tafl : **Données › Réglages › Règles du jeu › Modules**, une case par module connu. Dans le dossier du jeu (`donnees/reglages.json`) :

```json
"modules": ["gestion"],
"modules_reglages": { "gestion": { "carte": "domaine" } }
```

- `modules` : les ids des modules actifs, dans l'ordre où Saga les appelle. Un id que Saga ne connaît pas est ignoré (Saga le dit une fois) : le jeu tourne sans lui.
- `modules_reglages` : les réglages de chaque module, par id. Tafl les garde tels quels ; c'est le module qui les lit et les borne.

## 2. Le contrat d'un module

Un module est un objet JavaScript tout simple, inscrit par `Modules.enregistrer(module)` quand son fichier est lu (son dossier : `modules/<id>/`, ses fichiers ajoutés dans `index.html` après `modules/modules.js`). Le moteur ne l'appelle jamais directement : il passe par la façade `Modules` (`modules/modules.js`), qui n'appelle que les modules **actifs du jeu ouvert**.

Seul `id` est obligatoire. Tout le reste est facultatif : un module ne fournit que ce dont il a besoin.

### 2.1 L'objet `o`

Chaque fonction reçoit un objet `o` :

| Champ | Contenu |
|---|---|
| `o.jeu` | Le jeu chargé (lecture seule), comme pour un pack (REGLES.md › 2.1). Ses données : `o.jeu.donnees.<sorte>`, ses réglages : `o.jeu.donnees.reglages.reglages.modules_reglages[id]`. |
| `o.partie` | La partie en cours. **Un module ne change que `o.etat`** (voir 3). |
| `o.etat` | `partie.modules[id]` : l'état du module, un objet JSON simple, sauvegardé tel quel. Il existe toujours (au moins `{}`). |
| `o.hote` | Ce que le moteur prête : `reagir(moment, infos)` (annoncer un moment aux scripts, voir 4), `rafraichir()` (refaire la liste des événements présents et leurs pages, après un changement qui touche une condition), `message(texte)` (un message d'erreur ou d'info, comme ceux des scripts), `ui` (les menus hors combat : `liste`, `quantite`, `fiche`, `texte`, `repartir`, `dire`… REGLES.md › 3.1). Saga 1.5 : `carte` (la carte affichée), `joueur` (`{ x, y, dir }`), `libre(x, y)` (la case est dans la carte, ni bloquée ni sur un rebord, sans événement visible ou bloquant ni le joueur) et `viser({ largeur, hauteur, valide(x, y) })` (le joueur choisit un rectangle sur la carte avec les flèches, vert si `valide` le dit, rouge sinon ; rend `{ x, y }`, ou `null` s'il annule). Saga 1.9 : `chemin(depart, arrivee, { cout(x, y), coutMin, max })` (le plus court chemin entre deux cases de la carte affichée, en 4 directions, sur les cases où l'on marche ; `cout` rend une case plus ou moins chère, `coutMin` est le plus petit coût possible ; rend `[{ x, y }…]` sans le départ, ou `null`). |

Les appels qui en ont besoin ajoutent leurs propres champs (la carte, le canvas…), décrits ci-dessous.

### 2.2 Les fonctions

| Fonction | Quand le moteur l'appelle | Ce qu'elle rend |
|---|---|---|
| `nouvellePartie(o)` | Une partie toute neuve, juste après le pack. | rien |
| `preparer(o)` | Toute partie qui démarre, neuve ou chargée d'une sauvegarde (après `nouvellePartie` pour une neuve). Remettre `o.etat` d'aplomb : ajouter ce qui manque, ramener les valeurs folles dans leurs bornes, oublier ce qui n'existe plus dans le jeu. | rien |
| `entrerCarte(o)` | Le joueur arrive sur une carte (aussi au chargement). `o.carte` : la carte, `o.depuis` : l'id de la carte d'avant (`''` au début). | rien |
| `finDeJournee(o)` | Saga 1.5 : le joueur dort (commande `dormir`), le jour `o.jour` se termine. Tout le calcul de la nuit, **d'un coup et sans `await`** (aucune sauvegarde ne peut tomber au milieu). Le module retient dans `o.etat` le dernier jour calculé et ne refait rien pour un jour déjà calculé. Ensuite le moteur passe au jour suivant, fait le fondu au noir, et annonce `fin_de_journee` puis `matin` aux scripts. | `[lignes]` : ce que le joueur lit au réveil, dans le rapport du matin (des phrases courtes) |
| `bloque(o, x, y)` | Chaque fois que quelqu'un (le joueur, un PNJ qui marche) veut entrer sur la case `(x, y)` de `o.carte`. **Appelée très souvent : doit rester très rapide** (une table de cases préparée dans `entrerCarte`, pas une boucle sur tout l'état). | `true` : la case est bloquée. Toute autre valeur : le module ne bloque pas (il ne peut pas débloquer une case bloquée par la carte). |
| `teleporteur(o, x, y)` | (Saga 1.6.1) À chaque pas du joueur, après les téléporteurs de la carte : marcher sur `(x, y)` de `o.carte` l'emmène-t-il ailleurs (la porte d'un bâtiment posé) ? Doit rester rapide. | `{ carte, x, y, direction }` ou `null`. La carte peut être une copie, `base@copie` (Saga 1.6.1) : la carte `base`, avec sa propre mémoire dans la partie (le module gestion s'en sert pour un intérieur par bâtiment). |
| `avancer(o)` | (Saga 1.9) À chaque image, sur la carte du joueur (`o.carte`), `o.dt` secondes après la précédente (pas en combat, ni en pause, ni en mode table) : faire marcher ses figurants. Doit rester rapide. | rien |
| `figurants(o)` | (Saga 1.9) Les passants à dessiner sur `o.carte`, parmi les personnages (le plus bas passe devant). Ils ne bloquent personne et ne lancent rien. | `[{ x, y, direction, pas, personnage, couleur }]` : `x`, `y` en pixels de la carte (le coin haut gauche de la case), `pas` 0 debout ou le n° du pas, `personnage` un id de personnage (sinon un petit bonhomme à `couleur`) |
| `dessiner(o)` | À chaque image, deux fois : `o.profondeur = 'sol'` (après les calques `dessous` et `joueur`, sous les personnages) et `o.profondeur = 'dessus'` (après les calques `dessus`, devant les personnages : un toit). | rien |
| `commandes` | Un objet `{ type: async (o) → résultat }` : les commandes d'événement du module. Le moteur les cherche après celles du pack. `o.c` : la commande telle que Tafl l'a écrite ; `o.ev` : l'événement qui joue ; `o.jouer(liste)` : jouer une liste de commandes (une branche) ; `o.narrer(texte)` : une phrase sans nom ; `o.ui` : les menus. | un résultat simple (nombre, texte, objet JSON), qu'un script JS reçoit s'il a lancé la commande |
| `condition(o, cond)` | Une condition de page que ni le monde ni le pack ne connaissent. | `true`, `false`, ou `undefined` (« pas à moi » : le module suivant essaie ; personne ne la connaît : elle est vraie, comme une condition d'un Tafl plus récent) |
| `actionsPause(o)` | À l'ouverture du menu de pause. | `[[id, nom, icône]]` : des choix en plus. Le moteur les renomme `module:<id du module>:<id>`. |
| `agirPause(o, id)` | Le joueur a choisi l'un de ces choix (`id` : celui que le module a donné). Comme un script : le joueur ne bouge pas pendant ce temps. | rien |
| `pourScript(o)` | Avant chaque appel d'un script JS. | ce que les scripts lisent dans `saga.modules[id]` : des valeurs simples, déjà calculées |

Pour `dessiner`, `o` contient aussi :

| Champ | Contenu |
|---|---|
| `o.ctx` | Le contexte 2D du canvas du jeu, en pixels du jeu (avant le zoom). |
| `o.carte` | La carte affichée. |
| `o.cam` | `{ x, y }` : le coin haut gauche de l'écran, en pixels de la carte. Une case `(cx, cy)` est à l'écran en `(cx × taille − cam.x, cy × taille − cam.y)`. |
| `o.taille` | La taille d'une case en pixels (`jeu.taille`). |
| `o.largeur`, `o.hauteur` | La taille de l'écran en pixels du jeu. |
| `o.visee` | Saga 1.5 : le rectangle que le joueur vise en ce moment (`{ x, y, largeur, hauteur, ok }`), ou `null`. Le moteur dessine déjà son cadre ; un module y montre ce qu'il va poser. |
| `o.maintenant` | L'heure de l'image (ms), pour animer. |
| `o.tuile(n, cx, cy)` | Pose la tuile n° `n` de `tuiles.tafl` sur la case `(cx, cy)` de la carte (les tuiles animées s'animent). |

Saga 1.5 : `o.jeu.tampons` est une `Map` nom → `{ nom, largeur, hauteur, dessus, cases }` des tampons de `tuiles.tafl` (FORMAT.md), pour dessiner un objet de plusieurs tuiles avec `o.tuile`.

Après les modules, le moteur remet `globalAlpha` à 1 et `globalCompositeOperation` à `source-over`.

### 2.3 L'ordre des appels

Au démarrage d'une partie : pack `nouvellePartie` (partie neuve) → modules `nouvellePartie` (partie neuve) → modules `preparer` → entrée sur la carte de départ (`entrerCarte`) → les réactions des scripts (`nouvelle_partie`, `carte`). Les modules sont appelés dans l'ordre de `reglages.modules`.

Quand le joueur dort (commande `dormir`, Saga 1.5) : soin du groupe (si demandé) → modules `finDeJournee` (le jour qui finit) → `partie.jour + 1`, l'horloge à l'heure du réveil → fondu au noir sur place (`entrerCarte` de la même carte) → rapport du matin (les lignes de tous les modules) → réactions des scripts `fin_de_journee`, `matin`, et les moments que les modules ont annoncés pendant la nuit.

## 3. Ce qu'un module a le droit de faire

Ces règles gardent les modules indépendants entre eux et du pack, et la partie prête pour le multijoueur.

1. **Son état, et seulement lui.** Un module écrit dans `o.etat` (`partie.modules[id]`). Il lit le reste de la partie, mais n'y écrit pas directement : pour donner un objet, de l'argent ou allumer un interrupteur, il joue la commande correspondante avec `o.jouer([{ type: 'objet', … }])` (dans une commande) ou demande au joueur via `o.hote.ui`. Ainsi le sac, l'or et les interrupteurs restent cohérents quel que soit le pack.
2. **Rien de propre à un jeu.** Aucun nom de bâtiment, de ressource ou de personnage dans le code d'un module : tout vient des données du jeu (`donnees/`) et de `modules_reglages`. Un module sert à plusieurs jeux.
3. **Rien de propre à un pack.** Un module ne lit pas l'équipe ou les statistiques d'un pack, et ne suppose pas que les combats sont au tour par tour. S'il a besoin d'un combat, il joue la commande `combat_groupe`, `combat_sauvage`… que le pack du jeu sait faire.
4. **Un état JSON simple.** Pas de fonctions, de `Map` ou de dates dans `o.etat` : il est sauvegardé avec `JSON.stringify` et copié pour les scripts. Ce qui se calcule (le nom d'un bâtiment, sa taille) est relu dans `o.jeu`, pas gardé.
5. **Des calculs purs à part.** Ce qui calcule (une production, un coût, la fin d'une journée) est écrit en fonctions pures (une partie en entrée, un résultat en sortie), testables sans écran. Une règle qu'un jeu voudrait changer passe par `Maison.formule` (REGLES.md › 7.1), comme les formules des packs.
6. **Le monde s'arrête pendant ses écrans.** Une commande ou un choix de pause se joue comme un script : le joueur ne bouge pas et les PNJ s'arrêtent de marcher (l'horloge du jeu, elle, continue). Le temps qui passe d'un jour à l'autre passe par `finDeJournee`, que le moteur appelle quand le joueur dort, jamais pendant qu'il marche. C'est aussi ce qui le rendra compatible avec un futur pack en temps réel.
7. **Une erreur ne casse pas le jeu.** La façade attrape les erreurs de chaque module et les dit une fois (par module et par fonction) ; le jeu continue sans ce que le module voulait faire.

## 4. Les scripts JS et les modules

- **Lire** : `saga.modules.<id>` rend ce que le module donne par `pourScript` (`saga.modules.gestion.stock.bois`). La partie entière reste lisible dans `saga.partie` (avec `saga.partie.modules`).
- **Agir** : un script lance une commande de module comme n'importe quelle commande : `await saga.commande({ type: 'gestion_construire', batiment: 'ferme' })`. Il ne change jamais l'état d'un module directement.
- **Réagir** : un module annonce ses moments avec `o.hote.reagir('gestion_termine', { batiment: 'ferme' })` ; un script les écoute avec `quand('gestion_termine', async (saga, infos) => …)`. Les moments d'un module sont listés dans le catalogue (`commun/modules.js`), pour que Tafl les connaisse (complétion, vérificateur). Les moments de la journée (`fin_de_journee`, `matin`) sont ceux de Saga, pour tous les jeux.

## 5. Tafl et les modules

Tafl ne fait pas tourner les modules, mais il doit les connaître. Tout ce qu'il en sait est dans **`commun/modules.js`** (`ModulesJeu.CATALOGUE`), partagé avec Saga :

```js
gestion: {
  nom: 'Gestion',
  description: 'Un stock commun et des bâtiments à construire, qui produisent chaque nuit…',
  donnees: ['ressources', 'batiments'],
  moments: { gestion_termine: { nom: 'Un chantier est terminé (pendant la nuit)', infos: { batiment: 'L\'id du type de bâtiment' } } },
  commandes: { gestion_construire: { nom: 'Construire un bâtiment' }, … },
  conditions: { gestion_batiment: { nom: 'Un bâtiment est construit' }, … },
}
```

- Réglages › Règles du jeu › **Modules** : une case par entrée du catalogue.
- Les **données** d'un module (`donnees/batiments.json`…) : Tafl 1.2 garde tel quel tout fichier de `donnees/` qu'il ne sait pas éditer, et le réécrit à l'enregistrement. Un module qui veut son éditeur dans Tafl l'ajoute dans l'espace Données, comme un pack : un fichier `tuiles/renderer/donnees-<module>.js` (pour gestion : `donnees-gestion.js`) dont les onglets portent `modules: ['<id>']` et ne se montrent que si le jeu active le module. Ses réglages vont sous sa case, dans Réglages › Règles du jeu › Modules.
- Ses **commandes et conditions** sont dans `tuiles/renderer/events.js`, avec `modules: ['<id>']` : Tafl ne les propose que si le jeu active le module.
- Le **vérificateur** signale un module activé qu'il ne connaît pas, et accepte les moments des modules actifs dans `quand()`.

## 6. Écrire un module : un exemple minimal

Un module « lanternes » qui allume une lueur dorée sous le joueur la nuit, compte les nuits passées dehors et ajoute une condition. Il montre presque tout le contrat en peu de lignes.

```js
// modules/lanternes/lanternes.js
Modules.enregistrer({
  id: 'lanternes',
  preparer(o) {
    o.etat.nuits = Number.isInteger(o.etat.nuits) ? Math.max(0, o.etat.nuits) : 0;
  },
  entrerCarte(o) {
    if (!o.carte.interieur && Temps.moment(o.jeu, o.partie, 'nuit')) o.etat.nuits += 1;
  },
  dessiner(o) {
    if (o.profondeur !== 'sol' || !Temps.moment(o.jeu, o.partie, 'nuit')) return;
    const p = o.partie.position, t = o.taille;
    o.ctx.fillStyle = 'rgba(255, 210, 120, 0.25)';
    o.ctx.beginPath();
    o.ctx.arc(p.x * t + t / 2 - o.cam.x, p.y * t + t / 2 - o.cam.y, t, 0, Math.PI * 2);
    o.ctx.fill();
  },
  condition(o, cond) {
    if (cond.type !== 'lanternes_nuits') return undefined;
    return o.etat.nuits >= (Number(cond.min) || 1);
  },
  pourScript: (o) => ({ nuits: o.etat.nuits }),
});
```

Puis :

1. ajouter `<script src="moteur/modules/lanternes/lanternes.js"></script>` dans `index.html`, après `modules/modules.js` ;
2. décrire le module dans `commun/modules.js` (nom, description, données, moments, commandes, conditions) ;
3. documenter ses données dans `tuiles/FORMAT.md` et ce qu'il donne aux scripts dans `tuiles/SCRIPTS.md` ;
4. tester ses calculs sans écran, et le module dans Saga avec le harnais Playwright (`docs/saga-tests.md`).

## 7. Pas encore

- **Le mode table et le multijoueur.** Les modules ne sont pas dessinés sur le plateau de la table (`table/plateau.js`), et le monde partagé du multijoueur n'envoie pas leur état aux amis. Un module reste d'abord un module solo.
- **La table comme module.** Le mode table (`table/`) est branché à la main dans `moteur.js`. Il pourra passer sur ce contrat plus tard ; on n'agrandira le contrat que quand un module en aura vraiment besoin (`finDeJournee` est arrivé ainsi, avec gestion).
- **Gestion, la suite.** Le placement libre des bâtiments sur la carte (aperçu, collisions, dessin par tampon), les habitants et leurs emplois, les points de récolte qui reviennent le lendemain, l'agenda des événements différés.
- **Des personnages créés en jeu** (des habitants qui marchent, des ennemis en temps réel) : ce sera une base du moteur, prévue avec l'étape « temps réel » de la feuille de route, que les modules pourront utiliser.
