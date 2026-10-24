# Reikna ᛞ : le tableur

Reikna (« compter », en vieux norrois) est le tableur d'Atelier : il ouvre et enregistre les classeurs Excel, LibreOffice et CSV, avec toutes les formules en français et l'auto-complétion, comme un Excel français.

## Comment on s'en sert

- **Ouvrir** : Fichier › Ouvrir (Ctrl+O), glisser un fichier sur la fenêtre, ou double-clic sur un `.xlsx` si Windows l'associe à Reikna. Les fichiers récents sont dans le menu Fichier.
- **Taper** dans une cellule : `12,5` est un nombre, `24/10/2026` une date, `15 %` un pourcentage, `12 €` un montant, `VRAI` / `FAUX` des booléens. Pour garder un texte tel quel (un numéro de téléphone `0612…`), commence-le par une apostrophe.
- **Formules** : commence par `=`. Dès la première lettre, la liste des fonctions qui commencent ainsi apparaît, avec une phrase d'explication ; **Tab** ou **Entrée** choisit. Pendant que tu tapes les arguments, une bulle montre la syntaxe et met en valeur l'argument en cours. Les flèches ou un clic sur une cellule (même dans une autre feuille) écrivent sa référence, F4 ajoute les `$`.
- **Toutes les fonctions** (Maj+F3, ou le bouton *fx*) : les 408 fonctions du moteur, rangées par rubrique (Maths, Statistiques, Recherche, Date et heure, Finances…), avec leur nom français, leur nom anglais, leur syntaxe et une explication. Double-clic pour insérer.
- **Enregistrer** (Ctrl+S) dans le format d'origine ; Fichier › Enregistrer sous (Ctrl+Maj+S) pour en changer. Fermer avec des modifications non enregistrées demande d'abord.

## Les formats

| Format | Ouvrir | Enregistrer |
|---|---|---|
| **Excel** `.xlsx` / `.xlsm` | Valeurs, formules, formats de nombre, police, couleurs, bordures, alignements, fusions, largeurs et hauteurs, volets figés, filtre, couleur des onglets, liens | Tout cela |
| **LibreOffice** `.ods` | Valeurs, formules, formats de nombre, fusions | Valeurs, formules, fusions, tailles (pas les couleurs) |
| **Excel 97-2003** `.xls` | Valeurs, formules, formats de nombre, fusions | Valeurs seulement |
| **CSV** `.csv`, `.tsv`, `.txt` | Le séparateur (`;`, `,`, tabulation) et l'encodage (UTF-8 ou Windows-1252) sont devinés | Une feuille, en UTF-8 avec le séparateur et la virgule décimale choisis dans les Réglages (`;` et `,` par défaut, ce qu'attend un Excel français) |

