---
name: assets-lot
description: Bulk download script for the Pokémon tileset Google Sheet (thread "Téléchargement des assets en lot", 2026-10-21)
metadata:
  type: project
  modified: 2026-10-21T07:59:54.058Z
---

- Source: public Google Sheet "Pokémon Ultimate Tileset Collection" (id 1hy3DqFFUu_H6Ddibr5evoqGW8aVSPHxSH6cZWuu9IR8), 7 tabs (Outdoor, Indoor, In+Out, Misc, Animated, Auto, In+Out+Misc). Tab 1: 88 rows, all DeviantArt, mostly Gen 3. ☆ = credit required, ❉ = not required. Non-commercial use only.
- The cloud container cannot reach docs.google.com or deviantart.com (proxy 403), so the script runs on Ragna's PC.
- Script (not in the repo, no yes asked yet): /mnt/project-files/assets-lot/telecharger-assets.js + lancer.bat. Node 18+, no deps. Reads the XLSX export (keeps hyperlinks), DeviantArt via public oEmbed, CREDITS.txt per asset, CREDITS-GLOBAL.md, rapport.html for manual ones, resumable via etat.json. Tested only with a mocked network.
- Limit: original files behind DeviantArt's Download button need a login; script flags reduced previews by comparing sizes with oEmbed width/height.
- 2026-10-21 evening: DeviantArt answers 403 to Node and curl.exe from Ragna's PC (morning 503 was site maintenance), but the site opens in Ragna's browser. So a browser version was added: assets-lot/navigateur/ (Electron 44.5.1, persistent session "persist:deviantart", Ragna logs in once, it opens each page and uses the Download button, falls back to og:image). Launch: lancer-navigateur.bat. Tested here with a fake HTTPS site only.
