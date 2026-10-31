---
name: skald
description: Skald, Ragna's Photoshop-like image/logo editor in atelier/retouche — architecture, release rules, testing tricks
metadata:
  type: project
  modified: 2026-10-20T02:25:43.551Z
---

- Skald = atelier/retouche, Electron 44.5.1 + ag-psd 31.0.3, plain scripts, canvas-based. PR #4 merged (squash) 2026-10-20 as 0.2.0; Ragna pushes tag skald-v0.2.0. Next changes: new PR from main AND bump retouche/package.json version, else the update button offers nothing. userData: %APPDATA%\atelier-retouche.
- Releases: tag `skald-vX.Y.Z` (Ragna pushes it), workflow .github/workflows/skald.yml, release created with `--latest=false` because Rune's electron-updater reads /releases/latest. Skald update button (renderer/update.js) lists GitHub releases via API, picks newest skald-v*, then electron-updater generic feed on that release download URL (needs latest.yml + blockmap uploaded by the workflow).
- Layers: every pixel change must go through editPixels()/replacePixels() (copy-on-write) so undo snapshots stay valid.
- Electron 44 removed clipboard.readImage/writeImage: use async clipboard.read()/write() with ClipboardItem (main.js).
- Testing: Playwright `_electron.launch` needs args ['--no-sandbox', appDir] in that order, else it hangs; don't `return` a promise that waits on a dialog from page.evaluate (wrap in braces).
- v0.2 (2026-10-20): selections are masks (renderer/selection.js), lasso/wand/clone/gradient/shapes/free transform (tools-extra.js), levels, exposure. Scripts must not run timers at load: start them in View.init() (caused 'App is not defined').
- Dialogs: set range min/max BEFORE value, else browser clamps to 0-100.
- Fill/adjustment layers (renderer/adjustments.js): layer.fill/layer.adjust = {type, values} (immutable, replace on edit); layer.canvas is the mask (alpha). composite() calls Adjust.drawLayer. Brush on them paints mask PS-style (dark hides). PSD read/write maps to ag-psd adjustment/vectorFill (not verified in real Photoshop).
- Free transform draws live via doc.live hook in composite (no per-move pixel work); transforms only selection if one exists.
- Not done yet: pixel-layer masks, healing brush, dodge/burn, smudge, curves, guides, editable PSD text.