Dans un fichier, les formules sont toujours écrites en anglais (c'est ce que font Excel et LibreOffice) : un classeur fait dans Reikna s'ouvre donc normalement dans Excel, et inversement.

## Ce qu'on peut faire

- **Mise en forme** : police, taille, gras, italique, souligné, barré, couleurs du texte et du fond, alignements, retour à la ligne, fusionner et centrer, bordures, formats de nombre (Standard, Nombre, Monétaire, Comptabilité, Pourcentage, Dates, Heure, Scientifique, Texte, ou un format perso avec aperçu : Ctrl+1). Le pinceau reproduit une mise en forme.
- **Lignes et colonnes** : insérer, supprimer, masquer, largeur et hauteur (glisser le bord, double-clic pour ajuster au contenu), figer les volets.
- **Données** : trier (A→Z, Z→A, ou sur plusieurs colonnes), filtrer (Ctrl+Maj+L, avec la liste des valeurs à cocher), rechercher et remplacer (Ctrl+F, Ctrl+H), somme automatique (Alt+=).
- **Recopie** : la poignée en bas à droite de la sélection prolonge les suites (1, 2 → 3, 4 ; lundi → mardi ; janvier → février ; Article 1 → Article 2) et adapte les formules. Ctrl en glissant : recopie sans suite. Ctrl+D et Ctrl+R recopient vers le bas et vers la droite.
- **Feuilles** : ajouter (Maj+F11), renommer (double-clic sur l'onglet), déplacer (glisser l'onglet), dupliquer, colorer, supprimer (clic droit sur l'onglet).
- **Copier-coller** avec Excel, LibreOffice, Google Sheets et les pages web : Reikna écrit et lit le presse-papiers en tableau (texte et HTML). Collage spécial (Ctrl+Maj+V) : valeurs seulement ou formats seulement.
- **Annuler** sans limite pratique (Ctrl+Z, Ctrl+Y) : tout s'annule, y compris ce que fait Claude.
- **Barre d'état** : moyenne, somme et nombre des cellules choisies ; zoom (Ctrl+molette).

## Raccourcis

Les mêmes qu'Excel : Ctrl+C / X / V, Ctrl+Z / Y, Ctrl+B / I / U, Ctrl+5 (barré), Ctrl+1 (format de cellule), Ctrl+K (lien), Ctrl+F / H, Ctrl+G (aller à), Ctrl+A, Ctrl+flèches (aller au bout des données), Maj+flèches (étendre), Ctrl+Espace / Maj+Espace (colonne / ligne entière), Ctrl+; (date du jour), Ctrl+: (heure), Ctrl++ / Ctrl+- (insérer / supprimer), Ctrl+PageUp / PageDown (feuille précédente / suivante), F2 (modifier la cellule), Alt+Entrée (retour à la ligne dans la cellule), Ctrl+Entrée (remplir toute la sélection), Échap (annuler la saisie). Après une suite de Tab, Entrée revient à la colonne du début, une ligne plus bas.

## Réglages (roue dentée, ou Ctrl+,)

Couleur d'accent, effet verre et flou, grille claire ou sombre, quadrillage, **langue des formules** (français par défaut : `=SOMME(A1:A3;2,5)` ; ou anglais : `=SUM(A1:A3,2.5)`), séparateur et virgule décimale des CSV, et les réglages de Claude.

## Claude dans Reikna

Le panneau Claude est le même que dans Skald, Tafl et Brokk (bouton étincelles en haut à droite). Claude regarde le classeur sans demander (infos, lire une plage, capture de la grille) ; pour le reste, il affiche une carte **Autoriser / Refuser** :

- écrire des valeurs et des formules (en français ou en anglais, il choisit), recopier une formule vers le bas, effacer ;
- mettre en forme (gras, couleurs, formats de nombre, bordures), largeurs et hauteurs, fusionner, figer les volets, poser un filtre ;
- insérer, supprimer et trier des lignes ou des colonnes ;
- ajouter, renommer et supprimer des feuilles ;
- ouvrir un classeur, enregistrer (seulement un classeur déjà enregistré : choisir où reste ton choix), commencer un nouveau classeur.

« Ne plus demander » vaut pour une famille d'actions (cellules, mise en forme, structure, feuilles, fichier), pour la conversation ou pour de bon ; ça se reprend dans les Réglages ou avec le bouclier du panneau. Tout ce que fait Claude s'annule avec Ctrl+Z.

## Lancer Reikna depuis le clone

```
cd tableur
npm install
npm start
```

`npm install` copie aussi le dossier `commun/` (le panneau Claude) dans `tableur/commun/`.

## Installer Reikna (Windows)

Depuis **Atelier**, colonne Outils, rayon **Bureautique**, bouton **Installer** sur la carte Reikna.

Sinon : sur chaque pull request qui touche `tableur/`, GitHub fabrique `Reikna-Setup-<version>.exe` (onglet **Checks** de la PR, rubrique « Artifacts »). Pour publier une version, monte la version dans `tableur/package.json` dans la PR. Quand elle est fusionnée sur `main`, GitHub crée l'étiquette `reikna-v<version>` et publie l'installeur dans les **Releases**.

## Mettre Reikna à jour

Le bouton nuage en haut à droite. Reikna installé télécharge la dernière Release `reikna-vX.Y.Z`, s'installe et se relance (il demande d'abord d'enregistrer le classeur s'il a des modifications). Lancé depuis le clone, il lance `tableur/mettre-a-jour.bat` (git pull, puis npm install).

## Comment c'est construit

Electron, sans framework ni outil de compilation, comme Brokk. La grille est dessinée dans un `<canvas>` : seules les cellules visibles sont dessinées, donc une feuille d'un million de lignes reste fluide.

| Fichier | Rôle |
|---|---|
| `main.js` | Processus principal : la fenêtre, les réglages, lire et écrire les fichiers (seulement ceux que tu as ouverts ou choisis), les fichiers récents, le presse-papiers, la mise à jour, Claude |
| `preload.js` | Le pont : la liste des fonctions que l'interface a le droit d'appeler (`window.reikna`) |
| `renderer/base.js` | Adresses (A1 ↔ ligne et colonne), plages |
| `renderer/fonctions.js` | Le catalogue des fonctions : nom français, nom anglais, rubrique, syntaxe et explication en français |
| `renderer/formules.js` | La traduction français ↔ anglais des formules, la lecture de ce que tu tapes (nombres, dates, %, €), l'affichage des valeurs selon leur format |
| `renderer/classeur.js` | Le classeur : le moteur de calcul, la mise en forme, les feuilles, et l'historique pour annuler |
| `renderer/fichiers.js` | Lire et écrire xlsx, xlsm, xls, ods, csv, tsv |
| `renderer/grille.js` | La grille : dessin, sélection, saisie, auto-complétion, poignée de recopie, redimensionnement |
| `renderer/fenetres.js` | Menus, palette de couleurs, Toutes les fonctions, Format de cellule, Trier, Filtre |
| `renderer/app.js` | L'interface : barre d'outils, menus, onglets, raccourcis, presse-papiers, réglages |
| `renderer/claude-actions.js`, `claude-familles.js` | Ce que Claude peut faire, et les familles de permissions |
| `build/icon.svg` | L'icône : la rune ᛞ (Dagaz) en dégradé émeraude. `icon.png` et `icon.ico` en sont tirés |

Les bibliothèques :

- **HyperFormula** (moteur de calcul, près de 400 fonctions compatibles Excel). Licence GPL v3 : Reikna est un outil personnel au code public, ce qui est permis.
- **ExcelJS** pour les `.xlsx` (styles compris).
- **SheetJS** (paquet `@e965/xlsx`, la version officielle 0.20 republiée sur npm) pour `.xls` et `.ods`, et en secours pour un `.xlsx` qu'ExcelJS ne sait pas lire.

## Pas encore

- Graphiques et mise en forme conditionnelle (prévus pour la 0.2).
- Tableaux croisés dynamiques, validation des données (listes déroulantes), commentaires de cellules.
- Images insérées dans la feuille.
- Impression et export PDF.
