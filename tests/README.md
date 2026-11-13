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
  images d'une planche de sprite (Tafl 1.29).
- `essais/2-saga-modeles.js` : chaque modèle est exporté en version web, démarre dans Saga, et le
  héros se déplace, sans erreur dans la console.
- `essais/3-saga-domaine.js` : trois jours dans « Le petit domaine » (parler à Brune, construire une
  maison, dormir, les habitants arrivent, sauvegarder et reprendre), puis la reprise d'une ancienne
  sauvegarde (`sauvegardes/domaine-jour-3.json`, faite avec Saga 1.29).
- `essais/4-saga-scenes.js` : les nouveautés de Saga 1.27 à 1.29 jouées pour de vrai (changer
  d'apparence et disparaître en pleine scène, un tampon qui traverse et sort de la carte, une quête
  qui réagit à la maison posée par le joueur, jouer au doigt sur une tablette simulée).

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
