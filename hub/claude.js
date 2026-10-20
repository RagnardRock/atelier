// Widget Claude : on fait tourner Claude Code (la commande `claude` installée sur ton PC, avec ton
// compte Claude habituel) en arrière-plan, exactement comme le panneau Claude de Rune (ide/claude.js).
//
// Claude Code est lancé en mode "headless" : il lit et écrit des messages JSON, un par ligne
// (stream-json). Atelier lui envoie tes messages, il renvoie sa réponse au fil de l'eau.
//
// Ce qui change par rapport à Rune : ici Claude ne fait que LIRE.
// - Il travaille dans %APPDATA%\atelier-hub\claude. Avant chacun de tes messages, Atelier y écrit
//   tes notes (notes.md), ton calendrier (calendrier.md) et l'état de tes projets récents avec leurs
//   derniers commits (projets.md). Claude les lit avec son outil Read.
// - Il n'a que les outils de lecture (Read, Glob, Grep) : il ne peut ni modifier un fichier ni
//   lancer une commande. S'il demande quand même une permission, Atelier la refuse tout seul.
// - Il peut aussi lire les fichiers de ton dossier de projets (--add-dir), si le réglage est coché.
// - Pas de serveurs MCP (--strict-mcp-config) : rien d'autre que ces outils de lecture.
// Le presse-papiers n'est jamais donné à Claude (il peut contenir un mot de passe).

const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

let proc = null;          // processus Claude Code en cours
let sender = null;        // webContents de la fenêtre d'Atelier
let buffer = '';          // morceau de ligne pas encore complet
let nextRequestId = 1;
let lastSessionId = null; // pour reprendre la conversation (après un arrêt, ou au redémarrage d'Atelier)
let procOptions = '';     // réglages avec lesquels il a été lancé : s'ils changent, on le relance

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

function start({ command, model, cwd, addDir, log }) {
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
        continue; // ligne qui n'est pas du JSON (avertissement…) : ignorée
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
  // Demande de permission : le widget ne fait que lire, on refuse sans te déranger.
  if (m.type === 'control_request' && m.request?.subtype === 'can_use_tool') {
    log('INFO', `Claude : permission refusée pour ${m.request.tool_name}`);
    write({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: m.request_id,
        response: { behavior: 'deny', message: 'Dans Atelier, Claude ne peut que lire les fichiers de contexte et ceux des projets.', toolUseID: m.request.tool_use_id },
      },
    });
    return emit({ kind: 'denied', toolName: m.request.tool_name, input: m.request.input });
  }
  if (m.type === 'result') {
    return emit({ kind: 'result', isError: Boolean(m.is_error) || m.subtype !== 'success', text: m.result, sessionId: m.session_id });
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

// --- Fichiers de contexte ---
// Écrits en Markdown, lisibles par toi aussi (bouton « Ouvrir le dossier » du widget).

const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dateHeure = (ms) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function notesMd(notes) {
  const triees = [...notes].sort((a, b) => (b.epinglee - a.epinglee) || (b.modifiee - a.modifiee));
  const lignes = [`# Notes de Ragna (${notes.length})`, '', 'Écrites dans le widget Notes d\'Atelier. La première ligne de chaque note est son titre.', ''];
  for (const n of triees) {
    const titre = n.texte.split('\n').find((l) => l.trim())?.trim().replace(/^#+\s*/, '') || 'Sans titre';
    lignes.push('---', '', `## ${titre}`, '', `_${n.epinglee ? 'Épinglée · ' : ''}modifiée le ${dateHeure(n.modifiee)}_`, '', n.texte.trim(), '');
  }
  if (!notes.length) lignes.push('(aucune note pour l\'instant)');
  return lignes.join('\n');
}

function calendrierMd(evenements, maintenant) {
  const auj = new Date(maintenant);
  const cleAuj = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}-${String(auj.getDate()).padStart(2, '0')}`;
  const tries = [...evenements].sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
  const ligne = (e) => `- ${e.date}${e.heure ? ` ${e.heure}` : ' (journée)'} : ${e.titre}${e.note ? ` (note : ${e.note.replace(/\n/g, ' ')})` : ''}`;
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
    '',
  ];
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
    lignes.push('');
  });
  return lignes.join('\n');
}

// Instructions pour Claude, lues par Claude Code au lancement (CLAUDE.md du dossier de travail).
function claudeMd(addDir) {
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
    'Tu ne peux rien modifier ni lancer de commande : si Ragna te demande d\'ajouter une note ou un évènement,',
    'propose-lui le texte à copier dans le widget correspondant.',
    '',
  ].join('\n');
}

function register({ handle, log, dataDir, readConfig, readJson, notesPath, donneesPath, listeProjets, run }) {
  const cwd = path.join(dataDir, 'claude');
  const empreintes = {}; // contenu de chaque fichier au dernier message, pour dire à Claude ce qui a changé

  // Réécrit les fichiers de contexte. Renvoie les noms de ceux qui ont changé depuis le dernier message.
  async function preparerContexte(addDir) {
    await fsp.mkdir(cwd, { recursive: true });
    const maintenant = Date.now();
    const [notes, evenements, projets] = await Promise.all([
      readJson(notesPath(), []),
      readJson(donneesPath('calendrier'), []),
      listeProjets(),
    ]);
    const fichiers = {
      'CLAUDE.md': claudeMd(addDir),
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
    const changes = await preparerContexte(addDir);
    // Réglages changés depuis le lancement (commande, modèle, accès aux projets) : on relance,
    // la conversation reprend là où elle en était (--resume).
    const options = JSON.stringify([config.claudeCommand, config.claudeModel, addDir]);
    if (proc && options !== procOptions) stop();
    if (!proc) {
      procOptions = options;
      if (!start({ command: config.claudeCommand || 'claude', model: config.claudeModel, cwd, addDir, log })) return;
    }
    // Petite précision invisible pour toi : ce qui a changé depuis ton message précédent.
    const prefixe = changes.length ? `(Atelier : ${changes.join(', ')} ${changes.length > 1 ? 'ont changé' : 'a changé'} depuis mon message précédent.)\n\n` : '';
    write({ type: 'user', message: { role: 'user', content: prefixe + text }, parent_tool_use_id: null, session_id: '' });
  });

  // Bouton stop : Claude arrête ce qu'il est en train de faire, la conversation continue.
  handle('claude:interrupt', async () => {
    write({ type: 'control_request', request_id: `interrupt-${nextRequestId++}`, request: { subtype: 'interrupt' } });
  });

  // Nouvelle conversation.
  handle('claude:reset', async () => { lastSessionId = null; stop(); });

  // Au démarrage d'Atelier : la conversation affichée reprend au prochain message.
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
