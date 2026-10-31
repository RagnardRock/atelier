---
name: brokk
description: Brokk, Ragna's asset export tool in atelier/export — scope, conventions, testing tricks
metadata:
  type: project
  modified: 2026-10-20T03:53:17.227Z
---

- Brokk ᛒ (ember gold→red gradient, accent #ff7a3d) = atelier/export, Electron 44.5.1 + ag-psd, plain scripts like Skald. PR #8 opened 2026-10-20 (branch claude/project-thread-1kzaiz), v0.1.0, tag brokk-v via .github/workflows/brokk.yml, release --latest=false. userData %APPDATA%\atelier-export.
- Model: project folder → assets (source + recette + options), stored in config.projets[dossier] (nothing written in the user's project besides outputs). Recipes in renderer/recettes.js: favicon, image (@1x/@2x), responsive, og, libre.
- Favicon recipe patches index.html between `<!-- brokk:icones -->` markers; first time removes old icon/manifest/theme-color tags.
- Writes only inside the opened project (main.js dansProjet). Config writes are serialized (modifierConfig) — an unserialized read-modify-write lost the "surveiller" flag in tests.
- Watch mode watches source DIRECTORIES (Photoshop saves via temp+rename).
- Hub: outils.js entry (ouvreDossier 0.1.0) + projets.js right-click "Exporter les assets avec Brokk"; hub bumped to 0.3.0 in PR #8 (PR #7 widget Claude took 0.2.0). Merged 2026-10-20 as 43a7a9a.
- Testing: fixtures/scripts in thread scratchpad; launch with Playwright executablePath node_modules/electron/dist/electron, args ['--no-sandbox', appDir, projectDir, images...]; XDG_CONFIG_HOME for isolated config. ImageMagick here can't read SVG (no rsvg): render icons via Electron page.
- Captures: /mnt/project-files/brokk/captures.
