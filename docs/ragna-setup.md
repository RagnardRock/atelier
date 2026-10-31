---
name: ragna-setup
description: Ragna's machine, priorities and tool plan decisions for the Custom tools project
metadata:
  type: user
  modified: 2026-10-19T17:00:55.536Z
---

- Ragna is on Windows.
- Priority: personal tools first (starting with their own IDE), the Pokémon-like game only after. **Why:** Ragna corrected a plan that started with the game.
- IDE options offered: home-made Electron + Monaco, VS Code fork, or Theia. Electron chosen 2026-10-19.
- Suggested single repo name: `atelier` (all tools in one repo). Plan file: /mnt/project-files/plan/plan-outils.md
- IDE base chosen: plain Electron + Monaco, no bundler/framework, code in `ide/` of repo RagnardRock/atelier (2026-10-19).
- Ragna wants every step explained explicitly ("Explicite tout ce que tu fais"): announce steps before doing them, explain each file, document in README. Pushing to PR #1 is OK'd.
- Ragna's clone: D:\Projets\Atelier\atelier (PowerShell). Ultra-wide screen. AZERTY keyboard assumed (French): avoid shortcuts like Ctrl+\.
- On Windows `npm install` rewrites ide/package-lock.json, which then blocks `git checkout`; fix is `git checkout -- ide/package-lock.json`.
- PR #1 (branch `terminal`, IDE v0.10) was merged into main on 2026-10-19 at Ragna's request. New IDE work: a fresh branch from main + a new PR.
- Testing trick: Electron `before-input-event` ignores Playwright key presses; use xdotool under xvfb for real keystrokes.

- Design taste: minimalist glassmorphism, dark mode. Wants settings via a real UI, not JSON (both done in v0.6, 2026-10-19). Windows 11 acrylic blur (windowBlur) confirmed working on Ragna's PC 2026-10-19, incl. maximized, after upgrading Electron 33 -> 44.5.1 (Electron bug #47814). Blur is only applied at window creation. Test userData config at ~/.config/atelier-ide/config.json can hold broken terminal profiles left by the error tests; delete it before cwd tests.
- IDE chat runs Ragna's installed Claude Code (`claude -p` stream-json, permissions via `--permission-prompt-tool=stdio`). Never test it with a real nested self-approving `claude` (blocked as unsafe); use the mock CLI script (scratchpad mock-claude.js via config claudeCommand). Login happens once by running `claude` in a terminal.
- Windows gotcha: spawning `claude` through cmd.exe picked up `claude.js` in the opened folder (PATHEXT includes .JS). ide/claude.js now resolves claude.exe/.cmd from PATH itself.
- v0.7-0.8 (2026-10-19) added: chat + history, Ctrl+P / Ctrl+Shift+F, Emmet, rename/trash/move, preview server with live reload, Git panel, file watcher reload, session tabs, Prettier 3.9.9 (pinned), image/binary viewer.
- v0.9 (2026-10-19): Ctrl+Alt+W merges a column into its neighbour; « Nouveau projet » (Ctrl+Alt+N, ide/scaffold.js) runs pinned create-vue 3.24.0 / create-vite 9.3.0 + npm install + git, then npm run dev in a terminal. Ragna uses Vue.js a lot. Registry reachable from the container, so real scaffolds can be tested.
- Merging: only when Ragna explicitly says so (they did for PR #1 and PR #2). The proxy blocks pushing tags (git push of a tag and the refs API both fail): Ragna pushes `rune-vX.Y.Z` tags from their PC.
- v0.10: npm scripts panel, replace in project (Ctrl+Shift+H), command palette (Ctrl+Shift+P), Volar (ide/vue.js: tsserver + @vue/typescript-plugin + vue-language-server via ELECTRON_RUN_AS_NODE, typescript 6.0.3 pinned).
- 2026-10-19: the IDE is named **Rune** (Ragna picked it; "Atelier" = the whole set of tools, never name a single tool Atelier; Ragna likes Nordic names). Icon = rune ᚱ (ide/build/icon.svg). PR #2 (branch `exe`): electron-builder NSIS installer Rune-Setup-x.y.z.exe, asar off, npmRebuild off, build/garder-fichiers.js keeps .d.ts (Volar needs them). Releases: tag `rune-vX.Y.Z` → .github/workflows/rune.yml publishes; installed app updates via electron-updater from the repo's latest Release (other tools must not publish "Latest" releases). userData pinned to %APPDATA%\atelier-ide. Actions API is blocked from the container: CI results only arrive as PR events; Wine is absent so the .exe can't be built locally.
