---
name: comfyui
description: Tafl ↔ ComfyUI tile generation (Tafl 0.22, PR #45): Ragna's Comfy install, models, design decisions
metadata:
  type: project
  modified: 2026-10-24T01:01:39.867Z
---

- Ragna chose 2026-10-24 option 2 "caché": Tafl starts ComfyUI's Python engine hidden (windowsHide, 127.0.0.1:8189), stops it on quit; Ragna never sees Comfy's UI. Ragna also wants installation made easy from Tafl (guided install dialog: detect, pick folders, open official download page, download models from HF/Civitai).
- Ragna's install: new ComfyUI Desktop; models at %LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Shared\models. Checkpoints: dreamshaperXL_lightningDPMSDE, juggernautXL_ragnarok (SDXL). diffusion_models: flux1-dev-kontext_fp8_scaled (+ text_encoders clip_l, t5xxl_fp8). No LoRA yet (Tafl offers Pixel Art XL, nerijs/pixel-art-xl).
- Ragna's real layout (seen 2026-10-24 in Tafl's install dialog, detection worked): code %LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Installs\tests poké\ComfyUI (an install named "tests poké"), python = that ComfyUI\.venv\Scripts\python.exe, shared models %LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Shared\models. If several installs exist Tafl takes the first; Ragna can pick another.
- Implementation: tuiles/comfy.js (main), renderer/comfy.js (dialogs, styles pixel/peint/dessin/realiste/libre, FR→EN word list, SDXL graph), renderer/post-traitement.js (pure, node-testable), Claude action generer_tuiles. Not locked to pixel art (Ragna's requirement).
- Next idea: Flux Kontext to retouch existing tiles/sheets from an image.
- Test trick: fake ComfyUI python server in scratchpad; pgrep/pkill -f patterns match your own shell, use "[f]akecomfy".
- Quality lessons (2026-10-24, real tests): Pixel Art XL raw output IS decent pixel art but its big-pixel grid is ~8px, fractional and offset → must detect grid (PostTraitement.versGrille) before sampling, else mush. SDXL "grass with flowers" gives a dense busy meadow regardless of "calm" prompts; best lever = img2img from the game's selected tile ("Partir de : la tuile choisie", Liberté du modèle 55%). Ragna judged previews by comparing with the raw image (click thumbnail).
- Model shortlist sent to Ragna 2026-10-24 (awaiting their test): Pixel Art Diffusion XL (civitai 277680, SDXL ckpt, "pixel art" trigger, 30-40 steps CFG ~6, no selling without author consent) and Nova Pixels XL v3 (civitai 1856313, Illustrious ckpt, 20-30 steps CFG 5, unedited outputs non-commercial). Tafl download accepts Civitai page links (resolves version via API), refuses HTML responses, and sends the Civitai API key (config.civitaiCle, set in the install dialog) because Civitai answered 401 without login. Ragna downloaded both (2026-10-24): Pixel Art Diffusion XL for tiles, Nova Pixels for portraits/fanart. Tafl reglagesModele now recognises both by filename (prefix keywords, steps/CFG/sampler, no auto Pixel Art XL LoRA); pixel style prefers Pixel Art Diffusion XL. Awaiting Ragna comparison.
- Lesson (2026-10-24): models draw ~128 art px (1024/8); forcing that into Largeur×Hauteur tiles shrank objects (lost detail) and cropped ground to its centre → Ragna: "les deux aperçus vont pas". Fix: "Taille finale : celle de l'image" (default, pixel art) keeps everything, Tafl counts tiles. Pixel Art Diffusion XL gives tree objects Ragna likes; for "short grass" sol it draws a mini map (bushes, paths), not a texture.
