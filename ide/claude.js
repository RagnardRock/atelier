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
// L'IA locale (Ollama), quand Claude n'est pas là : recopiée depuis ../commun par npm install.
const ollama = require('./commun/ollama');
const lokiLocal = require('./commun/loki-local');
const outilsCommuns = require('./commun/mcp-commun');

let proc = null;          // processus Claude Code en cours
let procCwd = null;       // dossier dans lequel il a été lancé
let sender = null;        // webContents de la fenêtre qui affiche le chat
let buffer = '';          // morceau de ligne pas encore complet
let nextRequestId = 1;
let lastSession = null;   // { id, cwd } : pour reprendre la conversation si Claude Code s'arrête

function envoyerAuPanneau(event) {
  if (sender && !sender.isDestroyed()) sender.send('claude:event', event);
}

// Le moteur : Claude Code ou l'IA locale (config.lokiMoteur : auto, claude ou local), comme dans les
// autres outils (voir ../commun/claude.js). En local : lire, chercher et modifier les fichiers du
// projet, la mémoire du projet ; pas de commandes ni de web.
let moteurActif = null;
let claudeIndispo = null;
let tourAuto = null;
let basculer = null;
let session = null;
const permissionsLocales = new Map();

function emit(event) {
  if (tourAuto && basculer) {
    const raison = lokiLocal.echecClaude(event);
    if (raison) return basculer(raison);
    if (event.kind === 'result' || event.kind === 'exit' || event.kind === 'error') tourAuto = null;
  }
  envoyerAuPanneau(event);
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

// --- Les autorisations ---
// Chaque demande appartient à une famille. « Ne plus demander » vaut pour la famille, pendant la
// conversation (gardé ici) ou pour de bon (réglages). C'est nous qui répondons à Claude Code, sans
// lui confier de règles : tout se voit et se retire (bouclier du panneau, réglages).
// - fichiers : pour de bon = « Modifications de fichiers : Accepter sans demander » (claudePermissionMode) ;
// - une commande : par son début (« npm run dev », « git status »…, la suite peut changer), jamais
//   une commande enchaînée (&&, |, ;) ;
// - le reste : config.claudeSansDemander.
const FAMILLES = {
  fichiers: { libelle: 'Modifier les fichiers du projet', outils: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] },
  memoire: { libelle: 'Retenir ou oublier des infos sur le projet', outils: ['mcp__atelier__retenir_projet', 'mcp__atelier__oublier_projet'] },
  web: { libelle: 'Lire des pages et chercher sur le web', outils: ['WebFetch', 'WebSearch'] },
};
const DEUX_MOTS = new Set(['npm', 'npx', 'pnpm', 'yarn', 'git', 'node', 'composer', 'php', 'python', 'py', 'pip', 'docker', 'ssh', 'scp', 'vue', 'vite']);
const autoriseesConversation = new Set();
let lireConfig = null;
let changerConfig = null;

