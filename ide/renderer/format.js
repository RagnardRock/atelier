// Mise en forme du code avec Prettier : Maj+Alt+F (ou clic droit › Mettre le document en forme).
// Indentation, guillemets, retours à la ligne… sont remis au propre selon les règles de Prettier,
// l'outil le plus utilisé en développement web. Langages : HTML, CSS, SCSS, LESS, JavaScript,
// TypeScript, JSON, Markdown, YAML, et les composants Vue (.vue).
// - La largeur des tabulations vient de tes réglages. Un fichier .prettierrc (en JSON) à la racine
//   du projet est respecté, comme dans VS Code.
// - Option « Mettre en forme à l'enregistrement » (formatOnSave) dans Réglages › Éditeur.
// Prettier n'est chargé qu'à la première mise en forme, pour ne pas ralentir le démarrage.

const formatter = (() => {
  const PRETTIER = '../node_modules/prettier';
  // Langage Monaco -> analyseur Prettier et extensions nécessaires.
  const LANGUAGES = {
    html: { parser: 'html', plugins: ['html', 'postcss', 'babel', 'estree'] },
    css: { parser: 'css', plugins: ['postcss'] },
    scss: { parser: 'scss', plugins: ['postcss'] },
    less: { parser: 'less', plugins: ['postcss'] },
    vue: { parser: 'vue', plugins: ['html', 'postcss', 'babel', 'typescript', 'estree'] },
    javascript: { parser: 'babel', plugins: ['babel', 'estree'] },
    typescript: { parser: 'typescript', plugins: ['typescript', 'estree'] },
    json: { parser: 'json', plugins: ['babel', 'estree'] },
    markdown: { parser: 'markdown', plugins: ['markdown'] },
    yaml: { parser: 'yaml', plugins: ['yaml'] },
  };

  // Les fichiers de Prettier sont au format "UMD" : si le chargeur de Monaco (AMD) est présent, ils
  // s'enregistrent auprès de lui au lieu de créer window.prettier. On le masque le temps du chargement.
  const loaded = new Map();
  function loadScript(src) {
    if (!loaded.has(src)) {
      loaded.set(src, new Promise((resolve, reject) => {
        const define = window.define;
        window.define = undefined;
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => { window.define = define; resolve(); };
        script.onerror = () => { window.define = define; loaded.delete(src); reject(new Error(`Impossible de charger ${src}`)); };
        document.head.appendChild(script);
      }));
    }
    return loaded.get(src);
  }

  async function prettierFor(language) {
    const { plugins } = LANGUAGES[language];
    await loadScript(`${PRETTIER}/standalone.js`);
    // L'ordre compte peu, mais les extensions doivent être chargées l'une après l'autre (window.define).
    for (const name of plugins) await loadScript(`${PRETTIER}/plugins/${name}.js`);
    return plugins.map((name) => window.prettierPlugins[name]);
  }

  // Options du projet (.prettierrc en JSON), relues à chaque fois : tu peux les changer en cours de route.
  async function projectOptions() {
    if (!state.root) return {};
    try {
      const path = await window.atelier.joinPath(state.root, '.prettierrc');
      return JSON.parse(await window.atelier.readFile(path));
    } catch {
      return {}; // pas de fichier, ou format non JSON : réglages par défaut
    }
  }

  async function format(model) {
    const language = model.getLanguageId();
    const plugins = await prettierFor(language);
    const options = { tabWidth: state.config.tabSize, ...(await projectOptions()), parser: LANGUAGES[language].parser, plugins };
    try {
      return await window.prettier.format(model.getValue(), options);
    } catch (err) {
      // Erreur de syntaxe : Prettier indique la ligne. On la montre, sans toucher au fichier.
      const where = err.loc?.start ? ` (ligne ${err.loc.start.line})` : '';
      notify.warning(`Mise en forme impossible${where} : le code contient une erreur de syntaxe.\n${String(err.message).split('\n')[0]}`);
      return null;
    }
  }

  // Appelé au démarrage (app.js), une fois Monaco chargé. Monaco a ses propres formateurs pour
  // HTML, CSS et JSON : on les coupe, sinon ils passeraient avant Prettier.
  function init() {
    const off = (defaults) => defaults?.setModeConfiguration({ ...defaults.modeConfiguration, documentFormattingEdits: false, documentRangeFormattingEdits: false });
    const { css, html, json } = monaco.languages;
    [css?.cssDefaults, css?.scssDefaults, css?.lessDefaults, html?.htmlDefaults, json?.jsonDefaults].forEach(off);
    for (const language of Object.keys(LANGUAGES)) {
      monaco.languages.registerDocumentFormattingEditProvider(language, {
        displayName: 'Prettier',
        async provideDocumentFormattingEdits(model) {
          const text = await format(model);
          if (text === null || text === model.getValue()) return [];
          return [{ range: model.getFullModelRange(), text }];
        },
      });
    }
  }

  const supports = (model) => Boolean(LANGUAGES[model.getLanguageId()]);
  return { init, supports };
})();
