---
name: tafl-reglages-clairs
description: Tafl Réglages cleanup (pack-aware, sub-tabs) — thread "Clarifier les réglages de Tafl", mockup, plan, status
metadata:
  type: project
  modified: 2026-10-25T19:05:17.788Z
---

- Asked by Ragna 2026-10-25 after Tafl 0.32: Réglages (Données › Réglages, formReglages in tuiles/renderer/donnees.js) unclear; a JRPG game still shows Pokémon things (badges, Pokédex, PC boxes).
- Mockup (Design canvas): https://claude.ai/artifact/MxDzjsWcR3ZvxVwcZp6EJN — 4 sub-tabs Règles du jeu / Partie / Interface / Ambiance, pack chip, pack picker as 3 cards, only settings the active pack uses (hidden values kept), badges + level caps + trainers/wild/friendship/natures only for Pokémon, "Donner un badge" block + Pokémon counters hidden in other packs (unless badges exist), JDR single money setting, menu labels per pack.
- Target version: Tafl 0.32.1 (fix/clarity). Branch claude/project-thread-ujmkth. Mockup approved ("ok") 2026-10-25; PR #67 squash-merged 98f7d1d 2026-10-25 with Ragna's yes (tafl-v0.32.1); not yet tested on Windows. Captures /mnt/project-files/tafl/captures-0.32.1/. Code: formReglages + ongletRegles/Partie/Interface/Ambiance + reglesPokemon in donnees.js; Events.duPack supports aussiSi(doc); compteursDu(doc) filters counters per pack; normReglages forces jdr.monnaie='unique' and maps Pokédollars to the pack's money.
See [tafl-refonte-ui](tafl-refonte-ui.md), [pack-jrpg](pack-jrpg.md), [pack-jdr](pack-jdr.md).
