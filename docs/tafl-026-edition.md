---
name: tafl-026-edition
description: Tafl 0.28 thread "Améliorer l'édition des cartes et événements" — selection/copy-paste, undo everywhere, block event editor, dialogue preview
metadata:
  type: project
---

- Ragna approved 2026-10-25 (thread "Améliorer l'édition des cartes et événements dans Tafl", branch claude/project-thread-rfoe2o) a plan for Tafl 0.26: 1) Sélection tool (R) + Ctrl+C/X/V between maps, floating paste, option calque choisi/tous + passage/zones/événements; 2) Ctrl+Z inside event/Données/sprite windows, layer visibility undoable, Historique panel (click = go back); 3) block view of event scripts (blocks top→bottom, choix/si branches side by side, palette drag, list view still available), JSON format unchanged so Saga untouched; 4) dialogue preview (portrait, name, text, choices, theme verre/pixel).
- Free graph with arbitrary links (needs "aller à" + Saga change) left for later.
See [tafl](tafl.md), [tafl-editeur-jeu](tafl-editeur-jeu.md).

- Shipped as Tafl 0.28 (0.26/0.27 taken by PRs #57/#58): PR #59, branch claude/project-thread-rfoe2o, squash-merged 8246832 2026-10-25 with Ragna's yes. Files: renderer/presse-papiers.js, renderer/blocs.js (Blocs + Apercu), Events.suivi (per-key JSON undo in overlay windows), Doc.travel, Édition menu, Ctrl+H history. Event editor default view = blocs (localStorage tafl.vueScript). Captures /mnt/project-files/tafl/captures-0.28.
