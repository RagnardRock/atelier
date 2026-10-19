// Interface de l'IDE : arborescence, colonnes d'éditeurs, onglets, config.
// Tout accès au disque passe par window.atelier (défini dans preload.js).
//
// Vocabulaire :
// - un "fichier" ouvert = un modèle Monaco (le texte) + sa version enregistrée. Il est partagé :
//   le même fichier affiché dans deux colonnes, c'est le même texte, modifié aux deux endroits.
// - une "colonne" (group) = une barre d'onglets + un éditeur Monaco. Il peut y en avoir autant
//   qu'on veut côte à côte.
// - un "onglet" = un fichier dans une colonne. Il peut être en aperçu (italique) : il sera alors
//   remplacé par le prochain fichier ouvert d'un simple clic.

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
  files: new Map(),    // chemin -> { path, name, model, savedVersion }
  groups: [],          // colonnes, de gauche à droite
  activeGroup: null,
  dragged: null,       // onglet en cours de glisser-déposer
};

const $ = (sel) => document.querySelector(sel);

require.config({ paths: { vs: `${MONACO_BASE}vs` } });
// Interface de Monaco en français (menu clic droit, recherche…), puis l'éditeur lui-même.
require(['vs/nls.messages.fr'], () => require(['vs/editor/editor.main'], start));

// Fichiers .vue et .svelte : Monaco ne les connaît pas. Ce sont du HTML avec <script> et <style>,
// donc on leur donne la coloration du HTML, sous leur propre nom (pour que la vérification HTML,
// faite pour des pages complètes, ne les souligne pas à tort).
function registerComponentLanguages() {
  const html = monaco.languages.getLanguages().find((l) => l.id === 'html');
  for (const [id, alias] of [['vue', 'Vue'], ['svelte', 'Svelte']]) {
    monaco.languages.register({ id, extensions: [`.${id}`], aliases: [alias] });
    html?.loader?.().then(({ conf, language }) => {
      monaco.languages.setLanguageConfiguration(id, conf);
      monaco.languages.setMonarchTokensProvider(id, language);
    });
  }
}

async function start() {
  // Classe de plateforme : sur macOS, la barre de titre laisse la place aux boutons à gauche.
  document.body.classList.add(`platform-${window.atelier.platform}`);
  defineThemes();
  registerComponentLanguages();
  formatter.init(); // Prettier pour Maj+Alt+F (format.js)
  vueTools.init(); // Volar pour les fichiers .vue (vue.js)
  state.configPath = await window.atelier.getConfigPath();
  await loadConfig();
  createGroup();
  applyConfig();

  // Raccourcis gérés dans la page (Ctrl+J et Ctrl+Alt+D passent par main.js, voir onShortcut).
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key === 'o') { e.preventDefault(); openFolder(); }
    if (key === 's') { e.preventDefault(); saveActive(); }
    if (key === 'w' && !e.target.closest('#terminal-panel')) {
      e.preventDefault();
      const tab = state.activeGroup.active;
      if (tab) closeTab(tab);
    }
  });

  window.atelier.onShortcut((action) => {
    if (action === 'toggleTerminal') terminalPanel.toggle();
    if (action === 'splitEditor') splitEditor();
    if (action === 'closeColumn') mergeColumn(state.activeGroup);
    if (action === 'newProject') newProject.open();
    if (action === 'toggleClaude') claudePanel.toggle();
  });

  $('#btn-open').onclick = openFolder;
  $('#welcome-open').onclick = openFolder;
  $('#welcome-new').onclick = () => newProject.open();
  $('#btn-new-project').onclick = () => newProject.open();
  $('#btn-split').onclick = splitEditor;
  $('#menu-terminal').onclick = () => {
    terminalPanel.create($('#term-profile').value, state.selectedDir || state.root)
      .catch((err) => notify.error(err.message));
  };
  $('#btn-new-file').onclick = () => startCreate('file');
  $('#btn-new-folder').onclick = () => startCreate('folder');
  $('#btn-refresh').onclick = () => state.root && refreshFolder(state.root);
  $('#menu-new-file').onclick = () => startCreate('file');
  $('#menu-new-folder').onclick = () => startCreate('folder');
  // Clic droit dans le vide de l'arborescence : créer à la racine.
  $('#tree').oncontextmenu = (e) => {
    if (!state.root || e.target.closest('.node')) return;
    e.preventDefault();
    selectDir(state.root);
    state.menuEntry = null;
    showTreeMenu(e.clientX, e.clientY);
  };
  $('#btn-config').onclick = () => settings.open();
  setupSplitDropzone();

  // Dossiers récents sur l'écran d'accueil, et réouverture du dernier dossier.
  const recents = await window.atelier.recentFolders().catch(() => []);
  renderRecents(recents);
  if (state.config.reopenLastFolder && recents.length > 0) {
    await openRecent(recents[0]);
  }
}

