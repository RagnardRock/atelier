---
name: loki
description: The in-app assistant is shown as "Loki" (rune ᛚ) in every Atelier tool since PR #52; code identifiers still say claude
metadata:
  type: project
  modified: 2026-10-24T13:09:12.444Z
---

- Ragna asked 2026-10-24 to rename Claude to **Loki** in all apps (Nordic theme). PR #52 (branch claude/project-thread-hesigy, thread "Renommer Claude en Loki dans les outils"): all user-visible labels → Loki, icon rune ᛚ (Laguz) via `<i class="codicon rune-loki">ᛚ</i>` instead of codicon-sparkle in panel/widget headers; prompts tell the model it is Loki (propulsé par Claude). Kept: config keys claude*, ClaudePanneau, file names, logs, "Claude Code" command and "compte Claude". Menu icon slots still use 'sparkle'.
- Versions in PR #52: Atelier 0.16.0, Rune 0.16.0, Skald 0.8.0, Brokk 0.6.0, Tafl 0.23.0, Mímir 0.2.0, Reikna 0.3.0, Edda 0.2.0. Squash-merged fae7394 2026-10-24 with Ragna's yes (releases auto-published).
- New UI text in any tool should say "Loki", not "Claude".
