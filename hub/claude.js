// Widget Claude : on fait tourner Claude Code (la commande `claude` installée sur ton PC, avec ton
// compte Claude habituel) en arrière-plan, exactement comme le panneau Claude de Rune (ide/claude.js).
//
// Claude Code est lancé en mode "headless" : il lit et écrit des messages JSON, un par ligne
// (stream-json). Atelier lui envoie tes messages, il renvoie sa réponse au fil de l'eau.
//
// Ce qui change par rapport à Rune :
// - Il travaille dans %APPDATA%\atelier-hub\claude. Avant chacun de tes messages, Atelier y écrit
//   tes notes (notes.md), ton calendrier (calendrier.md) et l'état de tes projets récents avec leurs
//   derniers commits (projets.md). Claude les lit avec son outil Read.
// - Ses seuls outils « fichiers » sont ceux de lecture (Read, Glob, Grep) : il ne peut ni modifier
//   un fichier ni lancer une commande.
// - Il peut aussi lire les fichiers de ton dossier de projets (--add-dir), si le réglage est coché.
// - Ses actions dans Atelier (ajouter une note, un évènement, lancer un minuteur, ouvrir un projet…)
//   passent par un petit serveur MCP, mcp-atelier.js, le seul qu'il voit (--strict-mcp-config).
//   Avant chaque action, Claude Code demande la permission : le widget t'affiche une carte
//   Autoriser / Refuser / Toujours autoriser. « Toujours » vaut pour toute la famille d'actions
//   (notes, calendrier, minuteurs, projets) et se change dans les réglages d'Atelier.
//   Toute autre demande de permission est refusée d'office.
// Le presse-papiers n'est jamais donné à Claude (il peut contenir un mot de passe).

const { spawn, execFile } = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

let proc = null;          // processus Claude Code en cours
let sender = null;        // webContents de la fenêtre d'Atelier
let buffer = '';          // morceau de ligne pas encore complet
let nextRequestId = 1;
let lastSessionId = null; // pour reprendre la conversation (après un arrêt, ou au redémarrage d'Atelier)
let procOptions = '';     // réglages avec lesquels il a été lancé : s'ils changent, on le relance
let lireConfig = null;     // readConfig de main.js
// Reprise d'une conversation que Claude Code a oubliée (il efface les plus anciennes, par défaut au
// bout de 30 jours) : on relance sans --resume et on renvoie le message en attente.
let lancement = null;      // options du dernier lancement
let initRecu = false;      // Claude Code a démarré la conversation
let messageEnAttente = null;
const PREFIXE_ACTIONS = 'mcp__atelier__'; // nom des outils du serveur MCP d'Atelier vus par Claude Code
// Les familles d'actions : chacune peut être autorisée une fois pour toutes (config.claudeSansDemander).
const FAMILLES = {
  ajouter_note: 'notes', modifier_note: 'notes', supprimer_note: 'notes',
  ajouter_evenement: 'calendrier', modifier_evenement: 'calendrier', supprimer_evenement: 'calendrier',
  lancer_minuteur: 'minuteurs',
  ouvrir_projet: 'projets', lancer_outil: 'projets',
  retenir_projet: 'memoire', oublier_projet: 'memoire',
};
const actionsActives = (config) => config.claudeActions !== false;

function emit(event) {
  if (sender && !sender.isDestroyed()) sender.send('claude:event', event);
}

function write(message) {
  if (proc && proc.stdin.writable) proc.stdin.write(`${JSON.stringify(message)}\n`);
}

// Sous Windows, on cherche nous-mêmes le vrai programme (claude.exe, ou claude.cmd installé par
// npm) dans le PATH, comme dans Rune : sinon Windows chercherait d'abord dans le dossier courant.
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
  delete env.CLAUDECODE; // si Atelier a été lancé depuis Claude Code, ce ne doit pas être vu comme imbriqué
  if (process.platform === 'win32') {
    const file = findWindowsCommand(command);
    if (!file) {
      const err = new Error(`commande introuvable : ${command}`);
      err.code = 'ENOENT';
      throw err;
    }
    // Un .exe se lance directement. Un .cmd ou .bat (installation npm) a besoin de cmd.exe, qui
    // coupe les arguments aux espaces : ceux qui en contiennent (un dossier) sont mis entre guillemets.
    if (path.extname(file).toLowerCase() === '.exe') return spawn(file, args, { cwd, env, windowsHide: true });
    const quoted = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '')}"` : a));
    return spawn(`"${file}"`, quoted, { cwd, env, shell: true, windowsHide: true });
  }
  return spawn(command, args, { cwd, env });
}