// Thèmes de l'éditeur : ceux de Monaco, avec le fond et le curseur accordés à l'interface.
function defineThemes() {
  const accent = (state.config && state.config.accentColor) || '#e0a526';
  monaco.editor.defineTheme('atelier-dark', {
    base: 'vs-dark', inherit: true, rules: [],
    colors: {
      'editor.background': '#1f1f1f',
      'editorCursor.foreground': accent,
      'editor.lineHighlightBackground': '#2a2a2a',
      'editorLineNumber.activeForeground': '#cccccc',
      'editorGutter.background': '#1f1f1f',
    },
  });
  // Verre dépoli : fond transparent, l'éditeur laisse voir la plaque de verre derrière lui.
  monaco.editor.defineTheme('atelier-glass', {
    base: 'vs-dark', inherit: true, rules: [],
    colors: {
      'editor.background': '#00000000',
      'editorGutter.background': '#00000000',
      'minimap.background': '#00000000',
      'editorOverviewRuler.background': '#00000000',
      'editorOverviewRuler.border': '#00000000',
      'scrollbar.shadow': '#00000000',
      'editorStickyScroll.background': '#16171d',
      'editorCursor.foreground': accent,
      'editor.lineHighlightBackground': '#ffffff08',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#5a5d6b',
      'editorLineNumber.activeForeground': '#d4d4d4',
      'editorWidget.background': '#1c1d24',
      'editorSuggestWidget.background': '#1c1d24',
      'editorHoverWidget.background': '#1c1d24',
    },
  });
  monaco.editor.defineTheme('atelier-light', {
    base: 'vs', inherit: true, rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorCursor.foreground': accent,
      'editor.lineHighlightBackground': '#f5f5f5',
    },
  });
}

// --- Config ---

async function loadConfig() {
  const { config, error } = await window.atelier.getConfig();
  state.config = config;
  if (error) notify.warning(error);
  return !error;
}

function editorOptions() {
  const c = state.config;
  return {
    fontFamily: c.fontFamily,
    fontSize: c.fontSize,
    tabSize: c.tabSize,
    wordWrap: c.wordWrap,
    minimap: { enabled: c.minimap },
  };
}

function applyConfig() {
  const c = state.config;
  const light = c.theme === 'vs';
  defineThemes(); // la couleur d'accent a pu changer
  // "vs-dark" et "vs" deviennent nos versions ; tout autre thème Monaco ("hc-black"…) est gardé tel quel.
  // Le verre dépoli n'existe qu'en thème sombre.
  const glass = Boolean(c.glass) && c.theme === 'vs-dark';
  monaco.editor.setTheme(glass ? 'atelier-glass' : c.theme === 'vs-dark' ? 'atelier-dark' : light ? 'atelier-light' : c.theme);
  document.body.classList.toggle('light', light);
  document.body.classList.toggle('glass', glass);
  // main.js règle les boutons de la fenêtre et, si demandé, le flou de Windows 11.
  window.atelier.setWindowTheme({ theme: light ? 'light' : 'dark', glass, blur: Boolean(c.windowBlur) })
    .then(({ blur, needsRestart }) => {
      document.body.classList.toggle('window-blur', blur);
      if (needsRestart) askRestartForBlur();
    })
    .catch((err) => notify.error(`Thème de la fenêtre : ${cleanError(err)}`));
  document.documentElement.style.setProperty('--accent', c.accentColor);
  for (const group of state.groups) group.editor.updateOptions(editorOptions());
  for (const file of state.files.values()) lintHtml(file.model); // les règles HTML ont pu changer
  terminalPanel.applyConfig(c);
  applyEmmet(c.emmet, c.vueTools !== false);
  vueTools.applyConfig(c);
  updateWelcome();
}

// Emmet : en HTML, tape une abréviation comme "ul>li*3" ou "div.carte" et Tab (ou Entrée)
// l'écrit en entier. En CSS, "m10" devient "margin: 10px;". Elle apparaît en tête des suggestions.
// La bibliothèque emmet-monaco-es (chargée dans index.html) ajoute ces suggestions à Monaco.
// Avec l'intelligence Vue (Volar), Emmet est déjà fourni par Volar dans le <template> des .vue :
// on ne l'ajoute pas une deuxième fois (il proposerait aussi ses abréviations dans le <script>).
let emmetDispose = null;
let emmetLanguages = '';
function applyEmmet(enabled, vueTools = false) {
  const htmlLanguages = ['html', 'php', 'svelte', ...(vueTools ? [] : ['vue'])];
  if (emmetDispose && emmetLanguages !== htmlLanguages.join()) { emmetDispose(); emmetDispose = null; }
  emmetLanguages = htmlLanguages.join();
  if (enabled && !emmetDispose && window.emmetMonaco) {
    // tokenizer "standard" : Emmet passe par l'API publique de Monaco pour savoir si le curseur est
    // dans du code (et pas dans un commentaire ou une chaîne). Le mode par défaut lit des
    // morceaux internes de Monaco et plantait sur une ligne pas encore colorée.
    const options = { tokenizer: 'standard' };
    const html = emmetMonaco.emmetHTML(monaco, htmlLanguages, options);
    const css = emmetMonaco.emmetCSS(monaco, ['css', 'scss', 'less'], options);
    emmetDispose = () => { html(); css(); };
  } else if (!enabled && emmetDispose) {
    emmetDispose();
    emmetDispose = null;
  }
}

