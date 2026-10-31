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
| Tab | Le **carnet** : équipe, badges, sac (avec « Utiliser »), argent, quêtes. |
| Ctrl+S | **Sauvegarder** la partie (aussi dans le menu de pause). |
| Échap | En combat : revenir en arrière (comme Retour arrière, X ou le clic droit). Ailleurs : menu de pause : reprendre, carnet, sauvegarder, options, changer de jeu ; « Outils du créateur… » regroupe recharger, recommencer, dossier du jeu et exporter (Saga 1.6.1). |
| F5 | **Recharger le jeu** depuis le disque, sans bouger le joueur : enregistre dans Tafl, appuie sur F5 dans Saga, et vois le changement. |
| F3 | Montrer le passage (rouge : bloqué, jaune : rebord), les zones, les téléporteurs (bleu) et les événements (rose), avec la case du joueur. |
| F11 | Plein écran. |
| Ctrl+O | Ouvrir un autre jeu. |
| Ctrl+, | Options : son, texte, affichage, commandes. |

Une **manette** marche aussi (croix ou stick gauche, A pour l'action, B pour revenir et courir, Start pour la pause, Select pour le carnet), et depuis Saga 0.11 dans **tous** les menus. Les touches du clavier et les boutons de la manette se changent dans Options › Commandes.

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

## Test rapide (Saga 0.10, avec Tafl 0.27)

Dans Tafl, **Jeu › Test rapide** (`Ctrl+F5`) lance Saga avec un état de départ choisi : la case de départ, l'équipe et ses niveaux (les héros pour le pack JRPG), les objets, l'argent, les badges, les interrupteurs et l'avancée des quêtes. Tafl l'écrit dans un petit fichier temporaire et lance `Saga.exe <dossier> --test=<ce fichier>` (le format est dans `tuiles/FORMAT.md`, « Test rapide »).

- Saga commence une **partie neuve**, sans proposer de continuer la sauvegarde, puis pose l'état par-dessus (`moteur.js`, `appliquerTest`). Ce qui n'est pas donné reste comme au début d'une partie.
- Un badge **Test** s'affiche dans la barre de titre. Les sauvegardes d'un test vont dans un fichier à part (`…-test.json` dans `sauvegardes`) : la vraie partie n'est jamais écrasée. F5 garde la partie de test.

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
- **Sauvegarde** : les créatures sont gardées en entier (niveau, XP, PV, IV, EV, nature, attaques et PP), ainsi que la boîte (les boîtes du PC depuis Saga 0.6) et le dernier lieu de soin. Une sauvegarde de Saga 0.2 est mise à jour toute seule.

## Ce que fait Saga 0.4 : deux thèmes pour l'interface en jeu

- Le jeu choisit son thème dans Tafl (0.15 ou plus : **Données du jeu › Réglages › Interface du jeu**), avec sa **couleur d'accent** (les noms dans les dialogues, les curseurs, la barre d'XP).
- **Verre** : des plaques sombres et floues aux coins arrondis. En combat, le texte et les boutons flottent sur le décor au lieu d'une barre opaque.
- **Pixel** : la police pixel Jersey 10 (aux chiffres bien lisibles), des cadres nets à double bordure, pas de flou ni d'arrondi, un curseur ▶, des lignes de balayage légères en combat. Façon Game Boy Advance.
- Les deux thèmes couvrent les dialogues, les choix, les annonces, le nom de la carte, le carnet et tout le combat.
- **Réglages de Saga › Interface en jeu** : « Celle choisie par le jeu », ou forcer Verre ou Pixel.

## Ce que fait Saga 0.5 : au niveau de Tafl 0.16

