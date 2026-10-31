---
name: saga-tests
description: How to test Saga's renderer in the cloud container without Electron (Playwright + stubbed window.saga)
metadata:
  type: reference
---

Saga 0.7 (PR #55): testing without Electron works: load moteur/renderer/index.html in Playwright Chromium with an addInitScript stubbing window.saga (ouvrirJeu/lireSauvegarde return generated game texts + a save), then drive via App.moteur / App.ouvrirDossier(dossier, depart, partie). Captures /mnt/project-files/saga/captures-0.7.
Tafl's renderer works the same way: stub window.tafl and window.claude with a Proxy (on* → noop), run `node ../commun/copier.js` in tuiles/ first, build a doc with Doc.create + Samples.fill and App.setDocument. See [saga](saga.md).