// Le flou Windows 11 ne s'active qu'au démarrage de la fenêtre (voir main.js) : on propose de
// redémarrer, une seule fois par session.
function askRestartForBlur() {
  if (askRestartForBlur.asked) return;
  askRestartForBlur.asked = true;
  notify.info("Le flou Windows 11 s'activera au prochain démarrage d'Atelier.", {
    actions: [{ label: 'Redémarrer maintenant', run: () => {
      const unsaved = [...state.files.values()].filter(isDirty).map((f) => f.name);
      if (unsaved.length && !confirm(`Ces fichiers ne sont pas enregistrés :\n\n${unsaved.join('\n')}\n\nRedémarrer quand même ?`)) return;
      window.atelier.relaunch();
    } }],
  });
}

// --- Arborescence ---

// Dossiers dépliés : on s'en souvient pour les garder ouverts quand l'arborescence est rafraîchie.
state.expanded = new Set();
// Dossier sélectionné : c'est là que "Nouveau fichier" / "Nouveau dossier" créent par défaut.
state.selectedDir = null;

async function openFolder() {
  const folder = await window.atelier.openFolder().catch((err) => notify.error(cleanError(err)));
  if (folder) await showRoot(folder);
}

async function openRecent(folder) {
  const opened = await window.atelier.openRecentFolder(folder).catch((err) => notify.error(cleanError(err)));
  if (opened) await showRoot(opened);
}

// Le fichier `file` est-il dans le dossier `folder` ? (Sous Windows, sans tenir compte des majuscules.)
function isInside(file, folder) {
  const norm = (p) => {
    const s = p.replace(/\\/g, '/').replace(/\/+$/, '');
    return window.atelier.platform === 'win32' ? s.toLowerCase() : s;
  };
  return norm(file).startsWith(`${norm(folder)}/`);
}

// Nom du dossier sans le chemin : "D:\Projets\mon-site" -> "mon-site".
const baseName = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p;

// Affiche le dossier ouvert (choisi dans la boîte de dialogue ou dans les récents).
async function showRoot(folder) {
  // Les onglets d'un autre dossier se ferment : main.js n'autorise l'écriture que dans le dossier
  // ouvert, ils ne pourraient plus être enregistrés. (Un fichier modifié demande confirmation.)
  for (const tab of state.groups.flatMap((g) => g.tabs)) {
    if (tab.file.path !== state.configPath && !isInside(tab.file.path, folder)) closeTab(tab);
  }
  state.root = folder;
  state.expanded.clear();
  state.selectedDir = folder;
  $('#folder-name').textContent = baseName(folder);
  $('#folder-name').title = folder;
  $('#tree-title').textContent = baseName(folder);
  $('#tree-title').title = folder;
  $('#status-folder span').textContent = baseName(folder);
  $('#status-folder').title = folder;
  $('#tree-toolbar').hidden = false;
  await refreshFolder(folder);
  renderRecents(await window.atelier.recentFolders().catch(() => []));
  if (state.config.restoreTabs) await restoreSession(); // session.js
  document.dispatchEvent(new Event('root-changed')); // le panneau Scripts relit les package.json
}

// Liste des dossiers récents sur l'écran d'accueil (clic = rouvrir).
function renderRecents(recents) {
  const el = $('#welcome-recents');
  el.innerHTML = '';
  const others = recents.filter((f) => f !== state.root).slice(0, 5);
  if (others.length === 0) return;
  const title = document.createElement('h2');
  title.textContent = 'Récents';
  el.appendChild(title);
  for (const folder of others) {
    const button = document.createElement('button');
    button.className = 'recent';
    button.title = folder;
    button.innerHTML = '<i class="codicon codicon-folder"></i><span class="name"></span><span class="path"></span>';
    button.querySelector('.name').textContent = baseName(folder);
    button.querySelector('.path').textContent = folder;
    button.onclick = () => openRecent(folder);
    el.appendChild(button);
  }
}

// Conteneur HTML qui affiche le contenu d'un dossier (la racine, ou le bloc sous une ligne de dossier).
function containerOf(dir) {
  if (dir === state.root) return $('#tree-root');
  return [...document.querySelectorAll('#tree .children')].find((c) => c.dataset.dir === dir) || null;
}

// Relit un dossier sur le disque et réaffiche son contenu (après une création, ou via ⟳).
async function refreshFolder(dir) {
  const container = containerOf(dir);
  if (!container) return;
  const depth = dir === state.root ? 0 : Number(container.dataset.depth);
  container.innerHTML = '';
  await renderFolder(dir, container, depth);
  refreshStatus();
}

