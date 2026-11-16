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

## Les lancer sur un PC (pour un développeur)

```
cd moteur && npm ci --ignore-scripts && node ../commun/copier.js && cd ..
cd tuiles && node ../commun/copier.js && cd ..
cd tests && npm install && npx playwright install chromium && node lancer.js
```

`node lancer.js domaine` ne lance que les essais dont le nom contient « domaine ».

## Ajouter un essai

Un fichier de `essais/` exporte une liste `[{ nom, faire(ctx) }]`. `lib/tafl.js` ouvre Tafl
(`ouvrirTafl`, `nouveauJeu`, `verifier`, `fichiersDuJeu`), `lib/saga.js` exporte et joue un jeu
(`jeuDuModele`, `ouvrirSaga`, puis `aller`, `regarder`, `agir`, `finir`, `partie`…), `lib/verifier.js`
dit ce qui ne va pas (`egal`, `vrai`, `sansErreur`). Passer `ctx` à `ouvrirTafl`/`ouvrirSaga` pour
que la page soit fermée à la fin et capturée si l'essai rate.

Quand le format des sauvegardes change, garder l'ancienne sauvegarde et en ajouter une nouvelle :
`GARDER_SAUVEGARDE=1 node lancer.js "trois jours"` réécrit `sauvegardes/domaine-jour-3.json`.
