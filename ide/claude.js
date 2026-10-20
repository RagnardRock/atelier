// Chat avec Claude : on fait tourner Claude Code (la commande `claude` installée sur ton PC)
// en arrière-plan, dans le dossier ouvert, avec ton compte Claude habituel.
//
// Claude Code est lancé en mode "headless" : au lieu d'une interface dans un terminal, il lit
// et écrit des messages JSON, un par ligne (stream-json), sur son entrée et sa sortie.
// - L'IDE lui envoie tes messages ({ type: "user", ... }).
// - Il renvoie le texte de sa réponse au fil de l'eau, les outils qu'il utilise, et à la fin
//   un résumé ({ type: "result" }).
// - Avant de modifier un fichier ou de lancer une commande, il demande la permission
//   ({ type: "control_request", subtype: "can_use_tool" }) : l'IDE t'affiche la demande et
//   lui renvoie ta réponse. C'est le même mécanisme que celui du SDK officiel (Agent SDK).
//
// Claude connaît aussi ce que sait celui d'Atelier (le hub) : la mémoire du projet ouvert et tes
// notes, dans le dossier partagé %APPDATA%\atelier-commun. Il y accède par un petit serveur MCP,
// mcp-commun.js, qui peut aussi y retenir une info (avec ta permission, comme pour un fichier).
//
// Un seul processus par fenêtre, gardé ouvert entre les messages pour que Claude se souvienne
// de la conversation. "Nouvelle conversation" l'arrête.

const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

let proc = null;          // processus Claude Code en cours
let procCwd = null;       // dossier dans lequel il a été lancé
let sender = null;        // webContents de la fenêtre qui affiche le chat
let buffer = '';          // morceau de ligne pas encore complet
let nextRequestId = 1;
let lastSession = null;   // { id, cwd } : pour reprendre la conversation si Claude Code s'arrête

function emit(event) {
  if (sender && !sender.isDestroyed()) sender.send('claude:event', event);
}

function write(message) {
  if (proc && proc.stdin.writable) proc.stdin.write(`${JSON.stringify(message)}\n`);
}

// Sous Windows, on cherche nous-mêmes le vrai programme (claude.exe, ou claude.cmd installé par
// npm) dans le PATH. Si on laissait faire Windows, il chercherait d'abord dans le dossier
// courant, et avec ses règles il prendrait un fichier "claude.js" du projet pour la commande
// (il l'ouvrirait alors avec l'application associée aux .js au lieu de lancer Claude Code).
const WINDOWS_EXTENSIONS = ['.exe', '.cmd', '.bat'];

function findWindowsCommand(command) {
  const candidates = (base) => (WINDOWS_EXTENSIONS.includes(path.extname(base).toLowerCase())
    ? [base]
    : WINDOWS_EXTENSIONS.map((ext) => base + ext));
  if (path.isAbsolute(command) || /[\\/]/.test(command)) {
    return candidates(path.resolve(command)).find((f) => fs.existsSync(f)) || null;
  }
  const dirs = (process.env.PATH || '').split(';').filter(Boolean);
  // Emplacements habituels de Claude Code, au cas où ils ne seraient pas dans le PATH.
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
  delete env.CLAUDECODE; // si l'IDE a été lancé depuis Claude Code, ce ne doit pas être vu comme imbriqué
  if (process.platform === 'win32') {
    const file = findWindowsCommand(command);
    if (!file) {
      const err = new Error(`commande introuvable : ${command}`);
      err.code = 'ENOENT';
      throw err;
    }
    // Un .exe se lance directement. Un .cmd ou .bat (installation npm) a besoin de cmd.exe.
    if (path.extname(file).toLowerCase() === '.exe') return spawn(file, args, { cwd, env, windowsHide: true });
    // Avec cmd.exe, un argument qui contient un espace (un chemin) doit être entre guillemets.
    const quoted = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '')}"` : a));
    return spawn(`"${file}"`, quoted, { cwd, env, shell: true, windowsHide: true });
  }
  return spawn(command, args, { cwd, env });
}

// --- Dossier partagé de l'Atelier ---
// Le serveur MCP est lancé avec le Node intégré à Electron (process.execPath + ELECTRON_RUN_AS_NODE).
let communDir = null;     // %APPDATA%\atelier-commun
let mcpFile = null;       // %APPDATA%\atelier-ide\mcp-atelier.json
// Lire ne demande jamais la permission ; retenir ou oublier passe par la carte habituelle.
const LECTURE = ['mcp__atelier__lire_contexte', 'mcp__atelier__lire_notes'];

