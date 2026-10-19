// Interface de l'IDE : arborescence, onglets, éditeur Monaco, config.
// Tout accès au disque passe par window.atelier (défini dans preload.js).

const MONACO_BASE = new URL('../node_modules/monaco-editor/min/', location.href).href;

// Monaco lance des "workers" (threads séparés) pour l'analyse JS/CSS/HTML/JSON.
// On lui indique où trouver leur script.
self.MonacoEnvironment = {
  getWorkerUrl: () => `${MONACO_BASE}vs/base/worker/workerMain.js`,
};

const state = {
  root: null,          // dossier ouvert
  config: null,        // config perso fusionnée avec les valeurs par défaut
  configPath: null,
  tabs: [],            // { path, name, model, savedVersion, el }
  active: null,        // onglet actif
};

const $ = (sel) => document.querySelector(sel);
let editor;

require.config({ paths: { vs: `${MONACO_BASE}vs` } });
// Interface de Monaco en français (menu clic droit, recherche…), puis l'éditeur lui-même.
require(['vs/nls.messages.fr'], () => require(['vs/editor/editor.main'], start));

async function start() {
  state.config = await window.atelier.getConfig();
  state.configPath = await window.atelier.getConfigPath();

  editor = monaco.editor.create($('#editor'), {
    automaticLayout: true, // se redimensionne tout seul avec la fenêtre
    model: null,
  });
  applyConfig();

  // Raccourcis clavier
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveActive);
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return;
    if (e.key === 'o') { e.preventDefault(); openFolder(); }
    if (e.key === 's') { e.preventDefault(); saveActive(); }
    if (e.key === 'w') { e.preventDefault(); if (state.active) closeTab(state.active); }
  });

  editor.onDidChangeCursorPosition(({ position }) => {
    $('#status-pos').textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
  });

  $('#btn-open').onclick = openFolder;
  $('#btn-config').onclick = () => openFile(state.configPath, 'config.json');
}

// --- Config ---

function applyConfig() {
  const c = state.config;
  monaco.editor.setTheme(c.theme);
  document.body.classList.toggle('light', c.theme === 'vs');
  document.documentElement.style.setProperty('--accent', c.accentColor);
  editor.updateOptions({
    fontFamily: c.fontFamily,
    fontSize: c.fontSize,
    tabSize: c.tabSize,
    wordWrap: c.wordWrap,
    minimap: { enabled: c.minimap },
  });
  terminalPanel.applyConfig(c);
}

// --- Arborescence ---

async function openFolder() {
  const folder = await window.atelier.openFolder();
  if (!folder) return;
  state.root = folder;
  $('#folder-name').textContent = folder;
  const tree = $('#tree');
  tree.innerHTML = '';
  await renderFolder(folder, tree, 0);
}

// Affiche le contenu d'un dossier. Les sous-dossiers ne sont lus qu'au premier clic.
async function renderFolder(dir, container, depth) {
  const entries = await window.atelier.readFolder(dir);
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'node';
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.dataset.path = entry.path;
    row.innerHTML = `<span class="chevron">${entry.isDir ? '▸' : ''}</span><span></span>`;
    row.lastChild.textContent = entry.name;
    container.appendChild(row);

    if (entry.isDir) {
      const children = document.createElement('div');
      children.className = 'children';
      container.appendChild(children);
      let loaded = false;
      row.onclick = async () => {
        if (!loaded) { await renderFolder(entry.path, children, depth + 1); loaded = true; }
        const open = children.classList.toggle('open');
        row.firstChild.textContent = open ? '▾' : '▸';
      };
    } else {
      row.onclick = () => openFile(entry.path, entry.name);
    }
  }
}

// --- Onglets ---

async function openFile(path, name) {
  const existing = state.tabs.find((t) => t.path === path);
  if (existing) return activate(existing);

  let content;
  try {
    content = await window.atelier.readFile(path);
  } catch (err) {
    return flash(`Impossible d'ouvrir ${name} : ${err.message}`);
  }
  // L'URI donne l'extension à Monaco, qui choisit la coloration (js, css, html, json…).
  const model = monaco.editor.createModel(content, undefined, monaco.Uri.file(path));
  const tab = { path, name, model, savedVersion: model.getAlternativeVersionId() };

  tab.el = document.createElement('div');
  tab.el.className = 'tab';
  tab.el.title = path;
  tab.el.innerHTML = '<span class="name"></span><span class="close">×</span>';
  tab.el.querySelector('.name').textContent = name;
  tab.el.onclick = () => activate(tab);
  tab.el.querySelector('.close').onclick = (e) => { e.stopPropagation(); closeTab(tab); };
  $('#tabs').appendChild(tab.el);

  // Point "●" sur l'onglet tant que le fichier a des modifications non enregistrées.
  model.onDidChangeContent(() => refreshDirty(tab));

  state.tabs.push(tab);
  document.body.classList.add('has-tabs');
  activate(tab);
}

function isDirty(tab) {
  return tab.model.getAlternativeVersionId() !== tab.savedVersion;
}

function refreshDirty(tab) {
  tab.el.querySelector('.close').textContent = isDirty(tab) ? '●' : '×';
}

function activate(tab) {
  state.active = tab;
  editor.setModel(tab.model);
  editor.focus();
  for (const t of state.tabs) t.el.classList.toggle('active', t === tab);
  document.querySelectorAll('.node').forEach((n) => n.classList.toggle('active', n.dataset.path === tab.path));
  $('#status-file').textContent = tab.path;
  $('#status-lang').textContent = tab.model.getLanguageId();
}

function closeTab(tab) {
  if (isDirty(tab) && !confirm(`${tab.name} a des modifications non enregistrées. Fermer quand même ?`)) return;
  const i = state.tabs.indexOf(tab);
  state.tabs.splice(i, 1);
  tab.el.remove();
  tab.model.dispose();
  const next = state.tabs[i] || state.tabs[i - 1];
  if (next) return activate(next);
  state.active = null;
  editor.setModel(null);
  document.body.classList.remove('has-tabs');
  $('#status-file').textContent = '';
  $('#status-lang').textContent = '';
}

async function saveActive() {
  const tab = state.active;
  if (!tab) return;
  try {
    await window.atelier.writeFile(tab.path, tab.model.getValue());
  } catch (err) {
    return flash(`Échec de l'enregistrement : ${err.message}`);
  }
  tab.savedVersion = tab.model.getAlternativeVersionId();
  refreshDirty(tab);
  flash(`Enregistré : ${tab.name}`);

  // Enregistrer la config l'applique tout de suite.
  if (tab.path === state.configPath) {
    state.config = await window.atelier.getConfig();
    applyConfig();
    flash('Config appliquée');
  }
}

function flash(msg) {
  const el = $('#status-msg');
  el.textContent = msg;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { el.textContent = ''; }, 3000);
}
