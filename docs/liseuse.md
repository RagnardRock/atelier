---
name: liseuse
description: Kenning, the eBook reader tool (atelier/liseuse, separate from Mímir) — choices, structure, PR status
metadata:
  type: project
  modified: 2026-10-25T14:10:43.658Z
---

- Ragna chose name **Kenning** (rune ᚲ Kenaz, lavender→indigo icon) and engine **foliate-js** (2026-10-25). Folder atelier/liseuse, tag kenning-v, hub categorie bureautique, userData %APPDATA%\atelier-liseuse (config.json, bibliotheque.json, couvertures\).
- Kenning 0.1.0 + Atelier 0.18.0 = PR #64 squash-merged 8e67b9c 2026-10-25 with Ragna's yes (releases kenning-v0.1.0, atelier-v0.18.0). Not tested on Windows yet.
- foliate-js vendored unmodified (commit 78914ae) in liseuse/renderer/foliate/; epub.js (Mímir) can't read MOBI/AZW3/FB2. DRM Kindle refused with message; PDF → Mímir. Book scripts blocked by page CSP (blob: iframes inherit it).
- renderer/livre.js (no UI dependency): ouvrirLivre, metadonnees, chapitres, texteChapitre(book, n, {phrases}) → paragraphs/sentences/words via Intl.Segmenter. Base for the future Polish tutor [mimir](mimir.md).
- Loki actions: read-only (bibliotheque, livre_ouvert, lire_chapitre, texte_visible, chercher, aller_chapitre, ouvrir_livre, surlignages) + permission (surligner, ranger, modifier_fiche, reglages_lecture). commun/claude-panneau.js got `demander(texte, {envoyer})`.
- 0.1.1 fix (PR #66 squash-merged 1a9539f 2026-10-25 with Ragna's yes, kenning-v0.1.1): reading-settings panel held a stale L() reference, so sliders worked once only. Always read L() at change time.
- Gotchas found in tests: generated-cover padding must scale with --couv (not %); ecrireConfig must not overwrite pending lecture settings; scanner IPC returns {chemin,taille,modifie} objects.
- Screenshots: /mnt/project-files/kenning/captures/.
