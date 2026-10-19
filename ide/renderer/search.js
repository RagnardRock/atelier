// Recherche rapide, deux outils :
// - Ctrl+P : une fenêtre en haut de l'écran pour ouvrir un fichier en tapant quelques lettres
//   de son nom (« apjs » trouve js/app.js). « app.js:42 » ouvre le fichier à la ligne 42.
// - Ctrl+Maj+F : la vue Rechercher de la barre latérale cherche un texte dans tous les fichiers
//   du projet. Un clic sur un résultat ouvre le fichier à cet endroit.
// La liste des fichiers et la recherche elle-même sont faites par main.js (voir ../search.js).

// Ouvre un fichier et place le curseur (et la sélection) à une position donnée.
async function openAt(path, line, col = 1, length = 0, { preview = true } = {}) {
  await openFile(path, baseName(path), { preview });
  const editor = state.activeGroup.editor;
  if (!line || state.activeGroup.active?.file.path !== path) return;
  const range = new monaco.Range(line, col, line, col + length);
  editor.setSelection(range);
  editor.revealRangeInCenterIfOutsideViewport(range);
  editor.focus();
}

// --- Ctrl+P : ouvrir un fichier par son nom ---

const quickOpen = (() => {
  const overlay = document.querySelector('#quick-open');
  const input = document.querySelector('#quick-input');
  const list = document.querySelector('#quick-list');
  const MAX_SHOWN = 50;
  let files = [];       // tous les fichiers du projet
  let shown = [];       // ceux affichés, dans l'ordre
  let selected = 0;
  let filesRoot = null; // dossier pour lequel la liste a été lue

  // Recherche "floue" : les lettres tapées doivent apparaître dans l'ordre, pas forcément collées.
  // Plus elles sont collées, en début de mot ou dans le nom du fichier, plus le score est haut.
  function fuzzy(query, text) {
    const lower = text.toLowerCase();
    const nameStart = text.lastIndexOf('/') + 1;
    // Cas idéal : le texte tapé est un morceau du nom du fichier.
    const direct = lower.indexOf(query, nameStart);
    if (direct >= 0) {
      const positions = [...query].map((_, k) => direct + k);
      return { score: 1000 - text.length + (direct === nameStart ? 200 : 0), positions };
    }
    const positions = [];
    let score = 0;
    let previous = -2;
    for (let i = 0, q = 0; i < text.length && q < query.length; i++) {
      if (lower[i] !== query[q]) continue;
      score += 1;
      if (i === previous + 1) score += 5;                   // collée à la précédente
      if (i === 0 || '/._- '.includes(text[i - 1])) score += 8; // début de mot
      if (i >= nameStart) score += 3;                       // dans le nom du fichier
      positions.push(i);
      previous = i;
      q++;
    }
    if (positions.length < query.length) return null;
    return { score: score - text.length * 0.05, positions };
  }

  function highlight(text, positions) {
    const set = new Set(positions);
    return [...text].map((c, i) => (set.has(i) ? `<b>${escapeHtml(c)}</b>` : escapeHtml(c))).join('');
  }

  // "app.js:42" -> { query: "app.js", line: 42 }
  function parse(value) {
    const m = /^(.*?)(?::(\d+))?$/.exec(value.trim());
    return { query: m[1].replace(/\\/g, '/').replace(/\s+/g, '').toLowerCase(), line: m[2] ? Number(m[2]) : null };
  }

  function render() {
    const { query } = parse(input.value);
    if (!query) {
      // Rien de tapé : les fichiers déjà ouverts d'abord, puis les autres.
      const open = new Set(state.groups.flatMap((g) => g.tabs.map((t) => t.file.path)));
      shown = [...files].sort((a, b) => (open.has(b.path) - open.has(a.path)) || a.rel.localeCompare(b.rel))
        .slice(0, MAX_SHOWN).map((f) => ({ ...f, positions: [] }));
    } else {
      shown = files.map((f) => {
        const m = fuzzy(query, f.rel);
        return m && { ...f, ...m };
      }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, MAX_SHOWN);
    }
    selected = Math.min(selected, Math.max(shown.length - 1, 0));
    list.innerHTML = '';
    if (!shown.length) {
      list.innerHTML = `<p class="hint">${files.length ? 'Aucun fichier ne correspond.' : 'Aucun fichier dans ce dossier.'}</p>`;
      return;
    }
    shown.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = `quick-item${i === selected ? ' selected' : ''}`;
      const slash = f.rel.lastIndexOf('/');
      const nameStart = slash + 1;
      const type = fileIcon(f.rel.slice(nameStart));
      row.appendChild(iconElement(type.icon, type.color));
      const name = document.createElement('span');
      name.className = 'name';
      name.innerHTML = highlight(f.rel.slice(nameStart), f.positions.filter((p) => p >= nameStart).map((p) => p - nameStart));
      row.appendChild(name);
      if (slash > 0) {
        const dir = document.createElement('span');
        dir.className = 'dir';
        dir.innerHTML = highlight(f.rel.slice(0, slash), f.positions.filter((p) => p < slash));
        row.appendChild(dir);
      }
      row.onmousemove = () => { if (selected !== i) { selected = i; mark(); } };
      row.onclick = () => choose(i);
      list.appendChild(row);
    });
  }

  function mark() {
    [...list.children].forEach((row, i) => row.classList.toggle('selected', i === selected));
    list.children[selected]?.scrollIntoView({ block: 'nearest' });
  }

  async function choose(i = selected) {
    const file = shown[i];
    if (!file) return;
    const { line } = parse(input.value);
    close();
    await openAt(file.path, line, 1, 0, { preview: false });
  }

  async function open() {
    if (!state.root) return notify.info("Ouvre d'abord un dossier.");
    overlay.hidden = false;
    input.value = '';
    selected = 0;
    if (filesRoot !== state.root) { files = []; list.innerHTML = '<p class="hint">Lecture du projet…</p>'; } else render();
    input.focus();
    // La liste est relue à chaque ouverture (des fichiers ont pu être créés entre-temps).
    try {
      const result = await window.atelier.listFiles();
      files = result.files;
      filesRoot = state.root;
      if (!overlay.hidden) render();
    } catch (err) {
      notify.error(`Impossible de lister les fichiers : ${cleanError(err)}`);
    }
  }

  function close() {
    overlay.hidden = true;
    state.activeGroup?.editor.focus();
  }

  input.addEventListener('input', () => { selected = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, shown.length - 1); mark(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); mark(); }
    if (e.key === 'Enter') { e.preventDefault(); choose(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  input.addEventListener('blur', () => setTimeout(() => {
    if (!overlay.hidden && !overlay.contains(document.activeElement)) close();
  }, 150));

  return { open, close };
})();

