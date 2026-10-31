---
name: mode-table
description: Table mode in Saga for the jdr pack (roadmap step 3) — thread "Créer le mode table dans Saga", plan, status
metadata:
  type: project
  modified: 2026-10-25T19:27:37.465Z
---

- Thread "Créer le mode table dans Saga", started 2026-10-25 from main 98f7d1d. Branch claude/project-thread-pwcvsy. Target Saga 0.14 + Tafl 0.33.
- Plan posted to Ragna 2026-10-25 (waiting for ok): grid board on the Tafl map (1 case = 1,5 m), tokens (GM moves all, player own), grid combat reusing JdrCombat + range/movement, fog = Tafl zones flagged "pièce" (hidden at start, GM reveals by click or brush), GM view (see all, hidden rolls + Révéler, pause, music/sound panel), second "player screen" window receiving only filtered state (same host-authoritative model as step 4 multiplayer). Tafl: "Visible par: tous / MJ / tel joueur" on events, encounters, zones; Brumeval example gets rooms.
- Ragna asked 2026-10-25: grid = one cell per map tile (any tile px size); add Tafl setting "une case = 1,5 m" (scale for distances only).
- Range (told Ragna 2026-10-25): cells from data `portee` m; melee = adjacent incl. diagonal, allonge 2 cells; ranged normal/long (long = disadvantage); diagonal = 1 cell (SRD), Tafl option 5-10-5 alternating; walls (blocked cells) block line of sight; in-range targets lit, GM can force.
See [pack-jdr](pack-jdr.md), [saga](saga.md).

Status (2026-10-25): built and tested in headless Chromium; PR #68 squash-merged 141a795 2026-10-25 (saga-v0.14.0, tafl-v0.33.0). Not tested on Windows. Captures: /mnt/project-files/saga/captures-0.14/