async function ecrireConfigMcp(cwd) {
  const config = {
    mcpServers: {
      atelier: {
        command: process.execPath,
        args: [path.join(__dirname, 'mcp-commun.js')],
        env: { ELECTRON_RUN_AS_NODE: '1', ATELIER_COMMUN: communDir, ATELIER_PROJET: path.basename(cwd) },
      },
    },
  };
  await fsp.writeFile(mcpFile, JSON.stringify(config, null, 2), 'utf8');
  return mcpFile;
}

// Glissé avant ton premier message de chaque lancement (tu ne le vois pas dans le panneau) :
// Claude sait ainsi qu'il a une mémoire du projet et des notes à sa disposition.
function introAtelier(cwd) {
  return [
    `(Rune : tu travailles dans le projet « ${path.basename(cwd)} ». Ragna utilise aussi Atelier, son hub, dont le Claude`,
    'garde une mémoire par projet et voit ses notes. Tu y as accès avec les outils mcp__atelier__ :',
    'lire_contexte (la mémoire de ce projet : décisions, client, hébergement… ; lis-la avant de répondre à ce premier message,',
    'puis relis-la si Ragna parle de ce qui a été décidé), lire_notes (ses notes, quand la question s\'y rapporte),',
    'retenir_projet et oublier_projet (garde une info courte et utile plus tard quand Ragna te la demande ou te l\'apprend ;',
    'elle sera visible dans Atelier et dans les autres outils).)',
    '',
    '',
  ].join('\n');
}

function start({ command, model, permissionMode, cwd, log, resume, mcpConfig }) {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',                      // obligatoire avec stream-json
    '--include-partial-messages',     // le texte arrive mot par mot
    '--permission-prompt-tool=stdio', // les demandes de permission passent par nous
  ];
  if (model) args.push('--model', model);
  if (permissionMode === 'acceptEdits') args.push('--permission-mode', 'acceptEdits');
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
      try {
        message = JSON.parse(line);
      } catch {
        continue; // ligne qui n'est pas du JSON (rare) : ignorée
      }
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
    // Sous Windows, une commande introuvable ne déclenche pas "error" mais un code 1 du shell.
    const notFound = process.platform === 'win32' && /n.est pas reconnu|is not recognized/i.test(stderr);
    if (code !== 0 && code !== null) log('ERREUR', `Claude s'est arrêté (code ${code}) : ${stderr.trim()}`);
    emit({ kind: 'exit', code, notInstalled: notFound, stderr: stderr.trim() });
  });

  // Première chose attendue par Claude Code : la "poignée de main" du protocole.
  write({ type: 'control_request', request_id: `init-${nextRequestId++}`, request: { subtype: 'initialize' } });
  return true;
}