// --- Ctrl+Maj+F : chercher un texte dans tout le projet ---

const projectSearch = (() => {
  const view = document.querySelector('#search');
  const input = document.querySelector('#search-input');
  const summary = document.querySelector('#search-summary');
  const results = document.querySelector('#search-results');
  const form = document.querySelector('#search-form');
  const replaceBox = document.querySelector('#replace-box');
  const replaceInput = document.querySelector('#replace-input');
  const replaceAllButton = document.querySelector('#replace-all');
  const options = { caseSensitive: false, wholeWord: false, regex: false };
  let lastAnswer = null; // derniers résultats affichés (pour « Tout remplacer »)
  let timer = null;
  let searchId = 0; // pour ignorer la réponse d'une recherche dépassée par une plus récente

  for (const button of document.querySelectorAll('.search-opt')) {
    button.onclick = () => {
      options[button.dataset.opt] = !options[button.dataset.opt];
      button.classList.toggle('active', options[button.dataset.opt]);
      run();
      input.focus();
    };
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 300); // on attend une petite pause de frappe
  });

  // --- Remplacer ---
  // La flèche à gauche du champ (ou Ctrl+Maj+H) affiche le champ « Remplacer par ». Les résultats
  // montrent alors l'ancien texte barré et le nouveau en vert, avant de toucher à quoi que ce soit.
  const replacing = () => !replaceBox.hidden;
  function showReplace(show) {
    replaceBox.hidden = !show;
    form.classList.toggle('replacing', show);
    run();
  }
  document.querySelector('#search-toggle-replace').onclick = () => { showReplace(!replacing()); (replacing() ? replaceInput : input).focus(); };
  replaceInput.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey && e.altKey) { e.preventDefault(); replaceAll(); }
    if (e.key === 'Escape') state.activeGroup?.editor.focus();
  });
  replaceAllButton.onclick = () => replaceAll();

  // Le texte des fichiers ouverts qui ont des modifications non enregistrées.
  function unsavedTexts() {
    const texts = {};
    for (const file of state.files.values()) {
      if (!file.kind && isDirty(file)) texts[file.path] = file.model.getValue();
    }
    return texts;
  }

  // Remplace partout, ou seulement dans `only` (les fichiers d'un groupe de résultats).
  // - Fichier fermé, ou ouvert sans modification : réécrit sur le disque. Un onglet ouvert se
  //   recharge, et Ctrl+Z dans l'éditeur annule le remplacement.
  // - Fichier ouvert avec des modifications non enregistrées : remplacé dans l'éditeur seulement
  //   (rien n'est écrit), pour ne pas perdre ce que tu as tapé. Tu enregistres quand tu veux.
  async function replaceAll(only = null) {
    if (!lastAnswer || !lastAnswer.count) return;
    const replace = replaceInput.value;
    const targets = only ? lastAnswer.results.filter((f) => only.includes(f.path)) : lastAnswer.results;
    const count = targets.reduce((n, f) => n + f.matches.length, 0);
    const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
    const what = lastAnswer.truncated && !only ? 'tous les résultats (plus de 2000)' : plural(count, 'résultat');
    if (!confirm(`Remplacer ${what} dans ${plural(targets.length, 'fichier')} par « ${replace} » ?`)) return;
    const texts = unsavedTexts();
    let result;
    try {
      result = await window.atelier.replaceText({ query: input.value, ...options }, replace, { only, texts });
    } catch (err) {
      return notify.error(`Remplacement impossible : ${cleanError(err)}`);
    }
    for (const [path, text] of Object.entries(result.fromEditor)) {
      const model = state.files.get(path)?.model;
      if (model) model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
    }
    for (const path of result.changed) if (state.files.has(path)) await reloadFromDisk(path, { quiet: true });
    const files = result.changed.length + Object.keys(result.fromEditor).length;
    notify.success(`${plural(result.count, 'remplacement')} dans ${plural(files, 'fichier')}.${Object.keys(result.fromEditor).length ? ' Les fichiers ouverts non enregistrés ont été modifiés dans l\'éditeur : pense à les enregistrer.' : ''}`);
    document.dispatchEvent(new CustomEvent('files-changed', { detail: result.changed })); // le panneau Git se met à jour
    run();
  }
  document.querySelector('#search-form').onsubmit = (e) => { e.preventDefault(); clearTimeout(timer); run(); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') state.activeGroup?.editor.focus();
  });

  document.querySelector('#search-collapse').onclick = () => {
    const files = results.querySelectorAll('.search-file');
    const anyOpen = [...files].some((f) => !f.classList.contains('collapsed'));
    files.forEach((f) => f.classList.toggle('collapsed', anyOpen));
  };

  async function run() {
    clearTimeout(timer);
    const query = input.value;
    const id = ++searchId;
    if (!query) { results.innerHTML = ''; summary.textContent = ''; lastAnswer = null; replaceAllButton.disabled = true; return; }
    if (!state.root) { summary.textContent = "Ouvre d'abord un dossier."; return; }
    summary.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> Recherche…';
    let answer;
    try {
      answer = await window.atelier.searchText({ query, ...options, replace: replacing() ? replaceInput.value : undefined }, unsavedTexts());
    } catch (err) {
      if (id === searchId) { results.innerHTML = ''; summary.textContent = cleanError(err); }
      return;
    }
    if (id !== searchId) return;
    render(answer);
  }

  function render(answer) {
    const { results: files, count, truncated } = answer;
    lastAnswer = answer;
    replaceAllButton.disabled = !count;
    results.innerHTML = '';
    if (!count) { summary.textContent = 'Aucun résultat.'; return; }
    const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
    summary.textContent = `${plural(count, 'résultat')} dans ${plural(files.length, 'fichier')}${truncated ? ' (arrêté là : affine ta recherche)' : ''}`;
    for (const file of files) {
      const group = document.createElement('div');
      group.className = 'search-file';
      const head = document.createElement('div');
      head.className = 'search-file-head';
      head.innerHTML = '<i class="chevron codicon codicon-chevron-down"></i>';
      const slash = file.rel.lastIndexOf('/');
      const type = fileIcon(file.rel.slice(slash + 1));
      head.appendChild(iconElement(type.icon, type.color));
      head.insertAdjacentHTML('beforeend', `<span class="name">${escapeHtml(file.rel.slice(slash + 1))}</span><span class="dir">${escapeHtml(slash > 0 ? file.rel.slice(0, slash) : '')}</span><span class="count">${file.matches.length}</span>`);
      const replaceFile = document.createElement('button');
      replaceFile.className = 'icon-button replace-file';
      replaceFile.title = 'Remplacer dans ce fichier';
      replaceFile.innerHTML = '<i class="codicon codicon-replace-all"></i>';
      replaceFile.onclick = (e) => { e.stopPropagation(); replaceAll([file.path]); };
      head.appendChild(replaceFile);
      head.title = file.rel;
      head.onclick = () => group.classList.toggle('collapsed');
      group.appendChild(head);
      for (const m of file.matches) {
        const row = document.createElement('div');
        row.className = 'search-match';
        const t = m.text;
        // Le début de la ligne est raccourci pour que le résultat reste visible dans la barre étroite.
        let before = t.slice(0, m.start).replace(/^\s+/, '');
        if (before.length > 24) before = `…${before.slice(-24)}`;
        const found = escapeHtml(t.slice(m.start, m.start + m.previewLength));
        // En mode remplacement : l'ancien texte barré en rouge, le nouveau en vert.
        const middle = m.replacement !== undefined ? `<del>${found}</del><ins>${escapeHtml(m.replacement)}</ins>` : `<mark>${found}</mark>`;
        row.innerHTML = `<span class="line-no">${m.line}</span><span class="text">${escapeHtml(before)}${middle}${escapeHtml(t.slice(m.start + m.previewLength))}</span>`;
        row.title = `${file.rel}, ligne ${m.line}`;
        row.onclick = () => {
          results.querySelectorAll('.search-match.active').forEach((r) => r.classList.remove('active'));
          row.classList.add('active');
          openAt(file.path, m.line, m.col, m.length);
        };
        row.ondblclick = () => openAt(file.path, m.line, m.col, m.length, { preview: false });
        group.appendChild(row);
      }
      results.appendChild(group);
    }
  }

  // Ouvre la vue, avec le texte sélectionné dans l'éditeur s'il tient sur une ligne.
  function open() {
    document.querySelector('#activitybar [data-view="search"]').click();
    const editor = state.activeGroup?.editor;
    const selection = editor?.getSelection();
    if (selection && !selection.isEmpty() && selection.startLineNumber === selection.endLineNumber) {
      const text = editor.getModel().getValueInRange(selection);
      if (text !== input.value) { input.value = text; run(); }
    }
    input.focus();
    input.select();
  }

  // Le bouton loupe de la barre d'icônes place aussi le curseur dans le champ.
  document.querySelector('#activitybar [data-view="search"]').addEventListener('click', () => setTimeout(() => input.focus(), 0));

  // Ctrl+Maj+H : la recherche, avec le champ de remplacement.
  function openReplace() {
    open();
    if (!replacing()) showReplace(true);
    if (input.value) replaceInput.focus();
  }

  return { open, openReplace, run, isVisible: () => !view.hidden };
})();

window.atelier.onShortcut((action) => {
  if (action === 'quickOpen') quickOpen.open();
  if (action === 'searchProject') projectSearch.open();
  if (action === 'replaceProject') projectSearch.openReplace();
});