// La famille d'une demande, ou null (à demander chaque fois).
function familleDe(toolName, input = {}) {
  for (const [id, f] of Object.entries(FAMILLES)) if (f.outils.includes(toolName)) return id;
  if (toolName === 'Bash' || toolName === 'PowerShell') {
    const commande = String(input.command || '').trim();
    if (!commande || /[;&|<>`\n]|\$\(/.test(commande)) return null;
    const mots = commande.split(/\s+/);
    let n = DEUX_MOTS.has(mots[0].toLowerCase()) && mots[1] && !/^[-./\\]/.test(mots[1]) ? 2 : 1;
    if (n === 2 && /^(run|exec|run-script)$/.test(mots[1]) && mots[2] && !mots[2].startsWith('-')) n = 3; // npm run dev ≠ npm run build
    const debut = mots.slice(0, n);
    return `commande:${debut.join(' ')}`;
  }
  return `autre:${toolName}`;
}
function libelleFamille(id) {
  if (FAMILLES[id]) return FAMILLES[id].libelle;
  if (id.startsWith('commande:')) return `Lancer ${id.slice(9)}`;
  return id.replace(/^autre:/, '');
}
const gardable = (id) => Boolean(changerConfig) && !id.startsWith('autre:');

async function configActuelle() {
  try { return (await lireConfig?.()) || {}; } catch { return {}; }
}
const toujoursPermis = (config, id) => (id === 'fichiers' ? config.claudePermissionMode === 'acceptEdits' : Boolean(config.claudeSansDemander?.[id]));

async function garderPourDeBon(id, oui) {
  if (id === 'fichiers') return changerConfig({ claudePermissionMode: oui ? 'acceptEdits' : 'ask' });
  const sansDemander = { ...((await configActuelle()).claudeSansDemander || {}) };
  if (oui) sansDemander[id] = true; else delete sansDemander[id];
  return changerConfig({ claudeSansDemander: sansDemander });
}

function repondrePermission(requestId, toolUseId, autoriser, input) {
  const response = autoriser
    ? { behavior: 'allow', updatedInput: input, toolUseID: toolUseId }
    : { behavior: 'deny', message: "L'utilisateur a refusé.", toolUseID: toolUseId };
  write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
}

async function demanderPermission(m) {
  const { tool_name: toolName, tool_use_id: toolUseId, input } = m.request;
  const famille = familleDe(toolName, input);
  if (famille) {
    const pourDeBon = toujoursPermis(await configActuelle(), famille);
    if (pourDeBon || autoriseesConversation.has(famille)) {
      repondrePermission(m.request_id, toolUseId, true, input);
      return emit({ kind: 'permission-auto', toolUseId, famille, libelle: libelleFamille(famille), pourDeBon });
    }
  }
  emit({
    kind: 'permission',
    requestId: m.request_id,
    toolUseId,
    toolName,
    input,
    famille,
    familleLibelle: famille ? libelleFamille(famille) : '',
    gardable: Boolean(famille) && gardable(famille),
    title: m.request.title,
    description: m.request.description,
  });
}

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
    `(Rune : dans l'Atelier, tu t'appelles Loki (propulsé par Claude). Tu travailles dans le projet « ${path.basename(cwd)} ».`,
    'Ragna utilise aussi Atelier, son hub, dont l\'assistant Loki garde une mémoire par projet et voit ses notes. Tu y as accès avec les outils mcp__atelier__ :',
    'lire_contexte (la mémoire de ce projet : décisions, client, hébergement… ; lis-la avant de répondre à ce premier message,',
    'puis relis-la si Ragna parle de ce qui a été décidé), lire_notes (ses notes, quand la question s\'y rapporte),',
    'retenir_projet et oublier_projet (garde une info courte et utile plus tard quand Ragna te la demande ou te l\'apprend ;',
    'elle sera visible dans Atelier et dans les autres outils).)',
    '',
    '',
  ].join('\n');
}

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
    if (current.silencieux) return; // arrêté parce qu'on passe en local
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
  // Les serveurs de Claude ne répondent pas (limite atteinte, pas de connexion…) : en « auto », on passe en local.
  if (m.type === 'system' && m.subtype === 'api_retry') return emit({ kind: 'retry', attempt: m.attempt, max: m.max_retries, status: m.error_status });
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
    demanderPermission(m);
    return;
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

function stop({ silencieux = false } = {}) {
  session?.arreter();
  if (!proc) return;
  const current = proc;
  current.silencieux = silencieux;
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

function register({ handle, getRoot, readConfig, writeConfig, log, dataDir }) {
  lireConfig = readConfig;
  changerConfig = writeConfig || null;
  historyFile = path.join(dataDir, 'claude-conversations.json');
  communDir = path.join(path.dirname(dataDir), 'atelier-commun');
  mcpFile = path.join(dataDir, 'mcp-atelier.json');
  ollama.configurer({ commun: communDir });
  const dossierLocal = path.join(dataDir, 'loki-local');

  // --- Loki en local ---
  async function autoriserLocal({ id, nomAffiche, entree, lecture }) {
    if (lecture || LECTURE.includes(nomAffiche)) return true;
    const famille = familleDe(nomAffiche, entree);
    const pourDeBon = toujoursPermis(await configActuelle(), famille);
    if (pourDeBon || autoriseesConversation.has(famille)) {
      envoyerAuPanneau({ kind: 'permission-auto', toolUseId: id, famille, libelle: libelleFamille(famille), pourDeBon });
      return true;
    }
    const requestId = `local-${id}`;
    return new Promise((resolve) => {
      permissionsLocales.set(requestId, resolve);
      envoyerAuPanneau({ kind: 'permission', requestId, toolUseId: id, toolName: nomAffiche, input: entree, famille, familleLibelle: libelleFamille(famille), gardable: gardable(famille) });
    });
  }
  session = lokiLocal.creerSession({ log, emit: envoyerAuPanneau, autoriser: autoriserLocal, dossier: dossierLocal });
  let localCwd = null;

  async function envoyerLocal(texte) {
    const root = getRoot();
    if (localCwd && localCwd !== root) { session.reinitialiser(); autoriseesConversation.clear(); }
    localCwd = root;
    moteurActif = 'local';
    const config = await readConfig();
    const memoire = [];
    if (config.claudeAtelier !== false) {
      outilsCommuns.configurer({ commun: communDir, projet: path.basename(root) });
      for (const o of outilsCommuns.OUTILS) {
        memoire.push({
          name: o.name, description: o.description, parameters: o.inputSchema, affiche: `mcp__atelier__${o.name}`, lecture: o.name.startsWith('lire_'),
          faire: async (args) => ({ texte: await outilsCommuns.appeler(o.name, args) }),
        });
      }
    }
    const consignes = [
      `Tu es Loki, l'assistant intégré à Rune, l'éditeur de code de Ragna (développeur web, Vue.js, sous Windows), un des outils de l'Atelier.`,
      'Ici, tu tournes sur un modèle local. Réponds en français, simplement et brièvement.',
      `Tu travailles dans le projet « ${path.basename(root)} », dossier ${root}. Les chemins sont relatifs à ce dossier.`,
      'Pour les fichiers : lire_fichier, lister_fichiers, chercher_texte, modifier_fichier (remplace un passage exact), ecrire_fichier.',
      'Avant de modifier un fichier, lis-le. Ragna valide chaque modification sur une carte Autoriser / Refuser.',
      ...(memoire.length ? ['La mémoire du projet (décisions, client, hébergement…) : lire_contexte ; les notes de Ragna : lire_notes ; retenir_projet / oublier_projet pour garder une info utile plus tard.'] : []),
    ].join('\n');
    await session.envoyer(texte, { consignes, outils: [...lokiLocal.outilsFichiers(root), ...memoire] });
  }

  basculer = (raison) => {
    const texte = tourAuto?.texte;
    tourAuto = null;
    stop({ silencieux: true });
    claudeIndispo = { jusqua: Date.now() + 30 * 60_000, raison };
    log('INFO', `Loki : ${raison}, passage au modèle local`);
    ollama.reglages().then((r) => envoyerAuPanneau({ kind: 'moteur', moteur: 'local', raison, modele: r.modele }));
    if (texte) envoyerLocal(texte).catch((err) => log('ERREUR', `Loki local : ${err.message}`));
  };

  handle('claude:moteur', async (_event, choix) => {
    if (['claude', 'local', 'auto'].includes(choix) && changerConfig) await changerConfig({ lokiMoteur: choix });
    const config = await configActuelle();
    const r = await ollama.reglages();
    return { choix: config.lokiMoteur || 'auto', actif: moteurActif, indispo: claudeIndispo?.jusqua > Date.now() ? claudeIndispo.raison : null, modele: r.modele, ollama: Boolean(ollama.executable()) || Boolean(await ollama.version()) };
  });

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
    autoriseesConversation.clear();
    session.reinitialiser();
    moteurActif = null;
    if (String(sessionId).startsWith('local:')) {
      await session.reprendre(dossierLocal, sessionId);
      moteurActif = 'local';
      localCwd = getRoot();
      lastSession = null;
      return;
    }
    lastSession = sessionId && /^[\w-]+$/.test(sessionId) ? { id: sessionId, cwd: getRoot() } : null;
  });

  handle('claude:send', async (event, text) => {
    const root = getRoot();
    if (!root) throw new Error("Ouvre d'abord un dossier : Loki travaille dans le projet ouvert.");
    sender = event.sender;
    const choix = (await readConfig()).lokiMoteur || 'auto';
    const local = choix === 'local' || (choix === 'auto' && (moteurActif === 'local' || (!moteurActif && claudeIndispo?.jusqua > Date.now())));
    if (local) {
      if (moteurActif === 'claude') { stop(); autoriseesConversation.clear(); }
      return envoyerLocal(String(text));
    }
    if (moteurActif === 'local') { session.reinitialiser(); autoriseesConversation.clear(); }
    moteurActif = 'claude';
    tourAuto = choix === 'auto' ? { texte: String(text) } : null;
    // Le projet a changé depuis le lancement : on repart sur une conversation neuve dans le bon dossier.
    if (proc && procCwd !== root) { stop(); autoriseesConversation.clear(); }
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
      if (!intro) intro = "(Rune : dans l'Atelier, tu t'appelles Loki (propulsé par Claude).)\n\n";
      if (!start({ command: config.claudeCommand || 'claude', model: config.claudeModel, cwd: root, log, resume, mcpConfig })) return;
    }
    write({ type: 'user', message: { role: 'user', content: intro + text }, parent_tool_use_id: null, session_id: '' });
  });

  // Ta réponse à une demande de permission. decision : allow, deny, always (ne plus demander pour
  // cette famille pendant la conversation) ou toujours (pour de bon, dans les réglages).
  handle('claude:permission', async (_event, { requestId, toolUseId, decision, input, famille }) => {
    const local = permissionsLocales.get(String(requestId));
    if (local) { permissionsLocales.delete(String(requestId)); local(decision !== 'deny'); } else repondrePermission(String(requestId), String(toolUseId), decision !== 'deny', input);
    if (typeof famille !== 'string' || !famille) return;
    if (decision === 'always') autoriseesConversation.add(famille);
    if (decision === 'toujours' && gardable(famille)) {
      await garderPourDeBon(famille, true);
      log('INFO', `Claude : « ${libelleFamille(famille)} » autorisé sans demander, pour de bon`);
    }
  });

  // Ce que Claude peut faire sans demander : [{ id, libelle, conversation, toujours, gardable }].
  handle('claude:autorisations', async () => {
    const config = await configActuelle();
    const ids = new Set([...Object.keys(FAMILLES), ...autoriseesConversation, ...Object.keys(config.claudeSansDemander || {})]);
    return [...ids].map((id) => ({
      id, libelle: libelleFamille(id), conversation: autoriseesConversation.has(id), toujours: toujoursPermis(config, id), gardable: gardable(id),
    }));
  });
  // Redemander pour une famille (portee : conversation, toujours ou les deux), ou pour toutes (famille absente).
  handle('claude:autorisations:retirer', async (_event, { famille, portee } = {}) => {
    const config = await configActuelle();
    const ids = famille ? [String(famille)] : [...new Set([...autoriseesConversation, 'fichiers', ...Object.keys(config.claudeSansDemander || {})])];
    if (portee !== 'toujours') for (const id of ids) autoriseesConversation.delete(id);
    if (portee !== 'conversation' && changerConfig) {
      if (!famille) {
        await changerConfig({ claudePermissionMode: 'ask', claudeSansDemander: {} });
      } else if (toujoursPermis(config, famille)) {
        await garderPourDeBon(famille, false);
      }
    }
    log('INFO', `Claude : ${famille ? `« ${libelleFamille(famille)} »` : 'tout'} redemandé`);
  });

  // Bouton stop : Claude arrête ce qu'il est en train de faire, la conversation continue.
  handle('claude:interrupt', async () => {
    if (moteurActif === 'local') { session.arreter(); for (const r of permissionsLocales.values()) r(false); permissionsLocales.clear(); return; }
    write({ type: 'control_request', request_id: `interrupt-${nextRequestId++}`, request: { subtype: 'interrupt' } });
  });

  handle('claude:reset', async () => {
    lastSession = null; stop(); autoriseesConversation.clear();
    session.reinitialiser(); moteurActif = null; tourAuto = null;
    for (const r of permissionsLocales.values()) r(false);
    permissionsLocales.clear();
  });
}

module.exports = { register, stop };
