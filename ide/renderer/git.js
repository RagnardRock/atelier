// Panneau Git (icône "branche" de la barre de gauche).
// - La liste des fichiers modifiés, en deux groupes : "Indexées" (ce qui partira dans le
//   prochain commit) et "Modifications". Le + indexe un fichier, le − le retire.
// - Un clic sur un fichier montre ses changements : dernier commit à gauche, ton fichier à droite.
// - Un message, puis Valider (ou Ctrl+Entrée) crée le commit. Sans rien d'indexé, tout part.
// - Les flèches en haut récupèrent (pull) et envoient (push) tes commits.
// Le travail est fait par main.js (voir ../git.js), qui lance la commande git.

const gitView = (() => {
  const view = $('#git');
  const body = $('#git-body');
  const badge = $('#git-badge');
  let last = null;          // dernier état reçu
  let message = '';         // message de commit en cours d'écriture (gardé entre deux rafraîchissements)
  let busy = false;

  const LETTERS = { M: 'M', A: 'A', D: 'D', R: 'R', C: 'C', U: 'U', '?': 'U' };
  const LABELS = { M: 'modifié', A: 'ajouté', D: 'supprimé', R: 'renommé', C: 'copié', U: 'nouveau (non suivi)', '?': 'nouveau (non suivi)' };

  // --- Rafraîchissement ---

  let timer = null;
  function refreshSoon(delay = 300) {
    clearTimeout(timer);
    timer = setTimeout(() => refresh(false), delay);
  }

  // Sans "force", on ne reconstruit la liste que si quelque chose a changé (le rafraîchissement
  // régulier ne doit pas faire clignoter le panneau ni déplacer ton curseur dans le message).
  async function refresh(force = true) {
    let next;
    if (!state.root) next = null;
    else {
      try {
        next = await window.atelier.gitStatus();
      } catch (err) {
        next = { error: cleanError(err) };
      }
    }
    const changed = JSON.stringify(next) !== JSON.stringify(last);
    last = next;
    if (force === true || changed) render();
  }

  // --- Affichage ---

  function render() {
    const changes = last?.isRepo ? last.files.length : 0;
    badge.hidden = !changes;
    badge.textContent = changes > 99 ? '99+' : String(changes);
    if (view.hidden) return; // la pastille suffit tant que le panneau est fermé
    // On garde le message et le focus pendant qu'on reconstruit la liste.
    const typing = document.activeElement?.id === 'git-message' ? document.activeElement : null;
    const caret = typing && [typing.selectionStart, typing.selectionEnd];
    body.innerHTML = '';
    $('#git-title').textContent = last?.branch ? `Git · ${last.branch}` : 'Git';
    $('#git-push').classList.toggle('has-count', Boolean(last?.ahead));
    $('#git-push').dataset.count = last?.ahead || '';
    $('#git-pull').dataset.count = last?.behind || '';
    // Branche jamais envoyée : le premier push la publie (git push -u origin <branche>).
    $('#git-push').title = last?.isRepo && last.branch && !last.upstream
      ? `Publier la branche ${last.branch} en ligne (git push -u origin ${last.branch})`
      : 'Envoyer tes commits en ligne (git push)';
    $('#git-pull').classList.toggle('has-count', Boolean(last?.behind));
    if (!state.root) return body.insertAdjacentHTML('beforeend', '<p class="hint">Ouvre un dossier pour voir ses modifications.</p>');
    if (last?.error) return body.insertAdjacentHTML('beforeend', `<p class="hint git-error">${escapeHtml(last.error)}</p>`);
    if (!last) return;
    if (!last.isRepo) {
      body.insertAdjacentHTML('beforeend', '<p class="hint">Ce dossier n\'est pas suivi par Git.</p>');
      const init = document.createElement('button');
      init.className = 'primary-button git-wide';
      init.innerHTML = '<i class="codicon codicon-source-control"></i>Initialiser un dépôt Git';
      init.onclick = () => act(() => window.atelier.gitInit(), 'Dépôt Git créé');
      body.appendChild(init);
      return;
    }

    // Zone de commit
    const box = document.createElement('div');
    box.className = 'git-commit';
    box.innerHTML = `<textarea id="git-message" rows="2" spellcheck="false" placeholder="Message du commit (Ctrl+Entrée pour valider)"></textarea>
      <button id="git-commit" class="primary-button git-wide"><i class="codicon codicon-check"></i><span></span></button>`;
    const textarea = box.querySelector('textarea');
    textarea.value = message;
    textarea.oninput = () => { message = textarea.value; };
    textarea.onkeydown = (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); commit(); } };
    const staged = last.files.filter((f) => f.index !== ' ' && f.index !== '?');
    const unstaged = last.files.filter((f) => f.work !== ' ');
    box.querySelector('span').textContent = !staged.length && unstaged.length ? 'Tout valider' : 'Valider';
    box.querySelector('button').title = !staged.length ? 'Rien n\'est indexé : toutes les modifications partiront dans le commit' : 'Valider les modifications indexées';
    box.querySelector('button').disabled = !last.files.length;
    box.querySelector('button').onclick = commit;
    body.appendChild(box);
    if (typing) { textarea.focus(); textarea.setSelectionRange(...caret); }

    if (!last.files.length) {
      const sync = last.ahead ? ` Tu as ${last.ahead} commit${last.ahead > 1 ? 's' : ''} à envoyer (flèche vers le haut).` : '';
      body.insertAdjacentHTML('beforeend', `<p class="hint">Aucune modification depuis le dernier commit.${sync}</p>`);
      return;
    }
    if (staged.length) section('Indexées', staged, true);
    if (unstaged.length) section('Modifications', unstaged, false);
  }

  function section(title, files, isStaged) {
    const head = document.createElement('div');
    head.className = 'git-section';
    head.innerHTML = `<span>${title}</span><span class="count">${files.length}</span>`;
    const all = document.createElement('button');
    all.className = 'icon-button';
    all.title = isStaged ? 'Tout retirer de l\'index' : 'Tout indexer';
    all.innerHTML = `<i class="codicon codicon-${isStaged ? 'remove' : 'add'}"></i>`;
    all.onclick = () => act(() => (isStaged ? window.atelier.gitUnstage : window.atelier.gitStage)(files.map((f) => f.path)));
    head.appendChild(all);
    body.appendChild(head);
    for (const f of files) {
      const code = isStaged ? f.index : (f.work === '?' ? '?' : f.work);
      const row = document.createElement('div');
      row.className = `git-file status-${LETTERS[code] || 'M'}`;
      const slash = f.rel.lastIndexOf('/');
      const name = f.rel.slice(slash + 1);
      const type = fileIcon(name);
      row.appendChild(iconElement(type.icon, type.color));
      row.insertAdjacentHTML('beforeend', `<span class="name"></span><span class="dir"></span><span class="actions"></span><span class="letter"></span>`);
      row.querySelector('.name').textContent = name;
      row.querySelector('.dir').textContent = slash > 0 ? f.rel.slice(0, slash) : '';
      row.querySelector('.letter').textContent = LETTERS[code] || code;
      row.title = `${f.rel} : ${LABELS[code] || code}${f.from ? ` (avant : ${f.from})` : ''}`;
      const actions = row.querySelector('.actions');
      if (code !== 'D') {
        const open = document.createElement('button');
        open.className = 'icon-button';
        open.title = 'Ouvrir le fichier';
        open.innerHTML = '<i class="codicon codicon-go-to-file"></i>';
        open.onclick = (e) => { e.stopPropagation(); openFile(f.path, name, { preview: false }); };
        actions.appendChild(open);
      }
      const toggle = document.createElement('button');
      toggle.className = 'icon-button';
      toggle.title = isStaged ? 'Retirer de l\'index' : 'Indexer (préparer pour le commit)';
      toggle.innerHTML = `<i class="codicon codicon-${isStaged ? 'remove' : 'add'}"></i>`;
      toggle.onclick = (e) => { e.stopPropagation(); act(() => (isStaged ? window.atelier.gitUnstage : window.atelier.gitStage)([f.path])); };
      actions.appendChild(toggle);
      row.onclick = () => (code === 'D' ? notify.info(`${name} a été supprimé.`) : showDiff(f.path, name));
      body.appendChild(row);
    }
  }

  // --- Actions ---

  async function act(fn, success) {
    if (busy) return;
    busy = true;
    view.classList.add('busy');
    try {
      const result = await fn();
      if (success) flash(typeof success === 'function' ? success(result) : success);
    } catch (err) {
      notify.error(cleanError(err));
    } finally {
      busy = false;
      view.classList.remove('busy');
      await refresh();
    }
  }

  function commit() {
    const text = message.trim();
    if (!text) { $('#git-message')?.focus(); return notify.info('Écris d\'abord un message qui décrit tes modifications.'); }
    act(async () => {
      const result = await window.atelier.gitCommit(text);
      message = '';
      return result;
    }, (r) => (r.all ? 'Commit créé avec toutes les modifications' : 'Commit créé'));
  }

  $('#git-refresh').onclick = () => refresh();
  $('#git-push').onclick = () => act(() => window.atelier.gitPush(), 'Commits envoyés');
  $('#git-pull').onclick = () => act(() => window.atelier.gitPull(), 'Commits récupérés');

  // --- Comparaison (diff) ---

  const diffView = $('#diff-view');
  let diffEditor = null;
  let diffOriginal = null;  // texte du dernier commit
  let diffModified = null;  // modèle du fichier (celui de l'éditeur s'il est ouvert)
  let diffTemp = false;     // modèle créé juste pour la comparaison, à libérer ensuite
  let diffPath = null;
  let sideBySide = true;

  async function showDiff(path, name) {
    let head;
    let current;
    try {
      head = await window.atelier.gitHead(path);
      const file = state.files.get(path);
      current = file ? null : await window.atelier.readFile(path);
    } catch (err) {
      return notify.error(`Impossible de comparer ${name} : ${cleanError(err)}`);
    }
    closeDiff();
    diffPath = path;
    const language = monaco.languages.getLanguages().find((l) => (l.extensions || []).some((ext) => path.toLowerCase().endsWith(ext)))?.id;
    diffOriginal = monaco.editor.createModel(head, language);
    const open = state.files.get(path);
    diffTemp = !open;
    diffModified = open ? open.model : monaco.editor.createModel(current, language);
    diffView.hidden = false;
    if (!diffEditor) {
      diffEditor = monaco.editor.createDiffEditor($('#diff-editor'), {
        ...editorOptions(),
        automaticLayout: true,
        renderSideBySide: sideBySide,
        originalEditable: false,
        readOnly: true, // on modifie le fichier dans son onglet (bouton « Ouvrir le fichier »)
      });
    }
    diffEditor.setModel({ original: diffOriginal, modified: diffModified });
    $('#diff-title').textContent = path.slice(state.root.length + 1);
  }

  function closeDiff() {
    if (diffEditor) diffEditor.setModel(null);
    diffOriginal?.dispose();
    if (diffTemp) diffModified?.dispose();
    diffOriginal = diffModified = null;
    diffView.hidden = true;
  }

  $('#diff-close').onclick = closeDiff;
  $('#diff-open').onclick = () => { const p = diffPath; closeDiff(); openFile(p, baseName(p), { preview: false }); };
  $('#diff-inline').onclick = () => { sideBySide = !sideBySide; diffEditor?.updateOptions({ renderSideBySide: sideBySide }); };
  diffView.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDiff(); });
  // Ouvrir un onglet referme la comparaison (sinon elle cacherait l'éditeur).
  document.addEventListener('tab-activated', () => { if (!diffView.hidden) closeDiff(); });

  // --- Quand rafraîchir ---

  document.querySelector('#activitybar [data-view="git"]').addEventListener('click', () => setTimeout(refresh, 0));
  document.addEventListener('file-saved', () => refreshSoon());
  document.addEventListener('files-changed', () => refreshSoon());
  window.addEventListener('focus', () => refreshSoon(100)); // retour dans l'IDE : tu as pu faire un commit ailleurs
  setInterval(() => { if (document.hasFocus() && state.root) refresh(false); }, 5000);
  // Nouveau dossier ouvert : on attend qu'il soit chargé.
  new MutationObserver(() => refreshSoon(200)).observe($('#tree-title'), { childList: true, characterData: true, subtree: true });

  return { refresh, showDiff, closeDiff };
})();
