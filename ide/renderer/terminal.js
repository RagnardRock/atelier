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
    }
    fitActive();
  }

  function isOpen() { return !panel.hidden; }

  function toggle() {
    panel.hidden = resizer.hidden = isOpen();
    if (!isOpen()) return;
    // Premier affichage : on ouvre directement un terminal avec le premier profil.
    if (terms.size === 0) create(profileSelect.value);
    else focusActive();
  }

  async function create(profileName) {
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
      id = await window.atelier.createTerminal(profileName, term.cols, term.rows);
    } catch (err) {
      term.write(`\x1b[31mImpossible de lancer « ${profileName} » : ${err.message}\x1b[0m\r\n`);
      return;
    }

    // Ce que tu tapes part vers le processus.
    term.onData((data) => window.atelier.writeTerminal(id, data));
    term.onResize(({ cols, rows }) => window.atelier.resizeTerminal(id, cols, rows));

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.innerHTML = '<span class="name"></span><span class="close" title="Fermer ce terminal">×</span>';
    tab.querySelector('.name').textContent = profileName;
    tab.onclick = () => activate(id);
    tab.querySelector('.close').onclick = (e) => { e.stopPropagation(); close(id); };
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
    t.tab.remove();
    terms.delete(id);
    const next = [...terms.keys()].pop();
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

  document.querySelector('#term-new').onclick = () => create(profileSelect.value);
  document.querySelector('#btn-terminal').onclick = toggle;

  // Ctrl+J : afficher / masquer, même quand le curseur est dans l'éditeur ou le terminal.
  // (Phase de capture pour passer avant Monaco et xterm.)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  }, true);

  return { applyConfig, toggle, create };
})();
