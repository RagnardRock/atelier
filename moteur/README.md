# Saga ᛃ

Le **moteur** de mes jeux : Saga ouvre un jeu décrit dans **Tafl** (son dossier de jeu) et le fait tourner.
Tafl décrit le jeu (les cartes, les calques, le passage, les événements, les données), Saga le joue.
Saga ne modifie jamais le dossier du jeu : il ne fait que le lire.

Son nom : une saga, c'est l'histoire qu'on raconte à la veillée. Sa rune ᛃ (Jera, « l'année ») est celle
du cycle, comme la boucle d'un jeu qui tourne soixante fois par seconde.

## Lancer Saga depuis le clone

```bat
cd moteur
npm install
npm start
```

Ou avec un jeu : `npm start -- D:\Jeux\MonJeu`. Dans Tafl, le bouton **Jouer** (`F5`) fait tout ça pour toi.

## Installer Saga (Windows)

Depuis **Atelier** (colonne Outils), ou avec `Saga-Setup-<version>.exe` dans l'onglet Releases du dépôt
(les versions `saga-v…`). Réglages et journal dans `%APPDATA%\atelier-moteur`.

## Jouer

| Touche | Ce qu'elle fait |
|---|---|
| Flèches ou ZQSD | Se déplacer, case par case. Une touche à peine touchée tourne le joueur sans le faire avancer. |
| Maj (tenue) | Courir (ou marcher, si « Courir sans tenir Maj » est coché dans les réglages). |
| Espace, Entrée ou E | **Action** : parler au PNJ en face, ouvrir un coffre, lire un panneau, faire avancer un dialogue, valider un choix. |
| Retour arrière ou X | Faire avancer un dialogue (comme Action). |
| Tab | Le **carnet** : équipe, sac, argent, quêtes. |
| Ctrl+S | **Sauvegarder** la partie (aussi dans le menu de pause). |
| Échap | En combat : revenir en arrière (comme Retour arrière, X ou le clic droit). Ailleurs : menu de pause : reprendre, carnet, sauvegarder, recharger, recommencer, réglages, dossier du jeu, changer de jeu. |
| F5 | **Recharger le jeu** depuis le disque, sans bouger le joueur : enregistre dans Tafl, appuie sur F5 dans Saga, et vois le changement. |
| F3 | Montrer le passage (rouge : bloqué, jaune : rebord), les zones, les téléporteurs (bleu) et les événements (rose), avec la case du joueur. |
| F11 | Plein écran. |
| Ctrl+O | Ouvrir un autre jeu. |
| Ctrl+, | Réglages. |

