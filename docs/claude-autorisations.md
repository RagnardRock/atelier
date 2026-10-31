---
name: claude-autorisations
description: How Claude permissions work in each Atelier tool, and the 2026-10-23 work to make "always allow" visible/revocable (PR #40 Tafl first)
metadata:
  type: project
---

- Before 2026-10-23: Atelier hub = persistent per-family "sans demander" checkboxes in Réglages (config.claudeSansDemander). Rune = Réglages › Claude › "Modifications de fichiers" (ask/acceptEdits); "Toujours autoriser" = Claude Code session rules. Skald/Tafl/Brokk = only claudeCommandes checkbox; "Toujours" = session-only, invisible, not revocable. Saga has no Claude.
- Ragna said yes to fixing it, Tafl first (2026-10-23). PR #40 (Tafl 0.18.0, branch claude/project-thread-wmmtul, thread "Autorisations de Claude dans les outils"): commun/claude.js answers can_use_tool itself by family (FAMILLES_COMMUNES fichiers/memoire/web/commandes + tool families via ClaudePanneau.familles in tuiles/renderer/claude-familles.js); card "Ne plus demander : cette conversation / toujours"; shield popover in panel header (Redemander, Tout redemander); Tafl settings checkboxes. Needs register({writeConfig}) + preload autorisations/retirerAutorisation per tool.
- PR #40 squash-merged ece1694 2026-10-23 with Ragna's yes. PR #42 (same branch, from main): Skald 0.7, Brokk 0.5 (same wiring) + Rune 0.15 (ide/claude.js own family logic: fichiers persistent = claudePermissionMode acceptEdits, no more --permission-mode flag; commands family = prefix 'commande:npm run dev', chained commands never; web/memoire in claudeSansDemander; settings toggle supports sub). Squash-merged 2eb9790 2026-10-23 with Ragna's yes (releases skald-v0.7.0, brokk-v0.5.0, rune-v0.15.0).
- Test trick: fake Claude Code script (stream-json, emits can_use_tool) as config.claudeCommand, XDG_CONFIG_HOME temp dir.
