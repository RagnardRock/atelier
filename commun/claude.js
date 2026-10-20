// Claude dans les outils de l'Atelier (Skald, Tafl, Brokk) : le côté « processus principal ».
// Le même fichier sert aux trois outils (voir commun/LISEZMOI.md : il est recopié dans chacun).
//
// Comme dans Rune, on fait tourner Claude Code (la commande `claude` installée sur ton PC, avec ton
// compte Claude habituel, sans clé d'API) en arrière-plan, en mode « headless » :
// - l'outil lui envoie tes messages, en JSON, un par ligne (stream-json) ;
// - il renvoie sa réponse au fil de l'eau, les outils qu'il utilise et un résumé à la fin ;
// - avant de modifier un fichier, de lancer une commande ou de retenir une info, il demande la
//   permission (control_request « can_use_tool ») : le panneau te montre une carte Autoriser / Refuser.
//
// Le projet : celui avec lequel Atelier a ouvert l'outil, sinon le dernier projet ouvert depuis
// Atelier (dossier partagé %APPDATA%\atelier-commun). Claude travaille dans son dossier, et connaît
// sa mémoire (ce que le Claude d'Atelier ou de Rune a retenu) et tes notes, grâce au petit serveur
// MCP mcp-commun.js.

const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

let proc = null;          // processus Claude Code en cours
let procCwd = null;       // dossier dans lequel il a été lancé
let sender = null;        // fenêtre qui affiche le panneau
let buffer = '';          // morceau de ligne pas encore complet
let nextRequestId = 1;
let lastSession = null;   // { id, cwd } : pour reprendre la conversation si Claude Code s'arrête
let dossierDonne = null;  // dossier passé par Atelier au lancement (ou plus tard, s'il rouvre l'outil)

function emit(event) {
  if (sender && !sender.isDestroyed()) sender.send('claude:event', event);
}

function write(message) {
  if (proc && proc.stdin.writable) proc.stdin.write(`${JSON.stringify(message)}\n`);
}

// Sous Windows, on cherche nous-mêmes claude.exe ou claude.cmd dans le PATH (sinon Windows
// pourrait prendre un fichier « claude.js » du dossier courant pour la commande).
const WINDOWS_EXTENSIONS = ['.exe', '.cmd', '.bat'];
function findWindowsCommand(command) {
  const candidates = (base) => (WINDOWS_EXTENSIONS.includes(path.extname(base).toLowerCase())
    ? [base]
    : WINDOWS_EXTENSIONS.map((ext) => base + ext));
  if (path.isAbsolute(command) || /[\\/]/.test(command)) {
    return candidates(path.resolve(command)).find((f) => fs.existsSync(f)) || null;
  }
  const dirs = (process.env.PATH || '').split(';').filter(Boolean);
  if (process.env.USERPROFILE) dirs.push(path.join(process.env.USERPROFILE, '.local', 'bin'));
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'npm'));
  for (const dir of dirs) {
    const found = candidates(path.join(dir.replace(/"/g, ''), command)).find((f) => fs.existsSync(f));
    if (found) return found;
  }
  return null;
}

function spawnClaude(command, args, cwd) {
  const env = { ...process.env };
  delete env.CLAUDECODE; // si l'outil a été lancé depuis Claude Code, ce ne doit pas être vu comme imbriqué
  if (process.platform === 'win32') {
    const file = findWindowsCommand(command);
    if (!file) {
      const err = new Error(`commande introuvable : ${command}`);
      err.code = 'ENOENT';
      throw err;
    }
    if (path.extname(file).toLowerCase() === '.exe') return spawn(file, args, { cwd, env, windowsHide: true });
    // Avec cmd.exe, un argument qui contient un espace (un chemin) doit être entre guillemets.
    const quoted = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '')}"` : a));
    return spawn(`"${file}"`, quoted, { cwd, env, shell: true, windowsHide: true });
  }
  return spawn(command, args, { cwd, env });
}

// Lire ne demande jamais la permission ; retenir ou oublier passe par la carte.
const LECTURE = ['mcp__atelier__lire_contexte', 'mcp__atelier__lire_notes'];

