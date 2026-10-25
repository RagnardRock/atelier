# foliate-js (copie)

Le moteur de lecture de Kenning : il ouvre les EPUB, MOBI, AZW3 (KF8), FB2 et CBZ, les met en pages
(ou en défilement continu), dessine les surlignages et cherche dans le livre. C'est le moteur de la
liseuse Foliate (Linux), sous licence MIT (voir `LICENSE`).

- Source : https://github.com/johnfactotum/foliate-js, commit `78914ae` (1er mai 2026).
- Il n'est pas publié sur npm : ses fichiers sont copiés ici tels quels, **sans modification**, pour
  pouvoir le mettre à jour en recopiant simplement les fichiers d'un commit plus récent.
- Copiés : `view.js`, `paginator.js`, `fixed-layout.js`, `epub.js`, `epubcfi.js`, `mobi.js`, `fb2.js`,
  `comic-book.js`, `progress.js`, `overlayer.js`, `text-walker.js`, `search.js`, `tts.js`,
  `footnotes.js`, `dict.js` et `vendor/zip.js` (BSD-3), `vendor/fflate.js` (MIT).
- Laissés de côté : la lecture des PDF (`pdf.js` et sa copie de PDF.js, 13 Mo : les PDF restent le
  travail de Mímir), le lecteur de démonstration et OPDS.

Sécurité : les livres s'affichent dans des cadres `blob:` qui héritent de la règle de sécurité de la
fenêtre (`renderer/index.html`) : seuls les scripts de Kenning s'exécutent, jamais ceux d'un livre.
