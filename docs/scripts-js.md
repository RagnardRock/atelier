---
name: scripts-js
description: Sandboxed user JS scripts for Tafl + Saga (roadmap step 1) — thread, plan doc, design decisions, status
metadata:
  type: project
  modified: 2026-10-25T13:04:43.370Z
---

- Thread "Ajouter des scripts JS à Tafl et Saga", started 2026-10-25 after Tafl 0.30. Branch claude/project-thread-na8n3g.
- Plan doc (Claude Doc): https://claude.ai/artifact/Q7553vwZDFJ2QYyd4A4QGh — Ragna said Ok 2026-10-25.
- Implemented: PR #63 (Tafl 0.31 + Saga 0.12) squash-merged 637826d 2026-10-25 with Ragna's yes. Not yet tested in Electron on Windows. Captures /mnt/project-files/tafl/captures-0.31, saga/captures-0.12.
- Key pieces: commun/bac-a-sable.js (worker, 600 ms watchdog, seeded dice in partie.graine); moteur/renderer/moteur/scripts-js.js (ScriptsJs host + Maison.formule used by packs); tuiles/renderer/scripts-js.js (ScriptsTafl: Monaco page, Essayer, inventory); tuiles/SCRIPTS.md (API doc, copied to game folder); Loki actions scripts/script/essayer_script/variable; reglages.scripts.formules_coupees. New rules packs must list formulas in BacASable.FORMULES.
- Proposed design: Web Worker sandbox (no network/files/importScripts, ~200 ms CPU budget, worker killed+restarted on overrun); script files `scripts/*.js` in game folder; API `commande(nom, params?, fn)`, `formule(nom, fn)` (list of overridable formulas comes from the project's rules pack), `quand(moment, fn)`; effects only via saga.* commands applied by host (pure, multiplayer-ready); dice via `des.d(20)` / `des.lancer('2d6+3')`, never Math.random. New game variables (number/text) + block + condition. Tafl: Scripts page in Événements space, Monaco editor + API autocompletion, templates per pack, Essayer button with fake partie, Script block with form, "Règles maison" in Réglages › Règles, vérificateur, Ctrl+K, Loki actions. Docs: new SCRIPTS.md, REGLES.md §7 updated. Deferred: full pack in script (with TTRPG pack), real-time behaviours, script conditions.
- Target versions: Tafl 0.31, Saga 0.12.
See [tafl-refonte-ui](tafl-refonte-ui.md), [pack-jrpg](pack-jrpg.md), [saga](saga.md).
