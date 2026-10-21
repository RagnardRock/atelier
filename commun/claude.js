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
//
// Les actions dans l'outil (voir l'image, la redimensionner, poser des tuiles…) : chaque outil les
// décrit dans renderer/claude-actions.js. Claude Code les appelle par mcp-commun.js, qui les transmet
// ici par un canal local (un « named pipe » de Windows, protégé par un jeton secret) ; on les passe
// à la fenêtre, qui les fait sous tes yeux, et la réponse repart par le même chemin.

const { spawn, execFile } = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
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
let tourEnCours = false;  // un message envoyé, sa réponse pas encore finie

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

// Lire ne demande jamais la permission ; retenir, oublier et les actions qui changent quelque chose
// passent par la carte.
const LECTURE = ['mcp__atelier__lire_contexte', 'mcp__atelier__lire_notes'];
let actions = [];          // actions de l'outil : [{ name, description, inputSchema, lecture }]
const enAttente = new Map(); // id d'action -> fonction qui reçoit la réponse de la fenêtre
let canal = null;          // { chemin, jeton }

// Le canal local entre mcp-commun.js et l'outil. Ouvert une fois, au premier message.
function ouvrirCanal(log) {
  if (canal) return Promise.resolve(canal);
  const nom = `atelier-outil-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const chemin = process.platform === 'win32' ? `\\\\.\\pipe\\${nom}` : path.join(os.tmpdir(), `${nom}.sock`);
  const jeton = crypto.randomBytes(24).toString('hex');
  const serveur = net.createServer((socket) => {
    let recu = '';
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    socket.on('data', async (chunk) => {
      recu += chunk;
      const i = recu.indexOf('\n');
      if (i < 0) return;
      let demande;
      try { demande = JSON.parse(recu.slice(0, i)); } catch { return socket.end(); }
      // Comparaison à durée constante : on ne laisse pas deviner le jeton.
      const ok = typeof demande.jeton === 'string' && demande.jeton.length === jeton.length
        && crypto.timingSafeEqual(Buffer.from(demande.jeton), Buffer.from(jeton));
      if (!ok) return socket.end(`${JSON.stringify({ erreur: 'Jeton refusé' })}\n`);
      const reponse = await executerAction(String(demande.outil), demande.args || {}, log);
      socket.end(`${JSON.stringify(reponse)}\n`);
    });
  });
  return new Promise((resolve, reject) => {
    serveur.once('error', reject);
    serveur.listen(chemin, () => {
      canal = { chemin, jeton };
      resolve(canal);
    });
  });
}

// La fenêtre fait l'action (renderer/claude-actions.js) et renvoie { texte, image } ou { erreur }.
function executerAction(nom, args, log) {
  if (!actions.some((a) => a.name === nom)) return Promise.resolve({ erreur: `Action inconnue : ${nom}` });
  if (!sender || sender.isDestroyed()) return Promise.resolve({ erreur: 'La fenêtre de l\'outil est fermée' });
  const id = crypto.randomUUID();
  log('INFO', `Claude : action ${nom} ${JSON.stringify(args).slice(0, 200)}`);
  return new Promise((resolve) => {
    const delai = setTimeout(() => { enAttente.delete(id); resolve({ erreur: 'L\'outil n\'a pas répondu à temps' }); }, 120_000);
    enAttente.set(id, (r) => { clearTimeout(delai); enAttente.delete(id); resolve(r); });
    sender.send('claude:action', { id, nom, args });
  });
}

// Les outils de Claude Code qu'il garde dans un outil de l'Atelier : voir et modifier les fichiers du
// projet, chercher sur le web. Tout le reste (sous-agents, tâches planifiées, worktrees…) ne sert à rien
// ici et alourdit chaque réponse. Les commandes (PowerShell, Bash, donc Python, Node…) seulement si
// Ragna les autorise dans les réglages : sans elles, Claude ne perd plus de temps à fouiller le PC
// (Get-ChildItem, « node est-il installé ? »…) et passe par les actions de l'outil.
// (Les outils mcp__atelier__ ne sont pas concernés : --tools ne trie que ceux de Claude Code.)
const OUTILS_CLAUDE = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'WebFetch', 'WebSearch', 'TodoWrite'];
const COMMANDES = ['PowerShell', 'Bash'];

function start({ command, model, cwd, log, resume, mcpConfig, consignes, commandes }) {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',                      // obligatoire avec stream-json
    '--include-partial-messages',     // le texte arrive mot par mot
    '--permission-prompt-tool=stdio', // les demandes de permission passent par nous
    '--tools', [...OUTILS_CLAUDE, ...(commandes ? COMMANDES : [])].join(','),
  ];
  if (model) args.push('--model', model);
  if (resume) args.push('--resume', resume);
  // Les consignes (où il est, ce qu'il peut faire) vont dans ses instructions de départ, à chaque
  // lancement, même en reprenant une conversation. Par un fichier : pas de souci de guillemets ni de
  // retours à la ligne avec cmd.exe.
  if (consignes) args.push('--append-system-prompt-file', consignes);
  const lecture = [...LECTURE, ...actions.filter((a) => a.lecture).map((a) => `mcp__atelier__${a.name}`)];
  // --strict-mcp-config : seulement le serveur de l'Atelier, pas les autres serveurs MCP installés sur
  // le PC (chacun se lance et ajoute ses outils à lire avant chaque réponse : c'est du temps perdu ici).
  if (mcpConfig) args.push('--mcp-config', mcpConfig, '--strict-mcp-config', '--allowedTools', ...lecture);

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
  current.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-2000);
    // Dans le journal de l'outil tout de suite : utile quand Claude semble bloqué sans rien dire.
    for (const ligne of chunk.split(/\r?\n/)) if (ligne.trim()) log('INFO', `Claude Code : ${ligne.trim().slice(0, 300)}`);
  });
  current.on('error', (err) => {
    log('ERREUR', `Claude : ${err.message}`);
    emit({ kind: 'error', notInstalled: err.code === 'ENOENT', message: err.message });
  });
  current.on('exit', (code) => {
    if (proc === current) proc = null;
    tourEnCours = false;
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
    // Ce qu'il fait quand il n'écrit rien : réfléchir, ou préparer une action (une grande carte à
    // écrire peut prendre une minute). Sans ça, le panneau semble figé.
    if (e.type === 'content_block_start' && e.content_block?.type === 'thinking') return emit({ kind: 'status', text: 'Claude réfléchit…' });
    if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') return emit({ kind: 'status', text: 'Claude prépare une action…' });
    if (e.type === 'message_start') return emit({ kind: 'status', text: 'Claude réfléchit…' });
    return;
  }
  // Les serveurs de Claude ne répondent pas (surchargés, limite d'utilisation…) : Claude Code
  // réessaie tout seul, parfois longtemps. On le dit au lieu de mouliner en silence.
  if (m.type === 'system' && m.subtype === 'api_retry') {
    return emit({ kind: 'retry', attempt: m.attempt, max: m.max_retries, delayMs: m.retry_delay_ms, status: m.error_status, error: m.error });
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
    tourEnCours = false;
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

// outil : { nom: 'Skald', role: "l'éditeur d'images de Ragna (retouche, logos, PSD)", consignes: '…' }
// (consignes : ce que Claude doit savoir en plus dans cet outil, en Markdown ; facultatif)
function register({ handle, log, dataDir, readConfig, outil }) {
  historyFile = path.join(dataDir, 'claude-conversations.json');
  communDir = path.join(path.dirname(dataDir), 'atelier-commun');
  const mcpFile = path.join(dataDir, 'mcp-atelier.json');
  const actionsFile = path.join(dataDir, 'mcp-actions.json');
  // Sans projet, Claude travaille dans un dossier à lui (rien à y casser).
  const dossierSansProjet = path.join(dataDir, 'claude');

  async function cwdActuel() {
    const p = await projet();
    if (p) return { cwd: p.dossier, nom: p.nom };
    await fsp.mkdir(dossierSansProjet, { recursive: true });
    return { cwd: dossierSansProjet, nom: '' };
  }

  async function ecrireConfigMcp(nom) {
    const env = { ELECTRON_RUN_AS_NODE: '1', ATELIER_COMMUN: communDir, ATELIER_PROJET: nom };
    if (actions.length) {
      try {
        const { chemin, jeton } = await ouvrirCanal(log);
        await fsp.writeFile(actionsFile, JSON.stringify(actions, null, 2), 'utf8');
        Object.assign(env, { ATELIER_CANAL: chemin, ATELIER_JETON: jeton, ATELIER_ACTIONS: actionsFile });
      } catch (err) {
        log('ERREUR', `Claude : canal des actions impossible à ouvrir : ${err.message}`);
      }
    }
    // Dans l'outil installé, le script est hors de l'archive app.asar (package.json › build › asarUnpack) :
    // Electron en mode Node ne lance pas un script rangé dans l'archive.
    const script = path.join(__dirname, 'mcp-commun.js').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    const config = { mcpServers: { atelier: { command: process.execPath, args: [script], env } } };
    await fsp.writeFile(mcpFile, JSON.stringify(config, null, 2), 'utf8');
    return mcpFile;
  }

  // Les consignes données à Claude Code à chaque lancement (--append-system-prompt-file) : où il est,
  // la mémoire du projet (déjà lue, pour qu'il n'ait pas à la demander), ce qu'il peut faire, et
  // surtout qu'il ne doit pas explorer le PC comme pour du code. Tu ne les vois pas dans le panneau.
  const consignesFile = path.join(dataDir, 'claude-consignes.md');

  async function memoireProjet(nom) {
    if (!nom) return '';
    try {
      const infos = JSON.parse(await fsp.readFile(path.join(communDir, 'memoire-projets.json'), 'utf8'))[nom];
      return Array.isArray(infos) ? infos.map((m) => `- ${m.texte} (id : ${m.id})`).join('\n') : '';
    } catch {
      return '';
    }
  }

  async function ecrireConsignes(nom, cwd, commandes) {
    const memoire = await memoireProjet(nom);
    const texte = [
      `# Tu es dans ${outil.nom}`,
      '',
      `Tu es le Claude intégré à ${outil.nom}, ${outil.role}, un des outils de l'Atelier de Ragna. Ragna te parle`,
      `depuis le panneau Claude de ${outil.nom}, en français : réponds en français, simplement et brièvement.`,
      'Tu n\'es pas ici pour coder : tu aides Ragna à faire son travail dans cet outil.',
      '',
      nom
        ? `Le projet en cours est « ${nom} », dans le dossier ${cwd} (ton dossier de travail).`
        : `Aucun projet n'est ouvert : ton dossier de travail (${cwd}) est un dossier vide, propre à ${outil.nom}.`,
      ...(nom ? ['', `## Mémoire du projet ${nom}`, '', memoire || '(rien de retenu pour l\'instant)',
        '', '(Déjà lue pour toi : lire_contexte ne sert qu\'à la relire plus tard.)'] : []),
      '',
      '## Comment travailler',
      '',
      ...(actions.length ? [
        `- Passe d'abord par les outils mcp__atelier__ de ${outil.nom} : ils lisent et changent ce qui est ouvert`,
        '  dans la fenêtre, sous les yeux de Ragna, et s\'annulent avec Ctrl+Z. Ils couvrent presque tout.',
        ...(actions.some((x) => x.name === 'menu') ? ['  L\'action « menu » donne en plus toutes les commandes des menus.'] : []),
        '  Regarde avant d\'agir (les actions de lecture et « voir » sont immédiates) et vérifie après.',
        '- Ragna valide chaque modification sur une carte Autoriser / Refuser : quand Ragna te demande quelque',
        '  chose, fais-le directement, sans le reproposer d\'abord.',
      ] : []),
      '- N\'explore pas l\'ordinateur : pas de recherche de programmes (node, python…), pas de listage de dossiers',
      '  « pour voir ». Tout ce qu\'il te faut est ici ou dans les outils de l\'Atelier.',
      commandes
        ? '- Tu peux lancer des commandes (Ragna l\'a permis dans les réglages), mais seulement quand aucune action ne convient.'
        : '- Tu ne peux pas lancer de commandes (PowerShell, Python…) : Ragna ne l\'a pas permis. Pour les fichiers du projet, tu as Read, Glob, Grep, Edit et Write.',
      '- lire_notes lit les notes de Ragna (quand la question s\'y rapporte) ; retenir_projet / oublier_projet',
      '  gardent une info courte et utile plus tard, quand Ragna te la demande ou te l\'apprend (visible dans',
      '  Atelier et les autres outils).',
      ...(outil.consignes ? ['', `## Dans ${outil.nom}`, '', outil.consignes] : []),
      '',
    ].join('\n');
    await fsp.writeFile(consignesFile, texte, 'utf8');
    return consignesFile;
  }

  handle('claude:projet', async () => projet());

  // Les actions de l'outil, décrites par sa fenêtre (renderer/claude-actions.js) au démarrage.
  handle('claude:actions', async (_event, liste) => {
    if (!Array.isArray(liste)) return;
    actions = liste.filter((a) => /^[a-z_]{1,40}$/.test(a?.name)).map(({ name, description, inputSchema, lecture }) => ({
      name, description: String(description || ''), inputSchema: inputSchema || { type: 'object', properties: {} }, lecture: Boolean(lecture),
    }));
  });
  handle('claude:actionFaite', async (_event, id, resultat) => enAttente.get(id)?.(resultat));

  // Fichier écrit par une action (un export) : seulement dans le dossier du projet en cours.
  handle('claude:ecrireFichier', async (_event, chemin, bytes) => {
    const { cwd } = await cwdActuel();
    const full = path.resolve(cwd, String(chemin));
    const rel = path.relative(cwd, full);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Claude ne peut écrire que dans le dossier du projet (${cwd})`);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, Buffer.from(bytes));
    return full;
  });
  // Fichier lu par une action (ouvrir une image du projet) : aussi seulement dans ce dossier.
  handle('claude:lireFichier', async (_event, chemin) => {
    const { cwd } = await cwdActuel();
    const full = path.resolve(cwd, String(chemin));
    const rel = path.relative(cwd, full);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Claude ne peut ouvrir que des fichiers du projet (${cwd})`);
    return { path: full, name: path.basename(full), bytes: await fsp.readFile(full) };
  });

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
    if (!proc) {
      const config = await readConfig();
      const resume = lastSession && lastSession.cwd === cwd && /^[\w-]+$/.test(lastSession.id) ? lastSession.id : null;
      const commandes = Boolean(config.claudeCommandes);
      let mcpConfig = null;
      let consignes = null;
      try {
        mcpConfig = await ecrireConfigMcp(nom);
      } catch (err) {
        log('ERREUR', `Claude : dossier partagé de l'Atelier indisponible : ${err.message}`);
      }
      try {
        consignes = await ecrireConsignes(nom, cwd, commandes);
      } catch (err) {
        log('ERREUR', `Claude : consignes impossibles à écrire : ${err.message}`);
      }
      if (!start({ command: config.claudeCommand || 'claude', model: config.claudeModel, cwd, log, resume, mcpConfig, consignes, commandes })) return;
    }
    tourEnCours = true;
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
        // « Toujours autoriser » : les règles proposées par Claude Code (pour cette conversation).
        ...(decision === 'always' && suggestions?.length ? { updatedPermissions: suggestions } : {}),
      };
    write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  });

  handle('claude:interrupt', async () => {
    write({ type: 'control_request', request_id: `interrupt-${nextRequestId++}`, request: { subtype: 'interrupt' } });
    // S'il ne s'arrête pas de lui-même (vraiment bloqué), on arrête Claude Code : la conversation
    // reprendra au prochain message (--resume).
    const current = proc;
    setTimeout(() => {
      if (tourEnCours && proc === current) {
        log('INFO', 'Claude : pas d\'arrêt après 5 s, Claude Code est arrêté');
        stop();
      }
    }, 5000);
  });
  handle('claude:reset', async () => { lastSession = null; stop(); });
}

module.exports = { register, stop, setProjet };