Une **manette** marche aussi (croix ou stick gauche, A pour l'action, B pour courir, Start pour la pause).

## Ce que fait Saga 0.1

- **Ouvre un dossier de jeu** de Tafl (format décrit dans `tuiles/FORMAT.md`) : `jeu.json`, les tuiles (animées comprises), toutes les cartes et les données. Un jeu écrit par une version plus récente de Tafl est refusé poliment. Ce qui manque (un départ pas placé, une carte introuvable) est signalé sans empêcher de jouer.
- **Dessine les cartes** avec tous leurs calques, dans l'ordre de `FORMAT.md` : les calques `dessous` et `joueur`, puis les personnages, puis les calques `dessus` (toits, cimes des arbres). Chaque calque garde son **opacité**, son **mode de fusion** (ombres en produit, lueurs en addition…) et sa **parallaxe** (un calque à 0,5 défile deux fois moins vite : fond lointain ; à 0, il reste fixe à l'écran ; plus de 1 : premier plan). Les tuiles animées partagent la même horloge.
- **Pixel art net** : le jeu est dessiné à sa vraie résolution (16 px par case), puis agrandi d'un nombre entier de fois, sans lissage. En zoom automatique, Saga prend le plus grand zoom qui montre au moins 11 cases en hauteur (réglable) ; sur ton écran ultra-large, tu vois donc beaucoup plus de carte en largeur.
- **La caméra** suit le joueur sans sortir de la carte ; une carte plus petite que l'écran (un intérieur) est centrée sur du noir.
- **Le joueur** avance case par case, marche ou court, et respecte le passage : cases bloquées, bord de la carte, événements non traversables. Les **rebords** se sautent dans leur sens (avec un petit saut et son ombre), jamais dans l'autre. Une zone avec un **objet requis** (la planche de surf pour l'eau) s'ouvre si le joueur a l'objet.
- **Les téléporteurs** : marcher dessus fait un fondu au noir, puis le joueur arrive sur la carte et la case prévues, tourné dans la bonne direction. Le **nom de la carte** apparaît en haut à gauche.
- **L'ambiance** de chaque carte : la **teinte** posée en produit sur toute la carte, puis la **météo** avec de vraies particules : pluie avec éclaboussures, orage avec éclairs, neige, brouillard en nappes, feuilles, lucioles. Les particules suivent le décor quand la caméra bouge, et le brouillard un peu plus vite (il est plus près de nous) : c'est ce qui donne de la profondeur.
- **Les personnages** : le héros (le personnage `heros` de `personnages.json`) et les PNJ sont dessinés avec leur **sprite** fait dans Tafl (depuis Saga 0.2.1 et Tafl 0.12 : 4 directions et la marche ; un sprite plus haut qu'une case dépasse sur la case du dessus). Sans sprite : la tuile de leur apparence, sinon un petit bonhomme en pixel art à leur `couleur`, avec 4 directions et une animation de marche. Ils ont une ombre au sol et se croisent dans le bon ordre (le plus bas passe devant). Les pages des événements sont déjà lues : un PNJ dont aucune page n'est vraie au début de la partie n'apparaît pas.

## Ce que fait Saga 0.2 : les événements

- **Parler** : la touche Action déclenche l'événement en face du joueur (déclenchement `parler`). Un PNJ se tourne vers le joueur avant de répondre. Pendant un script, le joueur ne bouge pas.
- **Toucher** : un événement `toucher` se lance quand le joueur marche dessus, ou quand il se cogne contre lui s'il est bloquant. Un événement `auto` se lance tout seul dès que sa page est vraie (une cinématique à l'arrivée sur une carte) ; pour qu'il ne tourne pas en boucle, son script change un interrupteur ou un interrupteur local.
- **Dialogues** : une boîte en verre en bas de l'écran, avec le nom de celui qui parle (dans sa couleur), son **portrait** pour l'expression demandée, et le texte qui s'écrit lettre par lettre (Action l'affiche d'un coup, puis passe à la suite). Une ligne vide dans le texte coupe en plusieurs boîtes ; `{joueur}` est remplacé par le nom du héros.
- **Choix** : 2 à 4 réponses à côté de la boîte, au clavier (haut/bas, Action), à la manette ou à la souris. Chaque réponse a ses propres commandes.
- **Les scripts de Tafl** sont joués commande par commande : `dire`, `choix`, `si`, `interrupteur`, `local`, `attendre`, `objet` (donner, retirer), `creature` (dans l'équipe ou la boîte), `teleporter`, `quete` (commencer, étape, finir, avec une annonce en haut à droite), `soigner`, `fin`. Les pages des événements sont relues après chaque script : un PNJ peut apparaître, disparaître ou changer de texte.
- **Pas encore là** : les boutiques et l'écran des EV. Saga le dit dans une boîte et l'histoire continue. (Les combats sont arrivés avec Saga 0.3, plus bas.)
- **PNJ qui bougent** : un événement en déplacement `aleatoire` se promène (sans s'éloigner de plus de 2 cases), `tourne` regarde autour de lui.
- **Sauvegarde** : Ctrl+S ou le menu de pause. Elle va dans `%APPDATA%\atelier-moteur\sauvegardes` (jamais dans le dossier du jeu), une par jeu. Quand on rouvre le jeu, Saga propose **Continuer** ou **Nouvelle partie**. F5 (recharger) garde la partie en cours.

## Ce que fait Saga 0.3 : les combats

- **Rencontres sauvages** : dans une zone qui a des rencontres (les hautes herbes, l'eau…), chaque pas a sa chance de lancer un combat, selon le taux de la zone. La créature est tirée au sort selon les poids de la table, à un niveau entre le minimum et le maximum. Un **Repousse** empêche les rencontres pendant un certain nombre de pas.
- **Dresseurs** : les commandes `combat_sauvage` et `combat_dresseur` de Tafl lancent un vrai combat. Le dresseur envoie ses créatures une par une, dit son `dialogue_victoire` ou son `dialogue_defaite` selon l'issue, et donne son argent. Un dresseur gagné compte dans les succès (`dresseurs_battus`). Le niveau de ses créatures suit le réglage d'ajustement des dresseurs de Tafl.
- **L'écran de combat** (animations d'entrée revues en 0.3.1 : le fond s'ouvre après le flash, la créature sauvage glisse depuis la droite, celle du dresseur arrive quand il l'envoie, la tienne sort d'une balle sur « En avant ! ») : un fond selon la carte (herbe, eau, grotte, intérieur), les deux créatures avec leur nom, leur niveau, leur statut et leur barre de PV, la barre d'XP du joueur, et des messages qui s'écrivent lettre par lettre. Menu **Attaque / Sac / Équipe / Fuite** au clavier (flèches, Action, Retour pour revenir), à la manette ou à la souris.
- **Les vraies formules** (celles des jeux officiels depuis la 3ᵉ génération) : statistiques avec IV, EV et nature ; dégâts avec bonus de type (STAB), table des types de Tafl (super efficace, peu efficace, sans effet), coups critiques, précision et esquive ; priorité et vitesse pour l'ordre des attaques.
- **Statuts** : brûlure, paralysie, poison, poison grave, sommeil, gel et confusion, avec leurs effets officiels. Aussi : la peur, le vol de PV, le contrecoup, les attaques qui soignent, celles qui frappent plusieurs fois, et les hausses ou baisses de stats.
- **Le sac en combat** : potions, soins de statut, rappels, PP, et **Poké Balls** contre une créature sauvage (formule de capture officielle, avec les secousses). Une créature capturée va dans l'équipe, ou dans la boîte si l'équipe est pleine.
- **XP et niveaux** : l'XP est partagée entre les créatures qui ont combattu (plus avec un dresseur), avec les 6 courbes officielles et les EV gagnés. En montant de niveau, une créature apprend ses attaques (et propose d'en oublier une si elle en a déjà 4) et **évolue pendant le combat**. Le **plafond de niveau** suit les badges (réglage de Tafl) : au plafond, plus d'XP.
- **Défaite** : le joueur perd la moitié de son argent, son équipe est soignée, et il se réveille au dernier endroit où il a été soigné (sinon au départ du jeu).
- **Le carnet** montre maintenant chaque créature de l'équipe avec son sprite, son niveau, son statut et sa barre de PV.
- **Sauvegarde** : les créatures sont gardées en entier (niveau, XP, PV, IV, EV, nature, attaques et PP), ainsi que la boîte et le dernier lieu de soin. Une sauvegarde de Saga 0.2 est mise à jour toute seule.

## Ce que fait Saga 0.4 : deux thèmes pour l'interface en jeu

- Le jeu choisit son thème dans Tafl (0.15 ou plus : **Données du jeu › Réglages › Interface du jeu**), avec sa **couleur d'accent** (les noms dans les dialogues, les curseurs, la barre d'XP).
- **Verre** : des plaques sombres et floues aux coins arrondis. En combat, le texte et les boutons flottent sur le décor au lieu d'une barre opaque.
- **Pixel** : la police pixel Jersey 10 (aux chiffres bien lisibles), des cadres nets à double bordure, pas de flou ni d'arrondi, un curseur ▶, des lignes de balayage légères en combat. Façon Game Boy Advance.
- Les deux thèmes couvrent les dialogues, les choix, les annonces, le nom de la carte, le carnet et tout le combat.
- **Réglages de Saga › Interface en jeu** : « Celle choisie par le jeu », ou forcer Verre ou Pixel.

## La suite

1. Les **boutiques** (débloquées par les succès) et l'écran des EV du centre.
2. Le reste des menus du jeu : équipe détaillée, Pokédex, boîte.
3. Les combats en duo et les talents qui changent le combat.

## Comment c'est construit

Electron, sans framework ni bundler, comme Tafl. Le jeu tourne dans un `<canvas>`.

| Fichier | Rôle |
|---|---|
| `main.js` | La fenêtre, les réglages, la lecture du dossier de jeu (Saga n'y écrit jamais), les sauvegardes, la ligne de commande (`Saga.exe <dossier> --carte=… --x=… --y=…`), la mise à jour. |
| `preload.js` | Le pont entre l'interface et `main.js` (`window.saga`). |
| `renderer/app.js` | L'interface autour du jeu : accueil, menu de pause, réglages, plein écran, raccourcis. |
| `renderer/moteur/jeu.js` | Le chargement : les textes du dossier de jeu deviennent des objets prêts à jouer (toutes les tuiles recollées dans une planche). |
| `renderer/moteur/monde.js` | La partie en cours (interrupteurs, quêtes, sac…), les conditions des événements, et ce qu'on demande à une carte (bloqué ? téléporteur ? qui est là ?). |
| `renderer/moteur/moteur.js` | La boucle du jeu : commandes, déplacements, caméra, dessin des calques et des personnages, fondus. |
| `renderer/moteur/ambiance.js` | La teinte et la météo. |
| `renderer/moteur/dialogue.js` | La boîte de dialogue, les choix et les annonces (en HTML, posés sur le canvas). |
| `renderer/moteur/scripts.js` | Joue les commandes des événements, une par une. |
| `renderer/polices/` | La police pixel Jersey 10 (licence SIL OFL, dans `OFL.txt`). |
| `renderer/moteur/regles/regles.js` | **La porte des règles** : le moteur ne parle qu'à elle pour tout ce qui touche aux créatures et aux combats. |
| `renderer/moteur/regles/pokemon/creatures.js` | Les créatures : statistiques, XP, niveaux, attaques apprises, évolutions, plafond de niveau. |
| `renderer/moteur/regles/pokemon/combat.js` | Le déroulé d'un combat : tours, dégâts, statuts, sac, capture, fuite, XP, dresseurs. |
| `renderer/moteur/ecran-combat.js` | L'écran de combat (en HTML, posé sur le canvas) : créatures, barres, messages, menus et animations. |
| `renderer/moteur/sprites.js` | Les personnages sur la carte : leur sprite de Tafl, ou le petit bonhomme en pixel art. |

**Des règles remplaçables.** Les règles de combat et de créatures (aujourd'hui celles de Pokémon) sont rangées à part, dans `renderer/moteur/regles/pokemon/`. Le moteur (cartes, déplacements, scripts, sauvegarde) ne les appelle jamais directement : il passe par `regles.js`, qui dit en tête de fichier la petite liste de fonctions qu'un jeu de règles doit fournir (créer une créature, la soigner, la résumer pour le carnet, lancer un combat…). Pour un jeu avec d'autres règles, on écrira un autre dossier à côté de `pokemon/`, sans toucher au moteur. L'écran de combat, lui, ne connaît aucune règle : il montre ce qu'on lui dit.

Les fichiers de `renderer/moteur/` ne touchent ni au disque ni à Electron : ils reçoivent les textes du jeu.
Ils pourront donc un jour tourner dans un simple navigateur, pour un export web du jeu.
