// Panneau terminal : plusieurs terminaux en onglets, un profil par terminal (PowerShell, SSH…).
// L'affichage est fait par xterm.js ; le vrai processus tourne dans main.js (node-pty).

const terminalPanel = (() => {
  const panel = document.querySelector('#terminal-panel');
  const resizer = document.querySelector('#panel-resizer');
  const tabsEl = document.querySelector('#term-tabs');
  const viewsEl = document.querySelector('#term-views');
  const profileSelect = document.querySelector('#term-profile');

  const terms = new Map(); // id -> { term, fit, tab, view, exited }
  let activeId = null;
  let config = null;

  // Couleurs du terminal = couleurs de l'interface (variables CSS de style.css).
  function theme() {
    const css = getComputedStyle(document.body);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return {
      background: css.getPropertyValue('--bg').trim(),
      foreground: css.getPropertyValue('--text').trim(),
      cursor: accent,
      selectionBackground: `${accent}55`,
    };
  }

  function applyConfig(newConfig) {
    config = newConfig;
    profileSelect.innerHTML = '';
    for (const p of config.terminalProfiles) {
      const option = document.createElement('option');
      option.textContent = p.name;
      profileSelect.appendChild(option);
    }
    for (const t of terms.values()) {
      t.term.options.theme = theme();
      t.term.options.fontSize = config.terminalFontSize;
      t.term.options.fontFamily = config.fontFamily;
      t.term.refresh(0, t.term.rows - 1); // redessine tout de suite avec les nouvelles couleurs
    }
    fitActive();
  }

  function isOpen() { return !panel.hidden; }

  function toggle() {
    panel.hidden = resizer.hidden = isOpen();
    if (!isOpen()) return;
    // Premier affichage : on ouvre directement un terminal avec le premier profil.
    if (terms.size === 0) create(profileSelect.value).catch((err) => notify.error(err.message));
    else focusActive();
  }

  // Terminal à partir d'un profil de la config (PowerShell, Git Bash…), lancé dans `dir`.
  // Par défaut : le dossier sélectionné dans l'arborescence, sinon la racine du projet.
  // main.js vérifie que ce dossier fait partie du projet ouvert.
  function create(profileName, dir = state.selectedDir || state.root) {
    const label = dir ? `${profileName} · ${baseName(dir)}` : profileName;
    return open(label, (cols, rows) => window.atelier.createTerminal(profileName, cols, rows, dir), 'terminal', dir);
  }

  // Terminal connecté en SSH à un serveur favori (panneau Serveurs).
  function connect(server) {
    return open(server.name, (cols, rows) => window.atelier.connectServer(server.id, cols, rows), 'server', describeServer(server));
  }

  // Ouvre un onglet de terminal. `start` lance le processus côté main.js et renvoie son id.
  async function open(label, start, icon, tooltip) {
    if (!isOpen()) { panel.hidden = resizer.hidden = false; }

    const term = new Terminal({
      fontFamily: config.fontFamily,
      fontSize: config.terminalFontSize,
      theme: theme(),
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon.FitAddon(); // ajuste colonnes/lignes à la taille du panneau
    term.loadAddon(fit);

    const view = document.createElement('div');
    view.className = 'term-view';
    viewsEl.appendChild(view);
    term.open(view);
    fit.fit();

    let id;
    try {
      id = await start(term.cols, term.rows);
    } catch (err) {
      term.dispose();
      view.remove();
      throw new Error(`Impossible de lancer « ${label} » : ${cleanError(err)}`);
    }

    // Ce que tu tapes part vers le processus.
    term.onData((data) => window.atelier.writeTerminal(id, data));
    term.onResize(({ cols, rows }) => window.atelier.resizeTerminal(id, cols, rows));

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.innerHTML = `<i class="codicon codicon-${icon}"></i><span class="name"></span><span class="close" title="Fermer ce terminal"><i class="codicon codicon-close"></i></span>`;
    tab.querySelector('.name').textContent = label;
    tab.title = tooltip || label;
    tab.onclick = () => activate(id);
    tab.querySelector('.close').onclick = (e) => { e.stopPropagation(); close(id); };
    // Clic molette : fermer ce terminal.
    tab.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    tab.addEventListener('auxclick', (e) => { if (e.button === 1) close(id); });
    // Glisser-déposer pour changer l'ordre des onglets de terminal.
    tab.draggable = true;
    tab.dataset.termId = id;
    tab.addEventListener('dragstart', (e) => {
      draggedTab = tab;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', label);
    });
    tab.addEventListener('dragend', () => {
      draggedTab = null;
      tabsEl.querySelectorAll('.drop-before').forEach((t) => t.classList.remove('drop-before'));
    });
    tabsEl.appendChild(tab);

    terms.set(id, { term, fit, tab, view, exited: false });
    activate(id);
  }

  function activate(id) {
    activeId = id;
    for (const [tid, t] of terms) {
      t.view.hidden = tid !== id;
      t.tab.classList.toggle('active', tid === id);
    }
    fitActive();
    focusActive();
  }

  function close(id) {
    const t = terms.get(id);
    if (!t) return;
    if (!t.exited) window.atelier.killTerminal(id);
    t.term.dispose();
    t.view.remove();
    // Onglet voisin dans l'ordre affiché (qui peut avoir été changé par glisser-déposer).
    const neighbor = t.tab.nextElementSibling || t.tab.previousElementSibling;
    t.tab.remove();
    terms.delete(id);
    const next = neighbor ? Number(neighbor.dataset.termId) : undefined;
    if (next !== undefined) activate(next);
    else { activeId = null; panel.hidden = resizer.hidden = true; }
  }

  function fitActive() {
    const t = terms.get(activeId);
    if (t && isOpen()) t.fit.fit();
  }

  function focusActive() {
    terms.get(activeId)?.term.focus();
  }

  // Sortie des processus -> affichage.
  window.atelier.onTerminalData((id, data) => terms.get(id)?.term.write(data));
  window.atelier.onTerminalExit((id, code) => {
    const t = terms.get(id);
    if (!t) return;
    t.exited = true;
    t.tab.classList.add('exited');
    t.term.write(`\r\n\x1b[90m[Processus terminé (code ${code}). Ferme l'onglet ou ouvre un nouveau terminal.]\x1b[0m\r\n`);
  });

  // Le terminal suit la taille du panneau (fenêtre redimensionnée, poignée déplacée…).
  new ResizeObserver(fitActive).observe(viewsEl);

  // Poignée : glisser pour changer la hauteur du panneau.
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizer.classList.add('dragging');
    const bottom = panel.getBoundingClientRect().bottom;
    const onMove = (ev) => {
      const height = Math.min(Math.max(bottom - ev.clientY, 80), window.innerHeight - 200);
      panel.style.height = `${height}px`;
    };
    const onUp = () => {
      resizer.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Lâcher un onglet de terminal : il s'insère avant l'onglet survolé (ou à la fin).
  let draggedTab = null;
  const tabUnder = (x) => [...tabsEl.children].find((t) => {
    const r = t.getBoundingClientRect();
    return x < r.left + r.width / 2;
  });
  tabsEl.addEventListener('dragover', (e) => {
    if (!draggedTab) return;
    e.preventDefault();
    const target = tabUnder(e.clientX);
    [...tabsEl.children].forEach((t) => t.classList.toggle('drop-before', t === target));
  });
  tabsEl.addEventListener('drop', (e) => {
    if (!draggedTab) return;
    e.preventDefault();
    const target = tabUnder(e.clientX);
    if (target !== draggedTab) tabsEl.insertBefore(draggedTab, target || null);
  });

  document.querySelector('#term-new').onclick = () => create(profileSelect.value).catch((err) => notify.error(err.message));
  document.querySelector('#btn-terminal').onclick = toggle;
  document.querySelector('#term-hide').onclick = toggle;
  // Ctrl+J est intercepté par main.js (avant l'éditeur et le terminal), puis transmis à app.js.

  return { applyConfig, toggle, create, connect };
})();
