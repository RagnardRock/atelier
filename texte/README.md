# Edda ᛖ : le traitement de texte

Edda est le traitement de texte d'Atelier, à la Word. Son nom vient des Eddas, les grands livres de la mythologie nordique. On écrit sur une vraie page (A4, marges, police), on met en forme avec un ruban, et on enregistre dans le format qu'on veut : Word, LibreOffice, RTF, Markdown, page web ou texte brut.

Même direction artistique que les autres outils : mode sombre, verre dépoli, réglages dans l'interface (aucun JSON à écrire). La couleur d'accent par défaut est le bleu ciel de son icône.

## Les formats

| Format | Lire | Enregistrer | Ce qui est gardé |
|---|---|---|---|
| **Word** (`.docx`, et `.docm`, `.dotx` en lecture) | oui | oui | Tout ce qu'Edda sait faire : titres, gras, couleurs, polices, tailles, alignement, listes, tableaux (cases fusionnées, couleur de fond), liens, images, sauts de page, mise en page. |
| **LibreOffice** (`.odt`, et `.ott` en lecture) | oui | oui | Pareil que Word. |
| **RTF** (`.rtf`) | oui | oui | Pareil, sauf les cases fusionnées des tableaux. |
| **Page web** (`.html`) | oui | oui | Tout. Les images, vidéos et sons sont rangés dans un dossier à côté. |
| **Markdown** (`.md`) | oui | oui | Titres, gras, italique, barré, listes, tableaux, liens, images. Pas les couleurs, polices ni l'alignement (Edda prévient). |
| **Texte brut** (`.txt`) | oui | oui | Le texte seulement. L'encodage du fichier ouvert (UTF-8 ou celui du vieux Bloc-notes) est gardé. |

Les anciens `.doc` (Word 97-2003) ne s'ouvrent pas : Edda explique comment les convertir (Word ou LibreOffice : « Enregistrer sous » `.docx`).

Ce qu'Edda ne sait pas encore afficher (en-têtes et pieds de page, notes de bas de page, commentaires, zones de texte, colonnes, suivi des modifications) n'est pas perdu en silence : à l'ouverture, une notification « Voir le détail » dit ce qui a été simplifié. Pareil à l'enregistrement : si le format choisi ne garde pas tout (les couleurs en Markdown, par exemple), Edda le dit une fois.

## Images, vidéos et sons dans la page

