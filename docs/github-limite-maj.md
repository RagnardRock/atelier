---
name: github-limite-maj
description: Tool update checks: 60/hour API limit (PR #25 commun/github.js) and feed-ordering blind spot fixed by probing next tag pages (PR #54)
metadata:
  type: project
  modified: 2026-10-24T13:28:33.296Z
---

On 2026-10-20, after the Tafl 0.8.0 release, Ragna got "GitHub a répondu 403" on update checks. The cause: GitHub's unauthenticated API allows 60 requests per hour per IP, shared by all tools. The Atelier hub was polling the API every 30 s during builds.

The fix is PR #25 (merged 2026-10-21). It adds commun/github.js, used by all tools:
- it reads the releases.atom feed first, which is not rate-limited;
- it calls the API at most once every 30 min and caches the result on disk;
- once the limit is hit, it makes no API calls until the reset and shows a French message with the retry time.

2026-10-24: Atelier 0.15 wasn't offered 0.16/0.17 although releases were fine. Cause: GitHub sorts releases by day then tag name DESC, so the 10-entry feed shows tafl/skald/saga/rune/reikna/mimir first; atelier/brokk/edda drop out on busy days and only arrive via the 30-min API cache. Fix PR #54 (Atelier 0.17.1, branch claude/project-thread-un64r7): after merging feed + cache, HEAD github.com/.../releases/tag/<prefix>vX.Y.Z for patch/minor/major+1 per tool, chaining. Squash-merged 88293aa 2026-10-24 with Ragna's yes (atelier-v0.17.1).

**How to apply:** new update or GitHub code should go through commun/github.js, not raw api.github.com calls. Rune is not affected: it uses electron-updater, which does not call the API.
