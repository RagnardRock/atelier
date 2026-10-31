---
name: ia-locale
description: Local LLM alternative to Claude for Loki in all Atelier tools (Ollama), thread "Ajouter une IA locale à la place de Claude", started 2026-10-31
metadata:
  type: project
---

- Ragna asked (2026-10-28) for a local alternative to Claude in every app, for when tokens run out or a user has no Claude Code subscription. Next big ecosystem update.
- Plan approved by Ragna 2026-10-31 (Ragna had a bad experience with Qwen before, so model is choosable; Mistral Nemo 12B + Llama 3.1 8B offered too). Built in PR #74 (branch claude/project-thread-6sr42k: Atelier 0.19.0, Rune/Skald/Tafl/Brokk 1.1.0, Reikna 0.4.0, Edda 0.3.0, Mímir 0.3.0, Kenning 0.2.0), waiting for Ragna's yes; not tested on Windows with real Ollama. Design: Atelier installs/manages Ollama + models (default Qwen3 14B, optional 4B); shared local engine in commun/ (Ollama tool calling, same actions + file tools, same permission cards); per-tool choice Claude / Local / Auto (auto fallback on limit, banner); GPU shared with ComfyUI (unload before generation); honest limits shown, fewer tools, no web. Order: hub + commun tested in Tafl, then others, then Rune (own ide/claude.js). Middle version bump per tool.
- Backends today: commun/claude.js (shared, copied into tools), hub/claude.js, ide/claude.js. See [loki](loki.md), [claude-autorisations](claude-autorisations.md), [comfyui](comfyui.md).
- Code: commun/ollama.js (API, install via OllamaSetup.exe /SILENT, pull/delete, liberer, settings atelier-commun/ia-locale.json), commun/loki-local.js (agent loop, outilsFichiers, echecClaude, >24 actions → catalogue + voir_action/faire_action, max 25 steps). config.lokiMoteur auto|claude|local per tool (panel select; hub settings). Rune copies ollama/loki-local/mcp-commun via postinstall into ide/commun. Hub UI: Réglages › IA locale… (hub/renderer/ia-locale.js).
