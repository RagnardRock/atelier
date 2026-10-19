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

### Mettre à jour

Deux façons, qui font exactement la même chose (`git pull` + `npm install`, puis relance de l'IDE) :

- **Le bouton « Mise à jour »** en haut de l'IDE. Au démarrage, l'IDE vérifie s'il y a des nouveautés sur GitHub : si oui, une notification le signale et le bouton affiche un `●`. Un clic montre la liste des changements et demande confirmation. L'IDE se ferme, la mise à jour se fait dans une fenêtre à part, puis l'IDE se relance. Il prévient avant si des fichiers ne sont pas enregistrés.
- **Le script `mettre-a-jour.bat`** à la racine du dépôt : double-clique-le (l'IDE doit être fermé). En cas d'erreur, la fenêtre reste ouverte avec le message. Sous Linux ou macOS, c'est `mettre-a-jour.sh`.

La mise à jour se fait dans une fenêtre à part parce que, sous Windows, `npm install` ne peut pas remplacer Electron ou le terminal pendant que l'IDE les utilise.

> Sous Windows, `npm install` peut réécrire légèrement `ide/package-lock.json`. Si git refuse ensuite un `git checkout` ou un `git pull` à cause de ce fichier, annule sa modification avec `git checkout -- ide/package-lock.json` : il sera régénéré au prochain `npm install`. Le script de mise à jour le fait tout seul.

## Ce que fait l'IDE (v0.7)

### L'interface

- **En haut, la barre de titre** : le logo, quatre boutons (ouvrir un dossier, diviser l'éditeur, afficher le terminal, discuter avec Claude) et le nom du dossier ouvert. On peut y attraper la fenêtre pour la déplacer, et Windows y dessine ses boutons réduire / agrandir / fermer.
- **À gauche, la barre d'icônes** : Fichiers et Serveurs en haut ; Mise à jour et Config en bas. Un point de couleur sur l'icône de mise à jour signale une nouvelle version.
- **Les icônes** viennent de [Codicons](https://github.com/microsoft/vscode-codicons), celles de VS Code. Chaque type de fichier a son icône et sa couleur (HTML orange, CSS bleu, JS jaune, images violet, PSD et AI bleu Adobe…). La liste est dans `ide/renderer/icons.js` : une ligne par type, facile à compléter.
- **L'écran d'accueil** (quand aucun fichier n'est ouvert) propose tes **dossiers récents** et rappelle les raccourcis.
- **Verre dépoli (glassmorphism)** en thème sombre : le fond de la fenêtre est un dégradé sombre avec deux halos de couleur (dont ta couleur d'accent), et la barre latérale, les éditeurs et le terminal sont des plaques de verre translucides, arrondies et séparées par un petit espace. Les menus, notifications et réglages flottent au-dessus avec un flou.
- **Flou Windows 11** (option, désactivée par défaut) : ton bureau se voit, flouté, à travers la fenêtre (l'effet « acrylic » de Windows). Il demande Windows 11 22H2 ou plus récent, et les « Effets de transparence » de Windows activés. Ailleurs, l'option est sans effet. **Il s'active au démarrage de la fenêtre** : Electron ne peut rendre une fenêtre transparente qu'au moment où il la crée. Quand tu l'actives dans les réglages, une notification propose donc de redémarrer Atelier. Le journal `atelier.log` indique à chaque démarrage si le flou est activé et quelle version de Windows a été détectée.
- **Le dernier dossier se rouvre tout seul** au démarrage (désactivable dans les réglages).
- **Thème** : sombre, clair ou contraste élevé. Toute l'interface suit, y compris le terminal et les boutons de la fenêtre.

### Les fonctions


- **Ouvrir un dossier** (bouton ou `Ctrl+O`) : l'arborescence s'affiche à gauche. Les sous-dossiers ne sont lus qu'au clic, donc même un gros projet s'ouvre vite. Le dossier `.git` est masqué.
- **Créer des fichiers et des dossiers** : boutons **Nouveau fichier** et **Nouveau dossier** en haut de l'arborescence, ou **clic droit** sur un dossier (ou dans le vide pour créer à la racine). Un champ apparaît dans le dossier sélectionné : tape le nom, puis `Entrée` (ou `Échap` pour annuler). Un nom comme `css/style.css` crée le sous-dossier au passage. Un nouveau fichier s'ouvre directement. L'IDE refuse d'écraser un fichier existant, les caractères interdits par Windows et les chemins qui sortent du dossier ouvert. Le bouton Actualiser relit le dossier sur le disque, si des fichiers ont été ajoutés à côté.
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
- **Erreurs soulignées** : en JavaScript, TypeScript, CSS, SCSS, LESS et JSON, Monaco souligne lui-même les erreurs. Pour le **HTML**, c'est [HTMLHint](https://htmlhint.com) qui vérifie le fichier à chaque pause de frappe : balise non fermée, attribut en double, `<!DOCTYPE>` manquant, guillemets… Rouge = erreur, jaune = avertissement, et le survol affiche l'explication (en anglais) avec le nom de la règle. Les règles se règlent dans `htmlRules` (voir ci-dessous).
- **Ouvrir un fichier par son nom** : `Ctrl+P` ouvre une petite fenêtre en haut. Tape quelques lettres du nom, même pas collées (« apjs » trouve `js/app.js`), choisis avec les flèches et `Entrée`. Ajoute `:12` pour arriver directement à la ligne 12 (`app.js:12`). Sans rien taper, les fichiers déjà ouverts sont en tête de liste.
- **Rechercher dans tout le projet** : `Ctrl+Maj+F`, ou la loupe dans la barre d'icônes. Le texte sélectionné dans l'éditeur est repris tout seul. Les résultats s'affichent par fichier, avec le numéro de ligne ; un clic ouvre le fichier à cet endroit, le texte trouvé sélectionné. Trois boutons dans le champ : respecter les majuscules (`Aa`), mot entier, expression régulière (`.*`). La recherche ignore `.git`, `node_modules`, les fichiers binaires (images, PSD…) et ceux de plus de 1 Mo, et s'arrête à 2000 résultats.
- **Enregistrer** : `Ctrl+S`. Un `●` à la place de la croix de l'onglet signale des modifications non enregistrées.
- **Fermer un onglet** : la croix, clic molette ou `Ctrl+W`. L'IDE demande confirmation si le fichier n'est pas enregistré.
- **Réglages** : l'icône **engrenage** (en bas à gauche) ouvre la fenêtre de réglages, avec des interrupteurs, des curseurs et des listes plutôt que du JSON. À gauche, les rubriques : Apparence (thème, verre dépoli, flou Windows 11, couleur d'accent avec 8 couleurs proposées ou la pipette pour n'importe quelle autre), Éditeur (police, taille, tabulations, retour à la ligne, mini-carte), Terminal (taille du texte, profils), Raccourcis, Claude, Vérification HTML (chaque règle HTMLHint avec son explication), Démarrage. Chaque changement s'applique et s'enregistre tout de suite (« Enregistré » s'affiche en haut). `Échap` ou un clic à côté ferme la fenêtre.
  - **Changer un raccourci** : clique dessus, puis appuie sur la nouvelle combinaison (avec `Ctrl` ou `Alt`). `Échap` annule.
  - **Le fichier JSON reste là** : « Ouvrir config.json », en bas à gauche des réglages, l'ouvre dans un onglet. Tu le modifies, `Ctrl+S`, et c'est appliqué tout de suite. Si le fichier contient une erreur, la fenêtre de réglages refuse d'enregistrer (pour ne pas écraser tes réglages) et te dit où est l'erreur.
- **Terminal intégré** : bouton terminal (en haut) ou `Ctrl+J` pour afficher / masquer le panneau en bas. Tu peux en ouvrir plusieurs en onglets : choisis un profil dans la liste, puis `+`. La poignée au-dessus du panneau permet de régler sa hauteur, et la flèche à droite le masque.
- **Dans quel dossier démarre le terminal ?** Dans le **dossier sélectionné dans l'arborescence** (le dernier sur lequel tu as cliqué), sinon à la racine du projet. Le nom de l'onglet le rappelle : `PowerShell · css`. Le plus direct : **clic droit sur un dossier › Ouvrir un terminal ici**.
- **Serveurs favoris** : l'onglet **Serveurs** de la barre latérale liste tes serveurs. Un clic sur un serveur ouvre la connexion SSH dans un nouvel onglet de terminal. Le **+** ouvre un formulaire (nom, hôte, utilisateur, port, clé SSH facultative avec un bouton pour la choisir). Au survol d'un serveur, le crayon permet de le modifier et la corbeille de le supprimer. La connexion utilise `ssh`, le client intégré à Windows 10/11. **Aucun mot de passe n'est enregistré** : avec une clé SSH, la connexion est directe, sinon ssh te demande ton mot de passe dans le terminal.
- **Chat avec Claude** : le bouton étincelle (en haut) ou `Ctrl+Maj+I` ouvre le panneau Claude à droite. Tu écris ta question, `Entrée` l'envoie (`Maj+Entrée` pour aller à la ligne).
  - **Avec ton compte Claude, sans clé d'API** : l'IDE fait tourner [Claude Code](https://docs.claude.com/fr/docs/claude-code/overview) en arrière-plan, dans le dossier ouvert. Il faut donc l'avoir installé une fois : dans un terminal, `npm install -g @anthropic-ai/claude-code`, puis `claude` pour te connecter. Si la commande est introuvable, le panneau te le dit avec ces instructions.
  - **Il voit ce que tu regardes** : le fichier ouvert et ta sélection partent avec ton message. Une petite étiquette au-dessus du champ le rappelle (`index.html · lignes 4-6`) ; un clic dessus la retire pour ce message-là.
  - **Il peut lire tout le projet, modifier des fichiers et lancer des commandes.** Chaque outil qu'il utilise s'affiche sur une ligne (« Lit index.html », « Lance : npm test »…), avec une coche quand c'est fini.
  - **Il te demande ton accord avant chaque modification ou commande** : une carte montre ce qu'il veut faire (en rouge l'ancien texte, en vert le nouveau, ou la commande exacte). **Autoriser**, **Toujours autoriser** (ne plus demander pour ce genre d'action pendant la conversation) ou **Refuser**. La lecture des fichiers ne demande rien.
  - Quand il modifie un fichier ouvert, l'éditeur le recharge tout seul, et `Ctrl+Z` annule la modification. Si tu avais des changements non enregistrés dans ce fichier, l'IDE n'y touche pas et te prévient.
  - Sa réponse s'écrit au fil de l'eau, en Markdown, avec le code coloré et un bouton pour le copier. Le carré rouge l'arrête en cours de route ; le **+** commence une nouvelle conversation (sinon il se souvient de tout ce qui a été dit).
  - Dans **Réglages › Claude** : le modèle (Opus, Sonnet, Haiku ou celui de Claude Code), accepter les modifications de fichiers sans demander, et le chemin de Claude Code s'il n'est pas trouvé tout seul.
- **Erreurs** : voir la section [Gestion des erreurs](#gestion-des-erreurs).
- **Outils de dev** : `F12` ouvre la console Chromium, comme dans un navigateur. `Ctrl+R` recharge l'interface.

### Réglages disponibles

Tous ces réglages se changent dans la fenêtre de réglages. Ils sont enregistrés dans `config.json` (sous Windows : `%APPDATA%\atelier-ide\config.json`), que tu peux aussi modifier à la main.

| Clé | Rôle | Exemples |
|-----|------|----------|
| `theme` | Thème de l'éditeur et de l'interface | `"vs-dark"`, `"vs"` (clair), `"hc-black"` (contraste élevé) |
| `glass` | Verre dépoli (thème sombre uniquement) | `true`, `false` |
| `windowBlur` | Flou Windows 11 derrière la fenêtre (demande `glass`) | `true`, `false` |
| `accentColor` | Couleur d'accent : logo, onglet actif, curseur, boutons principaux… | `"#e0a526"` |
| `fontFamily` | Police de l'éditeur | `"Consolas, monospace"` |
| `fontSize` | Taille du texte | `15` |
| `tabSize` | Largeur d'une tabulation | `2`, `4` |
| `wordWrap` | Retour à la ligne automatique | `"on"`, `"off"` |
| `minimap` | Mini-carte du fichier à droite | `true`, `false` |
| `reopenLastFolder` | Rouvrir le dernier dossier au démarrage | `true`, `false` |
| `terminalFontSize` | Taille du texte du terminal | `14` |
| `terminalProfiles` | Liste des terminaux locaux proposés (voir ci-dessous) | |
| `htmlRules` | Règles HTMLHint à activer ou désactiver, par-dessus celles par défaut | `{ "doctype-first": false, "alt-require": true }` |
| `claudeModel` | Modèle utilisé par le chat (vide = celui de Claude Code) | `""`, `"opus"`, `"sonnet"`, `"haiku"` |
| `claudePermissionMode` | `"ask"` : il demande avant chaque modification. `"acceptEdits"` : il modifie les fichiers sans demander (les commandes demandent toujours) | `"ask"` |
| `claudeCommand` | La commande qui lance Claude Code | `"claude"`, `"C:\\Users\\toi\\AppData\\Roaming\\npm\\claude.cmd"` |
| `shortcuts` | Raccourcis globaux, qui marchent même quand le terminal a le focus | `{ "toggleTerminal": "Ctrl+J", "splitEditor": "Ctrl+Alt+D", "toggleClaude": "Ctrl+Shift+I", "quickOpen": "Ctrl+P", "searchProject": "Ctrl+Shift+F" }` |

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

`toggleTerminal` (afficher / masquer le terminal), `splitEditor` (diviser l'écran) `toggleClaude` (afficher / masquer le chat), `quickOpen` (ouvrir un fichier par son nom) et `searchProject` (rechercher dans le projet) se règlent dans `shortcuts`. Une combinaison s'écrit avec `Ctrl`, `Alt` et `Shift`, puis la touche : `"Ctrl+Shift+T"`, `"Alt+F12"`… La touche est celle qui est imprimée sur ton clavier (AZERTY compris).

Ces raccourcis sont interceptés par `main.js` *avant* que l'éditeur ou le terminal ne reçoivent la touche. C'est ce qui permet à `Ctrl+J` de fermer le terminal même quand il a le focus, alors que pour un terminal, `Ctrl+J` veut normalement dire « retour à la ligne ».

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
| `ide/main.js` | Processus principal. Crée la fenêtre, gère la boîte de dialogue « ouvrir un dossier », lit et écrit les fichiers. Il refuse tout accès en dehors du dossier ouvert (et de ta config). Il lance aussi les processus des terminaux avec node-pty et les arrête à la fermeture de l'IDE. Il tient le journal `atelier.log`, intercepte les raccourcis globaux et attrape les erreurs imprévues. Il enregistre les changements faits dans la fenêtre de réglages (en gardant le reste de ton config.json), règle le flou de Windows 11 et retient tes dossiers récents (`state.json`, à côté de la config) et choisit le dossier de départ des terminaux. Il crée les fichiers et dossiers, vérifie avec git s'il existe une mise à jour, puis lance le script de mise à jour. Enfin, il enregistre les serveurs favoris et construit leur commande `ssh`, en refusant un hôte ou un utilisateur qui commence par `-`, pour qu'on ne puisse pas glisser une option ssh dans un champ. |
| `ide/preload.js` | Expose à l'interface `window.atelier` : les dossiers et fichiers (`openFolder`, `recentFolders`, `openRecentFolder`, `readFolder`, `readFile`, `writeFile`, `createFile`, `createFolder`), le thème de la fenêtre (`setWindowTheme`), la config (`getConfig`, `getConfigPath`) les terminaux (`createTerminal`, `writeTerminal`, `resizeTerminal`, `killTerminal`, plus deux écouteurs pour la sortie et la fin d'un processus) les serveurs (`listServers`, `saveServer`, `deleteServer`, `pickKeyFile`, `connectServer`) la gestion des erreurs et raccourcis (`getLogPath`, `log`, `onAppError`, `onShortcut`) la recherche (`listFiles`, `searchText`) et le chat avec Claude (`claudeSend`, `claudePermission`, `claudeInterrupt`, `claudeReset`, `onClaudeEvent`). Rien d'autre de Node n'est accessible côté interface (`contextIsolation`). |
| `ide/renderer/index.html` | Structure de la page : barre de titre, barre d'icônes, arborescence, onglets, éditeur, terminal, barre d'état. La balise `Content-Security-Policy` n'autorise que les scripts locaux. |
| `ide/renderer/icons.js` | L'icône et la couleur de chaque type de fichier. |
| `ide/renderer/style.css` | Tout le visuel. Les couleurs sont des variables CSS (`--accent`, `--bg`…) en haut du fichier, faciles à changer. |
| `ide/renderer/notify.js` | Les notifications, et la capture des erreurs imprévues de l'interface. |
| `ide/renderer/app.js` | La logique : charge Monaco, construit l'arborescence (avec la création de fichiers et dossiers) et les colonnes, gère les onglets (aperçu, clic molette, glisser-déposer), la vérification HTML, l'enregistrement et la config. |
| `ide/claude.js` | Le côté Node du chat : lance Claude Code (`claude -p` en mode « stream-json »), lui transmet tes messages et tes réponses aux demandes de permission, et traduit ce qu'il renvoie en événements simples pour l'interface. |
| `ide/renderer/claude.js` | Le panneau Claude : bulles, rendu Markdown, lignes d'outils, cartes de permission, contexte de l'éditeur, rechargement des fichiers modifiés. |
| `ide/search.js` | Le côté Node de la recherche : la liste de tous les fichiers du projet (pour `Ctrl+P`) et la recherche d'un texte dans tous les fichiers (pour `Ctrl+Maj+F`). |
| `ide/renderer/search.js` | La fenêtre `Ctrl+P` (avec sa recherche « floue ») et la vue Rechercher de la barre latérale. |
| `ide/renderer/settings.js` | La fenêtre de réglages. Chaque réglage est une ligne dans `SECTIONS` (clé de config + type de contrôle) : en ajouter un est facile. |
| `ide/renderer/update.js` | Le bouton Mise à jour : vérification au démarrage, liste des nouveautés, lancement du script. |
| `mettre-a-jour.bat` / `.sh` | Les scripts de mise à jour (git pull, npm install, relance). |
| `ide/renderer/terminal.js` | Le panneau terminal : crée les terminaux xterm.js, les onglets, la poignée et le raccourci `Ctrl+J`. |
| `ide/renderer/servers.js` | Le panneau Serveurs : les onglets Fichiers / Serveurs, la liste, le formulaire d'ajout ou de modification, la suppression et la connexion en un clic. |
| `ide/config.default.json` | Réglages par défaut. |

Le terminal fonctionne en deux morceaux : **node-pty** (dans `main.js`) lance un vrai processus PowerShell ou ssh via ConPTY, l'API de terminal de Windows. **xterm.js** (dans `terminal.js`) l'affiche, avec les couleurs et le curseur. Entre les deux, chaque frappe et chaque morceau de texte passent par IPC. node-pty fournit ses binaires Windows déjà compilés, donc `npm install` n'a besoin d'aucun outil de compilation.

Le chat parle à Claude Code de la même façon que le SDK officiel d'Anthropic (Agent SDK) : un processus `claude` reste ouvert pendant la conversation, et les deux côtés s'échangent des messages JSON, un par ligne. Grâce à l'option `--permission-prompt-tool=stdio`, chaque fois que Claude veut modifier un fichier ou lancer une commande, Claude Code envoie une demande à l'IDE et attend la réponse que tu donnes sur la carte. Comme c'est ton Claude Code installé, c'est ton compte Claude qui est utilisé, avec ses limites habituelles.

Pas de framework ni de bundler : le code que tu lis est exactement celui qui tourne. Monaco est chargé directement depuis `node_modules` avec son propre chargeur (`loader.js`), et son interface est en français.

## Prochaines étapes

1. Panneau d'aperçu navigateur avec rechargement auto.
2. Pipeline d'assets Photoshop / Illustrator.
3. Actions serveur en un clic (déployer, logs, redémarrer), à côté de chaque serveur favori.
