---
name: pack-jrpg
description: Second rules pack "JRPG classique" for Tafl + Saga — Saga 0.8 + Tafl 0.25, PR #56 (2026-10-25), status and design
metadata:
  type: project
---

- Asked by Ragna 2026-10-24 (thread "Créer un pack de règles JRPG classique", branch claude/project-thread-ekmmq9). Plan doc: https://claude.ai/artifact/Mho6DBHvA5wv14vZovu8xm, approved ("ok").
- PR #56 squash-merged 645a5dc 2026-10-25 with Ragna's yes (releases saga-v0.8.0, tafl-v0.25.0).
- Design: pack in moteur/renderer/moteur/regles/jrpg/ (heros, combat, hors-combat, fiches, pack.js), side-view screen ecran-groupe.js, chosen by reglages.regles = 'jrpg'. Heroes = personnages.json + classe/niveau/equipement; new data classes.json, monstres.json, groupes.json; skills = attaques.json (+cout_pm, ranime, guerit); equipment on objets.json. Party 4 + Réserve; menus Groupe / Bestiaire / Réserve. Script commands groupe + combat_groupe, condition membre, compteur monstres_vaincus.
- Full pack-contract doc (French, asked by Ragna): moteur/renderer/moteur/regles/REGLES.md — keep it updated when the Regles facade changes. Tafl data format in tuiles/FORMAT.md › "Le pack JRPG".
- Tafl has an "Ajouter des données d'exemple" button (Réglages, jrpg) for a ready demo.
- Packs are pure objects (no DOM, talk via ui) so future sandboxed JS scripts can replace formulas or write whole packs. See [saga](saga.md), [tafl-editeur-jeu](tafl-editeur-jeu.md).
- Screenshots: /mnt/project-files/saga/captures-jrpg/
