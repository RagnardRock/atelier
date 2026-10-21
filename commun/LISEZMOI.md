# Code commun aux outils de l'Atelier

Ce dossier contient ce que Skald, Tafl et Brokk partagent : le **panneau Claude**, et le moyen pour Claude d'**agir dans l'outil**.

| Fichier | Rôle |
| --- | --- |
| `claude.js` | Processus principal : lance Claude Code, transmet tes messages et ses demandes de permission, garde l'historique des conversations par projet. |
| `mcp-commun.js` | Petit serveur MCP donné à Claude : la mémoire du projet et tes notes, lues et écrites dans le dossier partagé `%APPDATA%\atelier-commun` (tenu à jour par Atelier 0.8 ou plus). |
| `claude-panneau.js` / `.css` | Le panneau dans la fenêtre : bulles, outils utilisés, cartes Autoriser / Refuser, historique. Bouton étincelle dans la barre de titre, ou `Ctrl+Maj+K`. |
| `github.js` | Lit les Releases GitHub pour les mises à jour sans épuiser la limite de 60 demandes par heure de GitHub : le flux des Releases d'abord (non compté), l'API seulement en complément (au plus une fois par demi-heure, gardée sur le disque), et un message clair avec l'heure où réessayer si la limite est atteinte. Atelier et Saga l'utilisent aussi (`hub/commun/`, `moteur/commun/`, copiés par `npm install`). |
| `copier.js` | Recopie ces fichiers dans `<outil>/commun/`. |

**Pourquoi une copie ?** Chaque outil est fabriqué depuis son propre dossier, et son installeur
n'emporte que ce qui s'y trouve. Après chaque `npm install` (ou `npm ci`) dans `retouche/`,
`tuiles/` ou `export/`, npm lance `copier.js` tout seul (`postinstall`). Les copies sont ignorées
par git : on ne modifie que les fichiers de ce dossier-ci, puis `npm install` dans l'outil (ou
`node ../commun/copier.js`) pour les recopier.

Rune a son propre panneau Claude (`ide/`), plus riche (contexte de l'éditeur, rechargement des
fichiers), et sa propre copie de `mcp-commun.js`.

## Ce que Claude sait en arrivant

À chaque lancement, `claude.js` écrit `claude-consignes.md` (dans le dossier de réglages de l'outil)
et le donne à Claude Code (`--append-system-prompt-file`) : dans quel outil il est, le projet et sa
mémoire (déjà lue), et qu'il doit passer par les actions de l'outil sans explorer le PC. Chaque outil
y ajoute ses propres consignes (`CLAUDE_CONSIGNES` dans son `main.js`).

Pour qu'il réponde vite, Claude Code n'a que ses outils de fichiers et de web (`--tools`), et
seulement le serveur MCP de l'Atelier (`--strict-mcp-config`). Les commandes (PowerShell, Bash)
s'ajoutent si la case « Claude peut lancer des commandes » est cochée dans les réglages de l'outil.

Le panneau dit ce que fait Claude quand il n'écrit rien (il réfléchit, prépare une action, ou les
serveurs de Claude ne répondent pas et Claude Code réessaie), avec le temps écoulé. ■ l'arrête,
même s'il est bloqué (au bout de 5 s, Claude Code est arrêté ; le message suivant reprend la conversation).

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

## Les menus et leurs fenêtres

Skald et Tafl donnent aussi à Claude toutes leurs commandes de menu (actions `menus`, `champs_menu`
et `menu`). Une commande qui ouvre une fenêtre de réglages passe par `Dialogs.automatique()` (dans
le `renderer/dialogs.js` de l'outil) : la vraie fenêtre s'ouvre, se remplit avec les valeurs de
Claude comme au clavier, puis se valide toute seule. Une question (« Enregistrer ? ») prend le bouton
demandé, sinon le bouton principal. Les fenêtres de Windows (choisir un fichier, un dossier) restent
pour Ragna : pour écrire dans le projet, Claude a ses propres actions (exporter, enregistrer_sous…).
