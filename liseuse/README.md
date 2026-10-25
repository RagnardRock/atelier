# Kenning ᚲ : la liseuse d'eBooks

Kenning est la liseuse d'Atelier : une **bibliothèque** pour ranger ses livres, et une **lecture** confortable, page par page ou en continu. Son nom vient des *kenningar*, les images poétiques des scaldes nordiques (« la route des baleines » pour la mer) : des mots qui en racontent d'autres. Sa rune est ᚲ (Kenaz, la torche, la connaissance).

Mímir reste l'outil des documents (PDF à annoter et signer, Word, BD) ; Kenning est fait pour les romans : on y range sa bibliothèque et on y lit des heures.

Même direction artistique que les autres outils : mode sombre, verre dépoli, réglages dans l'interface (aucun JSON à écrire). La couleur d'accent par défaut est le lavande de son icône.

## Ce qu'il lit

| Format | Remarques |
|---|---|
| **EPUB** (`.epub`) | Le format des livres numériques ouverts (Gallica, Wolne Lektury, Gutenberg, la plupart des librairies). |
| **Kindle** (`.mobi`, `.azw3`, `.azw`) | Les livres Kindle **sans DRM**. Ceux achetés chez Amazon sont chiffrés : Kenning le dit au lieu d'afficher du charabia. |
| **FictionBook** (`.fb2`, `.fbz`, `.fb2.zip`) | Très répandu pour les livres russes et polonais. |
| **BD** (`.cbz`) | Lisible aussi, mais Mímir fait mieux (deux pages, sens manga). |
| **Texte** (`.txt`) | Découpé en chapitres aux lignes qui en ont l'air (« Chapitre 3 », « Rozdział II », « IV. »…). UTF-8, sinon l'encodage Windows polonais ou français. |

Les PDF s'ouvrent dans Mímir. Les scripts d'un livre ne s'exécutent jamais.

