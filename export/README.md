# Brokk ᛒ : l'export d'assets

Brokk est le troisième outil d'Atelier, à côté de Rune et Skald. Son nom vient du nain forgeron de la mythologie nordique : il prend une image (un PSD, un logo SVG, une photo) et en **forge d'un coup toutes les versions dont un site a besoin**, directement dans le bon dossier du projet. Plus d'« Exporter pour le web » à refaire dix fois dans Photoshop.

Même direction artistique que Rune et Skald : mode sombre, verre dépoli, réglages dans l'interface (aucun JSON à écrire). La couleur d'accent par défaut est la braise orange de son icône.

## Comment on s'en sert

1. **Choisir un projet** (`Ctrl+O`) : le dossier d'un site (Vue, Vite, Nuxt, HTML…) ou n'importe quel dossier. Brokk regarde `package.json` et les dossiers présents pour proposer les bonnes destinations : `public/` pour les icônes, `src/assets/img/` pour les images importées par les composants Vue.
2. **Ajouter des images** (`Ctrl+N`, ou glisser-déposer depuis l'Explorateur) : PSD, PNG, SVG, JPEG, WebP, GIF, AVIF. Pour un PSD, tu peux prendre l'image entière ou **un seul calque ou groupe** (comme « Exporter le calque » de Photoshop), rogné à son contenu.
3. **Choisir une recette** (voir plus bas). Brokk propose celle qui va le mieux : un logo carré ou un SVG → favicon, une grande image → responsive.
4. Au centre, tu vois **chaque fichier qui sera produit**, avec sa taille en pixels, son **poids réel** (il est vraiment encodé) et s'il est **nouveau** ou s'il **remplacera** un fichier existant. En bas, le **code à coller** dans ta page.
5. **Exporter** (`Ctrl+E` pour l'asset choisi, `Ctrl+Maj+E` ou « Tout exporter » pour tous). Rien n'est écrit dans le projet avant ce clic.

Un **asset** = une image + une recette + ses réglages. La même image peut servir à plusieurs assets (bouton « Dupliquer » : le logo du PSD en favicon ET en image de partage). Les assets de chaque projet sont gardés : à la prochaine ouverture du projet, ils sont là, et « Tout exporter » refait tout.

## Les recettes

| Recette | Ce qu'elle produit |
|---|---|
| **Favicon et icônes du site** | `favicon.ico` (16, 32 et 48 px dans un seul fichier), `icon.svg` (copie du SVG, nette à toutes les tailles), `apple-touch-icon.png` (180 px, fond plein : l'iPhone n'aime pas la transparence), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (Android la découpe en cercle : le logo est gardé dans la zone centrale), `site.webmanifest` (nom, couleurs, icônes : le site devient installable). **Et il pose les balises dans `index.html`** (voir plus bas). |
| **Image nette (@1x, @2x)** | Une image affichée à une taille fixe (logo d'en-tête, illustration) : tu donnes sa largeur dans la page, Brokk produit `nom.webp`, `nom@2x.webp` (écrans Retina et 4K), en option `@3x`, et un PNG ou JPEG de secours. Code : un `<picture>` avec `srcset`. |
| **Image responsive** | Une grande image (bannière, fond) en plusieurs largeurs (480, 960, 1440, 1920, 2560 par défaut) : le navigateur télécharge seulement celle qu'il faut, du téléphone à l'écran ultralarge. Une largeur plus grande que l'original est sautée (pas d'agrandissement flou). Code : `<picture>` avec `srcset` et `sizes`. |
| **Image de partage (Open Graph)** | L'aperçu affiché quand on partage un lien (Discord, Slack, LinkedIn, X…) : 1200 × 630, logo centré sur un fond, ou photo qui remplit le cadre. Code : les balises `og:image`. |
| **Tailles libres** | Les tailles que tu veux (`64, 128x96, 256`), en PNG, WebP, JPEG ou ICO, avec cadrage (contenir, remplir, étirer) et fond transparent ou plein. |

Chaque recette a ses réglages dans le panneau de droite (qualité WebP/JPEG, marges, couleurs, dossier, nom des fichiers…). « Revenir aux réglages de départ » remet ceux proposés par Brokk.

## Les adresses dans le code à coller

- Un fichier dans `public/` est servi tel quel à la racine du site : `public/icon-192.png` → `/icon-192.png`.
- Un fichier dans `src/` est importé par Vite, qui lui ajoute une empreinte (pour le cache) : `src/assets/img/logo.webp` → `@/assets/img/logo.webp`. Dans un `<template>` Vue, Vite transforme aussi ces adresses dans `srcset`.

## Les balises des icônes dans index.html

Si la case est cochée (recette Favicon), l'export pose les balises dans `index.html` (à la racine pour Vite, ou `public/index.html` pour un vieux projet Vue CLI), **entre deux commentaires repères** :

```html
<!-- brokk:icones -->
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#101014">
<!-- /brokk:icones -->
```

La première fois, le bloc est ajouté juste avant `</head>`, et les anciennes balises d'icône (le `<link rel="icon" href="/favicon.ico">` que crée Vite, par exemple) sont retirées pour ne pas faire doublon. Les fois suivantes, **seul ce qui est entre les repères est remplacé** : le reste de ton `index.html` n'est jamais touché. Pour Nuxt (pas d'`index.html`), Brokk donne seulement le code à mettre dans `nuxt.config`.

## Surveiller : l'export automatique

Le bouton **Surveiller** (en haut) allume l'export automatique : quand tu **enregistres** une des images source (dans Photoshop, Skald…), Brokk relit le fichier et ré-exporte tout seul les assets qui en viennent. Ton site en `npm run dev` se met à jour sous tes yeux. Brokk surveille le dossier de chaque image plutôt que le fichier lui-même, parce que Photoshop enregistre dans un fichier temporaire qu'il renomme ensuite.

## Sécurité

- Brokk n'écrit que **dans le projet ouvert**, un dossier que tu as choisi toi-même (fenêtre « Choisir », projets récents, ou Atelier). Un chemin qui sortirait du projet (`../`) est refusé.
- Chaque fichier est d'abord écrit à côté (`.brokk-tmp`), puis renommé : si quelque chose plante en plein milieu, l'ancien fichier reste intact.
- Brokk ne laisse **aucun fichier à lui** dans tes projets : la liste des assets est gardée dans ses réglages (`%APPDATA%\atelier-export\config.json`), projet par projet.
- « Retirer » un asset de la liste ne supprime ni les fichiers déjà exportés ni l'image source.

## Raccourcis

| Raccourci | Action |
|---|---|
| `Ctrl+O` | Choisir un projet |
| `Ctrl+N` | Ajouter des images |
| `Ctrl+E` | Exporter l'asset choisi |
| `Ctrl+Maj+E` | Tout exporter |
| `↑` `↓` | Asset précédent / suivant |
| `Suppr` | Retirer l'asset de la liste |
| `Ctrl+,` | Réglages de Brokk |
| `Ctrl+R`, `F12` | Recharger l'interface, outils de développement |

## Claude dans Brokk (depuis Brokk 0.2)

Le bouton étincelle de la barre de titre (ou `Ctrl+Maj+K`) ouvre le **panneau Claude** à droite, le même que dans Skald, Tafl et Brokk (son code est dans `commun/`, voir `commun/LISEZMOI.md`).

- **Avec ton compte Claude, sans clé d'API** : Brokk fait tourner Claude Code, installé une fois sur ton PC (`npm install -g @anthropic-ai/claude-code`, puis `claude` pour te connecter).
- **Il continue le projet commencé dans Atelier** : il travaille dans le dossier du projet avec lequel Atelier a ouvert Brokk (sinon le dernier projet ouvert depuis Atelier, affiché en haut du panneau). Il lit la mémoire de ce projet (ce que le Claude d'Atelier ou de Rune a retenu) et tes notes, grâce au dossier partagé `%APPDATA%\atelier-commun` (Atelier 0.8 ou plus).
- **Toujours avec ta permission** : avant de modifier un fichier, de lancer une commande ou de retenir une info sur le projet, une carte te demande Autoriser ou Refuser. Ce qu'il retient apparaît aussitôt dans Atelier.
- **Conversations** : gardées par projet (bouton horloge), `+` en commence une nouvelle.
- **Réglages** : le modèle de Claude et la commande `claude` si elle n'est pas trouvée toute seule.

### Claude agit dans Brokk (depuis Brokk 0.3)

- **Regarder** (sans demander) : le projet, ses assets avec leurs réglages, les recettes et leurs options, et pour un asset la liste des fichiers produits (taille, poids réel), le code à coller et l'image.
- **Agir** (avec ta permission) : ouvrir un projet, ajouter une image (PSD et calque compris) avec une recette, changer ses réglages, la retirer de la liste, exporter un ou tous les assets.
- Par exemple : « prépare le favicon depuis logo.psd et l'image de partage » ; il choisit les recettes, règle les options, te montre le résultat, puis exporte quand tu acceptes.

## Lancer Brokk depuis le clone

```bat
cd export
npm install
npm start
```

`npm install` télécharge Electron et ag-psd (la librairie qui lit les PSD, la même que Skald) dans `export/node_modules/`. `npm start -- D:\Projets\mon-site` ouvre Brokk directement sur ce projet.

## Installer Brokk (Windows)

Le plus simple : depuis **Atelier**, colonne Outils, bouton **Installer** sur la carte Brokk. Clic droit sur un projet dans « Projets récents » › **Exporter les assets avec Brokk** ouvre Brokk avec ce projet.

Sinon : sur chaque pull request qui touche `export/`, GitHub fabrique `Brokk-Setup-<version>.exe` (onglet **Checks** de la PR, rubrique « Artifacts »). Pour publier une version, monte la version dans `export/package.json` dans la PR. Quand elle est fusionnée sur `main`, GitHub crée l'étiquette `brokk-v<version>` et publie l'installeur dans les **Releases**, sans la marquer « Latest » (Rune utilise la Release « Latest » pour ses propres mises à jour).

## Mettre Brokk à jour

Le bouton nuage en haut à droite, comme dans Rune et Skald. Au démarrage, Brokk vérifie aussi discrètement et affiche une notification si une version plus récente existe.

- **Brokk installé** : il cherche la Release `brokk-vX.Y.Z` la plus récente sur GitHub, télécharge son installeur, se ferme, s'installe sans fenêtre et se relance.
- **Brokk lancé depuis le clone** : il lance `export/mettre-a-jour.bat` (git pull, puis npm install) dans une fenêtre à part, puis se relance.

## Comment c'est construit

Electron, sans framework ni outil de compilation, comme Skald. Les images sont traitées dans l'interface avec des `<canvas>` (le navigateur intégré sait encoder PNG, JPEG et WebP).

| Fichier | Rôle |
|---|---|
| `main.js` | Processus principal : la fenêtre, les réglages, la lecture des images, l'écriture dans le projet (et seulement dans le projet), les balises d'`index.html`, la surveillance des sources, la mise à jour |
| `preload.js` | Le pont : la liste des fonctions que l'interface a le droit d'appeler (`window.brokk`) |
| `renderer/base.js` | Outils communs : redimensionnement de qualité (par moitiés successives), cadrage, rognage, encodage PNG / WebP / JPEG / ICO |
| `renderer/sources.js` | Lecture des images : PSD (image entière, ou un calque / groupe recomposé avec masques, opacités, modes de fusion et masques d'écrêtage), SVG (dessiné en 2048 px), autres formats |
| `renderer/recettes.js` | Les cinq recettes : leurs réglages, leurs fichiers produits et leur code à coller. Pour en ajouter une : un bloc de plus dans ce fichier |
| `renderer/app.js` | L'interface : projet, liste des assets, aperçu, panneau de réglages, export, surveillance, raccourcis |
| `renderer/dialogs.js`, `notify.js`, `update.js` | Fenêtres de dialogue, notifications et bouton de mise à jour (repris de Skald) |
| `build/icon.svg` | L'icône : la rune ᛒ (Berkanan, le « B » de Brokk) en dégradé de braise. `icon.png` et `icon.ico` en sont tirés |

## Pas encore

- Export d'Illustrator (`.ai`) : à faire passer par un SVG exporté depuis Illustrator pour l'instant.
- AVIF en sortie (le navigateur d'Electron sait le lire, pas encore l'écrire).
- Sprites CSS et feuilles d'icônes.
