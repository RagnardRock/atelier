# Atelier

Mes outils perso, réunis dans un seul dépôt. Pour l'instant, un seul outil : **l'IDE** (`ide/`). Les prochains (pipeline d'assets, panneau serveur…) viendront à côté.

## Lancer l'IDE (Windows)

Prérequis : [Node.js](https://nodejs.org) 20 ou plus.

```bat
cd ide
npm install
npm start
```

`npm install` télécharge Electron et Monaco dans `ide/node_modules/` (ignoré par git). `npm start` ouvre la fenêtre de l'IDE.

## Ce que fait l'IDE (v0.2)

- **Ouvrir un dossier** (bouton ou `Ctrl+O`) : l'arborescence s'affiche à gauche. Les sous-dossiers ne sont lus qu'au clic, donc même un gros projet s'ouvre vite. Le dossier `.git` est masqué.
- **Éditer** : clic sur un fichier, il s'ouvre dans un onglet avec Monaco, le moteur de VS Code (coloration selon l'extension, autocomplétion, `Ctrl+F` pour chercher, `Ctrl+H` pour remplacer, multi-curseurs avec `Alt+clic`).
- **Enregistrer** : `Ctrl+S`. Un `●` sur l'onglet signale des modifications non enregistrées.
- **Fermer un onglet** : `×` ou `Ctrl+W`. L'IDE demande confirmation si le fichier n'est pas enregistré.
- **Config perso** : le bouton **Config** ouvre ton fichier de réglages dans l'IDE. Tu le modifies, `Ctrl+S`, et c'est appliqué tout de suite.
- **Terminal intégré** : bouton **Terminal** ou `Ctrl+J` pour afficher / masquer le panneau en bas. Le terminal démarre dans le dossier ouvert. Tu peux en ouvrir plusieurs en onglets : choisis un profil dans la liste, puis `+`. La poignée au-dessus du panneau permet de régler sa hauteur.
- **SSH vers ton serveur** : le profil « Mon serveur (SSH) » lance `ssh` (le client intégré à Windows 10/11) dans un onglet. Tes clés SSH habituelles (`%USERPROFILE%\.ssh`) sont utilisées, et le mot de passe ou la passphrase se tapent directement dans le terminal.
- **Outils de dev** : `F12` ouvre la console Chromium, comme dans un navigateur. `Ctrl+R` recharge l'interface.

### Réglages disponibles

| Clé | Rôle | Exemples |
|-----|------|----------|
| `theme` | Thème de l'éditeur et de l'interface | `"vs-dark"`, `"vs"` (clair), `"hc-black"` (contraste élevé) |
| `accentColor` | Couleur de la barre d'état, des onglets actifs, etc. | `"#e0a526"` |
| `fontFamily` | Police de l'éditeur | `"Consolas, monospace"` |
| `fontSize` | Taille du texte | `15` |
| `tabSize` | Largeur d'une tabulation | `2`, `4` |
| `wordWrap` | Retour à la ligne automatique | `"on"`, `"off"` |
| `minimap` | Mini-carte du fichier à droite | `true`, `false` |
| `terminalFontSize` | Taille du texte du terminal | `14` |
| `terminalProfiles` | Liste des terminaux proposés (voir ci-dessous) | |

### Profils de terminal

Chaque profil a un nom, une commande et ses arguments :

```json
"terminalProfiles": [
  { "name": "PowerShell", "command": "default", "args": [] },
  { "name": "Mon serveur (SSH)", "command": "ssh", "args": ["utilisateur@mon-serveur.fr"] },
  { "name": "Serveur port 2222", "command": "ssh", "args": ["-p", "2222", "moi@1.2.3.4"] },
  { "name": "Git Bash", "command": "C:\\Program Files\\Git\\bin\\bash.exe", "args": ["--login"] },
  { "name": "Invite de commandes", "command": "cmd.exe", "args": [] }
]
```

`"default"` désigne le shell du système (PowerShell sous Windows). **Pense à remplacer `utilisateur@mon-serveur.fr` par ton vrai serveur.** Si tu as déjà un alias dans `%USERPROFILE%\.ssh\config` (par exemple `Host prod`), `"args": ["prod"]` suffit.

Le fichier est stocké dans `%APPDATA%\atelier-ide\config.json`. Au premier lancement, il est copié depuis `ide/config.default.json`. Une clé absente ou un JSON cassé fait revenir aux valeurs par défaut, donc l'IDE démarre toujours.

## Comment c'est construit

Electron fait tourner deux mondes séparés :

```
main.js  (Node.js : fenêtre, disque)
   ⇅  IPC (messages)
preload.js  (le pont : liste des fonctions autorisées)
   ⇅
renderer/  (Chromium : l'interface en HTML/CSS/JS)
```

| Fichier | Rôle |
|---------|------|
| `ide/main.js` | Processus principal. Crée la fenêtre, gère la boîte de dialogue « ouvrir un dossier », lit et écrit les fichiers. Il refuse tout accès en dehors du dossier ouvert (et de ta config). Il lance aussi les processus des terminaux avec node-pty et les arrête à la fermeture de l'IDE. |
| `ide/preload.js` | Expose à l'interface `window.atelier` : les fichiers (`openFolder`, `readFolder`, `readFile`, `writeFile`), la config (`getConfig`, `getConfigPath`) et les terminaux (`createTerminal`, `writeTerminal`, `resizeTerminal`, `killTerminal`, plus deux écouteurs pour la sortie et la fin d'un processus). Rien d'autre de Node n'est accessible côté interface (`contextIsolation`). |
| `ide/renderer/index.html` | Structure de la page : barre du haut, arborescence, onglets, éditeur, barre d'état. La balise `Content-Security-Policy` n'autorise que les scripts locaux. |
| `ide/renderer/style.css` | Tout le visuel. Les couleurs sont des variables CSS (`--accent`, `--bg`…) en haut du fichier, faciles à changer. |
| `ide/renderer/app.js` | La logique : charge Monaco, construit l'arborescence, gère les onglets, l'enregistrement et la config. |
| `ide/renderer/terminal.js` | Le panneau terminal : crée les terminaux xterm.js, les onglets, la poignée et le raccourci `Ctrl+J`. |
| `ide/config.default.json` | Réglages par défaut. |

Le terminal fonctionne en deux morceaux : **node-pty** (dans `main.js`) lance un vrai processus PowerShell ou ssh via ConPTY, l'API de terminal de Windows. **xterm.js** (dans `terminal.js`) l'affiche, avec les couleurs et le curseur. Entre les deux, chaque frappe et chaque morceau de texte passent par IPC. node-pty fournit ses binaires Windows déjà compilés, donc `npm install` n'a besoin d'aucun outil de compilation.

Pas de framework ni de bundler : le code que tu lis est exactement celui qui tourne. Monaco est chargé directement depuis `node_modules` avec son propre chargeur (`loader.js`), et son interface est en français.

## Prochaines étapes

1. Panneau d'aperçu navigateur avec rechargement auto.
2. Pipeline d'assets Photoshop / Illustrator.
3. Panneau serveur (déployer, logs, redémarrer).