Le moteur de lecture est [foliate-js](https://github.com/johnfactotum/foliate-js) (celui de la liseuse Foliate sous Linux), copié tel quel dans `renderer/foliate/` (voir `renderer/foliate/LISEZMOI.md`).

## La bibliothèque

- **Ajouter des livres** : bouton « Ajouter des livres » (`Ctrl+O`), glisser des fichiers ou un dossier sur la fenêtre, ou double-clic sur un EPUB dans l'Explorateur (l'installeur déclare Kenning pour ces formats).
- **Dossiers surveillés** (bouton « Dossiers ») : Kenning range tout seul les livres d'un dossier et de ses sous-dossiers, et voit ceux qu'on y ajoute pendant qu'il est ouvert. Sous Windows, il propose `D:\Livres` s'il existe. Un livre déplacé dans un dossier surveillé est retrouvé (même nom, même taille) avec ses surlignages et sa progression.
- **Couvertures** : celle du livre, sinon une couverture dessinée avec le titre et l'auteur. Vue en couvertures (avec un curseur de taille) ou en liste.
- **Rayons** à gauche : Tous les livres, En cours, À lire, Terminés, Avec surlignages, Introuvables (fichier disparu), les **collections** (à créer avec `+`, glisser un livre dessus pour l'y ranger, clic droit pour renommer ou supprimer) et les **langues** quand il y en a plusieurs.
- **Chercher** un titre, un auteur ou une série, **trier** par dernière lecture, titre, auteur, progression ou date d'ajout.
- **Reprendre** : le bandeau du haut rouvre le dernier livre à l'endroit exact où tu t'étais arrêté, avec le temps qu'il reste pour le finir.
- **Fiche du livre** (clic droit › Fiche, ou bouton ⓘ pendant la lecture) : titre, auteur, série et tome, langue, statut, collections et une note perso, modifiables. Les changements restent dans Kenning, le fichier du livre n'est pas touché.

## La lecture

- **Tourner les pages** : flèches, `Page suivante`, `Espace`, molette, ou clic sur les bords gauche et droit de la page.
- **Pages ou défilement**, une, deux ou trois **colonnes** (ou automatique selon la largeur de la fenêtre).
- **Réglages de lecture** (bouton Aa, `Ctrl+T`), appliqués tout de suite :
  - Thème des pages : sombre, nuit (noir pur), sépia, clair.
  - **Lumière chaude** : un filtre orangé pour le soir.
  - Police : Literata (dessinée pour les liseuses), Atkinson Hyperlegible, OpenDyslexic, ou les polices de Windows. Ou garder celle de l'éditeur du livre.
  - Taille du texte (`Ctrl++`, `Ctrl+-`), interligne, largeur des colonnes, marges, texte justifié, coupure des mots en fin de ligne, animation des pages.
- **Panneau de gauche** (`Ctrl+B`) : Sommaire, Notes (les surlignages), Pages (les marque-pages) et Chercher.
- **Surligner** : sélectionne un passage, une bulle propose quatre couleurs, une note, copier, chercher, ou demander à Loki de l'expliquer. Un clic sur un surlignage le recolore, modifie sa note ou le supprime. L'onglet Notes les liste par chapitre et les **exporte en Markdown**.
- **Marque-pages** : `Ctrl+D` ou le bouton signet.
- **Chercher dans le livre** (`Ctrl+F`) : les accents et les majuscules ne comptent pas.
- **Pied de page** : la position, une barre de progression avec les chapitres (clic pour y aller), le pourcentage et le **temps qu'il reste dans le chapitre**, calculé d'après ta vitesse de lecture réelle.
- **Plein écran immersif** (`F11`) : seul le texte reste, les barres reviennent quand la souris approche des bords.
- La position est gardée en continu : en rouvrant le livre (ou Kenning), tu reprends à la phrase près.

## Loki dans Kenning

Le bouton ᛚ de la barre de titre (ou `Ctrl+Maj+K`) ouvre le **panneau Loki**, le même que dans les autres outils (son code est dans `commun/`). Il tourne avec ton compte Claude, par Claude Code installé sur le PC.

- **Regarder** (sans demander) : la bibliothèque, le livre ouvert et le chapitre en cours, le texte d'un chapitre (même d'un autre livre), le texte affiché, chercher dans le livre, aller à un chapitre, ouvrir un livre, lister les surlignages.
- **Agir** (avec ta permission, carte Autoriser / Refuser) : surligner un passage avec une note, ranger un livre (statut, collection), corriger sa fiche, changer les réglages de lecture.
- Exemples : « résume-moi le chapitre précédent », « qui est ce personnage ? », « explique cette phrase en polonais mot à mot », « range mes livres de fantasy dans une collection ».
- Loki ne raconte rien au-delà du chapitre où tu es, sauf si tu le demandes.
- Chaque famille d'actions a sa case « toujours autoriser » dans les réglages (`Ctrl+,`), et le bouclier du panneau.

## Pour le futur tuteur de langues

`renderer/livre.js` ne dépend pas de l'affichage : il ouvre un livre, liste ses chapitres et donne le texte d'un chapitre en paragraphes, découpés en **phrases** et en **mots** selon les règles de la langue du livre (`Intl.Segmenter`). Le tuteur de polonais prévu plus tard s'en servira pour la lecture guidée chapitre par chapitre.

## Raccourcis

| Raccourci | Action |
|---|---|
| `Ctrl+O` | Ajouter des livres |
| `Ctrl+F` | Chercher (dans la bibliothèque, ou dans le livre ouvert) |
| `←` `→`, `Page préc.` `Page suiv.`, `Espace` | Page précédente / suivante |
| `↑` `↓` | Page précédente / suivante (mode pages) |
| `Début`, `Fin` | Premier / dernier chapitre |
| `Ctrl+B` | Panneau de gauche |
| `Ctrl+T` | Réglages de lecture |
| `Ctrl+D` | Marque-page |
| `Ctrl++`, `Ctrl+-` | Texte plus grand, plus petit |
| `F11` | Plein écran immersif |
| `Échap` | Fermer la bulle, le plein écran ou les réglages, sinon revenir à la bibliothèque |
| `Ctrl+Maj+K` | Panneau Loki |
| `Ctrl+,` | Réglages de Kenning |