// Affiche le contenu d'un dossier. Les sous-dossiers ne sont lus qu'au premier dépliage.
async function renderFolder(dir, container, depth) {
  let entries;
  try {
    entries = await window.atelier.readFolder(dir);
  } catch (err) {
    return notify.error(`Impossible de lire le dossier ${dir} : ${cleanError(err)}`);
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'node';
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.dataset.path = entry.path;
    row.dataset.dir = entry.isDir ? entry.path : dir; // dossier où créer si on part de cette ligne
    row.dataset.parent = dir;
    row.dataset.name = entry.name;
    if (entry.isDir) row.dataset.isDir = '1';
    row.draggable = true; // glisser sur un dossier pour l'y déplacer (fileops.js)
    row.innerHTML = '<i class="chevron codicon"></i><span class="label"></span>';
    const type = entry.isDir ? { icon: 'folder', color: 'var(--folder)' } : fileIcon(entry.name);
    const icon = iconElement(type.icon, type.color);
    row.querySelector('.label').before(icon);
    row.querySelector('.label').textContent = entry.name;
    if (entry.isDir) row.firstChild.classList.add('codicon-chevron-right');
    row.oncontextmenu = (e) => { e.preventDefault(); selectDir(row.dataset.dir); state.menuEntry = entry.path; showTreeMenu(e.clientX, e.clientY); };
    container.appendChild(row);

    if (entry.isDir) {
      const children = document.createElement('div');
      children.className = 'children';
      children.dataset.dir = entry.path;
      children.dataset.depth = depth + 1;
      container.appendChild(children);
      let loaded = false;
      const toggle = async (open) => {
        if (open && !loaded) { await renderFolder(entry.path, children, depth + 1); loaded = true; }
        children.classList.toggle('open', open);
        row.firstChild.classList.toggle('codicon-chevron-right', !open);
        row.firstChild.classList.toggle('codicon-chevron-down', open);
        icon.classList.toggle('codicon-folder', !open);
        icon.classList.toggle('codicon-folder-opened', open);
        if (open) state.expanded.add(entry.path); else state.expanded.delete(entry.path);
      };
      row.onclick = () => { selectDir(entry.path); state.treeEntry = entry.path; toggle(!children.classList.contains('open')); };
      row.reveal = () => toggle(true);
      if (state.expanded.has(entry.path)) await toggle(true);
    } else {
      // Clic : aperçu. Double-clic ou clic molette : onglet permanent.
      // Le clic simple laisse le clavier dans l'arborescence (F2, Suppr…), comme dans VS Code.
      row.onclick = async () => { selectDir(dir); state.treeEntry = entry.path; await openFile(entry.path, entry.name); $('#tree').focus(); };
      row.ondblclick = () => openFile(entry.path, entry.name, { preview: false });
      row.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // pas de défilement auto
      row.addEventListener('auxclick', (e) => {
        if (e.button === 1) openFile(entry.path, entry.name, { preview: false });
      });
    }
  }
}

function selectDir(dir) {
  state.selectedDir = dir;
  document.querySelectorAll('#tree .node').forEach((n) => n.classList.toggle('selected', n.dataset.path === dir));
}

// --- Création de fichiers et de dossiers ---
// Un champ de saisie apparaît en haut du dossier cible : Entrée pour créer, Échap pour annuler.
// On peut taper un chemin comme "css/style.css" : les sous-dossiers sont créés au passage.

