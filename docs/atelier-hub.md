---
name: atelier-hub
description: Atelier hub app (hub/ folder): scope, widget order and release conventions decided by Ragna
metadata:
  type: project
  modified: 2026-10-20T12:38:21.678Z
---

- Hub app named **Atelier** (icon ᚨ Ansuz, mint→teal gradient), Electron in atelier/hub, tag `atelier-vX.Y.Z`, release must be --latest=false (Rune's updater reads "Latest"). userData %APPDATA%\atelier-hub. Started 2026-10-20 on branch claude/project-thread-rtcmtg.
- Hub finds installed tools via HKCU Uninstall registry (DisplayName = tool name), fallback %LOCALAPPDATA%\Programs\<Name>; installs/updates by downloading `<Name>-Setup-<v>.exe` from the newest `<prefix>v*` release (silent /S for updates). Tool list: hub/outils.js.
- Ragna's choices 2026-10-20: tools in hub = Rune, Skald (asset export later). Widgets in order: notes, recent projects, clipboard+colors, timers, calendar. All five in the first version, one commit each.
- v0.1 PR #5 squash-merged to main 2026-10-20 (Ragna's yes): launcher + 5 widgets; Rune bumped to 0.12.0 and Skald to 0.3.0 (both accept a folder argument). After merge Ragna pushes rune-v0.12.0, skald-v0.3.0, atelier-v0.1.0. Captures: /mnt/project-files/atelier/captures.
- Testing: Electron binary download via npm fails in container (undici assert); curl the zip from github.com/electron/electron releases into node_modules/electron/dist and write path.txt = "electron".
- Projects widget: images-heavy folder → Skald, else Rune; per-project override via right-click, stored in config.outilsProjets (Ragna chose right-click over a tag file in the folder, 2026-10-20). Codicons 0.0.45 has no eyedropper icon (use SVG).
- Ragna wants to test via real releases (not PR artifacts): after a merge the release publishes itself (no tags since PR #6). Next work: new branch from main + new PR.
- 2026-10-20: rune-v0.12.0, skald-v0.3.0, atelier-v0.1.0 released (Ragna pushed tags). PR #6 makes workflows auto-create tag+release on main when package.json version has no tag yet (Ragna found manual tags tedious). Merged 2026-10-20 (squash f902248): now just bump version in the PR, no tags.
- Windows acrylic turns opaque when the window loses focus: Windows design, not a bug (explained to Ragna 2026-10-20).
- Claude widget (PR #7 squash-merged ee48630 on 2026-10-20 after Ragna's yes, Atelier 0.2.0): hub/claude.js runs installed Claude Code (--tools Read,Glob,Grep, --strict-mcp-config + our MCP hub/mcp-atelier.js via ELECTRON_RUN_AS_NODE, named pipe + token). Context files notes.md/calendrier.md/projets.md/CLAUDE.md rewritten in %APPDATA%\atelier-hub\claude before each message. Ragna chose actions WITH consent (card Autoriser/Refuser) plus "Toujours autoriser" per family (config.claudeSansDemander: notes, calendrier, minuteurs, projets). Widgets execute actions (Notes/Calendrier/Minuteurs APIs). Ultrawide grid min 340px so 6 widgets fit. Don't touch hub/outils.js (other threads add tools).
- PR #11 squash-merged c812e39 2026-10-20 (Atelier 0.4.0, before Tafl #9 so Tafl must bump to 0.5.0): per-project Claude memory in projets-memoire.json (retenir_projet/oublier_projet, family 'memoire'), shown as bookmark in Projets récents. Bump to 0.5.0 if Tafl PR #9 (also 0.4.0) merges first.
- PR #14 squash-merged 28182b6 on 2026-10-20 after Ragna's "ok" (Atelier 0.6.0): spell-check (fr default, setting fr/fr+en/en, HTML right-click menu via context-menu IPC), window bounds in fenetre.json, Claude conversation list in claude-conversations.json (migrates claude.json). Hunspell dict download blocked in container; fake Claude Code script useful for tests.
- Shared Claude across tools: see [claude-partage](claude-partage.md).
