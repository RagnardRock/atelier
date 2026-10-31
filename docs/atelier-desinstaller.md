---
name: atelier-desinstaller
description: Uninstall tools from the Atelier hub (trash button on cards) — PR #50 merged, Atelier 0.15.0
metadata:
  type: project
  modified: 2026-10-24T10:38:11.195Z
---

2026-10-24, thread "Désinstaller des outils depuis Atelier": PR #50 (branch claude/project-thread-jkvt0f) adds a trash button on installed tool cards in hub/renderer/outils.js → confirm → tool must be closed → main.js `outils:desinstaller` runs the tool's own NSIS uninstaller silently (registry QuietUninstallString, else UninstallString + /S, else `Uninstall <nom>.exe`), then polls until the exe is gone (NSIS relaunches itself from temp, so exit code alone isn't enough). Tool settings kept. Version Atelier 0.15.0 because Reikna #48 and Edda #49 take 0.13/0.14; re-bump per merge order. Squash-merged 0ff7254 on 2026-10-24 with Ragna's yes (atelier-v0.15.0), after Reikna 0.13 and Edda 0.14. Captures: /mnt/project-files/atelier/captures-0.14/. Possible follow-up: optional checkbox to also delete the tool's settings. See [atelier-hub](atelier-hub.md).
