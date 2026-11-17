# Les essais automatiques de Tafl et Saga

Un robot ouvre Tafl et Saga dans un navigateur sans fenêtre (Chromium) et fait ce qu'un joueur ou
un auteur ferait : créer un jeu à partir d'un modèle, chercher une commande, jouer, construire,
dormir, sauvegarder… Puis il vérifie que tout s'est passé comme prévu.

Ils tournent tout seuls sur GitHub à chaque pull request qui touche `tuiles/`, `moteur/`, `commun/`
ou `tests/` (onglet **Checks** de la PR, « Essais Tafl et Saga »). Une PR rouge veut dire qu'une
chose qui marchait ne marche plus : les captures d'écran des essais ratés se téléchargent depuis
la page de l'essai (rubrique **Artifacts**).

## Ce qui est essayé

- `essais/1-tafl.js` : Tafl démarre ; chaque modèle de Fichier › Nouveau jeu passe le vérificateur
  sans erreur ; chercher une commande ou une condition (Tafl 1.32) ; remettre dans l'ordre les
  images d'une planche de sprite (Tafl 1.29) ; partir du personnage de base de Saga (Tafl 1.34).
- `essais/2-saga-modeles.js` : chaque modèle est exporté en version web, démarre dans Saga, et le
  héros se déplace, sans erreur dans la console.
- `essais/3-saga-domaine.js` : trois jours dans « Le petit domaine » (parler à Brune, construire une
  maison, dormir, les habitants arrivent, sauvegarder et reprendre), puis la reprise d'une ancienne
  sauvegarde (`sauvegardes/domaine-jour-3.json`, faite avec Saga 1.29).
- `essais/4-saga-scenes.js` : les nouveautés de Saga 1.27 à 1.29 jouées pour de vrai (changer
  d'apparence et disparaître en pleine scène, un tampon qui traverse et sort de la carte, une quête
  qui réagit à la maison posée par le joueur, jouer au doigt sur une tablette simulée).
- `essais/6-saga-perso-base.js` : le personnage de base de Saga 1.31 (ses planches en 16 et 32 px),
  qui marche et frappe en temps réel dans « Le petit donjon ».

- `essais/7-saga-table-outils.js` : les outils de la séance au mode table de Saga 1.32 (jets `/r` et `/gr`,
  macros et `@`, gabarits, ping, marques, la règle, l'écran d'un joueur et ses demandes).

- `essais/8-relais.js` : le relais de Saga 1.33 (`relais/relais.js` sur 127.0.0.1) : mauvaise clé refusée,
  un ami ouvre le lien d'invitation, attend l'accord du MJ, se connecte et envoie une demande.

- `essais/9-compagnon.js` : le compagnon de Saga 1.34 sur un téléphone simulé (Pixel 7) : le QR du MJ, le
  téléphone relié, un jet dont les dés s'arrêtent sur ceux de Saga, une macro, les PV d'un pion, le fond, puis le téléphone d'un joueur (macros calculées, fiche, dés), le lien coupé.

