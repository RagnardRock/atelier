---
name: edda
description: Edda ᛖ, Atelier's Word-like text editor (folder texte/, tag edda-v) — status, PR, design choices
metadata:
  type: project
  modified: 2026-10-24T10:37:18.347Z
---

- 2026-10-24: Ragna approved the name **Edda** (icon ᛖ, gradient #7cc4ff→#b18cff) and asked for media (images, videos, sounds) in the page.
- Edda 0.1.0 = PR #49 squash-merged e3d8b3f 2026-10-24 with Ragna's yes (edda-v0.1.0), together with Atelier 0.14.0 (after Reikna #48 took 0.13.0): hub entry categorie bureautique, project menu "Écrire un document avec Edda".
- Formats: docx/odt/rtf/md/html/txt read+write; .doc refused with explanation. Videos/sounds in docx/odt/rtf go to "<doc>-medias/" with a link that Edda turns back into a player on reopen.
- Claude writes via Editeur.insererA (a "sentinel" empty paragraph so Chromium's insertHTML doesn't merge into a heading/list), one Ctrl+Z step. Families: redaction, fichiers_edda.
- Not done / ideas: headers/footers, footnotes, comments, columns, tracked changes (signalled on open); video width not kept in docx.
- Related: [atelier-hub](atelier-hub.md), [claude-autorisations](claude-autorisations.md), [mimir](mimir.md)
