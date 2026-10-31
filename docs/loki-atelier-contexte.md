---
name: loki-atelier-contexte
description: How the hub's Loki knows Atelier's tools/widgets (atelier.md built from outils.js) and its tool actions; PR #53, Atelier 0.17
metadata:
  type: project
---

- 2026-10-24 Ragna reported Loki in Atelier didn't know new tools/widgets. Fix = PR #53 (Atelier 0.17.0): hub/claude.js writes atelier.md before each message, built from hub/outils.js + real install state (etatOutils({github:false}) in main.js, uses cached releases) and a WIDGETS description list in claude.js.
- **When adding a widget**: also describe it in WIDGETS in hub/claude.js (app.js has a comment). New tools in outils.js are picked up automatically.
- New MCP actions: installer_outil (attendre true/false when a version is en préparation), desinstaller_outil (family 'installation'), verifier_mises_a_jour + calculer (family 'lecture', auto-allowed, no card). Renderer: Outils.pourLoki.installer/desinstaller.
- Merged 2026-10-24 (squash 392fe2d, atelier-v0.17.0) with Ragna's advance permission.
- See [loki](loki.md), [atelier-hub](atelier-hub.md).
