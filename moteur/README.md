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
| Échap | Menu de pause : reprendre, recharger, recommencer, réglages, dossier du jeu, changer de jeu. |
| F5 | **Recharger le jeu** depuis le disque, sans bouger le joueur : enregistre dans Tafl, appuie sur F5 dans Saga, et vois le changement. |
| F3 | Montrer le passage (rouge : bloqué, jaune : rebord), les zones, les téléporteurs (bleu) et les événements (rose), avec la case du joueur. |
| F11 | Plein écran. |
| Ctrl+O | Ouvrir un autre jeu. |
| Ctrl+, | Réglages. |

Une **manette** marche aussi (croix ou stick gauche, B pour courir, Start pour la pause).

## Ce que fait Saga 0.1

- **Ouvre un dossier de jeu** de Tafl (format décrit dans `tuiles/FORMAT.md`) : `jeu.json`, les tuiles (animées comprises), toutes les cartes et les données. Un jeu écrit par une version plus récente de Tafl est refusé poliment. Ce qui manque (un départ pas placé, une carte introuvable) est signalé sans empêcher de jouer.
- **Dessine les cartes** avec tous leurs calques, dans l'ordre de `FORMAT.md` : les calques `dessous` et `joueur`, puis les personnages, puis les calques `dessus` (toits, cimes des arbres). Chaque calque garde son **opacité**, son **mode de fusion** (ombres en produit, lueurs en addition…) et sa **parallaxe** (un calque à 0,5 défile deux fois moins vite : fond lointain ; à 0, il reste fixe à l'écran ; plus de 1 : premier plan). Les tuiles animées partagent la même horloge.
- **Pixel art net** : le jeu est dessiné à sa vraie résolution (16 px par case), puis agrandi d'un nombre entier de fois, sans lissage. En zoom automatique, Saga prend le plus grand zoom qui montre au moins 11 cases en hauteur (réglable) ; sur ton écran ultra-large, tu vois donc beaucoup plus de carte en largeur.
- **La caméra** suit le joueur sans sortir de la carte ; une carte plus petite que l'écran (un intérieur) est centrée sur du noir.
- **Le joueur** avance case par case, marche ou court, et respecte le passage : cases bloquées, bord de la carte, événements non traversables. Les **rebords** se sautent dans leur sens (avec un petit saut et son ombre), jamais dans l'autre. Une zone avec un **objet requis** (la planche de surf pour l'eau) s'ouvre si le joueur a l'objet.
- **Les téléporteurs** : marcher dessus fait un fondu au noir, puis le joueur arrive sur la carte et la case prévues, tourné dans la bonne direction. Le **nom de la carte** apparaît en haut à gauche.
- **L'ambiance** de chaque carte : la **teinte** posée en produit sur toute la carte, puis la **météo** avec de vraies particules : pluie avec éclaboussures, orage avec éclairs, neige, brouillard en nappes, feuilles, lucioles. Les particules suivent le décor quand la caméra bouge, et le brouillard un peu plus vite (il est plus près de nous) : c'est ce qui donne de la profondeur.
- **Les personnages** : en attendant les sprites dessinés dans Tafl, le héros (le personnage `heros` de `personnages.json`) et les PNJ sont de petits bonshommes en pixel art à leur `couleur`, avec 4 directions et une animation de marche, ou la tuile de leur apparence. Ils ont une ombre au sol et se croisent dans le bon ordre (le plus bas passe devant). Les pages des événements sont déjà lues : un PNJ dont aucune page n'est vraie au début de la partie n'apparaît pas.

## La suite

1. Les **événements** : parler aux PNJ, dialogues avec portraits et choix, scripts (interrupteurs, objets, quêtes, téléporter…), sauvegarde.
2. Les **combats** (sauvages et dresseurs), avec les données de Tafl 0.8.
3. Les menus du jeu (équipe, sac, Pokédex, quêtes), les boutiques.
4. Les vrais sprites des personnages, dessinés dans Tafl.

## Comment c'est construit

Electron, sans framework ni bundler, comme Tafl. Le jeu tourne dans un `<canvas>`.

| Fichier | Rôle |
|---|---|
| `main.js` | La fenêtre, les réglages, la lecture du dossier de jeu (Saga n'y écrit jamais), la ligne de commande (`Saga.exe <dossier> --carte=… --x=… --y=…`), la mise à jour. |
| `preload.js` | Le pont entre l'interface et `main.js` (`window.saga`). |
| `renderer/app.js` | L'interface autour du jeu : accueil, menu de pause, réglages, plein écran, raccourcis. |
| `renderer/moteur/jeu.js` | Le chargement : les textes du dossier de jeu deviennent des objets prêts à jouer (toutes les tuiles recollées dans une planche). |
| `renderer/moteur/monde.js` | La partie en cours (interrupteurs, quêtes, sac…), les conditions des événements, et ce qu'on demande à une carte (bloqué ? téléporteur ? qui est là ?). |
| `renderer/moteur/moteur.js` | La boucle du jeu : commandes, déplacements, caméra, dessin des calques et des personnages, fondus. |
| `renderer/moteur/ambiance.js` | La teinte et la météo. |
| `renderer/moteur/sprites.js` | Le petit bonhomme des personnages, en pixel art. |

Les fichiers de `renderer/moteur/` ne touchent ni au disque ni à Electron : ils reçoivent les textes du jeu.
Ils pourront donc un jour tourner dans un simple navigateur, pour un export web du jeu.