async function startCreate(kind, dir = state.selectedDir || state.root) {
  if (!state.root) return notify.info("Ouvre d'abord un dossier");
  // Le dossier cible doit être déplié pour qu'on voie le champ.
  const dirRow = document.querySelector(`#tree .node[data-path="${CSS.escape(dir)}"]`);
  if (dirRow && dirRow.reveal) await dirRow.reveal();
  const container = containerOf(dir);
  if (!container) return;
  document.querySelector('#tree .new-entry')?.remove();

  const depth = dir === state.root ? 0 : Number(container.dataset.depth);
  const row = document.createElement('div');
  row.className = 'node new-entry';
  row.style.paddingLeft = `${8 + depth * 14}px`;
  row.innerHTML = `<i class="chevron codicon"></i><i class="codicon codicon-${kind === 'folder' ? 'folder' : 'file'} file-icon"></i><input spellcheck="false">`;
  const input = row.querySelector('input');
  input.placeholder = kind === 'folder' ? 'nom-du-dossier' : 'nom-du-fichier.html';
  container.prepend(row);
  input.focus();

  let done = false;
  const finish = async (create) => {
    if (done) return;
    done = true;
    const name = input.value.trim().replace(/\\/g, '/');
    row.remove();
    if (!create || !name) return;
    const target = await window.atelier.joinPath(dir, ...name.split('/'));
    try {
      if (kind === 'folder') await window.atelier.createFolder(target);
      else await window.atelier.createFile(target);
    } catch (err) {
      return notify.error(`Création impossible : ${cleanError(err)}`);
    }
    // On déplie le chemin créé (ex. css/ pour css/style.css), puis on rafraîchit.
    const parts = name.split('/');
    let current = dir;
    for (const part of parts.slice(0, kind === 'folder' ? parts.length : -1)) {
      current = await window.atelier.joinPath(current, part);
      state.expanded.add(current);
    }
    await refreshFolder(dir);
    if (kind === 'file') openFile(target, parts[parts.length - 1], { preview: false });
    else selectDir(target);
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
  input.onblur = () => finish(true);
}

// Menu clic droit de l'arborescence.
function showTreeMenu(x, y) {
  const menu = $('#tree-menu');
  // Renommer et Supprimer n'existent que sur un fichier ou un dossier, pas dans le vide.
  for (const el of menu.querySelectorAll('.entry-only')) el.hidden = !state.menuEntry;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.hidden = false;
}
document.addEventListener('click', () => { $('#tree-menu').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#tree-menu').hidden = true; });

// --- Fichiers ouverts (partagés entre colonnes) ---

// Lectures en cours : un double-clic déclenche aussi un clic, donc deux ouvertures du même
// fichier presque en même temps. La seconde attend la première au lieu de le lire deux fois.
const pendingFiles = new Map();

function getFile(path, name) {
  if (state.files.has(path)) return Promise.resolve(state.files.get(path));
  if (!pendingFiles.has(path)) {
    pendingFiles.set(path, loadFile(path, name).finally(() => pendingFiles.delete(path)));
  }
  return pendingFiles.get(path);
}

async function loadFile(path, name) {
  // Image ou fichier binaire (PSD…) : affiché à part, pas lu comme du texte (voir media.js).
  const media = await mediaFile(path, name);
  if (media) {
    state.files.set(path, media);
    return media;
  }
  const content = await window.atelier.readFile(path);
  // L'URI donne l'extension à Monaco, qui choisit la coloration (js, css, html, json…).
  const model = monaco.editor.createModel(content, undefined, monaco.Uri.file(path));
  const file = { path, name, model, savedVersion: model.getAlternativeVersionId() };
  // Dès qu'on modifie un fichier, ses onglets deviennent permanents et affichent "●".
  model.onDidChangeContent(() => {
    for (const tab of tabsOf(file)) {
      if (isDirty(file)) pin(tab);
      refreshTab(tab);
    }
  });
  state.files.set(path, file);
  watchHtml(model);
  return file;
}

// --- Vérification du HTML (HTMLHint) ---
// Monaco colore le HTML mais ne le vérifie pas : HTMLHint analyse le texte à chaque pause de
// frappe, et chaque problème devient un soulignement (rouge = erreur, jaune = avertissement).
// Les règles se règlent dans "htmlRules" de la config, par exemple { "doctype-first": false }.

const htmlhint = window.HTMLHint && (window.HTMLHint.HTMLHint || window.HTMLHint);

function lintHtml(model) {
  if (!htmlhint || model.isDisposed() || model.getLanguageId() !== 'html') return;
  const rules = { ...htmlhint.defaultRuleset, ...state.config.htmlRules };
  const text = model.getValue();
  // Un fichier vide (qu'on vient de créer) n'est pas une erreur : pas de « doctype manquant ».
  const problems = text.trim() ? htmlhint.verify(text, rules) : [];
  monaco.editor.setModelMarkers(model, 'htmlhint', problems.map((p) => ({
    startLineNumber: p.line,
    startColumn: p.col,
    endLineNumber: p.line,
    endColumn: p.col + Math.max(p.raw ? p.raw.length : 1, 1),
    message: `${p.message} (${p.rule.id})`,
    severity: p.type === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
  })));
}

function watchHtml(model) {
  let timer;
  model.onDidChangeContent(() => {
    clearTimeout(timer);
    timer = setTimeout(() => lintHtml(model), 300);
  });
  lintHtml(model);
}

function tabsOf(file) {
  return state.groups.flatMap((g) => g.tabs.filter((t) => t.file === file));
}

function isDirty(file) {
  return file.model.getAlternativeVersionId() !== file.savedVersion;
}

// Plus aucun onglet n'affiche ce fichier : on libère sa mémoire.
function releaseIfUnused(file) {
  if (tabsOf(file).length > 0) return;
  file.model.dispose();
  state.files.delete(file.path);
}

// --- Colonnes ---

function createGroup(afterGroup = null) {
  const el = document.createElement('div');
  el.className = 'group';
  el.innerHTML = '<nav class="tabs"></nav><button class="group-close icon-button" title="Fermer la colonne (Ctrl+Alt+W) : ses onglets passent dans la colonne voisine"><i class="codicon codicon-close"></i></button>'
    + '<div class="editor-area"><div class="editor"></div><div class="drop-target"></div></div>';

  const editor = monaco.editor.create(el.querySelector('.editor'), {
    automaticLayout: true, // se redimensionne tout seul avec la fenêtre
    model: null,
    ...editorOptions(),
  });
  const group = { el, tabsEl: el.querySelector('.tabs'), editor, tabs: [], active: null, viewStates: new Map() };

  editor.onDidFocusEditorText(() => setActiveGroup(group));
  editor.onDidChangeCursorPosition(({ position }) => {
    if (state.activeGroup === group) $('#status-pos').textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
  });
  el.addEventListener('mousedown', () => setActiveGroup(group));
  el.querySelector('.group-close').onclick = () => mergeColumn(group);
  setupGroupDrop(group);

  const groupsEl = $('#groups');
  if (afterGroup) {
    afterGroup.el.after(el);
    state.groups.splice(state.groups.indexOf(afterGroup) + 1, 0, group);
  } else {
    groupsEl.appendChild(el);
    state.groups.push(group);
  }
  setActiveGroup(group);
  return group;
}

function removeGroup(group) {
  if (state.groups.length === 1) return; // on garde toujours au moins une colonne
  const i = state.groups.indexOf(group);
  state.groups.splice(i, 1);
  group.editor.dispose();
  group.el.remove();
  if (state.activeGroup === group) setActiveGroup(state.groups[Math.max(0, i - 1)]);
}

function setActiveGroup(group) {
  if (state.activeGroup === group) return;
  state.activeGroup = group;
  for (const g of state.groups) g.el.classList.toggle('active-group', g === group);
  refreshStatus();
}

// Ctrl+Alt+D : ouvre le fichier actif dans une nouvelle colonne à droite.
function splitEditor() {
  const from = state.activeGroup;
  const tab = from.active;
  const group = createGroup(from);
  if (tab) addTab(group, tab.file, { preview: false });
}

// Ctrl+Alt+W (ou la croix en haut à droite de la colonne) : l'inverse de diviser.
// Les onglets de la colonne rejoignent la colonne de gauche (ou de droite pour la première),
// rien n'est fermé ni perdu, même les fichiers non enregistrés.
function mergeColumn(group) {
  if (state.groups.length === 1) return; // une seule colonne : rien à fusionner
  const i = state.groups.indexOf(group);
  const target = state.groups[i > 0 ? i - 1 : 1];
  const active = group.active && group.active.file;
  // On vide l'éditeur d'abord : sinon chaque départ d'onglet y réafficherait le suivant pour rien.
  group.active = null;
  group.editor.setModel(null);
  showMedia(group, null);
  // show: false : on n'affiche pas chaque onglet au passage, seulement celui qui était actif, à la fin.
  for (const tab of [...group.tabs]) moveTab(tab, target, target.tabs.length, { show: false }); // moveTab retire la colonne une fois vide
  if (state.groups.includes(group)) removeGroup(group); // colonne déjà vide
  const keep = target.tabs.find((t) => t.file === active) || target.active || target.tabs[0];
  if (keep) activate(keep);
  setActiveGroup(target);
}

// --- Onglets ---

async function openFile(path, name, { preview = true, group = state.activeGroup } = {}) {
  let file;
  try {
    file = await getFile(path, name);
  } catch (err) {
    return notify.error(`Impossible d'ouvrir ${name} : ${cleanError(err)}`);
  }
  const existing = group.tabs.find((t) => t.file === file);
  if (existing) {
    if (!preview) pin(existing);
    return activate(existing);
  }
  // Un clic simple remplace l'onglet d'aperçu de la colonne, s'il y en a un.
  const previewTab = preview && group.tabs.find((t) => t.preview);
  if (previewTab) {
    const old = previewTab.file;
    previewTab.file = file;
    refreshTab(previewTab);
    releaseIfUnused(old);
    return activate(previewTab);
  }
  addTab(group, file, { preview });
}

function addTab(group, file, { preview = false, index = group.tabs.length, show = true } = {}) {
  const tab = { file, group, preview, el: document.createElement('div') };
  tab.el.className = 'tab';
  tab.el.draggable = true;
  tab.el.innerHTML = '<i class="codicon file-icon"></i><span class="name"></span><span class="close" title="Fermer (Ctrl+W)"><i class="codicon codicon-close"></i></span>';
  tab.el.onclick = () => activate(tab);
  tab.el.ondblclick = () => pin(tab);
  tab.el.querySelector('.close').onclick = (e) => { e.stopPropagation(); closeTab(tab); };
  // Clic molette sur un onglet : le fermer.
  tab.el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  tab.el.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(tab); });
  setupTabDrag(tab);

  group.tabs.splice(index, 0, tab);
  renderTabs(group);
  refreshTab(tab);
  if (show) activate(tab);
  updateWelcome();
  return tab;
}

function renderTabs(group) {
  for (const tab of group.tabs) group.tabsEl.appendChild(tab.el); // appendChild déplace : l'ordre suit le tableau
  document.dispatchEvent(new Event('tabs-changed')); // session.js retient les onglets ouverts
}

function refreshTab(tab) {
  tab.el.querySelector('.name').textContent = tab.file.name;
  tab.el.title = tab.file.path;
  tab.el.classList.toggle('preview', tab.preview);
  tab.el.classList.toggle('dirty', isDirty(tab.file)); // le style affiche ● à la place de la croix
  const type = fileIcon(tab.file.name);
  const icon = tab.el.querySelector('.file-icon');
  icon.className = `codicon codicon-${type.icon} file-icon`;
  icon.style.color = type.color;
}

function pin(tab) {
  if (!tab.preview) return;
  tab.preview = false;
  refreshTab(tab);
}

function activate(tab) {
  const group = tab.group;
  // On mémorise la position du curseur et du défilement du fichier qu'on quitte.
  if (group.active && group.active !== tab) group.viewStates.set(group.active.file.path, group.editor.saveViewState());
  group.active = tab;
  group.editor.setModel(tab.file.model);
  showMedia(group, tab.file);
  const viewState = group.viewStates.get(tab.file.path);
  if (viewState) group.editor.restoreViewState(viewState);
  group.editor.focus();
  for (const t of group.tabs) t.el.classList.toggle('active', t === tab);
  setActiveGroup(group);
  refreshStatus();
  document.dispatchEvent(new CustomEvent('tab-activated', { detail: tab })); // l'aperçu suit le fichier HTML actif
}

function refreshStatus() {
  const tab = state.activeGroup && state.activeGroup.active;
  document.querySelectorAll('.node').forEach((n) => n.classList.toggle('active', !!tab && n.dataset.path === tab.file.path));
  $('#status-file').textContent = tab ? tab.file.path : '';
  $('#status-lang').textContent = tab ? tab.file.model.getLanguageId() : '';
  if (!tab) $('#status-pos').textContent = '';
}

// Retire l'onglet de sa colonne, sans libérer le fichier (utilisé pour fermer et pour déplacer).
function detachTab(tab) {
  const group = tab.group;
  document.dispatchEvent(new Event('tabs-changed'));
  const i = group.tabs.indexOf(tab);
  group.tabs.splice(i, 1);
  tab.el.remove();
  group.viewStates.delete(tab.file.path);
  if (group.active === tab) {
    const next = group.tabs[i] || group.tabs[i - 1];
    if (next) activate(next);
    else { group.active = null; group.editor.setModel(null); showMedia(group, null); refreshStatus(); }
  }
}

function closeTab(tab) {
  const lastView = tabsOf(tab.file).length === 1;
  if (lastView && isDirty(tab.file) && !confirm(`${tab.file.name} a des modifications non enregistrées. Fermer quand même ?`)) return;
  const group = tab.group;
  detachTab(tab);
  releaseIfUnused(tab.file);
  if (group.tabs.length === 0) removeGroup(group);
  updateWelcome();
}

// Déplace un onglet (même colonne = changer l'ordre, autre colonne = l'y envoyer).
function moveTab(tab, target, index, { show = true } = {}) {
  const source = tab.group;
  if (source === target) {
    const from = source.tabs.indexOf(tab);
    source.tabs.splice(from, 1);
    source.tabs.splice(from < index ? index - 1 : index, 0, tab);
    renderTabs(source);
    return activate(tab);
  }
  // Le fichier est déjà ouvert dans la colonne cible : on y bascule simplement.
  const already = target.tabs.find((t) => t.file === tab.file);
  detachTab(tab);
  if (already) { if (show) activate(already); }
  else addTab(target, tab.file, { preview: tab.preview, index, show });
  if (source.tabs.length === 0) removeGroup(source);
}

function updateWelcome() {
  const hasTabs = state.groups.some((g) => g.tabs.length > 0);
  document.body.classList.toggle('has-tabs', hasTabs);
}

// --- Glisser-déposer des onglets ---

function setupTabDrag(tab) {
  tab.el.addEventListener('dragstart', (e) => {
    state.dragged = tab;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.file.path);
    document.body.classList.add('dragging-tab');
  });
  tab.el.addEventListener('dragend', () => {
    state.dragged = null;
    document.body.classList.remove('dragging-tab');
    document.querySelectorAll('.drop-before, .drop-after, .drop-hover').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-hover'));
  });
}