function start({ command, model, cwd, log, resume, mcpConfig }) {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',                      // obligatoire avec stream-json
    '--include-partial-messages',     // le texte arrive mot par mot
    '--permission-prompt-tool=stdio', // les demandes de permission passent par nous
  ];
  if (model) args.push('--model', model);
  if (resume) args.push('--resume', resume);
  if (mcpConfig) args.push('--mcp-config', mcpConfig, '--allowedTools', ...LECTURE);

  log('INFO', `Claude : lancement de « ${command} » dans ${cwd}`);
  try {
    proc = spawnClaude(command, args, cwd);
  } catch (err) {
    log('ERREUR', `Claude : ${err.message}`);
    emit({ kind: 'error', notInstalled: err.code === 'ENOENT', message: err.message });
    return false;
  }
  procCwd = cwd;
  buffer = '';
  const current = proc;

  current.stdout.setEncoding('utf8');
  current.stdout.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      handleMessage(message);
    }
  });
  let stderr = '';
  current.stderr.setEncoding('utf8');
  current.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  current.on('error', (err) => {
    log('ERREUR', `Claude : ${err.message}`);
    emit({ kind: 'error', notInstalled: err.code === 'ENOENT', message: err.message });
  });
  current.on('exit', (code) => {
    if (proc === current) proc = null;
    // Sous Windows, une commande introuvable ne déclenche pas « error » mais un code 1 du shell.
    const notFound = process.platform === 'win32' && /n.est pas reconnu|is not recognized/i.test(stderr);
    if (code !== 0 && code !== null) log('ERREUR', `Claude s'est arrêté (code ${code}) : ${stderr.trim()}`);
    emit({ kind: 'exit', code, notInstalled: notFound, stderr: stderr.trim() });
  });

  // Première chose attendue par Claude Code : la « poignée de main » du protocole.
  write({ type: 'control_request', request_id: `init-${nextRequestId++}`, request: { subtype: 'initialize' } });
  return true;
}

// Traduit les messages de Claude Code en événements simples pour le panneau.
function handleMessage(m) {
  if (m.type === 'system' && m.subtype === 'init') {
    lastSession = { id: m.session_id, cwd: procCwd };
    return emit({ kind: 'init', model: m.model, sessionId: m.session_id });
  }
  if (m.type === 'stream_event') {
    const e = m.event;
    if (m.parent_tool_use_id) return; // texte d'un sous-agent : on n'affiche que le fil principal
    if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') return emit({ kind: 'text', text: e.delta.text });
    return;
  }
  if (m.type === 'assistant' && !m.parent_tool_use_id) {
    for (const block of m.message.content || []) {
      if (block.type === 'tool_use') emit({ kind: 'tool', id: block.id, name: block.name, input: block.input });
    }
    return;
  }
  if (m.type === 'user' && Array.isArray(m.message?.content)) {
    for (const block of m.message.content) {
      if (block.type === 'tool_result') emit({ kind: 'tool-result', id: block.tool_use_id, isError: Boolean(block.is_error) });
    }
    return;
  }
  if (m.type === 'control_request' && m.request?.subtype === 'can_use_tool') {
    return emit({
      kind: 'permission',
      requestId: m.request_id,
      toolUseId: m.request.tool_use_id,
      toolName: m.request.tool_name,
      input: m.request.input,
      suggestions: m.request.permission_suggestions || [],
    });
  }
  if (m.type === 'result') {
    return emit({ kind: 'result', isError: Boolean(m.is_error) || m.subtype !== 'success', text: m.result });
  }
}

function stop() {
  if (!proc) return;
  const current = proc;
  proc = null;
  if (process.platform === 'win32') {
    // Avec le shell, kill() n'arrêterait que cmd.exe : taskkill arrête aussi Claude Code.
    execFile('taskkill', ['/pid', String(current.pid), '/T', '/F'], () => {});
  } else {
    current.kill();
  }
}

// --- Le projet en cours ---
let communDir = null; // %APPDATA%\atelier-commun

function setProjet(dossier) {
  if (dossier && fs.existsSync(dossier)) dossierDonne = path.resolve(dossier);
}

// { dossier, nom, source } ou null. source : 'atelier' (l'outil a été ouvert sur ce projet) ou
// 'dernier' (le dernier projet ouvert depuis Atelier, dans n'importe quel outil).
async function projet() {
  if (dossierDonne) return { dossier: dossierDonne, nom: path.basename(dossierDonne), source: 'atelier' };
  try {
    const enCours = JSON.parse(await fsp.readFile(path.join(communDir, 'projet-en-cours.json'), 'utf8'));
    if (enCours?.dossier && fs.existsSync(enCours.dossier)) return { dossier: enCours.dossier, nom: path.basename(enCours.dossier), source: 'dernier' };
  } catch {
    // pas encore de projet ouvert depuis Atelier
  }
  return null;
}

// --- Historique des conversations (claude-conversations.json, à côté de la config) ---
const MAX_CONVERSATIONS = 100;
let historyFile = null;
async function readHistory() {
  try { return JSON.parse(await fsp.readFile(historyFile, 'utf8')); } catch { return []; }
}
async function writeHistory(list) {
  await fsp.writeFile(historyFile, JSON.stringify(list.slice(0, MAX_CONVERSATIONS)), 'utf8');
}

