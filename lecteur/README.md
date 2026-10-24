# Mímir ᛗ : le lecteur de documents

Mímir est l'outil de lecture d'Atelier. Son nom vient du sage de la mythologie nordique, gardien du puits de la connaissance : on vient le consulter pour lire. Il ouvre les PDF (et sait les **annoter, les signer et remplir leurs formulaires**), les livres EPUB, les bandes dessinées, les documents Word, les images et les textes, chacun dans son onglet.

Même direction artistique que les autres outils : mode sombre, verre dépoli, réglages dans l'interface (aucun JSON à écrire). La couleur d'accent par défaut est le bleu clair de son icône.

## Ce qu'il lit

| Format | Ce qu'on peut faire |
|---|---|
| **PDF** (`.pdf`) | Lire (une page, deux pages côte à côte, défilement vertical, horizontal ou page par page), miniatures et sommaire à gauche, chercher, zoomer, tourner, imprimer, voir les propriétés. Les PDF protégés par mot de passe demandent le mot de passe. **Annoter, signer, remplir** : voir plus bas. |
| **EPUB** (`.epub`) | Lire page par page (une ou deux colonnes selon la largeur), sommaire, taille du texte, progression en %, chercher dans tout le livre. Les scripts d'un livre ne s'exécutent jamais. |
| **BD** (`.cbz`, `.cbr`, `.zip`) | Une page ou deux côte à côte (`D`), sens manga de droite à gauche (`M`), ajusté à la hauteur, à la largeur ou taille réelle, miniatures. |
| **Word** (`.docx`) | Lecture (titres, listes, tableaux, images, liens), chercher, imprimer. La mise en page exacte de Word n'est pas reprise : le bouton « Ouvrir dans Word » ouvre le fichier dans le programme choisi par Windows pour le modifier. |
| **Images** (`.png`, `.jpg`, `.webp`, `.gif`, `.avif`, `.svg`, `.bmp`, `.ico`) | Ajusté à la fenêtre, zoom (pixels nets à partir de 200 %, pratique pour le pixel art), rotation, imprimer. |
| **Textes** (`.md`, `.txt`, `.json`, `.csv`, `.log`, `.xml`, `.yml`…) | Le Markdown est mis en page, les autres s'affichent tels quels. Chercher, zoomer, imprimer. |

Les anciens `.doc` (Word 97-2003) ne sont pas lus : les enregistrer en `.docx` depuis Word d'abord.

## Annoter, signer et remplir un PDF

La barre d'outils d'un PDF a cinq outils. `Échap` revient à la lecture.

