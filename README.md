# Atelier

Mes outils perso, réunis dans un seul dépôt. Pour l'instant, un seul outil : **l'IDE** (`ide/`). Les prochains (pipeline d'assets, panneau serveur…) viendront à côté.

## Lancer l'IDE (Windows)

Prérequis : [Node.js](https://nodejs.org) 20 ou plus.

```bat
cd ide
npm install
npm start
```

`npm install` télécharge Electron, Monaco et les librairies du terminal dans `ide/node_modules/` (ignoré par git). `npm start` ouvre la fenêtre de l'IDE.

> Sous Windows, `npm install` peut réécrire légèrement `ide/package-lock.json`. Si git refuse ensuite un `git checkout` ou un `git pull` à cause de ce fichier, annule sa modification avec `git checkout -- ide/package-lock.json` : il sera régénéré au prochain `npm install`.

## Ce que fait l'IDE (v0.3)

- **Ouvrir un dossier** (bouton ou `Ctrl+O`) : l'arborescence s'affiche à gauche. Les sous-dossiers ne sont lus qu'au clic, donc même un gros projet s'ouvre vite. Le dossier `.git` est masqué.
- **Éditer** : les fichiers s'ouvrent dans Monaco, le moteur de VS Code (coloration selon l'extension, autocomplétion, `Ctrl+F` pour chercher, `Ctrl+H` pour remplacer, multi-curseurs avec `Alt+clic`).
- **Aperçu ou onglet permanent** :
  - **Clic** sur un fichier : il s'ouvre en *aperçu* (nom en italique), et le prochain fichier cliqué prendra sa place. Pratique pour parcourir un projet sans accumuler les onglets.
  - **Double-clic** ou **clic molette** : le fichier s'ouvre dans un onglet permanent.
  - Un aperçu devient aussi permanent dès que tu le modifies, ou si tu double-cliques sur son onglet.
- **Clic molette sur un onglet** : le ferme (éditeur et terminal).
- **Glisser-déposer des onglets** : pour changer leur ordre, ou pour les envoyer dans une autre colonne. Un trait de couleur indique où l'onglet va arriver.
- **Plusieurs colonnes côte à côte** :
  - `Ctrl+Alt+D` ouvre le fichier actif dans une nouvelle colonne à droite.
  - Tu peux aussi glisser un onglet sur la zone **Nouvelle colonne**, qui apparaît au bord droit pendant le glisser.
  - Il n'y a pas de limite au nombre de colonnes. Chacune a ses onglets, et un même fichier affiché dans deux colonnes partage le même texte (une modification apparaît des deux côtés).
  - Une colonne vide se ferme toute seule.
- **Enregistrer** : `Ctrl+S`. Un `●` sur l'onglet signale des modifications non enregistrées.
- **Fermer un onglet** : `×`, clic molette ou `Ctrl+W`. L'IDE demande confirmation si le fichier n'est pas enregistré.
- **Config perso** : le bouton **Config** ouvre ton fichier de réglages dans l'IDE. Tu le modifies, `Ctrl+S`, et c'est appliqué tout de suite.
- **Terminal intégré** : bouton **Terminal** ou `Ctrl+J` pour afficher / masquer le panneau en bas. Le terminal démarre dans le dossier ouvert. Tu peux en ouvrir plusieurs en onglets : choisis un profil dans la liste, puis `+`. La poignée au-dessus du panneau permet de régler sa hauteur.
- **Serveurs favoris** : l'onglet **Serveurs** de la barre latérale liste tes serveurs. Un clic sur un serveur ouvre la connexion SSH dans un nouvel onglet de terminal. **+ Ajouter un serveur** ouvre un formulaire (nom, hôte, utilisateur, port, clé SSH facultative avec un bouton pour la choisir). Au survol d'un serveur, ✎ permet de le modifier et 🗑 de le supprimer. La connexion utilise `ssh`, le client intégré à Windows 10/11. **Aucun mot de passe n'est enregistré** : avec une clé SSH, la connexion est directe, sinon ssh te demande ton mot de passe dans le terminal.
- **Erreurs** : voir la section [Gestion des erreurs](#gestion-des-erreurs).
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
| `terminalProfiles` | Liste des terminaux locaux proposés (voir ci-dessous) | |
| `shortcuts` | Raccourcis globaux, qui marchent même quand le terminal a le focus | `{ "toggleTerminal": "Ctrl+J", "splitEditor": "Ctrl+Alt+D" }` |

### Profils de terminal

Pour tes serveurs, utilise plutôt le panneau Serveurs. Les profils servent aux terminaux locaux. Chaque profil a un nom, une commande et ses arguments :

```json
"terminalProfiles": [
  { "name": "PowerShell", "command": "default", "args": [] },
  { "name": "Git Bash", "command": "C:\\Program Files\\Git\\bin\\bash.exe", "args": ["--login"] },
  { "name": "Invite de commandes", "command": "cmd.exe", "args": [] }
]
```

`"default"` désigne le shell du système (PowerShell sous Windows).

Le fichier est stocké dans `%APPDATA%\atelier-ide\config.json`, et tes serveurs dans `%APPDATA%\atelier-ide\servers.json`, juste à côté. Au premier lancement, il est copié depuis `ide/config.default.json`. Une clé absente ou un JSON cassé fait revenir aux valeurs par défaut, donc l'IDE démarre toujours.

### Raccourcis

`toggleTerminal` (afficher / masquer le terminal) et `splitEditor` (diviser l'écran) se règlent dans `shortcuts`. Une combinaison s'écrit avec `Ctrl`, `Alt` et `Shift`, puis la touche : `"Ctrl+Shift+T"`, `"Alt+F12"`… La touche est celle qui est imprimée sur ton clavier (AZERTY compris).

Ces deux raccourcis sont interceptés par `main.js` *avant* que l'éditeur ou le terminal ne reçoivent la touche. C'est ce qui permet à `Ctrl+J` de fermer le terminal même quand il a le focus, alors que pour un terminal, `Ctrl+J` veut normalement dire « retour à la ligne ».

## Gestion des erreurs

- **Notifications** : en bas à droite. Les infos disparaissent seules. Les **erreurs** et les **avertissements** restent affichés jusqu'à ce que tu les fermes, avec un bouton **Voir le journal**.
- **Config invalide** : si ton `config.json` contient une erreur (virgule oubliée, guillemet manquant…), un avertissement indique **la ligne et la colonne** du problème, et l'IDE continue avec les valeurs par défaut. Corrige, `Ctrl+S`, et c'est réappliqué.
- **Erreurs imprévues** : toute erreur JavaScript non prévue, dans l'interface comme dans `main.js`, est affichée en notification au lieu de passer inaperçue, et l'IDE continue de tourner.
- **Plantage de l'interface** (rare) : une fenêtre propose de la recharger.
- **Terminal** : si un profil ne peut pas démarrer (commande introuvable…), le message s'affiche en notification ou directement dans le terminal, et l'onglet est barré une fois le processus terminé.
- **Journal** : tout est écrit avec la date dans `%APPDATA%\atelier-ide\atelier.log` : démarrages, erreurs, refus d'accès, config invalide. Au-delà de 1 Mo, l'ancien journal est renommé `atelier.old.log`. Si quelque chose ne va pas, c'est ce fichier qu'il faut me montrer.

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
| `ide/main.js` | Processus principal. Crée la fenêtre, gère la boîte de dialogue « ouvrir un dossier », lit et écrit les fichiers. Il refuse tout accès en dehors du dossier ouvert (et de ta config). Il lance aussi les processus des terminaux avec node-pty et les arrête à la fermeture de l'IDE. Il tient le journal `atelier.log`, intercepte les raccourcis globaux et attrape les erreurs imprévues. Enfin, il enregistre les serveurs favoris et construit leur commande `ssh`, en refusant un hôte ou un utilisateur qui commence par `-`, pour qu'on ne puisse pas glisser une option ssh dans un champ. |
| `ide/preload.js` | Expose à l'interface `window.atelier` : les fichiers (`openFolder`, `readFolder`, `readFile`, `writeFile`), la config (`getConfig`, `getConfigPath`) les terminaux (`createTerminal`, `writeTerminal`, `resizeTerminal`, `killTerminal`, plus deux écouteurs pour la sortie et la fin d'un processus) les serveurs (`listServers`, `saveServer`, `deleteServer`, `pickKeyFile`, `connectServer`) et la gestion des erreurs et raccourcis (`getLogPath`, `log`, `onAppError`, `onShortcut`). Rien d'autre de Node n'est accessible côté interface (`contextIsolation`). |
| `ide/renderer/index.html` | Structure de la page : barre du haut, arborescence, onglets, éditeur, barre d'état. La balise `Content-Security-Policy` n'autorise que les scripts locaux. |
| `ide/renderer/style.css` | Tout le visuel. Les couleurs sont des variables CSS (`--accent`, `--bg`…) en haut du fichier, faciles à changer. |
| `ide/renderer/notify.js` | Les notifications, et la capture des erreurs imprévues de l'interface. |
| `ide/renderer/app.js` | La logique : charge Monaco, construit l'arborescence et les colonnes, gère les onglets (aperçu, clic molette, glisser-déposer), l'enregistrement et la config. |
| `ide/renderer/terminal.js` | Le panneau terminal : crée les terminaux xterm.js, les onglets, la poignée et le raccourci `Ctrl+J`. |
| `ide/renderer/servers.js` | Le panneau Serveurs : les onglets Fichiers / Serveurs, la liste, le formulaire d'ajout ou de modification, la suppression et la connexion en un clic. |
| `ide/config.default.json` | Réglages par défaut. |

Le terminal fonctionne en deux morceaux : **node-pty** (dans `main.js`) lance un vrai processus PowerShell ou ssh via ConPTY, l'API de terminal de Windows. **xterm.js** (dans `terminal.js`) l'affiche, avec les couleurs et le curseur. Entre les deux, chaque frappe et chaque morceau de texte passent par IPC. node-pty fournit ses binaires Windows déjà compilés, donc `npm install` n'a besoin d'aucun outil de compilation.

Pas de framework ni de bundler : le code que tu lis est exactement celui qui tourne. Monaco est chargé directement depuis `node_modules` avec son propre chargeur (`loader.js`), et son interface est en français.

## Prochaines étapes

1. Panneau d'aperçu navigateur avec rechargement auto.
2. Pipeline d'assets Photoshop / Illustrator.
3. Actions serveur en un clic (déployer, logs, redémarrer), à côté de chaque serveur favori.
