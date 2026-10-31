# Notes du projet Atelier

Ce dossier est une copie des notes de travail (mémoire du projet Claude « Custom tools ») au 2026-10-31.
Il sert à reprendre le travail dans un autre projet Claude, en particulier un projet centré sur **Tafl**.
Les notes sont surtout en anglais, quelques-unes en français.

Point de départ : [MEMORY.md](MEMORY.md) (feuille de route, décisions, préférences de Ragna, règles de version et de fusion, état de chaque outil).

## Tafl en premier

Tafl (ᛏ, `tuiles/`) est l'éditeur de tuiles, de cartes et de jeu. Saga (ᛃ, `moteur/`) est le moteur qui joue ce que Tafl décrit.

- [tafl.md](tafl.md) : architecture, versions, astuces de test
- [tafl-editeur-jeu.md](tafl-editeur-jeu.md) : Tafl devient un éditeur de jeu (cartes, passages, événements, données)
- [tafl-refonte-ui.md](tafl-refonte-ui.md) : interface en espaces (Tafl 0.30)
- [tafl-reglages-clairs.md](tafl-reglages-clairs.md) : réglages selon le pack de règles
- [tafl-026-edition.md](tafl-026-edition.md) : confort d'édition (copier-coller, historique, blocs)
- [tafl-016-progression.md](tafl-016-progression.md) : badges, argent, tenues
- [tafl-verifier-test.md](tafl-verifier-test.md) : vérificateur et test rapide
- [tafl-jetons.md](tafl-jetons.md) : économie de jetons pour Loki dans Tafl
- [comfyui.md](comfyui.md) : génération de tuiles avec ComfyUI
- [assets-lot.md](assets-lot.md) : téléchargement en lot de tilesets

## Saga et les packs de règles

- [saga.md](saga.md), [saga-tests.md](saga-tests.md), [saga-ambiance-confort.md](saga-ambiance-confort.md), [saga-export.md](saga-export.md), [objets-tenus.md](objets-tenus.md)
- [pack-jrpg.md](pack-jrpg.md), [pack-jdr.md](pack-jdr.md), [scripts-js.md](scripts-js.md)
- [mode-table.md](mode-table.md), [multijoueur.md](multijoueur.md), [multijoueur-internet.md](multijoueur-internet.md)

## Les autres outils

- Atelier (hub) : [atelier-hub.md](atelier-hub.md), [atelier-desinstaller.md](atelier-desinstaller.md), [github-limite-maj.md](github-limite-maj.md)
- Loki et Claude : [loki.md](loki.md), [loki-atelier-contexte.md](loki-atelier-contexte.md), [claude-partage.md](claude-partage.md), [claude-autorisations.md](claude-autorisations.md), [ia-locale.md](ia-locale.md)
- Rune, Skald, Brokk : [ragna-setup.md](ragna-setup.md), [skald.md](skald.md), [brokk.md](brokk.md)
- Bureautique : [mimir.md](mimir.md), [reikna.md](reikna.md), [edda.md](edda.md), [liseuse.md](liseuse.md)

## À savoir

- Les chemins `/mnt/project-files/...` (captures d'écran, scripts) désignent le dossier partagé de l'ancien projet Claude ; ces fichiers ne sont pas dans le dépôt.
- Ces notes sont un instantané. Le code et l'historique git font foi s'ils divergent.
- Fusion : uniquement après le oui explicite de Ragna. Chaque PR monte la version de l'outil dans son package.json ; à la fusion, GitHub crée le tag et la Release.

## Numéros de version (règle de Ragna, 2026-10-25)

- x.y.**Z** : corrections et petits ajouts.
- x.**Y**.0 : une vraie nouveauté visible. Plusieurs PR d'une même session de travail ne le montent qu'une fois.
- **X**.0.0 : l'outil fait ce pour quoi il est prévu et Ragna l'utilise pour de vrai ; ensuite une étape majeure.
- On ne redescend jamais un numéro (Atelier compare les versions pour proposer les mises à jour).
- Une PR qui ne touche que la doc ne monte aucune version.