// outil : { nom: 'Skald', role: "l'éditeur d'images de Ragna (retouche, logos, PSD)" }
function register({ handle, log, dataDir, readConfig, outil }) {
  historyFile = path.join(dataDir, 'claude-conversations.json');
  communDir = path.join(path.dirname(dataDir), 'atelier-commun');
  const mcpFile = path.join(dataDir, 'mcp-atelier.json');
  // Sans projet, Claude travaille dans un dossier à lui (rien à y casser).
  const dossierSansProjet = path.join(dataDir, 'claude');

  async function cwdActuel() {
    const p = await projet();
    if (p) return { cwd: p.dossier, nom: p.nom };
    await fsp.mkdir(dossierSansProjet, { recursive: true });
    return { cwd: dossierSansProjet, nom: '' };
  }

  async function ecrireConfigMcp(nom) {
    const config = {
      mcpServers: {
        atelier: {
          command: process.execPath,
          args: [path.join(__dirname, 'mcp-commun.js')],
          env: { ELECTRON_RUN_AS_NODE: '1', ATELIER_COMMUN: communDir, ATELIER_PROJET: nom },
        },
      },
    };
    await fsp.writeFile(mcpFile, JSON.stringify(config, null, 2), 'utf8');
    return mcpFile;
  }

  // Glissé avant ton premier message de chaque lancement (tu ne le vois pas dans le panneau).
  function intro(nom) {
    return [
      `(${outil.nom} : tu es dans ${outil.nom}, ${outil.role}, un des outils de l'Atelier de Ragna.`,
      nom
        ? `Le projet en cours est « ${nom} » : tu travailles dans son dossier.`
        : 'Aucun projet n\'est ouvert : tu travailles dans un dossier vide, propre à cet outil.',
      'Le Claude d\'Atelier (le hub) garde une mémoire par projet et voit les notes de Ragna. Tu y as accès avec',
      'les outils mcp__atelier__ : lire_contexte (la mémoire du projet ; lis-la avant de répondre à ce premier message),',
      'lire_notes (quand la question s\'y rapporte), retenir_projet et oublier_projet (garde une info courte et utile',
      'plus tard quand Ragna te la demande ou te l\'apprend ; elle sera visible dans Atelier et les autres outils).)',
      '',
      '',
    ].join('\n');
  }

  handle('claude:projet', async () => projet());

  handle('claude:history', async () => {
    const { cwd } = await cwdActuel();
    return (await readHistory()).filter((c) => c.cwd === cwd).map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  });
  handle('claude:history:get', async (_event, id) => (await readHistory()).find((c) => c.id === id) || null);
  handle('claude:history:save', async (_event, { id, title, sessionId, items }) => {
    if (typeof id !== 'string') return;
    const { cwd } = await cwdActuel();
    const list = (await readHistory()).filter((c) => c.id !== id);
    list.unshift({ id, title: String(title).slice(0, 120), cwd, sessionId, items, updatedAt: Date.now() });
    await writeHistory(list);
  });
  handle('claude:history:delete', async (_event, id) => {
    await writeHistory((await readHistory()).filter((c) => c.id !== id));
  });
  // Reprendre une ancienne conversation : le prochain message relance Claude Code avec --resume.
  handle('claude:resume', async (_event, sessionId) => {
    stop();
    lastSession = sessionId && /^[\w-]+$/.test(sessionId) ? { id: sessionId, cwd: (await cwdActuel()).cwd } : null;
  });

  handle('claude:send', async (event, text) => {
    sender = event.sender;
    const { cwd, nom } = await cwdActuel();
    // Le projet a changé depuis le lancement : conversation neuve dans le bon dossier.
    if (proc && procCwd !== cwd) stop();
    let debut = '';
    if (!proc) {
      const config = await readConfig();
      const resume = lastSession && lastSession.cwd === cwd && /^[\w-]+$/.test(lastSession.id) ? lastSession.id : null;
      let mcpConfig = null;
      try {
        mcpConfig = await ecrireConfigMcp(nom);
        debut = intro(nom);
      } catch (err) {
        log('ERREUR', `Claude : dossier partagé de l'Atelier indisponible : ${err.message}`);
      }
      if (!start({ command: config.claudeCommand || 'claude', model: config.claudeModel, cwd, log, resume, mcpConfig })) return;
    }
    write({ type: 'user', message: { role: 'user', content: debut + text }, parent_tool_use_id: null, session_id: '' });
  });

  // Ta réponse à une demande de permission.
  handle('claude:permission', async (_event, { requestId, toolUseId, decision, input, suggestions }) => {
    const response = decision === 'deny'
      ? { behavior: 'deny', message: "L'utilisateur a refusé.", toolUseID: toolUseId }
      : {
        behavior: 'allow',
        updatedInput: input,
        toolUseID: toolUseId,
        // « Toujours autoriser » : les règles proposées par Claude Code (pour cette conversation).
        ...(decision === 'always' && suggestions?.length ? { updatedPermissions: suggestions } : {}),
      };
    write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  });

  handle('claude:interrupt', async () => {
    write({ type: 'control_request', request_id: `interrupt-${nextRequestId++}`, request: { subtype: 'interrupt' } });
  });
  handle('claude:reset', async () => { lastSession = null; stop(); });
}

module.exports = { register, stop, setProjet };
