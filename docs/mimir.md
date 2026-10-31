---
name: mimir
description: Mímir, the PDF/document reader tool in atelier (name, scope, decisions)
metadata:
  type: project
  modified: 2026-10-24T04:37:34.916Z
---

- Document reader named **Mímir** (icon ᛗ), chosen by Ragna 2026-10-24 (Edda went to the text editor thread). Tag prefix `mimir-v`, hub category `bureautique`.
- Scope of 0.1 (Ragna, 2026-10-24): PDF via pdf.js (tabs, thumbnails, outline, zoom, search, print, dark reading), plus EPUB, CBZ, images, TXT/MD, DOCX read-only (xlsx left to the spreadsheet thread). Ragna explicitly wants **annotations, signature and PDF form filling in 0.1**, not later.
- Built in parallel with a text editor, a spreadsheet and hub categories (Atelier 0.11.0 there): expect conflicts in hub/outils.js and re-bump Atelier after they merge.
- Mímir 0.1 = PR #47 squash-merged 4d7608a 2026-10-24 with Ragna's yes (releases mimir-v0.1.0 + atelier-v0.12.0). Other threads bumping Atelier must now go to 0.13.0. Uses a custom `mimir://` protocol (pdf.js needs it). Gotcha: pdf.js editor toolbar inherits a huge font-size from stamp editors; style.css forces 12px. Claude never signs. Not done yet: .doc/.odt/pptx, editing PDF text, merging pages, certified signatures.