- `essais/10-saga-table-interface.js` : la table en verre de Saga 1.35 : les onglets du MJ, une macro à la
  touche 1, le chat, le tapis de dés, les PV du pion choisi, la largeur retenue ; puis un ami dans son
  navigateur (ses onglets, ses macros calculées, le chat, sa fiche, le tapis), et un combat (le menu du tour
  à côté du plateau, l'initiative en haut, les phrases du combat dans le chat), le tapis déplacé et redimensionné, deux rencontres lancées ensemble,
  Échap qui ouvre le menu du jeu en plein combat (Saga 1.36).

- `essais/11-saga-documents.js` : les documents de Saga 1.37 : une lettre en brouillon donnée à un seul ami et
  ouverte chez lui, une carte montrée à tous, le serveur qui refuse l'image à qui ne l'a pas, la photo prise par
  le téléphone du MJ, le téléphone d'un joueur (vibration, « Nouveau »), un document repris.

- `essais/12-saga-campagne.js` : la salle de campagne de Saga 1.38 avec un vrai relais (dossier de données
  temporaire) : le même lien et le même code d'une séance à l'autre, la copie déposée chiffrée (le relais ne lit
  pas la fiche), le mauvais secret refusé, le téléphone hors séance (fiche, documents, même rouvert), deux
  changements proposés puis acceptés par le MJ, le téléphone qui repasse en direct, un téléphone coupé.
  Saga 1.39 : le compagnon ouvert sur le PC de l'ami (le lien de la partie y mène hors séance, icônes comprises),
  un téléphone qui rejoint sans QR (prénom et code) et prend un héros libre, le manifeste commun au relais.
  Les essais du mode table vérifient aussi que le MJ commence sans héros.

- `essais/13-saga-mecaniques.js` : les mécaniques sans code de Saga 1.41 : la défense et l'armure lues dans la fiche,
  un monstre qui garde sa CA, les paliers et leur malus (un test au d20 aussi), la blessure tirée sur sa table, les
  jets pour tenir, puis un vrai combat du pack joué par une interface qui choisit seule.
  Un second essai règle un autre système : d100 sous un score, réserve de d6, 2d6 à paliers, les bonus à cocher (le
  MJ en ajoute depuis la fiche, le joueur le coche, il compte une fois), les repos et les niveaux à formule, puis un
  combat avec parade (celle d'un monstre, lue dans ses champs), localisation, héros d'abord et un poison par tour.

- `essais/15-saga-calque-initiative.js` : Saga 1.43 : un trait au feutre (à la souris) sur le calque du MJ, une note
  pour tous, ce qu'en voit un joueur, la corbeille du calque ; l'initiative à la main (jeter pour tous, une ligne
  libre, Suivant, un nouveau tour, un joueur qui n'y touche pas).

- `essais/16-saga-initiative-reglable.js` : Saga 1.44 : retarder, agir maintenant, glisser une ligne, l'ordre libre (aussi
  dans un combat de Saga où le MJ choisit qui agit), une image déposée sur le plateau, un monstre posé caché ; Tafl 1.38
  garde l'ordre libre dans les mécaniques.

- `essais/17-saga-vision.js` : Saga 1.45 : les lignes de vue (mur, eau transparente), ce qui reste exploré sans le monstre
  qui s'y tient, le noir à tâtons, une lanterne, la vision dans le noir du nain ; Tafl 1.39 garde une tuile transparente.

- `essais/18-saga-musique-partagee.js` : Saga 1.46 : la musique et un bruitage du MJ demandés par le navigateur d'un ami,
  son bouton de son retenu, le MJ qui garde le son pour lui ; le menu du MJ sans bestiaire, sac, quêtes ni jets de dés.

- `essais/19-saga-scripts-table.js` : Saga 1.47 : le modèle « Réactions à la table » de Tafl dans un jeu ; « !soin » dans le
  chat du MJ rend des PV et le chat le dit ; à son tour, un héros à moins de la moitié de ses PV reçoit la marque rouge.
- `essais/20-saga-auras-listes.js` : Saga 1.48 : une aura (vue de tous, puis du MJ seul) ; une liste de deux morceaux
  qui s'enchaînent en boucle, arrêtée par une autre musique.
- `essais/21-saga-cartes-separees.js` : Saga 1.48 : un héros envoyé sur une autre carte (son joueur la voit), « Y aller
  seul », puis le groupe réuni.
- `essais/22-saga-pings-gabarits-regle.js` : Saga 1.49 : un ping bleu, un gabarit de flammes qui s'en va au bout de 3 s,
  la règle d'un joueur vue du MJ, celle du MJ vue des joueurs, sauf en secret.

- `essais/22-tafl-ergonomie.js` : Tafl 1.42 : un nouveau jeu vide choisit son pack (un modèle apporte le sien), les outils
  d'un autre espace cachés, les Réglages de Tafl en onglets, les événements semblables groupés en « × N ».

## Les lancer sur un PC (pour un développeur)

```
cd moteur && npm ci --ignore-scripts && node ../commun/copier.js && cd ..
cd tuiles && node ../commun/copier.js && cd ..
cd tests && npm install && npx playwright install chromium && node lancer.js
```

`node lancer.js domaine` ne lance que les essais dont le nom contient « domaine ».

Pour attendre moins longtemps, `node lancer.js --parallele 4` lance 4 parts en même temps (chacune
son Chromium) et donne le total à la fin (environ 80 s au lieu de 4 min sur un PC à 4 cœurs).
`--partie 2/4` ne lance que la 2e part : c'est ce que fait GitHub, avec les 4 parts sur 4 machines
à la fois. Les essais d'un même fichier restent ensemble, dans l'ordre. Les parts s'équilibrent
avec `durees.json` ; après avoir ajouté un gros essai, `node lancer.js --noter-durees` (un passage
complet, sans mot) réécrit ce fichier. Chaque essai qui ouvre une partie en réseau prend son propre
port (7840, 7851, 7853…) : un nouvel essai en prend un qui n'est pas encore utilisé.

## Ajouter un essai

Un fichier de `essais/` exporte une liste `[{ nom, faire(ctx) }]`. `lib/tafl.js` ouvre Tafl
(`ouvrirTafl`, `nouveauJeu`, `verifier`, `fichiersDuJeu`), `lib/saga.js` exporte et joue un jeu
(`jeuDuModele`, `ouvrirSaga`, puis `aller`, `regarder`, `agir`, `finir`, `partie`…), `lib/verifier.js`
dit ce qui ne va pas (`egal`, `vrai`, `sansErreur`). Passer `ctx` à `ouvrirTafl`/`ouvrirSaga` pour
que la page soit fermée à la fin et capturée si l'essai rate.

Quand le format des sauvegardes change, garder l'ancienne sauvegarde et en ajouter une nouvelle :
`GARDER_SAUVEGARDE=1 node lancer.js "trois jours"` réécrit `sauvegardes/domaine-jour-3.json`.
