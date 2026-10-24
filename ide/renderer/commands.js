// Palette de commandes : Ctrl+Maj+P (ou « > » au début de Ctrl+P), comme dans VS Code.
// Toutes les actions de l'IDE sont là, rangées par catégorie, avec leur raccourci : tape quelques
// lettres de leur nom (« term » pour le terminal, « col » pour les colonnes…) puis Entrée.
// On y trouve aussi :
// - les commandes de l'éditeur Monaco (commenter, dupliquer la ligne, mettre en forme…), en français ;
// - un « npm run … » pour chaque script du projet (voir scripts.js).
// Les commandes utilisées récemment remontent en tête de liste.
//
// Pour ajouter une commande : une ligne dans COMMANDS (catégorie, nom, raccourci, action).

const commandPalette = (() => {
  const RECENT = 'atelier.recentCommands';
  // shortcut : nom du raccourci réglable dans config.json (on affiche alors celui que tu as choisi).
  const COMMANDS = [
    ['Fichier', 'Ouvrir un dossier', 'Ctrl+O', () => openFolder()],
    ['Fichier', 'Nouveau projet (Vue, Vite, site HTML…)', { shortcut: 'newProject' }, () => newProject.open()],
    ['Fichier', 'Nouveau fichier', null, () => state.root && startCreate('file')],
    ['Fichier', 'Nouveau dossier', null, () => state.root && startCreate('folder')],
    ['Fichier', 'Ouvrir un fichier par son nom', { shortcut: 'quickOpen' }, () => quickOpen.open()],
    ['Fichier', 'Enregistrer', 'Ctrl+S', () => saveActive()],
    ['Fichier', "Fermer l'onglet", 'Ctrl+W', () => state.activeGroup.active && closeTab(state.activeGroup.active)],
    ['Fichier', "Fermer tous les onglets de la colonne", null, () => [...state.activeGroup.tabs].reverse().forEach(closeTab)],
    ['Fichier', "Actualiser l'arborescence", null, () => state.root && refreshFolder(state.root)],
    ['Rechercher', 'Rechercher dans le projet', { shortcut: 'searchProject' }, () => projectSearch.open()],
    ['Rechercher', 'Remplacer dans le projet', { shortcut: 'replaceProject' }, () => projectSearch.openReplace()],
    ['Affichage', 'Afficher / masquer le terminal', { shortcut: 'toggleTerminal' }, () => terminalPanel.toggle()],
    ['Affichage', 'Nouveau terminal', null, () => terminalPanel.create(document.querySelector('#term-profile').value).catch((err) => notify.error(err.message))],
    ['Affichage', "Diviser l'éditeur", { shortcut: 'splitEditor' }, () => splitEditor()],
    ['Affichage', 'Fermer la colonne', { shortcut: 'closeColumn' }, () => mergeColumn(state.activeGroup)],
    ['Affichage', 'Aperçu dans le navigateur', { shortcut: 'togglePreview' }, () => previewPanel.toggle()],
    ['Affichage', 'Go Live : ouvrir le site dans mon navigateur', null, () => previewPanel.goLive()],
    ['Affichage', 'Afficher les fichiers', null, () => showView('tree')],
    ['Affichage', 'Afficher les scripts npm', null, () => showView('scripts')],
    ['Affichage', 'Afficher Git', null, () => showView('git')],
    ['Affichage', 'Afficher les serveurs', null, () => showView('servers')],
    ['Loki', 'Afficher / masquer le chat avec Loki', { shortcut: 'toggleClaude' }, () => claudePanel.toggle()],
    ['Loki', 'Nouvelle conversation', null, () => { if (!claudePanel.isOpen()) claudePanel.toggle(); document.querySelector('#claude-new').click(); }],
    ['Git', 'Actualiser le panneau Git', null, () => { showView('git'); gitView.refresh(true); }],
    ['Git', 'Envoyer les commits (push)', null, () => document.querySelector('#git-push').click()],
    ['Git', 'Récupérer les commits (pull)', null, () => document.querySelector('#git-pull').click()],
    ['Réglages', 'Ouvrir les réglages', null, () => settings.open()],
    ['Réglages', 'Ouvrir config.json', null, () => openFile(state.configPath, 'config.json', { preview: false })],
    ['Réglages', 'Changer les raccourcis', null, () => settings.open('raccourcis')],
    ['Rune', 'Chercher une mise à jour', null, () => document.querySelector('#btn-update').click()],
    ["Rune", "Recharger l'interface", 'Ctrl+R', () => location.reload()],
  ];

  function showView(id) {
    document.querySelector(`#activitybar [data-view="${id}"]`).click();
  }

  // "Ctrl+Shift+F" -> "Ctrl+Maj+F" (le nom des touches d'un clavier français).
  const pretty = (combo) => (combo || '').replace(/Shift/g, 'Maj');

  function recent() {
    try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch { return []; }
  }

  // La liste complète, recalculée à chaque ouverture : les scripts et les commandes de l'éditeur
  // dépendent du projet et du fichier ouverts.
  function list() {
    const items = COMMANDS.map(([category, label, keys, run]) => ({
      id: `${category}:${label}`,
      category,
      label,
      keys: pretty(keys && typeof keys === 'object' ? state.config.shortcuts?.[keys.shortcut] : keys),
      run,
    }));
    for (const pkg of scriptsPanel.packages()) {
      for (const name of Object.keys(pkg.scripts)) {
        const where = pkg.rel ? ` (${pkg.rel})` : '';
        items.push({ id: `npm:${pkg.rel}:${name}`, category: 'Scripts', label: `npm run ${name}${where}`, keys: '', run: () => scriptsPanel.run(pkg.dir, name) });
      }
    }
    const editor = state.activeGroup?.editor;
    if (editor?.getModel()) {
      for (const action of editor.getSupportedActions()) {
        if (!action.label || !action.isSupported()) continue;
        items.push({ id: `editor:${action.id}`, category: 'Éditeur', label: action.label, keys: '', run: () => { editor.focus(); action.run(); } });
      }
    }
    // Les plus récentes d'abord, puis l'ordre de la liste.
    const order = recent();
    const rank = (item) => { const i = order.indexOf(item.id); return i < 0 ? Infinity : i; };
    return items.map((item, index) => ({ ...item, index })).sort((a, b) => (rank(a) - rank(b)) || (a.index - b.index));
  }

  function execute(item) {
    try {
      const ids = [item.id, ...recent().filter((id) => id !== item.id)].slice(0, 20);
      localStorage.setItem(RECENT, JSON.stringify(ids));
    } catch { /* pas grave */ }
    Promise.resolve().then(item.run).catch((err) => notify.error(cleanError(err)));
  }

  window.atelier.onShortcut((action) => { if (action === 'commandPalette') quickOpen.open('>'); });

  return { list, execute };
})();