- **Le nom et la tenue du héros** : la commande `personnaliser` ouvre un écran où le joueur tape son nom et choisit sa tenue (avec l'aperçu du héros qui marche). `tenue` change la tenue en cours de jeu ; les tenues viennent de **Personnages › Héros** dans Tafl. `{joueur}` dans les dialogues donne le nom choisi.
- **L'argent et les badges** : commandes `argent` (donner, retirer, jamais sous 0) et `badge` (une seule fois chacun, avec une annonce), conditions « argent ≥ » et « a le badge ». Le compteur `badges` suit le nombre de badges. Le carnet (Tab) montre les badges reçus et ceux qui manquent.
- **Les boutiques** (commande `boutique`) : acheter des objets (combien ? gauche/droite ±1, haut/bas ±10) et des créatures, revendre ses objets à moitié prix (sauf les objets clés), vendre ses créatures. Un article n'apparaît que quand sa condition est vraie : badges, captures, dresseurs battus, quête…
- **Les objets hors combat** : bouton **Utiliser** dans le sac du carnet. Soins, rappels, PP, PP Plus, Repousse, pierres d'évolution, Super Bonbon (jusqu'au plafond de niveau), vitamines (EV), capsules (IV) et aromates (la nature des stats change, pas la vraie nature). Un objet sans effet n'est pas dépensé.
- **L'écran des EV** (commande `ecran_ev`, le centre) : choisir une créature, répartir ses EV au clavier ou en glissant (252 par stat, 510 en tout), avec l'effet sur les stats.
- **Le pack de règles** : le jeu dit lequel il suit (`reglages.regles`, Pokémon pour l'instant). Tout ce qui touche aux créatures passe par la porte `Regles`, pour qu'un autre pack puisse remplacer Pokémon un jour.
- Les menus ne se laissent plus voler le choix par une souris immobile sous le menu qui s'ouvre (en combat aussi).

## Ce que fait Saga 0.6 : l'équipe, le Pokédex et le PC

- **Le menu Équipe** (menu de pause, ou bouton **Équipe** du carnet ; un clic sur une créature du carnet ouvre son résumé) : changer l'ordre de l'équipe (la première part au combat), donner un surnom, voir le **résumé** d'une créature en trois pages (infos : espèce, PV, statut, nature, talent, XP jusqu'au niveau suivant ; statistiques avec IV et EV, et ce que la nature monte ▲ et baisse ▼ ; attaques avec type, catégorie, puissance, PP). Gauche/droite change de page, haut/bas passe à la créature suivante.
- **Le Pokédex** (menu de pause, ou bouton du carnet) : toutes les espèces du jeu par numéro, « ??? » pour celles jamais vues. Une espèce croisée en combat (sauvage ou de dresseur) est **vue** ; une créature reçue, attrapée, achetée ou obtenue par évolution est **attrapée**. Sa page : description, taille, poids, talents, stats de base et évolutions pour une attrapée ; juste son nom, son image et ses types pour une vue. Gauche/droite saute de 10 dans la liste.
- **Le PC** (nouvelle commande `ecran_boites` de Tafl 0.21, à mettre sur l'ordinateur du centre) : des boîtes de 30 places à gauche, l'équipe à droite. Action prend une créature, Action la pose (sur une autre, elles s'échangent) ; ou, sur une créature : déposer, prendre dans l'équipe, résumé, surnom, relâcher. En haut, gauche/droite change de boîte (une nouvelle boîte s'ajoute après la dernière qui n'est pas vide) et Action renomme la boîte. L'équipe garde toujours au moins une créature en état de se battre.
- Une créature reçue quand l'équipe est pleine va dans la première place libre du PC, et le jeu dit dans quelle boîte. Une sauvegarde de Saga 0.5 (une seule « boîte » sans places) est rangée dans les boîtes toute seule, et son Pokédex est rempli avec les créatures qu'elle a.
- Ce qu'une fiche montre vient du pack de règles (`Regles.fiche`, `Regles.dex`, `Regles.ficheEspece`, dans `regles/pokemon/fiches.js`) ; l'équipe, les boîtes et le Pokédex eux-mêmes ne dépendent d'aucune règle (`collection.js`, `ecrans.js`).

## Ce que fait Saga 0.7 : des combats plus riches, des boutiques à débloquer, les obstacles

- **Les dresseurs qui s'ajustent peuvent évoluer** (facultatif, case « Ils évoluent avec leur niveau » de Tafl 0.24) : un Bulbizarre de dresseur monté au niveau 40 par l'ajustement devient Florizarre, avec les attaques de ce niveau (sauf celles choisies dans Tafl).
- **Les sauvages peuvent suivre le joueur** (facultatif, Tafl › Réglages › Niveau des créatures sauvages, « Jamais » par défaut) : sur l'équipe ou sur le plafond des badges, avec un écart. Toute la fourchette de la zone monte, jamais en dessous de ce qu'elle dit ; leur évolution avec le niveau est une case à part.
- **L'amitié** : chaque créature a une amitié (0 à 255, départ = bonheur de l'espèce). Elle monte en gagnant des niveaux, en marchant (tous les 128 pas), avec les vitamines et les objets « Fait monter l'amitié » ; elle baisse un peu au K.O. Le résumé la montre (barre rose et une phrase). L'évolution « Par amitié » se fait à la montée de niveau quand elle atteint le seuil des réglages (220).
- **Arrêter une évolution** : pendant l'animation (plus longue, de plus en plus rapide), Retour, Échap, X, B ou clic droit l'arrête, comme dans les jeux officiels. Elle reviendra au niveau suivant. Une créature qui n'est pas au combat évolue aussi à l'écran. Hors combat (Super Bonbon), le jeu demande « Le laisser évoluer / L'en empêcher ». Une pierre utilisée depuis le sac ne se refuse pas.
- **La Pierre Stase** : un objet tenu (effet « Empêche d'évoluer » de Tafl 0.24, ou l'Everstone importée) bloque l'évolution. Nouveau dans le menu Équipe : **Faire tenir un objet** (l'ancien revient au sac).
- **L'évolution quand une quête est finie** (mode `quete` de Tafl) : la créature évolue dès que la quête se termine, ou à sa montée de niveau suivante.
- **Le plafond se voit** : « X atteint le niveau maximum (20) ! Un nouveau badge le laissera progresser. », « Niv. max 20 » en haut du menu Équipe, et l'expérience du résumé le dit.
- **Nouveaux compteurs** pour les conditions (boutiques, pages d'événements) : créatures sauvages battues, espèces vues, espèces attrapées, quêtes finies.
- **Boutiques** : un article débloqué depuis la dernière visite porte « Nouveau ! » ; un article « grisé avant » se montre déjà, grisé, avec ce qui le débloque (« 🔒 Après 10 captures (4/10) »).
- **Les obstacles, à la place des CS** (événement « Obstacle » de Tafl 0.24) : un arbre à couper ou un rocher à briser (A devant lui ; avec l'objet, Saga demande « Utiliser la Hache ? » et il disparaît), un rocher à pousser d'une case en marchant contre lui. Sans l'objet, Saga dit lequel il faudrait. Un arbre peut repousser quand on quitte la carte ; un rocher poussé revient à sa place. Un rocher poussé sur un déclencheur le lance (une énigme).
- Côté règles : `Regles` gagne trois fonctions facultatives (`sauvage`, `plafond`, `evolutionsEnAttente`) ; un autre pack qui ne les a pas garde le comportement simple.

## Ce que fait Saga 0.9 : exporter le jeu pour des testeurs

Menu de pause › **Exporter ce jeu (web, Windows)…**, ou depuis Tafl : Jeu › **Exporter le jeu…** (Tafl lance Saga sans fenêtre). On coche une version ou les deux, on choisit un dossier, et Saga y range :

- **`MonJeu-web/` et `MonJeu-web.zip`** : `index.html` + le moteur (`saga/`) + le jeu emballé dans `jeu.js`. On double-clique sur `index.html` (pas besoin d'Internet ni de serveur), ou on envoie le `.zip` sur itch.io (projet « HTML »). Les réglages et la sauvegarde restent dans le navigateur du joueur (localStorage). Le pont `web/saga-web.js` remplace `preload.js`.
- **`MonJeu/` et `MonJeu-windows.zip`** : `MonJeu.exe`, une copie de Saga (son Electron) avec Saga dans `resources/app` et le jeu dans `resources/jeu`. Rien à installer : on dézippe et on double-clique. Au lancement, Saga voit `resources/jeu` et passe en **mode joueur** : le jeu s'ouvre directement, sans les outils de Saga (pas d'ouverture d'un autre jeu, ni de rechargement F5, de vue F3, de mise à jour, d'export ou d'outils de développement F12), « Quitter le jeu » dans la pause, réglages et sauvegardes dans `%APPDATA%\MonJeu`. Windows peut prévenir que l'exe n'est pas signé (« Informations complémentaires › Exécuter quand même ») : c'est écrit dans le `LISEZMOI.txt` de l'export.
- L'export ne prend que ce que Saga lit (jeu.json, le .tafl, cartes/, donnees/) : ni les fichiers de travail, ni les sauvegardes, ni le chemin du dossier sur ton disque. Exporter à nouveau remplace l'export précédent (seulement s'il vient de Saga).
- En ligne de commande : `Saga.exe D:\Jeux\MonJeu --exporter=web,exe --sortie=D:\Exports [--rapport=rapport.json]`.
- Pour l'instant, l'exe garde l'icône de Saga.

## Ce que fait Saga 0.11 : l'ambiance et le confort de jeu (avec Tafl 0.29)

- **Musique et sons** : chaque carte a sa musique (en fondu enchaîné d'une carte à l'autre ; une maison peut garder celle de la ville) et son fond sonore en boucle (vent, ruisseau). Les combats ont leur musique (une autre contre les dresseurs) et une fanfare de victoire. Les fichiers sont dans le dossier `sons/` du jeu (MP3, OGG, WAV…), choisis dans Tafl. Sans fichier, Saga a ses propres bruitages, fabriqués à la volée : des « bips » pour les menus, le texte qui s'écrit, les portes, la sauvegarde, le choc contre un mur, et la pluie et le tonnerre de la météo (`renderer/moteur/audio.js`, Web Audio). La musique baisse pendant la pause.
- **Jour et nuit** : une horloge du jeu (une journée dure 24 minutes par défaut, réglable) ou l'heure réelle du PC. Les cartes extérieures s'assombrissent la nuit, se dorent à l'aube et au couchant ; les intérieurs ne changent pas. L'heure est dans le carnet et dans la sauvegarde. Les pages des événements peuvent dépendre du moment (condition « moment » : matin, jour, soir, nuit) et les scripts peuvent avancer l'heure (dormir à l'auberge). `renderer/moteur/temps.js`.
- **Lumières** : une tuile (lampadaire, fenêtre, feu) ou un événement (un feu de camp, un PNJ avec une lanterne) peut éclairer : un halo de sa couleur, qui peut vaciller, quand il fait sombre (la nuit ou une grotte teintée). Une seule couche de lumière, posée en produit, garde le pixel art net.
- **Options** (la pause, ou Ctrl+,) : volume de la musique et des sons, vitesse du texte (lente, normale, rapide, instantanée), plein écran, zoom, météo, thème, et **Commandes** : chaque commande (haut, bas… action, retour, courir, pause, carnet) a ses touches et ses boutons de manette, en pastilles ; « + » attend la touche ou le bouton à ajouter.
- **Manette partout** (`renderer/pad.js`) : la pause, le carnet, les options et les questions se pilotent à la croix (gauche et droite règlent les curseurs et les listes), A valide, B ferme. La manette fait aussi avancer les dialogues (avant, elle n'était lue que quand le joueur marchait).
- **Sauvegarde auto** (si le jeu l'active dans Tafl) : en changeant de carte et/ou toutes les N minutes, dans une place à part (`….auto.json`) : la sauvegarde du joueur n'est jamais écrasée. Elle attend que le joueur soit libre (pas en plein dialogue ni en combat). À l'ouverture, Saga propose la plus récente des deux. Pas de sauvegarde auto pendant un test rapide.
- **Export** : les sons partent avec le jeu (dans `resources/jeu/sons` pour l'exe, emballés dans `sons.js` pour la version web, qui se joue même d'un double-clic sur `index.html`).

## Ce que fait Saga 0.12 : les scripts JS du jeu (avec Tafl 0.31)

- **Les scripts du jeu** (`scripts/*.js`, écrits dans Tafl, voir `tuiles/SCRIPTS.md`) sont chargés au lancement dans un **bac à sable** (`commun/bac-a-sable.js`, un Web Worker sans fichiers, réseau ni page). Un script qui calcule trop longtemps est arrêté et relancé ; une erreur est montrée (en test) ou notée dans la console (jeu exporté), et le jeu continue.
- **Le bloc Script** d'un événement joue une commande déclarée par un script. Ce que demande le script (dire, choisir, donner, combattre…) devient une commande des blocs, jouée par `scripts.js` comme les autres : un script ne touche jamais la partie lui-même.
- **Les règles maison** : les packs appellent leurs formules par `Maison.formule` (voir REGLES.md, partie 7). Un script peut ainsi remplacer les dégâts, les soins, la chance de toucher, de critique, de fuite, de capture ou l'expérience.
- **Les réactions** (`quand`) : nouvelle partie, arrivée sur une carte, après un combat, changement de moment, chaque pas ; jouées quand le joueur est libre.
- **Les variables** du jeu (nombres ou textes), leur commande et leur condition ; **les dés** des scripts partent d'une graine gardée dans la sauvegarde.
- **Export** : le bac à sable part avec le jeu (version web et exe).

## Ce que fait Saga 1.1 : jouer à plusieurs sur Internet

Dans le panneau des joueurs, **Ouvrir sur Internet** : Saga demande à la box (UPnP) d'ouvrir un port vers
ce PC, et affiche l'adresse publique (`http://81.x.x.x:7777`) à donner aux amis éloignés.

- **Sûreté** : un seul port, seulement pendant la partie ; la box l'oublie à la fermeture de la partie ou
  de Saga (et d'elle-même au bout d'une heure si Saga plante). Le code passe à huit lettres (`ABCD-EFGH`),
  les mauvais codes sont limités, et **l'hôte accepte chaque nouveau joueur** avant qu'il reçoive quoi que
  ce soit. Le serveur ne sert que l'interface et le jeu ouvert, rien d'autre du PC.
- **Si la box refuse** (UPnP désactivé) : Saga explique la redirection de port à la main, puis
  « J'ai ouvert le port ». Si la box n'a pas d'adresse publique (CGNAT de l'opérateur, ou double box),
  Saga le dit : il faut demander une « IPv4 full-stack » ou une IP fixe à l'opérateur.

## Ce que fait Saga 1.0 : jouer à plusieurs (avec Tafl 1.0)

Menu de pause › **Jouer à plusieurs** : Saga ouvre un petit serveur sur le réseau de la maison et affiche
une adresse (`http://192.168.x.x:7777`) et un code de quatre lettres. Les amis ouvrent l'adresse dans leur
navigateur (PC, tablette, téléphone), entrent le code et leur prénom : **rien à installer**.

- **La discussion** : un panneau avec la liste des joueurs, les messages à tous ou en privé, et des bulles
  quand le panneau est replié. L'hôte peut retirer quelqu'un de la partie.
- **Les autres jeux (Pokémon, JRPG…)** : chacun joue **sa** partie (gardée dans son navigateur) dans le jeu
  de l'hôte, et on se voit marcher sur les mêmes cartes, avec son prénom au-dessus de la tête. Chacun
  choisit son apparence parmi les personnages du jeu.
  - **Échanger** (face à face, touche Action) : une créature, un objet, de l'argent ; les deux voient les
    deux offres et confirment.
  - **Défier** : un duel amical. Rien n'est perdu ni gagné : les équipes reviennent comme avant. Celui qui
    défie calcule le combat, l'autre le voit et choisit ses attaques et ses changements.
- **Les parties de table (pack JDR)** : chaque ami reçoit la vue de **son rôle** (le MJ donne un héros à
  chacun dans son panneau, ou laisse un spectateur). Un joueur déplace son héros, parle aux PNJ, lit sa
  fiche et lance ses jets (c'est l'hôte qui lance les dés, et la ligne va au journal commun). Ce qui est
  caché ne quitte **jamais** la machine du MJ : chaque vue est calculée pour son rôle avant de partir.
- **L'écran « compose ton équipe »** (commande de Tafl) : le joueur choisit lui-même jusqu'à six créatures
  du jeu, à un niveau donné. Le modèle de jeu **Arène de duel** de Tafl s'en sert : deux bornes, un terrain,
  et deux amis qui s'affrontent.

Tout passe par des messages simples (rejoindre, vue, action) : un relais sur un serveur pourra plus tard
remplacer le réseau local pour jouer à distance.

## Ce que fait Saga 1.4 : les modules de jeu

Un jeu a toujours **un pack de règles** (Pokémon, JRPG ou JDR : comment on se bat et comment on progresse). Il peut maintenant activer en plus des **modules** : chacun ajoute au monde une chose que le jeu sait faire en plus, quel que soit le pack, et un jeu peut en avoir plusieurs (« JRPG + gestion », « Pokémon + gestion »…).

- Le jeu choisit ses modules dans Tafl 1.2 (Données › Réglages › Règles du jeu › Modules), c'est-à-dire `reglages.modules`.
- Un module garde son état dans la partie (`partie.modules`), sauvegardé avec elle. Il peut dessiner sur la carte, bloquer des cases (un bâtiment posé en jeu), ajouter des commandes d'événement, des conditions de page, des choix au menu de pause, et annoncer ses moments aux scripts JS (`quand(...)`), qui le lisent dans `saga.modules`.
- Le contrat complet, ce qu'un module a le droit de faire et un exemple : `renderer/moteur/modules/MODULES.md`. La description des modules pour Tafl : `commun/modules.js`.

Saga 1.4 pose les fondations ; Saga 1.5 livre le premier module.

## Ce que fait Saga 1.5 : les journées et le module « gestion »

- **Dormir** (pour tous les jeux) : la commande `dormir` termine le jour. Les modules font leur calcul de la nuit, le jour passe au suivant (`partie.jour`), fondu au noir, réveil à l'heure dite et rapport du matin. La condition `jour` et `saga.jour` lisent le numéro du jour ; les scripts reçoivent les moments `fin_de_journee` et `matin`. Les modules ont une fonction de plus dans leur contrat, `finDeJournee` (MODULES.md).
- **Le module gestion** (`renderer/moteur/modules/gestion/`) : un stock commun et des bâtiments définis par les données du jeu (coût, nuits de chantier, production et consommation par nuit). La nuit se calcule une seule fois par jour, en fonctions pures (`calcul.js`, testé sans écran). Ses commandes : construire (branches réussi / raté), ajouter ou retirer du stock, déposer le sac au stock, ouvrir l'écran du domaine ; ses conditions : un bâtiment construit, un chantier en cours, assez d'une ressource ; l'écran du domaine dans le carnet (Tab) ; `saga.modules.gestion` pour les scripts.
- **Le placement libre** : le joueur pose ses bâtiments où il veut dans une zone « constructible » de la carte (carnet › Construire, ou la commande « Placer un bâtiment ») : il les déplace avec les flèches, vert s'ils tiennent, rouge sinon, et les pose avec la touche d'action. Le bâtiment est dessiné avec son tampon de Tafl (le toit passe devant le joueur), son chantier en transparence ou avec son propre tampon, et son emprise bloque le passage sauf la porte. Le contrat des modules prête pour ça la carte, le joueur, `libre(x, y)` et `viser(…)` (MODULES.md). Un bâtiment peut aussi rester à un emplacement fixe (un événement avec la condition « Un bâtiment est construit »).

## Ce que fait Saga 1.6 : les habitants et les récoltes qui repoussent

- **Ce qui repousse** (pour tous les jeux) : un événement avec `repousse_nuits` (un buisson de baies, un arbre fruitier, un arbre coupé, un coffre qui se remplit) revient à sa première page après ce nombre de nuits : son « déjà fait » s'éteint tout seul quand le joueur dort.
- **Les habitants** (module gestion) : ils logent dans les bâtiments finis (`logement`), mangent chaque nuit (`repas` dans les réglages du module) et font tourner les bâtiments qui demandent des `ouvriers`. Ils arrivent la nuit quand il reste un logement et que personne n'a eu faim ; s'il manque à manger, ils travaillent quand même (Saga 1.6.1 : avant, une ferme sans blé restait sans ouvriers pour toujours), et chaque jeu choisit ce que fait la faim : rien, bloquer les arrivées (par défaut), ou en plus des départs après quelques nuits. La commande `gestion_habitants` en amène ou en fait partir (une histoire), la condition `gestion_habitants` compte, le moment `gestion_arrivee` prévient les scripts, et l'écran du domaine montre les habitants et le travail. Ils ne se promènent pas encore sur la carte.
- **Saga 1.6.1** : un bâtiment posé ne bloque plus tout son rectangle. Son passage se règle case par case (une ombre ou le toit laissent passer), et sa porte peut mener à un intérieur ; la commande `gestion_sortir` en ressort. Le contrat des modules gagne `teleporteur(o, x, y)`. Chaque bâtiment posé a sa propre copie de son intérieur (la carte `intérieur@b3` : mêmes calques, mais ce qu'on y fait ne vaut que pour elle), sauf si son type le partage (`interieur: "partage"`). Les copies de carte (`base@copie`) sont dans le cœur de Saga, pour tout module. Le menu de pause s'allège : les choix du pack et des modules (le domaine, construire, les jets de dés) deviennent des boutons du carnet (Tab), et les outils du créateur ont leur page.
- **Saga 1.6.2** : le carnet se mène au clavier (et à la manette). Les choix du jeu (le domaine, construire) ont leur rangée sous l'en-tête et reçoivent le focus à l'ouverture ; les flèches passent d'un bouton à l'autre, Action appuie. Pendant la visée d'un bâtiment, le reste de la carte s'assombrit et les zones constructibles ressortent, bordées de pointillés.

## Ce que fait Saga 1.7 : les objets tenus en combat, l'arène au détail

- **Les objets tenus agissent enfin en combat.** Un objet peut décrire ce qu'il fait quand une créature le tient (champ `tenu` de Tafl 1.5 : dégâts, type renforcé, statistique, PV par tour, PV rendus en blessant, baie, guérison d'un statut, survie à un coup fatal). Les objets officiels importés les plus connus marchent sans rien régler : Orbe Vie (+30 % de dégâts, 10 % de PV en moins à chaque attaque), Bandeau Muscle, Lunettes Sages, Bandeau / Lunettes / Mouchoir Choix (+50 %, mais une seule attaque jusqu'au changement), Veste de Combat, Évoluroc, Restes, Grelot Coque, Ceinture Force, Baies Sitrus, Oran, Prine (et les baies de statut), et les dix-huit objets de type (Charbon, Eau Mystique…). Une baie mangée disparaît.
- **Des pastilles au-dessus de la créature** disent ce qui est en cours : « Atq +2 », « Déf −1 », « Confus », « Apeuré », « Choix » et l'objet tenu. Vert quand c'est bon pour elle, rouge sinon. L'invité d'un duel les voit aussi, de son côté.
- **L'arène au détail** : la fiche de chaque créature choisie a trois onglets, Attaques (avec recherche), Objet tenu (une recherche, plus une liste de 800 objets) et Détails : nature, talent, IV et EV aux curseurs, avec « Tout au max », « Tout à zéro » et le total des EV (510 au plus).
- **Les capacités œufs** comptent dans les attaques qu'on peut choisir dans l'arène (Tafl 1.5 les importe depuis PokeAPI, champ `oeufs` de chaque espèce).
- Côté règles : `Regles` gagne `detailsPossibles` (facultatif) et l'écran de combat `etats(cote, liste)`.

## Ce que fait Saga 1.8 : les effets de combat, et le défi inversé

- **Les effets qui manquaient au combat** (pack Pokémon) : **vent arrière** (vitesse ×2 pour son équipe, 4 tours), **Mur Lumière** et **Protection** (attaques spéciales ou physiques ÷2 pour son équipe, 5 tours), **provoc** (plus d'attaque de statut, 3 tours), **vampigraine** (elle perd des PV, rendus à l'autre), **piège** (elle perd des PV et ne peut ni changer ni fuir), **bâillement** (elle s'endort au tour suivant), **attraction** (elle rate la moitié de ses tours), **abri** (rien ne la touche ce tour-ci) et les quatre **météos** (pluie, soleil, tempête de sable, grêle). Chacun se voit sur une pastille, avec ses tours restants.
- Les attaques officielles correspondantes sont **reconnues à l'import** (Vent Arrière, Provoc, Vampigraine, Danse Pluie, Abri, Ligotage…) ; pour une attaque à soi, Tafl a un champ « Effet de combat ».
- **Le défi inversé** : la commande `composer_equipe` de Tafl peut être « pour l'adversaire ». Les deux joueurs choisissent en même temps, chacun pour l'autre ; quand les deux ont fini, chacun reçoit l'équipe que l'autre lui a composée. Le modèle « Arène de duel » a une borne du milieu qui le lance à trois créatures. Le menu devant un autre joueur a aussi « Composer vos équipes ».

## La suite

1. Les combats en duo et les talents qui changent le combat.
2. Un deuxième pack de règles, pour vérifier que Saga n'est pas lié à Pokémon.

## Comment c'est construit

Electron, sans framework ni bundler, comme Tafl. Le jeu tourne dans un `<canvas>`.

| Fichier | Rôle |
|---|---|
| `main.js` | La fenêtre, les réglages, la lecture du dossier de jeu (Saga n'y écrit jamais), les sauvegardes, la ligne de commande (`Saga.exe <dossier> --carte=… --x=… --y=…`, `--test=<fichier>` pour un test rapide de Tafl), la mise à jour. |
| `preload.js` | Le pont entre l'interface et `main.js` (`window.saga`). |
| `exporter.js` | L'export du jeu en version web et Windows (Saga 0.9), et un petit écrivain de .zip. |
| `web/saga-web.js` | Le pont `window.saga` dans un navigateur (export web). |
| `reseau.js` | Saga 1.0 : le petit serveur de l'hôte (les amis rejoignent par leur navigateur), le relais des vues, des positions, du chat et des messages entre joueurs. |
| `web/saga-reseau.js` | Saga 1.0 : le pont `window.saga` chez un ami qui a rejoint (l'écran du code, le flux de l'hôte, sa sauvegarde dans son navigateur). |
| `renderer/moteur/reseau/multi.js` | Saga 1.0 : le panneau des joueurs et la discussion (chez l'hôte comme chez un ami). |
| `renderer/moteur/reseau/monde.js` | Saga 1.0 : le monde partagé (se voir, s'approcher, échanger, se défier). |
| `renderer/moteur/reseau/duel.js` | Saga 1.0 : le duel entre deux joueurs (un calcule, l'autre voit et choisit). |
| `renderer/moteur/equipe-libre.js` | Saga 1.0 : l'écran où le joueur compose son équipe — ses créatures, leurs quatre attaques et leur objet (les jeux « arène »). |
| `renderer/app.js` | L'interface autour du jeu : accueil, menu de pause, réglages, plein écran, raccourcis. |
| `renderer/moteur/jeu.js` | Le chargement : les textes du dossier de jeu deviennent des objets prêts à jouer (toutes les tuiles recollées dans une planche). |
| `renderer/moteur/monde.js` | La partie en cours (interrupteurs, quêtes, sac…), les conditions des événements, et ce qu'on demande à une carte (bloqué ? téléporteur ? qui est là ?). |
| `renderer/moteur/moteur.js` | La boucle du jeu : commandes, déplacements, caméra, dessin des calques et des personnages, fondus. |
| `renderer/moteur/ambiance.js` | La lumière (teinte de la carte, jour et nuit, lampes) et la météo. |
| `renderer/moteur/temps.js` | L'horloge du jeu, la lumière du ciel à chaque heure, les moments de la journée (Saga 0.11). |
| `renderer/moteur/audio.js` | La musique, les fonds sonores et les bruitages, avec les sons intégrés (Saga 0.11). |
| `renderer/commandes.js` | Options › Commandes : les touches et les boutons de manette du joueur (Saga 0.11). |
| `renderer/pad.js` | La manette dans les menus autour du jeu (Saga 0.11). |
| `renderer/moteur/dialogue.js` | La boîte de dialogue, les choix et les annonces (en HTML, posés sur le canvas). |
| `renderer/moteur/scripts.js` | Joue les commandes des événements, une par une. |
| `renderer/moteur/scripts-js.js` | Saga 0.12 : les scripts JS du jeu (l'hôte du bac à sable) et `Maison.formule`, les règles maison des packs. |
| `../commun/bac-a-sable.js` | Saga 0.12 : le bac à sable des scripts (partagé avec Tafl, copié au `npm install`). |
| `renderer/polices/` | La police pixel Jersey 10 (licence SIL OFL, dans `OFL.txt`). |
| `renderer/moteur/regles/regles.js` | **La porte des règles** : le moteur ne parle qu'à elle pour tout ce qui touche aux créatures et aux combats. |
| `renderer/moteur/regles/pokemon/creatures.js` | Les créatures : statistiques, XP, niveaux, attaques apprises, évolutions, plafond de niveau. |
| `renderer/moteur/regles/pokemon/combat.js` | Le déroulé d'un combat : tours, dégâts, statuts, sac, capture, fuite, XP, dresseurs. |
| `renderer/moteur/regles/pokemon/hors-combat.js` | Ce qui touche aux créatures hors combat : les objets du sac, l'écran des EV, le prix d'une créature vendue. |
| `renderer/moteur/regles/pokemon/fiches.js` | Ce que montrent le résumé d'une créature et les pages du Pokédex. |
| `renderer/moteur/menus.js` | Les menus du jeu hors combat : une liste, le choix d'une quantité, l'écran des EV, une fiche à pages, un nom à taper, un écran libre. |
| `renderer/moteur/collection.js` | L'équipe, les boîtes du PC et le Pokédex (vus, attrapés) : où ranger une créature reçue. |
| `renderer/moteur/ecrans.js` | Le menu Équipe, le Pokédex et le PC. |
| `renderer/moteur/boutique.js` | Les boutiques : acheter, revendre, vendre des créatures, articles débloqués par les succès. |
| `renderer/moteur/personnaliser.js` | L'écran du nom et de la tenue du héros. |
| `renderer/moteur/ecran-combat.js` | L'écran de combat (en HTML, posé sur le canvas) : créatures, barres, messages, menus, animations et le journal du combat (touche J, Saga 1.2). |
| `renderer/moteur/sprites.js` | Les personnages sur la carte : leur sprite de Tafl, ou le petit bonhomme en pixel art. |

**Des règles remplaçables.** Les règles de combat et de créatures (aujourd'hui celles de Pokémon) sont rangées à part, dans `renderer/moteur/regles/pokemon/`. Le moteur (cartes, déplacements, scripts, sauvegarde) ne les appelle jamais directement : il passe par `regles.js`, qui dit en tête de fichier la petite liste de fonctions qu'un jeu de règles doit fournir (créer une créature, la soigner, la résumer pour le carnet, lancer un combat…). Pour un jeu avec d'autres règles, on écrira un autre dossier à côté de `pokemon/`, sans toucher au moteur. L'écran de combat, lui, ne connaît aucune règle : il montre ce qu'on lui dit.

Les fichiers de `renderer/moteur/` ne touchent ni au disque ni à Electron : ils reçoivent les textes du jeu.
Ils pourront donc un jour tourner dans un simple navigateur, pour un export web du jeu.
