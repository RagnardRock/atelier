// Fenêtre « Nouveau projet » (Ctrl+Alt+N, la fusée de la barre de titre, ou l'écran d'accueil).
// Tu choisis un modèle (Vue.js, Vite, React, Svelte, site HTML), un nom et un emplacement ;
// main.js (scaffold.js) lance l'outil officiel, installe les dépendances et fait un premier commit.
// Pendant ce temps, la fenêtre affiche ce que font les commandes, ligne par ligne.
// À la fin : le projet s'ouvre dans l'IDE, avec son fichier principal, et le serveur de
// développement (npm run dev) démarre dans un terminal si tu l'as coché.
// Tes derniers choix (modèle, options) sont retenus pour la fois suivante.

const newProject = (() => {
  const TEMPLATES = [
    { id: 'vue', name: 'Vue.js', badge: 'V', color: '#42b883', text: 'Vue 3 + Vite, avec l\'outil officiel create-vue.',
      options: [['typescript', 'TypeScript'], ['router', 'Vue Router', 'Plusieurs pages'], ['pinia', 'Pinia', 'Données partagées'], ['vitest', 'Vitest', 'Tests'], ['eslint', 'ESLint'], ['prettier', 'Prettier']] },
    { id: 'vite-vanilla', name: 'Vite', badge: 'JS', color: '#f7df1e', text: 'JavaScript sans framework, rechargé à chaque enregistrement.', options: [['typescript', 'TypeScript']] },
    { id: 'vite-react', name: 'React', badge: 'R', color: '#61dafb', text: 'React + Vite.', options: [['typescript', 'TypeScript']] },
    { id: 'vite-svelte', name: 'Svelte', badge: 'S', color: '#ff3e00', text: 'Svelte + Vite.', options: [['typescript', 'TypeScript']] },
    { id: 'html', name: 'Site HTML', badge: '</>', color: '#e44d26', text: 'index.html, css/ et js/, sans outil ni installation.', options: [] },
  ];
  const STORE = 'atelier.newProject';

  let remembered = {};
  try { remembered = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { /* premier lancement */ }
  const choice = {
    template: remembered.template || 'vue',
    options: { router: true, pinia: true, ...remembered.options },
    install: remembered.install ?? true,
    git: remembered.git ?? true,
    dev: remembered.dev ?? true,
    parent: '',
  };
  let running = false;

  const backdrop = document.createElement('div');
  backdrop.id = 'new-project';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <div class="np-card" role="dialog" aria-label="Nouveau projet">
      <header>
        <h2><i class="codicon codicon-rocket"></i>Nouveau projet</h2>
        <button class="icon-button np-close" title="Fermer (Échap)"><i class="codicon codicon-close"></i></button>
      </header>
      <form class="np-form">
        <div class="np-templates"></div>
        <label class="np-field">Nom du projet
          <input name="name" spellcheck="false" autocomplete="off" placeholder="mon-app">
        </label>
        <div class="np-field">Emplacement
          <div class="np-location"><span class="np-parent"></span><button type="button" class="np-change">Changer…</button></div>
          <span class="np-target"></span>
        </div>
        <div class="np-options"></div>
        <div class="np-common"></div>
        <p class="form-error np-error"></p>
        <footer>
          <button type="button" class="np-cancel">Annuler</button>
          <button type="submit" class="primary-button"><i class="codicon codicon-rocket"></i>Créer le projet</button>
        </footer>
      </form>
      <section class="np-progress" hidden>
        <ol class="np-steps"></ol>
        <pre class="np-log"></pre>
        <footer>
          <button type="button" class="np-stop">Annuler la création</button>
          <button type="button" class="np-back primary-button" hidden>Retour</button>
        </footer>
      </section>
    </div>`;
  document.body.appendChild(backdrop);
  const $np = (sel) => backdrop.querySelector(sel);
  const form = $np('.np-form');
  const nameInput = form.elements.name;

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ template: choice.template, options: choice.options, install: choice.install, git: choice.git, dev: choice.dev })); } catch { /* pas grave */ }
  }

  function toggleRow(label, hint, value, onChange) {
    const row = document.createElement('label');
    row.className = 'np-toggle';
    row.innerHTML = '<button type="button" class="toggle"><span class="knob"></span></button><span class="text"><span class="label"></span><span class="hint"></span></span>';
    row.querySelector('.label').textContent = label;
    row.querySelector('.hint').textContent = hint || '';
    const button = row.querySelector('.toggle');
    button.classList.toggle('on', value);
    button.onclick = () => { button.classList.toggle('on'); onChange(button.classList.contains('on')); save(); };
    return row;
  }

  function render() {
    const list = $np('.np-templates');
    list.innerHTML = '';
    for (const t of TEMPLATES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'np-template';
      card.dataset.template = t.id;
      card.classList.toggle('active', t.id === choice.template);
      card.innerHTML = '<span class="np-badge"></span><span class="np-name"></span><span class="np-text"></span>';
      card.querySelector('.np-badge').textContent = t.badge;
      card.querySelector('.np-badge').style.setProperty('--badge', t.color);
      card.querySelector('.np-name').textContent = t.name;
      card.querySelector('.np-text').textContent = t.text;
      card.onclick = () => { choice.template = t.id; save(); render(); };
      list.appendChild(card);
    }
    const template = TEMPLATES.find((t) => t.id === choice.template);
    const options = $np('.np-options');
    options.innerHTML = '';
    options.hidden = template.options.length === 0;
    for (const [key, label, hint] of template.options) {
      options.appendChild(toggleRow(label, hint, Boolean(choice.options[key]), (on) => { choice.options[key] = on; }));
    }
    const common = $np('.np-common');
    common.innerHTML = '';
    if (template.id !== 'html') {
      common.appendChild(toggleRow('Installer les dépendances', 'npm install', choice.install, (on) => { choice.install = on; render(); }));
      if (choice.install) common.appendChild(toggleRow('Lancer le serveur de développement', 'npm run dev, dans un terminal', choice.dev, (on) => { choice.dev = on; }));
    }
    common.appendChild(toggleRow('Créer un dépôt Git', 'git init + premier commit', choice.git, (on) => { choice.git = on; }));
    $np('.np-parent').textContent = choice.parent;
    $np('.np-parent').title = choice.parent;
    updateTarget();
  }

  function updateTarget() {
    const name = nameInput.value.trim();
    const sep = choice.parent.includes('\\') ? '\\' : '/';
    $np('.np-target').textContent = name ? `Sera créé dans ${choice.parent.replace(/[\\/]$/, '')}${sep}${name}` : '';
    $np('.np-error').textContent = '';
  }

  // Les noms npm sont en minuscules, sans espace : on corrige pendant la frappe (« Mon App » -> « mon-app »).
  nameInput.addEventListener('input', () => {
    const fixed = nameInput.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '');
    if (fixed !== nameInput.value) nameInput.value = fixed;
    updateTarget();
  });

  $np('.np-change').onclick = async () => {
    const folder = await window.atelier.pickFolder(choice.parent).catch((err) => notify.error(cleanError(err)));
    if (folder) { choice.parent = folder; render(); }
  };

  async function open() {
    if (running) { backdrop.hidden = false; return; }
    const defaults = await window.atelier.projectDefaults().catch(() => ({ parent: '' }));
    choice.parent = defaults.parent;
    nameInput.value = '';
    showForm();
    render();
    backdrop.hidden = false;
    nameInput.focus();
  }

  function close() {
    if (running) return; // on ne cache pas une création en cours : il faut l'annuler d'abord
    backdrop.hidden = true;
  }

  function showForm() {
    form.hidden = false;
    $np('.np-progress').hidden = true;
  }

  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  $np('.np-close').onclick = close;
  $np('.np-cancel').onclick = close;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) close(); });
  $np('.np-stop').onclick = () => window.atelier.cancelProject();
  $np('.np-back').onclick = () => { showForm(); nameInput.focus(); };

  // --- Création ---

  const steps = $np('.np-steps');
  const logEl = $np('.np-log');

  window.atelier.onProjectLog(({ line, kind }) => {
    if (kind === 'step') {
      steps.querySelector('li.current')?.classList.replace('current', 'done');
      const li = document.createElement('li');
      li.className = line === 'Terminé' ? 'done' : 'current';
      li.innerHTML = '<i class="codicon"></i><span></span>';
      li.querySelector('span').textContent = line;
      steps.appendChild(li);
      return;
    }
    const div = document.createElement('div');
    div.className = kind;
    div.textContent = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { $np('.np-error').textContent = 'Donne un nom à ton projet.'; return nameInput.focus(); }
    const template = TEMPLATES.find((t) => t.id === choice.template);
    const options = Object.fromEntries(template.options.map(([key]) => [key, Boolean(choice.options[key])]));
    const install = template.id !== 'html' && choice.install;

    running = true;
    form.hidden = true;
    $np('.np-progress').hidden = false;
    $np('.np-stop').hidden = false;
    $np('.np-back').hidden = true;
    steps.innerHTML = '';
    logEl.innerHTML = '';
    backdrop.classList.add('busy');
    let result;
    try {
      result = await window.atelier.createProject({ template: template.id, name, parent: choice.parent, options, install, git: choice.git });
    } catch (err) {
      running = false;
      backdrop.classList.remove('busy');
      steps.querySelector('li.current')?.classList.replace('current', 'failed');
      const div = document.createElement('div');
      div.className = 'error';
      div.textContent = cleanError(err);
      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
      $np('.np-stop').hidden = true;
      $np('.np-back').hidden = false;
      return;
    }
    running = false;
    backdrop.classList.remove('busy');
    backdrop.hidden = true;

    // Le projet est créé : on l'ouvre, avec son fichier principal.
    await showRoot(result.root);
    if (result.mainFile) await openFile(result.mainFile, baseName(result.mainFile), { preview: false });
    if (result.hasDev && choice.dev) {
      await scriptsPanel.run(result.root, 'dev'); // affiché comme « en cours » dans le panneau Scripts
      notify.success(`${name} est prêt. Le serveur de développement démarre dans le terminal : Ctrl+clic sur l'adresse http://localhost:… pour l'ouvrir.`);
    } else {
      notify.success(`${name} est prêt.`);
    }
    if (result.gitWarning) notify.warning(result.gitWarning);
  });

  return { open };
})();
