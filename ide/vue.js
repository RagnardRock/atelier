// Intelligence Vue (Volar), côté Node : le même moteur que l'extension « Vue (Official) » de VS Code.
// Deux programmes tournent en arrière-plan, pour le dossier ouvert, dès qu'un fichier .vue est ouvert :
//
// 1. tsserver, le moteur de TypeScript, avec l'extension @vue/typescript-plugin. Il comprend les
//    fichiers .vue : le <script> et les expressions du <template> ({{ compteur }}, :prop="…").
//    C'est lui qui donne les types, les erreurs de code, l'autocomplétion JavaScript/TypeScript et
//    « aller à la définition ».
// 2. vue-language-server (Volar) : le reste du fichier .vue. Les balises HTML et les composants du
//    projet (<HelloWorld … />), leurs props, les directives (v-if, @click…), le CSS de <style>,
//    et les erreurs propres à Vue. Pour tout ce qui touche aux types, il interroge tsserver :
//    on fait passer ses questions (« tsserver/request ») et les réponses.
//
// Les deux programmes sont lancés avec le Node intégré à Electron (ELECTRON_RUN_AS_NODE).
// La version de TypeScript est celle de l'IDE (fixée dans package.json), pas celle du projet.
//
// L'interface (renderer/vue.js) envoie le texte des fichiers .vue ouverts à chaque modification et
// pose ses questions : autocomplétion, survol, erreurs, définition, aide sur les paramètres.

const { spawn } = require('node:child_process');
const path = require('node:path');
const rpc = require('vscode-jsonrpc/node');
const { pathToFileURL, fileURLToPath } = require('node:url');

const NODE_MODULES = path.join(__dirname, 'node_modules');
const TSSERVER = path.join(NODE_MODULES, 'typescript', 'lib', 'tsserver.js');
const VUE_SERVER = path.join(NODE_MODULES, '@vue', 'language-server', 'bin', 'vue-language-server.js');

const toUri = (file) => pathToFileURL(file).href;
const toPath = (uri) => fileURLToPath(uri);
// tsserver veut des chemins avec des / (même sous Windows).
const tsPath = (file) => file.replace(/\\/g, '/');

// --- tsserver : une requête JSON par ligne en entrée, des réponses « Content-Length » en sortie ---
function startTsServer(root, log, onExit) {
  const child = spawn(process.execPath, [
    TSSERVER,
    '--globalPlugins', '@vue/typescript-plugin',
    '--pluginProbeLocations', NODE_MODULES,
    '--disableAutomaticTypingAcquisition',
    '--locale', 'fr', // messages d'erreur en français
  ], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let seq = 0;
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const header = /Content-Length: (\d+)\r\n\r\n/.exec(buffer.toString('latin1', 0, Math.min(buffer.length, 200)));
      if (!header) return;
      const start = header.index + header[0].length;
      const length = Number(header[1]);
      if (buffer.length < start + length) return;
      let message;
      try {
        message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
      } catch {
        message = null;
      }
      buffer = buffer.subarray(start + length);
      if (message?.type === 'response' && pending.has(message.request_seq)) {
        pending.get(message.request_seq)(message);
        pending.delete(message.request_seq);
      }
    }
  });
  child.stderr.on('data', (d) => log('INFO', `[tsserver] ${String(d).trim()}`));
  child.on('exit', (code) => {
    for (const resolve of pending.values()) resolve({ success: false });
    pending.clear();
    onExit(code);
  });
  child.on('error', (err) => log('ERREUR', `[tsserver] ${err.message}`));
  const write = (command, args, withResponse) => {
    const id = ++seq;
    const promise = withResponse ? new Promise((resolve) => pending.set(id, resolve)) : null;
    if (child.stdin.writable) child.stdin.write(`${JSON.stringify({ seq: id, type: 'request', command, arguments: args })}\n`);
    else if (promise) pending.get(id)({ success: false });
    return promise;
  };
  return {
    request: (command, args) => write(command, args, true),
    notify: (command, args) => { write(command, args, false); },
    stop: () => child.kill(),
  };
}

