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

## Ce que fait l'IDE (v0.8)

### L'interface

- **En haut, la barre de titre** : le logo, cinq boutons (ouvrir un dossier, diviser l'éditeur, afficher le terminal, aperçu navigateur, discuter avec Claude) et le nom du dossier ouvert. On peut y attraper la fenêtre pour la déplacer, et Windows y dessine ses boutons réduire / agrandir / fermer.
- **À gauche, la barre d'icônes** : Fichiers et Serveurs en haut ; Mise à jour et Config en bas. Un point de couleur sur l'icône de mise à jour signale une nouvelle version.
- **Les icônes** viennent de [Codicons](https://github.com/microsoft/vscode-codicons), celles de VS Code. Chaque type de fichier a son icône et sa couleur (HTML orange, CSS bleu, JS jaune, images violet, PSD et AI bleu Adobe…). La liste est dans `ide/renderer/icons.js` : une ligne par type, facile à compléter.
- **L'écran d'accueil** (quand aucun fichier n'est ouvert) propose tes **dossiers récents** et rappelle les raccourcis.
- **Verre dépoli (glassmorphism)** en thème sombre : le fond de la fenêtre est un dégradé sombre avec deux halos de couleur (dont ta couleur d'accent), et la barre latérale, les éditeurs et le terminal sont des plaques de verre translucides, arrondies et séparées par un petit espace. Les menus, notifications et réglages flottent au-dessus avec un flou.
- **Flou Windows 11** (option, désactivée par défaut) : ton bureau se voit, flouté, à travers la fenêtre (l'effet « acrylic » de Windows). Il demande Windows 11 22H2 ou plus récent, et les « Effets de transparence » de Windows activés. Ailleurs, l'option est sans effet. **Il s'active au démarrage de la fenêtre** : Electron ne peut rendre une fenêtre transparente qu'au moment où il la crée. Quand tu l'actives dans les réglages, une notification propose donc de redémarrer Atelier. Le journal `atelier.log` indique à chaque démarrage si le flou est activé et quelle version de Windows a été détectée.
- **Le dernier dossier se rouvre tout seul** au démarrage, **avec ses onglets** : chaque dossier retrouve les onglets de la dernière fois, dans leurs colonnes, avec l'onglet actif de chacune. Les deux sont désactivables dans Réglages › Démarrage.
- **Thème** : sombre, clair ou contraste élevé. Toute l'interface suit, y compris le terminal et les boutons de la fenêtre.

### Les fonctions


- **Ouvrir un dossier** (bouton ou `Ctrl+O`) : l'arborescence s'affiche à gauche. Les sous-dossiers ne sont lus qu'au clic, donc même un gros projet s'ouvre vite. Le dossier `.git` est masqué.
- **Créer des fichiers et des dossiers** : boutons **Nouveau fichier** et **Nouveau dossier** en haut de l'arborescence, ou **clic droit** sur un dossier (ou dans le vide pour créer à la racine). Un champ apparaît dans le dossier sélectionné : tape le nom, puis `Entrée` (ou `Échap` pour annuler). Un nom comme `css/style.css` crée le sous-dossier au passage. Un nouveau fichier s'ouvre directement. L'IDE refuse d'écraser un fichier existant, les caractères interdits par Windows et les chemins qui sortent du dossier ouvert. Le bouton Actualiser relit le dossier sur le disque, si des fichiers ont été ajoutés à côté.
- **Renommer, supprimer, déplacer** :
  - **Renommer** : clic droit › Renommer, ou `F2` après avoir cliqué sur le fichier. Le nom devient un champ (sans l'extension sélectionnée) : `Entrée` valide, `Échap` annule. Taper `pages/contact.html` le range au passage dans `pages/`.
  - **Supprimer** : clic droit › Mettre à la corbeille, ou `Suppr`. L'IDE demande confirmation, puis le fichier part dans la **corbeille de Windows**, d'où tu peux le récupérer.
  - **Déplacer** : glisse un fichier ou un dossier sur un dossier (ou sur un fichier : il va dans le même dossier), ou dans le vide de l'arborescence pour le mettre à la racine.
  - Les onglets suivent : un fichier ouvert renommé ou déplacé garde son onglet (et la position du curseur) sous son nouveau nom ; supprimé, son onglet se ferme. Pour ne rien perdre, l'IDE refuse de renommer ou déplacer un fichier qui a des modifications non enregistrées. Il refuse aussi d'écraser un fichier existant.
  - Un clic simple sur un fichier l'ouvre en aperçu mais laisse le clavier dans l'arborescence (pour `F2` et `Suppr`) ; le double-clic place le curseur dans l'éditeur.
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
  - **Pour revenir à une seule colonne** : `Ctrl+Alt+W`, ou la petite croix en haut à droite de la colonne (elle n'apparaît que s'il y a plusieurs colonnes). Les onglets de la colonne rejoignent celle de gauche : rien n'est fermé, même un fichier non enregistré.
  - Une colonne vide se ferme aussi toute seule (dernier onglet fermé, ou glissé ailleurs).
- **Erreurs soulignées** : en JavaScript, TypeScript, CSS, SCSS, LESS et JSON, Monaco souligne lui-même les erreurs. Pour le **HTML**, c'est [HTMLHint](https://htmlhint.com) qui vérifie le fichier à chaque pause de frappe : balise non fermée, attribut en double, `<!DOCTYPE>` manquant, guillemets… Rouge = erreur, jaune = avertissement, et le survol affiche l'explication (en anglais) avec le nom de la règle. Les règles se règlent dans `htmlRules` (voir ci-dessous).
- **Ouvrir un fichier par son nom** : `Ctrl+P` ouvre une petite fenêtre en haut. Tape quelques lettres du nom, même pas collées (« apjs » trouve `js/app.js`), choisis avec les flèches et `Entrée`. Ajoute `:12` pour arriver directement à la ligne 12 (`app.js:12`). Sans rien taper, les fichiers déjà ouverts sont en tête de liste.
- **Rechercher dans tout le projet** : `Ctrl+Maj+F`, ou la loupe dans la barre d'icônes. Le texte sélectionné dans l'éditeur est repris tout seul. Les résultats s'affichent par fichier, avec le numéro de ligne ; un clic ouvre le fichier à cet endroit, le texte trouvé sélectionné. Trois boutons dans le champ : respecter les majuscules (`Aa`), mot entier, expression régulière (`.*`). La recherche ignore `.git`, `node_modules`, les fichiers binaires (images, PSD…) et ceux de plus de 1 Mo, et s'arrête à 2000 résultats.
- **Emmet** (HTML et CSS) : tape une abréviation, elle apparaît en tête des suggestions, et `Tab` (ou `Entrée`) l'écrit en entier. `ul.liste>li*3` donne une liste `<ul class="liste">` avec trois `<li>`, `div#menu` un `<div id="menu">`, `!` une page HTML complète ; en CSS, `m10` donne `margin: 10px;`. Désactivable dans Réglages › Éditeur. C'est la bibliothèque [emmet-monaco-es](https://github.com/troy351/emmet-monaco-es) qui l'ajoute à Monaco.
- **Mettre en forme (Prettier)** : `Maj+Alt+F`, ou clic droit › Mettre le document en forme. [Prettier](https://prettier.io) remet le code au propre (indentation, guillemets, points-virgules, retours à la ligne), en HTML, CSS, SCSS, LESS, JavaScript, TypeScript, JSON, Markdown et YAML. La largeur des tabulations vient de tes réglages, et un fichier `.prettierrc` (en JSON) à la racine du projet est respecté. Si le code contient une erreur de syntaxe, rien n'est touché et la ligne fautive est indiquée. Option **Mettre en forme à l'enregistrement** dans Réglages › Éditeur.
- **Images** : un clic sur une image (png, jpg, gif, webp, avif, bmp, ico) l'affiche, sur un damier qui montre la transparence, avec ses dimensions et son poids. Un clic sur l'image passe de la taille ajustée à la taille réelle. Si tu la réexportes depuis Photoshop, elle se met à jour toute seule. Le SVG s'ouvre comme du code, puisque tu peux le modifier.
- **PSD, AI, PDF et autres fichiers binaires** : au lieu de caractères illisibles, une carte propose **Ouvrir avec l'application par défaut** (Photoshop pour un `.psd`, Illustrator pour un `.ai`) et **Afficher dans l'Explorateur**.
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
  - Sa réponse s'écrit au fil de l'eau, en Markdown, avec le code coloré et un bouton pour le copier. Le carré rouge l'arrête en cours de route.
  - **Plusieurs conversations** : le **+** en commence une nouvelle, et l'horloge liste les conversations précédentes de ce projet (avec leur date). Un clic en rouvre une : elle s'affiche comme tu l'avais laissée, et Claude reprend où il en était (il se souvient de tout ce qui a été dit). La corbeille, au survol, en supprime une. L'historique est gardé dans `claude-conversations.json`, à côté de la config.
  - Dans **Réglages › Claude** : le modèle (Opus, Sonnet, Haiku ou celui de Claude Code), accepter les modifications de fichiers sans demander, et le chemin de Claude Code s'il n'est pas trouvé tout seul.
- **Aperçu navigateur** : le bouton œil (en haut) ou `Ctrl+Alt+P` ouvre à droite ton site tel qu'un navigateur l'affiche : le fichier HTML actif, sinon `index.html`.
  - **Rechargement automatique** : dès qu'un fichier du projet change (enregistré avec `Ctrl+S`, modifié par Claude ou par un autre programme), la page se recharge. Si seul le CSS a changé, seuls les styles sont rechargés, et la page garde sa position.
  - L'aperçu **suit l'onglet actif** : passe sur un autre fichier HTML, il l'affiche.
  - En haut : précédent, recharger, la barre d'adresse (tape `/contact.html` puis `Entrée`), la **largeur téléphone** (390 px, pour vérifier la version mobile), **ouvrir dans ton navigateur** habituel, et fermer. La poignée à gauche règle la largeur du panneau.
  - Comment ça marche : l'IDE lance un petit serveur web local (`http://127.0.0.1:<port>/`, invisible depuis les autres ordinateurs), comme l'extension Live Server de VS Code. Il ajoute à la volée, dans les pages qu'il envoie, un petit script qui écoute les changements. **Tes fichiers ne sont pas modifiés.** Comme c'est un vrai serveur, les chemins absolus (`/css/style.css`) et `fetch()` marchent, contrairement à un double-clic sur le fichier.
- **Git** : l'icône branche, dans la barre de gauche, ouvre le panneau Git. Une pastille indique le nombre de fichiers modifiés. Il utilise le `git` installé sur ton PC ([Git for Windows](https://git-scm.com/download/win)), avec les mêmes commandes que dans un terminal.
  - **La liste des fichiers modifiés**, avec une lettre : `M` modifié, `U` nouveau, `D` supprimé, `R` renommé. Ils sont en deux groupes : **Indexées** (ce qui partira dans le prochain commit) et **Modifications**. Au survol, le `+` indexe un fichier et le `−` le retire ; les mêmes boutons sur le titre d'un groupe agissent sur tout le groupe.
  - **Un clic sur un fichier montre ses changements** : à gauche la version du dernier commit, à droite ton fichier, avec les lignes retirées en rouge et ajoutées en vert. Les boutons en haut passent de côte à côte à l'un sous l'autre, ouvrent le fichier ou ferment la comparaison (`Échap`).
  - **Valider (commit)** : écris un message, puis le bouton ou `Ctrl+Entrée`. S'il n'y a rien d'indexé, le bouton devient « Tout valider » et toutes les modifications partent.
  - **Envoyer (push)** et **Récupérer (pull)** : les deux flèches en haut, avec le nombre de commits à envoyer ou à récupérer. La première fois, l'envoi publie la branche (`git push -u origin <branche>`). La récupération ne fait que des mises à jour simples (`git pull --ff-only`). Si les deux côtés ont des commits différents, le message t'explique quoi faire dans le terminal.
  - **Un dossier pas encore suivi par Git** : le bouton « Initialiser un dépôt Git » lance `git init`.
  - Le panneau se met à jour tout seul : à l'enregistrement, quand un fichier change, quand tu reviens dans l'IDE, et toutes les 5 secondes.
- **Fichiers modifiés par un autre programme** (git pull, Claude, Photoshop…) : un onglet ouvert se recharge tout seul, et `Ctrl+Z` annule le rechargement. Si tu as des modifications non enregistrées dans ce fichier, l'IDE n'y touche pas et te prévient.
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
| `emmet` | Abréviations Emmet en HTML et CSS | `true`, `false` |
| `formatOnSave` | Mettre en forme avec Prettier à chaque `Ctrl+S` | `true`, `false` |
| `reopenLastFolder` | Rouvrir le dernier dossier au démarrage | `true`, `false` |
| `restoreTabs` | Rouvrir les onglets d'un dossier à son ouverture | `true`, `false` |
| `terminalFontSize` | Taille du texte du terminal | `14` |
| `terminalProfiles` | Liste des terminaux locaux proposés (voir ci-dessous) | |
| `htmlRules` | Règles HTMLHint à activer ou désactiver, par-dessus celles par défaut | `{ "doctype-first": false, "alt-require": true }` |
| `claudeModel` | Modèle utilisé par le chat (vide = celui de Claude Code) | `""`, `"opus"`, `"sonnet"`, `"haiku"` |
| `claudePermissionMode` | `"ask"` : il demande avant chaque modification. `"acceptEdits"` : il modifie les fichiers sans demander (les commandes demandent toujours) | `"ask"` |
| `claudeCommand` | La commande qui lance Claude Code | `"claude"`, `"C:\\Users\\toi\\AppData\\Roaming\\npm\\claude.cmd"` |
| `shortcuts` | Raccourcis globaux, qui marchent même quand le terminal a le focus | `{ "toggleTerminal": "Ctrl+J", "splitEditor": "Ctrl+Alt+D", "closeColumn": "Ctrl+Alt+W", "toggleClaude": "Ctrl+Shift+I", "quickOpen": "Ctrl+P", "searchProject": "Ctrl+Shift+F", "togglePreview": "Ctrl+Alt+P" }` |

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

`toggleTerminal` (afficher / masquer le terminal), `splitEditor` (diviser l'écran) `toggleClaude` (afficher / masquer le chat), `quickOpen` (ouvrir un fichier par son nom) `searchProject` (rechercher dans le projet) et `togglePreview` (aperçu navigateur) se règlent dans `shortcuts`. Une combinaison s'écrit avec `Ctrl`, `Alt` et `Shift`, puis la touche : `"Ctrl+Shift+T"`, `"Alt+F12"`… La touche est celle qui est imprimée sur ton clavier (AZERTY compris).

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
| `ide/main.js` | Processus principal. Crée la fenêtre, gère la boîte de dialogue « ouvrir un dossier », lit et écrit les fichiers. Il refuse tout accès en dehors du dossier ouvert (et de ta config). Il lance aussi les processus des terminaux avec node-pty et les arrête à la fermeture de l'IDE. Il tient le journal `atelier.log`, intercepte les raccourcis globaux et attrape les erreurs imprévues. Il enregistre les changements faits dans la fenêtre de réglages (en gardant le reste de ton config.json), règle le flou de Windows 11 et retient tes dossiers récents (`state.json`, à côté de la config) et choisit le dossier de départ des terminaux. Il surveille le dossier ouvert pour prévenir l'interface quand un fichier change sur le disque. Il crée les fichiers et dossiers, vérifie avec git s'il existe une mise à jour, puis lance le script de mise à jour. Enfin, il enregistre les serveurs favoris et construit leur commande `ssh`, en refusant un hôte ou un utilisateur qui commence par `-`, pour qu'on ne puisse pas glisser une option ssh dans un champ. |
| `ide/preload.js` | Expose à l'interface `window.atelier` : les dossiers et fichiers (`openFolder`, `recentFolders`, `openRecentFolder`, `readFolder`, `readFile`, `writeFile`, `createFile`, `createFolder`, `renamePath`, `trashPath`, `fileInfo`, `fileDataUrl`, `openDefault`, `revealFile`), les onglets de la session (`getSession`, `saveSession`), le thème de la fenêtre (`setWindowTheme`), la config (`getConfig`, `getConfigPath`) les terminaux (`createTerminal`, `writeTerminal`, `resizeTerminal`, `killTerminal`, plus deux écouteurs pour la sortie et la fin d'un processus) les serveurs (`listServers`, `saveServer`, `deleteServer`, `pickKeyFile`, `connectServer`) la gestion des erreurs et raccourcis (`getLogPath`, `log`, `onAppError`, `onShortcut`) la recherche (`listFiles`, `searchText`), l'aperçu (`previewUrl`, `previewExternal`), Git (`gitStatus`, `gitInit`, `gitHead`, `gitStage`, `gitUnstage`, `gitCommit`, `gitPush`, `gitPull`), la surveillance des fichiers (`onFilesChanged`) et le chat avec Claude (`claudeSend`, `claudePermission`, `claudeInterrupt`, `claudeReset`, `onClaudeEvent`). Rien d'autre de Node n'est accessible côté interface (`contextIsolation`). |
| `ide/renderer/index.html` | Structure de la page : barre de titre, barre d'icônes, arborescence, onglets, éditeur, terminal, barre d'état. La balise `Content-Security-Policy` n'autorise que les scripts locaux. |
| `ide/renderer/icons.js` | L'icône et la couleur de chaque type de fichier. |
| `ide/renderer/style.css` | Tout le visuel. Les couleurs sont des variables CSS (`--accent`, `--bg`…) en haut du fichier, faciles à changer. |
| `ide/renderer/notify.js` | Les notifications, et la capture des erreurs imprévues de l'interface. |
| `ide/renderer/app.js` | La logique : charge Monaco, construit l'arborescence (avec la création de fichiers et dossiers) et les colonnes, gère les onglets (aperçu, clic molette, glisser-déposer), la vérification HTML, l'enregistrement et la config. |
| `ide/claude.js` | Le côté Node du chat : lance Claude Code (`claude -p` en mode « stream-json »), lui transmet tes messages et tes réponses aux demandes de permission, et traduit ce qu'il renvoie en événements simples pour l'interface. |
| `ide/renderer/claude.js` | Le panneau Claude : bulles, rendu Markdown, lignes d'outils, cartes de permission, contexte de l'éditeur, rechargement des fichiers modifiés. |
| `ide/search.js` | Le côté Node de la recherche : la liste de tous les fichiers du projet (pour `Ctrl+P`) et la recherche d'un texte dans tous les fichiers (pour `Ctrl+Maj+F`). |
| `ide/renderer/search.js` | La fenêtre `Ctrl+P` (avec sa recherche « floue ») et la vue Rechercher de la barre latérale. |
| `ide/renderer/fileops.js` | Renommer, supprimer (corbeille) et déplacer par glisser-déposer dans l'arborescence, en gardant les onglets ouverts à jour. |
| `ide/preview.js` | Le serveur web local de l'aperçu : sert le dossier ouvert, surveille ses fichiers et prévient les pages pour qu'elles se rechargent. |
| `ide/renderer/preview.js` | Le panneau Aperçu : le cadre qui affiche la page, la barre d'adresse et ses boutons. |
| `ide/git.js` | Le côté Node du panneau Git : lance `git status`, `add`, `restore --staged`, `commit`, `push`, `pull` dans le dossier ouvert et traduit les erreurs courantes en français. |
| `ide/renderer/git.js` | Le panneau Git : la liste des fichiers, l'indexation, le commit, les boutons push / pull et la comparaison avec le dernier commit (l'éditeur de différences de Monaco). |
| `ide/renderer/media.js` | L'affichage des images et la carte des fichiers binaires (PSD, AI, PDF…) dans les onglets. |
| `ide/renderer/session.js` | Retient les onglets ouverts de chaque dossier et les rouvre. |
| `ide/renderer/format.js` | La mise en forme avec Prettier (chargé seulement à la première utilisation). |
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

1. Pipeline d'assets Photoshop / Illustrator.
2. Actions serveur en un clic (déployer, logs, redémarrer), à côté de chaque serveur favori.
