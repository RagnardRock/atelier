// Intelligence Vue dans l'éditeur (fichiers .vue), avec Volar : voir ../vue.js pour le côté Node.
// Ce fichier relie Monaco aux deux moteurs :
// - le texte de chaque fichier .vue ouvert leur est envoyé à chaque modification ;
// - autocomplétion : les composants du projet et leurs props, les directives, le HTML, le CSS,
//   et le JavaScript/TypeScript du <script> comme des {{ expressions }} du <template> ;
//   choisir un composant pas encore importé ajoute son import tout seul ;
// - survol : le type d'une variable, d'une prop, d'une fonction ;
// - erreurs soulignées en rouge : types, propriétés inconnues, props obligatoires oubliées… ;
// - F12 ou Ctrl+clic : aller à la définition (même dans un autre fichier) ;
// - aide sur les paramètres d'une fonction, pendant que tu tapes ( et ,.
// Une petite étiquette « Vue » dans la barre d'état indique que l'analyse est prête.
// Désactivable dans Réglages › Éditeur (« Intelligence Vue »).

const vueTools = (() => {
  const attached = new Map(); // chemin -> { model, timer, version }
  const statusEl = document.querySelector('#status-vue');
  let enabled = false;
  let providers = [];
  let ready = false;

  const isVueModel = (model) => model.getLanguageId() === 'vue' && model.uri.scheme === 'file';
  const fileOf = (model) => model.uri.fsPath;
  const pos = (position) => ({ line: position.lineNumber, column: position.column });

  function setStatus(kind, text) {
    statusEl.hidden = kind === 'off';
    statusEl.className = kind;
    statusEl.innerHTML = kind === 'loading' ? '<i class="codicon codicon-loading"></i>Vue' : '<i class="codicon codicon-check"></i>Vue';
    statusEl.title = text;
  }

  // --- Synchronisation du texte ---

  function attach(model) {
    if (!enabled || !isVueModel(model) || !state.root || !isInside(fileOf(model), state.root)) return;
    const file = fileOf(model);
    if (attached.has(file)) return;
    const entry = { model, timer: null, pending: false };
    attached.set(file, entry);
    if (!ready) setStatus('loading', 'Vue : analyse du projet en cours…');
    window.atelier.vueOpen(file, model.getValue())
      .then(() => refreshDiagnostics(file))
      .catch((err) => { setStatus('off'); notify.warning(`Intelligence Vue indisponible : ${cleanError(err)}`); });
    entry.listener = model.onDidChangeContent(() => {
      entry.pending = true;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => flush(file), 150);
    });
  }

  // Envoie la dernière version du texte (avant chaque question, pour que la réponse soit à jour).
  function flush(file) {
    const entry = attached.get(file);
    if (!entry || !entry.pending) return;
    clearTimeout(entry.timer);
    entry.pending = false;
    window.atelier.vueChange(file, entry.model.getValue()).catch(() => {});
    clearTimeout(entry.diagTimer);
    entry.diagTimer = setTimeout(() => refreshDiagnostics(file), 500);
  }

  function detach(file) {
    const entry = attached.get(file);
    if (!entry) return;
    clearTimeout(entry.timer);
    clearTimeout(entry.diagTimer);
    entry.listener?.dispose();
    attached.delete(file);
    if (!entry.model.isDisposed()) monaco.editor.setModelMarkers(entry.model, 'vue', []);
    window.atelier.vueClose(file).catch(() => {});
  }

  // --- Erreurs ---

  const TS_SEVERITY = { error: 'Error', warning: 'Warning', suggestion: 'Hint', message: 'Info' };
  const LSP_SEVERITY = { 1: 'Error', 2: 'Warning', 3: 'Info', 4: 'Hint' };

  async function refreshDiagnostics(file) {
    const entry = attached.get(file);
    if (!entry) return;
    let result;
    try {
      result = await window.atelier.vueDiagnostics(file);
    } catch {
      return;
    }
    if (!ready) { ready = true; setStatus('ready', 'Vue : analyse prête (Volar). Autocomplétion, types et erreurs dans les fichiers .vue.'); }
    if (attached.get(file) !== entry || entry.model.isDisposed() || entry.pending) return;
    const markers = [];
    const seen = new Set();
    const add = (m) => {
      const key = `${m.startLineNumber}:${m.startColumn}:${m.message}`;
      if (!seen.has(key)) { seen.add(key); markers.push(m); }
    };
    for (const d of result.ts) {
      add({
        startLineNumber: d.start.line, startColumn: d.start.offset, endLineNumber: d.end.line, endColumn: d.end.offset,
        message: d.text, code: d.code ? `ts(${d.code})` : undefined, source: 'TypeScript',
        severity: monaco.MarkerSeverity[TS_SEVERITY[d.category] || 'Error'],
      });
    }
    for (const d of result.lsp) {
      add({
        startLineNumber: d.range.start.line + 1, startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1, endColumn: d.range.end.character + 1,
        message: d.message, code: d.code !== undefined ? String(d.code) : undefined, source: d.source || 'Vue',
        severity: monaco.MarkerSeverity[LSP_SEVERITY[d.severity] || 'Error'],
      });
    }
    monaco.editor.setModelMarkers(entry.model, 'vue', markers);
  }

  // --- Conversions vers Monaco ---

  const Kind = () => monaco.languages.CompletionItemKind;
  const LSP_KINDS = [null, 'Text', 'Method', 'Function', 'Constructor', 'Field', 'Variable', 'Class', 'Interface', 'Module', 'Property', 'Unit', 'Value', 'Enum', 'Keyword', 'Snippet', 'Color', 'File', 'Reference', 'Folder', 'EnumMember', 'Constant', 'Struct', 'Event', 'Operator', 'TypeParameter'];
  const TS_KINDS = {
    method: 'Method', function: 'Function', 'local function': 'Function', constructor: 'Constructor',
    property: 'Property', getter: 'Property', setter: 'Property', accessor: 'Property',
    var: 'Variable', let: 'Variable', 'local var': 'Variable', parameter: 'Variable', alias: 'Variable',
    const: 'Constant', class: 'Class', interface: 'Interface', type: 'Interface', enum: 'Enum', 'enum member': 'EnumMember',
    module: 'Module', 'external module name': 'Module', keyword: 'Keyword', directory: 'Folder', script: 'File',
    string: 'Value', 'type parameter': 'TypeParameter', primitive: 'Keyword', label: 'Text',
  };
  const lspRange = (r) => new monaco.Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1);
  const tsRange = (span) => new monaco.Range(span.start.line, span.start.offset, span.end.line, span.end.offset);
  const markdown = (doc) => (doc == null ? undefined : typeof doc === 'string' ? doc : { value: doc.value });
  const partsText = (parts) => (parts || []).map((p) => p.text).join('');

  function lspEdit(edit) {
    return { range: lspRange(edit.range), text: edit.newText };
  }

  function fromLsp(item, defaultRange) {
    const edit = item.textEdit;
    const range = edit ? lspRange(edit.range || edit.replace) : defaultRange;
    return {
      label: item.label,
      kind: Kind()[LSP_KINDS[item.kind] || 'Property'],
      detail: item.detail,
      documentation: markdown(item.documentation),
      sortText: item.sortText,
      filterText: item.filterText,
      insertText: edit ? edit.newText : (item.insertText ?? item.label),
      insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
      range,
      additionalTextEdits: item.additionalTextEdits?.map(lspEdit),
      command: item.command?.command === 'editor.action.triggerSuggest' ? { id: 'editor.action.triggerSuggest', title: '' } : undefined,
      source: 'lsp',
      original: item,
    };
  }

  function fromTs(entry, defaultRange, optionalReplacement) {
    const span = entry.replacementSpan || optionalReplacement;
    return {
      label: entry.labelDetails?.detail ? { label: entry.name, detail: entry.labelDetails.detail, description: entry.labelDetails.description } : entry.name,
      kind: Kind()[TS_KINDS[entry.kind] || 'Property'],
      sortText: entry.sortText,
      filterText: entry.filterText,
      insertText: entry.insertText ?? entry.name,
      insertTextRules: entry.isSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
      range: span ? tsRange(span) : defaultRange,
      source: 'ts',
      original: { name: entry.name, source: entry.source, data: entry.data },
    };
  }

  // --- Fournisseurs Monaco pour le langage « vue » ---

  function registerProviders() {
    const completion = monaco.languages.registerCompletionItemProvider('vue', {
      triggerCharacters: ['<', '.', ':', '@', '"', "'", '/', ' ', '#', '-'],
      async provideCompletionItems(model, position, context) {
        const file = fileOf(model);
        if (!attached.has(file)) return { suggestions: [] };
        flush(file);
        const word = model.getWordUntilPosition(position);
        const defaultRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        let result;
        try {
          result = await window.atelier.vueCompletion(file, pos(position), context.triggerCharacter);
        } catch {
          return { suggestions: [] };
        }
        const suggestions = result.lsp.map((i) => fromLsp(i, defaultRange));
        // Même nom proposé par les deux moteurs : on garde celui de Vue.
        const names = new Set(suggestions.map((s) => (typeof s.label === 'string' ? s.label : s.label.label)));
        for (const e of result.ts) if (!names.has(e.name)) suggestions.push(fromTs(e, defaultRange, result.tsOptionalReplacement));
        for (const s of suggestions) { s.position = pos(position); s.file = file; }
        return { suggestions, incomplete: false };
      },
      async resolveCompletionItem(item) {
        const file = item.file;
        if (!file || !attached.has(file)) return item;
        try {
          const details = await window.atelier.vueResolve(file, item.source, item.original, item.position);
          if (!details) return item;
          if (item.source === 'lsp') {
            const r = fromLsp(details, item.range);
            return { ...item, detail: r.detail ?? item.detail, documentation: r.documentation ?? item.documentation, additionalTextEdits: r.additionalTextEdits ?? item.additionalTextEdits };
          }
          // TypeScript : le type, la documentation, et l'import à ajouter (codeActions).
          const edits = [];
          for (const action of details.codeActions || []) {
            for (const change of action.changes) {
              if (change.fileName.replace(/\\/g, '/').toLowerCase() !== file.replace(/\\/g, '/').toLowerCase()) continue;
              for (const t of change.textChanges) edits.push({ range: tsRange(t), text: t.newText });
            }
          }
          const doc = [partsText(details.documentation), ...(details.tags || []).map((t) => `*@${t.name}* ${partsText(t.text)}`)].filter(Boolean).join('\n\n');
          return { ...item, detail: partsText(details.displayParts), documentation: doc ? { value: doc } : undefined, additionalTextEdits: edits.length ? edits : undefined };
        } catch {
          return item;
        }
      },
    });

    const hover = monaco.languages.registerHoverProvider('vue', {
      async provideHover(model, position) {
        const file = fileOf(model);
        if (!attached.has(file)) return null;
        flush(file);
        let result;
        try {
          result = await window.atelier.vueHover(file, pos(position));
        } catch {
          return null;
        }
        const contents = [];
        let range;
        if (result.ts?.displayString) {
          contents.push({ value: `\`\`\`typescript\n${result.ts.displayString}\n\`\`\`` });
          if (result.ts.documentation) contents.push({ value: typeof result.ts.documentation === 'string' ? result.ts.documentation : partsText(result.ts.documentation) });
          range = tsRange(result.ts);
        }
        const lsp = result.lsp?.contents;
        const lspValues = (Array.isArray(lsp) ? lsp : lsp ? [lsp] : []).map((c) => (typeof c === 'string' ? c : c.value)).filter((v) => v && v.trim());
        for (const value of lspValues) contents.push({ value });
        if (!range && result.lsp?.range) range = lspRange(result.lsp.range);
        return contents.length ? { contents, range } : null;
      },
    });

    const signature = monaco.languages.registerSignatureHelpProvider('vue', {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [')'],
      async provideSignatureHelp(model, position) {
        const file = fileOf(model);
        if (!attached.has(file)) return null;
        flush(file);
        const help = await window.atelier.vueSignature(file, pos(position)).catch(() => null);
        if (!help?.items?.length) return null;
        return {
          value: {
            activeSignature: help.selectedItemIndex,
            activeParameter: help.argumentIndex,
            signatures: help.items.map((item) => ({
              label: partsText(item.prefixDisplayParts) + item.parameters.map((p) => partsText(p.displayParts)).join(partsText(item.separatorDisplayParts)) + partsText(item.suffixDisplayParts),
              documentation: { value: partsText(item.documentation) },
              parameters: item.parameters.map((p) => ({ label: partsText(p.displayParts), documentation: { value: partsText(p.documentation) } })),
            })),
          },
          dispose() {},
        };
      },
    });

    const definition = monaco.languages.registerDefinitionProvider('vue', {
      async provideDefinition(model, position) {
        const file = fileOf(model);
        if (!attached.has(file)) return null;
        flush(file);
        const targets = await window.atelier.vueDefinition(file, pos(position)).catch(() => []);
        return targets.map((t) => ({ uri: monaco.Uri.file(t.file), range: tsRange(t) }));
      },
    });

    // Une définition dans un autre fichier : on l'ouvre dans un onglet de l'IDE.
    const opener = monaco.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selectionOrPosition) {
        if (resource.scheme !== 'file') return false;
        const sel = selectionOrPosition;
        const line = sel?.startLineNumber ?? sel?.lineNumber ?? 1;
        const col = sel?.startColumn ?? sel?.column ?? 1;
        openAt(resource.fsPath, line, col, 0, { preview: false });
        return true;
      },
    });

    providers = [completion, hover, signature, definition, opener];
  }

  // Appelé par applyConfig (app.js) au démarrage et à chaque changement de réglages.
  function applyConfig(config) {
    const want = config.vueTools !== false;
    if (want === enabled) return;
    enabled = want;
    if (enabled) {
      registerProviders();
      for (const model of monaco.editor.getModels()) attach(model);
    } else {
      providers.forEach((p) => p.dispose());
      providers = [];
      for (const file of [...attached.keys()]) detach(file);
      window.atelier.vueStop().catch(() => {});
      ready = false;
      setStatus('off');
    }
  }

  // Un fichier .vue s'ouvre ou se ferme dans l'éditeur.
  function init() {
    monaco.editor.onDidCreateModel((model) => attach(model));
    monaco.editor.onWillDisposeModel((model) => { if (isVueModel(model)) detach(fileOf(model)); });
    // Autre dossier ouvert : les moteurs repartent pour le nouveau projet.
    document.addEventListener('root-changed', () => {
      ready = false;
      if (!attached.size) setStatus('off');
    });
  }

  setStatus('off');
  return { init, applyConfig };
})();
