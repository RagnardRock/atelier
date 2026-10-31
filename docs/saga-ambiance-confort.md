---
name: saga-ambiance-confort
description: Saga 0.11 + Tafl 0.29 (PR #60) ambiance (music/sounds, day/night, lighting) and comfort (gamepad, options, autosave) — plan approved 2026-10-25
metadata:
  type: project
  modified: 2026-10-25T04:04:18.790Z
---

- Thread "Ajouter ambiance et confort de jeu à Saga", branch claude/project-thread-a0v2zd. Plan approved by Ragna ("oui") 2026-10-25.
- Plan: per-map music + ambient loop + battle music + SFX from game folder `sons/` (MP3/OGG/WAV), crossfade; built-in synthesized bips (WebAudio) when no file. Day/night: in-game clock (day length configurable, default 24 min) or real PC time as option; interiors unaffected; script condition on time of day. Lighting: light sources on tiles/events with halo at night. Comfort: full gamepad in all menus + remappable keys/buttons, Options menu in pause (text speed, music/SFX volume, fullscreen), autosave on map change + every X min (toggle in Tafl Réglages), manual save unchanged.
- Versions: PR #57 (game export) took Saga 0.9 + Tafl 0.26, and PR #58 (vérifier + test rapide) took Saga 0.10 + Tafl 0.27, and PR #59 took Tafl 0.28, so this work is Saga 0.11 + Tafl 0.29 = PR #60 (squash-merged 82d7313 2026-10-25 with Ragna's yes). Captures: /mnt/project-files/saga/captures-0.11/. Test scripts: Playwright with fake gamepad (navigator.getGamepads stub).
- Out of scope: real-time base (animations, pathfinding), comes after JS scripts. See [saga](saga.md), [saga-tests](saga-tests.md).
