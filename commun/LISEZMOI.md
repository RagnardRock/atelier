# Code commun aux outils de l'Atelier

Ce dossier contient ce que Skald, Tafl et Brokk partagent : le **panneau Claude**, et le moyen pour Claude d'**agir dans l'outil**.

| Fichier | Rôle |
| --- | --- |
| `claude.js` | Processus principal : lance Claude Code, transmet tes messages et ses demandes de permission, garde l'historique des conversations par projet. |
| `mcp-commun.js` | Petit serveur MCP donné à Claude : la mémoire du projet et tes notes, lues et écrites dans le dossier partagé `%APPDATA%\atelier-commun` (tenu à jour par Atelier 0.8 ou plus). |
| `claude-panneau.js` / `.css` | Le panneau dans la fenêtre : bulles, outils utilisés, cartes Autoriser / Refuser, historique. Bouton étincelle dans la barre de titre, ou `Ctrl+Maj+K`. |
| `copier.js` | Recopie ces fichiers dans `<outil>/commun/`. |

**Pourquoi une copie ?** Chaque outil est fabriqué depuis son propre dossier, et son installeur
n'emporte que ce qui s'y trouve. Après chaque `npm install` (ou `npm ci`) dans `retouche/`,
`tuiles/` ou `export/`, npm lance `copier.js` tout seul (`postinstall`). Les copies sont ignorées
par git : on ne modifie que les fichiers de ce dossier-ci, puis `npm install` dans l'outil (ou
`node ../commun/copier.js`) pour les recopier.

Rune a son propre panneau Claude (`ide/`), plus riche (contexte de l'éditeur, rechargement des
fichiers), et sa propre copie de `mcp-commun.js`.

## Les actions de l'outil

Chaque outil décrit ce que Claude peut y faire dans `renderer/claude-actions.js`, avec
`ClaudePanneau.actions({ nom: { description, schema, lecture, icone, libelle, faire } })`.
`faire(args)` tourne dans la fenêtre et renvoie un texte, ou `{ texte, image: <canvas> }` pour que
Claude voie le résultat.

Le chemin d'un appel : Claude Code → `mcp-commun.js` (qui annonce les actions comme des outils
`mcp__atelier__<nom>`) → un canal privé (tube nommé sous Windows, protégé par un jeton) →
`claude.js` dans le processus principal → la fenêtre → `faire()` → et retour. Les actions
`lecture: true` ne demandent pas la permission ; les autres affichent la carte Autoriser / Refuser.

Dans l'outil installé, `mcp-commun.js` est sorti de l'archive `app.asar` (`asarUnpack` dans le
`package.json` de l'outil) : Claude Code le lance avec le Node d'Electron, qui ne peut pas lire un
script resté dans l'archive.
