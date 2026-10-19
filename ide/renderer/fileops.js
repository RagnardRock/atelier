// Renommer, supprimer et déplacer des fichiers et des dossiers dans l'arborescence.
// - Renommer : clic droit › Renommer, ou F2. Le nom devient un champ : Entrée valide, Échap annule.
//   Un nom comme "../page.html" ou "pages/page.html" déplace le fichier au passage.
// - Supprimer : clic droit › Mettre à la corbeille, ou Suppr. Le fichier part dans la corbeille
//   de Windows : on peut toujours le récupérer.
// - Déplacer : glisse un fichier ou un dossier sur un dossier (ou dans le vide pour la racine).
// Les fichiers ouverts suivent : leurs onglets prennent le nouveau nom, ou se ferment s'ils sont supprimés.

const fileOps = (() => {
  const tree = $('#tree');
  const windows = window.atelier.platform === 'win32';
  const sep = windows ? '\\' : '/';
  const same = (a, b) => (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  // "base" lui-même, ou quelque chose dedans.
  const under = (p, base) => same(p, base) || (windows ? p.toLowerCase().startsWith(`${base.toLowerCase()}${sep}`) : p.startsWith(`${base}${sep}`));
  const rowOf = (p) => document.querySelector(`#tree .node[data-path="${CSS.escape(p)}"]`);
  const openFilesUnder = (base) => [...state.files.values()].filter((f) => under(f.path, base));

  // Après un renommage : dossiers dépliés, sélection et fichiers ouverts prennent le nouveau chemin.
  async function relocate(oldBase, newBase) {
    const moved = (p) => newBase + p.slice(oldBase.length);
    for (const p of [...state.expanded]) {
      if (under(p, oldBase)) { state.expanded.delete(p); state.expanded.add(moved(p)); }
    }
    if (state.selectedDir && under(state.selectedDir, oldBase)) state.selectedDir = moved(state.selectedDir);
    if (state.treeEntry && under(state.treeEntry, oldBase)) state.treeEntry = moved(state.treeEntry);
    for (const file of openFilesUnder(oldBase)) {
      const newPath = moved(file.path);
      // Le texte de Monaco est rattaché au chemin du fichier : on le relit sous son nouveau nom
      // (le fichier est enregistré, voir move()), puis chaque onglet passe au nouveau fichier.
      const fresh = await getFile(newPath, baseName(newPath));
      for (const tab of tabsOf(file)) {
        const group = tab.group;
        const view = group.active === tab ? group.editor.saveViewState() : group.viewStates.get(file.path);
        tab.file = fresh;
        if (view) group.viewStates.set(newPath, view);
        if (group.active === tab) {
          group.editor.setModel(fresh.model);
          if (view) group.editor.restoreViewState(view);
        }
        refreshTab(tab);
      }
      state.files.delete(file.path);
      file.model.dispose();
    }
    refreshStatus();
  }

  async function move(from, to) {
    if (same(from, to)) return;
    // Des modifications non enregistrées seraient perdues en route : on demande d'enregistrer avant.
    const dirty = openFilesUnder(from).filter(isDirty);
    if (dirty.length) {
      return notify.warning(`Enregistre d'abord ${dirty.map((f) => f.name).join(', ')} (Ctrl+S), puis recommence.`);
    }
    try {
      await window.atelier.renamePath(from, to);
    } catch (err) {
      return notify.error(`Impossible de renommer ou déplacer : ${cleanError(err)}`);
    }
    await relocate(from, to);
    // Le dossier d'arrivée est déplié pour qu'on voie le résultat.
    const parent = to.slice(0, to.lastIndexOf(sep));
    if (parent && !same(parent, state.root)) state.expanded.add(parent);
    await refreshFolder(state.root);
    state.treeEntry = to;
    rowOf(to)?.classList.add('selected');
    rowOf(to)?.scrollIntoView({ block: 'nearest' });
    flash(`${baseName(from)} → ${to.slice(state.root.length + 1)}`);
  }

  // --- Renommer ---

  function startRename(path) {
    const row = rowOf(path);
    if (!row) return;
    const label = row.querySelector('.label');
    const input = document.createElement('input');
    input.className = 'rename-input';
    input.spellcheck = false;
    input.value = row.dataset.name;
    label.replaceWith(input);
    row.draggable = false;
    input.focus();
    // On sélectionne le nom sans l'extension, comme dans l'Explorateur Windows.
    const dot = row.dataset.isDir ? -1 : input.value.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length);

    let done = false;
    const finish = async (apply) => {
      if (done) return;
      done = true;
      const name = input.value.trim().replace(/\\/g, '/');
      input.replaceWith(label);
      row.draggable = true;
      tree.focus();
      if (!apply || !name || name === row.dataset.name) return;
      const target = await window.atelier.joinPath(row.dataset.parent, ...name.split('/'));
      await move(path, target);
    };
    input.onkeydown = (e) => {
      e.stopPropagation(); // F2, Suppr… restent dans le champ
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    };
    input.onclick = (e) => e.stopPropagation();
    input.onblur = () => finish(true);
  }

  // --- Supprimer (corbeille) ---

  async function trash(path) {
    const row = rowOf(path);
    const name = row ? row.dataset.name : baseName(path);
    const dirty = openFilesUnder(path).filter(isDirty);
    const what = row?.dataset.isDir ? `le dossier « ${name} » et tout son contenu` : `« ${name} »`;
    const warning = dirty.length ? `\n\nAttention : ${dirty.map((f) => f.name).join(', ')} a des modifications non enregistrées, elles seront perdues.` : '';
    if (!confirm(`Mettre ${what} à la corbeille ?${warning}`)) return;
    try {
      await window.atelier.trashPath(path);
    } catch (err) {
      return notify.error(`Impossible de supprimer ${name} : ${cleanError(err)}`);
    }
    // Les onglets des fichiers supprimés se ferment (sans redemander pour les modifications).
    for (const file of openFilesUnder(path)) {
      file.savedVersion = file.model.getAlternativeVersionId();
      for (const tab of tabsOf(file)) closeTab(tab);
    }
    for (const p of [...state.expanded]) if (under(p, path)) state.expanded.delete(p);
    if (state.selectedDir && under(state.selectedDir, path)) state.selectedDir = null;
    state.treeEntry = null;
    await refreshFolder(state.root);
    tree.focus();
    flash(`${name} est dans la corbeille`);
  }

  // --- Menu clic droit et clavier ---

  $('#menu-rename').onclick = () => state.menuEntry && startRename(state.menuEntry);
  $('#menu-delete').onclick = () => state.menuEntry && trash(state.menuEntry);

  tree.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || !state.treeEntry || !rowOf(state.treeEntry)) return;
    if (e.key === 'F2') { e.preventDefault(); startRename(state.treeEntry); }
    if (e.key === 'Delete') { e.preventDefault(); trash(state.treeEntry); }
  });

  // --- Glisser-déposer ---

  let dragged = null; // chemin en cours de déplacement

  // Dossier où arriverait l'élément : le dossier survolé, celui du fichier survolé, ou la racine.
  function dropFolder(e) {
    const node = e.target.closest('#tree .node');
    if (!node) return state.root;
    return node.dataset.isDir ? node.dataset.path : node.dataset.parent;
  }
  // Interdit : le laisser où il est, ou ranger un dossier dans lui-même.
  function canDrop(folder) {
    if (!dragged || !folder) return false;
    const parent = dragged.slice(0, dragged.lastIndexOf(sep));
    return !same(parent, folder) && !under(folder, dragged);
  }
  function clearHighlight() {
    document.querySelectorAll('#tree .drop-into').forEach((el) => el.classList.remove('drop-into'));
    tree.classList.remove('drop-root');
  }

  tree.addEventListener('dragstart', (e) => {
    const node = e.target.closest('.node');
    if (!node || !node.dataset.path) return;
    dragged = node.dataset.path;
    e.dataTransfer.effectAllowed = 'move';
    // Un type à nous, pour que l'éditeur n'insère pas le chemin comme du texte.
    e.dataTransfer.setData('application/x-atelier-entry', dragged);
  });
  tree.addEventListener('dragover', (e) => {
    const folder = dropFolder(e);
    clearHighlight();
    if (!canDrop(folder)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (same(folder, state.root)) tree.classList.add('drop-root');
    else rowOf(folder)?.classList.add('drop-into');
  });
  tree.addEventListener('dragleave', (e) => { if (!tree.contains(e.relatedTarget)) clearHighlight(); });
  tree.addEventListener('drop', async (e) => {
    const folder = dropFolder(e);
    clearHighlight();
    if (!canDrop(folder)) return;
    e.preventDefault();
    const from = dragged;
    dragged = null;
    await move(from, await window.atelier.joinPath(folder, baseName(from)));
  });
  tree.addEventListener('dragend', () => { dragged = null; clearHighlight(); });

  return { startRename, trash, move };
})();