- **Insérer** : les boutons image, vidéo et son du ruban (ou le menu Insertion), glisser un fichier sur la page (il arrive là où on le lâche), ou coller une capture d'écran (`Ctrl+V`).
- **Clic sur un média** : une petite barre apparaît (largeur 25 / 50 / 75 / 100 % de la ligne, taille d'origine, aligner à gauche / au centre / à droite, ouvrir le fichier avec son logiciel, texte de remplacement pour une image, supprimer). La poignée en bas à droite change la taille à la souris, en gardant les proportions. `Suppr` supprime.
- **À l'enregistrement** : dans un `.docx`, `.odt` ou `.rtf`, les images sont mises **dans le fichier** (Word et LibreOffice les affichent). Une vidéo ou un son ne peut pas vivre dans ces formats : il est copié dans le dossier **`nom-du-document-medias`** à côté du document, et la page garde un lien « ▶ Vidéo : nom » (ou « ♪ Son : nom ») qui l'ouvre. Quand Edda rouvre le document, le lien redevient un lecteur vidéo ou son. En `.html` et `.md`, tous les médias vont dans ce dossier.

## Le ruban et les raccourcis

Le ruban suit le curseur : le bouton gras s'allume dans du gras, la police et la taille affichées sont celles du texte sous le curseur.

| Raccourci | Action |
|---|---|
| `Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+Maj+S`, `Ctrl+W` | Nouveau, ouvrir, enregistrer, enregistrer sous, fermer l'onglet |
| `Ctrl+P` | Imprimer (et « Exporter en PDF » dans le menu Fichier) |
| `Ctrl+Tab` | Document suivant |
| `Ctrl+F`, `Ctrl+H` | Rechercher, remplacer (`Ctrl+Alt+Entrée` : tout remplacer) |
| `Ctrl+G` ou `Ctrl+B`, `Ctrl+I`, `Ctrl+U` | Gras, italique, souligné |
| `Ctrl+L`, `Ctrl+E`, `Ctrl+R`, `Ctrl+J` | Aligner à gauche, centrer, à droite, justifier |
| `Ctrl+Maj+L` | Liste à puces |
| `Ctrl+Alt+1` à `3`, `Ctrl+Alt+0` | Titre 1 à 3, texte normal |
| `Ctrl+Maj+>`, `Ctrl+<` | Agrandir, réduire le texte |
| `Ctrl+=`, `Ctrl+Maj+=` | Indice, exposant |
| `Ctrl+Espace` | Effacer la mise en forme |
| `Ctrl+K` | Lien (`Ctrl+clic` sur un lien l'ouvre) |
| `Ctrl+Entrée` | Saut de page |
| `Tab` | Dans un tableau : case suivante (dans la dernière, une nouvelle ligne) ; dans une liste : un niveau de plus |
| `Ctrl+molette`, `Ctrl+0` | Zoom, zoom 100 % |

Le clic droit propose les corrections d'orthographe (français, ou français et anglais, dans les Réglages), le copier-coller, et dans un tableau : ajouter ou supprimer des lignes et colonnes, la ligne d'en-tête, la couleur de fond des cases.

**Format › Mise en page** : papier (A4, A5, A3, Letter, Legal), portrait ou paysage, marges (normales, étroites, larges ou au centimètre près), police et taille du document. Elles sont enregistrées dans le fichier (Word, LibreOffice, RTF, HTML).

Chaque Ctrl+Z est annulable, même les changements faits par Claude : tout passe par l'historique de la page. Chaque onglet garde son propre historique.

## Claude dans Edda

Le bouton ✦ (en haut à droite, ou `Ctrl+Maj+K`) ouvre le panneau Claude commun à tous les outils d'Atelier. Claude peut :

- **lire** les documents ouverts et le texte sélectionné (sans demander) ;
- **écrire** : ajouter au curseur, au début ou à la fin, remplacer la sélection, remplacer un mot ou une phrase partout, réécrire tout le document, insérer une image du projet, changer la mise en page ;
- **ouvrir et enregistrer** des documents, seulement dans le dossier du projet.

Avant d'écrire ou d'enregistrer, il demande (carte Autoriser / Refuser). « Ne plus demander » vaut pour une famille d'actions (« Écrire et corriger dans les documents », « Ouvrir et enregistrer des documents »), pour la conversation ou pour de bon (Réglages d'Edda, ou le bouclier du panneau). Ce que Claude écrit s'annule avec `Ctrl+Z`.

Quand Atelier ouvre Edda sur un projet (clic droit sur un projet › « Écrire un document avec Edda »), l'accueil liste les documents de ce dossier et c'est le projet de Claude.

## Sécurité

- Edda n'écrit que les fichiers que tu as choisis (fenêtre « Enregistrer sous », documents ouverts) et leur dossier de médias. Claude, lui, n'écrit que dans le dossier du projet.
- Un document est d'abord écrit à côté, puis renommé : si quelque chose plante en plein milieu, l'ancien fichier reste intact.
- Si le fichier a été modifié par un autre logiciel depuis son ouverture, Edda demande avant de l'écraser (et propose de le recharger quand tu reviens dans la fenêtre).
- Le HTML ouvert ou collé est nettoyé (pas de scripts, pas de styles qui casseraient la page).
- En fermant avec des documents pas enregistrés, Edda demande.

## Installer, lancer, mettre à jour

Comme les autres outils : depuis **Atelier** (bouton Installer dans la colonne Outils, catégorie Bureautique), ou l'installeur `Edda-Setup-x.y.z.exe` de la page Releases du dépôt (étiquettes `edda-v…`). Le bouton nuage de la barre de titre cherche et installe la dernière version ; s'il reste des documents pas enregistrés, il propose de les enregistrer d'abord.

Depuis le clone (pour développer) :

```bat
cd texte
npm install
npm start
```

Les réglages sont dans `%APPDATA%\atelier-texte\config.json` (modifiables depuis la roue dentée), le journal dans `%APPDATA%\atelier-texte\edda.log`.

## Comment c'est fait

- `main.js` : la fenêtre, les fichiers (lire, écrire, médias, PDF, impression), l'orthographe, la mise à jour. `preload.js` : ce que la fenêtre a le droit de demander.
- `renderer/formats/` : un fichier par format. Chacun lit vers du HTML (la page) et écrit depuis une liste de blocs commune (`commun.js`) : paragraphes, titres, listes, tableaux, médias, sauts de page.
- `renderer/editeur.js` : la page (contenteditable), les commandes du ruban, les tableaux. `medias.js` : la barre des médias. `recherche.js` : rechercher et remplacer. `app.js` : les onglets, ouvrir, enregistrer, les menus, les réglages.
- `renderer/claude-actions.js` et `claude-familles.js` : les actions de Claude et leurs familles d'autorisation.
- Bibliothèques : JSZip (les .docx et .odt sont des zip), marked (Markdown → HTML), Turndown (HTML → Markdown), DOMPurify (nettoyage du HTML).
