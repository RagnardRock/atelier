---
name: pack-jdr
description: TTRPG rules pack "jdr" (roadmap step 2) for Tafl 0.32 + Saga 0.13 — thread, plan doc, design, status
metadata:
  type: project
  modified: 2026-10-25T15:37:50.578Z
---

- Thread "Créer le pack de règles JDR", started 2026-10-25 after PR #63 merged. Branch claude/project-thread-e9ucci (from main 637826d).
- Plan doc (Claude Doc): https://claude.ai/artifact/RtwCXjZz2869HGjGk9cvq9, approved by Ragna ("Ok") 2026-10-25 with defaults: SRD 5.1, meters, creation in Saga, one PR.
- Built (2026-10-25): commits 9545511 (Saga 0.13: moteur/renderer/moteur/regles/jdr/ base, des, personnage, tests, combat, hors-combat, creation, fiches, pack; des-ecran.js dice tray; new optional pack hooks commandes/condition/debut/actionsPause/agirPause/pourScript) and 915ed36 (Tafl 0.32: donnees-jdr.js, modele-dnd5e.js, exemple-jdr.js, event blocks "Dés et règles", verifier/test rapide/scripts editor/Loki aware). Docs: FORMAT.md "Le pack JDR", REGLES.md §8, SCRIPTS.md.
- Data sorts: caracteristiques, competences, etats, origines, classes_jdr, sorts, monstres_jdr (+ groupes = rencontres, objets.jdr arme/armure, personnages[].jdr = pré-tirés, reglages.jdr = house rules). JDR ids keep "_" (idJ), unlike Doc.slug.
- New game dialog field "Partir de" → "L'aventure JDR d'exemple" → "La crypte de Brumeval" (village + crypt, 3 encounters, balanced for 3 heroes); played end to end in Saga headless.
- Multiplayer prep only: journal lines have `cache`, sheets have `joueur`. No table mode / grid yet (roadmap step 3).
- Status: PR #65 squash-merged d809199 2026-10-25 with Ragna's yes (tafl-v0.32.0, saga-v0.13.0). Not yet tested on Windows. Captures: /mnt/project-files/saga/captures-0.13, /mnt/project-files/tafl/captures-0.32.
See [scripts-js](scripts-js.md), [pack-jrpg](pack-jrpg.md), [saga](saga.md).
