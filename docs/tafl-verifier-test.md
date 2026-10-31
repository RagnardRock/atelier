---
name: tafl-verifier-test
description: Tafl 0.27 game checker (Vérifier le jeu) + quick test (Test rapide → Saga 0.10 --test), PR #58, 2026-10-25
metadata:
  type: project
---

- Asked by Ragna 2026-10-25 (thread "Ajouter un vérificateur et un test rapide à Tafl", branch claude/project-thread-w7awuq). PR #58 squash-merged 8047264 2026-10-25 with Ragna's yes (tafl-v0.27.0, saga-v0.10.0).
- Checker: tuiles/renderer/verificateur.js (pure, file format input, optimistic reachability mirroring Saga Monde.destination), UI in outils-jeu.js, Jeu › Vérifier le jeu Ctrl+Maj+V, Stage.montrer(x,y) blinks a cell, Loki action `verifier` (lecture).
- Quick test: Jeu › Test rapide Ctrl+F5; named states in jeu.json `tests`; Tafl writes temp file and launches Saga --test=<file>; Saga moteur.js appliquerTest, badge Test, saves to <hash>-test.json. FORMAT.md › Test rapide.
- PR #57 (export) merged first with Saga 0.9 / Tafl 0.26, so #58 bumped to Tafl 0.27 / Saga 0.10.
- Captures: /mnt/project-files/tafl/captures-0.26/. See [tafl](tafl.md), [saga](saga.md).
