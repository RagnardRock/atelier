---
name: tafl-jetons
description: Tafl 0.18 token-saving work for the in-app Claude (PR #41) and Ragna's ComfyUI wish
metadata:
  type: project
---

- 2026-10-23: Ragna's in-app Claude in Tafl burned the session quota 3× on a "3 towns + 3 gyms" demo with DeviantArt tilesets. Measured causes: `infos` listed all 2 589 tiles (~22k tokens, re-read every later call), `voir_tuiles` image was 25 px wide (useless), `voir_carte` always image + full grid, towns built with hundreds of small actions. Tool list ≈ 13k tokens (cached by Claude Code).
- Fix = PR #41 (Tafl 0.19.0, squash-merged 7217f78 on 2026-10-23 with Ragna's yes, release tafl-v0.19.0): actions `catalogue`, `nommer`, `plan_carte` (text plan + legend, one Ctrl+Z), paged/numbered `voir_tuiles`, compressed `voir_carte` (image only on request), token counter under each reply in the shared Claude panel (commun/). PR #40 (permissions, Tafl 0.18.0, merged first) added tuiles/renderer/claude-familles.js; new actions must be added to a family there.
- Ragna on ComfyUI (2026-10-23): fine to use it as a hidden engine driven by Atelier, but keep the option of NOT doing pixel art, since Ragna wants to go beyond Pokémon-likes. ComfyUI integration comes later, in its own thread. See [tafl](tafl.md).
- Tafl 0.20 = PR #43, squash-merged 7c48ff9 2026-10-23 with Ragna's ok (release tafl-v0.20.0): named sheets. Ragna preferred an explicit export over a hidden name library in Tafl. Fichier › Exporter la planche nommée writes planche.png + planche.tuiles.json (format tafl-planche-nommee: per grid cell nom/passage/categorie/images/duree, tampons by cell); importing the PNG re-applies everything (also to already-present unnamed tiles via dedupe). Claude action exporter_planche_nommee. Ragna plans to test: Claude names an unnamed sheet → export → import in a new game.