- **Surligner** : sélectionne du texte, il est surligné. Couleur et épaisseur dans les options à droite de l'outil.
- **Texte** : clique sur la page pour écrire un commentaire (couleur, taille).
- **Dessin** : à main levée (couleur, épaisseur, opacité).
- **Image** : pose une image sur la page (un tampon, un logo).
- **Signer** : ouvre la fenêtre des signatures.
  - **Dessiner** ta signature à la souris ou au stylet (le trait suit la pression).
  - **Taper** ton nom, écrit dans une police manuscrite (Great Vibes ou Caveat).
  - **Image** : une photo ou un scan de ta signature, le fond blanc est retiré.
  - « Garder cette signature » la range dans **Mes signatures** (jusqu'à 8) : la prochaine fois, un clic suffit.
  - La signature se pose sur la page affichée : déplace-la et redimensionne-la à la souris.

Chaque élément posé se sélectionne pour être déplacé ou supprimé (corbeille sous l'élément, ou `Suppr`). Annuler et Rétablir sont dans la barre.

**Formulaires** : les champs d'un PDF (textes, cases à cocher, boutons radio, listes) se remplissent directement dans la page.

**Enregistrer** (`Ctrl+S`) écrit tout dans le PDF lui-même : annotations, signature et valeurs des champs, lisibles ensuite par n'importe quel lecteur PDF (Acrobat, Edge, Firefox…). `Ctrl+Maj+S` enregistre une copie ailleurs. Un point sur l'onglet signale un document modifié et pas encore enregistré. Mímir le rappelle avant de fermer l'onglet ou la fenêtre. Le fichier est d'abord écrit à côté puis renommé, donc un problème en plein milieu laisse l'ancien intact. Si Acrobat ou un autre programme garde le PDF ouvert, Mímir le dit et propose « Enregistrer sous ».

## Les réglages (`Ctrl+,`)

- Couleur d'accent, verre dépoli, flou de Windows 11.
- **Couleur des pages** : normales, sombres (pour lire le soir) ou sépia. S'applique aux PDF, aux livres, aux documents Word et aux textes.
- Zoom par défaut des PDF, reprise à la page où tu t'étais arrêté, réouverture des documents restés ouverts.
- BD : deux pages côte à côte, sens manga.
- **Mon nom** : celui proposé pour la signature tapée, et l'auteur des annotations.
- Claude : modèle, commande, et ce qu'il a le droit de faire sans demander (voir plus bas).

Les réglages, les documents récents, la page où tu en étais pour chaque document et tes signatures gardées sont dans `%APPDATA%\atelier-lecteur\config.json`.

## Claude dans Mímir

Le bouton étincelle de la barre de titre (ou `Ctrl+Maj+K`) ouvre le **panneau Claude**, le même que dans Skald, Brokk et Tafl (son code est dans `commun/`, voir `commun/LISEZMOI.md`). Il tourne avec ton compte Claude, par Claude Code installé sur le PC, et partage la mémoire du projet avec Atelier.

- **Regarder** (sans demander) : les documents ouverts, le texte d'une page ou d'un chapitre, l'image d'une page, chercher un mot, aller à une page, lister les champs d'un formulaire PDF.
- **Agir** (avec ta permission) : ouvrir un document, remplir des champs de formulaire, surligner un passage, écrire un commentaire sur une page, enregistrer le PDF.
- Exemples : « résume ce PDF », « où est-il question de résiliation ? », « remplis ce formulaire avec mes infos et surligne les dates limites ».
- **Claude ne signe jamais à ta place** : la signature reste un geste à toi.
- Chaque famille d'actions a sa case « toujours autoriser » dans les réglages, et le bouclier du panneau, comme dans les autres outils.

## Raccourcis

| Raccourci | Action |
|---|---|
| `Ctrl+O` | Ouvrir des documents (ou les glisser sur la fenêtre) |
| `Ctrl+W` | Fermer l'onglet (ou clic du milieu sur l'onglet) |
| `Ctrl+Tab`, `Ctrl+Maj+Tab` | Onglet suivant / précédent |
| `Ctrl+F` | Chercher dans le document |
| `Ctrl+G` | Aller à une page |
| `Ctrl++`, `Ctrl+-`, `Ctrl+0` | Zoomer, dézoomer, zoom de départ |
| `Ctrl+S`, `Ctrl+Maj+S` | Enregistrer le PDF, enregistrer sous |
| `Ctrl+P` | Imprimer |
| `Page suivante`, `Page précédente`, `Début`, `Fin` | Naviguer dans un PDF |
| `←` `→`, `Espace` | Page précédente / suivante (livres, BD) |
| `D`, `M` | BD : deux pages, sens manga |
| `Échap` | Revenir à la lecture (quitter un outil d'annotation) |
| `F11` | Plein écran |
| `Ctrl+,` | Réglages |

## Lancer Mímir depuis le clone

```bat
cd lecteur
npm install
npm start
```

`npm install` télécharge Electron, pdf.js, epub.js et les autres librairies dans `lecteur/node_modules/`, et copie le panneau Claude commun dans `lecteur/commun/`. `npm start -- D:\Docs\contrat.pdf` ouvre directement un document.

## Installer Mímir (Windows)

Le plus simple : depuis **Atelier**, catégorie Bureautique, bouton **Installer** sur la carte Mímir. L'installeur déclare aussi Mímir pour les PDF, EPUB, CBZ et CBR : il apparaît dans « Ouvrir avec » de l'Explorateur (pour en faire le lecteur par défaut des PDF : clic droit sur un PDF › Ouvrir avec › Choisir une autre application › Mímir › Toujours), et un double-clic sur un document l'ouvre dans un nouvel onglet de la fenêtre déjà ouverte.

Sinon : sur chaque pull request qui touche `lecteur/`, GitHub fabrique `Mimir-Setup-<version>.exe` (onglet **Checks** de la PR, rubrique « Artifacts »). Pour publier une version, monte la version dans `lecteur/package.json` dans la PR. Quand elle est fusionnée sur `main`, GitHub crée l'étiquette `mimir-v<version>` et publie l'installeur dans les **Releases**, sans la marquer « Latest ».

## Mettre Mímir à jour

Le bouton nuage en haut à droite, comme dans les autres outils. Mímir refuse de s'installer par-dessus lui-même tant qu'un document a des modifications pas enregistrées.

- **Mímir installé** : il cherche la Release `mimir-vX.Y.Z` la plus récente, télécharge son installeur, se ferme, s'installe sans fenêtre et se relance.
- **Mímir lancé depuis le clone** : il lance `lecteur/mettre-a-jour.bat` (git pull, puis npm install) dans une fenêtre à part, puis se relance.

## Comment c'est construit

Electron, sans framework ni outil de compilation, comme Skald et Brokk. L'interface est servie par une adresse à elle, `mimir://app/…` (pdf.js a besoin d'une vraie adresse pour ses modules, son « worker » et ses polices, ce que `file://` ne permet pas).

| Fichier | Rôle |
|---|---|
| `main.js` | Processus principal : la fenêtre, les réglages, la lecture et l'enregistrement des documents, les CBR (décompressés par node-unrar-js), les fichiers ouverts depuis l'Explorateur, la mise à jour |
| `preload.js` | Le pont : la liste des fonctions que l'interface a le droit d'appeler (`window.mimir`) |
| `renderer/app.js` | L'interface : onglets, accueil et documents récents, barre d'état, réglages, glisser-déposer, raccourcis, fermeture avec documents modifiés |
| `renderer/lecteurs/commun.js` | Ce que les lecteurs ont en commun : la liste des lecteurs, leur base, la barre d'outils, la recherche dans un texte |
| `renderer/lecteurs/pdf.mjs` | Le lecteur PDF, avec [pdf.js](https://mozilla.github.io/pdf.js/) (celui de Firefox) : affichage, outils d'annotation, formulaires, enregistrement, impression |
| `renderer/lecteurs/epub.js`, `bd.js`, `word.js`, `texte.js`, `image.js` | Les autres lecteurs, avec epub.js, JSZip, mammoth.js, marked + DOMPurify |
| `renderer/signature.js` | La fenêtre des signatures (dessiner, taper, image, signatures gardées) |
| `renderer/claude-actions.js`, `claude-familles.js` | Ce que Claude peut faire dans Mímir, et les familles de permissions |
| `renderer/l10n/fr.ftl` | Les textes de pdf.js en français (bulles des outils d'annotation) |
| `build/icon.svg` | L'icône : la rune ᛗ (Mannaz) en dégradé bleu. `icon.png` et `icon.ico` en sont tirés |

Pour ajouter un format : un nouveau fichier dans `renderer/lecteurs/` qui hérite de `LecteurBase`, puis son extension dans `FORMATS` (`main.js`) et dans `TYPES` (`renderer/base.js`).

## Pas encore

- Les anciens formats Office (`.doc`), OpenDocument (`.odt`) et PowerPoint.
- Modifier le texte d'un PDF, réorganiser ou fusionner ses pages.
- Signature électronique certifiée (avec certificat) : la signature de Mímir est une image posée sur le document, comme une signature scannée.
