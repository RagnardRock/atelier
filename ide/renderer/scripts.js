// Panneau Scripts (l'icône ▶▶ de la barre de gauche) : les scripts npm de ton projet en un clic.
// L'IDE lit les "scripts" des package.json (racine et sous-dossiers) : dev, build, preview, test…
// ▶ lance « npm run <script> » dans un onglet de terminal, ■ l'arrête, et un clic sur un script
// en cours affiche son terminal. Une pastille sur l'icône compte les scripts qui tournent.
// La liste se met à jour toute seule quand un package.json change.

const scriptsPanel = (() => {
  const list = document.querySelector('#scripts-list');
  const badge = document.querySelector('#scripts-badge');
  const running = new Map(); // "dossier|script" -> id du terminal
  let packages = [];
  let timer = null;

  const keyOf = (dir, name) => `${dir}|${name}`;

  async function refresh() {
    if (!state.root) { packages = []; return render(); }
    packages = await window.atelier.listScripts().catch((err) => { notify.error(cleanError(err)); return []; });
    render();
  }

  function render() {
    list.innerHTML = '';
    if (!state.root) {
      list.innerHTML = '<p class="hint">Ouvre un dossier pour voir ses scripts npm.</p>';
    } else if (packages.length === 0) {
      list.innerHTML = '<p class="hint">Aucun script npm dans ce projet. Ils viennent de la partie « scripts » de package.json.</p>';
    }
    for (const pkg of packages) {
      const head = document.createElement('div');
      head.className = 'scripts-package';
      head.innerHTML = '<i class="codicon codicon-package"></i><span class="name"></span><span class="dir"></span>';
      head.querySelector('.name').textContent = pkg.name;
      head.querySelector('.dir').textContent = pkg.rel || '';
      head.title = pkg.dir;
      list.appendChild(head);
      for (const [name, command] of Object.entries(pkg.scripts)) list.appendChild(row(pkg, name, command));
    }
    const count = running.size;
    badge.hidden = count === 0;
    badge.textContent = count;
  }

  function row(pkg, name, command) {
    const id = running.get(keyOf(pkg.dir, name));
    const isRunning = id !== undefined;
    const el = document.createElement('div');
    el.className = `script${isRunning ? ' running' : ''}`;
    el.dataset.script = name;
    el.innerHTML = `
      <i class="codicon ${isRunning ? 'codicon-loading' : 'codicon-terminal'} state"></i>
      <span class="name"></span><span class="command"></span>
      <span class="actions">
        ${isRunning ? '<button class="icon-button stop" title="Arrêter"><i class="codicon codicon-debug-stop"></i></button>'
          : '<button class="icon-button run" title="Lancer"><i class="codicon codicon-play"></i></button>'}
      </span>`;
    el.querySelector('.name').textContent = name;
    el.querySelector('.command').textContent = command;
    el.title = `npm run ${name}\n${command}${isRunning ? '\nClic : afficher son terminal' : '\nClic : lancer'}`;
    el.onclick = () => (isRunning ? terminalPanel.show(id) : run(pkg.dir, name));
    el.querySelector('.run')?.addEventListener('click', (e) => { e.stopPropagation(); run(pkg.dir, name); });
    el.querySelector('.stop')?.addEventListener('click', (e) => { e.stopPropagation(); terminalPanel.stop(id); });
    return el;
  }

  // Lance un script (aussi utilisé par « Nouveau projet » pour npm run dev).
  async function run(dir, name) {
    const key = keyOf(dir, name);
    if (running.has(key)) return terminalPanel.show(running.get(key));
    const label = dir === state.root ? name : `${name} · ${baseName(dir)}`;
    try {
      const id = await terminalPanel.script(dir, name, label);
      running.set(key, id);
    } catch (err) {
      notify.error(cleanError(err));
    }
    render();
  }

  // Le script s'est arrêté (■, Ctrl+C, erreur, onglet fermé) : son bouton redevient ▶.
  terminalPanel.onExit((id) => {
    for (const [key, tid] of running) if (tid === id) running.delete(key);
    render();
  });

  // package.json modifié (ajout d'un script, npm install d'un outil…) : on relit la liste.
  document.addEventListener('files-changed', (e) => {
    if (!e.detail.some((p) => /[\\/]package\.json$/.test(p))) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 300);
  });
  document.addEventListener('root-changed', refresh);
  document.querySelector('#scripts-refresh').onclick = refresh;
  render();

  return { refresh, run };
})();