// Position d'insertion dans une barre d'onglets selon la souris (avant / après le milieu de chaque onglet).
function dropIndex(group, x) {
  const i = group.tabs.findIndex((t) => {
    const r = t.el.getBoundingClientRect();
    return x < r.left + r.width / 2;
  });
  return i === -1 ? group.tabs.length : i;
}

function setupGroupDrop(group) {
  // Lâcher sur la barre d'onglets : à l'endroit indiqué par le trait.
  group.tabsEl.addEventListener('dragover', (e) => {
    if (!state.dragged) return;
    e.preventDefault();
    const index = dropIndex(group, e.clientX);
    group.tabs.forEach((t, i) => {
      t.el.classList.toggle('drop-before', i === index);
      t.el.classList.toggle('drop-after', index === group.tabs.length && i === group.tabs.length - 1);
    });
  });
  group.tabsEl.addEventListener('dragleave', () => {
    group.tabs.forEach((t) => t.el.classList.remove('drop-before', 'drop-after'));
  });
  group.tabsEl.addEventListener('drop', (e) => {
    if (!state.dragged) return;
    e.preventDefault();
    moveTab(state.dragged, group, dropIndex(group, e.clientX));
  });

  // Lâcher sur l'éditeur : à la fin des onglets de cette colonne.
  const target = group.el.querySelector('.drop-target');
  target.addEventListener('dragover', (e) => {
    if (!state.dragged) return;
    e.preventDefault();
    target.classList.add('drop-hover');
  });
  target.addEventListener('dragleave', () => target.classList.remove('drop-hover'));
  target.addEventListener('drop', (e) => {
    if (!state.dragged) return;
    e.preventDefault();
    moveTab(state.dragged, group, group.tabs.length);
  });
}