## Lancer Kenning depuis le clone

```bat
cd liseuse
npm install
npm start
```

`npm install` télécharge Electron, les polices et les autres librairies dans `liseuse/node_modules/`, et copie le panneau Loki commun dans `liseuse/commun/`. `npm start -- D:\Livres\livre.epub` ajoute et ouvre directement un livre.

## Installer Kenning (Windows)

Le plus simple : depuis **Atelier**, catégorie Bureautique, bouton **Installer** sur la carte Kenning.

Sinon : sur chaque pull request qui touche `liseuse/`, GitHub fabrique `Kenning-Setup-<version>.exe` (onglet **Checks** de la PR, rubrique « Artifacts »). Pour publier une version, monte la version dans `liseuse/package.json` dans la PR. Quand elle est fusionnée sur `main`, GitHub crée l'étiquette `kenning-v<version>` et publie l'installeur dans les **Releases**, sans la marquer « Latest ».

## Mettre Kenning à jour

Le bouton nuage en haut à droite, comme dans les autres outils.

- **Kenning installé** : il cherche la Release `kenning-vX.Y.Z` la plus récente, télécharge son installeur, se ferme, s'installe sans fenêtre et se relance.
- **Kenning lancé depuis le clone** : il lance `liseuse/mettre-a-jour.bat` (git pull, puis npm install) dans une fenêtre à part, puis se relance.

## Où sont mes données

Dans `%APPDATA%\atelier-liseuse\` :

- `config.json` : les réglages, les dossiers surveillés, les réglages de lecture.
- `bibliotheque.json` : les fiches des livres (chemin, titre, progression, position, surlignages, marque-pages, collections).
- `couvertures\` : les couvertures en petit, pour que la bibliothèque s'affiche vite.

Les livres eux-mêmes restent où ils sont : Kenning ne les copie pas et ne les modifie jamais.

## Comment c'est construit

Electron, sans framework ni outil de compilation, comme Mímir. L'interface est servie par une adresse à elle, `kenning://app/…` (foliate-js est fait de modules, que `file://` ne charge pas), et les couvertures par `kenning://couvertures/…`.

| Fichier | Rôle |
|---|---|
| `main.js` | Processus principal : la fenêtre, les réglages, la bibliothèque sur le disque, la lecture des fichiers, la surveillance des dossiers, les livres ouverts depuis l'Explorateur, la mise à jour |
| `preload.js` | Le pont : la liste des fonctions que l'interface a le droit d'appeler (`window.kenning`) |
| `renderer/app.js` | L'interface : passer de la bibliothèque à la lecture, thème, réglages, glisser-déposer, raccourcis |
| `renderer/bibliotheque.js` | La bibliothèque : import, rayons, collections, couvertures, fiches, dossiers surveillés |
| `renderer/lecture.js` | La lecture : affichage avec foliate-js, réglages, surlignages, marque-pages, recherche, progression |
| `renderer/livre.js` | Ouvrir un livre, ses métadonnées, sa couverture, ses chapitres et leur texte en phrases (sans affichage) |
| `renderer/claude-actions.js`, `claude-familles.js` | Ce que Loki peut faire dans Kenning, et les familles de permissions |
| `renderer/foliate/` | foliate-js, sans modification |
| `build/icon.svg` | L'icône : la rune ᚲ (Kenaz) en dégradé lavande. `icon.png` et `icon.ico` en sont tirés |

## Pas encore

- Synchroniser la progression entre plusieurs PC.
- Lecture à voix haute (prévue avec le tuteur de langues).
- Les catalogues en ligne (OPDS) pour télécharger des livres libres depuis Kenning.
