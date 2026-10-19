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

## Ce que fait la version 0.1

- **Ouvrir un dossier** (bouton ou `Ctrl+O`) : l'arborescence s'affiche à gauche. Les sous-dossiers ne sont lus qu'au clic, donc même un gros projet s'ouvre vite. Le dossier `.git` est masqué.
- **Éditer** : clic sur un fichier, il s'ouvre dans un onglet avec Monaco, le moteur de VS Code (coloration selon l'extension, autocomplétion, `Ctrl+F` pour chercher, `Ctrl+H` pour remplacer, multi-curseurs avec `Alt+clic`).
- **Enregistrer** : `Ctrl+S`. Un `●` sur l'onglet signale des modifications non enregistrées.
- **Fermer un onglet** : `×` ou `Ctrl+W`. L'IDE demande confirmation si le fichier n'est pas enregistré.
- **Config perso** : le bouton **Config** ouvre ton fichier de réglages dans l'IDE. Tu le modifies, `Ctrl+S`, et c'est appliqué tout de suite.
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
| `ide/main.js` | Processus principal. Crée la fenêtre, gère la boîte de dialogue « ouvrir un dossier », lit et écrit les fichiers. Il refuse tout accès en dehors du dossier ouvert (et de ta config). |
| `ide/preload.js` | Expose à l'interface `window.atelier` avec 6 fonctions : `openFolder`, `readFolder`, `readFile`, `writeFile`, `getConfig`, `getConfigPath`. Rien d'autre de Node n'est accessible côté interface (`contextIsolation`). |
| `ide/renderer/index.html` | Structure de la page : barre du haut, arborescence, onglets, éditeur, barre d'état. La balise `Content-Security-Policy` n'autorise que les scripts locaux. |
| `ide/renderer/style.css` | Tout le visuel. Les couleurs sont des variables CSS (`--accent`, `--bg`…) en haut du fichier, faciles à changer. |
| `ide/renderer/app.js` | La logique : charge Monaco, construit l'arborescence, gère les onglets, l'enregistrement et la config. |
| `ide/config.default.json` | Réglages par défaut. |

Pas de framework ni de bundler : le code que tu lis est exactement celui qui tourne. Monaco est chargé directement depuis `node_modules` avec son propre chargeur (`loader.js`), et son interface est en français.

## Prochaines étapes

1. Terminal intégré, avec des profils SSH vers le serveur.
2. Panneau d'aperçu navigateur avec rechargement auto.
3. Pipeline d'assets Photoshop / Illustrator.
4. Panneau serveur (déployer, logs, redémarrer).
