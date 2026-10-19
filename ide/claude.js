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
// Un seul processus par fenêtre, gardé ouvert entre les messages pour que Claude se souvienne
// de la conversation. "Nouvelle conversation" l'arrête.

const { spawn, execFile } = require('node:child_process');

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

// Sous Windows, `claude` est souvent un fichier .cmd (installé par npm) : il faut passer par
// le shell. Les arguments ne contiennent pas d'espace, seul le chemin de la commande peut en avoir.
function spawnClaude(command, args, cwd) {
  const env = { ...process.env };
  delete env.CLAUDECODE; // si l'IDE a été lancé depuis Claude Code, ce ne doit pas être vu comme imbriqué
  if (process.platform === 'win32') {
    const quoted = command.includes(' ') ? `"${command}"` : command;
    return spawn(quoted, args, { cwd, env, shell: true, windowsHide: true });
  }
  return spawn(command, args, { cwd, env });
}

function start({ command, model, permissionMode, cwd, log, resume }) {
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

  log('INFO', `Claude : lancement de « ${command} » dans ${cwd}`);
  proc = spawnClaude(command, args, cwd);
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

function register({ handle, getRoot, readConfig, log }) {
  handle('claude:send', async (event, text) => {
    const root = getRoot();
    if (!root) throw new Error("Ouvre d'abord un dossier : Claude travaille dans le projet ouvert.");
    sender = event.sender;
    // Le projet a changé depuis le lancement : on repart sur une conversation neuve dans le bon dossier.
    if (proc && procCwd !== root) stop();
    if (!proc) {
      const config = await readConfig();
      // Claude Code s'était arrêté en cours de conversation (plantage, mise en veille…) : on la reprend.
      const resume = lastSession && lastSession.cwd === root && /^[\w-]+$/.test(lastSession.id) ? lastSession.id : null;
      start({ command: config.claudeCommand || 'claude', model: config.claudeModel, permissionMode: config.claudePermissionMode, cwd: root, log, resume });
    }
    write({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' });
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
