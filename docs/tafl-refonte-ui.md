---
name: tafl-refonte-ui
description: Tafl UI redesign (workspaces, home screen, Ctrl+K) — thread "Refondre l'interface de Tafl", mockup, version 0.30, pack-aware rule
metadata:
  type: project
  modified: 2026-10-25T05:43:23.340Z
---

- Thread "Refondre l'interface de Tafl" (branch claude/project-thread-ow9zv5), started 2026-10-25 after PR #60. Mockup: https://claude.ai/artifact/QYbuJbQGMnLy1UFGyapwaX, approved by Ragna ("Oui") 2026-10-25. Implemented as PR #62, squash-merged 00bd792 2026-10-25 with Ragna's yes (tafl-v0.30.0). Not yet tested in real Electron on Windows.
- Proposal: workspace tabs Accueil/Tuiles/Cartes/Événements/Données/Jeu (+Table later, only for packs that need it), F1-F6, old menus behind a ☰ button, Données + event editor as full pages, Événements space lists events of all maps, Ctrl+K global search, panels collapse to icon rail under 1500px container width, tab labels icon-only under 1300px.
- Version: this redesign is Tafl 0.30.0, not 1.0 (Ragna 2026-10-25: Tafl and Saga go 1.0 only after JS scripts + multiplayer are merged).
- Ragna 2026-10-25: stay consistent with per-project rules packs: Données nav, Jeu space, Ctrl+K results and event blocks are built from the open project's pack (Pokémon: Types/Talents/Attaques/Créatures/Dresseurs; JRPG: Éléments/Compétences/Classes/Monstres/Groupes). Future packs declare their own tabs.
See [tafl](tafl.md), [pack-jrpg](pack-jrpg.md).
- Implementation (PR #62): renderer/espaces.js (Espaces: aller/appliquer/recharger, page loops for Données/Événements, Accueil, Jeu), renderer/recherche.js (Ctrl+K). Events.fenetre/editEvent/editData take `page` (host element) → courantPage, separate from overlay `courant`. Page edits apply on leave/save/play/undo/before Loki write actions (avecPages wrapper in claude-actions.js). Space shortcuts Alt+1..6 (Ctrl+6 = zoom out on AZERTY), Ctrl+Tab; menus behind ☰ with submenus (Menus item.submenu); Ctrl+B hides side panels. Captures /mnt/project-files/tafl/captures-0.30/. Test harness: Chromium + Proxy-stubbed window.tafl/claude.