// --- vue-language-server : le protocole LSP (celui de VS Code) ---
function startVueServer(root, ts, log, onExit) {
  const child = spawn(process.execPath, [VUE_SERVER, '--stdio', `--tsdk=${path.join(NODE_MODULES, 'typescript', 'lib')}`], {
    cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stderr.on('data', (d) => log('INFO', `[vue] ${String(d).trim()}`));
  child.on('exit', onExit);
  child.on('error', (err) => log('ERREUR', `[vue] ${err.message}`));
  const connection = rpc.createMessageConnection(new rpc.StreamMessageReader(child.stdout), new rpc.StreamMessageWriter(child.stdin));
  // Le serveur Vue a besoin des types : il demande à tsserver, par nous.
  connection.onNotification('tsserver/request', async ([id, command, args]) => {
    const response = await ts.request(command, args);
    connection.sendNotification('tsserver/response', [id, response?.body ?? null]);
  });
  // Réglages demandés par le serveur : les valeurs par défaut de Vue (Official).
  connection.onRequest('workspace/configuration', (params) => params.items.map(() => null));
  connection.onRequest(() => null);
  connection.onNotification(() => {});
  connection.onError(() => {});
  connection.listen();
  const ready = connection.sendRequest('initialize', {
    processId: process.pid,
    rootUri: toUri(root),
    workspaceFolders: [{ uri: toUri(root), name: path.basename(root) }],
    capabilities: {
      textDocument: {
        synchronization: { didSave: false },
        completion: { completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'], insertReplaceSupport: false, resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] } } },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        diagnostic: {},
      },
      workspace: { configuration: true, workspaceFolders: true },
    },
    initializationOptions: {},
  }).then(() => { connection.sendNotification('initialized', {}); });
  return {
    ready,
    request: async (method, params) => { await ready; return connection.sendRequest(method, params); },
    notify: async (method, params) => { await ready; connection.sendNotification(method, params); },
    stop: () => { try { connection.dispose(); } catch { /* déjà fermé */ } child.kill(); },
  };
}

function register({ handle, getRoot, isAllowed, log, readConfig }) {
  let servers = null; // { root, ts, vue, docs }
  let restarts = 0;

  function stop() {
    if (!servers) return;
    servers.stopping = true;
    servers.ts.stop();
    servers.vue.stop();
    servers = null;
  }

  async function ensure() {
    const root = getRoot();
    if (!root) throw new Error("Ouvre d'abord un dossier.");
    if (!(await readConfig()).vueTools) throw new Error('Intelligence Vue désactivée dans les réglages.');
    if (servers && servers.root === root) return servers;
    stop();
    const current = { root, docs: new Map(), stopping: false };
    // Si un des deux programmes s'arrête tout seul, on relance (3 fois au plus par session).
    const onExit = () => {
      if (current.stopping || servers !== current) return;
      log('ERREUR', '[vue] Un serveur de langage Vue s\'est arrêté.');
      stop();
      if (restarts++ < 3) ensure().then((s) => reopen(s, current.docs)).catch(() => {});
    };
    current.ts = startTsServer(root, log, onExit);
    current.ts.notify('configure', { preferences: { includeCompletionsForModuleExports: true, includeCompletionsWithInsertText: true, quotePreference: 'auto' } });
    current.vue = startVueServer(root, current.ts, log, onExit);
    servers = current;
    return current;
  }

  function reopen(s, docs) {
    for (const [file, doc] of docs) openDoc(s, file, doc.text);
  }

  function openDoc(s, file, text) {
    const doc = { text, version: 1 };
    s.docs.set(file, doc);
    s.ts.notify('open', { file: tsPath(file), fileContent: text, scriptKindName: 'TS', projectRootPath: tsPath(s.root) });
    s.vue.notify('textDocument/didOpen', { textDocument: { uri: toUri(file), languageId: 'vue', version: doc.version, text } });
  }

  // Le serveur arrête de répondre au milieu d'une frappe ? On ne bloque jamais l'éditeur longtemps.
  const timeout = (promise, ms, fallback) => Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))]);

  const checkFile = (file) => {
    if (typeof file !== 'string' || !file.endsWith('.vue') || !isAllowed(file)) throw new Error('Fichier refusé');
    return path.resolve(file);
  };

  handle('vue:open', async (_event, file, text) => {
    const s = await ensure();
    file = checkFile(file);
    if (s.docs.has(file)) return;
    openDoc(s, file, String(text));
  });

  handle('vue:change', async (_event, file, text) => {
    const s = await ensure();
    file = checkFile(file);
    const doc = s.docs.get(file);
    if (!doc) return openDoc(s, file, String(text));
    // tsserver : on remplace tout le texte (de la ligne 1 jusqu'après le dernier caractère).
    const lines = doc.text.split('\n');
    const end = { line: lines.length, offset: lines[lines.length - 1].length + 1 };
    doc.text = String(text);
    doc.version++;
    s.ts.notify('updateOpen', { changedFiles: [{ fileName: tsPath(file), textChanges: [{ start: { line: 1, offset: 1 }, end, newText: doc.text }] }] });
    s.vue.notify('textDocument/didChange', { textDocument: { uri: toUri(file), version: doc.version }, contentChanges: [{ text: doc.text }] });
  });

  handle('vue:close', async (_event, file) => {
    if (!servers) return;
    file = checkFile(file);
    if (!servers.docs.delete(file)) return;
    servers.ts.notify('close', { file: tsPath(file) });
    servers.vue.notify('textDocument/didClose', { textDocument: { uri: toUri(file) } });
  });

  // Autocomplétion : les deux sources ensemble. position = { line, column } comme dans Monaco (à partir de 1).
  handle('vue:completion', async (_event, file, position, trigger) => {
    const s = await ensure();
    file = checkFile(file);
    const [lsp, ts] = await Promise.all([
      timeout(s.vue.request('textDocument/completion', {
        textDocument: { uri: toUri(file) },
        position: { line: position.line - 1, character: position.column - 1 },
        context: trigger ? { triggerKind: 2, triggerCharacter: trigger } : { triggerKind: 1 },
      }).catch(() => null), 4000, null),
      timeout(s.ts.request('completionInfo', {
        file: tsPath(file), line: position.line, offset: position.column,
        triggerCharacter: ['.', '"', "'", '`', '/', '@', '<', '#', ' '].includes(trigger) ? trigger : undefined,
        includeExternalModuleExports: true, includeInsertTextCompletions: true,
      }), 4000, null),
    ]);
    const items = Array.isArray(lsp) ? lsp : lsp?.items || [];
    return {
      lsp: items,
      ts: ts?.success ? (ts.body?.entries || []) : [],
      tsOptionalReplacement: ts?.body?.optionalReplacementSpan || null,
    };
  });

  // Détails d'un élément choisi dans la liste (documentation, import automatique d'un composant…).
  handle('vue:resolve', async (_event, file, source, item, position) => {
    const s = await ensure();
    file = checkFile(file);
    if (source === 'lsp') return timeout(s.vue.request('completionItem/resolve', item).catch(() => item), 3000, item);
    const r = await timeout(s.ts.request('completionEntryDetails', {
      file: tsPath(file), line: position.line, offset: position.column,
      entryNames: [{ name: item.name, source: item.source, data: item.data }],
    }), 3000, null);
    return r?.success ? r.body?.[0] || null : null;
  });

  handle('vue:hover', async (_event, file, position) => {
    const s = await ensure();
    file = checkFile(file);
    const [lsp, ts] = await Promise.all([
      timeout(s.vue.request('textDocument/hover', { textDocument: { uri: toUri(file) }, position: { line: position.line - 1, character: position.column - 1 } }).catch(() => null), 3000, null),
      timeout(s.ts.request('quickinfo', { file: tsPath(file), line: position.line, offset: position.column }), 3000, null),
    ]);
    return { lsp, ts: ts?.success ? ts.body : null };
  });

  handle('vue:signature', async (_event, file, position) => {
    const s = await ensure();
    file = checkFile(file);
    const r = await timeout(s.ts.request('signatureHelp', { file: tsPath(file), line: position.line, offset: position.column }), 3000, null);
    return r?.success ? r.body : null;
  });

  handle('vue:definition', async (_event, file, position) => {
    const s = await ensure();
    file = checkFile(file);
    const r = await timeout(s.ts.request('definition', { file: tsPath(file), line: position.line, offset: position.column }), 4000, null);
    return (r?.success ? r.body || [] : []).map((d) => ({ file: path.resolve(d.file), start: d.start, end: d.end }));
  });

  // Erreurs : syntaxe et types (tsserver), plus les erreurs propres à Vue (serveur Vue).
  handle('vue:diagnostics', async (_event, file) => {
    const s = await ensure();
    file = checkFile(file);
    const args = { file: tsPath(file) };
    const [syntax, semantic, lsp] = await Promise.all([
      timeout(s.ts.request('syntacticDiagnosticsSync', args), 8000, null),
      timeout(s.ts.request('semanticDiagnosticsSync', args), 8000, null),
      timeout(s.vue.request('textDocument/diagnostic', { textDocument: { uri: toUri(file) } }).catch(() => null), 8000, null),
    ]);
    const ts = [...(syntax?.success ? syntax.body : []), ...(semantic?.success ? semantic.body : [])];
    return { ts, lsp: lsp?.items || [] };
  });

  handle('vue:stop', async () => stop());
  return { stop };
}

module.exports = { register };