function start(options) {
  const { command, model, cwd, addDir, mcpConfig, log } = options;
  lancement = options;
  initRecu = false;
  const reprise = Boolean(lastSessionId);
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',                      // obligatoire avec stream-json
    '--include-partial-messages',     // le texte arrive mot par mot
    '--permission-prompt-tool=stdio', // les demandes de permission passent par Atelier (qui les refuse)
    '--tools', 'Read,Glob,Grep',      // lecture seule
    '--strict-mcp-config',            // aucun serveur MCP
  ];
  if (model) args.push('--model', model);
  if (addDir) args.push('--add-dir', addDir);
  if (mcpConfig) args.push('--mcp-config', mcpConfig);
  if (lastSessionId) args.push('--resume', lastSessionId);

  log('INFO', `Claude : lancement de « ${command} » dans ${cwd}${lastSessionId ? ' (reprise de la conversation)' : ''}`);
  try {
    proc = spawnClaude(command, args, cwd);
  } catch (err) {
    log('ERREUR', `Claude : ${err.message}`);
    emit({ kind: 'error', notInstalled: err.code === 'ENOENT', message: err.message });
    return false;
  }
  buffer = '';
  const current = proc;
  let stderr = '';

  current.stdout.setEncoding('utf8');
  current.stdout.on('data', (chunk) => {
    if (proc !== current) return;
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
        stderr = (stderr + line).slice(-2000); // ligne qui n'est pas du JSON (avertissement…) : gardée pour le journal
        continue;
      }
      handleMessage(message, log);
    }
  });
  current.stderr.setEncoding('utf8');
  current.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  current.on('error', (err) => {
    log('ERREUR', `Claude : ${err.message}`);
    emit({ kind: 'error', notInstalled: err.code === 'ENOENT', message: err.message });
  });
  current.on('exit', (code) => {
    if (proc !== current) return; // arrêté exprès (nouvelle conversation, réglages changés)
    proc = null;
    if (reprise && !initRecu && /no conversation found/i.test(stderr)) {
      log('INFO', `Claude : conversation ${lastSessionId} introuvable, nouvelle conversation`);
      lastSessionId = null;
      emit({ kind: 'oubliee' });
      if (start(lancement) && messageEnAttente) write(messageEnAttente);
      return;
    }
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
function handleMessage(m, log) {
  if (m.type === 'system' && m.subtype === 'init') {
    lastSessionId = m.session_id;
    initRecu = true;
    messageEnAttente = null;
    return emit({ kind: 'init', model: m.model, sessionId: m.session_id });
  }
  if (m.type === 'stream_event') {
    const e = m.event;
    if (m.parent_tool_use_id) return;
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
  // Demande de permission.
  if (m.type === 'control_request' && m.request?.subtype === 'can_use_tool') {
    const { tool_name: nom, tool_use_id: toolUseId, input } = m.request;
    const action = nom.startsWith(PREFIXE_ACTIONS) ? nom.slice(PREFIXE_ACTIONS.length) : null;
    const famille = FAMILLES[action];
    // Pas une action d'Atelier (modifier un fichier, lancer une commande…) : refusée sans te déranger.
    if (!famille) {
      repondrePermission(m.request_id, toolUseId, false, input);
      log('INFO', `Claude : permission refusée pour ${nom}`);
      return emit({ kind: 'denied', toolName: nom, input });
    }
    // Une action d'Atelier : autorisée d'office si sa famille est en « sans demander »,
    // sinon la carte Autoriser / Refuser du widget.
    lireConfig().then((config) => {
      if (!actionsActives(config)) return repondrePermission(m.request_id, toolUseId, false, input);
      if (config.claudeSansDemander?.[famille]) return repondrePermission(m.request_id, toolUseId, true, input);
      emit({ kind: 'permission', requestId: m.request_id, toolUseId, action, famille, input });
    });
    return;
  }
  if (m.type === 'result') {
    return emit({ kind: 'result', isError: Boolean(m.is_error) || m.subtype !== 'success', text: m.result, sessionId: m.session_id });
  }
}

function repondrePermission(requestId, toolUseId, autoriser, input) {
  const response = autoriser
    ? { behavior: 'allow', updatedInput: input, toolUseID: toolUseId }
    : { behavior: 'deny', message: 'Refusé : dans Atelier, Claude peut lire, et agir seulement avec les actions d\'Atelier autorisées par Ragna.', toolUseID: toolUseId };
  write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
}

// --- Canal entre le serveur MCP (mcp-atelier.js) et Atelier ---
// Un « named pipe » de Windows (un fichier socket ailleurs), ouvert seulement sur ce PC, avec un nom
// et un jeton tirés au hasard à chaque démarrage d'Atelier. Chaque action reçue est confiée à
// l'interface (les widgets), qui renvoie le résultat.
let canal = null;              // { chemin, jeton }
const enAttente = new Map();   // id d'action -> resolve

function ouvrirCanal(log) {
  if (canal) return Promise.resolve(canal);
  const nom = `atelier-claude-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
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
      const reponse = await executerAction(demande.outil, demande.args || {}, log);
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

function executerAction(outil, args, log) {
  if (!sender || sender.isDestroyed()) return Promise.resolve({ erreur: 'La fenêtre d\'Atelier est fermée' });
  const id = crypto.randomUUID();
  log('INFO', `Claude : action ${outil} ${JSON.stringify(args).slice(0, 200)}`);
  return new Promise((resolve) => {
    const delai = setTimeout(() => { enAttente.delete(id); resolve({ erreur: 'Atelier n\'a pas répondu à temps' }); }, 60_000);
    enAttente.set(id, (r) => { clearTimeout(delai); enAttente.delete(id); resolve(r); });
    sender.send('claude:action', { id, outil, args });
  });
}

// Le fichier qui dit à Claude Code comment lancer le serveur MCP d'Atelier : avec Electron lui-même,
// en mode Node. Dans Atelier installé, le script est hors de l'archive app.asar (build › asarUnpack).
async function ecrireConfigMcp(cwd, log) {
  const { chemin, jeton } = await ouvrirCanal(log);
  const script = path.join(__dirname, 'mcp-atelier.js').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const config = {
    mcpServers: {
      atelier: {
        command: process.execPath,
        args: [script],
        env: { ELECTRON_RUN_AS_NODE: '1', ATELIER_CANAL: chemin, ATELIER_JETON: jeton },
      },
    },
  };
  const fichier = path.join(cwd, 'mcp.json');
  await fsp.writeFile(fichier, JSON.stringify(config, null, 2), 'utf8');
  return fichier;
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

// --- Fichiers de contexte ---
// Écrits en Markdown, lisibles par toi aussi (bouton « Ouvrir le dossier » du widget).

const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dateHeure = (ms) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function notesMd(notes) {
  const triees = [...notes].sort((a, b) => (b.epinglee - a.epinglee) || (b.modifiee - a.modifiee));
  const lignes = [`# Notes de Ragna (${notes.length})`, '', 'Écrites dans le widget Notes d\'Atelier. La première ligne de chaque note est son titre.', ''];
  for (const n of triees) {
    const titre = n.texte.split('\n').find((l) => l.trim())?.trim().replace(/^#+\s*/, '') || 'Sans titre';
    lignes.push('---', '', `## ${titre}`, '', `_id : ${n.id} · ${n.epinglee ? 'épinglée · ' : ''}modifiée le ${dateHeure(n.modifiee)}_`, '', n.texte.trim(), '');
  }
  if (!notes.length) lignes.push('(aucune note pour l\'instant)');
  return lignes.join('\n');
}

function calendrierMd(evenements, maintenant) {
  const auj = new Date(maintenant);
  const cleAuj = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}-${String(auj.getDate()).padStart(2, '0')}`;
  const tries = [...evenements].sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
  const ligne = (e) => `- ${e.date}${e.heure ? ` ${e.heure}` : ' (journée)'} : ${e.titre}${e.note ? ` (note : ${e.note.replace(/\n/g, ' ')})` : ''} [id : ${e.id}]`;
  const passes = tries.filter((e) => e.date < cleAuj);
  const lignes = [
    '# Calendrier de Ragna',
    '',
    `Aujourd'hui : ${jour(maintenant)} (${cleAuj}). Dates au format AAAA-MM-JJ, heures locales.`,
    '',
    '## Aujourd\'hui et à venir',
    '',
    ...(tries.filter((e) => e.date >= cleAuj).map(ligne)),
    '',
    '## Passés (les 30 plus récents)',
    '',
    ...(passes.length ? passes.slice(-30).map(ligne) : ['(aucun)']),
  ];
  if (!evenements.length) lignes.push('', '(aucun évènement)');
  return lignes.join('\n');
}

// Pour chaque projet : son état Git et ce qui a bougé ces 30 derniers jours (commits de toutes les
// branches, fichiers modifiés pas encore commités).
async function detailsGit(folder, run) {
  if (!fs.existsSync(path.join(folder, '.git'))) return null;
  const opts = { cwd: folder, timeout: 8000 };
  const [commits, status] = await Promise.all([
    run('git', ['log', '--all', '--no-merges', '--since=30.days', '-n', '12', '--date=format:%Y-%m-%d %H:%M', '--format=%ad%x09%D%x09%s'], opts).catch(() => ''),
    run('git', ['status', '--porcelain'], opts).catch(() => ''),
  ]);
  return {
    commits: commits.split('\n').filter(Boolean).map((l) => {
      const [date, refs, ...sujet] = l.split('\t');
      return { date, refs, sujet: sujet.join('\t') };
    }),
    fichiers: status.split('\n').filter(Boolean).map((l) => l.slice(3).trim()),
  };
}

async function projetsMd(liste, run) {
  if (!liste.existe) return `# Projets de Ragna\n\nLe dossier des projets (${liste.racine || 'aucun'}) n'existe pas.`;
  const details = await Promise.all(liste.projets.map((p) => detailsGit(p.dossier, run)));
  const lignes = [
    '# Projets de Ragna',
    '',
    `Dossier des projets : ${liste.racine}. Du plus récemment touché au plus ancien (${liste.projets.length} sur ${liste.total}).`,
    'Pour chaque projet : type, outil qui l\'ouvre (Rune = IDE, Skald = retouche d\'images), dernière activité,',
    'état Git (branche, fichiers modifiés pas encore commités, commits pas encore poussés / à récupérer)',
    'et les commits des 30 derniers jours, toutes branches confondues.',
    '« Mémoire » : ce que tu as retenu toi-même sur le projet (actions retenir_projet / oublier_projet),',
    'gardé d\'une conversation à l\'autre. Ragna peut aussi le modifier dans le widget Projets récents.',
    '',
  ];
  const memoireMd = (infos) => {
    if (!infos?.length) return;
    lignes.push('- Mémoire :');
    for (const m of infos) lignes.push(`  - ${m.texte.replace(/\n/g, ' ')} [id : ${m.id}, ${new Date(m.quand).toLocaleDateString('fr-FR')}]`);
  };
  liste.projets.forEach((p, i) => {
    const d = details[i];
    lignes.push(`## ${p.nom}`, '');
    lignes.push(`- Dossier : ${p.dossier}`);
    lignes.push(`- Type : ${p.type || 'inconnu'} · s'ouvre dans ${p.outil === 'skald' ? 'Skald' : p.outil === 'explorateur' ? 'l\'Explorateur' : 'Rune'}`);
    lignes.push(`- Dernière activité : ${p.activite ? dateHeure(p.activite) : 'inconnue'}`);
    if (p.git) {
      lignes.push(`- Git : branche ${p.git.branche}, ${p.git.modifies} fichier(s) modifié(s) non commité(s)`
        + `${p.git.aPousser ? `, ${p.git.aPousser} commit(s) à pousser` : ''}${p.git.aRecuperer ? `, ${p.git.aRecuperer} commit(s) à récupérer` : ''}`
        + `${p.git.aPousser === null ? ' (branche pas reliée à GitHub)' : ''}`);
    } else {
      lignes.push('- Pas un dépôt Git');
    }
    if (d?.fichiers.length) lignes.push(`- Fichiers modifiés : ${d.fichiers.slice(0, 15).join(', ')}${d.fichiers.length > 15 ? `, et ${d.fichiers.length - 15} autres` : ''}`);
    if (d?.commits.length) {
      lignes.push('- Commits des 30 derniers jours :');
      for (const c of d.commits) lignes.push(`  - ${c.date}${c.refs ? ` [${c.refs}]` : ''} : ${c.sujet}`);
    } else if (d) {
      lignes.push('- Aucun commit ces 30 derniers jours');
    }
    memoireMd(p.memoire);
    lignes.push('');
  });
  // Projets plus anciens (hors des plus récents) dont tu as retenu quelque chose.
  const affiches = new Set(liste.projets.map((p) => p.nom));
  const autres = Object.entries(liste.memoire || {}).filter(([nom, infos]) => !affiches.has(nom) && infos?.length);
  if (autres.length) {
    lignes.push('# Projets plus anciens avec une mémoire', '');
    for (const [nom, infos] of autres) {
      lignes.push(`## ${nom}${liste.noms?.includes(nom) ? '' : ' (dossier introuvable)'}`, '');
      memoireMd(infos);
      lignes.push('');
    }
  }
  return lignes.join('\n');
}

// Instructions pour Claude, lues par Claude Code au lancement (CLAUDE.md du dossier de travail).
function claudeMd(addDir, actions) {
  return [
    '# Assistant d\'Atelier',
    '',
    'Tu es l\'assistant intégré à Atelier, le hub d\'outils de Ragna (développeur web, sous Windows).',
    'Réponds en français, simplement et brièvement, avec des listes quand c\'est plus clair.',
    '',
    'Ce dossier contient trois fichiers, réécrits par Atelier avant chaque message de Ragna :',
    '- notes.md : toutes les notes du widget Notes ;',
    '- calendrier.md : les évènements du calendrier, avec la date du jour ;',
    '- projets.md : les projets récents, leur état Git et leurs commits des 30 derniers jours.',
    '',
    'Lis le ou les fichiers utiles avant de répondre, et relis-les à chaque question : ils changent.',
    'Pour dire quels projets ont avancé, appuie-toi sur les commits récents, les fichiers modifiés et la date d\'activité.',
    addDir
      ? `Tu peux aussi lire les fichiers des projets eux-mêmes, dans ${addDir}, si la question le demande.`
      : 'Tu ne peux pas lire les fichiers des projets eux-mêmes : seulement ces trois fichiers.',
    ...(actions
      ? [
        'Tu ne peux ni modifier de fichier ni lancer de commande. Mais tu peux agir dans Atelier avec ses outils',
        '(mcp__atelier__…) : ajouter, modifier ou supprimer une note ou un évènement (avec leur id, donné dans',
        'notes.md et calendrier.md), lancer un minuteur, ouvrir un projet, lancer un des outils d\'Atelier.',
        'Tu as aussi une mémoire par projet (retenir_projet, oublier_projet), recopiée dans projets.md :',
        'retiens-y ce qui sera utile plus tard (décisions, client, hébergement, étapes restantes…) quand',
        'Ragna te le demande ou te l\'apprend. Une info courte et datée par élément ; oublie ce qui n\'est plus vrai.',
        'Atelier demande à Ragna de valider tes actions (sauf celles autorisées pour toujours) : quand Ragna',
        'te demande quelque chose, fais-le directement, sans le reproposer d\'abord.',
        'Pour modifier une note, envoie son texte complet. Les dates sont au format AAAA-MM-JJ.',
      ]
      : [
        'Tu ne peux rien modifier ni lancer de commande : si Ragna te demande d\'ajouter une note ou un évènement,',
        'propose-lui le texte à copier dans le widget correspondant.',
      ]),
    '',
  ].join('\n');
}

function register({ handle, log, dataDir, readConfig, readJson, notesPath, donneesPath, listeProjets, run }) {
  const cwd = path.join(dataDir, 'claude');
  lireConfig = readConfig;
  const empreintes = {}; // contenu de chaque fichier au dernier message, pour dire à Claude ce qui a changé

  // Réécrit les fichiers de contexte. Renvoie les noms de ceux qui ont changé depuis le dernier message.
  async function preparerContexte(addDir, actions) {
    await fsp.mkdir(cwd, { recursive: true });
    const maintenant = Date.now();
    const [notes, evenements, projets] = await Promise.all([
      readJson(notesPath(), []),
      readJson(donneesPath('calendrier'), []),
      listeProjets(),
    ]);
    const fichiers = {
      'CLAUDE.md': claudeMd(addDir, actions),
      'notes.md': notesMd(Array.isArray(notes) ? notes : []),
      'calendrier.md': calendrierMd(Array.isArray(evenements) ? evenements : [], maintenant),
      'projets.md': await projetsMd(projets, run),
    };
    const changes = [];
    for (const [nom, contenu] of Object.entries(fichiers)) {
      if (empreintes[nom] !== undefined && empreintes[nom] !== contenu && nom !== 'CLAUDE.md') changes.push(nom);
      empreintes[nom] = contenu;
      await fsp.writeFile(path.join(cwd, nom), contenu, 'utf8');
    }
    return changes;
  }

  handle('claude:send', async (event, text) => {
    sender = event.sender;
    const config = await readConfig();
    const projetsDir = config.dossierProjets && fs.existsSync(config.dossierProjets) ? path.resolve(config.dossierProjets) : null;
    const addDir = config.claudeLitProjets !== false ? projetsDir : null;
    const actions = actionsActives(config);
    const changes = await preparerContexte(addDir, actions);
    // Réglages changés depuis le lancement (commande, modèle, accès aux projets, actions) : on relance,
    // la conversation reprend là où elle en était (--resume).
    const options = JSON.stringify([config.claudeCommand, config.claudeModel, addDir, actions]);
    if (proc && options !== procOptions) stop();
    if (!proc) {
      procOptions = options;
      let mcpConfig = null;
      if (actions) {
        try {
          mcpConfig = await ecrireConfigMcp(cwd, log);
        } catch (err) {
          log('ERREUR', `Claude : canal des actions impossible à ouvrir : ${err.message}`);
          emit({ kind: 'notice', message: `Les actions dans Atelier sont indisponibles (${err.message}) : Claude pourra seulement lire.` });
        }
      }
      if (!start({ command: config.claudeCommand || 'claude', model: config.claudeModel, cwd, addDir, mcpConfig, log })) return;
    }
    // Petite précision invisible pour toi : ce qui a changé depuis ton message précédent.
    const prefixe = changes.length ? `(Atelier : ${changes.join(', ')} ${changes.length > 1 ? 'ont changé' : 'a changé'} depuis mon message précédent.)\n\n` : '';
    const message = { type: 'user', message: { role: 'user', content: prefixe + text }, parent_tool_use_id: null, session_id: '' };
    if (!initRecu) messageEnAttente = message;
    write(message);
  });

  // Ta réponse sur la carte Autoriser / Refuser.
  handle('claude:permission', async (_event, { requestId, toolUseId, autoriser, input }) => {
    repondrePermission(String(requestId), String(toolUseId), Boolean(autoriser), input);
  });
  // Résultat d'une action, exécutée par les widgets.
  handle('claude:actionFaite', async (_event, id, resultat) => enAttente.get(id)?.(resultat));

  // Bouton stop : Claude arrête ce qu'il est en train de faire, la conversation continue.
  handle('claude:interrupt', async () => {
    write({ type: 'control_request', request_id: `interrupt-${nextRequestId++}`, request: { subtype: 'interrupt' } });
  });

  // Nouvelle conversation.
  handle('claude:reset', async () => { lastSessionId = null; messageEnAttente = null; stop(); });

  // Au démarrage d'Atelier, ou en rouvrant une conversation de la liste : elle reprend au prochain message.
  handle('claude:reprendre', async (_event, sessionId) => {
    if (!proc) lastSessionId = typeof sessionId === 'string' && /^[\w-]+$/.test(sessionId) ? sessionId : null;
  });

  dossierContexte = cwd;
}

// Le dossier des fichiers de contexte (bouton « Ouvrir le dossier » du widget).
let dossierContexte = null;
async function dossier() {
  await fsp.mkdir(dossierContexte, { recursive: true });
  return dossierContexte;
}

module.exports = { register, stop, dossier };