// Traduit les messages de Claude Code en événements simples pour l'interface.
function handleMessage(m) {
  if (m.type === 'system' && m.subtype === 'init') {
    lastSession = { id: m.session_id, cwd: procCwd };
    return emit({ kind: 'init', model: m.model, sessionId: m.session_id });
  }
  if (m.type === 'stream_event') {
    const e = m.event;
    if (m.parent_tool_use_id) return; // texte d'un sous-agent : on n'affiche que le fil principal
    if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') return emit({ kind: 'text', text: e.delta.text });
    if (e.type === 'message_start') return emit({ kind: 'message-start' });
    return;
  }
  if (m.type === 'assistant' && !m.parent_tool_use_id) {
    // Le message complet arrive après son texte : on n'en garde que les outils utilisés.
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
      title: m.request.title,
      description: m.request.description,
    });
  }
  if (m.type === 'result') {
    return emit({
      kind: 'result',
      isError: Boolean(m.is_error) || m.subtype !== 'success',
      text: m.result,
      durationMs: m.duration_ms,
      costUsd: m.total_cost_usd,
    });
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

// --- Historique des conversations ---
// Chaque conversation est gardée dans claude-conversations.json (à côté de la config) : son
// titre, son dossier, l'identifiant de session de Claude Code (pour la reprendre avec --resume)
// et ce que le panneau affichait (bulles, outils), pour la réafficher telle quelle.
const MAX_CONVERSATIONS = 100;
let historyFile = null;

async function readHistory() {
  try {
    return JSON.parse(await fsp.readFile(historyFile, 'utf8'));
  } catch {
    return []; // pas encore de fichier, ou fichier abîmé : on repart d'une liste vide
  }
}

async function writeHistory(list) {
  await fsp.writeFile(historyFile, JSON.stringify(list.slice(0, MAX_CONVERSATIONS)), 'utf8');
}

function register({ handle, getRoot, readConfig, log, dataDir }) {
  historyFile = path.join(dataDir, 'claude-conversations.json');
  communDir = path.join(path.dirname(dataDir), 'atelier-commun');
  mcpFile = path.join(dataDir, 'mcp-atelier.json');

  // Les conversations du dossier ouvert, la plus récente d'abord (sans leur contenu).
  handle('claude:history', async () => {
    const root = getRoot();
    return (await readHistory())
      .filter((c) => c.cwd === root)
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  });
  handle('claude:history:get', async (_event, id) => (await readHistory()).find((c) => c.id === id) || null);
  handle('claude:history:save', async (_event, { id, title, sessionId, items }) => {
    const root = getRoot();
    if (!root || typeof id !== 'string') return;
    const list = (await readHistory()).filter((c) => c.id !== id);
    list.unshift({ id, title: String(title).slice(0, 120), cwd: root, sessionId, items, updatedAt: Date.now() });
    await writeHistory(list);
  });
  handle('claude:history:delete', async (_event, id) => {
    await writeHistory((await readHistory()).filter((c) => c.id !== id));
  });
  // Reprendre une ancienne conversation : Claude Code est arrêté, et le prochain message le
  // relance avec --resume pour qu'il retrouve tout ce qui a été dit.
  handle('claude:resume', async (_event, sessionId) => {
    stop();
    lastSession = sessionId && /^[\w-]+$/.test(sessionId) ? { id: sessionId, cwd: getRoot() } : null;
  });

  handle('claude:send', async (event, text) => {
    const root = getRoot();
    if (!root) throw new Error("Ouvre d'abord un dossier : Claude travaille dans le projet ouvert.");
    sender = event.sender;
    // Le projet a changé depuis le lancement : on repart sur une conversation neuve dans le bon dossier.
    if (proc && procCwd !== root) stop();
    let intro = '';
    if (!proc) {
      const config = await readConfig();
      // Claude Code s'était arrêté en cours de conversation (plantage, mise en veille…) : on la reprend.
      const resume = lastSession && lastSession.cwd === root && /^[\w-]+$/.test(lastSession.id) ? lastSession.id : null;
      let mcpConfig = null;
      if (config.claudeAtelier !== false) {
        try {
          mcpConfig = await ecrireConfigMcp(root);
          intro = introAtelier(root);
        } catch (err) {
          log('ERREUR', `Claude : dossier partagé de l'Atelier indisponible : ${err.message}`);
        }
      }
      if (!start({ command: config.claudeCommand || 'claude', model: config.claudeModel, permissionMode: config.claudePermissionMode, cwd: root, log, resume, mcpConfig })) return;
    }
    write({ type: 'user', message: { role: 'user', content: intro + text }, parent_tool_use_id: null, session_id: '' });
  });

  // Ta réponse à une demande de permission.
  handle('claude:permission', async (_event, { requestId, toolUseId, decision, input, suggestions }) => {
    const response = decision === 'deny'
      ? { behavior: 'deny', message: "L'utilisateur a refusé.", toolUseID: toolUseId }
      : {
        behavior: 'allow',
        updatedInput: input,
        toolUseID: toolUseId,
        // "Toujours autoriser" : on renvoie les règles proposées par Claude Code (pour cette session).
        ...(decision === 'always' && suggestions?.length ? { updatedPermissions: suggestions } : {}),
      };
    write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  });

  // Bouton stop : Claude arrête ce qu'il est en train de faire, la conversation continue.
  handle('claude:interrupt', async () => {
    write({ type: 'control_request', request_id: `interrupt-${nextRequestId++}`, request: { subtype: 'interrupt' } });
  });

  handle('claude:reset', async () => { lastSession = null; stop(); });
}

module.exports = { register, stop };
