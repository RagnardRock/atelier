# Skald ᛋ : retouche d'images et de logos

Skald est le deuxième outil d'Atelier, à côté de Rune. Il fait le travail courant de Photoshop : ouvrir un PSD ou une image, retoucher, travailler en calques, recadrer, préparer un logo et l'exporter pour le web. Il reprend la direction artistique de Rune (mode sombre, verre dépoli, même couleur d'accent, mêmes icônes).

Ce n'est pas un clone complet de Photoshop : la version 0.2 couvre ce qui sert tous les jours. La liste « Pas encore » en bas dit ce qui manque.

## Lancer Skald depuis le clone

```bat
cd retouche
npm install
npm start
```

`npm install` télécharge Electron et ag-psd (la librairie qui lit et écrit les PSD) dans `retouche/node_modules/`. `npm start` ouvre la fenêtre. `Ctrl+R` recharge l'interface après une modification, `F12` ouvre les outils de développement.

## Installer Skald (Windows)

Sur chaque pull request qui touche `retouche/`, GitHub fabrique `Skald-Setup-<version>.exe` (onglet **Checks** de la PR, rubrique « Artifacts »). Pour publier une version, monte la version dans `retouche/package.json` dans la PR. Quand elle est fusionnée sur `main`, GitHub crée l'étiquette `skald-v<version>` et publie l'installeur dans les **Releases**, sans la marquer « Latest » (Rune utilise la Release « Latest » pour ses propres mises à jour). Pas d'étiquette à poser à la main.

**Ouvrir un dossier.** `Skald.exe D:\Projets\logos` ouvre Skald avec la fenêtre « Ouvrir » placée dans ce dossier (c'est ce que fait le widget Projets récents d'Atelier pour un projet d'images). Depuis le clone : `npm start -- D:\Projets\logos`.

## Mettre Skald à jour

Le bouton nuage en haut à droite (comme dans Rune) cherche une nouvelle version. Au démarrage, Skald vérifie aussi discrètement et affiche une notification si une version plus récente existe.

- **Skald installé** : il cherche la Release `skald-vX.Y.Z` la plus récente sur GitHub, télécharge son installeur, se ferme, s'installe sans fenêtre et se relance. Il ne peut pas se fier à la Release « Latest » du dépôt (c'est celle de Rune) : il parcourt donc lui-même les Releases et ne garde que celles de Skald.
- **Skald lancé depuis le clone** : il lance `retouche/mettre-a-jour.bat` (git pull, puis npm install) dans une fenêtre à part, puis se relance. Seules les nouveautés qui touchent `retouche/` comptent.

Avant de fermer, Skald propose d'enregistrer les images modifiées. Ses réglages vivent dans `%APPDATA%\atelier-retouche` et ne sont pas effacés.

## Ce que fait Skald (v0.3)

**Fichiers**
- Ouvre PSD (avec ses calques), PNG, JPEG, WebP, GIF, BMP, ICO, AVIF et SVG (dessiné en au moins 1024 px pour rester net).
- Dans un PSD : les groupes sont mis à plat (« Groupe / Calque »), leur opacité et leur visibilité sont reportées, les masques de fusion et d'écrêtage sont appliqués aux pixels. Les calques de réglage (courbes, niveaux…) n'ont pas de pixels et ne sont pas repris : Skald le signale.
- Plusieurs images en onglets. Glisser une image depuis l'Explorateur : sur l'image ouverte, elle devient un calque ; sur les onglets ou l'accueil, elle s'ouvre à part.
- **Enregistrer** (`Ctrl+S`) : un PSD est réécrit avec ses calques. Un PNG/JPEG/WebP à un seul calque est réécrit tel quel ; s'il a plusieurs calques, Skald demande s'il faut les fusionner ou enregistrer en PSD.
- **Exporter** (`Ctrl+Maj+E`) : PNG, WebP, JPEG ou ICO, avec qualité, échelle, fond pour le JPEG, rognage des bords transparents, et le poids du fichier calculé en direct.
- **Pack d'icônes** (menu Logo) : `favicon.ico`, `favicon-16/32.png`, `apple-touch-icon.png`, `icon-192/512.png` et les tailles que tu ajoutes, dans un dossier.
- Presse-papiers de Windows : coller une capture (`Win+Maj+S`) ou une image copiée depuis Photoshop ou un navigateur, et copier vers les autres logiciels. `Ctrl+V` sans image ouverte crée une nouvelle image.

**Outils** (une lettre, comme Photoshop)

| Outil | Touche | Ce qu'il fait |
|---|---|---|
| Déplacement | V | Déplace le calque ; avec une sélection, soulève et déplace ces pixels. Choisit le calque sous la souris. Flèches : 1 px (Maj : 10 px). |
| Sélection | M | Rectangle ou ellipse (Maj pendant le glisser : carré / cercle). Glisser dedans la déplace. |
| Lasso | L | Sélection à main levée : glisser autour de la zone. |
| Lasso polygonal | L (Maj+L) | Un clic par sommet (Maj : droit ou à 45°). Se ferme sur le premier point, par double-clic ou Entrée. Retour arrière retire le dernier point. |
| Baguette magique | W | Sélectionne la zone d'une couleur proche (tolérance, zone continue, tous les calques). |
| Recadrage | C | Cadre à poignées, proportions libres ou fixes (1:1, 16:9…), peut dépasser pour agrandir. Entrée pour valider. |
| Pinceau | B | Taille, dureté, opacité. Maj + clic : ligne droite. Alt + clic : pipette. |
| Gomme | E | Comme le pinceau, mais efface. |
| Tampon de duplication | S | Alt + clic : point source, puis peindre pour recopier cette zone ailleurs (aligné ou non, un calque ou tous). |
| Dégradé | G | Linéaire ou radial, couleur principale → secondaire ou → transparent. |
| Pot de peinture | G (Maj+G) | Tolérance, opacité, zone continue ou toute la couleur. |
| Pipette | I | Prend la couleur de l'image (Alt : couleur secondaire). |
| Texte | T | Police, taille, couleur, gras, italique, alignement, interligne, espacement. Le texte reste modifiable (clic dessus avec l'outil). |
| Formes | U | Rectangle, rectangle arrondi, ellipse, ligne, flèche, polygone, étoile ; remplissage et contour. Chaque forme va dans son propre calque. |
| Main | H | Déplace la vue (aussi : barre d'espace maintenue, ou clic molette). |
| Zoom | Z | Clic : zoom, Alt + clic : dézoom. La molette zoome autour de la souris. |

Pour toutes les sélections : Maj au clic ajoute, Alt retire, Maj+Alt garde l'intersection (ou le menu « Mode »). Quand deux outils partagent une lettre, Maj + la lettre passe de l'un à l'autre.

Taille du pinceau au clavier : `[` et `]` (ou `ù` et `*` en AZERTY). `X` échange les couleurs, `D` remet noir et blanc.

**Calques** : nouveau, dupliquer, supprimer, fusionner vers le bas, aplatir, monter/descendre (ou glisser dans la liste), renommer (double-clic), masquer (œil), opacité, 17 modes de fusion, transformation libre à la souris (`Ctrl+T` : poignées aux coins pour agrandir, glisser dedans pour déplacer, dehors pour tourner, Entrée pour valider, Échap pour annuler ; avec une sélection, seuls les pixels sélectionnés sont transformés) ou avec des valeurs précises, centrer dans l'image, miroir.

**Calques de remplissage et de réglage** (bouton ◐ du panneau Calques, ou menu Calque) : couleur unie et dégradé ; luminosité/contraste, niveaux, teinte/saturation, exposition, vibrance, noir et blanc, filtre photo, négatif, seuil, isohélie. Ils ne touchent pas aux pixels des calques du dessous : double-clic sur leur vignette pour les régler à nouveau. Leur masque se peint au pinceau (noir = cacher l'effet, blanc = le montrer). Créés avec une sélection active, ils ne s'appliquent qu'à elle. Ils sont enregistrés dans le PSD comme de vrais calques de réglage de Photoshop, et relus depuis un PSD.

**Sélection** : tout (`Ctrl+A`), désélectionner (`Ctrl+D`), intervertir (`Ctrl+Maj+I`), contenu d'un calque (`Ctrl` + clic sur le calque), contour progressif (`Maj+F6`), étendre ou réduire, nouveau calque avec la sélection (`Ctrl+J`).

**Image** : taille de l'image (en %, en px, proportions gardées), taille de la zone de travail (avec position de l'image), rotations 90°/180°, miroirs, recadrer à la sélection, rogner le vide.

**Couleurs** : luminosité / contraste / saturation / teinte (`Ctrl+U`), niveaux (`Ctrl+L`), exposition et vibrance, noir et blanc, inverser, flou, netteté. Chaque réglage a un aperçu en direct et ne touche que la sélection s'il y en a une.

**Logo** : rendre une couleur transparente (retire le fond blanc d'un logo en JPG, en gardant l'intérieur et sans liseré blanc), teinte unie (décliner un logo en blanc, noir…), contour, ombre portée.

**Historique** : `Ctrl+Z` / `Ctrl+Y`, et le panneau Historique pour revenir d'un clic à n'importe quelle étape (40 étapes par défaut, réglable).

**Réglages** (roue dentée en bas à gauche, `Ctrl+,`) : couleur d'accent, verre dépoli, flou de Windows 11, nombre d'étapes d'annulation, qualité d'export par défaut.

## Claude dans Skald (depuis Skald 0.4)

Le bouton étincelle de la barre de titre (ou `Ctrl+Maj+K`) ouvre le **panneau Claude** à droite, le même que dans Skald, Tafl et Brokk (son code est dans `commun/`, voir `commun/LISEZMOI.md`).

- **Avec ton compte Claude, sans clé d'API** : Skald fait tourner Claude Code, installé une fois sur ton PC (`npm install -g @anthropic-ai/claude-code`, puis `claude` pour te connecter).
- **Il continue le projet commencé dans Atelier** : il travaille dans le dossier du projet avec lequel Atelier a ouvert Skald (sinon le dernier projet ouvert depuis Atelier, affiché en haut du panneau). Il lit la mémoire de ce projet (ce que le Claude d'Atelier ou de Rune a retenu) et tes notes, grâce au dossier partagé `%APPDATA%\atelier-commun` (Atelier 0.8 ou plus).
- **Toujours avec ta permission** : avant de modifier un fichier, de lancer une commande ou de retenir une info sur le projet, une carte te demande Autoriser ou Refuser. Ce qu'il retient apparaît aussitôt dans Atelier.
- **Conversations** : gardées par projet (bouton horloge), `+` en commence une nouvelle.
- **Réglages** : le modèle de Claude et la commande `claude` si elle n'est pas trouvée toute seule.

### Claude agit dans Skald (depuis Skald 0.5)

Claude ne fait pas que conseiller : il **voit** l'image ouverte et **travaille dedans**, avec les mêmes fonctions que les menus.

- **Regarder** (sans demander) : l'image entière ou un calque, et les infos du document (taille, calques, sélection).
- **Agir** (avec ta permission à chaque fois, ou « toujours » pour la suite) : nouvelle image, ouvrir une image du projet, redimensionner, zone de travail, recadrer, rogner le vide, retouches (luminosité et couleurs, flou, netteté, noir et blanc, inverser, retirer une couleur, teinte unie, contour, ombre), calques (créer, dupliquer, fusionner, renommer, opacité, ordre…), sélections, exporter (PNG, WebP, JPEG, ICO) dans le dossier du projet, enregistrer, annuler.
- Tout passe par l'historique : `Ctrl+Z` annule ce qu'il a fait, comme pour toi. Il n'écrit des fichiers que dans le dossier du projet.
- **Depuis Skald 0.6, il a accès à tout** :
  - **Tous les menus** : il lance n'importe quelle commande (niveaux, exposition, rotations, transformer avec des valeurs, calques de remplissage et de réglage, contour progressif, copier-coller…). Quand une commande ouvre une fenêtre de réglages, la vraie fenêtre s'ouvre devant toi, se remplit avec ses valeurs et se valide toute seule.
  - **Les outils de dessin** : pinceau, gomme, tampon, pot de peinture, dégradé, formes (rectangle, ellipse, ligne, flèche, polygone, étoile), texte, pipette.
  - **Les sélections** : rectangle, ellipse, polygone (lasso), baguette magique, avec les modes ajouter, retirer et intersection.
  - **Le reste** : couleurs principale et secondaire, mode de fusion et position d'un calque, réglages d'un calque de réglage, onglets, rétablir, enregistrer sous (PSD dans le projet), pack d'icônes dans le projet.

## Comment c'est construit

Electron, sans framework ni bundler, comme Rune. Toute la retouche se fait dans des `<canvas>` du navigateur intégré.

| Fichier | Rôle |
|---|---|
| `main.js` | Fenêtre, ouverture/enregistrement des fichiers, presse-papiers, réglages (`config.json`). L'interface ne peut écrire que là où tu as choisi d'enregistrer. |
| `preload.js` | Les seules fonctions de `main.js` accessibles à l'interface (`window.skald`). |
| `renderer/doc.js` | Le modèle : document, calques, composition, historique (annuler/rétablir). |
| `renderer/adjustments.js` | Calques de remplissage et de réglage (calculs, masque, lecture/écriture PSD). |
| `renderer/selection.js` | Les sélections de toutes formes (masques), et les calculs dessus : ajouter, retirer, intervertir, adoucir. |
| `renderer/view.js` | La zone de travail : zoom, déplacement de la vue, damier, sélection, souris. |
| `renderer/tools.js` | Les outils de la barre de gauche. |
| `renderer/tools-extra.js` | Dégradé, formes et transformation libre. |
| `renderer/ops.js` | Les opérations des menus (réglages, effets de logo, taille, calques, presse-papiers). |
| `renderer/io.js` | Lecture et écriture PSD/images, export, ICO, pack d'icônes. |
| `renderer/dialogs.js` | Les fenêtres de dialogue. |
| `renderer/app.js` | Onglets, menus, raccourcis, panneaux, réglages. |
| `renderer/update.js` | Le bouton de mise à jour. |

## Pas encore

- Masques de calque non destructifs.
- Courbes et réglages par couche (rouge, vert, bleu) dans les niveaux.
- Correcteur / pièce (retouche « intelligente »), densité / netteté locale au pinceau, doigt.
- Repères et règles.
- Styles de calque modifiables après coup (l'ombre et le contour sont appliqués aux pixels).
- Ouvrir les textes d'un PSD comme textes modifiables (ils arrivent en pixels).