// Zone "Nouvelle colonne" au bord droit, visible pendant qu'on glisse un onglet.
function setupSplitDropzone() {
  const zone = $('#split-dropzone');
  zone.addEventListener('dragover', (e) => {
    if (!state.dragged) return;
    e.preventDefault();
    zone.classList.add('drop-hover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drop-hover'));
  zone.addEventListener('drop', (e) => {
    if (!state.dragged) return;
    e.preventDefault();
    zone.classList.remove('drop-hover');
    const tab = state.dragged;
    const group = createGroup(state.groups[state.groups.length - 1]);
    moveTab(tab, group, 0);
  });
}

// --- Enregistrement ---

async function saveActive() {
  const tab = state.activeGroup && state.activeGroup.active;
  if (!tab) return;
  const file = tab.file;
  if (file.kind) return; // image ou fichier binaire : rien à enregistrer (surtout pas un texte vide !)
  // Mise en forme Prettier avant d'enregistrer, si l'option est activée (format.js).
  if (state.config.formatOnSave && formatter.supports(file.model)) {
    await state.activeGroup.editor.getAction('editor.action.formatDocument')?.run();
  }
  try {
    await window.atelier.writeFile(file.path, file.model.getValue());
  } catch (err) {
    return notify.error(`Échec de l'enregistrement de ${file.name} : ${cleanError(err)}`);
  }
  file.savedVersion = file.model.getAlternativeVersionId();
  file.savedAt = Date.now(); // pour ne pas prendre notre propre enregistrement pour un changement extérieur
  for (const t of tabsOf(file)) refreshTab(t);
  flash(`Enregistré : ${file.name}`);
  document.dispatchEvent(new CustomEvent('file-saved', { detail: file })); // le panneau Git se met à jour

  // Enregistrer la config l'applique tout de suite (ou explique ce qui ne va pas).
  if (file.path === state.configPath) {
    const ok = await loadConfig();
    applyConfig();
    if (ok) notify.success('Config appliquée');
  }
}

// Un fichier a été modifié sur le disque par quelqu'un d'autre que l'éditeur (Claude, par exemple) :
// on recharge son texte s'il est ouvert. Le rechargement passe par l'historique de Monaco,
// donc Ctrl+Z annule la modification. S'il a des changements non enregistrés, on ne touche à rien.
async function reloadFromDisk(path, { quiet = false } = {}) {
  const file = state.files.get(path);
  if (!file) return;
  if (file.kind) return refreshMedia(file);
  if (isDirty(file)) {
    return notify.warning(`${file.name} a été modifié sur le disque, mais tu as des modifications non enregistrées dedans : je n'y touche pas.`);
  }
  let content;
  try {
    content = await window.atelier.readFile(path);
  } catch (err) {
    if (quiet) return; // fichier supprimé ou déplacé entre-temps : son onglet reste tel quel
    return notify.error(`Impossible de relire ${file.name} : ${cleanError(err)}`);
  }
  if (content === file.model.getValue()) return;
  file.model.pushEditOperations([], [{ range: file.model.getFullModelRange(), text: content }], () => null);
  file.savedVersion = file.model.getAlternativeVersionId();
  for (const t of tabsOf(file)) refreshTab(t);
}

// Fichiers modifiés sur le disque par un autre programme (git pull, Claude, Photoshop…) :
// les onglets ouverts sont rechargés (voir reloadFromDisk), et le panneau Git se met à jour.
window.atelier.onFilesChanged((paths) => {
  for (const p of paths) {
    const file = state.files.get(p);
    if (file && Date.now() - (file.savedAt || 0) > 1500) reloadFromDisk(p, { quiet: true });
  }
  document.dispatchEvent(new CustomEvent('files-changed', { detail: paths }));
});

function flash(msg) {
  const el = $('#status-msg');
  el.textContent = msg;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { el.textContent = ''; }, 3000);
}
