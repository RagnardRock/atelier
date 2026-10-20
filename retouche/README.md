# Skald ᛋ : retouche d'images et de logos

Skald est le deuxième outil d'Atelier, à côté de Rune. Il fait le travail courant de Photoshop : ouvrir un PSD ou une image, retoucher, travailler en calques, recadrer, préparer un logo et l'exporter pour le web. Il reprend la direction artistique de Rune (mode sombre, verre dépoli, même couleur d'accent, mêmes icônes).

Ce n'est pas un clone complet de Photoshop : la version 0.1 couvre ce qui sert tous les jours. La liste « Pas encore » en bas dit ce qui manque.

## Lancer Skald depuis le clone

```bat
cd retouche
npm install
npm start
```

`npm install` télécharge Electron et ag-psd (la librairie qui lit et écrit les PSD) dans `retouche/node_modules/`. `npm start` ouvre la fenêtre. `Ctrl+R` recharge l'interface après une modification, `F12` ouvre les outils de développement.

## Installer Skald (Windows)

Sur chaque pull request qui touche `retouche/`, GitHub fabrique `Skald-Setup-<version>.exe` (onglet **Checks** de la PR, rubrique « Artifacts »). Pour publier une version :

1. Monte la version dans `retouche/package.json`, fusionne sur `main`.
2. Pose l'étiquette et pousse-la :
   ```bat
   git tag skald-v0.1.0
   git push origin skald-v0.1.0
   ```
3. GitHub publie l'installeur dans les **Releases**, sans la marquer « Latest » (Rune utilise la Release « Latest » pour ses propres mises à jour).

Skald n'a pas encore de mise à jour automatique : pour l'instant on réinstalle la nouvelle version par-dessus. Ses réglages vivent dans `%APPDATA%\atelier-retouche` et ne sont pas effacés.

## Ce que fait Skald (v0.1)

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
| Sélection | M | Rectangle (Maj : carré). Glisser dedans la déplace. |
| Recadrage | C | Cadre à poignées, proportions libres ou fixes (1:1, 16:9…), peut dépasser pour agrandir. Entrée pour valider. |
| Pinceau | B | Taille, dureté, opacité. Maj + clic : ligne droite. Alt + clic : pipette. |
| Gomme | E | Comme le pinceau, mais efface. |
| Pot de peinture | G | Tolérance, opacité, zone continue ou toute la couleur. |
| Pipette | I | Prend la couleur de l'image (Alt : couleur secondaire). |
| Texte | T | Police, taille, couleur, gras, italique, alignement, interligne, espacement. Le texte reste modifiable (clic dessus avec l'outil). |
| Main | H | Déplace la vue (aussi : barre d'espace maintenue, ou clic molette). |
| Zoom | Z | Clic : zoom, Alt + clic : dézoom. La molette zoome autour de la souris. |

Taille du pinceau au clavier : `[` et `]` (ou `ù` et `*` en AZERTY). `X` échange les couleurs, `D` remet noir et blanc.

**Calques** : nouveau, dupliquer, supprimer, fusionner vers le bas, aplatir, monter/descendre (ou glisser dans la liste), renommer (double-clic), masquer (œil), opacité, 17 modes de fusion, transformer (échelle et rotation, `Ctrl+T`), centrer dans l'image, miroir.

**Image** : taille de l'image (en %, en px, proportions gardées), taille de la zone de travail (avec position de l'image), rotations 90°/180°, miroirs, recadrer à la sélection, rogner le vide.

**Couleurs** : luminosité / contraste / saturation / teinte (`Ctrl+U`), noir et blanc, inverser, flou, netteté. Chaque réglage a un aperçu en direct et ne touche que la sélection s'il y en a une.

**Logo** : rendre une couleur transparente (retire le fond blanc d'un logo en JPG, en gardant l'intérieur et sans liseré blanc), teinte unie (décliner un logo en blanc, noir…), contour, ombre portée.

**Historique** : `Ctrl+Z` / `Ctrl+Y`, et le panneau Historique pour revenir d'un clic à n'importe quelle étape (40 étapes par défaut, réglable).

**Réglages** (roue dentée en bas à gauche, `Ctrl+,`) : couleur d'accent, verre dépoli, flou de Windows 11, nombre d'étapes d'annulation, qualité d'export par défaut.

## Comment c'est construit

Electron, sans framework ni bundler, comme Rune. Toute la retouche se fait dans des `<canvas>` du navigateur intégré.

| Fichier | Rôle |
|---|---|
| `main.js` | Fenêtre, ouverture/enregistrement des fichiers, presse-papiers, réglages (`config.json`). L'interface ne peut écrire que là où tu as choisi d'enregistrer. |
| `preload.js` | Les seules fonctions de `main.js` accessibles à l'interface (`window.skald`). |
| `renderer/doc.js` | Le modèle : document, calques, composition, historique (annuler/rétablir). |
| `renderer/view.js` | La zone de travail : zoom, déplacement de la vue, damier, sélection, souris. |
| `renderer/tools.js` | Les outils de la barre de gauche. |
| `renderer/ops.js` | Les opérations des menus (réglages, effets de logo, taille, calques, presse-papiers). |
| `renderer/io.js` | Lecture et écriture PSD/images, export, ICO, pack d'icônes. |
| `renderer/dialogs.js` | Les fenêtres de dialogue. |
| `renderer/app.js` | Onglets, menus, raccourcis, panneaux, réglages. |

## Pas encore

- Transformation à la souris (poignées sur le calque) : pour l'instant c'est une fenêtre avec échelle et rotation.
- Sélections lasso et baguette magique, masques de calque non destructifs.
- Calques de réglage, styles de calque modifiables après coup (l'ombre et le contour sont appliqués aux pixels).
- Ouvrir les textes d'un PSD comme textes modifiables (ils arrivent en pixels).
- Mise à jour automatique de Skald.
