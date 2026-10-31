---
name: saga-export
description: Game export (Saga 0.9 + Tafl 0.26, PR #57): web build and standalone Windows .exe "mode joueur"
metadata:
  type: project
  modified: 2026-10-25T04:13:15.869Z
---

- PR #57 (2026-10-25, branch claude/project-thread-m65nfe, thread "Exporter le jeu en .exe et web"): Saga 0.9 + Tafl 0.26. Squash-merged f796e8c 2026-10-25 with Ragna's yes.
- moteur/exporter.js: web = <Nom>-web/ (index.html with <base href="saga/">, renderer copy, jeu.js = window.SAGA_JEU, web/saga-web.js bridge, localStorage saves) + zip; exe = copy of dirname(execPath) minus Uninstall*/app.asar/default_app.asar, exe renamed <Nom>.exe, resources/app = Saga files, resources/jeu = game + export.json → main.js "joueur" mode (userData %APPDATA%\<Nom>, no Saga tools). Own zip writer.
- CLI: Saga <dossier> --exporter=web,exe --sortie= --rapport= (no window, no single-instance lock). Tafl jeu:exporter spawns it and reads the report.
- Exe keeps Saga's icon (rcedit not added yet; possible follow-up). Not tested on real Windows.
- Testing in container: Electron download via electron/install.js fails; unzip release zip into moteur/node_modules/electron/dist + path.txt. Root needs --no-sandbox (temp wrapper script as path.txt for Tafl→Saga spawn). electron-builder --linux dir -c.electronDist=node_modules/electron/dist gives a packaged build. See [saga](saga.md), [saga-tests](saga-tests.md).
