---
name: reikna
description: Excel-like spreadsheet tool for Atelier, named Reikna (folder tableur/, tag reikna-v) — decisions and status
metadata:
  type: project
  modified: 2026-10-24T04:39:44.065Z
---

- 2026-10-24: Ragna validated the name **Reikna** (Old Norse "to count/calculate"), rune ᛞ, emerald green gradient. Thread "Créer un tableur type Excel", branch claude/project-thread-9f39io.
- Folder `tableur/`, tag `reikna-v`, Electron app modelled on Brokk (export/). Hub entry with `categorie: 'bureautique'` (hub categories thread bumps Atelier to 0.11.0; re-bump after it merges).
- Formats: read xlsx/xls/ods/csv/tsv (SheetJS), write xlsx (ExcelJS, keeps formatting), ods, csv.
- Formulas: HyperFormula, **French function names by default** (=SOMME), setting to switch to English. Ragna asked for access to **all functions** with **autocomplete** while typing.
- v0.1 scope: virtualized grid, sheets tabs, clipboard with Excel, fill handle, undo/redo, formatting, freeze panes, sort/filter, shared Claude panel with actions. Charts + conditional formatting planned for 0.2.
- Related: [edda](edda.md) (text editor, ᛖ), PDF reader thread (Mímir), [atelier-hub](atelier-hub.md).
- 2026-10-24: Reikna 0.1 = PR #48 squash-merged 7ff3cd2 with Ragna's yes (reikna-v0.1.0, Atelier 0.13.0). Libraries: hyperformula (GPL v3), exceljs, @e965/xlsx (official SheetJS 0.20.3 on npm; cdn.sheetjs.com blocked by proxy). Claude actions in tableur/renderer/claude-actions.js, 5 permission families. Screenshots: /mnt/project-files/reikna/captures/.
- 2026-10-24: Reikna 0.2 (charts via Chart.js + conditional formatting, saved in xlsx; charts written into the zip with JSZip by renderer/xlsx-extras.js) = PR #51 squash-merged cda5137 2026-10-24 with Ragna's yes (reikna-v0.2.0). Screenshots 0.2-*.png in /mnt/project-files/reikna/captures/. Ideas left: pivot tables, data validation lists, cell comments, images, print/PDF.
